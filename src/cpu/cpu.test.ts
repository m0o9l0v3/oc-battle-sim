// 簡易CPUのテスト（cpu-opponent.md §8）
import { describe, expect, it } from 'vitest'
import {
  createMatchContext,
  createMatchState,
  DUMMY_INPUT,
  NO_INPUT,
  stepMatch,
  type InputSource,
  type MatchState,
  type PlayerInput,
} from '../battle/index.ts'
import { DEFAULT_STATS } from '../fighter/index.ts'
import { STAGE_PRESETS, presetStage, stageFromRows } from '../stage/index.ts'
import { createCpu, cpuSetupOf } from './brain.ts'
import {
  clampCpuLevel,
  CPU_LEVEL_RANGE,
  CPU_LEVELS,
  DEFAULT_CPU_LEVEL_ID,
  type CpuLevel,
} from './level.ts'
import { simulateCpuMatch } from './sim.ts'
import { CpuSource } from './source.ts'
import { createTerrain } from './terrain.ts'
import { viewOf, type CpuView, type FighterView } from './view.ts'

const STD = { ...DEFAULT_STATS }
const standard = presetStage('standard')
const idle: InputSource = { sample: () => DUMMY_INPUT, dispose() {} }
const LEVEL_IDS = Object.keys(CPU_LEVELS) as (keyof typeof CPU_LEVELS)[]

const fighter = (p: Partial<FighterView> = {}): FighterView => ({
  x: 10,
  y: 10,
  vx: 0,
  vy: 0,
  onGround: true,
  airJumpsLeft: 2,
  facing: 1,
  damage: 0,
  attack: null,
  stunned: false,
  invulnerable: false,
  down: false,
  ...p,
})
const view = (step: number, self: Partial<FighterView>, foe: Partial<FighterView>): CpuView => ({
  step,
  phase: 'fight',
  self: fighter(self),
  foe: fighter(foe),
})

