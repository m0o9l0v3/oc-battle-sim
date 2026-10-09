import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, readProgressState, type HostProgress } from '../src/progress/index.ts'
import { createHostServer, isLoopback, type HostServerOptions } from './app.ts'
import { createClientCounter } from './clients.ts'
import { createFileStore, createMemoryStore } from './store.ts'

const TOKEN = 'test-token-0123456789'
let dir: string
let dist: string
let logs: string[]
let clock: number
let ids: number
let close: (() => Promise<void>) | null = null

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocbs-host-'))
  dist = join(dir, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title>')
  writeFileSync(join(dist, 'assets', 'index-abc.js'), 'console.log(1)')
  writeFileSync(join(dir, 'secret.txt'), 'secret')
  logs = []
  clock = 1_760_000_000_000
  ids = 0
})

afterEach(async () => {
  await close?.()
  close = null
  rmSync(dir, { recursive: true, force: true })
})

async function start(options: Partial<HostServerOptions> = {}) {
  const host = createHostServer({
    distDir: dist,
    adminToken: TOKEN,
    now: () => clock,
    newSessionId: () => `session-${++ids}`,
    log: (m) => logs.push(m),
    ...options,
  })
  await new Promise<void>((r) => host.server.listen(0, '127.0.0.1', r))
  const port = (host.server.address() as AddressInfo).port
  close = () =>
    new Promise<void>((r) => {
      host.server.closeAllConnections()
      host.server.close(() => r())
    })
  const base = `http://127.0.0.1:${port}`
  return { ...host, base, url: (p: string) => `${base}${p}` }
}

/** 応答の本文（JSON） */
const json = async (r: Response | Promise<Response>) =>
  (await (await r).json()) as Record<string, unknown>

const auth = { Authorization: `Bearer ${TOKEN}` }
const command = (url: string, c: string, headers: Record<string, string> = auth) =>
  fetch(url, { method: 'POST', headers, body: JSON.stringify({ command: c }) })

