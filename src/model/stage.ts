// ステージの型。仕様: docs/04-stage/stage-format.md §5
export const STAGE_COLS = 24
export const STAGE_ROWS = 14

export type CellValue = 0 | 1 // 0: 空、1: ブロック

export type Spawn = { col: number; row: number }

export type StageData = {
  schemaVersion: 1
  name: string
  cols: typeof STAGE_COLS
  rows: typeof STAGE_ROWS
  cells: CellValue[][] // cells[row][col]
  spawns: { p1: Spawn; p2: Spawn }
}
