import { useEffect, useRef } from 'react'
import { messages } from '../assets/index.ts'
import {
  createMatchContext,
  createMatchState,
  isMatchFinished,
  stepMatch,
  type InputSource,
  type MatchState,
} from '../battle/index.ts'
import { CpuSource, type CpuLevel } from '../cpu/index.ts'
import { createCanvasView, type CanvasView } from '../engine/index.ts'
import { KeyboardInput } from '../input/index.ts'
import type { CharacterConfig, MatchOutcome, PlayerMetrics, StageData } from '../model/index.ts'
import { MetricsRecorder } from '../report/index.ts'
import {
  createFighterRenderer,
  createStageRenderer,
  lookFromAppearance,
  type DrawContext,
  type Rect,
  type Renderer,
} from '../render/index.ts'

/** 画面に出す、対戦の数値（変わったときだけ、通知する） */
export type MatchHud = {
  phase: MatchState['phase']
  /** 残り時間（秒。切り上げ） */
  timeLeftSec: number
  stocks: [number, number]
  /** 蓄積ダメージ（整数に丸めたもの） */
  damage: [number, number]
}

export type MatchCanvasProps = {
  /** 対戦開始の時点で固定した設定 */
  p1: CharacterConfig
  p2: CharacterConfig
  stage: StageData
  onHud: (hud: MatchHud) => void
  /** 勝敗が確定し、END の表示が終わったとき、1 回だけ */
  onFinish: (result: {
    outcome: MatchOutcome
    durationSec: number
    /** 採用した指標（1P、2P。battle-report.md §4） */
    p1: PlayerMetrics
    p2: PlayerMetrics
  }) => void
  /** 1P の入力。省略すると、キーボード（1P の配置）。スマホでは、仮想コントローラー */
  p1Input?: InputSource
  /** 2P を簡易CPUにする（cpu-opponent.md）。省略すると、キーボード（2P の配置） */
  cpu?: { level: CpuLevel; seed: number }
  /** 真の間は、ループを止める（スマホの縦持ちのとき。mobile-ui.md §5.2） */
  paused?: boolean
  /** 映す範囲。省略すると、場外領域まで */
  view?: Rect
  className?: string
}

const sameHud = (a: MatchHud, b: MatchHud) =>
  a.phase === b.phase &&
  a.timeLeftSec === b.timeLeftSec &&
  a.stocks[0] === b.stocks[0] &&
  a.stocks[1] === b.stocks[1] &&
  a.damage[0] === b.damage[0] &&
  a.damage[1] === b.damage[1]

/**
 * 対戦（S07・S10）の Canvas。1 台のキーボードを 2 人で使う（pc-ui.md §4）。
 * 2P を簡易CPUにすると、1 人で遊べる（持ち帰りのあと。PC・スマホ）。
 * 設定は、対戦の開始時点のものを使い、対戦中は変えない。unmount で、ループと入力を必ず止める
 */
export function MatchCanvas({
  p1,
  p2,
  stage,
  onHud,
  onFinish,
  p1Input,
  cpu,
  paused = false,
  view: viewRect,
  className = 'match-canvas',
}: MatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<CanvasView | null>(null)
  const pausedRef = useRef(paused)
  // 勝敗が確定し、結果を伝えた（このあとは、ループを動かさない）
  const finishedRef = useRef(false)
  const cbRef = useRef({ onHud, onFinish })
  useEffect(() => {
    cbRef.current = { onHud, onFinish }
  }, [onHud, onFinish])
  // 開始時の設定を、1 回だけ読む（親が再描画しても、やり直さない）
  const setup = useRef({ p1, p2, stage, p1Input, cpu, viewRect })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { p1, p2, stage, p1Input, cpu, viewRect } = setup.current
    const ctx = createMatchContext(stage, [p1.stats, p2.stats])
    const stageRenderer = createStageRenderer(stage)
    const fighters = createFighterRenderer({
      looks: [lookFromAppearance(p1.appearance), lookFromAppearance(p2.appearance)],
      combat: ctx.combat,
    })
    const renderer: Renderer<MatchState> = {
      draw(dc: DrawContext, prev, curr, alpha) {
        stageRenderer.draw(dc, null, null, alpha)
        fighters.draw(dc, prev, curr, alpha)
      },
    }
    // キーボードは、使う人がいるときだけ受ける（スマホで CPU と遊ぶときは、使わない）
    const keys = p1Input && cpu ? null : new KeyboardInput(window)
    const sources: [InputSource<MatchState>, InputSource<MatchState>] = [
      p1Input ?? keys!.p1,
      cpu ? new CpuSource(ctx, 1, cpu.level, cpu.seed) : keys!.p2,
    ]
    let curr = createMatchState(ctx)
    let prev = curr
    finishedRef.current = false
    let fightSteps = 0
    // 指標は、試合中のイベントから、その場で積み上げる（試合のあとに、読み直さない）
    const recorder = new MetricsRecorder()
    let hud: MatchHud | null = null
    fighters.reset()
    fighters.step(curr)

    const view = createCanvasView({
      canvas,
      renderer,
      view: viewRect,
      snapshots: () => ({ prev, curr }),
      onStep: (step) => {
        if (finishedRef.current) return
        prev = curr
        // 盤面（observation）は、CPU だけが読む（キーボード・仮想パッドは、無視する）
        const r = stepMatch(
          curr,
          [
            sources[0].sample({ step, observation: curr }),
            sources[1].sample({ step, observation: curr }),
          ],
          ctx,
        )
        curr = r.state
        recorder.record(prev, curr, r.events)
        fighters.step(curr)
        for (const e of r.events) if (e.type === 'match_end') fightSteps = e.fightSteps
        const next: MatchHud = {
          phase: curr.phase,
          timeLeftSec: Math.ceil(curr.timeLeft / 60),
          stocks: [curr.fighters[0].stocks, curr.fighters[1].stocks],
          damage: [
            Math.round(curr.fighters[0].combat.damage),
            Math.round(curr.fighters[1].combat.damage),
          ],
        }
        if (!hud || !sameHud(hud, next)) {
          hud = next
          cbRef.current.onHud(next)
        }
        if (curr.outcome && isMatchFinished(curr, ctx)) {
          finishedRef.current = true
          // 結果を出している間は、描画も止める（スマホで結果の画面のまま置かれても、電池を使い続けない）
          view.stop()
          const [p1m, p2m] = recorder.result(curr)
          cbRef.current.onFinish({
            outcome: curr.outcome,
            durationSec: Math.round(fightSteps / 60),
            p1: p1m,
            p2: p2m,
          })
        }
      },
      onError: (e) => console.error(e),
    })
    viewRef.current = view
    if (!pausedRef.current) view.start()
    return () => {
      viewRef.current = null
      view.dispose()
      keys?.dispose()
      sources[1].dispose()
    }
  }, [])

  useEffect(() => {
    pausedRef.current = paused
    const view = viewRef.current
    if (!view) return
    if (paused || finishedRef.current) view.stop()
    else view.start()
  }, [paused])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={messages.flow.match.canvasLabel}
    />
  )
}
