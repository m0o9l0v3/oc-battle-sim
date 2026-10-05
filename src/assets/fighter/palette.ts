// 色の選択肢（c1〜c8）。色の枠（主色・副色・差し色）の組を、数値で持つ（絵は色ごとに用意しない）。
// 6 色（色相が違う）+ 明暗が違う 2 色（c7 明るい、c8 暗い）。docs/02-fighter/character-design.md §5.2
// 1P の初期値 c1 と 2P の初期値 c2 は、色相も明るさも、はっきり違う（§5.4）。
import type { ColorId, Palette } from './types.ts'

export const PALETTES: Record<ColorId, Palette> = {
  c1: { id: 'c1', name: 'あか', primary: '#d94a38', secondary: '#f7c59f', accent: '#ffd23f' },
  c2: { id: 'c2', name: 'みずいろ', primary: '#62cbe9', secondary: '#e8f8ff', accent: '#1f5fbf' },
  c3: { id: 'c3', name: 'きいろ', primary: '#f2c230', secondary: '#fff3c4', accent: '#d9772b' },
  c4: { id: 'c4', name: 'みどり', primary: '#4cb86b', secondary: '#d6f2c8', accent: '#2b7a4b' },
  c5: { id: 'c5', name: 'むらさき', primary: '#8e6bd1', secondary: '#e3d9f7', accent: '#f2a1d2' },
  c6: { id: 'c6', name: 'ピンク', primary: '#f27eb0', secondary: '#ffe0ee', accent: '#7a3fb0' },
  c7: { id: 'c7', name: 'しろ', primary: '#f3f3f6', secondary: '#c9d3e6', accent: '#e4572e' },
  c8: { id: 'c8', name: 'くろ', primary: '#5c6396', secondary: '#9aa1cc', accent: '#ffd23f' },
}

/** 色の選択に関わらない、共通の色 */
export const FIXED_COLORS = {
  skin: '#fbe7cd',
  outline: '#2a2340',
  white: '#ffffff',
  eye: '#2a2340',
  glass: '#bfe8ff',
  cheek: '#f59aa5',
  /** 陰影（半透明。どの色にも重ねられる） */
  shade: 'rgba(30, 20, 60, 0.22)',
  light: 'rgba(255, 255, 255, 0.35)',
} as const

/** 輪郭線の標準の太さ（ファイターの空間の単位。身長 100 に対して）。全パーツで統一（character-design.md §7.1） */
export const OUTLINE_WIDTH = 2.2
