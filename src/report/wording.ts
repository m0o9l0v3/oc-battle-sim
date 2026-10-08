// 表現のルール: 使わない言葉。docs/07-report/battle-report.md §8.2、comparison.md §7
// 結果と判断材料（数字）を、事実として示す。評価（よい・わるい・つよい・よわい）、改善の指示、点数・順位を使わない。
export const BANNED_WORDS: readonly string[] = [
  'べき',
  '正解',
  'ベスト',
  'おすすめ',
  'オススメ',
  'だめ',
  'ダメ！',
  'よわい',
  'つよい',
  'ざんねん',
  'スコア',
  'ランク',
  'しっぱい',
  'すごい',
  'よくなった',
  'わるくなった',
  'せいこう',
]

/** 文に含まれる、使わない言葉 */
export const findBannedWords = (text: string): string[] =>
  BANNED_WORDS.filter((w) => text.includes(w))
