// ステージの形の分析: 立てるセル、足場、飛び移り、行き来できるか。純粋な関数。
// 仕様: docs/04-stage/stage-format.md §6、validation.md §5
import { STAGE_COLS, STAGE_ROWS, type StageData } from '../model/index.ts'
import { DEFAULT_STAGE_RULES, type StageRules } from './rules.ts'

export type Cell = { col: number; row: number }

/** ブロックか。グリッドの外は、空 */
export const isBlock = (cells: StageData['cells'], col: number, row: number): boolean =>
  col >= 0 && col < STAGE_COLS && row >= 0 && row < STAGE_ROWS && cells[row]?.[col] === 1

/**
 * 立てるセル: ブロックで、すぐ上のセルが空のもの。
 * 最上段（行 0）は、上がグリッドの外で、体が収まらないため、立てるセルに数えない
 */
export const isStandable = (cells: StageData['cells'], col: number, row: number): boolean =>
  row >= 1 && isBlock(cells, col, row) && !isBlock(cells, col, row - 1)

export function standableCells(cells: StageData['cells']): Cell[] {
  const out: Cell[] = []
  for (let row = 0; row < STAGE_ROWS; row++) {
    for (let col = 0; col < STAGE_COLS; col++) {
      if (isStandable(cells, col, row)) out.push({ col, row })
    }
  }
  return out
}

/** 足場: 同じ行で、横に連続した、立てるセルのまとまり。上の行から、左から順 */
export type Platform = { row: number; col: number; width: number }

export function findPlatforms(cells: StageData['cells']): Platform[] {
  const out: Platform[] = []
  for (let row = 0; row < STAGE_ROWS; row++) {
    let start = -1
    for (let col = 0; col <= STAGE_COLS; col++) {
      const on = col < STAGE_COLS && isStandable(cells, col, row)
      if (on && start < 0) start = col
      else if (!on && start >= 0) {
        out.push({ row, col: start, width: col - start })
        start = -1
      }
    }
  }
  return out
}

export const platformCells = (p: Platform): Cell[] =>
  Array.from({ length: p.width }, (_, i) => ({ col: p.col + i, row: p.row }))

/** 最も広い足場（同じ幅なら、上・左のもの）。足場がなければ null */
export function mainPlatform(platforms: readonly Platform[]): Platform | null {
  let best: Platform | null = null
  for (const p of platforms) if (!best || p.width > best.width) best = p
  return best
}

/** 範囲の、すべてのセルが空か（グリッドの外は空） */
const emptyColumn = (cells: StageData['cells'], col: number, r0: number, r1: number): boolean => {
  for (let r = r0; r <= r1; r++) if (isBlock(cells, col, r)) return false
  return true
}

/**
 * a から b へ、飛び移れるか（向きがある）。validation.md §5.2、§5.3
 * rise は、上向きが正（a の行 − b の行）
 */
export function canJump(
  cells: StageData['cells'],
  a: Cell,
  b: Cell,
  rules: StageRules = DEFAULT_STAGE_RULES,
): boolean {
  if (a.col === b.col) return false
  const rise = a.row - b.row
  if (rise > rules.maxRise) return false
  const gap = Math.abs(a.col - b.col) - 1
  if (gap > (rise >= -1 ? rules.maxGapShallow : rules.maxGapDrop)) return false

  const lo = Math.min(a.row, b.row) - 3
  const hi = Math.max(a.row, b.row) - 1
  if (!emptyColumn(cells, a.col, lo, a.row - 1)) return false
  if (!emptyColumn(cells, b.col, b.row - 3, b.row - 1)) return false
  const step = b.col > a.col ? 1 : -1
  for (let c = a.col + step; c !== b.col; c += step) {
    if (!emptyColumn(cells, c, lo, hi)) return false
  }
  return true
}

/**
 * 行き来できない足場のセル。すべての立てるセルが強連結なら、空。
 * 基準は、メイン足場（そこから行けて、そこへ戻れるセルだけが、「行き来できる」）
 */
export function unreachableCells(
  cells: StageData['cells'],
  rules: StageRules = DEFAULT_STAGE_RULES,
): Cell[] {
  const nodes = standableCells(cells)
  const main = mainPlatform(findPlatforms(cells))
  if (nodes.length === 0 || !main) return []
  const index = new Map(nodes.map((n, i) => [n.row * STAGE_COLS + n.col, i]))
  const fwd: number[][] = nodes.map(() => [])
  const back: number[][] = nodes.map(() => [])
  nodes.forEach((a, i) => {
    nodes.forEach((b, j) => {
      if (i === j) return
      const walk = a.row === b.row && Math.abs(a.col - b.col) === 1
      if (walk || canJump(cells, a, b, rules)) {
        fwd[i]!.push(j)
        back[j]!.push(i)
      }
    })
  })
  const reach = (adj: number[][], from: number) => {
    const seen = new Set([from])
    const stack = [from]
    while (stack.length > 0) {
      for (const n of adj[stack.pop()!]!) {
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    return seen
  }
  const start = index.get(main.row * STAGE_COLS + main.col)!
  const f = reach(fwd, start)
  const b = reach(back, start)
  return nodes.filter((_, i) => !(f.has(i) && b.has(i)))
}
