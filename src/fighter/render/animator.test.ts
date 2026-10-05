import { describe, expect, it } from 'vitest'
import { createBot } from '../../battle/balance.ts'
import {
  createMatchContext,
  createMatchState,
  stepMatch,
  type MatchState,
} from '../../battle/index.ts'
import { DEFAULT_COMBAT_CONFIG } from '../../combat/index.ts'
import { BASE_SPEED } from '../../physics/constants.ts'
import { DEFAULT_STATS } from '../config.ts'
import {
  createAnimatorConfig,
  createAnimatorState,
  stepAnimator,
  type AnimatorState,
} from './animator.ts'
import { STEP_MS } from './clips.ts'
import { runPlaybackRate, selectLocomotion, selectOverlay, startsLanding } from './select.ts'
import { moveInputOf, snapshotOf } from './snapshot.ts'
import type { FighterSnapshot, LocomotionState, OverlayState } from './types.ts'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../../model/index.ts'

// 標準のステージ（stage-format.md §8）
const ROWS = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........####..........',
  '........................',
  '......####....####......',
  '........................',
  '....################....',
  '....################....',
  '....################....',
  '........................',
]
const DEMO_STAGE: StageData = {
  schemaVersion: 1,
  name: '標準',
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  cells: ROWS.map((r) => [...r].map((c): CellValue => (c === '#' ? 1 : 0))),
  spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } },
}

const FRAMES = { startup: 6, active: 4, recovery: 14 }
const cfg = createAnimatorConfig(FRAMES)

const snap = (o: Partial<FighterSnapshot> = {}): FighterSnapshot => ({
  onGround: true,
  vx: 0,
  vy: 0,
  moveInput: 0,
  attackPhase: null,
  attackProgress: 0,
  hitstunRemaining: 0,
  landingImpactSpeed: null,
  ko: false,
  frozen: false,
  ...o,
})

/** n ステップ、同じ状態で進める */
const run = (st: AnimatorState, s: FighterSnapshot, n: number) => {
  for (let i = 0; i < n; i++) st = stepAnimator(st, s, cfg)
  return st
}

describe('状態の選び方（animation.md §6.2）', () => {
  it('選択A: 空中で上昇 = Jump、下降 = Fall、地面で入力または動いている = Run、それ以外 = Idle', () => {
    expect(selectLocomotion(snap({ onGround: false, vy: -5 }))).toBe('jump')
    expect(selectLocomotion(snap({ onGround: false, vy: 0 }))).toBe('fall')
    expect(selectLocomotion(snap({ onGround: false, vy: 3 }))).toBe('fall')
    expect(selectLocomotion(snap({ moveInput: 1 }))).toBe('run')
    expect(selectLocomotion(snap({ vx: -0.5 }))).toBe('run')
    expect(selectLocomotion(snap({ vx: 0.2 }))).toBe('idle')
    expect(selectLocomotion(snap())).toBe('idle')
    // 空中では、入力があっても Run にならない
    expect(selectLocomotion(snap({ onGround: false, vy: 1, moveInput: 1 }))).toBe('fall')
  })

  it('選択B: KO > Hit > Attack。当てはまらなければ null', () => {
    expect(selectOverlay(snap())).toBeNull()
    expect(selectOverlay(snap({ attackPhase: 'startup' }))).toBe('attack')
    expect(selectOverlay(snap({ attackPhase: 'recovery', hitstunRemaining: 100 }))).toBe('hit')
    expect(selectOverlay(snap({ hitstunRemaining: 100, ko: true }))).toBe('ko')
  })

  it('Run の再生倍率: 実際の移動速度 ÷ 標準。0.6〜1.6', () => {
    expect(runPlaybackRate(BASE_SPEED, BASE_SPEED)).toBe(1)
    expect(runPlaybackRate(-BASE_SPEED * 1.2, BASE_SPEED)).toBeCloseTo(1.2)
    expect(runPlaybackRate(0.1, BASE_SPEED)).toBe(0.6)
    expect(runPlaybackRate(100, BASE_SPEED)).toBe(1.6)
  })

  it('着地: 6 セル/秒以上のときだけ', () => {
    expect(startsLanding(snap({ landingImpactSpeed: 6 }))).toBe(true)
    expect(startsLanding(snap({ landingImpactSpeed: 5.9 }))).toBe(false)
    expect(startsLanding(snap({ landingImpactSpeed: null }))).toBe(false)
  })

  it('決定的: 同じ入力から、同じ状態（乱数・時計なし）', () => {
    const s = snap({ onGround: false, vy: 2, attackPhase: 'active', attackProgress: 0.3 })
    expect(selectLocomotion(s)).toBe(selectLocomotion({ ...s }))
    expect(selectOverlay(s)).toBe(selectOverlay({ ...s }))
  })
})

