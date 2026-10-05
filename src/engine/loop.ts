// 固定ステップのゲームループ。docs/08-architecture/frontend.md §6.2
// 更新（onStep）は固定間隔、描画（onDraw）は requestAnimationFrame に合わせる。

export type LoopDeps = {
  /** ミリ秒 */
  now: () => number
  request: (cb: () => void) => number
  cancel: (id: number) => void
}

export type LoopOptions = {
  /** 更新の頻度（Hz）。既定 60（combat-system.md §4） */
  stepHz?: number
  /** 1フレームで進める最大ステップ数。既定 5。超えた分は捨てる */
  maxStepsPerFrame?: number
  /**
   * 前のフレームからこれ以上空いたら、停止（タブ非表示など）からの復帰とみなし、
   * その時間を捨てる（追いつかず、捨てたステップにも数えない）。既定 1000 ms
   */
  resumeThresholdMs?: number
  /** 固定ステップごとに呼ぶ。step は 0 から数える */
  onStep: (step: number) => void
  /** 描画。alpha は次のステップまでの補間率（0〜1） */
  onDraw: (alpha: number) => void
  /** 上限で捨てたステップ数（試合の制限時間の補正に使う。clockSkip） */
  onDrop?: (steps: number) => void
  /** 例外。呼ばれる前にループは停止している */
  onError?: (error: unknown) => void
  deps?: LoopDeps
}

const browserDeps = (): LoopDeps => ({
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
})

export class GameLoop {
  private readonly stepMs: number
  private readonly maxSteps: number
  private readonly resumeMs: number
  private readonly deps: LoopDeps
  private readonly opts: LoopOptions
  private handle: number | null = null
  private active = false
  private last = 0
  private acc = 0
  private steps = 0

  constructor(opts: LoopOptions) {
    this.opts = opts
    this.stepMs = 1000 / (opts.stepHz ?? 60)
    this.maxSteps = opts.maxStepsPerFrame ?? 5
    this.resumeMs = opts.resumeThresholdMs ?? 1000
    this.deps = opts.deps ?? browserDeps()
  }

  get running() {
    return this.active
  }

  /** これまでに実行したステップ数 */
  get stepCount() {
    return this.steps
  }

  start() {
    if (this.running) return
    this.active = true
    this.last = this.deps.now()
    this.acc = 0
    this.schedule()
  }

  stop() {
    this.active = false
    if (this.handle === null) return
    this.deps.cancel(this.handle)
    this.handle = null
  }

  private schedule() {
    this.handle = this.deps.request(() => this.frame())
  }

  private frame() {
    this.handle = null
    try {
      const t = this.deps.now()
      let delta = t - this.last
      this.last = t
      if (delta < 0 || delta > this.resumeMs) delta = 0
      this.acc += delta

      // 浮動小数点の誤差で、ちょうど1ステップ分が足りなくならないように
      let n = Math.floor(this.acc / this.stepMs + 1e-9)
      if (n > this.maxSteps) {
        const dropped = n - this.maxSteps
        this.acc -= dropped * this.stepMs
        n = this.maxSteps
        this.opts.onDrop?.(dropped)
      }
      for (let i = 0; i < n && this.active; i++) {
        this.opts.onStep(this.steps++)
        this.acc -= this.stepMs
      }
      // 更新の中で stop() された（試合の終了など）ときは、残りのステップも描画もしない
      if (!this.active) return
      if (this.acc < 0) this.acc = 0
      this.opts.onDraw(Math.min(this.acc / this.stepMs, 1))
    } catch (error) {
      this.stop()
      this.opts.onError?.(error)
      return
    }
    if (this.active) this.schedule()
  }
}
