// 1 人の体験（セッション）の状態。仕様: docs/01-experience/user-flow.md §5〜§6、docs/08-architecture/data-model.md §6
import { createDefaultConfig } from '../fighter/index.ts'
import type {
  CharacterConfig,
  MatchRecord,
  ScreenId,
  SessionData,
  StageData,
} from '../model/index.ts'
import { DEFAULT_PRESET_ID, presetStage } from '../stage/index.ts'

/** 対戦（S07・S10）の開始時に固定する設定。対戦中は、変わらない（user-flow.md §5.7） */
export type FrozenSetup = { p1: CharacterConfig; p2: CharacterConfig; stage: StageData }

export type Session = {
  /** 保存するデータ（data-model.md §6.2） */
  data: SessionData
  /** S05 から S03 へ戻ったとき true。S03 の「つぎへ」は、S04 を通らず S05 へ戻る（ステージは変えていないため） */
  returnToPractice: boolean
  /** 対戦中の、固定した設定。保存しない（更新では、S06 から再開する） */
  current: FrozenSetup | null
}

/** 体験の最初（S01）。1P は標準の設定、2P も標準（対戦相手は、標準設定で始める） */
export function createSession(): Session {
  return {
    data: {
      p1: createDefaultConfig('p1'),
      p2: createDefaultConfig('p2'),
      stage: presetStage(DEFAULT_PRESET_ID),
      stagePresetId: DEFAULT_PRESET_ID,
      matches: [],
      screen: 'S01',
    },
    returnToPractice: false,
    current: null,
  }
}

export const sessionFromData = (saved: SessionData): Session => {
  const { returnToPractice, ...data } = saved
  return { data, returnToPractice: returnToPractice === true, current: null }
}

export const screenOf = (s: Session): ScreenId => s.data.screen

export const lastMatch = (s: Session): MatchRecord | undefined => s.data.matches.at(-1)

/** 次の戦の番号（1 から。上限で古い戦を捨てても、戻さない） */
export const nextMatchNo = (s: Session): number => (lastMatch(s)?.matchNo ?? 0) + 1

/** 画面の名前（S01〜S12。ui-design.md §4 の段階の表示にも使える） */
export const SCREEN_TITLES: Record<ScreenId, string> = {
  S01: 'スタート',
  S02: '見た目を選ぶ',
  S03: '能力値を決める',
  S04: 'ステージを決める',
  S05: '試しに動かす',
  S06: '対戦の準備',
  S07: '第1戦',
  S08: 'Battle Report',
  S09: '設定を変えて作り直す',
  S10: '再戦',
  S11: '結果の比較',
  S12: 'おわり',
}
