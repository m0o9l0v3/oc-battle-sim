import { describe, expect, it } from 'vitest'
import type { CharacterConfig, Stats } from '../model/index.ts'
import {
  APPEARANCE_IDS,
  canStartMatch,
  createDefaultConfig,
  DEFAULT_NAMES,
  DEFAULT_STATS,
  hasStatChange,
  isNameWithinLimit,
  normalizeName,
  remainingPoints,
  resetStats,
  resolveName,
  statsDiff,
  validateConfig,
  type ValidationErrorCode,
} from './config.ts'

const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})
const cfg = (patch: Record<string, unknown> = {}): unknown => ({
  ...createDefaultConfig('p1'),
  ...patch,
})
const withStats = (stats: unknown) => cfg({ stats })
const withName = (name: unknown) => cfg({ name })
const withAppearance = (patch: Record<string, unknown>) =>
  cfg({ appearance: { ...createDefaultConfig('p1').appearance, ...patch } })

const codes = (r: ReturnType<typeof validateConfig>): ValidationErrorCode[] =>
  r.ok ? [] : r.errors.map((e) => e.code)
const errorsOf = (r: ReturnType<typeof validateConfig>) => (r.ok ? [] : r.errors)

describe('標準設定（stat-system.md §5.2、character-config.md §7）', () => {
  it('標準の能力値は 5/5/5/5（合計 20）', () => {
    expect(DEFAULT_STATS).toEqual(S(5, 5, 5, 5))
    expect(remainingPoints(DEFAULT_STATS)).toBe(0)
  })

  it.each(['p1', 'p2'] as const)('%s の標準設定を生成できる。対戦開始の検証を通る', (p) => {
    const c = createDefaultConfig(p)
    expect(c.schemaVersion).toBe(1)
    expect(c.stats).toEqual(S(5, 5, 5, 5))
    expect(c.name).toBe(DEFAULT_NAMES[p])
    expect(validateConfig(c, 'match')).toEqual({ ok: true, config: c })
    expect(canStartMatch(c)).toBe(true)
  })

  it('外観の初期値（1P: b1/f1/c1/なし、2P: b1/f2/c2/なし）', () => {
    expect(createDefaultConfig('p1').appearance).toEqual({
      body: 'b1',
      face: 'f1',
      color: 'c1',
      accessory: null,
    })
    expect(createDefaultConfig('p2').appearance).toEqual({
      body: 'b1',
      face: 'f2',
      color: 'c2',
      accessory: null,
    })
  })

  it('呼ぶたびに新しいオブジェクト（共有されない）。標準値を書き換えても、次の生成に影響しない', () => {
    const a = createDefaultConfig('p1')
    a.stats.speed = 8
    a.appearance.body = 'b4'
    const b = createDefaultConfig('p1')
    expect(b.stats.speed).toBe(5)
    expect(b.appearance.body).toBe('b1')
    expect(DEFAULT_STATS.speed).toBe(5)
  })

  it('JSON に書き出して、読み込める（import の検証を通る）', () => {
    const c = createDefaultConfig('p2')
    expect(validateConfig(JSON.parse(JSON.stringify(c)), 'import')).toEqual({ ok: true, config: c })
  })

  it('「標準設定に戻す」は、能力値だけを戻す。外観と名前は変えない', () => {
    const edited: CharacterConfig = {
      schemaVersion: 1,
      name: 'ゆうと',
      stats: S(8, 2, 6, 4),
      appearance: { body: 'b3', face: 'f5', color: 'c7', accessory: 'a2' },
    }
    const r = resetStats(edited)
    expect(r.stats).toEqual(S(5, 5, 5, 5))
    expect(r.name).toBe('ゆうと')
    expect(r.appearance).toEqual(edited.appearance)
    expect(edited.stats).toEqual(S(8, 2, 6, 4)) // 元は変えない
  })
})

