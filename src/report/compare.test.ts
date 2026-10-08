import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../fighter/index.ts'
import type { MatchRecord, PlayerMetrics, Stats } from '../model/index.ts'
import { presetStage } from '../stage/index.ts'
import {
  compare,
  defaultPair,
  DERIVED_OF,
  DURATION_NOTE_SECONDS,
  pickPair,
  selectCompareQuestion,
} from './compare.ts'
import { confirmedMotion } from './motion.ts'
import { findBannedWords } from './wording.ts'

const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})

const metrics = (o: Partial<PlayerMetrics> = {}): PlayerMetrics => ({
  stocksLeft: 2,
  damageDealt: 40,
  damageTaken: 30,
  hitsLanded: 3,
  attacksThrown: 8,
  kos: 1,
  selfKos: 0,
  deaths: 1,
  maxDamageEndured: 70,
  recoverySuccess: 1,
  recoveryFailure: 0,
  jumps: 10,
  moveDistance: 50,
  avgKnockbackDistance: 3,
  ...o,
})

const rec = (
  matchNo: number,
  p1: Stats,
  o: Partial<MatchRecord> = {},
  m1 = metrics(),
  m2 = metrics(),
): MatchRecord => ({
  schemaVersion: 1,
  matchNo,
  p1Config: { ...createDefaultConfig('p1'), stats: p1 },
  p2Config: createDefaultConfig('p2'),
  stage: presetStage('standard'),
  outcome: { winner: 'p1', reason: 'stocks' },
  durationSec: 60,
  p1: m1,
  p2: m2,
  ...o,
})

describe('① すうじ（設定の差分）', () => {
  it('1P の能力値 4 つすべてを、前・あと・差（あと − 前）で出す。変わっていないものは、差 0', () => {
    const v = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5)))
    expect(v.p1StatChanges).toEqual([
      { key: 'attackPower', before: 5, after: 7, delta: 2 },
      { key: 'defense', before: 5, after: 3, delta: -2 },
      { key: 'jumpPower', before: 5, after: 5, delta: 0 },
      { key: 'speed', before: 5, after: 5, delta: 0 },
    ])
    expect(v.p1Unchanged).toBe(false)
  })

  it('戦の番号の小さいほうが左。引数の順番に、よらない', () => {
    const a = rec(1, S(5, 5, 5, 5))
    const b = rec(3, S(7, 3, 5, 5))
    expect(compare(b, a)).toEqual(compare(a, b))
    expect(compare(b, a).left.matchNo).toBe(1)
    expect(compare(b, a).right.matchNo).toBe(3)
  })

  it('合計が 20 の制約から、変わるなら、必ず 2 つ以上。ふえた数字と、へった数字の、両方がある', () => {
    const v = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(8, 5, 2, 5)))
    const deltas = v.p1StatChanges.map((c) => c.delta)
    expect(deltas.filter((d) => d !== 0).length).toBeGreaterThanOrEqual(2)
    expect(deltas.some((d) => d > 0)).toBe(true)
    expect(deltas.some((d) => d < 0)).toBe(true)
    expect(deltas.reduce((t, d) => t + d, 0)).toBe(0)
  })

  it('2P の能力値が変わっていたら、p2Changed と注意。1P だけ同じなら、p1Unchanged', () => {
    const v = compare(rec(1, S(5, 5, 5, 5)), {
      ...rec(2, S(5, 5, 5, 5)),
      p2Config: { ...createDefaultConfig('p2'), stats: S(8, 2, 5, 5) },
    })
    expect(v.p2Changed).toBe(true)
    expect(v.p1Unchanged).toBe(true)
    expect(v.notes).toContain('p2_changed')
    expect(v.notes).toContain('p1_unchanged')
    expect(v.p2StatChanges.find((c) => c.key === 'attackPower')!.delta).toBe(3)
  })
})

