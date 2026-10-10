// 持ち帰りカードの印刷待ち（親機のメモリだけ）。仕様: docs/05-multiplayer/take-home-print.md §5
//
// - 整理番号は、受け付けた順に 1 から。親機サーバーの起動のたびに 1 へ戻る（一斉リセットでは戻さない）
// - 持ち帰りURL（名前を含む）は、ファイルに保存しない・ログに出さない。印刷が済んだものは、
//   再印刷のために直近の KEEP_DONE 件だけ残し、それより古いものは捨てる
// - 印刷ステーション（server/print-station.html）が、古い順に 1 件ずつ取り出して印刷する
import { resolveName } from '../src/fighter/index.ts'
import { decodeTakeHome } from '../src/share/index.ts'

export type PrintJobState = 'pending' | 'printing' | 'done'

export type PrintJob = {
  id: string
  /** 整理番号（1 から） */
  number: number
  /** 持ち帰りURL（公開URL + `#t1.…`）。検証済み */
  url: string
  fighterName: string
  stageName: string
  state: PrintJobState
  receivedAt: number
  /** 印刷ステーションが取り出した時刻（printing の間だけ） */
  claimedAt: number | null
  printedAt: number | null
}

/** 印刷ステーションの表示用。名前・URL は含めない */
export type PrintJobSummary = Pick<PrintJob, 'id' | 'number' | 'state' | 'receivedAt' | 'printedAt'>

export type PrintQueueSummary = {
  pending: number
  printing: number
  /** 次に受け付けたときの整理番号 */
  nextNumber: number
  /** 新しい順。印刷待ち・印刷中・済み（直近）のすべて */
  jobs: PrintJobSummary[]
}

export type EnqueueResult = { ok: true; job: PrintJob } | { ok: false; error: 'queue_full' }

export interface PrintQueue {
  enqueue(input: { url: string; fighterName: string; stageName: string }): EnqueueResult
  /** 一番古い印刷待ちを「印刷中」にして返す。なければ null */
  claim(): PrintJob | null
  get(id: string): PrintJob | null
  /**
   * 印刷中 → 済み。済み・ないときは false。
   * 印刷の確認の画面を長く開いたままにして、印刷待ちへ戻ったもの（CLAIM_TIMEOUT_MS）も、済みにする（二重に刷らない）
   */
  done(id: string): boolean
  /** 済み → 印刷待ち（同じ整理番号のまま、列の先頭へ）。済みでなければ false */
  reprint(id: string): boolean
  summary(): PrintQueueSummary
}

/** 持ち帰りURLの長さの上限（最悪でも 193 バイト。take-home-share.md §7） */
const MAX_URL_LENGTH = 512

/**
 * 参加者PCからの印刷の依頼（`{ url }`）を検証する。持ち帰りURLは、公開URL（親機が知っている固定の値）と
 * 一致し、フラグメントが復号できるものだけを受け付ける（任意の URL の QR を刷らせない）。
 * 名前は、復号した設定から取り出す（参加者PCが送った文字列をそのまま使わない）
 */
export function readPrintRequest(
  body: unknown,
  publicUrl: string,
): { url: string; fighterName: string; stageName: string } | null {
  if (typeof body !== 'object' || body === null) return null
  const url = (body as { url?: unknown }).url
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) return null
  const hash = url.indexOf('#')
  if (hash < 0 || url.slice(0, hash) !== publicUrl) return null
  const r = decodeTakeHome(url.slice(hash))
  if (!r.ok) return null
  return { url, fighterName: resolveName(r.character.name, 'p1'), stageName: r.stage.name }
}

/** 印刷待ちの上限（いたずらで紙を使い切らないように） */
export const MAX_PENDING = 60
/** 再印刷のために残す、済みの件数 */
export const KEEP_DONE = 20
/** 印刷中のまま、この時間が過ぎたら、印刷待ちへ戻す（印刷ステーションを閉じた・更新したとき） */
export const CLAIM_TIMEOUT_MS = 60_000

export function createPrintQueue(options: { now: () => number; newId: () => string }): PrintQueue {
  const { now, newId } = options
  /** 受け付けた順（古い順） */
  let jobs: PrintJob[] = []
  let lastNumber = 0

  const count = (state: PrintJobState) => jobs.filter((j) => j.state === state).length

  /** 取り出したまま止まった印刷を、印刷待ちへ戻す */
  function releaseStale(t: number) {
    for (const j of jobs) {
      if (j.state === 'printing' && j.claimedAt !== null && t - j.claimedAt >= CLAIM_TIMEOUT_MS) {
        j.state = 'pending'
        j.claimedAt = null
      }
    }
  }

  /** 済みのものは、新しいものから KEEP_DONE 件だけ残す */
  function pruneDone() {
    const done = jobs.filter((j) => j.state === 'done')
    if (done.length <= KEEP_DONE) return
    const drop = new Set(
      done
        .sort((a, b) => (a.printedAt ?? 0) - (b.printedAt ?? 0))
        .slice(0, done.length - KEEP_DONE),
    )
    jobs = jobs.filter((j) => !drop.has(j))
  }

  return {
    enqueue(input) {
      if (count('pending') + count('printing') >= MAX_PENDING)
        return { ok: false, error: 'queue_full' }
      const job: PrintJob = {
        id: newId(),
        number: ++lastNumber,
        url: input.url,
        fighterName: input.fighterName,
        stageName: input.stageName,
        state: 'pending',
        receivedAt: now(),
        claimedAt: null,
        printedAt: null,
      }
      jobs.push(job)
      return { ok: true, job }
    },
    claim() {
      const t = now()
      releaseStale(t)
      const job = jobs.find((j) => j.state === 'pending')
      if (!job) return null
      job.state = 'printing'
      job.claimedAt = t
      return job
    },
    get(id) {
      return jobs.find((j) => j.id === id) ?? null
    },
    done(id) {
      const job = jobs.find((j) => j.id === id)
      if (!job || job.state === 'done') return false
      job.state = 'done'
      job.claimedAt = null
      job.printedAt = now()
      pruneDone()
      return true
    },
    reprint(id) {
      const job = jobs.find((j) => j.id === id)
      if (!job || job.state !== 'done') return false
      job.state = 'pending'
      job.printedAt = null
      // 列の先頭へ（紙詰まりなどの刷り直しを、先に出す）
      jobs = [job, ...jobs.filter((j) => j !== job)]
      return true
    },
    summary() {
      releaseStale(now())
      return {
        pending: count('pending'),
        printing: count('printing'),
        nextNumber: lastNumber + 1,
        jobs: [...jobs]
          .sort((a, b) => b.number - a.number)
          .map(({ id, number, state, receivedAt, printedAt }) => ({
            id,
            number,
            state,
            receivedAt,
            printedAt,
          })),
      }
    },
  }
}
