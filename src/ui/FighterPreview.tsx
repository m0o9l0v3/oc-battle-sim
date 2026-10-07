import { useEffect, useRef } from 'react'
import { EFFECT_COLORS, type FighterLook } from '../assets/index.ts'
import { IDLE, sampleClip } from '../fighter/render/index.ts'
import { drawFighter } from '../render/index.ts'

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export type FighterPreviewProps = {
  look: FighterLook
  /** 画面の読み上げ用の説明 */
  label: string
  /** 表示の高さ（CSS ピクセル）。ファイターの身長は、この高さの 8 割 */
  height?: number
}

/**
 * ファイターを大きく、Idle のアニメーションで見せる（ui-design.md §6 プレビュー）。
 * look が変わると、すぐに変わる。動きを減らす設定のときは、止めた姿勢を描く
 */
export function FighterPreview({ look, label, height = 360 }: FighterPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = Math.round(height * 0.75)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    // 身長 0.8 セルが、高さの 80% になる倍率
    const scale = height * dpr
    const camera = { scale, offsetX: canvas.width / 2, offsetY: canvas.height * 0.9 }
    const still = reducedMotion()
    let raf = 0
    const draw = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // 足元の影
      ctx.fillStyle = EFFECT_COLORS.shadow
      ctx.beginPath()
      ctx.ellipse(camera.offsetX, camera.offsetY, 0.3 * scale, 0.05 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      drawFighter(
        { ctx, camera, width: canvas.width, height: canvas.height },
        look,
        sampleClip(IDLE, still ? 0 : now),
        0,
        0,
        1,
      )
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [look, height, width])

  return (
    <canvas
      ref={canvasRef}
      className="fighter-preview"
      role="img"
      aria-label={label}
      style={{ width, height }}
    />
  )
}
