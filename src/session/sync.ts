// 親機の sessionId と、この台のデータの照合（一斉リセットの検知）。純粋な関数。
// 仕様: docs/01-experience/event-control.md §9.1、docs/08-architecture/data-model.md §6.4・§6.5
import type { Session } from './state.ts'

/** この台が持つ sessionId と、その出どころ */
export type HostBinding = {
  /** 保存と一緒に持つ sessionId。まだ親機から取得していなければ null */
  sessionId: string | null
  /** いまのデータが、保存から復元したものか（再読み込み・再起動のあと、まだ親機と照合していない） */
  restored: boolean
}

/**
 * - keep: 同じ sessionId。何もしない
 * - adopt: 取得した sessionId を、この台のものとして保存する（データはそのまま）
 * - reset: 全データを破棄して S01 に戻り、取得した sessionId を持つ（対戦中でも中断する）
 */
export type SyncDecision = 'keep' | 'adopt' | 'reset'

/** まだ何も作っていない（S01 で、戦の記録もない） */
const pristine = (s: Session) => s.data.screen === 'S01' && s.data.matches.length === 0

export function syncSessionId(b: HostBinding, s: Session, incoming: string): SyncDecision {
  if (b.sessionId === incoming) return 'keep'
  // 違う sessionId: 一斉リセットを受けた、または受け取り損ねた台
  if (b.sessionId !== null) return 'reset'
  // null のとき（data-model.md §6.4）: このページで作ったデータなら、作業を消さずに採用する。
  // 保存から復元したデータは、親機の応答がないままターンをまたいだかもしれないため、破棄する
  return b.restored && !pristine(s) ? 'reset' : 'adopt'
}
