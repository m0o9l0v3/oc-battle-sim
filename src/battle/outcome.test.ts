import { describe, expect, it } from 'vitest'
import { blastBounds, blastCause, isOutside, platformExtent } from './blast.ts'
import { decideOutcome } from './outcome.ts'
import { DEFAULT_MATCH_RULES, secToSteps } from './rules.ts'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'

describe('勝敗（battle-rules.md §7）', () => {
  const d = (stocks: [number, number], damage: [number, number] = [0, 0], timeUp = false) =>
    decideOutcome({ stocks, damage, timeUp })

  it('決着していなければ null', () => {
    expect(d([3, 3])).toBeNull()
    expect(d([1, 3], [90, 0])).toBeNull()
  })

  it('片方だけストックが 0 → 残っているほうの勝ち（stocks）', () => {
    expect(d([0, 2])).toEqual({ winner: 'p2', reason: 'stocks' })
    expect(d([1, 0])).toEqual({ winner: 'p1', reason: 'stocks' })
  })

  it('両方 0（同じステップで最後のストックを失う）→ 引き分け（draw_double_ko）', () => {
    expect(d([0, 0])).toEqual({ winner: null, reason: 'draw_double_ko' })
  })

  it('時間切れ: ストックが多いほうの勝ち（timeup_stocks）', () => {
    expect(d([2, 1], [0, 0], true)).toEqual({ winner: 'p1', reason: 'timeup_stocks' })
    expect(d([1, 3], [0, 0], true)).toEqual({ winner: 'p2', reason: 'timeup_stocks' })
  })

  it('時間切れ: ストックが同じなら、蓄積ダメージが少ないほうの勝ち（timeup_damage）', () => {
    expect(d([2, 2], [40, 65], true)).toEqual({ winner: 'p1', reason: 'timeup_damage' })
    expect(d([2, 2], [65, 40], true)).toEqual({ winner: 'p2', reason: 'timeup_damage' })
  })

  it('ダメージは、表示の整数ではなく、内部の小数で比べる', () => {
    expect(d([2, 2], [33.6, 33.2], true)).toEqual({ winner: 'p2', reason: 'timeup_damage' })
  })

  it('時間切れで、すべて同じ → 引き分け（draw_timeup）。延長はない', () => {
    expect(d([2, 2], [40, 40], true)).toEqual({ winner: null, reason: 'draw_timeup' })
  })

  it('ストックの 0 は、時間切れより先に判定する（§7.1 の順）', () => {
    expect(d([0, 1], [0, 0], true)).toEqual({ winner: 'p2', reason: 'stocks' })
    expect(d([0, 0], [0, 0], true)).toEqual({ winner: null, reason: 'draw_double_ko' })
  })
})

describe('秒 → ステップ', () => {
  it('浮動小数点の誤差で、1 増えない', () => {
    expect(secToSteps(1.5)).toBe(90)
    expect(secToSteps(2)).toBe(120)
    expect(secToSteps(3)).toBe(180)
    expect(secToSteps(90)).toBe(5400)
    expect(secToSteps(0.3)).toBe(18)
  })
})

describe('場外（battle-rules.md §5.2）', () => {
  const stage = { cols: STAGE_COLS, rows: STAGE_ROWS } as StageData
  const b = blastBounds(stage, DEFAULT_MATCH_RULES.blastMargin)

  it('境界: 左右 6、下 6、上 8 セル（ステージの外側）', () => {
    expect(b).toEqual({ minX: -6, maxX: 30, minY: -8, maxY: 20 })
  })

  it('中にいる間は、撃墜されない。境界ちょうどは、まだ外ではない', () => {
    expect(blastCause({ x: 0, y: 0 }, { x: -6, y: 20 }, b)).toBeNull()
    expect(blastCause({ x: 0, y: 0 }, { x: 30, y: -8 }, b)).toBeNull()
  })

  it('各方向の原因', () => {
    expect(blastCause({ x: -5.9, y: 5 }, { x: -6.1, y: 5 }, b)).toBe('blast_left')
    expect(blastCause({ x: 29.9, y: 5 }, { x: 30.1, y: 5 }, b)).toBe('blast_right')
    expect(blastCause({ x: 5, y: -7.9 }, { x: 5, y: -8.1 }, b)).toBe('blast_top')
    expect(blastCause({ x: 5, y: 19.9 }, { x: 5, y: 20.1 }, b)).toBe('blast_bottom')
  })

  it('角: 同じステップに横と縦の境界を越えたら、直線の移動で先に交わったほうが原因', () => {
    // 左へ大きく動き、下にも出た。左の境界（x = −6）には 1/3、下の境界（y = 20）には 2/3 で交わる
    expect(blastCause({ x: -5, y: 19 }, { x: -8, y: 21 }, b)).toBe('blast_left')
    // 下に先に交わる
    expect(blastCause({ x: -5, y: 19 }, { x: -6.5, y: 25 }, b)).toBe('blast_bottom')
  })

  it('ちょうど角を通る（同時）ときは、下 → 上 → 左 → 右', () => {
    expect(blastCause({ x: -5, y: 19 }, { x: -7, y: 21 }, b)).toBe('blast_bottom') // 左・下が同時
    expect(blastCause({ x: -5, y: -7 }, { x: -7, y: -9 }, b)).toBe('blast_top') // 左・上が同時
    expect(blastCause({ x: 29, y: -7 }, { x: 31, y: -9 }, b)).toBe('blast_top') // 右・上が同時
    expect(blastCause({ x: 29, y: 19 }, { x: 31, y: 21 }, b)).toBe('blast_bottom') // 右・下が同時
  })
})

describe('復帰の「場外にいる」判定（recovery.md §4）', () => {
  const cells = Array.from({ length: STAGE_ROWS }, (_, r) =>
    Array.from({ length: STAGE_COLS }, (_, c): CellValue => (r >= 10 && c >= 4 && c < 20 ? 1 : 0)),
  )
  const e = platformExtent({ cols: STAGE_COLS, rows: STAGE_ROWS, cells } as StageData)

  it('足場の範囲と、最も低い足場の上面', () => {
    expect(e).toEqual({ minX: 4, maxX: 20, lowestTop: 10 })
  })

  it('空中で、足場の範囲の外側、または、最も低い足場の上面より低いと、場外', () => {
    expect(isOutside({ x: 3, y: 5 }, false, e)).toBe(true)
    expect(isOutside({ x: 21, y: 5 }, false, e)).toBe(true)
    expect(isOutside({ x: 10, y: 11 }, false, e)).toBe(true)
  })

  it('足場の範囲の内側の空中、地面や足場の上にいるときは、場外ではない', () => {
    expect(isOutside({ x: 10, y: 5 }, false, e)).toBe(false)
    expect(isOutside({ x: 3, y: 9.6 }, true, e)).toBe(false)
  })
})
