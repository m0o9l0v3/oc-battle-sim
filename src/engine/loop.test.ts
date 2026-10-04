import { describe, expect, it } from 'vitest'
import { GameLoop, type LoopDeps } from './loop.ts'

const STEP = 1000 / 60

function harness(opts: Partial<ConstructorParameters<typeof GameLoop>[0]> = {}) {
  let time = 0
  let pending: (() => void) | null = null
  const deps: LoopDeps = {
    now: () => time,
    request: (cb) => {
      pending = cb
      return 1
    },
    cancel: () => {
      pending = null
    },
  }
  const log = { steps: [] as number[], draws: [] as number[], drops: [] as number[] }
  const loop = new GameLoop({
    deps,
    onStep: (s) => log.steps.push(s),
    onDraw: (a) => log.draws.push(a),
    onDrop: (n) => log.drops.push(n),
    ...opts,
  })
  /** ms 進めて、1フレーム実行する */
  const frame = (ms: number) => {
    time += ms
    const cb = pending
    pending = null
    cb?.()
  }
  return { loop, log, frame, hasPending: () => pending !== null }
}

describe('GameLoop', () => {
  it('固定ステップで更新し、描画は毎フレーム呼ぶ', () => {
    const h = harness()
    h.loop.start()
    for (let i = 0; i < 60; i++) h.frame(STEP)
    expect(h.log.steps).toHaveLength(60)
    expect(h.log.draws).toHaveLength(60)
    expect(h.log.steps[59]).toBe(59)
  })

  it('高リフレッシュレート（144 Hz）でも、更新は 60 Hz', () => {
    const h = harness()
    h.loop.start()
    for (let i = 0; i < 144; i++) h.frame(1000 / 144)
    expect(h.log.steps.length).toBeGreaterThanOrEqual(59)
    expect(h.log.steps.length).toBeLessThanOrEqual(60)
  })

  it('補間率は 0〜1。ステップの端数を持ち越す', () => {
    const h = harness()
    h.loop.start()
    h.frame(STEP * 1.5)
    expect(h.log.steps).toHaveLength(1)
    expect(h.log.draws[0]).toBeCloseTo(0.5)
    h.frame(STEP * 0.5)
    expect(h.log.steps).toHaveLength(2)
    expect(h.log.draws[1]).toBeCloseTo(0, 5)
  })

  it('1フレームの最大ステップ数を超えた分は捨て、通知する', () => {
    const h = harness()
    h.loop.start()
    h.frame(STEP * 8) // 8 ステップ分 → 5 だけ進め、3 を捨てる
    expect(h.log.steps).toHaveLength(5)
    expect(h.log.drops).toEqual([3])
    h.frame(STEP)
    expect(h.log.steps).toHaveLength(6) // 捨てた分を、あとから取り返さない
  })

  it('長い停止（タブの非表示）からの復帰は、追いつかず、捨てた数にも数えない', () => {
    const h = harness()
    h.loop.start()
    h.frame(STEP)
    h.frame(60_000)
    expect(h.log.steps).toHaveLength(1)
    expect(h.log.drops).toEqual([])
    h.frame(STEP)
    expect(h.log.steps).toHaveLength(2)
  })

  it('stop() で止まり、次のフレームを予約しない。再開もできる', () => {
    const h = harness()
    h.loop.start()
    h.frame(STEP)
    h.loop.stop()
    expect(h.loop.running).toBe(false)
    expect(h.hasPending()).toBe(false)
    h.loop.start()
    h.frame(STEP)
    expect(h.log.steps).toHaveLength(2)
  })

  it('更新の中で stop() しても、再び予約されない', () => {
    const ref: { loop?: GameLoop } = {}
    const h = harness({ onStep: () => ref.loop?.stop() })
    ref.loop = h.loop
    h.loop.start()
    h.frame(STEP)
    expect(h.hasPending()).toBe(false)
  })

  it('追いつきの途中で stop() されたら、残りのステップも描画もしない', () => {
    const ref: { loop?: GameLoop } = {}
    const seen: number[] = []
    const h = harness({
      onStep: (s) => {
        seen.push(s)
        if (s === 1) ref.loop?.stop()
      },
    })
    ref.loop = h.loop
    h.loop.start()
    h.frame(STEP * 4) // 4 ステップ分が溜まっているが、2つ目で止める
    expect(seen).toEqual([0, 1])
    expect(h.log.draws).toHaveLength(0)
    expect(h.hasPending()).toBe(false)
  })

  it('例外でループを止め、onError を呼ぶ', () => {
    const errors: unknown[] = []
    const h = harness({
      onStep: () => {
        throw new Error('boom')
      },
      onError: (e) => errors.push(e),
    })
    h.loop.start()
    h.frame(STEP)
    expect(errors).toHaveLength(1)
    expect(h.loop.running).toBe(false)
    expect(h.hasPending()).toBe(false)
  })
})
