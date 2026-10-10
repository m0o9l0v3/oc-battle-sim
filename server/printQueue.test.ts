import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/fighter/index.ts'
import { buildTakeHomeUrl, DEFAULT_PUBLIC_APP_URL } from '../src/share/index.ts'
import { presetStage } from '../src/stage/index.ts'
import {
  CLAIM_TIMEOUT_MS,
  createPrintQueue,
  KEEP_DONE,
  MAX_PENDING,
  readPrintRequest,
} from './printQueue.ts'
import { renderPrintSheet } from './printSheet.ts'

const stage = { ...presetStage('standard'), name: 'ぼくのステージ' }
const url = buildTakeHomeUrl(
  DEFAULT_PUBLIC_APP_URL,
  { ...createDefaultConfig('p1'), name: 'ゆうしゃ' },
  stage,
)!
const input = { url, fighterName: 'ゆうしゃ', stageName: 'ぼくのステージ' }

function queue() {
  let clock = 1000
  let ids = 0
  const q = createPrintQueue({ now: () => clock, newId: () => `job-${++ids}` })
  return { q, tick: (ms: number) => (clock += ms) }
}

describe('印刷の依頼の検証（readPrintRequest）', () => {
  it('公開URLの持ち帰りURLを受け付け、名前は復号した設定から取り出す', () => {
    expect(readPrintRequest({ url }, DEFAULT_PUBLIC_APP_URL)).toEqual({ ok: true, request: input })
  })

  it('ファイター名が空なら、既定の名前にする', () => {
    const blank = buildTakeHomeUrl(DEFAULT_PUBLIC_APP_URL, createDefaultConfig('p1'), stage)!
    const r = readPrintRequest({ url: blank }, DEFAULT_PUBLIC_APP_URL)
    expect(r.ok && r.request.fighterName).not.toBe('')
  })

  it.each([
    ['本文がない', null],
    ['url がない', {}],
    ['url が文字列でない', { url: 1 }],
    ['フラグメントがない', { url: DEFAULT_PUBLIC_APP_URL }],
    ['フラグメントが壊れている', { url: `${url.slice(0, -2)}xx` }],
    ['長すぎる', { url: `${url}${'A'.repeat(600)}` }],
  ])('%s: 受け付けない', (_, body) => {
    expect(readPrintRequest(body, DEFAULT_PUBLIC_APP_URL)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('ほかの公開URL: 受け付けず、設定の食い違いとして、`#` より前だけを返す', () => {
    const other = url.replace(DEFAULT_PUBLIC_APP_URL, 'https://evil.example/')
    expect(readPrintRequest({ url: other }, DEFAULT_PUBLIC_APP_URL)).toEqual({
      ok: false,
      reason: 'public_url_mismatch',
      base: 'https://evil.example/',
    })
  })
})

describe('印刷待ち（createPrintQueue）', () => {
  it('整理番号は、受け付けた順に 1 から', () => {
    const { q } = queue()
    const a = q.enqueue(input)
    const b = q.enqueue(input)
    expect(a.ok && a.job.number).toBe(1)
    expect(b.ok && b.job.number).toBe(2)
    expect(q.summary().nextNumber).toBe(3)
  })

  it('古い順に 1 件ずつ取り出す。済みにすると、次へ進む', () => {
    const { q } = queue()
    q.enqueue(input)
    q.enqueue(input)
    const first = q.claim()!
    expect(first.number).toBe(1)
    // 印刷中のものは、もう一度は取り出さない
    expect(q.claim()!.number).toBe(2)
    expect(q.claim()).toBeNull()
    expect(q.done(first.id)).toBe(true)
    expect(q.done(first.id)).toBe(false)
    expect(q.summary()).toMatchObject({ pending: 0, printing: 1 })
  })

  it('再印刷: 同じ整理番号のまま、先頭へ', () => {
    const { q } = queue()
    q.enqueue(input)
    const first = q.claim()!
    q.done(first.id)
    q.enqueue(input)
    expect(q.reprint(first.id)).toBe(true)
    expect(q.claim()!.number).toBe(1)
    expect(q.claim()!.number).toBe(2)
    // 済みでないものは、再印刷できない
    expect(q.reprint(first.id)).toBe(false)
  })

  it('取り出したまま止まったものは、時間が過ぎたら印刷待ちへ戻る', () => {
    const { q, tick } = queue()
    q.enqueue(input)
    q.claim()
    tick(CLAIM_TIMEOUT_MS - 1)
    expect(q.claim()).toBeNull()
    tick(1)
    expect(q.claim()!.number).toBe(1)
  })

  it('印刷待ちへ戻ったあとに済みの報告が来たら、済みにする（二重に刷らない）', () => {
    const { q, tick } = queue()
    q.enqueue(input)
    const job = q.claim()!
    tick(CLAIM_TIMEOUT_MS)
    expect(q.summary().pending).toBe(1)
    expect(q.done(job.id)).toBe(true)
    expect(q.claim()).toBeNull()
  })

  it('済みは、直近の KEEP_DONE 件だけ残す', () => {
    const { q, tick } = queue()
    for (let i = 0; i < KEEP_DONE + 5; i++) {
      q.enqueue(input)
      q.done(q.claim()!.id)
      tick(1)
    }
    const { jobs } = q.summary()
    expect(jobs).toHaveLength(KEEP_DONE)
    expect(jobs[0]!.number).toBe(KEEP_DONE + 5)
  })

  it('印刷待ちが上限に達したら、断る', () => {
    const { q } = queue()
    for (let i = 0; i < MAX_PENDING; i++) expect(q.enqueue(input).ok).toBe(true)
    expect(q.enqueue(input)).toEqual({ ok: false, error: 'queue_full' })
  })

  it('一覧には、名前・URL を含めない', () => {
    const { q } = queue()
    q.enqueue(input)
    const text = JSON.stringify(q.summary())
    expect(text).not.toContain('ゆうしゃ')
    expect(text).not.toContain('#t1.')
  })
})

describe('印刷シート（renderPrintSheet）', () => {
  const job = { number: 7, ...input }

  it('整理番号・QR・URL・名前を載せる。ブラウザのヘッダーとフッターを出さない（余白 0）', () => {
    const html = renderPrintSheet(job, 'data:image/jpeg;base64,AAAA')
    expect(html).toContain('<strong>7</strong>')
    expect(html).toContain('<svg class="qr"')
    expect(html).toContain(url)
    expect(html).toContain('ゆうしゃ')
    expect(html).toContain('ぼくのステージ')
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"')
    expect(html).toMatch(/@page \{ size: A4 portrait; margin: 0; \}/)
  })

  it('ロゴがないときは、ロゴなしで作る', () => {
    expect(renderPrintSheet(job, null)).not.toContain('<img')
  })

  it('名前の HTML は、そのまま出さない', () => {
    const html = renderPrintSheet({ ...job, fighterName: '<b>x</b>' }, null)
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})
