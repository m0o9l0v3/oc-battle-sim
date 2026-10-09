// 親機の進行状態の管理（状態機械）。I/O・時計・乱数を持たない純粋関数。時刻と新しい sessionId は、引数で受け取る。
// 仕様: docs/01-experience/event-control.md §5.2（遷移）、§6.3（再戦の受付）、§7（管理画面）、§7.5（時間の予定と調整）、§9.1（一斉リセット）
//
// ここで扱うのは、親機の進行状態だけ。参加者のステージ・設定・結果は、持たない（§11）
import type { Phase, ProgressState } from '../model/progress.ts'
import { PHASE_LABELS } from './phase.ts'
import { readProgressState } from './read.ts'

const MINUTE = 60 * 1000

/**
 * フェーズごとの予定の長さ（ミリ秒）。管理画面から、いつでも変えられる（§7.5）。
 * 既定は、制作 7 分・対戦 10 分・持ち帰り 2 分（user-flow.md §7 の目安。合計 19 分）
 */
export type TimePlan = { production: number; battle: number; sharing: number }

export const DEFAULT_PLAN: TimePlan = {
  production: 7 * MINUTE,
  battle: 10 * MINUTE,
  sharing: 2 * MINUTE,
}

/** 予定の長さの範囲（1 つのフェーズ）。1 分〜60 分 */
export const PLAN_LIMITS = { min: 1 * MINUTE, max: 60 * MINUTE } as const

/** 1 回の時間の調整の上限（±60 分） */
export const MAX_ADJUST_MS = 60 * MINUTE

/** 予定の長さを持つフェーズと、その順（この順に、ターンの終了予定を見積もる） */
const PLANNED: readonly { phase: Phase; key: keyof TimePlan }[] = [
  { phase: 'PRODUCTION', key: 'production' },
  { phase: 'BATTLE', key: 'battle' },
  { phase: 'SHARING', key: 'sharing' },
]

/**
 * 親機が持つ状態。配信するのは ProgressState の 7 項目だけ（toProgressState）。
 * フェーズの時刻と予定（phaseStartedAt・phaseEndsAt・plan）は、親機の中だけで使う（管理画面の表示と調整）
 */
export type HostProgress = Omit<ProgressState, 'serverTime'> & {
  /** いまのフェーズに入った時刻。PREPARE は null */
  phaseStartedAt: number | null
  /** いまのフェーズの終了予定。予定の長さがないフェーズ（PREPARE・BUFFER・ENDED）は null */
  phaseEndsAt: number | null
  plan: TimePlan
}

/** ターンの長さの既定。`制作開始` から 19 分（導入の 1 分を含めて、ターン全体が 0:00〜20:00。§7.2） */
export const TURN_DURATION_MS = DEFAULT_PLAN.production + DEFAULT_PLAN.battle + DEFAULT_PLAN.sharing

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
 * 遅れた組がいなければ、SHARING から BUFFER を経ずに、直接「終了」できる。
 * 「持ち帰り開始」は、制作中からも押せる（予定の時間までに終わらないとき、対戦を飛ばして、持ち帰りへ進める。§7.5）
 */
const TRANSITIONS: Record<
  'START_PRODUCTION' | 'START_BATTLE' | 'START_SHARING' | 'TO_BUFFER' | 'END',
  { from: readonly Phase[]; to: Phase }
> = {
  START_PRODUCTION: { from: ['PREPARE'], to: 'PRODUCTION' },
  START_BATTLE: { from: ['PRODUCTION'], to: 'BATTLE' },
  START_SHARING: { from: ['PRODUCTION', 'BATTLE'], to: 'SHARING' },
  TO_BUFFER: { from: ['SHARING'], to: 'BUFFER' },
  END: { from: ['SHARING', 'BUFFER'], to: 'ENDED' },
}

