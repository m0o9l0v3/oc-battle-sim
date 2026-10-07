// 試合ルールの数値。docs/03-combat/battle-rules.md §4〜§6、§10
// すべてここにまとめる（調整のために、コードを変えない。調整は #25）

export type MatchRules = {
  stocks: number
  timeLimitSec: number
  readySec: number
  endSec: number
  respawnDelaySec: number
  respawnInvincibleSec: number
  /** 場外領域の余白（セル）。ステージの範囲の外側 */
  blastMargin: { left: number; right: number; bottom: number; top: number }
  /** 決着しない（試し動かし）。ストックは減らず、時間切れ・撃墜で END に入らない。省略は false */
  endless?: boolean
}

export const DEFAULT_MATCH_RULES: MatchRules = {
  stocks: 3,
  timeLimitSec: 90,
  readySec: 3,
  endSec: 3,
  respawnDelaySec: 1.5,
  respawnInvincibleSec: 2.0,
  blastMargin: { left: 6, right: 6, bottom: 6, top: 8 },
}

/** 秒 → ステップ（60 Hz）。浮動小数点の誤差（1.5 × 60 = 90.00000000000001 など）で 1 増えないようにする */
export const secToSteps = (sec: number) => Math.ceil(sec * 60 - 1e-9)
