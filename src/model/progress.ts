// 親機の進行状態。仕様: docs/01-experience/event-control.md §8.1
export type Phase = 'PREPARE' | 'PRODUCTION' | 'BATTLE' | 'SHARING' | 'BUFFER' | 'ENDED'

export type ProgressState = {
  phase: Phase
  sessionId: string // 変わると、参加者PCは全データを破棄して S01 に戻る
  revision: number
  turnStartedAt: number | null // 親機の時刻。参加者PCは保存しない
  turnEndsAt: number | null
  rematchOpen: boolean
  serverTime: number
}