/** 起動して、保存がないときの状態。一斉リセットのあとと同じ（§9.1）。予定の長さは、引き継げる */
export function createHostProgress(
  sessionId: string,
  revision = 0,
  plan: TimePlan = DEFAULT_PLAN,
): HostProgress {
  return {
    phase: 'PREPARE',
    sessionId,
    revision,
    turnStartedAt: null,
    turnEndsAt: null,
    rematchOpen: true,
    phaseStartedAt: null,
    phaseEndsAt: null,
    plan,
  }
}

const plannedIndex = (phase: Phase) => PLANNED.findIndex((x) => x.phase === phase)

/** いまのフェーズの終了予定に、あとのフェーズの予定の長さを足して、ターンの終了予定を見積もる */
function projectTurnEnd(phase: Phase, phaseEndsAt: number, plan: TimePlan): number {
  return PLANNED.slice(plannedIndex(phase) + 1).reduce((t, x) => t + plan[x.key], phaseEndsAt)
}

/**
 * フェーズに入る。予定の長さがあるフェーズは、いまから予定の長さで、フェーズの終了予定を決め、ターンの終了予定を見積もり直す
 * （早めに・遅れて進んでも、残りのフェーズの予定に合わせる）。BUFFER・ENDED は、ターンの終了予定を変えない
 */
