import { describe, expect, it } from 'vitest'
import { sendPrintRequest } from './print.ts'

const URL_ = 'https://example.com/#t1.abc'

const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('印刷の依頼（sendPrintRequest）', () => {
  it('持ち帰りURLだけを POST し、整理番号を受け取る', async () => {
    let sent: { url: string; init: RequestInit } | null = null
    const fetchSpy = (async (url: string, init: RequestInit) => {
      sent = { url, init }
      return new Response(JSON.stringify({ number: 4 }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await sendPrintRequest(URL_, { endpoint: '/api/print/job', fetch: fetchSpy })
    expect(r).toEqual({ ok: true, number: 4 })
    expect(sent!.url).toBe('/api/print/job')
    expect(sent!.init.method).toBe('POST')
    expect(JSON.parse(String(sent!.init.body))).toEqual({ url: URL_ })
  })

  it.each([
    ['断られた（409）', respond(409, { error: 'not_allowed_now' })],
    ['整理番号がない', respond(200, {})],
    ['整理番号が正でない', respond(200, { number: 0 })],
    [
      '通信できない',
      (async () => {
        throw new TypeError('network')
      }) as unknown as typeof fetch,
    ],
  ])('%s: 例外を投げず、ok: false', async (_, f) => {
    expect(await sendPrintRequest(URL_, { endpoint: '/x', fetch: f })).toEqual({ ok: false })
  })

  it('応答がないときは、打ち切る', async () => {
    const hang = ((_: string, init: RequestInit) =>
      new Promise((_r, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )) as unknown as typeof fetch
    expect(await sendPrintRequest(URL_, { endpoint: '/x', fetch: hang, timeoutMs: 10 })).toEqual({
      ok: false,
    })
  })
})