describe('試合のファイターから、状態への変換', () => {
  it('左右の入力: 片方だけ押していれば向き、両方押していれば打ち消して 0', () => {
    expect(moveInputOf({ leftSince: 3, rightSince: null })).toBe(-1)
    expect(moveInputOf({ leftSince: null, rightSince: 3 })).toBe(1)
    expect(moveInputOf({ leftSince: 3, rightSince: 5 })).toBe(0)
    expect(moveInputOf({ leftSince: null, rightSince: null })).toBe(0)
  })

  it('攻撃の区間と進み、やられ中の残り時間（ms）、READY・END では走らない', () => {
    const f = {
      body: { vx: 0, vy: 0, onGround: true },
      combat: { hitstun: 6, hitstop: 0, down: false, attack: { t: 7 } },
      control: { leftSince: 1, rightSince: null },
      landingImpactSpeed: null,
    }
    const s = snapshotOf(f, FRAMES, true)
    expect(s.attackPhase).toBe('active')
    expect(s.attackProgress).toBeCloseTo(7 / 24)
    expect(s.hitstunRemaining).toBeCloseTo(6 * STEP_MS)
    expect(s.moveInput).toBe(-1)
    expect(snapshotOf(f, FRAMES, false).moveInput).toBe(0)
    expect(
      snapshotOf({ ...f, combat: { ...f.combat, attack: { t: 3 } } }, FRAMES, true).attackPhase,
    ).toBe('startup')
    expect(
      snapshotOf({ ...f, combat: { ...f.combat, attack: { t: 10 } } }, FRAMES, true).attackPhase,
    ).toBe('recovery')
    expect(
      snapshotOf({ ...f, combat: { ...f.combat, attack: null } }, FRAMES, true).attackPhase,
    ).toBeNull()
    expect(snapshotOf({ ...f, combat: { ...f.combat, hitstop: 2 } }, FRAMES, true).frozen).toBe(
      true,
    )
  })
})

