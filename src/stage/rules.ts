// ステージの検証の数値。docs/04-stage/validation.md §4、§5.2
// すべてここにまとめる（調整のために、コードを変えない。調整は #25）。

export type StageRules = {
  blocksMin: number
  blocksMax: number
  /** メイン足場（最も広い足場）の幅の最小 */
  mainPlatformMin: number
  /** すべての足場の幅の最小 */
  platformMin: number
  /** 上から、ブロックを置けない行の数（行 0〜） */
  topEmptyRows: number
  /** スポーンの上の、空けておくセルの数 */
  spawnHeadroom: number
  /** 2つのスポーンの、列の差の最小 */
  spawnMinColDistance: number
  /** 飛び移り（§5.2）: 上へ移れる高さの差の最大 */
  maxRise: number
  /** 飛び移り: 高さの差が -1 以上（同じ高さ・1 セル低い・上）のときの、隙間の最大 */
  maxGapShallow: number
  /** 飛び移り: 高さの差が -2 以下（2 セル以上、低い）のときの、隙間の最大 */
  maxGapDrop: number
}

export const DEFAULT_STAGE_RULES: Readonly<StageRules> = Object.freeze({
  blocksMin: 30,
  blocksMax: 150,
  mainPlatformMin: 10,
  platformMin: 2,
  topEmptyRows: 4,
  spawnHeadroom: 3,
  spawnMinColDistance: 8,
  maxRise: 2,
  maxGapShallow: 1,
  maxGapDrop: 2,
})

/** 読み込める形式の版（stage-format.md §5。validation.md §4） */
export const SUPPORTED_STAGE_SCHEMA_VERSION = 1

/** 名前が未入力のときの名前 */
export const DEFAULT_STAGE_NAME = 'マイステージ'
