import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressState } from '../model/index.ts'
import { backoffDelay, createHostLink, nullHostLink, type HostLinkOptions } from './hostLink.ts'

const URL = '/api/progress'

const state = (patch: Partial<ProgressState> = {}): ProgressState => ({
  phase: 'BATTLE',
  sessionId: 'turn-1',
  revision: 1,
  turnStartedAt: null,
  turnEndsAt: null,
  rematchOpen: true,
  serverTime: 1,
  ...patch,
})

type Reply = ProgressState | 'down' | 'hang' | { status: number } | { raw: string } | object

/** 偽の親機。応答を差し替えられる。届いた要求を記録する */
function fakeHost(initial: Reply) {
  let reply: Reply = initial
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    const r = reply
    if (r === 'down') throw new TypeError('Failed to fetch')
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')))
      })
    }
    if ('status' in r && typeof r.status === 'number' && Object.keys(r).length === 1)
      return new Response('error', { status: r.status })
    if ('raw' in r && typeof r.raw === 'string') return new Response(r.raw, { status: 200 })
    return new Response(JSON.stringify(r), { status: 200 })
  }) as unknown as typeof globalThis.fetch
  return {
    fetch,
    calls,
    set: (r: Reply) => {
      reply = r
    },
  }
}

let received: (ProgressState | null)[]

function link(host: ReturnType<typeof fakeHost>, extra: Partial<HostLinkOptions> = {}) {
  const l = createHostLink({ url: URL, fetch: host.fetch, random: () => 0.5, ...extra })
  l.subscribe((p) => received.push(p))
  return l
}

