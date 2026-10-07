import { describe, expect, it } from 'vitest'
import { createBot } from '../battle/balance.ts'
import {
  createMatchContext,
  createMatchState,
  DEFAULT_MATCH_RULES,
  isMatchFinished,
  MIN_RECOVERY_STEPS,
  NO_INPUT,
  stepMatch,
  type MatchContext,
  type MatchEvent,
  type MatchState,
  type PlayerInput,
} from '../battle/index.ts'
import { createDefaultConfig, DEFAULT_STATS } from '../fighter/index.ts'
import type { MatchRecord, PlayerMetrics, Stats } from '../model/index.ts'
import { presetStage } from '../stage/index.ts'
import {
  buildMatchResult,
  DAMAGE_CAP,
  isPlayerMetrics,
  KO_ATTRIBUTION_STEPS,
  MetricsRecorder,
} from './metrics.ts'

const stage = presetStage('standard')
const inp = (p: Partial<PlayerInput> = {}): PlayerInput => ({ ...NO_INPUT, ...p })

type Run = {
  ctx: MatchContext
  states: MatchState[]
  events: MatchEvent[]
  metrics: [PlayerMetrics, PlayerMetrics]
  final: MatchState
}

function play(
  ctx: MatchContext,
  inputs: (s: MatchState, step: number) => [PlayerInput, PlayerInput],
  maxSteps = 100000,
  stopAt?: (s: MatchState) => boolean,
): Run {
  const rec = new MetricsRecorder()
  let s = createMatchState(ctx)
  const states = [s]
  const events: MatchEvent[] = []
  for (let i = 0; i < maxSteps && !isMatchFinished(s, ctx) && !(stopAt && stopAt(s)); i++) {
    const r = stepMatch(s, inputs(s, i), ctx)
    rec.record(s, r.state, r.events)
    events.push(...r.events)
    s = r.state
    states.push(s)
  }
  return { ctx, states, events, metrics: rec.result(s), final: s }
}

const ctxOf = (a: Stats = DEFAULT_STATS, b: Stats = DEFAULT_STATS) =>
  createMatchContext(stage, [a, b])

/** 待ち時間なし（すぐ、操作できる）。短い台本の確認用 */
const quick = (a: Stats = DEFAULT_STATS, b: Stats = DEFAULT_STATS) =>
  createMatchContext(stage, [a, b], { ...DEFAULT_MATCH_RULES, readySec: 0 })

function botMatch(seed: number, a: Stats = DEFAULT_STATS, b: Stats = DEFAULT_STATS) {
  const ctx = ctxOf(a, b)
  const bots = [createBot(0, ctx, seed), createBot(1, ctx, seed)] as const
  return play(ctx, (s) => [bots[0](s), bots[1](s)])
}

