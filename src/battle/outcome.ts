// 勝敗の判定。docs/03-combat/battle-rules.md §7
import type { MatchOutcome } from '../model/index.ts'

export type OutcomeInput = {
  stocks: [number, number]
  /** 蓄積ダメージ（内部の小数の値。表示の整数ではなく、これで比べる） */
  damage: [number, number]
  /** 制限時間が 0 になった */
  timeUp: boolean
}

/** 決着していなければ null */
export function decideOutcome({ stocks, damage, timeUp }: OutcomeInput): MatchOutcome | null {
  const [s1, s2] = stocks
  // 1. 片方だけ、ストックが 0 → 残っているほうの勝ち
  if (s1 <= 0 && s2 > 0) return { winner: 'p2', reason: 'stocks' }
  if (s2 <= 0 && s1 > 0) return { winner: 'p1', reason: 'stocks' }
  // 2. 両方 0（同じステップで最後のストックを失った）→ 引き分け
  if (s1 <= 0 && s2 <= 0) return { winner: null, reason: 'draw_double_ko' }
  if (!timeUp) return null
  // 3. 時間切れ: ストック → 蓄積ダメージ（少ないほうが有利）→ 引き分け
  if (s1 !== s2) return { winner: s1 > s2 ? 'p1' : 'p2', reason: 'timeup_stocks' }
  if (damage[0] !== damage[1]) {
    return { winner: damage[0] < damage[1] ? 'p1' : 'p2', reason: 'timeup_damage' }
  }
  return { winner: null, reason: 'draw_timeup' }
}
