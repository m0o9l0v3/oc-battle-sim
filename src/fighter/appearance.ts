// 外観の選択肢と、ランダム。docs/02-fighter/character-design.md §5.1.1、§9.1
import type { Appearance } from '../model/index.ts'
import { APPEARANCE_IDS } from './config.ts'

/**
 * 4 つの選択（体型・顔・色・アクセサリー）を、まとめてランダムにする（「ランダム」ボタン）。
 * 乱数は引数で受け取る（0 以上 1 未満を返す関数）。アクセサリーは、「なし」（null）も選択肢に入れる
 */
export function randomAppearance(rand: () => number): Appearance {
  const pick = <T>(list: readonly T[]): T =>
    list[Math.min(list.length - 1, Math.floor(rand() * list.length))]!
  return {
    body: pick(APPEARANCE_IDS.body),
    face: pick(APPEARANCE_IDS.face),
    color: pick(APPEARANCE_IDS.color),
    accessory: pick<string | null>([...APPEARANCE_IDS.accessory, null]),
  }
}