describe('アニメーションの更新', () => {
  it('攻撃のフレームが、仕様の式を満たさないと、起動時に拒否する', () => {
    expect(() => createAnimatorConfig({ startup: 1, active: 4, recovery: 14 })).toThrow()
  })

  it('状態がゲームに応じて切り替わる: Idle → Run → Jump → Fall → Idle（着地のつぶれ付き）', () => {
    let st = run(createAnimatorState(), snap(), 10)
    expect(st.loco).toBe('idle')
    expect(st.overlay).toBeNull()
    st = run(st, snap({ moveInput: 1, vx: BASE_SPEED }), 10)
    expect(st.loco).toBe('run')
    st = run(st, snap({ onGround: false, vy: -8 }), 3)
    expect(st.loco).toBe('jump')
    st = run(st, snap({ onGround: false, vy: 3 }), 3)
    expect(st.loco).toBe('fall')
    // 着地: そのステップから、root が横に広がり縦に縮む。80 ms で戻る
    st = stepAnimator(st, snap({ landingImpactSpeed: 9 }), cfg)
    expect(st.loco).toBe('idle')
    expect(st.landingT).toBe(0)
    expect(st.pose.root.sy).toBeLessThan(st.core.root.sy)
    expect(st.pose.root.sx).toBeGreaterThan(st.core.root.sx)
    st = run(st, snap(), 6) // 6 ステップ = 100 ms
    expect(st.landingT).toBeNull()
    expect(st.pose).toEqual(st.core)
  })

  it('着地のつぶれは、下の層に掛ける（待機 sy 1.02 に重ねると 0.918）', () => {
    // Idle を 600 ms（36 ステップ）進めて、sy を 1.02 にする
    let st = run(createAnimatorState(), snap(), 36)
    expect(st.core.root.sy).toBeCloseTo(1.02, 2)
    st = stepAnimator(st, snap({ landingImpactSpeed: 8 }), cfg)
    expect(st.pose.root.sy / st.core.root.sy).toBeCloseTo(0.9)
    expect(st.pose.root.sx / st.core.root.sx).toBeCloseTo(1.08)
  })

  it('Attack は、上半身だけを置き換える。脚は、移動の動きのまま（地上も空中も 1 つのクリップ）', () => {
    let st = run(createAnimatorState(), snap({ moveInput: 1, vx: BASE_SPEED }), 20)
    const legRun = st.pose.legF.rot
    st = stepAnimator(
      st,
      snap({ moveInput: 1, vx: BASE_SPEED, attackPhase: 'active', attackProgress: 8 / 24 }),
      cfg,
    )
    expect(st.overlay).toBe('attack')
    expect(st.loco).toBe('run')
    // 30 ms のつなぎがあるので、攻撃の途中では、上半身が攻撃の値に向かう。face は即時
    expect(st.pose.face).toBe('attack')
    // 同じ動きの脚は、攻撃の前後で、連続して動く（置き換えられない）
    expect(Math.abs(st.pose.legF.rot - legRun)).toBeLessThan(40)
    // つなぎが終わったら、打撃のポーズ
    st = run(
      st,
      snap({ moveInput: 1, vx: BASE_SPEED, attackPhase: 'active', attackProgress: 8 / 24 }),
      4,
    )
    expect(st.pose.armF.rot).toBeCloseTo(95)
    expect(st.pose.torso.rot).toBeCloseTo(14)
    // 攻撃中に踏み切ったら、脚は Jump（古いポーズのまま止まらない）
    st = run(
      st,
      snap({ onGround: false, vy: -8, attackPhase: 'recovery', attackProgress: 0.7 }),
      10,
    )
    expect(st.loco).toBe('jump')
    expect(st.overlay).toBe('attack')
    expect(st.pose.legF.rot).toBeCloseTo(30)
  })

  it('攻撃中に、やられたら、Hit に切り替える（攻撃の動きは打ち切る）', () => {
    let st = run(createAnimatorState(), snap({ attackPhase: 'startup', attackProgress: 0.1 }), 5)
    expect(st.overlay).toBe('attack')
    st = run(st, snap({ attackPhase: null, hitstunRemaining: 500 }), 5)
    expect(st.overlay).toBe('hit')
    expect(st.pose.face).toBe('hit')
    expect(st.pose.torso.rot).toBeCloseTo(-10, 0)
  })

  it('Hit: やられ中が 200 ms より短くても、200 ms は Hit のまま（ちらつかない）', () => {
    const hitSnap = snap({ hitstunRemaining: 5 * STEP_MS })
    let st = stepAnimator(createAnimatorState(), hitSnap, cfg)
    expect(st.overlay).toBe('hit')
    // やられ中が終わる（残り 0）
    let steps = 0
    while (st.overlay === 'hit' && steps < 60) {
      st = stepAnimator(
        st,
        snap({ hitstunRemaining: Math.max(0, hitSnap.hitstunRemaining - steps * STEP_MS) }),
        cfg,
      )
      steps++
    }
    // 200 ms ≈ 12 ステップ
    expect(steps).toBeGreaterThanOrEqual(11)
    expect(steps).toBeLessThanOrEqual(14)
    expect(st.overlay).toBeNull()
  })

  it('Hit: 続けて受けたら、最初からやり直す', () => {
    let st = stepAnimator(createAnimatorState(), snap({ hitstunRemaining: 300 }), cfg)
    st = run(st, snap({ hitstunRemaining: 200 }), 6)
    const t = st.hit!.t
    expect(t).toBeGreaterThan(0)
    st = stepAnimator(st, snap({ hitstunRemaining: 500 }), cfg)
    expect(st.hit!.t).toBe(0)
  })

  it('ヒットストップ中は、見た目の時間も止まる（移動の動き・Hit・着地）', () => {
    let st = run(createAnimatorState(), snap({ moveInput: 1, vx: BASE_SPEED }), 20)
    const t0 = st.locoT
    st = run(st, snap({ moveInput: 1, vx: BASE_SPEED, frozen: true }), 3)
    expect(st.locoT).toBe(t0)
  })

  it('KO: 即時に切り替わり、回転しながら小さくなる。復帰（リスポーン）で、逆回転せずに戻る', () => {
    let st = run(createAnimatorState(), snap(), 5)
    st = stepAnimator(st, snap({ ko: true }), cfg)
    expect(st.overlay).toBe('ko')
    expect(st.pose.face).toBe('ko')
    // 0 ms のつなぎ: 最初のステップから、KO のポーズ
    expect(st.pose.torso.rot).toBeCloseTo(-15)
    st = run(st, snap({ ko: true }), 54) // 900 ms
    expect(st.pose.root.rot).toBeCloseTo(720, 0)
    expect(st.pose.root.sx).toBeCloseTo(0.6, 1)
    // 最後のポーズで止まる
    const rot = st.pose.root.rot
    st = run(st, snap({ ko: true }), 30)
    expect(st.pose.root.rot).toBeCloseTo(rot, 5)
    // リスポーン: 60 ms かけて Idle へ。途中で、root.rot が 720 に戻らない（巻き戻って、回らない）
    for (let i = 0; i < 5; i++) {
      st = stepAnimator(st, snap(), cfg)
      expect(Math.abs(st.pose.root.rot)).toBeLessThan(180)
    }
    expect(st.overlay).toBeNull()
  })

  it('つなぎ: 移動の動きどうしは 60 ms。急に変わらない', () => {
    let st = run(createAnimatorState(), snap(), 10)
    const before = st.pose.armF.rot
    st = stepAnimator(st, snap({ onGround: false, vy: -8 }), cfg)
    const after = st.pose.armF.rot
    // Jump の 0 ms は Neutral に近く、腕はまだ上がっていない（つなぎの途中）
    expect(Math.abs(after - before)).toBeLessThan(40)
    st = run(st, snap({ onGround: false, vy: -8 }), 30)
    expect(st.pose.armF.rot).toBeCloseTo(140, 0)
  })

  it('再生の速さは、移動速度に比例する（能力値の違いが、動きに出る）', () => {
    const phase = (vx: number) => {
      let st = createAnimatorState()
      st = run(st, snap({ moveInput: 1, vx }), 30)
      return st.locoT
    }
    expect(phase(BASE_SPEED * 1.3) / phase(BASE_SPEED * 0.7)).toBeGreaterThan(1.5)
    // 範囲の外は、頭打ち
    expect(phase(BASE_SPEED * 5)).toBeCloseTo(phase(BASE_SPEED * 1.6), 5)
  })

  it('同じ入力の列から、同じポーズ（決定的）', () => {
    const seq = [
      snap(),
      snap({ moveInput: 1, vx: 3 }),
      snap({ onGround: false, vy: -4 }),
      snap({ attackPhase: 'active', attackProgress: 0.3 }),
      snap({ hitstunRemaining: 300 }),
      snap({ ko: true }),
    ]
    const play = () => {
      let st = createAnimatorState()
      const out: unknown[] = []
      for (let i = 0; i < 100; i++) {
        st = stepAnimator(st, seq[Math.floor(i / 17) % seq.length]!, cfg)
        out.push(st.pose)
      }
      return out
    }
    expect(play()).toEqual(play())
  })

  it('1ステップの計算は、20 体でも小さい（60 FPS に影響しない。NFR-03）', () => {
    const states = Array.from({ length: 20 }, () => createAnimatorState())
    const s = snap({ moveInput: 1, vx: 3, attackPhase: 'active', attackProgress: 0.3 })
    const t0 = performance.now()
    for (let i = 0; i < 300; i++) {
      for (let k = 0; k < states.length; k++) states[k] = stepAnimator(states[k]!, s, cfg)
    }
    const perStep = (performance.now() - t0) / 300
    expect(perStep).toBeLessThan(4) // 1 ステップの処理時間の合格基準（test-plan.md §7.3）
  })
})