describe('能力値の範囲（最小 2・最大 8。境界値）', () => {
  it.each([2, 3, 5, 7, 8])('%i は範囲内（編集中）', (v) => {
    expect(validateConfig(withStats({ ...DEFAULT_STATS, speed: v }), 'editing').ok).toBe(true)
  })

  it.each([
    [1, 'STAT_OUT_OF_RANGE'],
    [0, 'STAT_OUT_OF_RANGE'],
    [-3, 'STAT_OUT_OF_RANGE'],
    [9, 'STAT_OUT_OF_RANGE'],
    [100, 'STAT_OUT_OF_RANGE'],
    [2.5, 'STAT_NOT_INTEGER'],
    [5.0000001, 'STAT_NOT_INTEGER'],
    [NaN, 'STAT_NOT_INTEGER'],
    [Infinity, 'STAT_NOT_INTEGER'],
    [-Infinity, 'STAT_NOT_INTEGER'],
  ] as const)('%s は %s（どの検証でも）', (v, code) => {
    for (const mode of ['editing', 'match', 'import'] as const) {
      const r = validateConfig(withStats({ ...DEFAULT_STATS, defense: v }), mode)
      expect(
        errorsOf(r)
          .filter((e) => e.field === 'stats.defense')
          .map((e) => e.code),
        mode,
      ).toEqual([code])
    }
  })

  it('4 つの能力値のどれが違反かを、場所（field）で返す', () => {
    const r = validateConfig(withStats(S(1, 9, 2.5, 5)), 'editing')
    expect(errorsOf(r)).toEqual([
      { code: 'STAT_OUT_OF_RANGE', field: 'stats.attackPower' },
      { code: 'STAT_OUT_OF_RANGE', field: 'stats.defense' },
      { code: 'STAT_NOT_INTEGER', field: 'stats.jumpPower' },
    ])
  })

  it.each([
    ['文字列', '5'],
    ['null', null],
    ['undefined', undefined],
    ['真偽値', true],
    ['配列', [5]],
    ['オブジェクト', {}],
  ])('能力値が %s のときは MALFORMED（数ではない）', (_, v) => {
    const r = validateConfig(withStats({ ...DEFAULT_STATS, speed: v }), 'editing')
    expect(errorsOf(r)).toEqual([{ code: 'MALFORMED', field: 'stats.speed' }])
  })

  it('能力値の項目が欠けている／stats がない', () => {
    const missing = validateConfig(
      withStats({ attackPower: 5, defense: 5, jumpPower: 5 }),
      'editing',
    )
    expect(errorsOf(missing)).toEqual([{ code: 'MALFORMED', field: 'stats.speed' }])
    expect(errorsOf(validateConfig(cfg({ stats: undefined }), 'editing'))).toEqual([
      { code: 'MALFORMED', field: 'stats' },
    ])
    expect(errorsOf(validateConfig(cfg({ stats: 5 }), 'match'))).toEqual([
      { code: 'MALFORMED', field: 'stats' },
    ])
  })
})

