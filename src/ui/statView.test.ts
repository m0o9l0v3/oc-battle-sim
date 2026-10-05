import { describe, expect, it } from 'vitest'
import { statPercent } from './statView.ts'

describe('標準（5）との比較（%。stat-system.md §9）', () => {
  it('標準は、どの能力値も 100 %', () => {
    for (const key of ['attackPower', 'defense', 'jumpPower', 'speed'] as const) {
      expect(statPercent(key, 5)).toBe(100)
    }
  })

  it.each([
    ['attackPower', 2, 91],
    ['attackPower', 8, 109],
    ['defense', 2, 109], // 吹き飛ぶ量。低いほど、大きく吹き飛ぶ
    ['defense', 8, 91],
    ['jumpPower', 2, 70],
    ['jumpPower', 8, 130],
    ['speed', 2, 78], // 2.906 ÷ 3.75 = 77.5
    ['speed', 8, 123], // 4.594 ÷ 3.75 = 122.5
  ] as const)('%s %i → %i %%', (key, v, pct) => {
    expect(statPercent(key, v)).toBe(pct)
  })

  it('値が大きくなると、効果が単調に変わる（攻撃・ジャンプ・速さは増え、ふっとびは減る）', () => {
    for (const key of ['attackPower', 'jumpPower', 'speed'] as const) {
      for (let v = 2; v < 8; v++)
        expect(statPercent(key, v + 1)).toBeGreaterThan(statPercent(key, v))
    }
    for (let v = 2; v < 8; v++)
      expect(statPercent('defense', v + 1)).toBeLessThan(statPercent('defense', v))
  })
})
