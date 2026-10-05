// ステージ（タイル）との衝突。軸ごとに分けた AABB 判定。
// 座標: セル単位、原点は左上、y は下が正（docs/04-stage/stage-format.md §4）。
import type { StageData } from '../model/index.ts'

/** 判定の許容誤差。ちょうど境界に接しているものは、重ならないとみなす */
export const EPS = 1e-9

/** ブロックの有無を調べる格子。範囲外は空（場外には壁も床もない） */
export type SolidGrid = {
  cols: number
  rows: number
  isSolid(col: number, row: number): boolean
}

export function gridFromStage(stage: StageData): SolidGrid {
  return {
    cols: stage.cols,
    rows: stage.rows,
    isSolid: (col, row) =>
      col >= 0 && col < stage.cols && row >= 0 && row < stage.rows && stage.cells[row]?.[col] === 1,
  }
}

/** [a, b) と重なるセルの番号の範囲（両端を含む）。接しているだけのセルは含めない */
const span = (a: number, b: number): [number, number] => [
  Math.floor(a + EPS),
  Math.ceil(b - EPS) - 1,
]

/** 長方形 [x0, x1) × [y0, y1) がブロックと重なるか */
export function overlapsSolid(
  grid: SolidGrid,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): boolean {
  const [c0, c1] = span(x0, x1)
  const [r0, r1] = span(y0, y1)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) if (grid.isSolid(c, r)) return true
  }
  return false
}
