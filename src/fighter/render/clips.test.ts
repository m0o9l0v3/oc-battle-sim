import { describe, expect, it } from 'vitest'
import {
  attackKeySteps,
  buildAttackClip,
  buildHitClip,
  FIXED_CLIPS,
  isValidAttackFrames,
  STEP_MS,
  validateClip,
} from './clips.ts'
import type { Clip } from './types.ts'
import { DEFAULT_COMBAT_CONFIG } from '../../combat/index.ts'

describe('クリップのデータの検証（animation.md §8）', () => {
  it('固定のクリップ（Idle / Run / Jump / Fall / KO）は、すべて正しい', () => {
    for (const c of FIXED_CLIPS) expect(validateClip(c), c.state).toEqual([])
  })

  it('現在の基本攻撃（6・4・14）の Attack は正しく、長さは攻撃の全体', () => {
    const c = buildAttackClip({ startup: 6, active: 4, recovery: 14 })
    expect(validateClip(c)).toEqual([])
    expect(c.duration).toBeCloseTo(24 * STEP_MS)
    // 戦闘の設定と、同じ値
    expect(DEFAULT_COMBAT_CONFIG.attackStartup).toBe(6)
  })

  it('Attack の時刻の式（K0 < K1 < K2 < K3 < K4）が、許される全フレームで成り立つ', () => {
    for (let s = 2; s <= 12; s++) {
      for (let a = 1; a <= 8; a++) {
        for (let r = 2; r <= 24; r++) {
          const k = attackKeySteps({ startup: s, active: a, recovery: r })
          expect(k.k0).toBeLessThan(k.k1)
          expect(k.k1).toBeLessThan(k.k2)
          expect(k.k2).toBeLessThan(k.k3)
          expect(k.k3).toBeLessThan(k.k4)
          expect(validateClip(buildAttackClip({ startup: s, active: a, recovery: r }))).toEqual([])
        }
      }
    }
  })

  it('Attack の時刻: K1 = max(1, S−2)、K2 = S+1、持続 1 のとき K3 = S+2', () => {
    expect(attackKeySteps({ startup: 6, active: 4, recovery: 14 })).toEqual({
      k0: 0,
      k1: 4,
      k2: 7,
      k3: 10,
      k4: 24,
    })
    expect(attackKeySteps({ startup: 2, active: 1, recovery: 2 })).toEqual({
      k0: 0,
      k1: 1,
      k2: 3,
      k3: 4,
      k4: 5,
    })
  })

  it('式を満たさない攻撃のフレームは、拒否する', () => {
    expect(isValidAttackFrames({ startup: 1, active: 4, recovery: 14 })).toBe(false)
    expect(isValidAttackFrames({ startup: 6, active: 0, recovery: 14 })).toBe(false)
    expect(isValidAttackFrames({ startup: 6, active: 4, recovery: 1 })).toBe(false)
    expect(isValidAttackFrames({ startup: 6.5, active: 4, recovery: 14 })).toBe(false)
    expect(() => buildAttackClip({ startup: 1, active: 4, recovery: 14 })).toThrow(RangeError)
  })

  it('Hit は、やられ中の長さに合わせる。最短 200 ms', () => {
    expect(buildHitClip(50).duration).toBe(200)
    expect(buildHitClip(150).duration).toBe(200)
    expect(buildHitClip(900).duration).toBe(900)
    for (const ms of [0, 100, 200, 201, 400, 1200]) {
      expect(validateClip(buildHitClip(ms)), `${ms}`).toEqual([])
    }
  })

  it('不正なデータを検出する（時刻が増えない、未知の部位・値、末尾が duration でない）', () => {
    const base: Clip = {
      state: 'idle',
      loop: true,
      duration: 100,
      affects: { root: true },
      keyframes: [
        { t: 0, pose: {} },
        { t: 100, pose: {} },
      ],
    }
    expect(validateClip(base)).toEqual([])
    expect(
      validateClip({
        ...base,
        keyframes: [
          { t: 0, pose: {} },
          { t: 50, pose: {} },
          { t: 50, pose: {} },
          { t: 100, pose: {} },
        ],
      }).length,
    ).toBeGreaterThan(0)
    expect(
      validateClip({ ...base, affects: { wing: true } as unknown as Clip['affects'] }).length,
    ).toBeGreaterThan(0)
    expect(
      validateClip({ ...base, affects: { root: ['zz'] } as unknown as Clip['affects'] }).length,
    ).toBeGreaterThan(0)
    expect(validateClip({ ...base, duration: 120 }).length).toBeGreaterThan(0)
    expect(validateClip({ ...base, duration: 0 }).length).toBeGreaterThan(0)
  })
})
