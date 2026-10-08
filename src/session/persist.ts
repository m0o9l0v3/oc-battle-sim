// セッションの保存と復元。仕様: docs/08-architecture/data-model.md §6.2〜§6.6、docs/08-architecture/frontend.md §9.1
//  - 保存先は localStorage の 1 キー。core は `localStorage` を直接参照せず、`StorageLike` を受け取る
//  - 保存・読み込み・破棄は、例外を投げない。保存が使えなくても、体験は止めない（メモリだけで続ける）
//  - 読み込んだ値は、検証してから使う。1 つでも失敗したら、保存全体を捨てて S01 から始める
import { validateConfig } from '../fighter/index.ts'
import {
  MAX_MATCHES,
  SESSION_STORAGE_KEY,
  type CharacterConfig,
  type MatchOutcome,
  type MatchRecord,
  type ScreenId,
  type SessionData,
  type SessionSnapshot,
  type StageData,
} from '../model/index.ts'
import { isPlayerMetrics } from '../report/index.ts'
import { validateStage } from '../stage/index.ts'
import { decodeTakeHome, type DecodeFailure } from '../share/index.ts'
import { restoreScreen } from './flow.ts'
import { sessionFromData, type Session } from './state.ts'

const SCREENS: readonly ScreenId[] = [
  'S01',
  'S02',
  'S03',
  'S04',
  'S05',
  'S06',
  'S07',
  'S08',
  'S09',
  'S10',
  'S11',
  'S12',
]

/** 編集中の値を保存する画面。設定の合計が 20 でなくても（途中の状態）、読み込める（'editing'）。
 * S06 は、2P の能力値を変えている途中があるため、加える（data-model.md §6.4 の表を広げた） */
const EDITING_SCREENS: readonly ScreenId[] = ['S02', 'S03', 'S04', 'S06', 'S09']

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const REASONS = ['stocks', 'timeup_stocks', 'timeup_damage', 'draw_double_ko', 'draw_timeup']

function readOutcome(v: unknown): MatchOutcome | null {
  if (!isRecord(v)) return null
  const { winner, reason } = v
  if (winner !== 'p1' && winner !== 'p2' && winner !== null) return null
  if (typeof reason !== 'string' || !REASONS.includes(reason)) return null
  return { winner, reason: reason as MatchOutcome['reason'] }
}

function readMatch(v: unknown): MatchRecord | null {
  if (!isRecord(v)) return null
  if (v.schemaVersion !== 1) return null
  if (typeof v.matchNo !== 'number' || !Number.isInteger(v.matchNo) || v.matchNo < 1) return null
  if (typeof v.durationSec !== 'number' || !Number.isFinite(v.durationSec) || v.durationSec < 0)
    return null
  const outcome = readOutcome(v.outcome)
  if (!outcome) return null
  const p1 = validateConfig(v.p1Config, 'import')
  const p2 = validateConfig(v.p2Config, 'import')
  const stage = validateStage(v.stage, 'import')
  if (!p1.ok || !p2.ok || !stage.ok) return null
  const record: MatchRecord = {
    schemaVersion: 1,
    matchNo: v.matchNo,
    p1Config: p1.config,
    p2Config: p2.config,
    stage: stage.stage,
    outcome,
    durationSec: v.durationSec,
  }
  // 指標（battle-report.md §6）。持っていれば、形を確かめる。壊れていたら、保存全体を捨てる。
  // 指標を持たない記録（指標の記録ができる前の保存）も、読み込める
  if (v.p1 !== undefined) {
    if (!isPlayerMetrics(v.p1)) return null
    record.p1 = v.p1
  }
  if (v.p2 !== undefined) {
    if (!isPlayerMetrics(v.p2)) return null
    record.p2 = v.p2
  }
  return record
}

/** 保存の内容を検証し、正規化した SessionData を返す。1 つでも失敗したら null */
export function readSessionData(v: unknown): SessionData | null {
  if (!isRecord(v)) return null
  const screen = v.screen
  if (typeof screen !== 'string' || !SCREENS.includes(screen as ScreenId)) return null
  const editing = EDITING_SCREENS.includes(screen as ScreenId)
  const p1 = validateConfig(v.p1, editing ? 'editing' : 'import')
  const p2 = validateConfig(v.p2, editing ? 'editing' : 'import')
  // 確定したステージだけを保存する（編集中の作業用のステージは、保存しない）ので、どの画面でも、全規則を通る
  const stage = validateStage(v.stage, 'import')
  if (!p1.ok || !p2.ok || !stage.ok) return null
  const presetId = v.stagePresetId
  if (presetId !== null && typeof presetId !== 'string') return null
  if (!Array.isArray(v.matches) || v.matches.length > MAX_MATCHES) return null
  const matches: MatchRecord[] = []
  for (const m of v.matches) {
    const r = readMatch(m)
    if (!r) return null
    // matchNo は、昇順
    if (matches.length > 0 && r.matchNo <= matches[matches.length - 1]!.matchNo) return null
    matches.push(r)
  }
  const data: SessionData = {
    p1: p1.config,
    p2: p2.config,
    stage: stage.stage,
    stagePresetId: presetId,
    matches,
    screen: restoreScreen(screen as ScreenId),
  }
  // S05 から S03 へ戻っている途中だけ、持つ
  if (v.returnToPractice === true && screen === 'S03') data.returnToPractice = true
  return data
}

