import { describe, expect, it } from 'vitest'
import { PerfMonitor } from './perf.ts'

describe('PerfMonitor', () => {
  it('一定の 60 FPS を、そのまま計算する', () => {
    const p = new PerfMonitor()
    for (let i = 0; i < 100; i++) p.recordFrame(1000 / 60)
    const s = p.summary()
    expect(s.avgFps).toBeCloseTo(60)
    expect(s.p1Fps).toBeCloseTo(60)
    expect(s.over33Ratio).toBe(0)
  })

  it('遅いフレームを、割合・最大・下位1%に反映する', () => {
    const p = new PerfMonitor()
    for (let i = 0; i < 99; i++) p.recordFrame(16)
    p.recordFrame(100)
    const s = p.summary()
    expect(s.over33Ratio).toBeCloseTo(0.01)
    expect(s.maxFrameMs).toBe(100)
    expect(s.p1Fps).toBeCloseTo(10)
  })

  it('更新の処理時間と、捨てたステップを数える。空のときは 0', () => {
    const p = new PerfMonitor()
    expect(p.summary().frames).toBe(0)
    p.recordStepTime(1)
    p.recordStepTime(3)
    p.recordDrop(2)
    const s = p.summary()
    expect(s.avgStepMs).toBe(2)
    expect(s.maxStepMs).toBe(3)
    expect(s.droppedSteps).toBe(2)
  })
})
