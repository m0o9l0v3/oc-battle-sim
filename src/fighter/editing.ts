// 能力値の編集の規則（S03、S06 の2P、S09）。docs/02-fighter/stat-system.md §5.1、§10
// 範囲外・合計が 20 を超える操作は、できないようにする（操作を無効にする）。
import type { Stats } from '../model/index.ts'
import { STAT_KEYS, STAT_MAX, STAT_MIN, TOTAL_POINTS, remainingPoints } from './config.ts'

export type StatBlockReason =
  /** 最大（8）に達している */
  | 'AT_MAX'
  /** 最小（2）に達している */
  | 'AT_MIN'
  /** 使えるポイントが残っていない（合計が 20 になっている） */
  | 'NO_POINTS'

/** 1ポイント増減できるか。できないときは、その理由 */
export function blockReason(stats: Stats, key: keyof Stats, delta: 1 | -1): StatBlockReason | null {
  const v = stats[key]
  if (delta > 0) {
    if (v >= STAT_MAX) return 'AT_MAX'
    if (remainingPoints(stats) <= 0) return 'NO_POINTS'
    return null
  }
  return v <= STAT_MIN ? 'AT_MIN' : null
}

/**
 * 1ポイント増減した、新しい能力値。範囲外・合計超過のときは、そのまま返す（変えない）。
 * 元のオブジェクトは書き換えない
 */
export function changeStat(stats: Stats, key: keyof Stats, delta: 1 | -1): Stats {
  return blockReason(stats, key, delta) === null ? { ...stats, [key]: stats[key] + delta } : stats
}

/** 「つぎへ」（対戦へ進む）が押せない理由。押せるときは null。残りがあれば、あと何ポイントか */
export type NextBlock =
  | { kind: 'REMAINING'; points: number }
  | { kind: 'OVER'; points: number }
  /** 範囲外・整数でない値がある（外部から入った値など）。合計が 20 でも、対戦を始められない */
  | { kind: 'INVALID' }

export function nextBlock(stats: Stats): NextBlock | null {
  // 各能力値が、整数で 2〜8 か。合計が 20 でも、これを満たさなければ、対戦開始の検証（canStartMatch）を通らない
  const valid = STAT_KEYS.every(
    (k) => Number.isInteger(stats[k]) && stats[k] >= STAT_MIN && stats[k] <= STAT_MAX,
  )
  if (!valid) return { kind: 'INVALID' }
  const r = remainingPoints(stats)
  if (r > 0) return { kind: 'REMAINING', points: r }
  if (r < 0) return { kind: 'OVER', points: -r }
  return null
}

export { TOTAL_POINTS }
