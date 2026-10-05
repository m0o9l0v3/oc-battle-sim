import type { StageData } from '../model/index.ts'
import { DEFAULT_VIEW, type Rect } from './camera.ts'
import type { DrawContext, Renderer } from './types.ts'

export type StageColors = {
  background: string
  outOfBounds: string
  stage: string
  block: string
  grid: string
  spawn: [string, string]
}

// 色は暫定。ビジュアルテーマ（#36）で assets に移す。
export const DEFAULT_STAGE_COLORS: StageColors = {
  background: '#0f1420',
  outOfBounds: '#1a2030',
  stage: '#262f45',
  block: '#8fa3c8',
  grid: 'rgba(255,255,255,0.06)',
  spawn: ['#ff7a59', '#4fc3f7'],
}

export function drawStage(
  { ctx, camera, width, height }: DrawContext,
  stage: StageData,
  colors: StageColors = DEFAULT_STAGE_COLORS,
  view: Rect = DEFAULT_VIEW,
) {
  const { scale, offsetX, offsetY } = camera
  const px = (x: number) => offsetX + x * scale
  const py = (y: number) => offsetY + y * scale

  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = colors.outOfBounds
  ctx.fillRect(
    px(view.minX),
    py(view.minY),
    (view.maxX - view.minX) * scale,
    (view.maxY - view.minY) * scale,
  )

  ctx.fillStyle = colors.stage
  ctx.fillRect(px(0), py(0), stage.cols * scale, stage.rows * scale)

  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c <= stage.cols; c++) {
    ctx.moveTo(px(c), py(0))
    ctx.lineTo(px(c), py(stage.rows))
  }
  for (let r = 0; r <= stage.rows; r++) {
    ctx.moveTo(px(0), py(r))
    ctx.lineTo(px(stage.cols), py(r))
  }
  ctx.stroke()

  ctx.fillStyle = colors.block
  for (let r = 0; r < stage.rows; r++) {
    for (let c = 0; c < stage.cols; c++) {
      if (stage.cells[r]?.[c] === 1) ctx.fillRect(px(c), py(r), scale, scale)
    }
  }

  // スポーン（足が立つセル）。足元の中心は (col + 0.5, row + 1)
  ;(['p1', 'p2'] as const).forEach((slot, i) => {
    const { col, row } = stage.spawns[slot]
    ctx.fillStyle = colors.spawn[i]
    ctx.fillRect(px(col + 0.25), py(row + 0.9), scale * 0.5, scale * 0.1)
  })
}

/** ステージだけを描く描画アダプタ（状態を持たない） */
export function createStageRenderer(stage: StageData, colors?: StageColors): Renderer<null> {
  return { draw: (dc) => drawStage(dc, stage, colors) }
}
