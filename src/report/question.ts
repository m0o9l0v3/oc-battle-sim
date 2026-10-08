// 最後の問いかけの選び方。決定的（乱数なし）。docs/07-report/battle-report.md §8.3
// 固定のひな形から、次の順の、最初に当てはまる行を、**1つだけ**選ぶ。条件は、すべて「1P（あなた）」の数字で判定する。
import type { PlayerMetrics } from '../model/index.ts'

export type QuestionId =
  /** 2 戦目以降 */
  | 'changed'
  /** 1P の自滅がある */
  | 'selfKo'
  /** 1P の復帰に失敗した回数が、成功より多い */
  | 'recovery'
  /** 受けたダメージが、与えたダメージの 2 倍以上 */
  | 'tookMuch'
  /** 与えたダメージが、受けたダメージの 2 倍以上 */
  | 'dealtMuch'
  | 'default'

/** 比べの倍率（暫定。設定で調整）。1回の試合は、運や相手の動きの影響も受けるため、断定しない */
export const QUESTION_RATIO = 2

export function selectQuestion(
  p1: Pick<
    PlayerMetrics,
    'selfKos' | 'recoveryFailure' | 'recoverySuccess' | 'damageDealt' | 'damageTaken'
  >,
  hasPreviousMatch: boolean,
  ratio = QUESTION_RATIO,
): QuestionId {
  if (hasPreviousMatch) return 'changed'
  if (p1.selfKos >= 1) return 'selfKo'
  if (p1.recoveryFailure > p1.recoverySuccess) return 'recovery'
  // どちらも 0 より大きいときだけ、比べる（片方が 0 のとき、「おおい」「たくさん」と言えるほどの比べにならない）
  const both = p1.damageDealt > 0 && p1.damageTaken > 0
  if (both && p1.damageTaken >= ratio * p1.damageDealt) return 'tookMuch'
  if (both && p1.damageDealt >= ratio * p1.damageTaken) return 'dealtMuch'
  return 'default'
}
