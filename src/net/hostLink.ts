// 親機連携のクライアント。進行状態を定期的に取得する（HTTP の GET だけ）。仕様:
//   docs/08-architecture/frontend.md §8.2（HostLink）、docs/01-experience/event-control.md §8.2・§10
//
// - 取得は 1 秒ごと。失敗したら、1 秒から最大 30 秒まで、指数的に間隔をあける（ジッタ付き。20 台が同時に集中しない）
// - 失敗しても例外を投げず、参加者にエラーを見せない。直前の状態のまま続ける
// - 通信できない状態が 10 秒続いたら `null` を通知する（受け取った側は、すべて許可にする。フェイルオープン）
// - 送るのは、固定のパスへの GET だけ。参加者のデータは送らない（event-control.md §11）
import type { ProgressState } from '../model/index.ts'
import { readProgressState } from '../progress/index.ts'

export type ProgressListener = (p: ProgressState | null) => void
export type Unsubscribe = () => void

export interface HostLink {
  /**
   * 進行状態の変化を受け取る。取得できた最新の値があれば、すぐに 1 回呼ぶ。
   * `null` は「通信できない状態が続いた」（すべて許可）
   */
  subscribe(listener: ProgressListener): Unsubscribe
  dispose(): void
}

/** 親機がない構成（持ち帰り後の GitHub Pages）。何もしない（frontend.md §8.2 H6） */
export const nullHostLink: HostLink = {
  subscribe: () => () => {},
  dispose: () => {},
}

type Timer = ReturnType<typeof setTimeout>

export type HostLinkOptions = {
  /** 進行状態の URL（親機が配信する `/api/progress`） */
  url: string
  fetch?: typeof fetch
  setTimeout?: (fn: () => void, ms: number) => Timer
  clearTimeout?: (t: Timer) => void
  /** 0 以上 1 未満の乱数（ジッタ） */
  random?: () => number
  /** 取得の間隔（既定 1 秒） */
  intervalMs?: number
  /** 失敗したときの間隔の上限（既定 30 秒） */
  maxBackoffMs?: number
  /** この時間、取得に成功しなければ `null` を通知する（既定 10 秒） */
  failOpenAfterMs?: number
  /** 1 回の取得を打ち切るまでの時間（既定 3 秒） */
  requestTimeoutMs?: number
}

export const HOST_LINK_DEFAULTS = {
  intervalMs: 1000,
  maxBackoffMs: 30_000,
  failOpenAfterMs: 10_000,
  requestTimeoutMs: 3000,
} as const

/** 失敗が続いたときの、次の取得までの間隔。1 秒、2 秒、4 秒…（上限まで）の、半分〜全部（ジッタ） */
export function backoffDelay(
  failures: number,
  random: () => number,
  intervalMs: number = HOST_LINK_DEFAULTS.intervalMs,
  maxMs: number = HOST_LINK_DEFAULTS.maxBackoffMs,
): number {
  const base = Math.min(maxMs, intervalMs * 2 ** Math.max(0, failures - 1))
  return Math.round(base / 2 + (random() * base) / 2)
}

/** 画面が気にする部分が、変わったか（serverTime だけの変化では、通知しない） */
const sameState = (a: ProgressState, b: ProgressState) =>
  a.sessionId === b.sessionId &&
  a.revision === b.revision &&
  a.phase === b.phase &&
  a.rematchOpen === b.rematchOpen &&
  a.turnStartedAt === b.turnStartedAt &&
  a.turnEndsAt === b.turnEndsAt

export function createHostLink(options: HostLinkOptions): HostLink {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const set = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const clear = options.clearTimeout ?? ((t) => clearTimeout(t))
  const random = options.random ?? Math.random
  const intervalMs = options.intervalMs ?? HOST_LINK_DEFAULTS.intervalMs
  const maxBackoffMs = options.maxBackoffMs ?? HOST_LINK_DEFAULTS.maxBackoffMs
  const failOpenAfterMs = options.failOpenAfterMs ?? HOST_LINK_DEFAULTS.failOpenAfterMs
  const requestTimeoutMs = options.requestTimeoutMs ?? HOST_LINK_DEFAULTS.requestTimeoutMs

  const listeners = new Set<ProgressListener>()
  /** 最後に通知した値。undefined は、まだ何も通知していない */
  let current: ProgressState | null | undefined
  let failures = 0
  let started = false
  let disposed = false
  let pollTimer: Timer | null = null
  let failOpenTimer: Timer | null = null

  const emit = (p: ProgressState | null) => {
    current = p
    for (const l of [...listeners]) {
      try {
        l(p)
      } catch {
        // 受け取った側の失敗で、取得を止めない
      }
    }
  }

  /** 成功のたびに、数え直す。成功しないまま時間が過ぎたら、null を通知する */
  const armFailOpen = () => {
    if (failOpenTimer !== null) clear(failOpenTimer)
    failOpenTimer = set(() => {
      failOpenTimer = null
      if (!disposed && current !== null) emit(null)
    }, failOpenAfterMs)
  }

  async function fetchOnce(): Promise<ProgressState | null> {
    const abort = typeof AbortController !== 'undefined' ? new AbortController() : null
    const t = abort ? set(() => abort.abort(), requestTimeoutMs) : null
    try {
      // 固定のパスへの GET だけ。本文・独自のヘッダーは付けない
      const res = await doFetch(options.url, {
        cache: 'no-store',
        ...(abort ? { signal: abort.signal } : {}),
      })
      if (!res.ok) return null
      // 未知のフェーズも受け取る（すべて許可として扱う。event-control.md §6.2）
      return readProgressState(await res.json(), { allowUnknownPhase: true })
    } catch {
      return null
    } finally {
      if (t !== null) clear(t)
    }
  }

  async function tick() {
    pollTimer = null
    const p = await fetchOnce()
    if (disposed) return
    if (p) {
      failures = 0
      armFailOpen()
      if (!current || !sameState(current, p)) emit(p)
      schedule(intervalMs)
    } else {
      // 壊れた応答も、失敗として扱う（直前の状態を保つ。event-control.md §10）
      failures++
      schedule(backoffDelay(failures, random, intervalMs, maxBackoffMs))
    }
  }

  const schedule = (ms: number) => {
    if (disposed) return
    pollTimer = set(() => void tick(), ms)
  }

  const start = () => {
    if (started) return
    started = true
    armFailOpen()
    void tick()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (current !== undefined) listener(current)
      start()
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      disposed = true
      listeners.clear()
      if (pollTimer !== null) clear(pollTimer)
      if (failOpenTimer !== null) clear(failOpenTimer)
    },
  }
}
