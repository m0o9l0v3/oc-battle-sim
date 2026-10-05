// カメラ（ステージ座標 → キャンバスのピクセル座標）。
// 座標はセル単位、原点は左上、y は下が正（docs/04-stage/stage-format.md §4）。

export type Rect = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * 表示する範囲。ステージ（0〜24 × 0〜14）+ 場外領域（左右 6、下 6、上 8）= 36 × 28 セル。
 * docs/04-stage/stage-format.md §4
 */
export const DEFAULT_VIEW: Rect = { minX: -6, minY: -8, maxX: 30, maxY: 20 }

export type Camera = {
  /** 1 セルあたりのピクセル数 */
  scale: number
  /** セル (0, 0) のピクセル位置 */
  offsetX: number
  offsetY: number
}

/** 表示範囲の全体が収まる最大の倍率で、中央に配置する（縦横比を保つ。余白は画面の端に残る）。 */
export function fitCamera(width: number, height: number, view: Rect = DEFAULT_VIEW): Camera {
  const viewW = view.maxX - view.minX
  const viewH = view.maxY - view.minY
  const scale = Math.max(0, Math.min(width / viewW, height / viewH))
  const offsetX = (width - viewW * scale) / 2 - view.minX * scale
  const offsetY = (height - viewH * scale) / 2 - view.minY * scale
  return { scale, offsetX, offsetY }
}

export function worldToScreen(camera: Camera, x: number, y: number) {
  return {
    x: camera.offsetX + x * camera.scale,
    y: camera.offsetY + y * camera.scale,
  }
}

/** ポインタ位置（キャンバスのピクセル座標）をセル座標へ。scale が 0 のときは null。 */
export function screenToWorld(camera: Camera, px: number, py: number) {
  if (camera.scale <= 0) return null
  return {
    x: (px - camera.offsetX) / camera.scale,
    y: (py - camera.offsetY) / camera.scale,
  }
}
