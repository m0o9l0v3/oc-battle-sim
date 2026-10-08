// 親機の進行状態の検証（外から入る値は、境界で検証してから使う。frontend.md §4.3 D5）。
// 参加者PCが受け取る応答と、親機が再起動のときに読み戻す保存の、両方で使う
import type { ProgressState } from '../model/progress.ts'
import { isPhase } from './phase.ts'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

const isTimeOrNull = (v: unknown): v is number | null => v === null || isTime(v)

/** sessionId の長さの上限。親機が作る値（UUID）は 36 文字 */
const MAX_SESSION_ID_LENGTH = 64

export type ReadOptions = {
  /**
   * 未知のフェーズを受け付ける（参加者PC用。event-control.md §6.2: 未知のフェーズは、すべて許可）。
   * 受け付けた値は、そのまま `phase` に入る。許可の判定は、未知の値を、すべて許可として扱う
   */
  allowUnknownPhase?: boolean
}

/** 形が合わなければ null。余分なキーは捨てる（受け取った値を、そのまま持ち回らない） */
export function readProgressState(v: unknown, options: ReadOptions = {}): ProgressState | null {
  if (!isRecord(v)) return null
  const { phase, sessionId, revision, turnStartedAt, turnEndsAt, rematchOpen, serverTime } = v
  if (typeof phase !== 'string') return null
  if (!isPhase(phase) && !(options.allowUnknownPhase && phase.length > 0 && phase.length <= 32))
    return null
  if (
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    sessionId.length > MAX_SESSION_ID_LENGTH
  )
    return null
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return null
  if (!isTimeOrNull(turnStartedAt) || !isTimeOrNull(turnEndsAt)) return null
  if (typeof rematchOpen !== 'boolean') return null
  if (!isTime(serverTime)) return null
  return {
    // 未知のフェーズ（allowUnknownPhase のとき）も、文字列のまま渡す
    phase: phase as ProgressState['phase'],
    sessionId,
    revision,
    turnStartedAt,
    turnEndsAt,
    rematchOpen,
    serverTime,
  }
}