describe('合計ポイント（合計 20・全ポイント使用）', () => {
  it.each([
    [S(5, 5, 5, 4), 19],
    [S(5, 5, 5, 6), 21],
    [S(2, 2, 2, 2), 8],
    [S(8, 8, 8, 8), 32],
  ])('合計 %j（%i）は、対戦開始・読み込みで POINT_TOTAL_NOT_20。対戦を始められない', (stats) => {
    for (const mode of ['match', 'import'] as const) {
      expect(codes(validateConfig(withStats(stats), mode)), mode).toEqual(['POINT_TOTAL_NOT_20'])
    }
    expect(canStartMatch(withStats(stats))).toBe(false)
  })

  it('編集中は、合計の過不足を許す（途中の状態のため）', () => {
    expect(validateConfig(withStats(S(5, 5, 5, 4)), 'editing').ok).toBe(true)
    expect(validateConfig(withStats(S(8, 8, 8, 8)), 'editing').ok).toBe(true)
  })

  it('合計がちょうど 20 なら、対戦を始められる', () => {
    expect(canStartMatch(withStats(S(8, 2, 5, 5)))).toBe(true)
    expect(canStartMatch(withStats(S(2, 2, 8, 8)))).toBe(true)
  })

  it('範囲外と、合計の不一致を、同時に返す（すべての違反を返す）', () => {
    // 合計は 1 + 9 + 5 + 5 = 20 だが、範囲外
    expect(codes(validateConfig(withStats(S(1, 9, 5, 5)), 'match'))).toEqual([
      'STAT_OUT_OF_RANGE',
      'STAT_OUT_OF_RANGE',
    ])
    // 合計 21 で、1つが範囲外
    expect(codes(validateConfig(withStats(S(9, 4, 4, 4)), 'match'))).toEqual([
      'STAT_OUT_OF_RANGE',
      'POINT_TOTAL_NOT_20',
    ])
  })

  it('整数でない値があるときは、合計を調べない（合計が意味を持たないため）', () => {
    expect(codes(validateConfig(withStats(S(2.5, 5, 5, 5)), 'match'))).toEqual(['STAT_NOT_INTEGER'])
  })

  it('設定できる組み合わせは 231 通り。すべて、対戦開始の検証を通る。それ以外は通らない', () => {
    let valid = 0
    let invalidPassed = 0
    for (let a = 1; a <= 9; a++)
      for (let d = 1; d <= 9; d++)
        for (let j = 1; j <= 9; j++)
          for (let s = 1; s <= 9; s++) {
            const inRange = [a, d, j, s].every((v) => v >= 2 && v <= 8)
            const shouldPass = inRange && a + d + j + s === 20
            const ok = validateConfig(withStats(S(a, d, j, s)), 'match').ok
            if (shouldPass) valid += ok ? 1 : 0
            else if (ok) invalidPassed++
          }
    expect(valid).toBe(231)
    expect(invalidPassed).toBe(0)
  })

  it('残りポイント', () => {
    expect(remainingPoints(S(5, 5, 5, 4))).toBe(1)
    expect(remainingPoints(S(2, 2, 2, 2))).toBe(12)
    expect(remainingPoints(S(8, 8, 8, 8))).toBe(-12)
  })
})

