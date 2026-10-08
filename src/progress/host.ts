// 親機の進行状態の管理（状態機械）。I/O・時計・乱数を持たない純粋関数。時刻と新しい sessionId は、引数で受け取る。
// 仕様: docs/01-experience/event-control.md §5.2（遷移）、§6.3（再戦の受付）、§7（管理画面）、§9.1（一斉リセット）
//
// ここで扱うのは、親機の進行状態だけ。参加者のステージ・設定・結果は、持たない（§11）
import type { Phase, ProgressState } from '../model/progress.ts'
import { PHASE_LABELS } from './phase.ts'
import { readProgressState } from './read.ts'

/** 親機が持つ状態。配信するときに、親機の現在時刻（serverTime）を付ける */
export type HostProgress = Omit<ProgressState, 'serverTime'>

/** ターンの長さ。`制作開始` から 19 分（導入の 1 分を含めて、ターン全体が 0:00〜20:00。§7.2） */
export const TURN_DURATION_MS = 19 * 60 * 1000

/** 管理画面のボタン（§7.2） */
export type HostCommand =
  | 'START_PRODUCTION'
  | 'START_BATTLE'
  | 'START_SHARING'
  | 'TO_BUFFER'
  | 'END'
  | 'STOP_REMATCH'
  | 'OPEN_REMATCH'
  | 'RESET'

export const HOST_COMMANDS: readonly HostCommand[] = [
  'START_PRODUCTION',
  'START_BATTLE',
  'START_SHARING',
  'TO_BUFFER',
  'END',
  'STOP_REMATCH',
  'OPEN_REMATCH',
  'RESET',
]

export const isHostCommand = (v: unknown): v is HostCommand =>
  typeof v === 'string' && (HOST_COMMANDS as readonly string[]).includes(v)

export const COMMAND_LABELS: Record<HostCommand, string> = {
  START_PRODUCTION: '制作開始',
  START_BATTLE: '対戦開始',
  START_SHARING: '持ち帰り開始',
  TO_BUFFER: '予備時間へ',
  END: '終了',
  STOP_REMATCH: '再戦を止める',
  OPEN_REMATCH: '再戦を再開する',
  RESET: '一斉リセット',
}

/**
 * フェーズを進めるボタンと、押せるフェーズ（§5.2）。前のフェーズへ戻す操作は、設けない（戻すときは一斉リセット）。
 * 遅れた組がいなければ、SHARING から BUFFER を経ずに、直接「終了」できる
 */
const TRANSITIONS: Record<
  'START_PRODUCTION' | 'START_BATTLE' | 'START_SHARING' | 'TO_BUFFER' | 'END',
  { from: readonly Phase[]; to: Phase }
> = {
  START_PRODUCTION: { from: ['PREPARE'], to: 'PRODUCTION' },
  START_BATTLE: { from: ['PRODUCTION'], to: 'BATTLE' },
  START_SHARING: { from: ['BATTLE'], to: 'SHARING' },
  TO_BUFFER: { from: ['SHARING'], to: 'BUFFER' },
  END: { from: ['SHARING', 'BUFFER'], to: 'ENDED' },
}

/** 起動して、保存がないときの状態。一斉リセットのあとと同じ（§9.1） */
export function createHostProgress(sessionId: string, revision = 0): HostProgress {
  return {
    phase: 'PREPARE',
    sessionId,
    revision,
    turnStartedAt: null,
    turnEndsAt: null,
    rematchOpen: true,
  }
}

/** そのフェーズで押せるボタン（再戦の受付の切り替えと、一斉リセットは、いつでも押せる） */
export function canApply(p: HostProgress, command: HostCommand): boolean {
  switch (command) {
    case 'STOP_REMATCH':
      return p.rematchOpen
    case 'OPEN_REMATCH':
      return !p.rematchOpen
    case 'RESET':
      return true
    default:
      return TRANSITIONS[command].from.includes(p.phase)
  }
}

export type ApplyContext = {
  /** 親機の現在時刻（ミリ秒） */
  now: number
  /** 一斉リセットで使う、新しい sessionId。いまの sessionId と違う値を渡す */
  newSessionId: string
}

export type ApplyResult = { ok: true; progress: HostProgress } | { ok: false; error: 'not_allowed' }

