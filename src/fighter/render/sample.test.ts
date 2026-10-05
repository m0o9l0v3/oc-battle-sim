import { describe, expect, it } from 'vitest'
import { buildAttackClip, buildHitClip, FALL, IDLE, JUMP, KO, RUN, STEP_MS } from './clips.ts'
import { overlayPose, replacePose } from './pose.ts'
import { clonePose, lerpPose, NEUTRAL_POSE, normalizeRootRot, sampleClip } from './sample.ts'

describe('sampleClip', () => {
  it('キーフレームの時刻で、仕様の値になる（Idle）', () => {
    const p = sampleClip(IDLE, 600)
    expect(p.root.sy).toBeCloseTo(1.02)
    expect(p.torso.rot).toBeCloseTo(1)
    expect(p.head.dy).toBeCloseTo(1)
    expect(p.armF.rot).toBeCloseTo(7)
    expect(p.armB.rot).toBeCloseTo(-7)
    // 書いていない値は、Neutral
    expect(p.legF.rot).toBe(3)
    expect(p.legB.rot).toBe(-3)
  })

  it('繰り返すクリップは折り返し、繰り返さないクリップは最後のポーズで止まる', () => {
    expect(sampleClip(IDLE, 1200 + 600).root.sy).toBeCloseTo(1.02)
    expect(sampleClip(RUN, 600 * 3 + 300).legF.rot).toBeCloseTo(-40)
    expect(sampleClip(JUMP, 10_000)).toEqual(sampleClip(JUMP, 160))
    expect(sampleClip(KO, 99_999).root.rot).toBe(720)
    expect(sampleClip(IDLE, -600)).toEqual(sampleClip(IDLE, 600))
  })

  it('Run: 値の表（0 / 150 / 300 / 450 ms）', () => {
    const at = (t: number) => sampleClip(RUN, t)
    expect(at(0).armF.rot).toBe(-40)
    expect(at(0).legF.rot).toBe(40)
    expect(at(150).root.dy).toBe(3)
    expect(at(150).legB.rot).toBe(20)
    expect(at(300).armF.rot).toBe(40)
    expect(at(300).legB.rot).toBe(40)
    expect(at(450).legF.rot).toBe(20)
    expect(at(0).torso.rot).toBe(8)
    expect(at(0).head.rot).toBe(-4)
  })

  it('Jump は、地面を離れた直後（Neutral）から伸びの姿勢になり、root.dy は動かさない', () => {
    expect(sampleClip(JUMP, 0).armF.rot).toBe(4)
    const stretch = sampleClip(JUMP, 60)
    expect(stretch.root.sx).toBeCloseTo(0.95)
    expect(stretch.root.sy).toBeCloseTo(1.08)
    expect(stretch.armF.rot).toBeCloseTo(140)
    for (let t = 0; t <= 160; t += 10) expect(sampleClip(JUMP, t).root.dy).toBe(0)
  })

  it('Fall: 腕を上げ、脚を開く', () => {
    const p = sampleClip(FALL, 250)
    expect(p.armF.rot).toBeCloseTo(165)
    expect(p.legB.rot).toBeCloseTo(-26)
  })

  it('補間: easeOut は、前半で大きく進む', () => {
    const half = sampleClip(JUMP, 30) // 0→60 ms は easeOut。中間
    const k = (half.armF.rot - 4) / (140 - 4)
    expect(k).toBeCloseTo(0.75)
  })

  it('face は補間せず、次のキーフレームの時刻に、階段で切り替わる', () => {
    const atk = buildAttackClip({ startup: 6, active: 4, recovery: 14 })
    const k1 = 4 * STEP_MS
    expect(sampleClip(atk, 0).face).toBe('normal')
    expect(sampleClip(atk, k1 - 1).face).toBe('normal')
    expect(sampleClip(atk, k1).face).toBe('attack')
    expect(sampleClip(atk, 20 * STEP_MS).face).toBe('attack')
    expect(sampleClip(atk, atk.duration - 1).face).toBe('attack')
    expect(sampleClip(atk, atk.duration).face).toBe('normal')
    expect(sampleClip(KO, 0).face).toBe('ko')
    expect(sampleClip(KO, 899).face).toBe('ko')
  })

  it('Attack の姿勢: 構え → 打撃 → 戻り（animation.md §5.5）', () => {
    const atk = buildAttackClip({ startup: 6, active: 4, recovery: 14 })
    const ready = sampleClip(atk, 4 * STEP_MS)
    expect(ready.root.dx).toBeCloseTo(-2)
    expect(ready.armF.rot).toBeCloseTo(-70)
    const strike = sampleClip(atk, 7 * STEP_MS)
    expect(strike.root.dx).toBeCloseTo(5)
    expect(strike.armF.rot).toBeCloseTo(95)
    expect(strike.torso.rot).toBeCloseTo(14)
    // 打撃は、持続の終わりまで保つ
    expect(sampleClip(atk, 10 * STEP_MS).armF.rot).toBeCloseTo(95)
    // 終わりは、基準
    expect(sampleClip(atk, atk.duration).armF.rot).toBeCloseTo(4)
  })

  it('Hit: 60 ms でのけぞり、終わりの 100 ms で戻る。長さに合わせて保つ', () => {
    const hit = buildHitClip(500)
    expect(sampleClip(hit, 0).face).toBe('hit')
    const recoil = sampleClip(hit, 60)
    expect(recoil.torso.rot).toBeCloseTo(-10)
    expect(recoil.root.dx).toBeCloseTo(0)
    expect(sampleClip(hit, 400).torso.rot).toBeCloseTo(-10)
    expect(sampleClip(hit, 450).torso.rot).toBeGreaterThan(-10)
    expect(sampleClip(hit, 500).torso.rot).toBeCloseTo(0)
    expect(sampleClip(hit, 500).face).toBe('normal')
  })

  it('KO: 回転して小さくなる。root.rot は +720 まで', () => {
    expect(sampleClip(KO, 450).root.rot).toBeCloseTo(360)
    expect(sampleClip(KO, 900).root.sx).toBeCloseTo(0.6)
    expect(sampleClip(KO, 0).torso.rot).toBe(-15)
  })

  it('同じ入力から、同じ結果（決定的）。返したポーズを書き換えても、クリップは変わらない', () => {
    const a = sampleClip(RUN, 123.4)
    const b = sampleClip(RUN, 123.4)
    expect(a).toEqual(b)
    a.armF.rot = 999
    expect(sampleClip(RUN, 123.4).armF.rot).not.toBe(999)
    expect(NEUTRAL_POSE.armF.rot).toBe(4)
  })

  it('lerpPose: 数値は補間、face は後ろの値。normalizeRootRot: 720° は 0°', () => {
    const a = clonePose(NEUTRAL_POSE)
    const b = clonePose(NEUTRAL_POSE)
    b.root.rot = 100
    b.face = 'hit'
    const m = lerpPose(a, b, 0.5)
    expect(m.root.rot).toBe(50)
    expect(m.face).toBe('hit')
    const spun = clonePose(NEUTRAL_POSE)
    spun.root.rot = 720
    expect(normalizeRootRot(spun).root.rot).toBe(0)
    spun.root.rot = 190
    expect(normalizeRootRot(spun).root.rot).toBe(-170)
  })
})

