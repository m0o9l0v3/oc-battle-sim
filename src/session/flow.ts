// 画面の遷移（S01〜S12）。純粋な reducer `(session, action) → session`。ルーターのライブラリは使わない。
// 遷移の可否（戻れる画面、戻れない画面、S09 の完了条件）は、ここだけが持つ。仕様:
//   docs/01-experience/user-flow.md §5.11、§6、docs/06-ui/ui-design.md §7.0、docs/08-architecture/frontend.md §9.1
// 条件を満たさない操作は、状態をそのまま返す（無視する）。同じ入力から、同じ結果（乱数・時計なし）。
import { nextBlock } from '../fighter/editing.ts'
import { resolveName, STAT_KEYS, validateConfig } from '../fighter/index.ts'
import {
  MAX_MATCHES,
  type CharacterConfig,
  type MatchOutcome,
  type MatchRecord,
  type PlayerMetrics,
  type ScreenId,
  type StageData,
} from '../model/index.ts'
import { validateStage } from '../stage/index.ts'
import { DEFAULT_STATS } from '../fighter/index.ts'
import { createSession, lastMatch, nextMatchNo, type Session } from './state.ts'

export type FlowAction =
  | { type: 'START' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  /** 1P・2P の設定の更新（編集中の値）。S02・S03・S06（2P）・S09 だけ */
  | { type: 'SET_P1'; config: CharacterConfig }
  | { type: 'SET_P2'; config: CharacterConfig }
  /** S04 の「つぎへ」。検証（'match'）を通ったステージだけ確定する */
  | { type: 'CONFIRM_STAGE'; stage: StageData; presetId: string | null }
  /** S05 から、S03・S04 へ戻る（別々のボタン） */
  | { type: 'FIX_STATS' }
  | { type: 'FIX_STAGE' }
  /** S06 の「対戦開始」、S09 の「再戦」 */
  | { type: 'BEGIN_MATCH' }
  /** 勝敗の確定。S07 は S08 へ、S10 は S11 へ */
  | {
      type: 'FINISH_MATCH'
      outcome: MatchOutcome
      durationSec: number
      p1?: PlayerMetrics
      p2?: PlayerMetrics
    }
  /** S08・S11 の「設定を変えて再戦」「もう一度設計する」 */
  | { type: 'REDESIGN' }
  /** S11 の「おわる」 */
  | { type: 'END' }
  /** 「もちかえる」（親機の指示。対戦中は、対戦が終わってから）。S12 へ */
  | { type: 'SHARE' }
  /** 持ち帰りの設定を復元したあとの「ふたりで あそぶ」。S01 から S06 へ（take-home-share.md §9.2） */
  | { type: 'IMPORT_PLAY' }
  /** 持ち帰りカードの印刷を、親機が受け付けた（S12 だけ。1 回だけ）。S12 は待機の画面になる */
  | { type: 'PRINT_ACCEPTED'; number: number }
  /** リセット（どの画面からでも。対戦中も中断）。全データを破棄して S01 へ */
  | { type: 'RESET' }

/** 能力値を、編集してよい画面（途中の値を持てる）。それ以外へ出るときは、未完成の値を、確定した値へ戻す */
const EDITING_SCREENS: readonly ScreenId[] = ['S02', 'S03', 'S04', 'S06', 'S09']

/**
 * 未完成の設定（合計が 20 でないなど）を、確定した値へ戻す: 直前の戦の同じ側の能力値、なければ標準（5/5/5/5）。
 * 編集の途中のまま、編集しない画面へ出ても、未完成の値が、そこへ持ち込まれない（再開で、保存が捨てられない。
 * 持ち帰り用QRにも、検証を通る値だけが入る。user-flow.md §6.1、ui-design.md §7.11.1）
 */
function settle(s: Session): Session {
  const last = s.data.matches.at(-1)
  const fix = (cfg: CharacterConfig, prev?: CharacterConfig): CharacterConfig =>
    validateConfig(cfg, 'match').ok ? cfg : { ...cfg, stats: { ...(prev?.stats ?? DEFAULT_STATS) } }
  const p1 = fix(s.data.p1, last?.p1Config)
  const p2 = fix(s.data.p2, last?.p2Config)
  return p1 === s.data.p1 && p2 === s.data.p2 ? s : { ...s, data: { ...s.data, p1, p2 } }
}

const go = (s: Session, screen: ScreenId, patch: Partial<Session> = {}): Session => {
  const next = { ...s, ...patch, data: { ...(patch.data ?? s.data), screen } }
  return EDITING_SCREENS.includes(screen) ? next : settle(next)
}

/** 能力値が、1 つ以上変わっているか */
export function statsChanged(a: CharacterConfig, b: CharacterConfig): boolean {
  return STAT_KEYS.some((k) => a.stats[k] !== b.stats[k])
}

/** 対戦を始められる設定か（合計ポイント・範囲・名前の検証。'match'） */
const matchReady = (s: Session) =>
  validateConfig(s.data.p1, 'match').ok &&
  validateConfig(s.data.p2, 'match').ok &&
  validateStage(s.data.stage, 'match').ok

/** S09 の「再戦」に進める条件: 1P の能力値が直前の戦から 1 つ以上変わっている。1P・2P とも、合計を使い切っている */
export function canRematch(s: Session): boolean {
  const last = lastMatch(s)
  return !!last && statsChanged(s.data.p1, last.p1Config) && matchReady(s)
}

/** S09 で、直前の戦の設定へ戻す（変更を破棄する）。外観・名前・ステージは、変えていない */
function discardRedesign(s: Session): Session {
  const last = lastMatch(s)
  if (!last) return s
  return {
    ...s,
    data: {
      ...s.data,
      p1: { ...s.data.p1, stats: { ...last.p1Config.stats } },
      p2: { ...s.data.p2, stats: { ...last.p2Config.stats } },
    },
  }
}

function begin(s: Session, to: 'S07' | 'S10'): Session {
  if (!matchReady(s)) return s
  const { p1, p2, stage } = s.data
  // 開始時点の設定を固定する（対戦中に、編集で変わらない）
  return go(s, to, {
    current: {
      p1: structuredClone(p1),
      p2: structuredClone(p2),
      stage: structuredClone(stage),
    },
  })
}

function finish(s: Session, a: Extract<FlowAction, { type: 'FINISH_MATCH' }>): Session {
  const screen = s.data.screen
  if ((screen !== 'S07' && screen !== 'S10') || !s.current) return s
  const record: MatchRecord = {
    schemaVersion: 1,
    matchNo: nextMatchNo(s),
    p1Config: s.current.p1,
    p2Config: s.current.p2,
    stage: s.current.stage,
    outcome: a.outcome,
    durationSec: a.durationSec,
    ...(a.p1 ? { p1: a.p1 } : {}),
    ...(a.p2 ? { p2: a.p2 } : {}),
  }
  // 既存の戦は、上書きしない。上限を超えたら、古い戦から捨てる（matchNo は戻さない）
  const matches = [...s.data.matches, record].slice(-MAX_MATCHES)
  return {
    ...s,
    current: null,
    data: { ...s.data, matches, screen: screen === 'S07' ? 'S08' : 'S11' },
  }
}

export function reduceFlow(s: Session, a: FlowAction): Session {
  const screen = s.data.screen
  switch (a.type) {
    case 'RESET':
      return createSession()

    case 'SHARE':
      // 対戦中（S07・S10）は、対戦が終わってから
      return screen === 'S07' || screen === 'S10' || screen === 'S12'
        ? s
        : go(s, 'S12', { returnToPractice: false })

    case 'PRINT_ACCEPTED':
      return screen === 'S12' && s.data.printNumber === undefined
        ? { ...s, data: { ...s.data, printNumber: a.number } }
        : s

    case 'IMPORT_PLAY':
      return screen === 'S01' && matchReady(s) ? go(s, 'S06') : s

    case 'START':
      return screen === 'S01' ? go(s, 'S02') : s

    case 'SET_P1':
      return screen === 'S02' || screen === 'S03' || screen === 'S09'
        ? { ...s, data: { ...s.data, p1: a.config } }
        : s

    case 'SET_P2':
      return screen === 'S06' || screen === 'S09' ? { ...s, data: { ...s.data, p2: a.config } } : s

    case 'CONFIRM_STAGE': {
      if (screen !== 'S04') return s
      const r = validateStage(a.stage, 'match')
      if (!r.ok) return s
      return go(s, 'S05', {
        returnToPractice: false,
        data: { ...s.data, stage: r.stage, stagePresetId: a.presetId, screen: 'S05' },
      })
    }

    case 'FIX_STATS':
      return screen === 'S05' ? go(s, 'S03', { returnToPractice: true }) : s

    case 'FIX_STAGE':
      return screen === 'S05' ? go(s, 'S04') : s

    case 'BEGIN_MATCH':
      // S06 に、戦の記録があるのは、再戦の途中で更新（再開）したとき。再戦（S10）として、続ける
      if (screen === 'S06') return begin(s, s.data.matches.length > 0 ? 'S10' : 'S07')
      if (screen === 'S09') return canRematch(s) ? begin(s, 'S10') : s
      return s

    case 'FINISH_MATCH':
      return finish(s, a)

    case 'REDESIGN':
      return screen === 'S08' || screen === 'S11' ? go(s, 'S09') : s

    case 'END':
      return screen === 'S11' ? go(s, 'S12') : s

    case 'NEXT':
      switch (screen) {
        case 'S02':
          return go(s, 'S03', {
            data: {
              ...s.data,
              p1: { ...s.data.p1, name: resolveName(s.data.p1.name, 'p1') },
              screen: 'S03',
            },
          })
        case 'S03':
          // ポイントを使い切っていないと、進めない
          if (nextBlock(s.data.p1.stats)) return s
          return s.returnToPractice ? go(s, 'S05', { returnToPractice: false }) : go(s, 'S04')
        case 'S05':
          return matchReady(s) ? go(s, 'S06') : s
        default:
          return s
      }

    case 'BACK':
      switch (screen) {
        case 'S03':
          return go(s, 'S02', { returnToPractice: false })
        case 'S04':
          return go(s, 'S03')
        case 'S06':
          // 再戦の途中で、再開したときは、S05 ではなく、S09（設定を変えて作り直す）へ
          return go(s, s.data.matches.length > 0 ? 'S09' : 'S05')
        case 'S09': {
          // 変更を破棄して、結果を見直す。第 1 戦の直後は S08、再戦のあとは S11
          const back = discardRedesign(s)
          return go(back, s.data.matches.length <= 1 ? 'S08' : 'S11')
        }
        default:
          // S01、S02、S05（S03・S04 へは FIX_*）、S07・S08・S10・S11・S12 は、戻れない
          return s
      }
  }
}

/** 更新（再開）で復元する画面。対戦中だった場合は、S06 から（対戦中の途中状態は復元しない） */
export const restoreScreen = (screen: ScreenId): ScreenId =>
  screen === 'S07' || screen === 'S10' ? 'S06' : screen

/** 画面ごとの「戻る」の可否（ボタンを出すか） */
export function canGoBack(s: Session): boolean {
  const screen = s.data.screen
  return screen === 'S03' || screen === 'S04' || screen === 'S06' || screen === 'S09'
}
