// キャンバスの大きさ管理と、ループ・描画アダプタをつなぐ土台。
import { fitCamera, DEFAULT_VIEW, type Rect } from '../render/camera.ts'
import type { Renderer } from '../render/types.ts'
import { GameLoop, type LoopDeps } from './loop.ts'
import { PerfMonitor } from './perf.ts'

/** CSS ピクセルの大きさと devicePixelRatio から、内部解像度を決める */
export function canvasPixelSize(cssW: number, cssH: number, dpr: number) {
  const d = dpr > 0 ? dpr : 1
  return {
    width: Math.max(1, Math.round(cssW * d)),
    height: Math.max(1, Math.round(cssH * d)),
  }
}

export type CanvasViewOptions<S> = {
  canvas: HTMLCanvasElement
  renderer: Renderer<S>
  /** 描画する直近2ステップの状態 */
  snapshots: () => { prev: S; curr: S }
  /** 固定ステップごとの更新 */
  onStep?: (step: number) => void
  onDrop?: (steps: number) => void
  onError?: (error: unknown) => void
  view?: Rect
  perf?: PerfMonitor
  deps?: LoopDeps
}

export type CanvasView = {
  start(): void
  stop(): void
  /** ループと監視を止める。コンポーネントの unmount で必ず呼ぶ */
  dispose(): void
  loop: GameLoop
}

export function createCanvasView<S>(opts: CanvasViewOptions<S>): CanvasView {
  const { canvas, renderer, perf } = opts
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  const view = opts.view ?? DEFAULT_VIEW

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const { width, height } = canvasPixelSize(rect.width, rect.height, window.devicePixelRatio)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  let lastFrame = performance.now()
  const loop = new GameLoop({
    deps: opts.deps,
    onStep: (step) => {
      const t0 = performance.now()
      opts.onStep?.(step)
      perf?.recordStepTime(performance.now() - t0)
    },
    onDrop: (n) => {
      perf?.recordDrop(n)
      opts.onDrop?.(n)
    },
    onError: opts.onError,
    onDraw: (alpha) => {
      const now = performance.now()
      perf?.recordFrame(now - lastFrame)
      lastFrame = now
      const { width, height } = canvas
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const camera = fitCamera(width, height, view)
      const { prev, curr } = opts.snapshots()
      renderer.draw({ ctx, camera, width, height }, prev, curr, alpha)
    },
  })

  return {
    loop,
    start: () => {
      lastFrame = performance.now()
      loop.start()
    },
    stop: () => loop.stop(),
    dispose: () => {
      loop.stop()
      observer.disconnect()
    },
  }
}