function enter(p: HostProgress, phase: Phase, now: number, revision: number): HostProgress {
  const i = plannedIndex(phase)
  if (i < 0) return { ...p, revision, phase, phaseStartedAt: now, phaseEndsAt: null }
  const phaseEndsAt = now + p.plan[PLANNED[i]!.key]
  return {
    ...p,
    revision,
    phase,
    phaseStartedAt: now,
    phaseEndsAt,
    turnEndsAt: projectTurnEnd(phase, phaseEndsAt, p.plan),
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

/** 管理画面の操作。ボタン（HostCommand）と、時間の調整・予定の変更（§7.5） */
export type HostAction =
  | { type: HostCommand }
  /** いまのフェーズの終了予定を、ずらす（ターンの終了予定も、同じだけ） */
  | { type: 'ADJUST_TIME'; deltaMs: number }
  /** 予定の長さを変える。いまのフェーズにも、すぐに反映する */
  | { type: 'SET_PLAN'; plan: TimePlan }

export type ApplyResult = { ok: true; progress: HostProgress } | { ok: false; error: 'not_allowed' }

/** 時間をずらせるか（いまのフェーズに、終了予定があるとき） */
export const canAdjustTime = (p: HostProgress): boolean => p.phaseEndsAt !== null

/** 予定の長さの検証（1 秒単位、PLAN_LIMITS の範囲） */
export function isValidPlan(v: unknown): v is TimePlan {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return PLANNED.every(({ key }) => {
    const ms = r[key]
    return (
      typeof ms === 'number' &&
      Number.isInteger(ms) &&
      ms % 1000 === 0 &&
      ms >= PLAN_LIMITS.min &&
      ms <= PLAN_LIMITS.max
    )
  })
}

const isValidDelta = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isInteger(v) &&
  v % 1000 === 0 &&
  v !== 0 &&
  Math.abs(v) <= MAX_ADJUST_MS

/** 管理画面から届いた本文を、操作に直す。形が違えば null */
export function readHostAction(v: unknown): HostAction | null {
  if (typeof v !== 'object' || v === null) return null
  const { command, deltaMs, plan } = v as Record<string, unknown>
  if (command === 'ADJUST_TIME') return isValidDelta(deltaMs) ? { type: command, deltaMs } : null
  if (command === 'SET_PLAN') {
    if (!isValidPlan(plan)) return null
    // 余分なキーは、持たない
    return {
      type: command,
      plan: { production: plan.production, battle: plan.battle, sharing: plan.sharing },
    }
  }
  return isHostCommand(command) ? { type: command } : null
}

/**
 * 時間をずらしたあとの終了予定。延ばすときは、そのまま足す。
 * 縮めるときは、いまより前にはしない（残り 0:00 まで）。ただし、すでに過ぎた終了予定は、動かさない
 * （縮める操作で、終了予定が後ろへ動いて、ターンが延びないように）
 */
function adjustedEnd(end: number, deltaMs: number, now: number): number {
  if (deltaMs > 0) return end + deltaMs
  return Math.max(end + deltaMs, Math.min(end, now))
}

/** 管理画面のボタンを適用する（applyAction の短縮形） */
export const applyCommand = (p: HostProgress, command: HostCommand, ctx: ApplyContext) =>
  applyAction(p, { type: command }, ctx)

/**
 * 管理画面の操作を適用する。できない操作は、状態を変えずに、失敗を返す。状態が変わるたびに revision を 1 増やす。
 * フェーズの遷移は、進行中の対戦を止めない（参加者PCが、次の操作の可否だけを変える。§5.3）
 */
export function applyAction(p: HostProgress, a: HostAction, ctx: ApplyContext): ApplyResult {
  const revision = p.revision + 1
  switch (a.type) {
    case 'ADJUST_TIME': {
      if (p.phaseEndsAt === null || !isValidDelta(a.deltaMs))
        return { ok: false, error: 'not_allowed' }
      const phaseEndsAt = adjustedEnd(p.phaseEndsAt, a.deltaMs, ctx.now)
      const moved = phaseEndsAt - p.phaseEndsAt
      if (moved === 0) return { ok: true, progress: p }
      return {
        ok: true,
        progress: {
          ...p,
          revision,
          phaseEndsAt,
          turnEndsAt: p.turnEndsAt === null ? null : p.turnEndsAt + moved,
        },
      }
    }
    case 'SET_PLAN': {
      if (!isValidPlan(a.plan)) return { ok: false, error: 'not_allowed' }
      const next: HostProgress = { ...p, revision, plan: a.plan }
      const i = plannedIndex(p.phase)
      if (i < 0 || p.phaseStartedAt === null) return { ok: true, progress: next }
      // いまのフェーズの終了予定を、フェーズに入った時刻からの、新しい長さで決め直す。
      // 経過より短くしたら、超過として表示する（いまに合わせて、終了予定を後ろへ動かさない）
      const phaseEndsAt = p.phaseStartedAt + a.plan[PLANNED[i]!.key]
      return {
        ok: true,
        progress: {
          ...next,
          phaseEndsAt,
          turnEndsAt: projectTurnEnd(p.phase, phaseEndsAt, a.plan),
        },
      }
    }
  }
  const command = a.type
  if (!canApply(p, command)) return { ok: false, error: 'not_allowed' }
  switch (command) {
    case 'STOP_REMATCH':
      return { ok: true, progress: { ...p, revision, rematchOpen: false } }
    case 'OPEN_REMATCH':
      return { ok: true, progress: { ...p, revision, rematchOpen: true } }
    case 'RESET':
      // フェーズ・タイマー・再戦の受付を初期化し、sessionId を更新する（参加者PCは、これを見て S01 に戻る）。
      // 予定の長さは、次のターンへ引き継ぐ
      return { ok: true, progress: createHostProgress(ctx.newSessionId, revision, p.plan) }
    case 'START_PRODUCTION':
      // ターンのタイマーは、ここから（§7.2）
      return {
        ok: true,
        progress: { ...enter(p, 'PRODUCTION', ctx.now, revision), turnStartedAt: ctx.now },
      }
    default:
      return { ok: true, progress: enter(p, TRANSITIONS[command].to, ctx.now, revision) }
  }
}

/** 配信する形（§8.1 の 7 項目だけ）。親機の現在時刻を付ける。フェーズの時刻と予定は、配信しない */
export const toProgressState = (p: HostProgress, now: number): ProgressState => ({
  phase: p.phase,
  sessionId: p.sessionId,
  revision: p.revision,
  turnStartedAt: p.turnStartedAt,
  turnEndsAt: p.turnEndsAt,
  rematchOpen: p.rematchOpen,
  serverTime: now,
})

const isTimeOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)

/**
 * 保存から読み戻す（親機の再起動。壊れていたら null）。
 * フェーズの時刻・予定がない保存（この機能より前の保存）も読める（時刻は null、予定は既定）
 */
export function readHostProgress(v: unknown): HostProgress | null {
  // 保存に serverTime はない。検証のために、仮の値を入れる
  const state = readProgressState(typeof v === 'object' && v !== null ? { ...v, serverTime: 0 } : v)
  if (!state) return null
  const { phase, sessionId, revision, turnStartedAt, turnEndsAt, rematchOpen } = state
  const r = v as Record<string, unknown>
  const savedStartedAt = r.phaseStartedAt ?? null
  const savedEndsAt = r.phaseEndsAt ?? null
  if (!isTimeOrNull(savedStartedAt) || !isTimeOrNull(savedEndsAt)) return null
  let phaseStartedAt: number | null = savedStartedAt
  let phaseEndsAt: number | null = savedEndsAt
  if (r.plan !== undefined && !isValidPlan(r.plan)) return null
  const saved = r.plan === undefined ? DEFAULT_PLAN : (r.plan as TimePlan)
  const plan = { production: saved.production, battle: saved.battle, sharing: saved.sharing }
  // フェーズの時刻がない保存（この機能より前）で、予定の長さがあるフェーズの途中なら、ターンの終了予定から見積もる
  // （再起動の直後から、時間の調整と、予定の変更を使えるように）
  const i = plannedIndex(phase)
  if (i >= 0 && phaseEndsAt === null && turnEndsAt !== null) {
    phaseEndsAt = PLANNED.slice(i + 1).reduce((t, x) => t - plan[x.key], turnEndsAt)
    phaseStartedAt ??= phaseEndsAt - plan[PLANNED[i]!.key]
  }
  return {
    phase,
    sessionId,
    revision,
    turnStartedAt,
    turnEndsAt,
    rematchOpen,
    phaseStartedAt,
    phaseEndsAt,
    plan,
  }
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
  /** ターンの終了予定までの残り（ミリ秒）。過ぎたら負の値（超過を表示する）。未開始は null */
  remainingMs: number | null
  phaseStartedAt: number | null
  phaseEndsAt: number | null
  /** いまのフェーズの終了予定までの残り。予定がないフェーズは null */
  phaseRemainingMs: number | null
  plan: TimePlan
  rematchOpen: boolean
  nextCommand: HostCommand
  /** 押せるボタン */
  commands: Record<HostCommand, boolean>
  /** 時間をずらせるか */
  canAdjustTime: boolean
  serverTime: number
}

export function adminView(p: HostProgress, now: number): AdminView {
  const commands = Object.fromEntries(HOST_COMMANDS.map((c) => [c, canApply(p, c)])) as Record<
    HostCommand,
    boolean
  >
  const remainingMs = p.turnEndsAt === null ? null : p.turnEndsAt - now
  // 制作中・対戦中に、ターンの終了予定を過ぎたら、次の操作は「持ち帰り開始」（§7.5）
  const overdue =
    remainingMs !== null && remainingMs <= 0 && (p.phase === 'PRODUCTION' || p.phase === 'BATTLE')
  return {
    phase: p.phase,
    phaseLabel: PHASE_LABELS[p.phase],
    sessionId: p.sessionId,
    revision: p.revision,
    turnStartedAt: p.turnStartedAt,
    turnEndsAt: p.turnEndsAt,
    remainingMs,
    phaseStartedAt: p.phaseStartedAt,
    phaseEndsAt: p.phaseEndsAt,
    phaseRemainingMs: p.phaseEndsAt === null ? null : p.phaseEndsAt - now,
    plan: p.plan,
    rematchOpen: p.rematchOpen,
    nextCommand: overdue ? 'START_SHARING' : NEXT_COMMAND[p.phase],
    commands,
    canAdjustTime: canAdjustTime(p),
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