describe('名前（10 文字・30 バイト。character-config.md §5.5）', () => {
  it('10 文字の日本語（30 バイトちょうど）は通る。11 文字は通らない', () => {
    expect(validateConfig(withName('あいうえおかきくけこ'), 'match').ok).toBe(true)
    expect(codes(validateConfig(withName('あいうえおかきくけこさ'), 'match'))).toEqual([
      'NAME_TOO_LONG',
    ])
  })

  it('10 文字の ASCII は通る（10 バイト）。11 文字は、文字数で通らない', () => {
    expect(validateConfig(withName('abcdefghij'), 'editing').ok).toBe(true)
    expect(codes(validateConfig(withName('abcdefghijk'), 'editing'))).toEqual(['NAME_TOO_LONG'])
  })

  it('4 バイトの絵文字は、7 個まで（28 バイト）。8 個は、バイトで通らない（8 文字）', () => {
    expect(validateConfig(withName('😀'.repeat(7)), 'match').ok).toBe(true)
    expect(codes(validateConfig(withName('😀'.repeat(8)), 'match'))).toEqual(['NAME_TOO_LONG'])
  })

  it('文字数は収まるが、バイトで超える（日本語 9 文字 + 絵文字 1 = 31 バイト）', () => {
    expect(codes(validateConfig(withName('あいうえおかきくけ😀'), 'match'))).toEqual([
      'NAME_TOO_LONG',
    ])
    // 日本語 8 文字（24）+ 絵文字 1（4）= 28 バイト → 通る
    expect(validateConfig(withName('あいうえおかきく😀'), 'match').ok).toBe(true)
  })

  it('ZWJ の絵文字は、コードポイントとバイトの両方に数える（👨‍👩‍👧 = 5 コードポイント、18 バイト）', () => {
    const family = '👨‍👩‍👧'
    expect([...family].length).toBe(5)
    expect(validateConfig(withName(family), 'match').ok).toBe(true)
    // 2 つで 10 コードポイント・36 バイト → バイトで超える
    expect(codes(validateConfig(withName(family + family), 'match'))).toEqual(['NAME_TOO_LONG'])
  })

  it('NFC に正規化してから数える（e + 結合文字 → é の 1 文字）', () => {
    const decomposed = 'é'.repeat(10) // 20 コードポイント。NFC で 10 文字（20 バイト）
    expect(normalizeName(decomposed)).toBe('é'.repeat(10))
    expect(validateConfig(withName(decomposed), 'match').ok).toBe(true)
  })

  it('前後の空白は取り除く。内側の空白は残す', () => {
    expect(normalizeName('  ゆうと  ')).toBe('ゆうと')
    expect(normalizeName('　ゆうと　')).toBe('ゆうと') // 全角空白
    expect(normalizeName('ゆ うと')).toBe('ゆ うと')
    // 前後の空白は、長さに数えない（10 文字 + 前後の空白）
    expect(validateConfig(withName('  あいうえおかきくけこ  '), 'match').ok).toBe(true)
  })

  it('制御文字は取り除く（改行・タブ・NUL など）', () => {
    expect(normalizeName('ゆ\nう\tと\u0000')).toBe('ゆうと')
    expect(normalizeName('\u001b[31mabc')).toBe('[31mabc')
  })

  it('成功したときの名前は、そろえたもの', () => {
    const r = validateConfig(withName('  ゆうと\n'), 'match')
    expect(r.ok && r.config.name).toBe('ゆうと')
  })

  it('名前が空（未入力）のときの扱い: 検証は通る。デフォルト名にするのは resolveName', () => {
    expect(validateConfig(withName(''), 'editing').ok).toBe(true)
    expect(validateConfig(withName('   '), 'match').ok).toBe(true)
    expect(resolveName('', 'p1')).toBe('ファイター')
    expect(resolveName(' \n ', 'p2')).toBe('あいて')
    expect(resolveName(' ゆうと ', 'p2')).toBe('ゆうと')
  })

  it('名前が文字列でないときは MALFORMED', () => {
    for (const v of [123, null, undefined, ['a'], {}]) {
      expect(errorsOf(validateConfig(withName(v), 'editing'))).toEqual([
        { code: 'MALFORMED', field: 'name' },
      ])
    }
  })

  it('isNameWithinLimit: 境界', () => {
    expect(isNameWithinLimit('')).toBe(true)
    expect(isNameWithinLimit('あ'.repeat(10))).toBe(true)
    expect(isNameWithinLimit('あ'.repeat(11))).toBe(false)
  })
})