export function readSnapshot(v: unknown): SessionSnapshot | null {
  if (!isRecord(v) || v.schemaVersion !== 1) return null
  if (v.sessionId !== null && typeof v.sessionId !== 'string') return null
  const data = readSessionData(v.data)
  return data ? { schemaVersion: 1, sessionId: v.sessionId, data } : null
}

// --- 保存先 ---

/** localStorage の、使う部分 */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface SessionRepository {
  /** 保存がない・読めない・検証に通らないときは null。例外を投げない */
  load(): SessionSnapshot | null
  /** 失敗しても、例外を投げない */
  save(snapshot: SessionSnapshot): void
  /** 保存を破棄する。例外を投げない */
  clear(): void
}

/** 保存先が使えない環境（storage が undefined や、例外）でも、何もしない（メモリだけで続ける） */
export function createRepository(
  storage: StorageLike | undefined,
  log: (e: unknown) => void = () => {},
): SessionRepository {
  return {
    load() {
      try {
        const raw = storage?.getItem(SESSION_STORAGE_KEY)
        if (!raw) return null
        return readSnapshot(JSON.parse(raw))
      } catch (e) {
        log(e)
        return null
      }
    },
    save(snapshot) {
      if (!storage) return
      // 容量超過のときは、戦の古いものから減らして、1 回だけ再試行する。それでも失敗なら、諦める
      const attempt = (s: SessionSnapshot) =>
        storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s))
      try {
        attempt(snapshot)
      } catch (e) {
        log(e)
        try {
          const half = snapshot.data.matches.slice(Math.ceil(snapshot.data.matches.length / 2))
          attempt({ ...snapshot, data: { ...snapshot.data, matches: half } })
        } catch (e2) {
          log(e2)
        }
      }
    },
    clear() {
      try {
        storage?.removeItem(SESSION_STORAGE_KEY)
      } catch (e) {
        log(e)
      }
    },
  }
}

export const toSnapshot = (s: Session, sessionId: string | null = null): SessionSnapshot => ({
  schemaVersion: 1,
  sessionId,
  data: s.returnToPractice ? { ...s.data, returnToPractice: true } : s.data,
})

// --- 起動 ---

/** URL に `?reset` があるか（個別リセット用のブックマーク。復元より前に判定する） */
export const hasResetFlag = (search: string): boolean => new URLSearchParams(search).has('reset')

/** `reset` を取り除いた、URL の検索部分（残すと、その後の通常の更新が、またリセットになる） */
export function stripResetFlag(search: string): string {
  // URLSearchParams で作り直すと、`?dev` が `?dev=` になる。元の書き方のまま、reset だけを除く
  const rest = search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part !== '' && decodeURIComponent(part.split('=')[0]!) !== 'reset')
  return rest.length > 0 ? `?${rest.join('&')}` : ''
}

export type BootResult = {
  session: Session
  resetDone: boolean
  /** 保存にあった、親機の sessionId（なければ null） */
  sessionId: string | null
  /** 保存から復元したか */
  restored: boolean
}

/**
 * 起動時の処理（data-model.md §6.4）。`?reset` があれば、破棄して S01 から。
 * なければ、保存を読んで、検証に通れば復元（対戦中だった場合は S06 から）。通らなければ、S01 から。
 * 親機の sessionId との照合は、取得できてから（sync.ts）
 */
export function boot(
  repo: SessionRepository,
  search: string,
  fresh: () => Session,
  hash = '',
): BootResult {
  if (hasResetFlag(search)) {
    repo.clear()
    return { session: fresh(), resetDone: true, sessionId: null, restored: false }
  }
  const snap = repo.load()
  if (!snap) {
    // 保存があっても壊れていたら、捨てる（壊れたデータを残さない）
    repo.clear()
    return { session: fresh(), resetDone: false, sessionId: null, restored: false }
  }
  return {
    session: sessionFromData(snap.data),
    resetDone: false,
    sessionId: snap.sessionId,
    restored: true,
  }
}
