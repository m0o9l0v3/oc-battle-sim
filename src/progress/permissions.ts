// フェーズごとの操作の可否。仕様: docs/01-experience/event-control.md §6
// この表を書き換えるだけで、次回開催の調整が済むようにする（§6.2）
import type { Phase, ProgressState } from '../model/progress.ts'

/** 操作の種類（§6.1） */
export type Operation = 'fighter' | 'stage' | 'test' | 'battle' | 'rematch' | 'share'

export type Permissions = Record<Operation, boolean>

const ALL: Permissions = {
  fighter: true,
  stage: true,
  test: true,
  battle: true,
  rematch: true,
  share: true,
}
const NONE: Permissions = {
  fighter: false,
  stage: false,
  test: false,
  battle: false,
  rematch: false,
  share: false,
}

/** §6.2 の表 */
export const PHASE_PERMISSIONS: Record<Phase, Permissions> = {
  PREPARE: NONE,
  PRODUCTION: { ...NONE, fighter: true, stage: true, test: true, battle: true },
  BATTLE: ALL,
  SHARING: { ...NONE, share: true },
  BUFFER: ALL,
  ENDED: NONE,
}

/** 「もちかえる」ボタンを出すフェーズ（§5.3） */
const TAKE_HOME_PHASES: readonly string[] = ['SHARING', 'BUFFER']

/**
 * 進行状態から、操作の可否を決める。
 * 進行状態がない（取得できない・通信不能が続いた）とき、未知のフェーズのときは、すべて許可（§6.2、§10）。
 * 再戦は、フェーズの表に加えて、再戦の受付（§6.3）が「受付中」のときだけ
 */
export function permissionsOf(p: ProgressState | null): Permissions {
  if (!p) return ALL
  const table = (PHASE_PERMISSIONS as Partial<Record<string, Permissions>>)[p.phase] ?? ALL
  return p.rematchOpen ? table : { ...table, rematch: false }
}

/** 「もちかえる」ボタンを出すか（最後に分かったフェーズで決める。通信が切れても、出したまま） */
export const offersTakeHome = (p: ProgressState | null): boolean =>
  !!p && TAKE_HOME_PHASES.includes(p.phase)