beforeEach(() => {
  vi.useFakeTimers()
  received = []
})
afterEach(() => {
  vi.useRealTimers()
})

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('進行状態の取得（HostLink）', () => {
  it('取得できたら、通知する。1 秒ごとに取得し、変わらなければ通知しない', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    expect(received).toEqual([state()])
    host.set(state({ serverTime: 99 }))
    await advance(3000)
    expect(host.calls.length).toBe(4)
    expect(received.length).toBe(1)
    l.dispose()
  })

  it('フェーズ・再戦の受付・sessionId が変わったら、通知する', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    host.set(state({ revision: 2, rematchOpen: false }))
    await advance(1000)
    host.set(state({ revision: 3, phase: 'PREPARE', sessionId: 'turn-2' }))
    await advance(1000)
    expect(received.map((p) => p && [p.phase, p.sessionId, p.rematchOpen])).toEqual([
      ['BATTLE', 'turn-1', true],
      ['BATTLE', 'turn-1', false],
      ['PREPARE', 'turn-2', true],
    ])
    l.dispose()
  })

  it('あとから購読しても、最新の値を、すぐに受け取る', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    const late: (ProgressState | null)[] = []
    l.subscribe((p) => late.push(p))
    expect(late).toEqual([state()])
    l.dispose()
  })

  it('通信できなくなっても、すぐには何も通知しない（直前の状態のまま）。10 秒続いたら null（すべて許可）', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    host.set('down')
    await advance(9000)
    expect(received).toEqual([state()])
    await advance(1000)
    expect(received).toEqual([state(), null])
    // その後も、null を繰り返し通知しない
    await advance(60_000)
    expect(received).toEqual([state(), null])
    l.dispose()
  })

  it('回復したら、最新の進行状態に追従する', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    host.set('down')
    await advance(20_000)
    host.set(state({ revision: 9, sessionId: 'turn-2', phase: 'PREPARE' }))
    await advance(30_000)
    expect(received.at(-1)).toEqual(state({ revision: 9, sessionId: 'turn-2', phase: 'PREPARE' }))
    expect(received).toContain(null)
    l.dispose()
  })

  it('一度も取得できないまま 10 秒たっても、null を通知する', async () => {
    const host = fakeHost('down')
    const l = link(host)
    await advance(9999)
    expect(received).toEqual([])
    await advance(1)
    expect(received).toEqual([null])
    l.dispose()
  })

  it('失敗が続くと、間隔をあける（1・2・4・8…秒。上限 30 秒）', async () => {
    const host = fakeHost('down')
    // ジッタなし（乱数 0.999…で、ほぼ上限の値）
    const l = link(host, { random: () => 0.9999 })
    await advance(0)
    const times: number[] = []
    let last = host.calls.length
    for (let t = 0; t < 120_000; t += 100) {
      await advance(100)
      if (host.calls.length !== last) {
        times.push(t + 100)
        last = host.calls.length
      }
    }
    const gaps = times.map((t, i) => t - (times[i - 1] ?? 0))
    expect(gaps.slice(0, 5)).toEqual([1000, 2000, 4000, 8000, 16000])
    expect(Math.max(...gaps)).toBe(30_000)
    l.dispose()
  })

  it('壊れた応答・エラーの応答は、無視して直前の状態を保つ', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    for (const bad of [
      { status: 500 },
      { status: 404 },
      { raw: '<html>' },
      { raw: '' },
      { phase: 'BATTLE' },
      { ...state(), revision: 'x' },
      { ...state(), sessionId: '' },
    ]) {
      // 10 秒より短い間に、次々と壊れた応答が来る
      host.set(bad)
      await advance(1200)
    }
    expect(received).toEqual([state()])
    l.dispose()
  })

  it('壊れた応答だけが 10 秒続いたら、null（すべて許可）', async () => {
    const host = fakeHost({ raw: 'oops' })
    const l = link(host)
    await advance(10_000)
    expect(received).toEqual([null])
    l.dispose()
  })

  it('未知のフェーズは、受け取る（すべて許可として扱う）', async () => {
    const host = fakeHost({ ...state(), phase: 'FINISHING' })
    const l = link(host)
    await advance(0)
    expect(received[0]?.phase).toBe('FINISHING')
    l.dispose()
  })

  it('応答が返らない取得は、3 秒で打ち切って、次へ進む', async () => {
    const host = fakeHost('hang')
    const l = link(host)
    await advance(0)
    expect(host.calls.length).toBe(1)
    await advance(3000 + 1000)
    expect(host.calls.length).toBe(2)
    expect(host.calls[0]!.init?.signal?.aborted).toBe(true)
    l.dispose()
  })

  it('送るのは、固定のパスへの GET だけ。本文・独自のヘッダーを付けない（参加者のデータを送らない）', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(5000)
    expect(host.calls.length).toBeGreaterThan(1)
    for (const c of host.calls) {
      expect(c.url).toBe(URL)
      expect(c.init?.method ?? 'GET').toBe('GET')
      expect(c.init?.body).toBeUndefined()
      expect(c.init?.headers).toBeUndefined()
    }
    l.dispose()
  })

  it('dispose のあとは、取得も通知もしない', async () => {
    const host = fakeHost(state())
    const l = link(host)
    await advance(0)
    l.dispose()
    const n = host.calls.length
    await advance(60_000)
    expect(host.calls.length).toBe(n)
    expect(received).toEqual([state()])
  })

  it('受け取った側が例外を投げても、取得を続ける', async () => {
    const host = fakeHost(state())
    const l = createHostLink({ url: URL, fetch: host.fetch, random: () => 0.5 })
    l.subscribe(() => {
      throw new Error('boom')
    })
    l.subscribe((p) => received.push(p))
    await advance(0)
    host.set(state({ revision: 2 }))
    await advance(1000)
    expect(received.map((p) => p?.revision)).toEqual([1, 2])
    l.dispose()
  })

  it('親機がない構成では、何もしない', () => {
    const fn = vi.fn()
    const off = nullHostLink.subscribe(fn)
    off()
    nullHostLink.dispose()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('再接続の間隔', () => {
  it('1 秒から倍々で、上限は 30 秒。ジッタで、半分〜全部', () => {
    expect(backoffDelay(1, () => 0)).toBe(500)
    expect(backoffDelay(1, () => 0.9999)).toBe(1000)
    expect(backoffDelay(3, () => 0)).toBe(2000)
    expect(backoffDelay(3, () => 0.9999)).toBe(4000)
    expect(backoffDelay(20, () => 0.99999)).toBe(30_000)
    expect(backoffDelay(20, () => 0)).toBe(15_000)
  })
})
