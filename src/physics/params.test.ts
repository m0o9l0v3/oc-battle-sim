import { describe, expect, it } from 'vitest'
import { fighterParams, jumpHeightOf, moveSpeedOf } from './params.ts'

const stats = (speed: number, jumpPower: number) => ({ speed, jumpPower })

describe('能力値 → 物理パラメータ（stat-system.md §6.2、§6.3）', () => {
  it('標準（5）の基準値', () => {
    const p = fighterParams(stats(5, 5))
    expect(p.moveSpeed).toBeCloseTo(3.75, 10)
    expect(p.jumpHeight).toBeCloseTo(81 / 48, 10) // 約 1.69
    expect(p.jumpVelocity).toBeCloseTo(Math.sqrt(2 * 37.5 * (81 / 48)), 10)
    expect(p.jumpVelocity).toBeCloseTo(11.25, 10) // 9 × 60 ÷ 48
  })

  it.each([
    [2, 2.91],
    [3, 3.19],
    [4, 3.47],
    [5, 3.75],
    [6, 4.03],
    [7, 4.31],
    [8, 4.59],
  ])('speed %i → 移動速度 %f セル/秒（§6.3 の表。K_speed = 0.075）', (v, expected) => {
    expect(moveSpeedOf(v)).toBeCloseTo(expected, 2)
  })

  it.each([
    [2, 1.18],
    [3, 1.35],
    [4, 1.52],
    [5, 1.69],
    [6, 1.86],
    [7, 2.03],
    [8, 2.19],
  ])('jumpPower %i → ジャンプ高さ %f セル（§6.3 の表。K_jump = 0.10）', (v, expected) => {
    expect(jumpHeightOf(v)).toBeCloseTo(expected, 2)
  })

  it('speed は移動速度だけ、jumpPower はジャンプだけに影響する', () => {
    const a = fighterParams(stats(2, 5))
    const b = fighterParams(stats(8, 5))
    expect(a.jumpHeight).toBe(b.jumpHeight)
    expect(a.jumpVelocity).toBe(b.jumpVelocity)
    const c = fighterParams(stats(5, 2))
    const d = fighterParams(stats(5, 8))
    expect(c.moveSpeed).toBe(d.moveSpeed)
  })

  it('代表的な配分（§6.4）', () => {
    expect(fighterParams(stats(2, 8)).moveSpeed).toBeCloseTo(2.91, 2)
    expect(fighterParams(stats(2, 8)).jumpHeight).toBeCloseTo(2.19, 2)
    expect(fighterParams(stats(8, 2)).moveSpeed).toBeCloseTo(4.59, 2)
    expect(fighterParams(stats(8, 2)).jumpHeight).toBeCloseTo(1.18, 2)
  })

  it('係数を変えると、変換が変わる（設定にまとめてある）', () => {
    expect(moveSpeedOf(8, 0.2)).toBeCloseTo(3.75 * 1.6, 10)
    expect(jumpHeightOf(2, 0.2)).toBeCloseTo((81 / 48) * 0.4, 10)
  })
})