/** 管理画面の操作を適用する。押せないボタンは、状態を変えずに、失敗を返す。成功するたびに revision を 1 増やす */
export function applyCommand(
  p: HostProgress,
  command: HostCommand,
  ctx: ApplyContext,
): ApplyResult {
  if (!canApply(p, command)) return { ok: false, error: 'not_allowed' }
  const revision = p.revision + 1
  switch (command) {
    case 'STOP_REMATCH':
      return { ok: true, progress: { ...p, revision, rematchOpen: false } }
    case 'OPEN_REMATCH':
      return { ok: true, progress: { ...p, revision, rematchOpen: true } }
    case 'RESET':
      // フェーズ・タイマー・再戦の受付を初期化し、sessionId を更新する（参加者PCは、これを見て S01 に戻る）
      return { ok: true, progress: createHostProgress(ctx.newSessionId, revision) }
    case 'START_PRODUCTION':
      // ターンのタイマーは、ここから（§7.2）
      return {
        ok: true,
        progress: {
          ...p,
          revision,
          phase: 'PRODUCTION',
          turnStartedAt: ctx.now,
          turnEndsAt: ctx.now + TURN_DURATION_MS,
        },
      }
    default:
      // フェーズの遷移は、進行中の対戦を止めない（参加者PCが、次の操作の可否だけを変える。§5.3）
      return { ok: true, progress: { ...p, revision, phase: TRANSITIONS[command].to } }
  }
}

/** 配信する形（§8.1）。親機の現在時刻を付ける */
export const toProgressState = (p: HostProgress, now: number): ProgressState => ({
  ...p,
  serverTime: now,
})

/** 保存から読み戻す（親機の再起動。壊れていたら null） */
export function readHostProgress(v: unknown): HostProgress | null {
  // 保存に serverTime はない。検証のために、仮の値を入れる
  const state = readProgressState(typeof v === 'object' && v !== null ? { ...v, serverTime: 0 } : v)
  if (!state) return null
  const { phase, sessionId, revision, turnStartedAt, turnEndsAt, rematchOpen } = state
  return { phase, sessionId, revision, turnStartedAt, turnEndsAt, rematchOpen }
}

// --- 管理画面の表示（§7.1） ---

/** 次に押すボタン（§7.1「次に実行する操作」） */
const NEXT_COMMAND: Record<Phase, HostCommand> = {
  PREPARE: 'START_PRODUCTION',
  PRODUCTION: 'START_BATTLE',
  BATTLE: 'START_SHARING',
  SHARING: 'END',
  BUFFER: 'END',
  ENDED: 'RESET',
}

export type AdminView = {
  phase: Phase
  phaseLabel: string
  sessionId: string
  revision: number
  turnStartedAt: number | null
  turnEndsAt: number | null
  /** 終了予定までの残り（ミリ秒）。過ぎたら負の値（超過を表示する）。未開始は null */
  remainingMs: number | null
  rematchOpen: boolean
  nextCommand: HostCommand
  /** 押せるボタン */
  commands: Record<HostCommand, boolean>
  serverTime: number
}

export function adminView(p: HostProgress, now: number): AdminView {
  const commands = Object.fromEntries(HOST_COMMANDS.map((c) => [c, canApply(p, c)])) as Record<
    HostCommand,
    boolean
  >
  return {
    phase: p.phase,
    phaseLabel: PHASE_LABELS[p.phase],
    sessionId: p.sessionId,
    revision: p.revision,
    turnStartedAt: p.turnStartedAt,
    turnEndsAt: p.turnEndsAt,
    remainingMs: p.turnEndsAt === null ? null : p.turnEndsAt - now,
    rematchOpen: p.rematchOpen,
    nextCommand: NEXT_COMMAND[p.phase],
    commands,
    serverTime: now,
  }
}

/** 残り時間の表示（「12:34」。超過は「-1:05」）。未開始は「—」 */
export function formatRemaining(ms: number | null): string {
  if (ms === null) return '—'
  const sign = ms < 0 ? '-' : ''
  // 秒に満たない分は、切り上げる（0:00 になった瞬間が、終了予定）
  const total = Math.ceil(Math.abs(ms) / 1000)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${sign}${min}:${String(sec).padStart(2, '0')}`
}
