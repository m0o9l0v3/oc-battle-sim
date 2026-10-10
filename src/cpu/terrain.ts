// CPU が使う、ステージの形の読み取り。docs/03-combat/cpu-opponent.md §5
// 試合の最初に 1 回だけ作り、試合の間は、表を引くだけ（60 FPS を妨げない）
import type { StageData } from '../model/index.ts'
import { BODY_HEIGHT, BODY_WIDTH } from '../physics/index.ts'
import { findPlatforms, type Platform } from '../stage/index.ts'

export type Terrain = {
  /** x の列の、y（足元）以下で、最初に当たる足場の上面の行。下に何もなければ null（落ちたら場外） */
  groundBelow(x: number, y: number): number | null
  /** 頭の上の、ブロックの下面までの距離（セル）。上に何もなければ Infinity（跳んでも、頭をぶつけない） */
  headroom(x: number, y: number): number
  /** 下に足場がある（落ちても、ステージの上に着く）か */
  safe(x: number, y: number): boolean
  /** 立てる足場の一覧 */
  platforms: readonly Platform[]
  /** その位置の足元の足場（立っているとき）。なければ null */
  platformAt(x: number, y: number): Platform | null
  /** ステージの中央に近い、いちばん広い足場（待つ位置・戻る先の最後の候補） */
  home: Platform
}

export function createTerrain(stage: StageData): Terrain {
  const cols = stage.cols
  const rows = stage.rows
  // 列ごとに、ブロックの行（上から順）
  const solidRows: number[][] = Array.from({ length: cols }, (_, c) => {
    const out: number[] = []
    for (let r = 0; r < rows; r++) if (stage.cells[r]?.[c] === 1) out.push(r)
    return out
  })
  const groundBelow = (x: number, y: number): number | null => {
    const c = Math.floor(x)
    if (c < 0 || c >= cols) return null
    for (const r of solidRows[c]!) if (r >= y - 1e-6) return r
    return null
  }
  const headroom = (x: number, y: number): number => {
    const head = y - BODY_HEIGHT
    let best = Infinity
    for (const px of [x - BODY_WIDTH / 2 + 1e-6, x + BODY_WIDTH / 2 - 1e-6]) {
      const c = Math.floor(px)
      if (c < 0 || c >= cols) continue
      for (const r of solidRows[c]!) if (r + 1 <= head + 1e-6) best = Math.min(best, head - (r + 1))
    }
    return best
  }
  const platforms = findPlatforms(stage.cells)
  const platformAt = (x: number, y: number): Platform | null =>
    platforms.find((p) => Math.abs(p.row - y) < 0.05 && x >= p.col && x <= p.col + p.width) ?? null
  const center = cols / 2
  let home = platforms[0] ?? { row: rows - 1, col: 0, width: cols }
  for (const p of platforms) {
    const score = (q: Platform) => q.width * 2 - Math.abs(q.col + q.width / 2 - center)
    if (score(p) > score(home)) home = p
  }
  return {
    groundBelow,
    headroom,
    safe: (x, y) => groundBelow(x, y) !== null,
    platforms,
    platformAt,
    home,
  }
}