describe('指標の記録（battle-report.md §4、§5）', () => {
  it('試合が終わると、すべての採用指標が、両者に記録される（形が正しい）', () => {
    const r = botMatch(1)
    for (const m of r.metrics) {
      expect(isPlayerMetrics(m)).toBe(true)
      expect(Object.keys(m).sort()).toEqual(
        [
          'attacksThrown',
          'avgKnockbackDistance',
          'damageDealt',
          'damageTaken',
          'deaths',
          'hitsLanded',
          'jumps',
          'kos',
          'maxDamageEndured',
          'moveDistance',
          'recoveryFailure',
          'recoverySuccess',
          'selfKos',
          'stocksLeft',
        ].sort(),
      )
    }
    // 実際の試合なので、動き・攻撃・ヒットが、記録されている
    const [a, b] = r.metrics
    expect(a.moveDistance + b.moveDistance).toBeGreaterThan(0)
    expect(a.attacksThrown + b.attacksThrown).toBeGreaterThan(0)
    expect(a.hitsLanded + b.hitsLanded).toBeGreaterThan(0)
    expect(a.damageDealt + b.damageDealt).toBeGreaterThan(0)
  })

  it('整合: 与ダメージ = 相手の被ダメージ、当てた回数 = ヒットのイベント数、撃墜数 + 相手の自滅 = 相手の被撃墜数', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = botMatch(seed)
      const [a, b] = r.metrics
      expect(a.damageDealt).toBeCloseTo(b.damageTaken, 9)
      expect(b.damageDealt).toBeCloseTo(a.damageTaken, 9)
      const hits = r.events.filter((e) => e.type === 'hit')
      expect(a.hitsLanded).toBe(hits.filter((e) => e.type === 'hit' && e.attacker === 0).length)
      expect(b.hitsLanded).toBe(hits.filter((e) => e.type === 'hit' && e.attacker === 1).length)
      expect(a.kos + b.selfKos).toBe(b.deaths)
      expect(b.kos + a.selfKos).toBe(a.deaths)
      // 被撃墜数 = 失ったストック
      expect(a.deaths).toBe(r.ctx.rules.stocks - a.stocksLeft)
      expect(b.deaths).toBe(r.ctx.rules.stocks - b.stocksLeft)
      expect(a.attacksThrown).toBeGreaterThanOrEqual(a.hitsLanded)
      expect(a.maxDamageEndured).toBeGreaterThanOrEqual(0)
    }
  })

  it('与ダメージ・被ダメージ: ヒットの damageDealt を足し上げる（蓄積の上限を超えた分は、含めない）', () => {
    const r = botMatch(2)
    const sum = r.events.reduce(
      (t, e) => (e.type === 'hit' && e.attacker === 0 ? t + e.damageDealt : t),
      0,
    )
    // 上限に達しない通常の試合では、イベントの値の合計と同じ
    expect(r.metrics[0].damageDealt).toBeCloseTo(sum, 6)
    expect(DAMAGE_CAP).toBe(999)
  })

  it('耐えた最大ダメージ: 撃墜で 0 に戻る前の値を含む。撃墜されなかった側は、終わりの値', () => {
    const r = botMatch(3)
    for (const i of [0, 1] as const) {
      const peak = Math.max(...r.states.map((s) => s.fighters[i].combat.damage))
      expect(r.metrics[i].maxDamageEndured).toBeCloseTo(peak, 9)
    }
  })

  it('動いた距離: 左右の入力があり、やられ中でないステップに、移動速度 × 1/60 を足す（実際の位置の変化は使わない）', () => {
    const ctx = quick()
    const run = play(ctx, () => [inp({ right: true }), inp()], 120, undefined)
    const dt = 1 / 60
    // 開始（READY）の 1 ステップのあと、FIGHT で、入力が効くステップだけ
    const moved = run.events.filter((e) => e.type === 'move' && e.fighter === 0).length
    expect(moved).toBeGreaterThan(50)
    expect(run.metrics[0].moveDistance).toBeCloseTo(moved * ctx.params[0].moveSpeed * dt, 9)
    expect(run.metrics[1].moveDistance).toBe(0)
  })

  it('動いた距離: 速さの能力値が高いほど、同じ入力の時間で、大きい', () => {
    const dist = (speed: number) =>
      play(
        quick({ ...DEFAULT_STATS, speed, jumpPower: 5 }),
        () => [inp({ right: true }), inp()],
        100,
      ).metrics[0].moveDistance
    expect(dist(8)).toBeGreaterThan(dist(5))
    expect(dist(5)).toBeGreaterThan(dist(2))
  })

  it('ジャンプの回数・攻撃を出した回数', () => {
    const ctx = quick()
    const run = play(
      ctx,
      (_s, i) => [
        inp({ jumpPressed: i === 20 || i === 70, attackPressed: i === 30 || i === 120 }),
        inp(),
      ],
      200,
    )
    expect(run.metrics[0].jumps).toBe(
      run.events.filter((e) => e.type === 'jump' && e.fighter === 0).length,
    )
    expect(run.metrics[0].jumps).toBeGreaterThanOrEqual(1)
    expect(run.metrics[0].attacksThrown).toBe(2)
    expect(run.metrics[1].attacksThrown).toBe(0)
  })
})

