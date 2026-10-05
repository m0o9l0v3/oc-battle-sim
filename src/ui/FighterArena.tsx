import { useEffect, useRef, useState } from 'react'
import {
  createMatchContext,
  createMatchState,
  DEFAULT_MATCH_RULES,
  isMatchFinished,
  stepMatch,
  type MatchState,
} from '../battle/index.ts'
import { createBot } from '../battle/balance.ts'
import { createCanvasView, PerfMonitor } from '../engine/index.ts'
import { createDefaultConfig, DEFAULT_STATS } from '../fighter/index.ts'
import { KeyboardInput } from '../input/index.ts'
import {
  createFighterRenderer,
  createStageRenderer,
  lookFromAppearance,
  type DrawContext,
  type Renderer,
} from '../render/index.ts'
import { DEMO_STAGE } from './demoStage.ts'

const perfEnabled = () => new URLSearchParams(window.location.search).has('perf')

const STATS = { ...DEFAULT_STATS }
const RULES = { ...DEFAULT_MATCH_RULES, readySec: 1, endSec: 2 }

/**
 * ファイターの描画とアニメーションの動作確認用（#29）。1P はキーボード（A D W F）、2P は簡易のボット。
 * 実際の試合の更新（stepMatch）で動かすので、7つの状態が、ゲームの状態に応じて切り替わる様子を確認できる。
 * 画面の遷移（S05、S07）は #34、#35 で作る
 */
export function FighterArena() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [perfText, setPerfText] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = createMatchContext(DEMO_STAGE, [STATS, STATS], RULES)
    const looks = [
      lookFromAppearance(createDefaultConfig('p1').appearance),
      lookFromAppearance(createDefaultConfig('p2').appearance),
    ] as const
    const stage = createStageRenderer(DEMO_STAGE)
    const fighters = createFighterRenderer({ looks, combat: ctx.combat })
    const renderer: Renderer<MatchState> = {
      draw(dc: DrawContext, prev, curr, alpha) {
        stage.draw(dc, null, null, alpha)
        fighters.draw(dc, prev, curr, alpha)
      },
    }

    const keys = new KeyboardInput(window)
    const bot = createBot(1, ctx, 1)
    let curr = createMatchState(ctx)
    let prev = curr
    fighters.reset()
    fighters.step(curr)

    const perf = perfEnabled() ? new PerfMonitor() : undefined
    const view = createCanvasView({
      canvas,
      renderer,
      snapshots: () => ({ prev, curr }),
      perf,
      onStep: (step) => {
        if (isMatchFinished(curr, ctx)) {
          curr = createMatchState(ctx)
          prev = curr
          fighters.reset()
          fighters.step(curr)
          return
        }
        prev = curr
        curr = stepMatch(curr, [keys.p1.sample({ step }), bot(curr)], ctx).state
        fighters.step(curr)
      },
      onError: (e) => console.error(e),
    })
    view.start()
    const timer = perf
      ? window.setInterval(() => {
          const s = perf.summary()
          setPerfText(
            `${s.avgFps.toFixed(1)} FPS (p1 ${s.p1Fps.toFixed(1)}, max ${s.maxFrameMs.toFixed(1)} ms, step ${s.maxStepMs.toFixed(2)} ms)`,
          )
        }, 1000)
      : undefined
    return () => {
      view.dispose()
      keys.dispose()
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <p>1P: A D（移動）/ W（ジャンプ）/ F（攻撃）。2P は簡易のボット。</p>
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
    </>
  )
}
