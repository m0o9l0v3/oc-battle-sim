// ファイター設定の型。仕様: docs/02-fighter/character-config.md §4
export type Stats = {
  attackPower: number // 2〜8 の整数
  defense: number
  jumpPower: number
  speed: number
}

export type Appearance = {
  body: string // b1〜b4
  face: string // f1〜f6
  color: string // c1〜c8
  accessory: string | null // a1〜a6。なし = null
}

export type CharacterConfig = {
  schemaVersion: 1
  name: string
  stats: Stats
  appearance: Appearance
}

export type PlayerSlot = 'p1' | 'p2'
