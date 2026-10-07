// セッション（1人の体験）の保存データ。仕様: docs/08-architecture/data-model.md §6
import type { CharacterConfig } from './character.ts'
import type { MatchResult } from './match.ts'
import type { StageData } from './stage.ts'

export type ScreenId =
  'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12'

/** 保持する戦の数の上限。超えたら古い戦から捨てる */
export const MAX_MATCHES = 20

export const SESSION_STORAGE_KEY = 'ocbs.session'

/**
 * 保存する戦の記録。MatchResult のうち、指標（p1・p2）は、対戦指標の記録（#37）ができるまで、省略できる。
 * 設定・ステージ・勝敗は、すべての戦に必ずある（第1戦の設定と結果を、第2戦のあとも参照できる）
 */
export type MatchRecord = Omit<MatchResult, 'p1' | 'p2'> & Partial<Pick<MatchResult, 'p1' | 'p2'>>

export type SessionData = {
  p1: CharacterConfig
  p2: CharacterConfig
  stage: StageData
  stagePresetId: string | null // 選んだプリセット。エディタで直した後も、元のIDを持つ
  matches: MatchRecord[] // matchNo の昇順。最大 MAX_MATCHES
  screen: ScreenId
}

/** localStorage に1つのキーで保存する形 */
export type SessionSnapshot = {
  schemaVersion: 1
  sessionId: string | null // 親機の sessionId。親機がない構成では null
  data: SessionData
}