describe('外観（許可するID。character-design.md §5.1.1）', () => {
  it('許可する ID は、すべて通る', () => {
    for (const body of APPEARANCE_IDS.body)
      expect(validateConfig(withAppearance({ body }), 'match').ok).toBe(true)
    for (const face of APPEARANCE_IDS.face)
      expect(validateConfig(withAppearance({ face }), 'match').ok).toBe(true)
    for (const color of APPEARANCE_IDS.color)
      expect(validateConfig(withAppearance({ color }), 'match').ok).toBe(true)
    for (const accessory of APPEARANCE_IDS.accessory) {
      expect(validateConfig(withAppearance({ accessory }), 'match').ok).toBe(true)
    }
    expect(validateConfig(withAppearance({ accessory: null }), 'match').ok).toBe(true)
  })

  it('選択肢の数（体型 4・顔 6・色 8・アクセサリー 6 + なし）', () => {
    expect(APPEARANCE_IDS.body).toHaveLength(4)
    expect(APPEARANCE_IDS.face).toHaveLength(6)
    expect(APPEARANCE_IDS.color).toHaveLength(8)
    expect(APPEARANCE_IDS.accessory).toHaveLength(6)
  })

  it.each([
    ['body', 'b0'],
    ['body', 'b5'],
    ['body', 'B1'],
    ['body', ''],
    ['face', 'f0'],
    ['face', 'f7'],
    ['color', 'c9'],
    ['color', 'c0'],
    ['accessory', 'a0'],
    ['accessory', 'a7'],
    ['accessory', ''],
  ])('%s の %j は APPEARANCE_UNKNOWN', (key, id) => {
    expect(errorsOf(validateConfig(withAppearance({ [key]: id }), 'editing'))).toEqual([
      { code: 'APPEARANCE_UNKNOWN', field: `appearance.${key}` },
    ])
  })

  it('体型・顔・色は必須（null は不可）。型が違うと MALFORMED', () => {
    expect(errorsOf(validateConfig(withAppearance({ body: null }), 'editing'))).toEqual([
      { code: 'MALFORMED', field: 'appearance.body' },
    ])
    expect(errorsOf(validateConfig(withAppearance({ face: 3 }), 'editing'))).toEqual([
      { code: 'MALFORMED', field: 'appearance.face' },
    ])
    expect(errorsOf(validateConfig(withAppearance({ accessory: 1 }), 'editing'))).toEqual([
      { code: 'MALFORMED', field: 'appearance.accessory' },
    ])
    expect(errorsOf(validateConfig(cfg({ appearance: undefined }), 'editing'))).toEqual([
      { code: 'MALFORMED', field: 'appearance' },
    ])
  })

  it('アクセサリーの項目がない（undefined）は MALFORMED。なし は null で表す', () => {
    const c = createDefaultConfig('p1')
    const noAccessory = { ...c, appearance: { body: 'b1', face: 'f1', color: 'c1' } }
    expect(errorsOf(validateConfig(noAccessory, 'editing'))).toEqual([
      { code: 'MALFORMED', field: 'appearance.accessory' },
    ])
  })
})

describe('読み込みの検証（import）', () => {
  it('schemaVersion が 1 以外は SCHEMA_UNSUPPORTED。editing・match では調べない', () => {
    for (const v of [0, 2, 99, -1]) {
      expect(errorsOf(validateConfig(cfg({ schemaVersion: v }), 'import'))).toEqual([
        { code: 'SCHEMA_UNSUPPORTED', field: 'schemaVersion' },
      ])
      expect(validateConfig(cfg({ schemaVersion: v }), 'match').ok).toBe(true)
    }
  })

  it('schemaVersion が数でない／ない → MALFORMED（どの検証でも）。対戦を始められない', () => {
    for (const mode of ['editing', 'match', 'import'] as const) {
      for (const v of ['1', null, undefined, true, {}]) {
        expect(
          errorsOf(validateConfig(cfg({ schemaVersion: v }), mode)),
          `${mode} ${String(v)}`,
        ).toEqual([{ code: 'MALFORMED', field: 'schemaVersion' }])
      }
      // 項目そのものがない
      const { schemaVersion: _omit, ...rest } = createDefaultConfig('p1')
      void _omit
      expect(errorsOf(validateConfig(rest, mode)), mode).toEqual([
        { code: 'MALFORMED', field: 'schemaVersion' },
      ])
    }
    const { schemaVersion: _omit, ...rest } = createDefaultConfig('p1')
    void _omit
    expect(canStartMatch(rest)).toBe(false)
  })

  it('成功した config の schemaVersion は 1', () => {
    const r = validateConfig(cfg({ schemaVersion: 7 }), 'match')
    expect(r.ok && r.config.schemaVersion).toBe(1)
  })

  it('外部の書き換え（古い外観ID、合計の崩れ、範囲外）は、すべて違反として返る', () => {
    const tampered = {
      schemaVersion: 1,
      name: 'x',
      stats: S(9, 9, 9, 9),
      appearance: { body: 'b9', face: 'f1', color: 'c1', accessory: null },
    }
    const c = codes(validateConfig(tampered, 'import'))
    expect(c).toContain('STAT_OUT_OF_RANGE')
    expect(c).toContain('POINT_TOTAL_NOT_20')
    expect(c).toContain('APPEARANCE_UNKNOWN')
  })

  it('一部だけが無効でも、全体が失敗（一部だけ使わない）', () => {
    expect(validateConfig(withAppearance({ color: 'c99' }), 'import').ok).toBe(false)
  })
})

