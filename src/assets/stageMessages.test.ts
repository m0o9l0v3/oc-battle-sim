import { describe, expect, it } from 'vitest'
import { stageFromRows, validateStage, type StageViolationCode } from '../stage/index.ts'
import { describeViolation, summarizeViolations } from './stageMessages.ts'

const CODES: StageViolationCode[] = [
  'MALFORMED',
  'SCHEMA_UNSUPPORTED',
  'BLOCKS_TOO_FEW',
  'BLOCKS_TOO_MANY',
  'MAIN_PLATFORM_NARROW',
  'PLATFORM_TOO_NARROW',
  'STAGE_TOO_HIGH',
  'SPAWN_MISSING',
  'SPAWN_OUT_OF_RANGE',
  'SPAWN_BLOCKED',
  'SPAWN_NO_GROUND',
  'SPAWN_TOO_CLOSE',
  'UNREACHABLE',
  'NAME_TOO_LONG',
]

describe('違反のメッセージ（validation.md §6）', () => {
  it('すべての違反に、メッセージがある（空でない。やさしい日本語）', () => {
    for (const code of CODES) {
      const text = describeViolation({ code, detail: 3 })
      expect(text.length, code).toBeGreaterThan(3)
      expect(text, code).not.toContain('undefined')
    }
  })

  it('文言と、数値（規則の数値・足りない数）が、仕様どおり', () => {
    expect(describeViolation({ code: 'BLOCKS_TOO_FEW', detail: 5 })).toBe(
      'ブロックが すくないよ。あと 5こ おこう',
    )
    expect(describeViolation({ code: 'BLOCKS_TOO_MANY', detail: 2 })).toBe(
      'ブロックが おおすぎるよ。2こ へらそう',
    )
    expect(describeViolation({ code: 'MAIN_PLATFORM_NARROW' })).toBe(
      'ひろい ゆかが ないよ。10マス いじょうの ゆかを つくろう',
    )
    expect(describeViolation({ code: 'PLATFORM_TOO_NARROW' })).toBe(
      'せまい あしばが あるよ。2マス いじょうに しよう',
    )
    expect(describeViolation({ code: 'STAGE_TOO_HIGH' })).toBe(
      'たかすぎる ブロックが あるよ。うえの 4れつは あけておこう',
    )
    expect(describeViolation({ code: 'UNREACHABLE' })).toBe(
      'いけない あしばが あるよ。ジャンプで とどく ように しよう',
    )
    expect(describeViolation({ code: 'NAME_TOO_LONG' })).toBe('なまえが ながすぎるよ')
  })

  it('規則の数値を変えると、メッセージの数値も変わる', () => {
    const rules = { mainPlatformMin: 12, platformMin: 3, topEmptyRows: 5 } as never
    expect(describeViolation({ code: 'MAIN_PLATFORM_NARROW' }, rules)).toContain('12マス')
    expect(describeViolation({ code: 'PLATFORM_TOO_NARROW' }, rules)).toContain('3マス')
    expect(describeViolation({ code: 'STAGE_TOO_HIGH' }, rules)).toContain('5れつ')
  })
})

describe('summarizeViolations: 重要な順に、最初の 3 件と、残りの件数', () => {
  it('MALFORMED > スポーン > 足場 > 数 の順', () => {
    const s = summarizeViolations([
      { code: 'BLOCKS_TOO_FEW', detail: 1 },
      { code: 'UNREACHABLE' },
      { code: 'SPAWN_TOO_CLOSE' },
      { code: 'STAGE_TOO_HIGH' },
      { code: 'SPAWN_BLOCKED' },
    ])
    expect(s.shown.map((x) => x.violation.code)).toEqual([
      'SPAWN_TOO_CLOSE',
      'SPAWN_BLOCKED',
      'UNREACHABLE',
    ])
    expect(s.others).toBe('ほかにも 2こ あるよ')
    expect(
      summarizeViolations([{ code: 'BLOCKS_TOO_FEW' }, { code: 'MALFORMED' }]).shown[0]!.violation
        .code,
    ).toBe('MALFORMED')
  })

  it('3 件以内なら、「ほかにも」は出ない。件数は変えられる。違反がなければ空', () => {
    expect(summarizeViolations([{ code: 'UNREACHABLE' }]).others).toBeNull()
    expect(
      summarizeViolations([{ code: 'UNREACHABLE' }, { code: 'NAME_TOO_LONG' }], 1).others,
    ).toBe('ほかにも 1こ あるよ')
    expect(summarizeViolations([])).toEqual({ shown: [], others: null })
  })

  it('検証の結果から、そのまま、参加者向けのメッセージが取れる', () => {
    const rows = Array(14).fill('.'.repeat(24)) as string[]
    rows[9] = '....1..............2....'
    rows[10] = '....####................'
    const r = validateStage(stageFromRows(rows), 'match')
    expect(r.ok).toBe(false)
    if (r.ok) return
    const s = summarizeViolations(r.violations)
    expect(s.shown.length).toBeGreaterThan(0)
    for (const x of s.shown) expect(x.message).toMatch(/[ぁ-んァ-ン]/)
  })
})
