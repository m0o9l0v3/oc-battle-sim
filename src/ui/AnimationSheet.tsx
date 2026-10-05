import { useEffect, useRef } from 'react'
import { drawFighter } from '../render/index.ts'
import {
  buildAttackClip,
  buildHitClip,
  FALL,
  IDLE,
  JUMP,
  KO,
  RUN,
  sampleClip,
  STEP_MS,
  type Clip,
} from '../fighter/render/index.ts'
import type { FighterLook } from '../assets/index.ts'

const CELL = 150
const COLS = 6

const attack = buildAttackClip({ startup: 6, active: 4, recovery: 14 })
const SHEET: { label: string; clip: Clip; t: number }[] = [
  { label: 'Idle 0', clip: IDLE, t: 0 },
  { label: 'Idle 600', clip: IDLE, t: 600 },
  { label: 'Run 0', clip: RUN, t: 0 },
  { label: 'Run 150', clip: RUN, t: 150 },
  { label: 'Run 300', clip: RUN, t: 300 },
  { label: 'Run 450', clip: RUN, t: 450 },
  { label: 'Jump 60', clip: JUMP, t: 60 },
  { label: 'Fall 0', clip: FALL, t: 0 },
  { label: 'Fall 250', clip: FALL, t: 250 },
  { label: 'Attack 構え', clip: attack, t: 4 * STEP_MS },
  { label: 'Attack 打撃', clip: attack, t: 7 * STEP_MS },
  { label: 'Attack 戻り', clip: attack, t: 16 * STEP_MS },
  { label: 'Hit 60', clip: buildHitClip(400), t: 60 },
  { label: 'Hit 終わり', clip: buildHitClip(400), t: 400 },
  { label: 'KO 0', clip: KO, t: 0 },
  { label: 'KO 450', clip: KO, t: 450 },
  { label: 'KO 900', clip: KO, t: 900 },
]

const LOOKS: FighterLook[] = [
  { body: 'b1', face: 'f1', color: 'c1', accessory: null },
  { body: 'b2', face: 'f2', color: 'c2', accessory: 'a1' },
  { body: 'b3', face: 'f3', color: 'c4', accessory: 'a3' },
  { body: 'b4', face: 'f4', color: 'c5', accessory: 'a6' },
]

/** 7状態のポーズの一覧（#29）。体型 4 種で、同じクリップが不自然にならないかを、目で確認する */
export function AnimationSheet() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rows = Math.ceil(SHEET.length / COLS)
    canvas.width = COLS * CELL
    canvas.height = rows * CELL * LOOKS.length
    ctx.fillStyle = '#262f45'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 身長 0.8 セル = 120 px
    const camera = { scale: 150, offsetX: 0, offsetY: 0 }
    LOOKS.forEach((look, li) => {
      SHEET.forEach((s, i) => {
        const x = (i % COLS) * CELL + CELL / 2
        const y = (Math.floor(i / COLS) + li * rows) * CELL + CELL - 14
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(x - 40, y, 80, 1)
        drawFighter(
          { ctx, camera, width: canvas.width, height: canvas.height },
          look,
          sampleClip(s.clip, s.t),
          x / 150,
          y / 150,
          1,
        )
        if (li === 0) {
          ctx.fillStyle = '#fff'
          ctx.font = '11px sans-serif'
          ctx.fillText(s.label, x - 40, y + 12)
        }
      })
    })
  }, [])
  return <canvas ref={ref} style={{ maxWidth: '100%' }} />
}