describe('不正な入力でも、例外を投げない（MALFORMED）', () => {
  it.each([undefined, null, 0, 1, 'x', true, [], [1, 2], () => 1, Symbol('s')])('%s', (v) => {
    for (const mode of ['editing', 'match', 'import'] as const) {
      expect(validateConfig(v, mode)).toEqual({
        ok: false,
        errors: [{ code: 'MALFORMED', field: '' }],
      })
    }
  })

  it('getter が例外を投げるオブジェクトでも、投げない', () => {
    const evil = {
      get name(): string {
        throw new Error('boom')
      },
    }
    expect(validateConfig(evil, 'import')).toEqual({
      ok: false,
      errors: [{ code: 'MALFORMED', field: '' }],
    })
  })

  it('入力を書き換えない。成功した結果は、入力と別のオブジェクト（共有しない）', () => {
    const input = createDefaultConfig('p1')
    const snapshot = JSON.parse(JSON.stringify(input))
    const r = validateConfig(input, 'match')
    expect(input).toEqual(snapshot)
    expect(r.ok && r.config).not.toBe(input)
    expect(r.ok && r.config.stats).not.toBe(input.stats)
    expect(r.ok && r.config.appearance).not.toBe(input.appearance)
  })

  it('余分な項目は、結果に含めない', () => {
    const r = validateConfig(
      { ...createDefaultConfig('p1'), hp: 9999, stats: { ...DEFAULT_STATS, power: 99 } },
      'match',
    )
    expect(r.ok && Object.keys(r.config).sort()).toEqual([
      'appearance',
      'name',
      'schemaVersion',
      'stats',
    ])
    expect(r.ok && Object.keys(r.config.stats).sort()).toEqual([
      'attackPower',
      'defense',
      'jumpPower',
      'speed',
    ])
  })

  it('決定的: 同じ入力から、同じ結果', () => {
    const bad = cfg({ stats: S(1, 9, 2.5, 5), name: 'あ'.repeat(11) })
    expect(validateConfig(bad, 'match')).toEqual(validateConfig(bad, 'match'))
  })
})

describe('変更の判定（character-config.md §6.1）', () => {
  it('statsDiff: 値が違う能力値だけを返す', () => {
    expect(statsDiff(S(5, 5, 5, 5), S(7, 5, 3, 5))).toEqual([
      { key: 'attackPower', before: 5, after: 7 },
      { key: 'jumpPower', before: 5, after: 3 },
    ])
    expect(statsDiff(S(5, 5, 5, 5), S(5, 5, 5, 5))).toEqual([])
  })

  it('hasStatChange: 1つでも変われば真。同じなら偽', () => {
    expect(hasStatChange(S(5, 5, 5, 5), S(5, 5, 5, 6))).toBe(true)
    expect(hasStatChange(S(8, 2, 5, 5), S(8, 2, 5, 5))).toBe(false)
  })

  it('入れ替えただけの変更（合計は同じ）も、変更とみなす', () => {
    expect(hasStatChange(S(8, 2, 5, 5), S(2, 8, 5, 5))).toBe(true)
  })
})
