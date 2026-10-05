import { useEffect, useRef, useState } from 'react'
import { createCanvasView, PerfMonitor } from '../engine/index.ts'
import type { StageData } from '../model/index.ts'
import { createStageRenderer } from '../render/index.ts'

const perfEnabled = () => new URLSearchParams(window.location.search).has('perf')

/** ステージを Canvas に描く。ループと描画の土台（engine / render）の動作確認用。 */
export function StageCanvas({ stage }: { stage: StageData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [perfText, setPerfText] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const perf = perfEnabled() ? new PerfMonitor() : undefined
    const view = createCanvasView({
      canvas,
      renderer: createStageRenderer(stage),
      snapshots: () => ({ prev: null, curr: null }),
      perf,
      onError: (e) => console.error(e),
    })
    view.start()
    const timer = perf
      ? window.setInterval(() => {
          const s = perf.summary()
          setPerfText(
            `${s.avgFps.toFixed(1)} FPS (p1 ${s.p1Fps.toFixed(1)}, max ${s.maxFrameMs.toFixed(1)} ms)`,
          )
        }, 1000)
      : undefined
    return () => {
      view.dispose()
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [stage])

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {perfText && (
        <span
          style={{ position: 'absolute', top: 4, left: 8, color: '#fff', font: '12px monospace' }}
        >
          {perfText}
        </span>
      )}
    </div>
  )
}