describe('② すうじの ききめ（確定の値だけ）', () => {
  it('変えた能力値の分だけ、並ぶ。能力値と確定の値は、1 つずつ対応する', () => {
    const v = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5)))
    expect(v.effects.map((e) => e.key)).toEqual(['attackPower', 'defense'])
    const atk = v.effects[0]!
    expect(atk.derived.before).toBeCloseTo(12, 9)
    expect(atk.derived.after).toBeCloseTo(12.72, 9)
    expect(atk.derived.delta).toBeCloseTo(0.72, 9)
    // 値は、confirmedMotion と同じ（式は 1 か所）
    const def = v.effects[1]!
    expect(def.derived.before).toBeCloseTo(confirmedMotion(S(5, 5, 5, 5)).knockbackDistance, 9)
    expect(def.derived.after).toBeCloseTo(confirmedMotion(S(7, 3, 5, 5)).knockbackDistance, 9)
    expect(DERIVED_OF).toEqual({
      attackPower: 'damagePerHit',
      defense: 'knockbackDistance',
      jumpPower: 'jumpHeight',
      speed: 'moveSpeed',
    })
  })

  it('変えた数字が増えれば、確定の値も決まった向きに変わる（攻撃・ジャンプ・速さは増え、ふっとぶ きょりは、へる）', () => {
    const v = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(8, 8, 8, 2)))
    const d = Object.fromEntries(v.effects.map((e) => [e.key, e.derived.delta!]))
    expect(d.attackPower!).toBeGreaterThan(0)
    expect(d.defense!).toBeLessThan(0) // defense が高いと、ふっとぶ きょりは、短い
    expect(d.jumpPower!).toBeGreaterThan(0)
    expect(d.speed!).toBeLessThan(0)
  })

  it('試合中に測った値は、②に入れない（確定の値だけ）', () => {
    const v = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5)))
    for (const e of v.effects) expect(Object.keys(e).sort()).toEqual(['delta', 'derived', 'key'])
  })

  it('1P の能力値が同じとき、②は出ない', () => {
    expect(compare(rec(1, S(5, 5, 5, 5)), rec(2, S(5, 5, 5, 5))).effects).toEqual([])
  })
})

describe('③ けっか・しあいで みた うごき', () => {
  it('右 − 左。1P・2P の両方。差は、数値だけ（よい・わるいを判定しない）', () => {
    const a = rec(
      1,
      S(5, 5, 5, 5),
      {},
      metrics({ damageDealt: 40, hitsLanded: 3, moveDistance: 50 }),
      metrics({ damageDealt: 30 }),
    )
    const b = rec(
      2,
      S(7, 3, 5, 5),
      {},
      metrics({ damageDealt: 55.5, hitsLanded: 5, moveDistance: 41 }),
      metrics({ damageDealt: 20 }),
    )
    const v = compare(a, b)
    expect(v.results.damageDealt.p1).toEqual({ before: 40, after: 55.5, delta: 15.5 })
    expect(v.results.damageDealt.p2.delta).toBe(-10)
    expect(v.observed.hitsLanded.p1.delta).toBe(2)
    expect(v.observed.moveDistance.p1.delta).toBe(-9)
    expect(Object.keys(v.results).sort()).toEqual([
      'damageDealt',
      'damageTaken',
      'deaths',
      'kos',
      'maxDamageEndured',
      'recoveryFailure',
      'recoverySuccess',
    ])
    expect(Object.keys(v.observed).sort()).toEqual([
      'avgKnockbackDistance',
      'hitsLanded',
      'jumps',
      'moveDistance',
    ])
  })

  it('片方が「—」（null）なら、差も null（計算しない）', () => {
    const a = rec(1, S(5, 5, 5, 5), {}, metrics({ avgKnockbackDistance: null }))
    const b = rec(2, S(7, 3, 5, 5), {}, metrics({ avgKnockbackDistance: 4 }))
    expect(compare(a, b).observed.avgKnockbackDistance.p1).toEqual({
      before: null,
      after: 4,
      delta: null,
    })
  })

  it('指標のない記録（古い保存）が混ざっても、落ちない。差は null', () => {
    const v = compare(
      rec(1, S(5, 5, 5, 5), { p1: undefined, p2: undefined }),
      rec(2, S(7, 3, 5, 5)),
    )
    expect(v.results.damageDealt.p1).toEqual({ before: null, after: 40, delta: null })
    expect(v.left.stocksLeft).toEqual({ p1: null, p2: null })
    expect(v.p1StatChanges.length).toBe(4) // 設定は、比べられる
  })

  it('それぞれの戦の勝敗と、残りのストック。試合の長さ', () => {
    const a = rec(
      1,
      S(5, 5, 5, 5),
      { outcome: { winner: 'p1', reason: 'stocks' }, durationSec: 50 },
      metrics({ stocksLeft: 1 }),
      metrics({ stocksLeft: 0 }),
    )
    const b = rec(2, S(7, 3, 5, 5), {
      outcome: { winner: null, reason: 'draw_timeup' },
      durationSec: 90,
    })
    const v = compare(a, b)
    expect(v.left.outcome).toEqual({ winner: 'p1', reason: 'stocks' })
    expect(v.right.outcome.winner).toBeNull()
    expect(v.left.stocksLeft).toEqual({ p1: 1, p2: 0 })
    expect(v.durationSec).toEqual({ before: 50, after: 90 })
  })
})

