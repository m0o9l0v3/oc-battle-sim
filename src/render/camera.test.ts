import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, fitCamera, screenToWorld, worldToScreen } from './camera.ts'

describe('fitCamera', () => {
  const viewW = DEFAULT_VIEW.maxX - DEFAULT_VIEW.minX // 36
  const viewH = DEFAULT_VIEW.maxY - DEFAULT_VIEW.minY // 28

  it.each([
    [1280, 720],
    [1920, 1080],
    [800, 600],
    [375, 812],
    [3000, 400],
  ])('%i × %i で、表示範囲の全体が収まる', (w, h) => {
    const cam = fitCamera(w, h)
    const tl = worldToScreen(cam, DEFAULT_VIEW.minX, DEFAULT_VIEW.minY)
    const br = worldToScreen(cam, DEFAULT_VIEW.maxX, DEFAULT_VIEW.maxY)
    expect(tl.x).toBeGreaterThanOrEqual(-1e-9)
    expect(tl.y).toBeGreaterThanOrEqual(-1e-9)
    expect(br.x).toBeLessThanOrEqual(w + 1e-9)
    expect(br.y).toBeLessThanOrEqual(h + 1e-9)
  })

  it('縦横比を保ち、中央に置く', () => {
    const cam = fitCamera(1280, 720)
    expect(cam.scale).toBeCloseTo(720 / viewH)
    const tl = worldToScreen(cam, DEFAULT_VIEW.minX, DEFAULT_VIEW.minY)
    const br = worldToScreen(cam, DEFAULT_VIEW.maxX, DEFAULT_VIEW.maxY)
    expect(tl.x).toBeCloseTo(1280 - br.x)
    expect(br.x - tl.x).toBeCloseTo(viewW * cam.scale)
  })

  it('世界 ↔ 画面の変換が往復できる', () => {
    const cam = fitCamera(1000, 700)
    const s = worldToScreen(cam, 3.25, 7.5)
    const w = screenToWorld(cam, s.x, s.y)!
    expect(w.x).toBeCloseTo(3.25)
    expect(w.y).toBeCloseTo(7.5)
  })

  it('大きさが 0 のときは、変換できない（null）', () => {
    const cam = fitCamera(0, 0)
    expect(cam.scale).toBe(0)
    expect(screenToWorld(cam, 1, 1)).toBeNull()
  })
})