describe('強さの設定（§6）', () => {
  it('標準は「ふつう」。どのプリセットも、調整の範囲に入っている', () => {
    expect(DEFAULT_CPU_LEVEL_ID).toBe('normal')
    for (const id of LEVEL_IDS) {
      for (const [k, [lo, hi]] of Object.entries(CPU_LEVEL_RANGE)) {
        const v = CPU_LEVELS[id][k as keyof CpuLevel]
        expect(v, `${id}.${k}`).toBeGreaterThanOrEqual(lo)
        expect(v, `${id}.${k}`).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('強いほど、反応が速く、攻撃が多く、ミスが少ない', () => {
    const { easy, normal, hard } = CPU_LEVELS
    expect(easy.reactionSteps).toBeGreaterThan(normal.reactionSteps)
    expect(normal.reactionSteps).toBeGreaterThan(hard.reactionSteps)
    expect(easy.attackChance).toBeLessThan(normal.attackChance)
    expect(normal.attackChance).toBeLessThan(hard.attackChance)
    expect(easy.missChance).toBeGreaterThan(normal.missChance)
    expect(normal.missChance).toBeGreaterThan(hard.missChance)
  })

  it('範囲の外の値は、範囲に収める。数でない値は、標準の値にする', () => {
    const l = clampCpuLevel({ reactionSteps: 1, attackChance: 2, missChance: 0.9, thinkSteps: 3.6 })
    expect(l.reactionSteps).toBe(4)
    expect(l.attackChance).toBe(1)
    expect(l.missChance).toBe(0.5)
    expect(l.thinkSteps).toBe(4)
    expect(clampCpuLevel({ evadeChance: Number.NaN }).evadeChance).toBe(
      CPU_LEVELS.normal.evadeChance,
    )
  })
})

describe('見てよい盤面（§3.2）', () => {
  it('ビューには、相手の入力・やられ中の残り・先行入力などの内部の値を含めない', () => {
    const ctx = createMatchContext(standard, [STD, STD])
    const v = viewOf(createMatchState(ctx), 1)
    expect(Object.keys(v.foe).sort()).toEqual(
      [
        'airJumpsLeft',
        'attack',
        'damage',
        'down',
        'facing',
        'invulnerable',
        'onGround',
        'stunned',
        'vx',
        'vy',
        'x',
        'y',
      ].sort(),
    )
    expect(v.self.x).toBe(ctx.spawns[1].x)
    expect(v.foe.x).toBe(ctx.spawns[0].x)
  })

  it('CpuSource は、盤面がないときは何もしない。盤面（MatchState）を書き換えない', () => {
    const ctx = createMatchContext(standard, [STD, STD])
    const cpu = new CpuSource(ctx, 1, CPU_LEVELS.hard, 1)
    expect(cpu.sample({ step: 0 })).toEqual(NO_INPUT)
    let s = createMatchState(ctx)
    for (let i = 0; i < 600; i++) {
      const before = JSON.stringify(s)
      const input = cpu.sample({ step: s.step, observation: s })
      expect(JSON.stringify(s)).toBe(before)
      s = stepMatch(s, [NO_INPUT, input], ctx).state
    }
  })
})

describe('ステージの形の読み取り（§5.1）', () => {
  const t = createTerrain(standard)
  it('足場の上・下に足場がある列は安全。足場の外の列は、落ちたら場外', () => {
    expect(t.groundBelow(7.5, 7)).toBe(8) // 左の足場（行 8）
    expect(t.groundBelow(10.5, 9)).toBe(10) // 床（行 10）
    expect(t.safe(4.1, 10)).toBe(true)
    expect(t.safe(3.9, 10)).toBe(false)
    expect(t.safe(-2, 5)).toBe(false)
  })
  it('頭の上の空き（足場の下では、跳んでも上がれない）', () => {
    expect(t.headroom(7, 10)).toBeCloseTo(0.2) // 行 8 の足場の下面（9）まで
    expect(t.headroom(12, 10)).toBeCloseTo(2.2) // 中央の高い足場（行 6）の下面（7）まで
    expect(t.headroom(19, 10)).toBe(Infinity)
  })
  it('待つ位置は、中央の広い足場', () => {
    expect(t.home).toEqual({ row: 10, col: 4, width: 16 })
  })
})

describe('行動（§4）', () => {
  const ctx = createMatchContext(standard, [STD, STD])
  const setup = cpuSetupOf(ctx, 1)
  const sure: CpuLevel = { ...CPU_LEVELS.hard, attackChance: 1, evadeChance: 0, retreatChance: 0 }

  /** 同じビューを続けて渡し、最初に、ある行動を取ったステップを返す */
  const firstAction = (decide: ReturnType<typeof createCpu>, v: (i: number) => CpuView, n = 60) => {
    const out: string[] = []
    for (let i = 0; i < n; i++) out.push(decide(v(i)).action)
    return out
  }

  it('離れた相手には、近づく（相手の方向に、左右を押す）', () => {
    const decide = createCpu(setup, sure, 1)
    const d = decide(view(200, { x: 15 }, { x: 8 }))
    expect(d.action).toBe('approach')
    expect(d.input).toMatchObject({ left: true, right: false })
  })

  it('攻撃が届く相手には、攻撃する（相手の方を向いて）', () => {
    const decide = createCpu(setup, sure, 1)
    const acts = firstAction(decide, (i) => view(200 + i, { x: 10.8 }, { x: 10 }), 10)
    const at = acts.indexOf('attack')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(at).toBeLessThanOrEqual(sure.reactionSteps + sure.thinkSteps)
  })

  it('反応の遅れ: 相手が近づいても、reactionSteps のあいだは、前の位置で判断する', () => {
    const lv: CpuLevel = { ...sure, reactionSteps: 20, thinkSteps: 2 }
    const decide = createCpu(setup, lv, 1)
    for (let i = 0; i < 30; i++) decide(view(200 + i, { x: 15 }, { x: 5 })) // 遠い
    const acts: string[] = []
    for (let i = 0; i < 30; i++) acts.push(decide(view(230 + i, { x: 15 }, { x: 14.3 })).action)
    expect(acts.slice(0, 19)).not.toContain('attack')
    expect(acts.slice(19)).toContain('attack')
  })

  it('固まり防止: 届く距離に入った直後は、抽選なしでは攻撃しない。1 秒続けていたら攻撃する', () => {
    const lv: CpuLevel = {
      ...sure,
      attackChance: 0,
      missChance: 0,
      reactionSteps: 4,
      thinkSteps: 2,
    }
    const decide = createCpu(setup, lv, 1)
    // 長く近づいてから（前の攻撃から 1 秒以上たってから）、届く距離に入る
    for (let i = 0; i < 200; i++) decide(view(200 + i, { x: 15 }, { x: 5 }))
    const acts: string[] = []
    for (let i = 0; i < 90; i++) acts.push(decide(view(400 + i, { x: 10.8 }, { x: 10 })).action)
    const at = acts.indexOf('attack')
    expect(at).toBeGreaterThanOrEqual(60)
    expect(at).toBeLessThanOrEqual(60 + lv.reactionSteps + lv.thinkSteps)
  })

  it('回避: 相手が攻撃を構えたら、離れるか、ジャンプでかわす', () => {
    const lv: CpuLevel = { ...CPU_LEVELS.hard, evadeChance: 1, attackChance: 0, missChance: 0 }
    const decide = createCpu(setup, lv, 3)
    const acts: string[] = []
    for (let i = 0; i < 20; i++) {
      const d = decide(
        view(300 + i, { x: 11 }, { x: 10, facing: 1, attack: { t: i % 10, facing: 1 } }),
      )
      acts.push(d.action)
      if (d.action === 'evade') {
        // 離れる（右）か、ジャンプ
        expect(d.input.right || d.input.jumpPressed).toBe(true)
        expect(d.input.left && !d.input.jumpPressed).toBe(false)
      }
    }
    expect(acts).toContain('evade')
  })

  it('回避の抽選に外れたときは、回避しない（evadeChance 0）', () => {
    const lv: CpuLevel = { ...CPU_LEVELS.hard, evadeChance: 0, attackChance: 0, missChance: 0 }
    const decide = createCpu(setup, lv, 3)
    for (let i = 0; i < 40; i++) {
      const d = decide(view(300 + i, { x: 11 }, { x: 10, attack: { t: i % 10, facing: 1 } }))
      expect(d.action).not.toBe('evade')
    }
  })

  it('足場の端: 相手が場外にいても、追って落ちない（端で待つ）', () => {
    const decide = createCpu(setup, sure, 1)
    for (let i = 0; i < 40; i++) {
      const d = decide(view(200 + i, { x: 4.75 }, { x: 1, y: 9, onGround: false, vy: 2 }))
      expect(d.action).toBe('wait')
      expect(d.input.left).toBe(false)
    }
  })

  it('場外で、下に足場がないときは、戻る（足場の方へ動き、落ち始めたら空中ジャンプ）', () => {
    const decide = createCpu(setup, sure, 1)
    const d1 = decide(view(200, { x: 2, y: 10.5, onGround: false, vy: -3 }, { x: 12 }))
    expect(d1.action).toBe('recover')
    expect(d1.input.right).toBe(true)
    const d2 = decide(view(201, { x: 2, y: 10.5, onGround: false, vy: 3 }, { x: 12 }))
    expect(d2.input.jumpPressed).toBe(true)
  })

  it('ジャンプは押しっぱなしにしない（空中ジャンプを一度に使い切らない）', () => {
    const decide = createCpu(setup, sure, 1)
    let last = -Infinity
    for (let i = 0; i < 30; i++) {
      const d = decide(view(200 + i, { x: 2, y: 10.5, onGround: false, vy: 3 }, { x: 12 }))
      if (d.input.jumpPressed) {
        expect(i - last).toBeGreaterThanOrEqual(8)
        last = i
      }
    }
  })

  it('READY の間・やられ中・撃墜中は、何もしない', () => {
    const decide = createCpu(setup, sure, 1)
    expect(decide({ ...view(0, {}, {}), phase: 'ready' }).input).toEqual(NO_INPUT)
    expect(decide(view(200, { stunned: true }, { x: 10.5 })).input).toEqual(NO_INPUT)
    expect(decide(view(201, { down: true }, { x: 10.5 })).input).toEqual(NO_INPUT)
  })
})

describe('決定性（§8）', () => {
  it('同じシード・同じ盤面の列から、同じ入力の列', () => {
    const a = simulateCpuMatch(standard, [STD, STD], [CPU_LEVELS.normal, CPU_LEVELS.hard], 7)
    const b = simulateCpuMatch(standard, [STD, STD], [CPU_LEVELS.normal, CPU_LEVELS.hard], 7)
    expect(a.inputs).toEqual(b.inputs)
    expect(a.events).toEqual(b.events)
    expect(a.state).toEqual(b.state)
  })
  it('シードが違えば、違う動きになる', () => {
    const a = simulateCpuMatch(standard, [STD, STD], [CPU_LEVELS.normal, CPU_LEVELS.normal], 1)
    const b = simulateCpuMatch(standard, [STD, STD], [CPU_LEVELS.normal, CPU_LEVELS.normal], 2)
    expect(a.inputs).not.toEqual(b.inputs)
  })
})

describe('1試合が成立する（§7。全プリセット × 全強さ）', () => {
  for (const preset of STAGE_PRESETS) {
    for (const id of LEVEL_IDS) {
      it(`${preset.id} / ${id}: CPU どうしで最後まで進み、自分から落ちず、固まらない`, () => {
        const lv = CPU_LEVELS[id]
        const r = simulateCpuMatch(preset.stage, [STD, STD], [lv, lv], 1)
        expect(r.state.phase).toBe('end')
        expect(r.state.outcome).not.toBeNull()
        expect(r.events.filter((e) => e.type === 'hit').length).toBeGreaterThan(20)
        expect(r.selfKos).toEqual([0, 0])
        // 操作できるのに何もしない時間は、2 秒未満（相手の撃墜中に待つ 1.5 秒を含む）
        expect(Math.max(...r.maxIdle)).toBeLessThan(120)
        // 1 つの行動だけを、繰り返し続けない
        for (const acts of r.actions) {
          const total = Object.values(acts).reduce((a, b) => a + b, 0)
          expect(Object.keys(acts).length).toBeGreaterThanOrEqual(4)
          expect(Math.max(...Object.values(acts)) / total).toBeLessThan(0.6)
        }
      })
      it(`${preset.id} / ${id}: 動かない相手を、時間内に 3 回撃墜する`, () => {
        const r = simulateCpuMatch(preset.stage, [STD, STD], [idle, CPU_LEVELS[id]], 1)
        expect(r.state.outcome).toEqual({ winner: 'p2', reason: 'stocks' })
        expect(r.selfKos[1]).toBe(0)
      })
    }
  }

  it('能力値が低い CPU（ジャンプ 2・速さ 2）でも、自分から落ちない', () => {
    const weak = { attackPower: 8, defense: 8, jumpPower: 2, speed: 2 }
    for (const preset of STAGE_PRESETS) {
      const lv = CPU_LEVELS.normal
      const r = simulateCpuMatch(preset.stage, [STD, weak], [lv, lv], 2)
      expect(r.selfKos[1], preset.id).toBe(0)
    }
  })

  it('穴のあるステージで、ステージの外へ吹き飛ばされても、戻れる', () => {
    const stage = stageFromRows([
      ...Array(9).fill('.'.repeat(24)),
      '..1..................2..',
      '######.##########.######',
      '######.##########.######',
      '######.##########.######',
      '.'.repeat(24),
    ])
    const ctx = createMatchContext(stage, [STD, STD])
    const cpu = new CpuSource(ctx, 1, CPU_LEVELS.normal, 1)
    let s: MatchState = createMatchState(ctx)
    s = { ...s, phase: 'fight', phaseStep: 0 }
    // 右の外（場外）へ、横に飛ばされた状態から始める
    s = {
      ...s,
      fighters: [
        s.fighters[0],
        {
          ...s.fighters[1],
          body: { ...s.fighters[1].body, x: 26, y: 8, vx: 3, vy: -2, onGround: false },
        },
      ],
    }
    let landed = false
    for (let i = 0; i < 300 && !landed; i++) {
      const input: PlayerInput = cpu.sample({ step: s.step, observation: s })
      const r = stepMatch(s, [NO_INPUT, input], ctx)
      expect(r.events.some((e) => e.type === 'ko')).toBe(false)
      s = r.state
      landed = s.fighters[1].body.onGround
    }
    expect(landed).toBe(true)
  })
})

describe('60 FPS を妨げない（§7）', () => {
  it('1 ステップの判断は、0.05 ms より十分に短い（平均）', () => {
    const ctx = createMatchContext(standard, [STD, STD])
    const decide = createCpu(cpuSetupOf(ctx, 1), CPU_LEVELS.hard, 1)
    const n = 20000
    const views = Array.from({ length: 64 }, (_, i) =>
      view(
        200 + i,
        { x: 5 + (i % 13), vx: 1 },
        { x: 18 - (i % 11), attack: { t: i % 24, facing: -1 } },
      ),
    )
    const t0 = performance.now()
    for (let i = 0; i < n; i++) decide({ ...views[i % 64]!, step: 200 + i })
    const avg = (performance.now() - t0) / n
    expect(avg).toBeLessThan(0.05)
  })
})
