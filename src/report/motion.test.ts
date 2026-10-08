import { describe, expect, it } from 'vitest'
import { DEFAULT_STATS } from '../fighter/index.ts'
import type { Stats } from '../model/index.ts'
import { confirmedMotion, launchDistance, REPORT_REFERENCE_DAMAGE } from './motion.ts'
import { QUESTION_RATIO, selectQuestion, type QuestionId } from './question.ts'
import { launchSpeed } from '../combat/index.ts'

const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})

describe('すうじから きまる うごき（確定。battle-report.md §4.2）', () => {
  it('標準（5/5/5/5）: 1 回のダメージ 12 %、ジャンプ 1.6875 セル、速さ 3.75 セル/秒', () => {
    const m = confirmedMotion(DEFAULT_STATS)
    expect(m.damagePerHit).toBeCloseTo(12, 9)
    expect(m.jumpHeight).toBeCloseTo(1.6875, 9)
    expect(m.moveSpeed).toBeCloseTo(3.75, 9)
  })

  it('式のとおり: attackPower 12 × (1 + 0.03 × (v − 5))、jumpPower 1.6875 × (1 + 0.10 × (v − 5))、speed 3.75 × (1 + 0.075 × (v − 5))', () => {
    expect(confirmedMotion(S(8, 5, 5, 5)).damagePerHit).toBeCloseTo(12 * 1.09, 9)
    expect(confirmedMotion(S(2, 5, 5, 5)).damagePerHit).toBeCloseTo(12 * 0.91, 9)
    expect(confirmedMotion(S(5, 5, 8, 5)).jumpHeight).toBeCloseTo(1.6875 * 1.3, 9)
    expect(confirmedMotion(S(5, 5, 2, 5)).jumpHeight).toBeCloseTo(1.6875 * 0.7, 9)
    expect(confirmedMotion(S(5, 5, 5, 8)).moveSpeed).toBeCloseTo(3.75 * 1.225, 9)
    expect(confirmedMotion(S(5, 5, 5, 2)).moveSpeed).toBeCloseTo(3.75 * 0.775, 9)
  })

  it('ほかの能力値を変えても、その値は変わらない（1 つの能力値に、1 つの値が対応する）', () => {
    const base = confirmedMotion(S(5, 5, 5, 5))
    expect(confirmedMotion(S(5, 8, 2, 2)).damagePerHit).toBe(base.damagePerHit)
    expect(confirmedMotion(S(8, 5, 2, 2)).knockbackDistance).toBe(base.knockbackDistance)
    expect(confirmedMotion(S(8, 8, 5, 2)).jumpHeight).toBe(base.jumpHeight)
    expect(confirmedMotion(S(8, 8, 2, 5)).moveSpeed).toBe(base.moveSpeed)
  })

  it('ふっとぶ きょり: 蓄積 60 % で、defense が高いほど、短い（knockback.md §7 の表）', () => {
    const d = (defense: number) => confirmedMotion(S(5, defense, 5, 5)).knockbackDistance
    expect(REPORT_REFERENCE_DAMAGE).toBe(60)
    // 表: defense 2 = 6.9、5 = 5.9、8 = 4.8（セル。小数 1 桁）
    expect(d(2)).toBeCloseTo(6.9, 1)
    expect(d(5)).toBeCloseTo(5.9, 1)
    expect(d(8)).toBeCloseTo(4.8, 1)
    expect(d(2)).toBeGreaterThan(d(5))
    expect(d(5)).toBeGreaterThan(d(8))
  })

  it('launchDistance: 固定ステップの計算（連続の式より、わずかに小さい）。速さの 2 乗に、ほぼ比例', () => {
    // 標準、100 %: 23.0 セル/秒 → 10.7 セル（連続の式は 10.8）
    expect(launchDistance(launchSpeed(100, 5))).toBeCloseTo(10.7, 1)
    const continuous = (v: number) => (v * v * Math.sin((130 * Math.PI) / 180)) / 37.5
    expect(launchDistance(20)).toBeLessThan(continuous(20))
    expect(launchDistance(20)).toBeGreaterThan(continuous(20) * 0.97)
    expect(launchDistance(20) / launchDistance(10)).toBeGreaterThan(3.8)
  })

  it('同じ入力から、同じ結果（決定的）。基準のダメージを変えられる', () => {
    expect(confirmedMotion(S(6, 4, 5, 5))).toEqual(confirmedMotion(S(6, 4, 5, 5)))
    expect(confirmedMotion(DEFAULT_STATS, 100).knockbackDistance).toBeGreaterThan(
      confirmedMotion(DEFAULT_STATS, 60).knockbackDistance,
    )
  })
})

describe('問いかけの選び方（battle-report.md §8.3。決定的に、1 つだけ）', () => {
  const base = {
    selfKos: 0,
    recoveryFailure: 0,
    recoverySuccess: 0,
    damageDealt: 30,
    damageTaken: 30,
  }
  const pick = (o: Partial<typeof base>, prev = false): QuestionId =>
    selectQuestion({ ...base, ...o }, prev)

  it('順 1: 2 戦目以降（直前の戦がある）は、いつも「かえた すうじは…」', () => {
    expect(pick({}, true)).toBe('changed')
    expect(pick({ selfKos: 2, damageTaken: 500 }, true)).toBe('changed')
  })

  it('順 2: 1P の自滅', () => {
    expect(pick({ selfKos: 1 })).toBe('selfKo')
    expect(pick({ selfKos: 1, recoveryFailure: 3 })).toBe('selfKo')
  })

  it('順 3: 復帰の失敗が、成功より多い（同じ回数は、当てはまらない）', () => {
    expect(pick({ recoveryFailure: 2, recoverySuccess: 1 })).toBe('recovery')
    expect(pick({ recoveryFailure: 1, recoverySuccess: 1 })).toBe('default')
    expect(pick({ recoveryFailure: 0, recoverySuccess: 3 })).toBe('default')
  })

  it('順 4・5: どちらのダメージも 0 より大きいときだけ、2 倍の比べ。境目は、ちょうど 2 倍で当てはまる', () => {
    expect(QUESTION_RATIO).toBe(2)
    expect(pick({ damageTaken: 60, damageDealt: 30 })).toBe('tookMuch')
    expect(pick({ damageTaken: 59.9, damageDealt: 30 })).toBe('default')
    expect(pick({ damageDealt: 60, damageTaken: 30 })).toBe('dealtMuch')
    expect(pick({ damageDealt: 59.9, damageTaken: 30 })).toBe('default')
  })

  it('片方が 0 のとき（1 回だけ当てて、1 回も当てられていない、など）は、4・5 に当てはまらない。両方 0 も', () => {
    expect(pick({ damageDealt: 12, damageTaken: 0 })).toBe('default')
    expect(pick({ damageDealt: 0, damageTaken: 50 })).toBe('default')
    expect(pick({ damageDealt: 0, damageTaken: 0 })).toBe('default')
  })

  it('順 6: どれにも当てはまらない', () => {
    expect(pick({})).toBe('default')
  })

  it('2P の数字は、見ない（1P の値だけを受け取る）', () => {
    // 引数に、2P の指標を渡す口がない
    expect(selectQuestion.length).toBeGreaterThanOrEqual(2)
  })
})