describe('ポーズの合成（animation.md §4.5）', () => {
  const loco = sampleClip(RUN, 0)
  const atk = buildAttackClip({ startup: 6, active: 4, recovery: 14 })

  it('置き換え: affects の部位・値だけ。root は dx だけ、脚は移動の動きのまま', () => {
    const strike = sampleClip(atk, 7 * STEP_MS)
    const out = replacePose(loco, strike, atk.affects)
    expect(out.root.dx).toBeCloseTo(5)
    expect(out.root.dy).toBe(loco.root.dy)
    expect(out.root.sy).toBe(loco.root.sy)
    expect(out.torso.rot).toBeCloseTo(14)
    expect(out.armF.rot).toBeCloseTo(95)
    expect(out.legF.rot).toBe(loco.legF.rot)
    expect(out.legB.rot).toBe(loco.legB.rot)
    expect(out.face).toBe('attack')
    // 元を書き換えない
    expect(loco.armF.rot).toBe(-40)
  })

  it('重ね: 拡大縮小は乗算、位置と角度は加算。何も変えない値は、下の層を変えない', () => {
    const base = sampleClip(IDLE, 600) // root.sy 1.02
    const out = overlayPose(base, { root: { sx: 1.08, sy: 0.9 } })
    expect(out.root.sy).toBeCloseTo(1.02 * 0.9)
    expect(out.root.sx).toBeCloseTo(1.08)
    expect(overlayPose(base, { root: { sx: 1, sy: 1, dx: 0, dy: 0, rot: 0 } })).toEqual(base)
    const moved = overlayPose(base, { head: { dy: 2, rot: 5 } })
    expect(moved.head.dy).toBeCloseTo(base.head.dy + 2)
    expect(moved.head.rot).toBeCloseTo(base.head.rot + 5)
  })
})