describe('攻撃を出した回数（イベントで数える）', () => {
  const hit = (attacker: 0 | 1): MatchEvent => ({
    type: 'hit',
    step: 1,
    attacker,
    victim: (1 - attacker) as 0 | 1,
    damageDealt: 12,
    damageAfter: 12,
    launchSpeed: 8,
    vx: 1,
    vy: -1,
    hitstunSteps: 10,
  })

  it('同じステップで、相手の攻撃を受けて、すぐ打ち消されても、出した 1 回として数える', () => {
    // 状態では、前も後も、攻撃なし。それでも、攻撃のイベントがあれば、数える
    const s0 = createMatchState(ctxOf())
    const rec = new MetricsRecorder()
    rec.record(s0, s0, [{ type: 'attack', step: 1, fighter: 1 }, hit(0)])
    expect(rec.result(s0)[1].attacksThrown).toBe(1)
    expect(rec.result(s0)[0].attacksThrown).toBe(0)
  })

  it('実際の試合: stepMatch が、攻撃を出した瞬間に、1 回ずつ、イベントを出す（打ち消されたものを含む）', () => {
    const ctx = quick()
    // 1P が、5 ステップごとに攻撃を押し続ける。攻撃中は、新しい攻撃を始められない
    const run = play(ctx, (_s, i) => [inp({ attackPressed: i % 5 === 0 }), inp()], 300)
    const events = run.events.filter((e) => e.type === 'attack' && e.fighter === 0).length
    expect(run.metrics[0].attacksThrown).toBe(events)
    expect(events).toBeGreaterThanOrEqual(10)
    // 攻撃は、24 ステップかかるので、300 ステップの間に、最大 13 回
    expect(events).toBeLessThanOrEqual(13)
  })
})

describe('撃墜・自滅（§4.3）', () => {
  it('相手の攻撃を受けたあと 5 秒以内の撃墜は、相手の撃墜数。そうでなければ、自滅', () => {
    // 1P が、ダミーを攻撃し続けて、ステージの端から、撃墜する。2P は、動かない
    const ctx = ctxOf(
      { attackPower: 8, defense: 5, jumpPower: 5, speed: 8 },
      { ...DEFAULT_STATS, defense: 2 },
    )
    const bot = createBot(0, ctx, 1)
    const run = play(ctx, (s) => [bot(s), inp()])
    const [a, b] = run.metrics
    expect(a.damageDealt).toBeGreaterThan(0)
    expect(b.deaths).toBeGreaterThanOrEqual(1)
    // 動かない相手が、自分で落ちることはない: 被撃墜は、すべて、相手の撃墜
    expect(b.selfKos).toBe(0)
    expect(a.kos).toBe(b.deaths)
  })

  it('自滅: 左へ歩いて、場外に落ちた。撃墜数には数えず、被撃墜数と自滅に数える', () => {
    const ctx = ctxOf()
    const run = play(
      ctx,
      () => [inp({ left: true }), inp()],
      3000,
      (s) => s.fighters[0].combat.down,
    )
    const [a, b] = run.metrics
    expect(a.deaths).toBe(1)
    expect(a.selfKos).toBe(1)
    expect(b.kos).toBe(0)
  })

  it('5 秒（300 ステップ）の境目: ちょうど 300 ステップ前に当てていれば、数える。301 なら、自滅', () => {
    // イベントを、直接つくって、境目を確かめる
    const mk = (hitStep: number, koStep: number) => {
      const ctx = ctxOf()
      const s0 = createMatchState(ctx)
      const rec = new MetricsRecorder()
      const hit: MatchEvent = {
        type: 'hit',
        step: hitStep,
        attacker: 0,
        victim: 1,
        damageDealt: 12,
        damageAfter: 12,
        launchSpeed: 8,
        vx: 1,
        vy: -1,
        hitstunSteps: 10,
      }
      const ko: MatchEvent = {
        type: 'ko',
        step: koStep,
        fighter: 1,
        cause: 'blast_bottom',
        damageAtKo: 12,
        recoveryAttempted: false,
      }
      rec.record(s0, s0, [hit])
      rec.record(s0, s0, [ko])
      return rec.result(s0)
    }
    expect(KO_ATTRIBUTION_STEPS).toBe(300)
    expect(mk(100, 100 + 300)[0].kos).toBe(1)
    expect(mk(100, 100 + 300)[1].selfKos).toBe(0)
    expect(mk(100, 100 + 301)[0].kos).toBe(0)
    expect(mk(100, 100 + 301)[1].selfKos).toBe(1)
  })

  it('撃墜・リスポーンで、「最後に当てられた」記録を消す（前のストックの記録が、次の撃墜に残らない）', () => {
    const ctx = ctxOf()
    const s0 = createMatchState(ctx)
    const rec = new MetricsRecorder()
    const hit: MatchEvent = {
      type: 'hit',
      step: 10,
      attacker: 0,
      victim: 1,
      damageDealt: 12,
      damageAfter: 12,
      launchSpeed: 8,
      vx: 1,
      vy: -1,
      hitstunSteps: 10,
    }
    const ko = (step: number): MatchEvent => ({
      type: 'ko',
      step,
      fighter: 1,
      cause: 'blast_bottom',
      damageAtKo: 12,
      recoveryAttempted: false,
    })
    rec.record(s0, s0, [hit])
    rec.record(s0, s0, [ko(50)]) // 相手の撃墜
    rec.record(s0, s0, [{ type: 'respawn', step: 140, fighter: 1 }])
    rec.record(s0, s0, [ko(200)]) // 前のヒットから 190 ステップ。でも、消去されたので、自滅
    const [a, b] = rec.result(s0)
    expect(a.kos).toBe(1)
    expect(b.selfKos).toBe(1)
    expect(b.deaths).toBe(2)
  })
})

