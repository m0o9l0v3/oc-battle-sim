// ファイターのパーツ素材の型。仕様: docs/02-fighter/character-design.md §4、§12、animation.md §4
//
// 座標系（ファイターの見た目の空間。ベクター。解像度に依存しない）:
//  - 身長 H = 100。頭の上端が y = 0、足元が y = 100（下が正）。体の中心が x = 0。右向きで描く（左向きは全体を反転）
//  - 各パーツの絵は、**関節を原点（0, 0）とした、ローカル座標**で持つ。回転・拡大縮小は、関節を中心に行える
//    （animation.md §4.1。0° は真下）。置く場所（`at`）は、親のパーツの関節から見た位置

/** 色の枠（主色・副色・差し色）。色の選択肢（c1〜c8）で塗り替える（character-design.md §4.4） */
export type ColorSlot = 'primary' | 'secondary' | 'accent'

/**
 * 塗りの種類。
 *  - 色の枠: 色の選択で変わる
 *  - 共通の色: 肌・輪郭線・目・白目・ほお。色の選択で変えない
 *  - 陰影: 暗い重ね（shade）・明るい重ね（light）。半透明で、どの色にも重ねられる（2段階の陰影）
 */
export type Paint =
  ColorSlot | 'skin' | 'outline' | 'white' | 'eye' | 'glass' | 'cheek' | 'shade' | 'light' | 'none'

export type Shape = {
  /** SVG のパスデータ（M、L、C、Q、Z。絶対座標のみ） */
  d: string
  fill: Paint
  stroke?: Paint
  /** 線の太さ。省略すると、輪郭線の標準の太さ */
  sw?: number
}

export type Point = { x: number; y: number }

/** パーツ1点。関節が原点のローカル座標 */
export type Part = { shapes: Shape[] }

export type BodyId = 'b1' | 'b2' | 'b3' | 'b4'
export type FaceId = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6'
export type ColorId = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8'
export type AccessoryId = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6'
export type ExpressionId = 'attack' | 'hit' | 'ko'

export type AccessorySlot = 'head' | 'face' | 'neck' | 'back'

/** 体型ごとの、アクセサリーの付け位置（スロットごと）。親のパーツの関節から見た位置と、大きさの倍率 */
export type SlotAnchor = { x: number; y: number; s: number }

export type BodyDef = {
  id: BodyId
  /** 名前（画面に出す呼び名。S02 の選択肢） */
  name: string
  head: Part
  torso: Part
  /** 腕・脚は、1つの絵を、手前・奥の両方に使う（奥は、陰影を重ねて暗くする） */
  arm: Part
  leg: Part
  /** 置く位置（親の関節から見た） */
  at: {
    /** 腰（トルソーの関節）。ファイターの空間での位置 */
    torso: Point
    /** 頭の関節（首の付け根）。トルソーのローカル座標 */
    head: Point
    armF: Point
    armB: Point
    /** 脚の関節（股の付け根）。ファイターの空間での位置 */
    legF: Point
    legB: Point
  }
  /** 顔を置く位置と大きさ。頭のローカル座標 */
  face: SlotAnchor
  /** アクセサリーの付け位置。head・face は頭のローカル、neck・back はトルソーのローカル */
  anchors: Record<AccessorySlot, SlotAnchor>
}

export type Palette = {
  id: ColorId
  name: string
  primary: string
  secondary: string
  accent: string
}