describe('注意（誤解を防ぐ。comparison.md §6、§9）', () => {
  it('試合の長さが 30 秒以上違うとき', () => {
    expect(DURATION_NOTE_SECONDS).toBe(30)
    expect(
      compare(
        rec(1, S(5, 5, 5, 5), { durationSec: 40 }),
        rec(2, S(7, 3, 5, 5), { durationSec: 70 }),
      ).notes,
    ).toContain('duration_differs')
    expect(
      compare(
        rec(1, S(5, 5, 5, 5), { durationSec: 40 }),
        rec(2, S(7, 3, 5, 5), { durationSec: 69 }),
      ).notes,
    ).not.toContain('duration_differs')
  })

  it('ステージ・外観・名前が違うとき（再戦では起こらないが、万一）は、警告。同じなら、出さない', () => {
    const same = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5)))
    expect(same.stageDiffers).toBe(false)
    expect(same.appearanceDiffers).toEqual({ p1: false, p2: false })
    expect(same.notes).not.toContain('stage_differs')
    expect(same.notes).not.toContain('appearance_differs')

    const other = presetStage('wide')
    expect(compare(rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5), { stage: other })).notes).toContain(
      'stage_differs',
    )
    const cfg = createDefaultConfig('p1')
    const changed = { ...cfg, stats: S(7, 3, 5, 5), appearance: { ...cfg.appearance, body: 'b3' } }
    const v = compare(rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5), { p1Config: changed }))
    expect(v.appearanceDiffers.p1).toBe(true)
    expect(v.notes).toContain('appearance_differs')
    // 名前だけ違う
    const named = compare(
      rec(1, S(5, 5, 5, 5)),
      rec(2, S(7, 3, 5, 5), { p2Config: { ...createDefaultConfig('p2'), name: 'べつ' } }),
    )
    expect(named.appearanceDiffers.p2).toBe(true)
  })
})

describe('問いかけ（comparison.md §7.1。決定的に、1 つだけ）', () => {
  it('順 1: 1P の能力値が同じ → 「すうじは おなじ」', () => {
    expect(selectCompareQuestion(compare(rec(1, S(5, 5, 5, 5)), rec(2, S(5, 5, 5, 5))))).toBe(
      'same',
    )
  })

  it('順 2: いちばん おおきく かわった すうじ（差の絶対値が最大。同じ大きさなら、attackPower、defense、jumpPower、speed の順）の、ひな形', () => {
    const q = (to: Stats, from: Stats = S(5, 5, 5, 5)) =>
      selectCompareQuestion(compare(rec(1, from), rec(2, to)))
    expect(q(S(7, 3, 5, 5))).toBe('attackPower') // ＋2、−2: 同じ大きさ → 順番で attackPower
    expect(q(S(5, 3, 7, 5))).toBe('defense') // −2、＋2 → defense が先
    expect(q(S(5, 5, 8, 2))).toBe('jumpPower') // ＋3、−3 → jumpPower が先
    expect(q(S(6, 5, 5, 4))).toBe('attackPower') // ＋1、−1
    expect(q(S(5, 5, 5, 5), S(8, 5, 5, 2))).toBe('attackPower') // 戻した（−3、＋3）
    expect(q(S(5, 4, 5, 6))).toBe('defense') // −1、＋1: 同じ大きさ → defense が先
    expect(q(S(3, 4, 5, 8))).toBe('speed') // −2、−1、＋3: speed が最大
  })

  it('「1つずつ変える」ことを、勧めない（問いかけは、ふやした数字と、へらした数字の組。能力値の表だけを見る）', () => {
    for (const q of ['same', 'attackPower', 'defense', 'jumpPower', 'speed'] as const)
      expect(q).toBeTruthy()
    expect(
      findBannedWords('ふやした すうじと、へらした すうじで、うごきは どう ちがった？'),
    ).toEqual([])
  })
})

describe('比べる戦の選び方（comparison.md §4）', () => {
  const ms = [
    rec(1, S(5, 5, 5, 5)),
    rec(2, S(7, 3, 5, 5)),
    rec(3, S(6, 4, 5, 5)),
    rec(5, S(5, 5, 5, 5)),
  ]
  it('既定: 直前の戦と、いま終わった戦', () => {
    expect(defaultPair(ms)).toEqual([3, 5])
    expect(defaultPair(ms.slice(0, 2))).toEqual([1, 2])
  })
  it('戦が 1 つしかないときは、比較できない', () => {
    expect(defaultPair(ms.slice(0, 1))).toBeNull()
    expect(defaultPair([])).toBeNull()
  })
  it('選び直し: 2 つを選べる。同じ戦は、選べない。無い戦（上限で消えた）は、選べない。小さいほうが左', () => {
    expect(pickPair(ms, 5, 2)!.map((r) => r.matchNo)).toEqual([2, 5])
    expect(pickPair(ms, 2, 2)).toBeNull()
    expect(pickPair(ms, 1, 4)).toBeNull()
  })
})

describe('決定性・入力を変えない', () => {
  it('同じ入力から、同じ結果。入力は、書き換えない', () => {
    const a = rec(1, S(5, 5, 5, 5))
    const b = rec(2, S(7, 3, 5, 5))
    const before = JSON.stringify([a, b])
    expect(compare(a, b)).toEqual(compare(a, b))
    expect(JSON.stringify([a, b])).toBe(before)
  })
})
