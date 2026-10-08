// 親機のローカルサーバー（当日限定）。`oc26-stage` の tools/event-server.mjs を、本プロジェクトのフェーズに合わせて移植した
// （legacy-assessment.md §3.13）。Node.js の標準機能だけで動く。
//
// 担当すること（event-connection.md §5.1、event-control.md §7・§8）:
//   - アプリ（dist）の静的配信。`/?reset`（個別リセット用ブックマーク）も、同じ index.html を返す
//   - GET /api/progress: 進行状態の配信（参加者PCが 1 秒ごとに取得する）
//   - 管理画面 GET /admin と、管理API（/api/admin/*）。親機PC上（ループバック）から、起動ごとの一時トークンでだけ使える
//
// 参加者のデータ（ステージ・設定・名前・結果）は、保存・受信・ログ出力しない（§11）。
// 参加者PCからの要求の本文は読まない。ログには、管理操作と、異常だけを出す（取得のたびに、出さない）
//
// createHostServer() は組み立てだけを行い、listen しない（テストから、ポート 0 で起動して確かめるため）
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import {
  adminView,
  applyCommand,
  COMMAND_LABELS,
  createHostProgress,
  formatRemaining,
  isHostCommand,
  PHASE_LABELS,
  toProgressState,
  type HostProgress,
} from '../src/progress/index.ts'
import { createClientCounter } from './clients.ts'
import { createMemoryStore, type ProgressStore } from './store.ts'

export type HostServerOptions = {
  /** 配信するアプリ（vite build の出力） */
  distDir: string
  /** 管理画面の HTML */
  adminHtmlPath?: string
  /** 起動ごとの一時トークン。省略すると、ランダムに作る */
  adminToken?: string
  /** 進行状態の保存先（再起動で引き継ぐ）。省略すると、メモリだけ */
  store?: ProgressStore
  /** 参加者PCが開く URL（管理画面に表示する） */
  participantUrls?: string[]
  now?: () => number
  newSessionId?: () => string
  /** 管理操作を許す接続元。既定は、親機PC自身（ループバック）だけ */
  isAdminAddress?: (address: string | undefined) => boolean
  log?: (msg: string) => void
}

export type HostServer = {
  server: Server
  adminToken: string
  getProgress: () => HostProgress
}

const DEFAULT_ADMIN_HTML = join(import.meta.dirname, 'admin.html')

/** 管理画面からの要求の本文の上限。参加者のデータを受け付ける経路ではないため、小さくする */
const MAX_ADMIN_BODY = 1024

export const isLoopback = (address: string | undefined): boolean =>
  address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

function sendText(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

/** 本文を読まずに捨てる（参加者PCからの本文は、受け取らない） */
const discard = (req: IncomingMessage) => req.resume()

/** 管理操作の本文（JSON）を読む。大きすぎる・壊れているときは null */
function readSmallJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((done) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_ADMIN_BODY) tooLarge = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return done(null)
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        done(null)
      }
    })
    req.on('error', () => done(null))
  })
}