describe('進行状態の配信（GET /api/progress）', () => {
  it('進行状態だけを返す。キャッシュさせない', async () => {
    const h = await start()
    const res = await fetch(h.url('/api/progress'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await json(res)
    expect(readProgressState(body)).toEqual(body)
    expect(body).toEqual({
      phase: 'PREPARE',
      sessionId: 'session-1',
      revision: 0,
      turnStartedAt: null,
      turnEndsAt: null,
      rematchOpen: true,
      serverTime: clock,
    })
  })

  it('取得のたびに、ログを出さない', async () => {
    const h = await start()
    for (let i = 0; i < 5; i++) await fetch(h.url('/api/progress'))
    expect(logs).toEqual([])
  })
})

describe('管理操作（event-control.md §7）', () => {
  it('制作開始 → 対戦開始 → 再戦を止める → 持ち帰り開始 → 終了 → 一斉リセット。参加者PCの取得に反映される', async () => {
    const h = await start()
    const progress = async () => json(fetch(h.url('/api/progress')))

    let res = await command(h.url('/api/admin/command'), 'START_PRODUCTION')
    expect(res.status).toBe(200)
    expect((await json(res)).remainingText).toBe('19:00')
    expect(await progress()).toMatchObject({
      phase: 'PRODUCTION',
      revision: 1,
      turnStartedAt: clock,
      turnEndsAt: clock + 19 * 60_000,
    })

    await command(h.url('/api/admin/command'), 'START_BATTLE')
    await command(h.url('/api/admin/command'), 'STOP_REMATCH')
    expect(await progress()).toMatchObject({ phase: 'BATTLE', rematchOpen: false, revision: 3 })

    await command(h.url('/api/admin/command'), 'START_SHARING')
    await command(h.url('/api/admin/command'), 'END')
    expect((await progress()).phase).toBe('ENDED')

    res = await command(h.url('/api/admin/command'), 'RESET')
    expect(res.status).toBe(200)
    expect(await progress()).toMatchObject({
      phase: 'PREPARE',
      sessionId: 'session-2',
      revision: 6,
      turnStartedAt: null,
      turnEndsAt: null,
      rematchOpen: true,
    })
    expect(logs.some((l) => l.includes('一斉リセット'))).toBe(true)
  })

  it('いまのフェーズで押せない操作は 409。状態は変わらない', async () => {
    const h = await start()
    const res = await command(h.url('/api/admin/command'), 'END')
    expect(res.status).toBe(409)
    expect(h.getProgress().phase).toBe('PREPARE')
    expect(h.getProgress().revision).toBe(0)
  })

  it('一斉リセットは、新しい sessionId が、いまと同じなら作り直す', async () => {
    const seq = ['same', 'same', 'same', 'other']
    const h = await start({ newSessionId: () => seq.shift()! })
    expect(h.getProgress().sessionId).toBe('same')
    await command(h.url('/api/admin/command'), 'RESET')
    expect(h.getProgress().sessionId).toBe('other')
  })

  it('トークンがない・違うときは 401。親機PCの外（ループバック以外）からは 403', async () => {
    let h = await start()
    expect((await command(h.url('/api/admin/command'), 'START_PRODUCTION', {})).status).toBe(401)
    expect(
      (
        await command(h.url('/api/admin/command'), 'START_PRODUCTION', {
          Authorization: 'Bearer x',
        })
      ).status,
    ).toBe(401)
    expect((await fetch(h.url('/api/admin/status'))).status).toBe(401)
    expect((await fetch(h.url('/admin?token=wrong'))).status).toBe(401)
    expect(h.getProgress().phase).toBe('PREPARE')
    await close?.()

    h = await start({ isAdminAddress: () => false })
    expect((await command(h.url('/api/admin/command'), 'START_PRODUCTION')).status).toBe(403)
    expect((await fetch(h.url(`/admin?token=${TOKEN}`))).status).toBe(403)
    expect(h.getProgress().phase).toBe('PREPARE')
  })

  it('時間の調整・予定の変更・制作中からの持ち帰り開始（§7.5）。配信する進行状態に、予定は含めない', async () => {
    const h = await start()
    const post = (body: unknown) =>
      fetch(h.url('/api/admin/command'), {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(body),
      })
    // 準備中は、ずらせない
    expect((await post({ command: 'ADJUST_TIME', deltaMs: 60_000 })).status).toBe(409)
    await command(h.url('/api/admin/command'), 'START_PRODUCTION')
    let s = await json(post({ command: 'ADJUST_TIME', deltaMs: 2 * 60_000 }))
    expect(s).toMatchObject({
      phaseRemainingText: '9:00',
      remainingText: '21:00',
      canAdjustTime: true,
    })
    s = await json(
      post({
        command: 'SET_PLAN',
        plan: { production: 5 * 60_000, battle: 10 * 60_000, sharing: 3 * 60_000 },
      }),
    )
    expect(s).toMatchObject({ phaseRemainingText: '5:00', remainingText: '18:00' })
    expect(logs.some((l) => l.includes('予定の変更（制作 5分・対戦 10分・持ち帰り 3分）'))).toBe(
      true,
    )
    expect(logs.some((l) => l.includes('時間の調整（+2分）'))).toBe(true)
    // 制作中から、持ち帰りへ（対戦を飛ばす）
    expect((await command(h.url('/api/admin/command'), 'START_SHARING')).status).toBe(200)
    const p = await json(fetch(h.url('/api/progress')))
    expect(p.phase).toBe('SHARING')
    expect(Object.keys(p).sort()).toEqual(
      [
        'phase',
        'rematchOpen',
        'revision',
        'serverTime',
        'sessionId',
        'turnEndsAt',
        'turnStartedAt',
      ].sort(),
    )
    // 形の違う調整は 400
    expect((await post({ command: 'ADJUST_TIME', deltaMs: 0 })).status).toBe(400)
    expect((await post({ command: 'SET_PLAN', plan: { production: 1 } })).status).toBe(400)
  })

  it('本文が壊れている・大きすぎる・知らない操作は 400', async () => {
    const h = await start()
    const post = (body: string) =>
      fetch(h.url('/api/admin/command'), { method: 'POST', headers: auth, body })
    expect((await post('{')).status).toBe(400)
    expect(
      (await post(JSON.stringify({ command: 'START_PRODUCTION', pad: 'x'.repeat(2000) }))).status,
    ).toBe(400)
    expect((await post(JSON.stringify({ command: 'setPhase' }))).status).toBe(400)
    expect((await fetch(h.url('/api/admin/command'))).status).toBe(405)
  })

  it('管理画面: 正しいトークンなら開ける。状態（表示用の値）を返す', async () => {
    const h = await start({ participantUrls: ['http://192.168.0.10:8080/'] })
    const page = await fetch(h.url(`/admin?token=${TOKEN}`))
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('進行管理')

    await command(h.url('/api/admin/command'), 'START_PRODUCTION')
    clock += 60_000
    const s = await json(fetch(h.url('/api/admin/status'), { headers: auth }))
    expect(s).toMatchObject({
      phase: 'PRODUCTION',
      phaseLabel: '制作中',
      remainingText: '18:00',
      rematchOpen: true,
      nextCommand: 'START_BATTLE',
      nextCommandLabel: '対戦開始',
      participantUrls: ['http://192.168.0.10:8080/'],
    })
    expect(s.commands).toMatchObject({ START_BATTLE: true, START_PRODUCTION: false, RESET: true })
  })

  it('接続中の台数（目安）: 取得の回数を、匿名で数える', async () => {
    const h = await start()
    // 3 台が、5 秒間、1 秒ごとに取得する
    for (let t = 0; t < 5; t++) {
      for (let i = 0; i < 3; i++) await fetch(h.url('/api/progress'))
      clock += 1000
    }
    clock -= 1000
    const s = await json(fetch(h.url('/api/admin/status'), { headers: auth }))
    expect(s.clients).toBe(3)
  })
})

describe('参加者のデータを受け取らない（event-control.md §11）', () => {
  it('参加者PCからの POST・PUT は、本文を読まずに 405。状態もログも変わらない', async () => {
    const h = await start()
    const before = structuredClone(h.getProgress())
    const secret = JSON.stringify({ name: 'たろう', stage: { rows: ['#####'] } })
    for (const path of ['/api/progress', '/', '/api/result', '/index.html']) {
      for (const method of ['POST', 'PUT']) {
        const res = await fetch(h.url(path), { method, body: secret })
        expect(res.status, `${method} ${path}`).toBe(405)
      }
    }
    expect(h.getProgress()).toEqual(before)
    expect(logs.join('\n')).not.toContain('たろう')
  })
})

describe('アプリの配信', () => {
  it('/ と /?reset は index.html。assets は長くキャッシュ、index.html は毎回確かめる', async () => {
    const h = await start()
    for (const p of ['/', '/?reset', '/index.html']) {
      const res = await fetch(h.url(p))
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(await res.text()).toContain('<title>app</title>')
    }
    const js = await fetch(h.url('/assets/index-abc.js'))
    expect(js.headers.get('content-type')).toContain('text/javascript')
    expect(js.headers.get('cache-control')).toContain('immutable')
  })

  it('dist の外は、配信しない。ないファイルは 404', async () => {
    const h = await start()
    for (const p of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '/nope.js',
      '/assets',
    ]) {
      const res = await fetch(h.url(p))
      expect(res.status, p).toBe(404)
      expect(await res.text()).not.toContain('secret')
    }
    expect((await fetch(h.url('/api/unknown'))).status).toBe(404)
  })

  it('ビルドされていないときは、その旨を返す（503）', async () => {
    rmSync(join(dist, 'index.html'))
    const h = await start()
    const res = await fetch(h.url('/'))
    expect(res.status).toBe(503)
    expect(await res.text()).toContain('npm run build')
  })
})

describe('親機の再起動（event-control.md §10）', () => {
  it('保存した進行状態から再開する。sessionId は変わらない（参加者PCをリセットしない）', async () => {
    const path = join(dir, 'state', 'progress.json')
    let h = await start({ store: createFileStore(path, (m) => logs.push(m)) })
    await command(h.url('/api/admin/command'), 'START_PRODUCTION')
    await command(h.url('/api/admin/command'), 'STOP_REMATCH')
    const before = h.getProgress()
    await close?.()

    h = await start({ store: createFileStore(path, (m) => logs.push(m)) })
    expect(h.getProgress()).toEqual(before)
    const p = await json(fetch(h.url('/api/progress')))
    expect(p).toMatchObject({ phase: 'PRODUCTION', sessionId: 'session-1', rematchOpen: false })
    expect(logs.some((l) => l.includes('再開'))).toBe(true)
  })

  it('保存が壊れていたら、新しい状態で始める（落ちない）', async () => {
    const path = join(dir, 'progress.json')
    writeFileSync(path, '{ broken')
    const h = await start({ store: createFileStore(path, (m) => logs.push(m)) })
    expect(h.getProgress()).toMatchObject({ phase: 'PREPARE', sessionId: 'session-1' })
    // 新しい状態を、保存し直す
    expect(JSON.parse(readFileSync(path, 'utf8')).sessionId).toBe('session-1')
  })

  it('保存先に書けなくても、進行は続く', async () => {
    const h = await start({
      store: createFileStore(join(dist, 'index.html', 'x.json'), (m) => logs.push(m)),
    })
    expect((await command(h.url('/api/admin/command'), 'START_PRODUCTION')).status).toBe(200)
    expect(h.getProgress().phase).toBe('PRODUCTION')
    expect(logs.some((l) => l.includes('保存できません'))).toBe(true)
  })

  it('メモリの保存先', () => {
    const store = createMemoryStore()
    expect(store.load()).toBeNull()
    const p: HostProgress = {
      phase: 'BATTLE',
      sessionId: 'a',
      revision: 2,
      turnStartedAt: 1,
      turnEndsAt: 2,
      rematchOpen: true,
      phaseStartedAt: 1,
      phaseEndsAt: 2,
      plan: DEFAULT_PLAN,
    }
    store.save(p)
    expect(store.load()).toEqual(p)
  })
})

describe('部品', () => {
  it('ループバックの判定', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('::1')).toBe(true)
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopback('192.168.0.5')).toBe(false)
    expect(isLoopback(undefined)).toBe(false)
  })

  it('台数の見積もり: 古い取得は数えない', () => {
    const c = createClientCounter()
    for (let i = 0; i < 20 * 5; i++) c.hit(1000 + i * 50) // 20 台が 5 秒間
    expect(c.estimate(1000 + 99 * 50)).toBe(20)
    expect(c.estimate(1000 + 99 * 50 + 10_000)).toBe(0)
  })
})
