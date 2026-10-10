import { useEffect, useRef } from 'react'
import { messages } from '../assets/index.ts'
import {
  createMatchState,
  DUMMY_INPUT,
  stepMatch,
  type InputSource,
  type MatchState,
} from '../battle/index.ts'
import { createPracticeContext } from '../battle/practice.ts'
import { createCanvasView, type CanvasView } from '../engine/index.ts'
import { KeyboardInput } from '../input/index.ts'
import type { Appearance, StageData, Stats } from '../model/index.ts'
import {
  createFighterRenderer,
  createStageRenderer,
  lookFromAppearance,
  type DrawContext,
  type Rect,
  type Renderer,
} from '../render/index.ts'

/** 試し動かしで映す範囲: ステージ全体（24 × 14）と、少しの余白。ファイターを大きく見せる（場外の遠くは映さない） */
const PRACTICE_VIEW: Rect = { minX: -2, minY: -1, maxX: 26, maxY: 16 }

/** 画面に出す、試し動かしの数値（変わったときだけ、通知する） */
export type PracticeHud = {
  /** ダミーの蓄積ダメージ（整数に丸めたもの） */
  dummyDamage: number
  /** 1P が、ダミーに当てた、最後の攻撃。まだなら null */
  lastHit: { damage: number; launch: number } | null
}

export type PracticeCanvasProps = {
  stage: StageData
  /** 1P（参加者）の能力値。ダミーは標準 */
  stats: Stats
  look: Appearance
  dummyLook: Appearance
  onHud: (hud: PracticeHud) => void
  /** 増えると、最初から（ダミーのダメージも 0 に） */
  resetKey?: number
  /** 1P の入力。省略すると、キーボード（1P の配置）。スマホでは、仮想コントローラー（mobile-ui.md §6） */
  input?: InputSource
  /** 真の間は、ループを止める（スマホの縦持ちのとき。mobile-ui.md §5.2） */
  paused?: boolean
  className?: string
}

/**
 * 試しに動かす画面の、Canvas。1P はキーボード（pc-ui.md §4）、相手は、動かないダミー。
 * 対戦と同じ `stepMatch` を、試し動かしのルール（待ちなし・決着なし）で動かす
 */
export function PracticeCanvas({
  stage,
  stats,
  look,
  dummyLook,
  onHud,
  resetKey = 0,
  input,
  paused = false,
  className = 'practice-canvas',
}: PracticeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<CanvasView | null>(null)
  const pausedRef = useRef(paused)
  const onHudRef = useRef(onHud)
  useEffect(() => {
    onHudRef.current = onHud
  }, [onHud])
  // 能力値の中身で比べる（親が、同じ値の新しいオブジェクトを渡しても、やり直さない）
  const statsKey = JSON.stringify(stats)
  const lookKey = JSON.stringify([look, dummyLook])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = createPracticeContext(stage, JSON.parse(statsKey) as Stats)
    const [l1, l2] = (JSON.parse(lookKey) as Appearance[]).map(lookFromAppearance) as [
      ReturnType<typeof lookFromAppearance>,
      ReturnType<typeof lookFromAppearance>,
    ]
    const stageRenderer = createStageRenderer(stage)
    const fighters = createFighterRenderer({ looks: [l1, l2], combat: ctx.combat })
    const renderer: Renderer<MatchState> = {
      draw(dc: DrawContext, prev, curr, alpha) {
        stageRenderer.draw(dc, null, null, alpha)
        fighters.draw(dc, prev, curr, alpha)
      },
    }
    const keys = input ? null : new KeyboardInput(window)
    const p1 = input ?? keys!.p1
    let curr = createMatchState(ctx)
    let prev = curr
    fighters.reset()
    fighters.step(curr)

    let hud: PracticeHud = { dummyDamage: 0, lastHit: null }
    const publish = (next: PracticeHud) => {
      if (
        next.dummyDamage === hud.dummyDamage &&
        next.lastHit?.damage === hud.lastHit?.damage &&
        next.lastHit?.launch === hud.lastHit?.launch
      ) {
        return
      }
      hud = next
      onHudRef.current(next)
    }
    onHudRef.current(hud)

    const view = createCanvasView({
      canvas,
      renderer,
      view: PRACTICE_VIEW,
      snapshots: () => ({ prev, curr }),
      onStep: (step) => {
        prev = curr
        const r = stepMatch(curr, [p1.sample({ step }), DUMMY_INPUT], ctx)
        curr = r.state
        fighters.step(curr)
        let lastHit = hud.lastHit
        for (const e of r.events) {
          if (e.type === 'hit' && e.attacker === 0) {
            lastHit = {
              damage: Math.round(e.damageDealt * 10) / 10,
              launch: Math.round(e.launchSpeed),
            }
          }
        }
        publish({ dummyDamage: Math.round(curr.fighters[1].combat.damage), lastHit })
      },
      onError: (e) => console.error(e),
    })
    viewRef.current = view
    if (!pausedRef.current) view.start()
    return () => {
      viewRef.current = null
      view.dispose()
      keys?.dispose()
    }
  }, [stage, statsKey, lookKey, resetKey, input])

  useEffect(() => {
    pausedRef.current = paused
    const view = viewRef.current
    if (!view) return
    if (paused) view.stop()
    else view.start()
  }, [paused])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={messages.practice.canvasLabel}
    />
  )
}