describe('実際の試合での、7状態の切り替え', () => {
  it('ボットどうしの試合で、7つの状態すべてが現れ、状態の選び方が、ゲームの状態と対応する', () => {
    const seen = new Set<string>()
    const ctx = createMatchContext(DEMO_STAGE, [DEFAULT_STATS, DEFAULT_STATS])
    const frames = {
      startup: DEFAULT_COMBAT_CONFIG.attackStartup,
      active: DEFAULT_COMBAT_CONFIG.attackActive,
      recovery: DEFAULT_COMBAT_CONFIG.attackRecovery,
    }
    const config = createAnimatorConfig(frames)
    for (const seed of [1, 2, 3]) {
      const bots = [createBot(0, ctx, seed), createBot(1, ctx, seed)] as const
      let s: MatchState = createMatchState(ctx)
      let anims: [AnimatorState, AnimatorState] = [createAnimatorState(), createAnimatorState()]
      for (let i = 0; i < 6000 && s.phase !== 'end'; i++) {
        s = stepMatch(s, [bots[0](s), bots[1](s)], ctx).state
        anims = [0, 1].map((k) => {
          const f = s.fighters[k]!
          const sn = snapshotOf(f, frames, s.phase === 'fight')
          // ゲームの状態との対応
          const loco: LocomotionState = selectLocomotion(sn)
          const overlay: OverlayState | null = selectOverlay(sn)
          if (f.combat.down) expect(overlay).toBe('ko')
          else if (f.combat.hitstun > 0) expect(overlay).toBe('hit')
          else if (f.combat.attack) expect(overlay).toBe('attack')
          else expect(overlay).toBeNull()
          if (!f.body.onGround) expect(loco).toBe(f.body.vy < 0 ? 'jump' : 'fall')
          seen.add(loco)
          if (overlay) seen.add(overlay)
          return stepAnimator(anims[k as 0 | 1], sn, config)
        }) as [AnimatorState, AnimatorState]
      }
    }
    for (const state of ['idle', 'run', 'jump', 'fall', 'attack', 'hit', 'ko']) {
      expect(seen.has(state), state).toBe(true)
    }
  })
})
