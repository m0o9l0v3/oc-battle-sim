// 対戦結果の型。仕様: docs/07-report/battle-report.md §6、docs/03-combat/battle-rules.md §10
import type { CharacterConfig } from './character.ts'
import type { StageData } from './stage.ts'

export type MatchOutcome = {
  winner: 'p1' | 'p2' | null // null は引き分け
  reason: 'stocks' | 'timeup_stocks' | 'timeup_damage' | 'draw_double_ko' | 'draw_timeup'
}

export type PlayerMetrics = {
  stocksLeft: number
  damageDealt: number // %
  damageTaken: number // %
  hitsLanded: number
  attacksThrown: number
  kos: number
  selfKos: number
  deaths: number
  maxDamageEndured: number // %
  recoverySuccess: number
  recoveryFailure: number
  jumps: number
  moveDistance: number // セル
  avgKnockbackDistance: number | null // セル
}

export type MatchResult = {
  schemaVersion: 1
  matchNo: number // 第 N 戦（1 から。上限で消えても番号は戻さない）
  p1Config: CharacterConfig
  p2Config: CharacterConfig
  stage: StageData
  outcome: MatchOutcome
  durationSec: number
  p1: PlayerMetrics
  p2: PlayerMetrics
}
