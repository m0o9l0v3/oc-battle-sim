// 文字の並びから、ステージを作る（テスト・プリセットの記述用）。stage-format.md §8 の書き方
// `#` はブロック、`.` は空、`1`・`2` は P1・P2 のスポーン（そのセルは空）。
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'

export function stageFromRows(rows: readonly string[], name = 'ステージ'): StageData {
  const spawns: Record<'p1' | 'p2', { col: number; row: number }> = {
    p1: { col: -1, row: -1 },
    p2: { col: -1, row: -1 },
  }
  const cells = Array.from({ length: STAGE_ROWS }, (_, row): CellValue[] =>
    Array.from({ length: STAGE_COLS }, (_, col): CellValue => {
      const ch = rows[row]?.[col] ?? '.'
      if (ch === '1') spawns.p1 = { col, row }
      if (ch === '2') spawns.p2 = { col, row }
      return ch === '#' ? 1 : 0
    }),
  )
  return { schemaVersion: 1, name, cols: STAGE_COLS, rows: STAGE_ROWS, cells, spawns }
}