function sameToken(given: string | null | undefined, expected: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createHostServer(options: HostServerOptions): HostServer {
  const now = options.now ?? Date.now
  const newSessionId = options.newSessionId ?? randomUUID
  const adminToken = options.adminToken ?? randomBytes(16).toString('hex')
  const store = options.store ?? createMemoryStore()
  const isAdminAddress = options.isAdminAddress ?? isLoopback
  const log = options.log ?? console.log
  const distDir = resolve(options.distDir)
  const adminHtmlPath = options.adminHtmlPath ?? DEFAULT_ADMIN_HTML
  const participantUrls = options.participantUrls ?? []
  const clients = createClientCounter()
  const startedAt = now()

  // 保存があれば、そこから続ける（親機の再起動で、参加者PCをリセットしない）
  const saved = store.load()
  let progress: HostProgress = saved ?? createHostProgress(newSessionId())
  if (saved) {
    log(
      `[host] 保存された進行状態から再開します: ${PHASE_LABELS[saved.phase]}（revision ${saved.revision}）`,
    )
  } else {
    store.save(progress)
  }

  /** 管理操作の可否: 親機PC上からで、トークンが一致すること（event-control.md §7.4） */
  function adminAuth(req: IncomingMessage, token: string | null | undefined): number | null {
    if (!isAdminAddress(req.socket.remoteAddress)) return 403
    if (!sameToken(token, adminToken)) return 401
    return null
  }

  const bearer = (req: IncomingMessage) => {
    const h = req.headers.authorization
    return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice('Bearer '.length) : null
  }

  function status() {
    const t = now()
    const view = adminView(progress, t)
    return {
      ...view,
      remainingText: formatRemaining(view.remainingMs),
      nextCommandLabel: COMMAND_LABELS[view.nextCommand],
      clients: clients.estimate(t),
      startedAt,
      participantUrls,
    }
  }

  async function handleCommand(req: IncomingMessage, res: ServerResponse) {
    const denied = adminAuth(req, bearer(req))
    if (denied) {
      discard(req)
      return sendJson(res, denied, { error: denied === 403 ? 'forbidden' : 'unauthorized' })
    }
    const body = await readSmallJson(req)
    const command =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>).command : null
    if (!isHostCommand(command)) return sendJson(res, 400, { error: 'invalid_command' })
    // 一斉リセットは、必ず違う sessionId にする（同じだと、参加者PCが初期化されない）
    let id = progress.sessionId
    if (command === 'RESET') while (id === progress.sessionId) id = newSessionId()
    const r = applyCommand(progress, command, { now: now(), newSessionId: id })
    if (!r.ok) return sendJson(res, 409, { error: r.error, ...status() })
    progress = r.progress
    store.save(progress)
    log(
      `[host] ${COMMAND_LABELS[command]} → ${PHASE_LABELS[progress.phase]}（再戦: ${progress.rematchOpen ? '受付中' : '停止中'}、revision ${progress.revision}）`,
    )
    sendJson(res, 200, status())
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    let rel: string
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      return sendText(res, 400, 'bad request')
    }
    if (rel.includes('\0')) return sendText(res, 400, 'bad request')
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = resolve(distDir, `.${rel}`)
    // dist の外は、配信しない
    if (file !== distDir && !file.startsWith(distDir + sep)) return sendText(res, 404, 'not found')
    try {
      const s = await stat(file)
      if (!s.isFile()) return sendText(res, 404, 'not found')
      const body = await readFile(file)
      // 名前にハッシュが付くもの（assets/）は、変わらないため、長く使う。index.html は、毎回確かめる
      const immutable = rel.startsWith('/assets/')
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      if (rel === '/index.html') {
        return sendText(
          res,
          503,
          'アプリがビルドされていません。親機で npm run build を実行してから、サーバーを起動し直してください。',
        )
      }
      sendText(res, 404, 'not found')
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://host.invalid')
    const { pathname } = url
    const method = req.method ?? 'GET'

    // 管理操作（親機PC上から）
    if (pathname === '/api/admin/command') {
      if (method !== 'POST') {
        discard(req)
        return sendJson(res, 405, { error: 'method_not_allowed' })
      }
      return handleCommand(req, res)
    }

    // ここから下は、本文を受け取らない
    discard(req)

    if (method !== 'GET' && method !== 'HEAD')
      return sendJson(res, 405, { error: 'method_not_allowed' })

    if (pathname === '/api/progress') {
      clients.hit(now())
      return sendJson(res, 200, toProgressState(progress, now()))
    }

    if (pathname === '/api/admin/status') {
      const denied = adminAuth(req, bearer(req))
      if (denied)
        return sendJson(res, denied, { error: denied === 403 ? 'forbidden' : 'unauthorized' })
      return sendJson(res, 200, status())
    }

    if (pathname === '/admin') {
      const denied = adminAuth(req, url.searchParams.get('token'))
      if (denied)
        return sendText(
          res,
          denied,
          '管理画面は、親機PCで、起動時に表示された URL から開いてください。',
        )
      try {
        const html = await readFile(adminHtmlPath)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': html.length,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        })
        return res.end(html)
      } catch {
        return sendText(res, 500, 'admin.html を読めません')
      }
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' })

    return serveStatic(req, res, pathname)
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      // 要求の中身は、ログに出さない
      log(`[host] 要求の処理でエラーが発生しました: ${(e as Error).message}`)
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' })
      else res.end()
    })
  })

  return { server, adminToken, getProgress: () => progress }
}
