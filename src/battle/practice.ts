// 試しに動かす（S05）の試合の設定。docs/01-experience/user-flow.md §5.5、docs/08-architecture/frontend.md §6.4
// 試し動かしは、対戦と同じ `stepMatch` を、ルールだけ変えて使う（ストック・時間は、事実上、無制限。待ち時間なし）。
// 相手（2P）は、動かない「ダミー」。1P の攻撃のダメージ・吹き飛ばしを、一人で確かめられる。
import type { MatchContext } from './match.ts'
import { createMatchContext } from './match.ts'
import type { PlayerInput } from './input.ts'
import { DEFAULT_MATCH_RULES, type MatchRules } from './rules.ts'
import type { StageData, Stats } from '../model/index.ts'

/** 試し動かしのルール: 決着しない（ストックは 99、制限時間は 1 日）。READY・END の待ちはなし */
export const PRACTICE_RULES: Readonly<MatchRules> = Object.freeze({
  ...DEFAULT_MATCH_RULES,
  stocks: 99,
  timeLimitSec: 60 * 60 * 24,
  readySec: 0,
  endSec: 0,
})

/** ダミーの能力値（標準）。1P の能力値の効果を、基準と同じ相手で比べられる */
export const DUMMY_STATS: Readonly<Stats> = Object.freeze({
  attackPower: 5,
  defense: 5,
  jumpPower: 5,
  speed: 5,
})

/** ダミーの入力（何もしない） */
export const DUMMY_INPUT: Readonly<PlayerInput> = Object.freeze({
  left: false,
  right: false,
  jumpPressed: false,
  attackPressed: false,
})

/** 試し動かしの設定。1P は、参加者の能力値。2P は、ダミー */
export function createPracticeContext(stage: StageData, stats: Stats): MatchContext {
  return createMatchContext(stage, [{ ...stats }, { ...DUMMY_STATS }], { ...PRACTICE_RULES })
}
