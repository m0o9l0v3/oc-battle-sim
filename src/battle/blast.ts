// 場外（撃墜）の判定と、復帰の場外の判定。docs/03-combat/battle-rules.md §5.2、recovery.md §4
import type { StageData } from '../model/index.ts'
import type { MatchRules } from './rules.ts'

/** 撃墜の原因は、1つだけ記録する */
export type BlastCause = 'blast_left' | 'blast_right' | 'blast_top' | 'blast_bottom'

export type BlastBounds = { minX: number; maxX: number; minY: number; maxY: number }

/** 場外領域の境界。体の中心が、この外に出たら撃墜（y は下が正） */
export const blastBounds = (stage: StageData, m: MatchRules['blastMargin']): BlastBounds => ({
  minX: -m.left,
  maxX: stage.cols + m.right,
  minY: -m.top,
  maxY: stage.rows + m.bottom,
})

type Point = { x: number; y: number }

/** 同時のとき、下 → 上 → 左 → 右の順（battle-rules.md §5.2） */
const PRIORITY: BlastCause[] = ['blast_bottom', 'blast_top', 'blast_left', 'blast_right']

/**
 * 体の中心が、場外領域の外に出ているか。出ていれば原因を返す。
 * 前のステップの位置から今の位置への直線の移動が、境界と先に交わったほうを原因とする。
 * 同時に交わる（ちょうど角を通る）ときは、下 → 上 → 左 → 右。
 */
export function blastCause(prev: Point, cur: Point, b: BlastBounds): BlastCause | null {
  const outside: Record<BlastCause, boolean> = {
    blast_left: cur.x < b.minX,
    blast_right: cur.x > b.maxX,
    blast_top: cur.y < b.minY,
    blast_bottom: cur.y > b.maxY,
  }
  const hit = PRIORITY.filter((c) => outside[c])
  if (hit.length === 0) return null
  if (hit.length === 1) return hit[0]

  // 直線の移動で、境界と交わる位置（0〜1。小さいほど先）
  const t = (c: BlastCause): number => {
    const d = c === 'blast_left' || c === 'blast_right' ? cur.x - prev.x : cur.y - prev.y
    if (d === 0) return Infinity
    const edge =
      c === 'blast_left'
        ? b.minX
        : c === 'blast_right'
          ? b.maxX
          : c === 'blast_top'
            ? b.minY
            : b.maxY
    const p0 = c === 'blast_left' || c === 'blast_right' ? prev.x : prev.y
    return (edge - p0) / d
  }
  let best = hit[0]
  let bestT = t(best)
  for (const c of hit.slice(1)) {
    const tc = t(c)
    // 先に交わったほうを選ぶ。同じ（誤差の範囲）なら、優先順で先に並んでいるほう（best）のまま
    if (tc < bestT - 1e-12) {
      best = c
      bestT = tc
    }
  }
  return best
}

/** 復帰の「場外にいる」判定に使う、足場の範囲（recovery.md §4） */
export type PlatformExtent = {
  /** 全足場の左端・右端（セル座標） */
  minX: number
  maxX: number
  /** 最も低い足場の上面（y は下が正。大きいほど低い） */
  lowestTop: number
}

export function platformExtent(stage: StageData): PlatformExtent {
  let minX = Infinity
  let maxX = -Infinity
  let lowestTop = -Infinity
  for (let r = 0; r < stage.rows; r++) {
    for (let c = 0; c < stage.cols; c++) {
      if (stage.cells[r]?.[c] !== 1) continue
      minX = Math.min(minX, c)
      maxX = Math.max(maxX, c + 1)
      // 上が空のブロックは、立てる上面（足場の上面）
      if (r === 0 || stage.cells[r - 1]?.[c] !== 1) lowestTop = Math.max(lowestTop, r)
    }
  }
  return { minX, maxX, lowestTop }
}

/**
 * 場外にいるか（recovery.md §4）: 空中にいて、体の中心が足場の範囲の外側（左右）、
 * または、最も低い足場の上面より低い。地面や足場の上にいるときは、場外ではない
 */
export function isOutside(center: Point, onGround: boolean, e: PlatformExtent): boolean {
  if (onGround) return false
  return center.x < e.minX || center.x > e.maxX || center.y > e.lowestTop
}

/** 復帰として数える、場外にいる時間の下限（ステップ）。0.3 秒（recovery.md §5。暫定） */
export const MIN_RECOVERY_STEPS = 18
