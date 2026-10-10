import { describe, expect, it } from 'vitest'
import type { PrintRequestResult } from '../net/index.ts'
import { createPrintRequester, type PrintStatus } from './printRequest.ts'

function setup(results: Array<PrintRequestResult | Error>) {
  const statuses: PrintStatus[] = []
  const accepted: number[] = []
  const sent: string[] = []
  const pending: Array<() => void> = []
  const request = createPrintRequester(() => ({
    send: (url) => {
      sent.push(url)
      const r = results.shift()!
      // 呼んだ側が resolve するまで、送信中のまま
      return new Promise((resolve, reject) =>
        pending.push(() => (r instanceof Error ? reject(r) : resolve(r))),
      )
    },
    onAccepted: (n) => accepted.push(n),
    onStatus: (s) => statuses.push(s),
  }))
  const settle = async () => {
    pending.shift()!()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { request, statuses, accepted, sent, settle }
}

describe('印刷の依頼（createPrintRequester）', () => {
  it('送信中 → 送れた。整理番号を、状態より先にセッションへ渡す', async () => {
    const t = setup([{ ok: true, number: 3 }])
    const done = t.request('u')
    expect(t.statuses).toEqual(['sending'])
    await t.settle()
    await done
    expect(t.accepted).toEqual([3])
    expect(t.statuses).toEqual(['sending', 'success'])
  })

  it('送信中に何度押しても、1 回だけ送る', async () => {
    const t = setup([{ ok: true, number: 1 }])
    void t.request('u')
    void t.request('u')
    void t.request('u')
    expect(t.sent).toHaveLength(1)
    await t.settle()
  })

  it('送れなかったら failed。もういちど押せる', async () => {
    const t = setup([{ ok: false }, { ok: true, number: 2 }])
    void t.request('u')
    await t.settle()
    expect(t.statuses).toEqual(['sending', 'failed'])
    expect(t.accepted).toEqual([])
    void t.request('u')
    await t.settle()
    expect(t.sent).toHaveLength(2)
    expect(t.accepted).toEqual([2])
  })

  it('send が例外を投げても、送れなかったとして扱い、押せる状態に戻す', async () => {
    const t = setup([new Error('boom'), { ok: true, number: 5 }])
    void t.request('u')
    await t.settle()
    expect(t.statuses.at(-1)).toBe('failed')
    void t.request('u')
    expect(t.sent).toHaveLength(2)
    await t.settle()
  })
})
