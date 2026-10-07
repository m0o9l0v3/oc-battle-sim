import { useEffect, useRef } from 'react'
import { messages } from '../assets/index.ts'
import {
  createMatchContext,
  createMatchState,
  isMatchFinished,
  stepMatch,
  type MatchState,
} from '../battle/index.ts'
import { createCanvasView } from '../engine/index.ts'
import { KeyboardInput } from '../input/index.ts'
import type { CharacterConfig, MatchOutcome, StageData } from '../model/index.ts'
import {
  createFighterRenderer,
  createStageRenderer,
  lookFromAppearance,
  type DrawContext,
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
  onFinish: (result: { outcome: MatchOutcome; durationSec: number }) => void
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
 * 設定は、対戦の開始時点のものを使い、対戦中は変えない。unmount で、ループと入力を必ず止める
 */
export function MatchCanvas({ p1, p2, stage, onHud, onFinish }: MatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cbRef = useRef({ onHud, onFinish })
  useEffect(() => {
    cbRef.current = { onHud, onFinish }
  }, [onHud, onFinish])
  // 開始時の設定を、1 回だけ読む（親が再描画しても、やり直さない）
  const setup = useRef({ p1, p2, stage })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { p1, p2, stage } = setup.current
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
    const keys = new KeyboardInput(window)
    const bots = [keys.p1, keys.p2] as const
    let curr = createMatchState(ctx)
    let prev = curr
    let finished = false
    let fightSteps = 0
    let hud: MatchHud | null = null
    fighters.reset()
    fighters.step(curr)

    const view = createCanvasView({
      canvas,
      renderer,
      snapshots: () => ({ prev, curr }),
      onStep: (step) => {
        if (finished) return
        prev = curr
        const r = stepMatch(curr, [bots[0].sample({ step }), bots[1].sample({ step })], ctx)
        curr = r.state
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
          finished = true
          cbRef.current.onFinish({
            outcome: curr.outcome,
            durationSec: Math.round(fightSteps / 60),
          })
        }
      },
      onError: (e) => console.error(e),
    })
    view.start()
    return () => {
      view.dispose()
      keys.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="match-canvas"
      role="img"
      aria-label={messages.flow.match.canvasLabel}
    />
  )
}
