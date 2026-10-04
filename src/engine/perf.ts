// フレームの計測。docs/09-testing/test-plan.md §7.2
// 開発用（URL の ?perf で有効にする）。本番では通常使わない。

export type PerfSummary = {
  frames: number
  avgFps: number
  /** 下位1%のフレーム（時間の長い1%）から求めた FPS */
  p1Fps: number
  /** 33 ms を超えたフレームの割合（0〜1） */
  over33Ratio: number
  maxFrameMs: number
  avgStepMs: number
  maxStepMs: number
  droppedSteps: number
}

export class PerfMonitor {
  private frameTimes: number[] = []
  private stepSum = 0
  private stepMax = 0
  private stepCount = 0
  private dropped = 0

  /** @param windowFrames 直近これだけのフレームで集計する（既定 3600 = 約1分） */
  private readonly windowFrames: number

  constructor(windowFrames = 3600) {
    this.windowFrames = windowFrames
  }

  recordFrame(frameMs: number) {
    this.frameTimes.push(frameMs)
    if (this.frameTimes.length > this.windowFrames) this.frameTimes.shift()
  }

  /** 1フレーム分の更新処理にかかった時間（ミリ秒） */
  recordStepTime(ms: number) {
    this.stepSum += ms
    this.stepCount++
    if (ms > this.stepMax) this.stepMax = ms
  }

  recordDrop(steps: number) {
    this.dropped += steps
  }

  reset() {
    this.frameTimes = []
    this.stepSum = this.stepMax = this.stepCount = this.dropped = 0
  }

  summary(): PerfSummary {
    const t = this.frameTimes
    const n = t.length
    const stepAvg = this.stepCount ? this.stepSum / this.stepCount : 0
    if (n === 0) {
      return {
        frames: 0,
        avgFps: 0,
        p1Fps: 0,
        over33Ratio: 0,
        maxFrameMs: 0,
        avgStepMs: stepAvg,
        maxStepMs: this.stepMax,
        droppedSteps: this.dropped,
      }
    }
    const sum = t.reduce((a, b) => a + b, 0)
    const sorted = [...t].sort((a, b) => a - b)
    const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))]
    return {
      frames: n,
      avgFps: (1000 * n) / sum,
      p1Fps: 1000 / p99,
      over33Ratio: t.filter((x) => x > 33).length / n,
      maxFrameMs: sorted[n - 1],
      avgStepMs: stepAvg,
      maxStepMs: this.stepMax,
      droppedSteps: this.dropped,
    }
  }
}
