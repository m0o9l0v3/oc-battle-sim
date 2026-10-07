import { describe, expect, it } from 'vitest'
import { DEFAULT_STATS } from '../fighter/index.ts'
import { stageFromRows } from '../stage/rows.ts'
import type { Stats } from '../model/index.ts'
import { createMatchState, stepMatch, type MatchState } from './match.ts'
import { DUMMY_INPUT, PRACTICE_RULES, createPracticeContext } from './practice.ts'
import { NO_INPUT, type PlayerInput } from './input.ts'

const stage = stageFromRows([
  ...Array(6).fill('.'.repeat(24)),
  '..........####..........',
  '.'.repeat(24),
  '......####....####......',
  '....1..............2....',
  '....################....',
  '....################....',
  '....################....',
  '.'.repeat(24),
])
const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})
const inp = (p: Partial<PlayerInput> = {}): PlayerInput => ({ ...NO_INPUT, ...p })

function run(stats: Stats, script: (step: number) => PlayerInput, steps: number) {
  const ctx = createPracticeContext(stage, stats)
  let s: MatchState = createMatchState(ctx)
  const states: MatchState[] = [s]
  const events: ReturnType<typeof stepMatch>['events'] = []
  for (let i = 0; i < steps; i++) {
    const r = stepMatch(s, [script(i), DUMMY_INPUT], ctx)
    s = r.state
    events.push(...r.events)
    states.push(s)
  }
  return { ctx, states, events }
}

describe('試し動かしの設定', () => {
  it('待ち時間なしで、すぐ操作できる。READY の 1 ステップのあと、FIGHT', () => {
    const { states } = run(DEFAULT_STATS, () => inp(), 3)
    expect(states[0]!.phase).toBe('ready')
    expect(states[2]!.phase).toBe('fight')
  })

  it('決着しない（何も操作せず 10 分。ダミーを撃墜し続けても、終わらない）', () => {
    const { states } = run(DEFAULT_STATS, () => inp(), 60 * 60 * 10)
    expect(states.at(-1)!.phase).toBe('fight')
    expect(states.at(-1)!.outcome).toBeNull()
    expect(PRACTICE_RULES.endless).toBe(true)
  })

  it('決着しない設定は、ストックが 1 でも、時間切れでも、END に入らない（撃墜のたびに、リスポーンする）', () => {
    const ctx = createPracticeContext(stage, DEFAULT_STATS)
    const rules = { ...ctx.rules, stocks: 1, timeLimitSec: 1 }
    const c = { ...ctx, rules, steps: { ...ctx.steps, time: 60 } }
    let s: MatchState = createMatchState(c)
    let kos = 0
    let respawns = 0
    for (let i = 0; i < 3000; i++) {
      // 左へ歩いて落ち、リスポーンしたら、また歩く
      const r = stepMatch(s, [inp({ left: true }), DUMMY_INPUT], c)
      s = r.state
      kos += r.events.filter((e) => e.type === 'ko').length
      respawns += r.events.filter((e) => e.type === 'respawn').length
      expect(s.phase).toBe('fight')
      expect(s.outcome).toBeNull()
    }
    expect(kos).toBeGreaterThanOrEqual(2)
    expect(respawns).toBeGreaterThanOrEqual(2)
    expect(s.fighters[0].stocks).toBe(1) // 減らない
  })

  it('決着しない設定でなければ、これまでどおり END に入る（対戦のルールは変わらない）', () => {
    const ctx = createPracticeContext(stage, DEFAULT_STATS)
    const c = { ...ctx, rules: { ...ctx.rules, endless: false, stocks: 1 } }
    let s: MatchState = createMatchState(c)
    for (let i = 0; i < 3000 && s.phase !== 'end'; i++) {
      s = stepMatch(s, [inp({ left: true }), DUMMY_INPUT], c).state
    }
    expect(s.phase).toBe('end')
  })

  it('1P の能力値を、そのまま使う。ダミーは標準', () => {
    const ctx = createPracticeContext(stage, S(8, 2, 3, 4))
    expect(ctx.stats[0]).toEqual({ attackPower: 8, defense: 2, jumpPower: 3, speed: 4 })
    expect(ctx.stats[1]).toEqual({ ...DEFAULT_STATS })
  })

  it('ダミーは動かない（入力なし）。1P の操作で動くのは 1P だけ', () => {
    const { states } = run(DEFAULT_STATS, () => inp({ right: true }), 60)
    expect(states.at(-1)!.fighters[0].body.x).toBeGreaterThan(states[0]!.fighters[0].body.x + 1)
    expect(states.at(-1)!.fighters[1].body.x).toBe(states[0]!.fighters[1].body.x)
  })
})

describe('設定した能力値の挙動を、一人で確認できる', () => {
  it('speed: 高いほど、同じ時間で、遠くまで動く', () => {
    const dist = (speed: number) => {
      const { states } = run(S(5, 5, 5, speed), () => inp({ right: true }), 40)
      return states.at(-1)!.fighters[0].body.x - states[0]!.fighters[0].body.x
    }
    expect(dist(8)).toBeGreaterThan(dist(5))
    expect(dist(5)).toBeGreaterThan(dist(2))
  })

  it('jumpPower: 高いほど、高く跳ぶ', () => {
    const peak = (jumpPower: number) => {
      const { states } = run(S(5, 5, jumpPower, 5), (i) => inp({ jumpPressed: i === 3 }), 90)
      return Math.min(...states.map((s) => s.fighters[0].body.y))
    }
    // y は下が正。小さいほど高い
    expect(peak(8)).toBeLessThan(peak(5))
    expect(peak(5)).toBeLessThan(peak(2))
  })

  it('attackPower: 高いほど、ダミーに与えるダメージが大きい（ヒットのイベントで確認できる）', () => {
    const dealt = (attackPower: number) => {
      // ダミーの近くへ寄って、攻撃する
      const { events } = run(
        S(attackPower, 5, 5, 8),
        (i) => (i < 185 ? inp({ right: true }) : inp({ attackPressed: i % 30 === 0 })),
        400,
      )
      const hit = events.find((e) => e.type === 'hit' && e.attacker === 0)
      return hit && hit.type === 'hit' ? hit.damageDealt : 0
    }
    expect(dealt(8)).toBeGreaterThan(dealt(5))
    expect(dealt(5)).toBeGreaterThan(dealt(2))
    expect(dealt(2)).toBeGreaterThan(0)
  })

  it('撃墜されても、リスポーンして、続けられる（1P もダミーも）', () => {
    // 1P が左へ歩いて、場外に落ちる
    const { states, events } = run(
      DEFAULT_STATS,
      (i) => (i < 400 ? inp({ left: true }) : inp()),
      900,
    )
    expect(events.some((e) => e.type === 'ko' && e.fighter === 0)).toBe(true)
    expect(events.some((e) => e.type === 'respawn' && e.fighter === 0)).toBe(true)
    expect(states.at(-1)!.phase).toBe('fight')
    expect(states.at(-1)!.fighters[0].combat.down).toBe(false)
  })
})