describe('ふっとんだ きょり（§4.3、§5）', () => {
  it('受けたヒットごとに、吹き飛び始めの位置と、やられ中が終わる位置の、横の差。その平均', () => {
    const ctx = ctxOf({ ...DEFAULT_STATS, attackPower: 8, speed: 8 })
    const bot = createBot(0, ctx, 1)
    const rec = new MetricsRecorder()
    let s = createMatchState(ctx)
    const starts: number[] = []
    const dists: number[] = []
    let from: number | null = null
    for (let i = 0; i < 4000 && dists.length < 3; i++) {
      const r = stepMatch(s, [bot(s), inp()], ctx)
      rec.record(s, r.state, r.events)
      for (const e of r.events) {
        if (e.type === 'hit' && e.victim === 1) {
          from = r.state.fighters[1].body.x
          starts.push(from)
        }
      }
      if (
        from !== null &&
        s.fighters[1].combat.hitstun > 0 &&
        r.state.fighters[1].combat.hitstun === 0
      ) {
        dists.push(Math.abs(r.state.fighters[1].body.x - from))
        from = null
      }
      s = r.state
    }
    expect(dists.length).toBeGreaterThanOrEqual(1)
    expect(dists.every((d) => d > 0)).toBe(true)
    // その時点までに、確定した分の平均（まだ測定中のヒットは、含まれない）
    const metrics = rec.result(s)[1]
    expect(metrics.avgKnockbackDistance).not.toBeNull()
    expect(metrics.avgKnockbackDistance!).toBeGreaterThan(0)
  })

  it('受けたヒットが 0 のとき、null（「—」）', () => {
    const r = play(ctxOf(), () => [inp({ right: true }), inp()], 60)
    expect(r.metrics[0].avgKnockbackDistance).toBeNull()
    expect(r.metrics[1].avgKnockbackDistance).toBeNull()
  })

  it('試合の終わりに、吹き飛び中の側がいれば、その時点の位置で、測定を終える（距離が入る）', () => {
    const ctx = ctxOf()
    const s0 = createMatchState(ctx)
    const flying: MatchState = {
      ...s0,
      fighters: [s0.fighters[0], { ...s0.fighters[1], body: { ...s0.fighters[1].body, x: 14 } }],
    }
    const moved: MatchState = {
      ...flying,
      fighters: [
        flying.fighters[0],
        { ...flying.fighters[1], body: { ...flying.fighters[1].body, x: 17 } },
      ],
    }
    const rec = new MetricsRecorder()
    rec.record(s0, flying, [
      {
        type: 'hit',
        step: 5,
        attacker: 0,
        victim: 1,
        damageDealt: 12,
        damageAfter: 12,
        launchSpeed: 8,
        vx: 1,
        vy: -1,
        hitstunSteps: 30,
      },
    ])
    rec.record(flying, moved, [
      {
        type: 'match_end',
        step: 6,
        outcome: { winner: 'p1', reason: 'timeup_damage' },
        stocks: [3, 3],
        damage: [0, 12],
        fightSteps: 6,
      },
    ])
    expect(rec.result(moved)[1].avgKnockbackDistance).toBeCloseTo(3, 9)
  })
})

describe('復帰の失敗（0.3 秒未満は数えない）', () => {
  const fail = (outSteps: number): MatchEvent => ({
    type: 'recovery_failure',
    step: 1,
    fighter: 0,
    outSteps,
  })
  it('場外にいた時間が 18 ステップ（0.3 秒）以上のものだけ、数える', () => {
    const s0 = createMatchState(ctxOf())
    const rec = new MetricsRecorder()
    rec.record(s0, s0, [fail(1), fail(17), fail(18), fail(120)])
    expect(rec.result(s0)[0].recoveryFailure).toBe(2)
  })
})

