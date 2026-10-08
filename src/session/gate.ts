// 親機の進行状態による、操作の可否（画面ごと・操作ごと）。純粋な関数。
// 仕様: docs/01-experience/event-control.md §5.3、§6、§12、docs/08-architecture/frontend.md §8.2（H2）
//
// 新しく始める操作だけを止める。進行中の対戦（S07・S10）は、フェーズが変わっても止めない。
// 勝敗の確定（FINISH_MATCH）とリセットは、いつでも通す
import type { ProgressState, ScreenId } from '../model/index.ts'
import { offersTakeHome, permissionsOf, type Operation } from '../progress/index.ts'
import type { FlowAction } from './flow.ts'
import type { Session } from './state.ts'

/** 親機から分かっていること */
export type HostContext = {
  /** 操作の可否に使う進行状態。null は「すべて許可」（未取得・通信不能が続いた。§6.2、§10） */
  live: ProgressState | null
  /** 最後に取得できた進行状態（「もちかえる」ボタンを出すかに使う。通信が切れても、残す） */
  last: ProgressState | null
}

/** 親機がない（持ち帰り後の GitHub Pages）・まだ分からないとき */
export const NO_HOST: HostContext = { live: null, last: null }

/**
 * 画面の中の操作（設定の編集・つぎへ・もどる）に要る操作の種類。null は、画面そのものは止めない
 * （S01 は「はじめる」だけを止める。S07・S10 は対戦中で止めない。S11・S12 は、ボタンごとに決める）。
 * S09 は fighter（再戦の受付が止まっても、もどって S11 の「おわる」へ行ける）。再戦の開始だけを rematch で止める
 */
const SCREEN_OPERATION: Record<ScreenId, Operation | null> = {
  S01: null,
  S02: 'fighter',
  S03: 'fighter',
  S04: 'stage',
  S05: 'test',
  S06: 'battle',
  S07: null,
  S08: 'battle',
  S09: 'fighter',
  S10: null,
  S11: null,
  S12: null,
}

/** 「もちかえる」（親機の指示。§5.3）。表の操作の種類とは別に、フェーズで決める */
type Requirement = Operation | 'takeHome' | null

/** 操作に要るもの。null は、いつでも通す */
export function requirementOf(s: Session, a: FlowAction): Requirement {
  const screen = s.data.screen
  switch (a.type) {
    case 'FINISH_MATCH':
    case 'RESET':
      return null
    case 'SHARE':
      return 'takeHome'
    case 'START':
      return 'fighter'
    case 'REDESIGN':
      return 'rematch'
    case 'END':
      return 'share'
    case 'BEGIN_MATCH':
      // S06 の対戦開始は、第1戦。再戦の途中で更新（再開）した S06 は、再戦（S10）になる
      if (screen === 'S09') return 'rematch'
      return s.data.matches.length > 0 ? 'rematch' : 'battle'
    default:
      return SCREEN_OPERATION[screen]
  }
}

function allows(ctx: HostContext, r: Requirement): boolean {
  if (r === null) return true
  if (r === 'takeHome') return offersTakeHome(ctx.last)
  return permissionsOf(ctx.live)[r]
}

/** 操作を通すか。通さない操作は、状態を変えない（reducer に渡さない） */
export const isAllowed = (ctx: HostContext, s: Session, a: FlowAction): boolean =>
  allows(ctx, requirementOf(s, a))

/** いまの画面の中の操作が、止まっているか（画面を操作できなくし、理由を出す） */
export function screenBlocked(ctx: HostContext, screen: ScreenId): boolean {
  return !allows(ctx, SCREEN_OPERATION[screen])
}

/** 操作の種類ごとに、止まっているか（ボタンを押せなくし、理由を出す） */
export const operationBlocked = (ctx: HostContext, op: Operation): boolean => !allows(ctx, op)

/** 操作が止まっていれば、その理由。止まっていなければ undefined */
export const operationBlockReason = (ctx: HostContext, op: Operation): string | undefined =>
  operationBlocked(ctx, op) ? blockReason(ctx, op) : undefined

/** いまの画面が止まっていれば、その理由。止まっていなければ undefined */
export function screenBlockReason(ctx: HostContext, screen: ScreenId): string | undefined {
  const op = SCREEN_OPERATION[screen]
  return op && operationBlocked(ctx, op) ? blockReason(ctx, op) : undefined
}

// --- 理由の表示（§6.2: 日本語で短く） ---

export const BLOCK_REASONS = {
  prepare: 'しんこうが はじまるまで まってね',
  sharing: 'いまは もちかえる じかん。「もちかえる」を おしてね',
  ended: 'きょうの たいけんは おしまい。ありがとう！',
  rematch: 'いまは さいせんは できません',
  other: 'いまは できません',
  takeHomeInMatch: 'たいせんが おわるまで まってね',
} as const

/** 止まっている理由。フェーズで決まるものを先に、再戦は、受付の停止（§6.3）を含めて */
export function blockReason(ctx: HostContext, op: Operation): string {
  switch (ctx.live?.phase) {
    case 'PREPARE':
      return BLOCK_REASONS.prepare
    case 'SHARING':
      return BLOCK_REASONS.sharing
    case 'ENDED':
      return BLOCK_REASONS.ended
  }
  return op === 'rematch' ? BLOCK_REASONS.rematch : BLOCK_REASONS.other
}
