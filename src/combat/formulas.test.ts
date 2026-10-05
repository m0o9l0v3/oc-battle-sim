import { describe, expect, it } from 'vitest'
import { DEFAULT_COMBAT_CONFIG, validateCombatConfig } from './config.ts'
import {
  accumulateDamage,
  damageDealt,
  displayDamage,
  hitstunMs,
  hitstunSteps,
  launchSpeed,
  launchVelocity,
} from './formulas.ts'

describe('ダメージ（damage.md §3）', () => {
  it.each([
    [2, 10.92],
    [3, 11.28],
    [4, 11.64],
    [5, 12.0],
    [6, 12.36],
    [7, 12.72],
    [8, 13.08],
  ])('attackPower %i → %f %%', (ap, expected) => {
    expect(damageDealt(ap)).toBeCloseTo(expected, 10)
  })

  it.each([
    [2, 10],
    [3, 9],
    [4, 9],
    [5, 9],
    [6, 9],
    [7, 8],
    [8, 8],
  ])('attackPower %i は、%i 回のヒットで 100 %% に届く', (ap, hits) => {
    expect(damageDealt(ap) * hits).toBeGreaterThanOrEqual(100 - 1e-9)
    expect(damageDealt(ap) * (hits - 1)).toBeLessThan(100)
  })

  it('ダメージは、相手の defense に影響されない（引数に defense がない）', () => {
    expect(damageDealt.length).toBeLessThanOrEqual(2)
  })

  it('計算の例（§6）', () => {
    expect(damageDealt(5) * 3).toBeCloseTo(36, 10)
    expect(damageDealt(8) * 2).toBeCloseTo(26.16, 10)
    expect(damageDealt(2) * 5).toBeCloseTo(54.6, 10)
    expect(damageDealt(8) * 7).toBeCloseTo(91.56, 10)
  })
})

describe('蓄積と表示（damage.md §4）', () => {
  it('蓄積し、上限 999 % で止まる', () => {
    expect(accumulateDamage(0, 12)).toBe(12)
    expect(accumulateDamage(990, 15.6)).toBe(999)
    expect(accumulateDamage(999, 12)).toBe(999)
  })

  it('表示は整数に切り捨てる。内部の小数は丸めない', () => {
    expect(displayDamage(33.6)).toBe(33)
    expect(displayDamage(26.16)).toBe(26)
    expect(displayDamage(91.56)).toBe(91)
    expect(displayDamage(0)).toBe(0)
  })

  it('小数の足し算の誤差で、表示が 1 つ減らない（10.92 × 5 = 54.6）', () => {
    let d = 0
    for (let i = 0; i < 5; i++) d = accumulateDamage(d, damageDealt(2))
    expect(displayDamage(d)).toBe(54)
  })
})

describe('吹き飛ばしの速さ（knockback.md §3、§7、§8）', () => {
  it.each([
    // [ダメージ後, defense 2, 5, 8]
    [12, 10.68, 9.8, 8.92],
    [36, 14.61, 13.4, 12.19],
    [60, 18.53, 17.0, 15.47],
    [100, 25.07, 23.0, 20.93],
    [150, 33.25, 30.5, 27.76], // 表（knockback.md §7）は小数第 1 位に丸める
  ])('ダメージ後 %i %% の速さ（defense 2 / 5 / 8）', (d, s2, s5, s8) => {
    expect(launchSpeed(d, 2)).toBeCloseTo(s2, 1)
    expect(launchSpeed(d, 5)).toBeCloseTo(s5, 1)
    expect(launchSpeed(d, 8)).toBeCloseTo(s8, 1)
  })

  it('defense は、吹き飛ぶ速さだけを変える。高いほど遅い（倍率 1.09〜0.91）', () => {
    const base = launchSpeed(100, 5)
    for (const [def, k] of [
      [2, 1.09],
      [3, 1.06],
      [4, 1.03],
      [5, 1.0],
      [6, 0.97],
      [7, 0.94],
      [8, 0.91],
    ] as const) {
      expect(launchSpeed(100, def)).toBeCloseTo(base * k, 10)
    }
  })

  it('蓄積ダメージが大きいほど、大きく吹き飛ぶ', () => {
    const speeds = [0, 20, 60, 100, 200].map((d) => launchSpeed(d, 5))
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1])
  })

  it('999 % のまま計算できる', () => {
    expect(launchSpeed(999, 5)).toBeCloseTo(8 + 0.15 * 999, 10)
  })

  it('速度への分解（65° 上向き。縦は下が正）。§8 の例: 9.8 → vx 4.1、vy −8.9', () => {
    const { vx, vy } = launchVelocity(9.8, 1)
    expect(vx).toBeCloseTo(4.1, 1)
    expect(vy).toBeCloseTo(-8.9, 1)
    expect(launchVelocity(9.8, -1).vx).toBeCloseTo(-4.1, 1)
    expect(launchVelocity(9.8, -1).vy).toBeCloseTo(vy, 10)
  })
})

describe('やられ中の長さ（knockback.md §5、§7）', () => {
  it.each([
    [12, 5, 395, 24],
    [100, 5, 725, 44],
    [12, 2, 417, 26],
    [36, 2, 515, 31],
    [100, 2, 777, 47],
    [12, 8, 373, 23],
    [100, 8, 673, 41],
  ])('蓄積 %i %%・defense %i → 約 %i ms、%i ステップ', (d, def, ms, steps) => {
    const speed = launchSpeed(d, def)
    expect(hitstunMs(speed)).toBeCloseTo(ms, -0.5)
    expect(hitstunSteps(speed)).toBe(steps)
  })

  it('上限（1200 ms = 72 ステップ）で止まる', () => {
    expect(hitstunMs(1000)).toBe(1200)
    expect(hitstunSteps(1000)).toBe(72)
  })

  it('境目: 500.1 ms → 31 ステップ（1ステップ = 1000/60 ms ちょうど）', () => {
    // speed から 500.1 ms になるように逆算
    const speed = (500.1 - 150) / 25
    expect(hitstunSteps(speed)).toBe(31)
    // ちょうど 500 ms（= 30 ステップ分）は、30 ステップ
    expect(hitstunSteps((500 - 150) / 25)).toBe(30)
  })
})

describe('設定', () => {
  it('攻撃のフレームの最小値（発生 2・持続 1・硬直 2）を守る', () => {
    expect(validateCombatConfig(DEFAULT_COMBAT_CONFIG)).toEqual([])
    expect(
      validateCombatConfig({
        ...DEFAULT_COMBAT_CONFIG,
        attackStartup: 1,
        attackActive: 0,
        attackRecovery: 1,
      }),
    ).toEqual(['attackStartup', 'attackActive', 'attackRecovery'])
  })
})