describe('復帰の成否・決定性・MatchResult', () => {
  it('復帰の成否は、イベント（失敗は、0.3 秒以上のもの）の数と一致する', () => {
    const r = botMatch(4)
    for (const i of [0, 1] as const) {
      expect(r.metrics[i].recoverySuccess).toBe(
        r.events.filter((e) => e.type === 'recovery_success' && e.fighter === i).length,
      )
      expect(r.metrics[i].recoveryFailure).toBe(
        r.events.filter(
          (e) =>
            e.type === 'recovery_failure' && e.fighter === i && e.outSteps >= MIN_RECOVERY_STEPS,
        ).length,
      )
    }
  })

  it('同じ入力から、同じ結果（決定的）', () => {
    expect(botMatch(5).metrics).toEqual(botMatch(5).metrics)
  })

  it('試合が終わったあとの記録は、無視する（終わりの値が、変わらない）', () => {
    const ctx = ctxOf()
    const rec = new MetricsRecorder()
    const s0 = createMatchState(ctx)
    rec.record(s0, s0, [
      {
        type: 'match_end',
        step: 1,
        outcome: { winner: null, reason: 'draw_timeup' },
        stocks: [3, 3],
        damage: [0, 0],
        fightSteps: 1,
      },
    ])
    const before = rec.result(s0)
    rec.record(s0, s0, [{ type: 'jump', step: 2, fighter: 0, air: false }])
    expect(rec.result(s0)).toEqual(before)
  })

  it('MatchResult に、使った CharacterConfig と StageData が紐づく', () => {
    const r = botMatch(6)
    const p1Config = createDefaultConfig('p1')
    const p2Config = createDefaultConfig('p2')
    const result = buildMatchResult({
      matchNo: 1,
      p1Config,
      p2Config,
      stage,
      outcome: r.final.outcome!,
      durationSec: 70,
      metrics: r.metrics,
    })
    expect(result.schemaVersion).toBe(1)
    expect(result.p1Config).toBe(p1Config)
    expect(result.p2Config).toBe(p2Config)
    expect(result.stage).toBe(stage)
    expect(result.p1).toEqual(r.metrics[0])
    expect(result.p2).toEqual(r.metrics[1])
    // セッションの戦の記録として、そのまま保存できる
    const record: MatchRecord = result
    expect(record.matchNo).toBe(1)
    // JSON にして戻しても、同じ（保存できる）
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('isPlayerMetrics: 壊れた指標を、拒否する', () => {
    const ok = botMatch(1).metrics[0]
    expect(isPlayerMetrics(ok)).toBe(true)
    expect(isPlayerMetrics({ ...ok, kos: -1 })).toBe(false)
    expect(isPlayerMetrics({ ...ok, jumps: '3' })).toBe(false)
    expect(isPlayerMetrics({ ...ok, moveDistance: NaN })).toBe(false)
    expect(isPlayerMetrics({ ...ok, avgKnockbackDistance: 'x' })).toBe(false)
    expect(isPlayerMetrics({ ...ok, avgKnockbackDistance: null })).toBe(true)
    const missing: Record<string, unknown> = { ...ok }
    delete missing.jumps
    expect(isPlayerMetrics(missing)).toBe(false)
    expect(isPlayerMetrics(null)).toBe(false)
  })
})

describe('記録処理が、対戦の FPS に影響しない（NFR-03）', () => {
  it('1 ステップの記録は、小さい（10 万ステップ分でも、短い時間）。メモリを、増やし続けない', () => {
    const ctx = ctxOf()
    const bots = [createBot(0, ctx, 1), createBot(1, ctx, 1)] as const
    // 先に、状態とイベントを作っておき、記録だけの時間を測る
    const frames: { prev: MatchState; curr: MatchState; events: MatchEvent[] }[] = []
    let s = createMatchState(ctx)
    for (let i = 0; i < 4000; i++) {
      const r = stepMatch(s, [bots[0](s), bots[1](s)], ctx)
      frames.push({ prev: s, curr: r.state, events: r.events })
      s = r.state
      if (r.state.phase === 'end') break
    }
    const rec = new MetricsRecorder()
    const t0 = performance.now()
    let n = 0
    for (let round = 0; round < 25; round++) {
      for (const f of frames) {
        rec.record(f.prev, f.curr, f.events)
        n++
      }
    }
    const perStep = (performance.now() - t0) / n
    // フレーム予算（16.7 ms）の、ごく一部（test-plan.md §7.3 の 1 ステップ 4 ms 未満の、100 分の 1 以下）
    expect(perStep).toBeLessThan(0.04)
  })
})
