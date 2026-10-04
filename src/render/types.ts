import type { Camera } from './camera.ts'

/** 描画の入力。描画は状態を書き換えない。 */
export type DrawContext = {
  ctx: CanvasRenderingContext2D
  camera: Camera
  /** キャンバスのピクセル寸法 */
  width: number
  height: number
}

/**
 * 描画アダプタ。S は描画する状態のスナップショット（対戦では MatchState の読み取り専用ビュー）。
 * prev・curr は隣り合う2ステップの状態、alpha はその間の補間率（0〜1）。
 * docs/08-architecture/frontend.md §6.3
 */
export interface Renderer<S> {
  draw(dc: DrawContext, prev: S, curr: S, alpha: number): void
}
