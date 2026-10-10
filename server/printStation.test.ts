// 印刷ステーションの手順（server/print-station.js）。DOM なしで、API と印刷を差し替えて確かめる
import { describe, expect, it } from 'vitest'
import {
  createApi,
  createStation,
  type StationApi,
  type StationJob,
  type StationSummary,
} from './print-station.js'

const summary = (pending = 0): StationSummary => ({
  pending,
  printing: 0,
  nextNumber: 1,
  jobs: [],
})

function setup(options: { jobs?: StationJob[]; printed?: boolean[]; statusFails?: boolean } = {}) {
  const jobs = [...(options.jobs ?? [{ id: 'a', number: 1 }])]
  const printed = [...(options.printed ?? [true])]
  const calls: string[] = []
  const events: string[] = []
  const api: StationApi = {
    status: async () => {
      calls.push('status')
      if (options.statusFails) throw new Error('HTTP 500')
      return summary(jobs.length)
    },
    claim: async () => {
      calls.push('claim')
      return { job: jobs.shift() ?? null }
    },
    done: async (id) => {
      calls.push(`done:${id}`)
      return summary()
    },
    reprint: async () => summary(),
  }
  const station = createStation({
    api,
    printSheet: async (job) => {
      calls.push(`print:${job.id}`)
      return printed.shift() ?? true
    },
    wait: async () => {},
    view: {
      render: () => {},
      connected: (ok) => events.push(ok ? 'connected' : 'disconnected'),
      message: () => {},
      failed: (job) => events.push(`failed:${job.number}`),
    },
  })
  return { station, calls, events }
}

describe('印刷ステーション（createStation）', () => {
  it('取り出す → 印刷 → 済み、の順', async () => {
    const t = setup()
    await t.station.tick()
    expect(t.calls).toEqual(['status', 'claim', 'print:a', 'done:a'])
  })

  it('印刷できなかったら、済みにせず、自動印刷を止めて知らせる', async () => {
    const t = setup({ printed: [false] })
    await t.station.tick()
    expect(t.calls).not.toContain('done:a')
    expect(t.station.isPaused()).toBe(true)
    expect(t.events).toContain('failed:1')
    // 止まっている間は、取り出さない
    t.calls.length = 0
    await t.station.tick()
    expect(t.calls).toEqual(['status'])
  })

  it('一時停止の間は、取り出さない。再開すると続ける', async () => {
    const t = setup()
    t.station.setPaused(true)
    await t.station.tick()
    expect(t.calls).toEqual(['status'])
    t.station.setPaused(false)
    await t.station.tick()
    expect(t.calls).toContain('done:a')
  })

  it('前の 1 枚が終わるまで、次を取り出さない（重ねて呼んでも 1 回）', async () => {
    const t = setup({
      jobs: [
        { id: 'a', number: 1 },
        { id: 'b', number: 2 },
      ],
    })
    await Promise.all([t.station.tick(), t.station.tick()])
    expect(t.calls.filter((c) => c === 'claim')).toHaveLength(1)
  })

  it('親機につながらないときは、知らせるだけ（例外を投げない）', async () => {
    const t = setup({ statusFails: true })
    await t.station.tick()
    expect(t.events).toEqual(['disconnected'])
    expect(t.calls).not.toContain('claim')
  })
})

describe('印刷ステーションの API（createApi）', () => {
  const respond = (status: number, body: unknown = {}) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('トークンを Bearer で送る', async () => {
    let auth: string | null = null
    const f = (async (_: string, init: RequestInit) => {
      auth = new Headers(init.headers).get('authorization')
      return new Response(JSON.stringify(summary()), { status: 200 })
    }) as unknown as typeof fetch
    await createApi('tok', f).status()
    expect(auth).toBe('Bearer tok')
  })

  it('失敗の応答は、例外にする。済みの報告の 409（すでに済み）は、一覧として受け取る', async () => {
    await expect(createApi('t', respond(401)).claim()).rejects.toThrow('HTTP 401')
    await expect(createApi('t', respond(409, summary(2))).done('x')).resolves.toMatchObject({
      pending: 2,
    })
    await expect(createApi('t', respond(500)).done('x')).rejects.toThrow()
  })
})
