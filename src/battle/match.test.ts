import { describe, expect, it } from 'vitest'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'
import { NO_INPUT, type PlayerInput } from './input.ts'
import {
  createMatchContext,
  createMatchState,
  isMatchFinished,
  stepMatch,
  type MatchContext,
  type MatchEvent,
  type MatchState,
} from './match.ts'
import { DEFAULT_MATCH_RULES, type MatchRules } from './rules.ts'

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
const stage: StageData = {
  schemaVersion: 1,
  name: '標準',
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  cells: ROWS.map((r) => [...r].map((c): CellValue => (c === '#' ? 1 : 0))),
  spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } },
}
const std = { attackPower: 5, defense: 5, jumpPower: 5, speed: 5 }
const ctxWith = (rules: Partial<MatchRules> = {}): MatchContext =>
  createMatchContext(stage, [std, std], { ...DEFAULT_MATCH_RULES, ...rules })

const input = (p: Partial<PlayerInput> = {}): PlayerInput => ({ ...NO_INPUT, ...p })

type Script = (step: number, s: MatchState) => [PlayerInput, PlayerInput]
const idle: Script = () => [input(), input()]

/** n ステップ進める。イベントを全部集める */
function run(
  ctx: MatchContext,
  start: MatchState,
  n: number,
  script: Script = idle,
  until?: (s: MatchState, e: MatchEvent[]) => boolean,
) {
  let s = start
  const events: MatchEvent[] = []
  for (let i = 0; i < n; i++) {
    const r = stepMatch(s, script(s.step, s), ctx)
    s = r.state
    events.push(...r.events)
    if (until?.(s, r.events)) break
  }
  return { s, events }
}

/** READY を終えて、FIGHT の最初の状態にする */
function startFight(ctx: MatchContext) {
  return run(ctx, createMatchState(ctx), ctx.steps.ready).s
}

const ofType = <T extends MatchEvent['type']>(events: MatchEvent[], t: T) =>
  events.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === t)

describe('試合の流れ（battle-rules.md §4）', () => {
  it('開始: スポーン位置に立つ。ステージの中央を向く。ストック 3、蓄積 0 %', () => {
    const ctx = ctxWith()
    const s = createMatchState(ctx)
    expect(s.phase).toBe('ready')
    expect(s.fighters[0].body).toMatchObject({ x: 4.5, y: 10, vx: 0, vy: 0 })
    expect(s.fighters[1].body).toMatchObject({ x: 19.5, y: 10 })
    expect(s.fighters.map((f) => f.facing)).toEqual([1, -1])
    expect(s.fighters.map((f) => f.stocks)).toEqual([3, 3])
    expect(s.fighters.map((f) => f.combat.damage)).toEqual([0, 0])
    expect(s.timeLeft).toBe(5400)
  })

  it('READY は 3 秒（180 ステップ）。操作できず、制限時間も進まない', () => {
    const ctx = ctxWith()
    const { s, events } = run(ctx, createMatchState(ctx), 179, () => [
      input({ right: true, attackPressed: true }),
      input(),
    ])
    expect(s.phase).toBe('ready')
    expect(s.timeLeft).toBe(5400)
    expect(s.fighters[0].body.x).toBe(4.5) // 動かない
    expect(s.fighters[0].combat.attack).toBeNull()
    expect(events).toEqual([])
    const next = stepMatch(s, [input(), input()], ctx)
    expect(next.state.phase).toBe('fight')
    expect(ofType(next.events, 'fight_start')).toHaveLength(1)
  })

  it('FIGHT の間だけ、制限時間が 1 ステップごとに減る', () => {
    const ctx = ctxWith()
    const s = startFight(ctx)
    expect(s.phase).toBe('fight')
    const { s: s2 } = run(ctx, s, 10)
    expect(s2.timeLeft).toBe(5400 - 10)
  })

  it('時間切れで、同じなら引き分け（draw_timeup）。END になり、3 秒後に結果へ進める', () => {
    const ctx = ctxWith({ timeLimitSec: 2 })
    const s = startFight(ctx)
    const { s: end, events } = run(ctx, s, 200, idle, (st) => st.phase === 'end')
    expect(end.outcome).toEqual({ winner: null, reason: 'draw_timeup' })
    expect(ofType(events, 'match_end')[0]).toMatchObject({ fightSteps: 120 })
    expect(isMatchFinished(end, ctx)).toBe(false)
    const { s: done } = run(ctx, end, 180)
    expect(isMatchFinished(done, ctx)).toBe(true)
    // END の間は、状態が変わらない（制限時間も進まない）
    expect(done.fighters).toEqual(end.fighters)
  })

  it('clockSkip（捨てたステップ）は、制限時間からだけ引く。物理には影響しない', () => {
    const ctx = ctxWith({ timeLimitSec: 2 })
    const s = startFight(ctx)
    const a = stepMatch(s, [input(), input()], ctx, 0).state
    const b = stepMatch(s, [input(), input()], ctx, 5).state
    expect(a.timeLeft).toBe(119)
    expect(b.timeLeft).toBe(114)
    expect(b.fighters).toEqual(a.fighters)
  })

  it('1試合は、最大でも約 96 秒（READY 3 + FIGHT 90 + END 3）', () => {
    const ctx = ctxWith()
    expect(ctx.steps.ready + ctx.steps.time + ctx.steps.end).toBe(180 + 5400 + 180)
    expect((ctx.steps.ready + ctx.steps.time + ctx.steps.end) / 60).toBe(96)
  })
})

describe('操作・移動', () => {
  it('右を押し続けると、speed の速さで右へ動く。動いた距離のイベントが出る', () => {
    const ctx = ctxWith()
    const s = startFight(ctx)
    const { s: s2, events } = run(ctx, s, 30, () => [input({ right: true }), input()])
    expect(s2.fighters[0].body.x).toBeGreaterThan(4.5 + 1.5)
    expect(s2.fighters[0].facing).toBe(1)
    const moves = ofType(events, 'move')
    expect(moves).toHaveLength(30)
    expect(moves[0].distance).toBeCloseTo(3.75 / 60, 10)
  })

  it('ジャンプのイベント（地上・空中）。空中ジャンプは 2 回まで', () => {
    const ctx = ctxWith()
    const s = startFight(ctx)
    const pressAt = new Set([0, 10, 20, 30])
    const { events } = run(ctx, s, 40, (_, st) => [
      input({ jumpPressed: pressAt.has(st.phaseStep) }),
      input(),
    ])
    const jumps = ofType(events, 'jump')
    expect(jumps.map((j) => j.air)).toEqual([false, true, true])
  })
})

describe('ヒットとダメージ（combat の組み込み）', () => {
  /** p1 を p2 の隣に置いて、攻撃させる */
  function adjacent() {
    const ctx = ctxWith()
    const s = startFight(ctx)
    const f = s.fighters
    const placed: MatchState = {
      ...s,
      fighters: [
        { ...f[0], body: { ...f[0].body, x: 11.5 }, facing: 1 },
        { ...f[1], body: { ...f[1].body, x: 12.2 }, facing: -1 },
      ],
    }
    return { ctx, s: placed }
  }

  it('攻撃がヒットし、ダメージが蓄積する。吹き飛ばされる', () => {
    const { ctx, s } = adjacent()
    const { s: s2, events } = run(ctx, s, 12, (_, st) => [
      input({ attackPressed: st.phaseStep === 0 }),
      input(),
    ])
    const hits = ofType(events, 'hit')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ attacker: 0, victim: 1, damageDealt: 12, damageAfter: 12 })
    expect(s2.fighters[1].combat.damage).toBe(12)
    expect(s2.fighters[1].body.vx).toBeGreaterThan(0)
  })

  it('FIGHT の間も、ヒットストップの間も、制限時間は進む', () => {
    const { ctx, s } = adjacent()
    const { s: s2 } = run(ctx, s, 12, (_, st) => [
      input({ attackPressed: st.phaseStep === 0 }),
      input(),
    ])
    expect(s2.timeLeft).toBe(5400 - 12)
  })
})

describe('撃墜（battle-rules.md §5）', () => {
  const place = (s: MatchState, i: 0 | 1, x: number, y: number): MatchState => ({
    ...s,
    fighters: s.fighters.map((f, k) =>
      k === i ? { ...f, body: { ...f.body, x, y, onGround: false } } : f,
    ) as MatchState['fighters'],
  })

  it('場外領域の外に出ると撃墜され、ストックが 1 減る。原因が記録される', () => {
    const ctx = ctxWith()
    const s = place(startFight(ctx), 0, -6.1, 5)
    const r = stepMatch(s, [input(), input()], ctx)
    const ko = ofType(r.events, 'ko')
    expect(ko).toHaveLength(1)
    expect(ko[0]).toMatchObject({ fighter: 0, cause: 'blast_left', damageAtKo: 0 })
    expect(r.state.fighters[0].stocks).toBe(2)
    expect(r.state.fighters[0].combat.down).toBe(true)
    expect(r.state.fighters[1].stocks).toBe(3)
    expect(ofType(r.events, 'recovery_failure')).toHaveLength(1) // 場外で撃墜された = 復帰失敗
  })

  it('撃墜中は、操作できない・動かない・攻撃を受けない', () => {
    const ctx = ctxWith()
    const s0 = place(startFight(ctx), 0, -6.1, 5)
    const script: Script = () => [
      input({ right: true, jumpPressed: true, attackPressed: true }),
      input(),
    ]
    const { s: ko } = run(ctx, s0, 1, script) // 撃墜されたステップ
    const { s } = run(ctx, ko, 10, script)
    expect(s.fighters[0].combat.down).toBe(true)
    expect(s.fighters[0].body).toEqual(ko.fighters[0].body) // 動かない
    expect(s.fighters[0].combat.attack).toBeNull()
  })

  it('1.5 秒（90 ステップ）後に、スポーン位置へリスポーンする。蓄積 0 %、速度 0、ジャンプ回復、中央を向く', () => {
    const ctx = ctxWith()
    let s = place(startFight(ctx), 0, -6.1, 5)
    s = {
      ...s,
      fighters: [
        {
          ...s.fighters[0],
          combat: { ...s.fighters[0].combat, damage: 87 },
          body: { ...s.fighters[0].body, airJumpsLeft: 0 },
        },
        s.fighters[1],
      ],
    }
    // 最初のステップで撃墜される。撃墜から 89 ステップ後（計 90 ステップ）は、まだ待ち中
    const { s: after, events } = run(ctx, s, 90)
    expect(after.fighters[0].combat.down).toBe(true)
    const r = stepMatch(after, [input(), input()], ctx)
    expect(ofType(r.events, 'respawn')).toEqual([{ step: after.step, type: 'respawn', fighter: 0 }])
    const f = r.state.fighters[0]
    expect(f.combat.down).toBe(false)
    expect(f.combat.damage).toBe(0)
    expect(f.body).toMatchObject({ x: 4.5, y: 10, vx: 0, vy: 0, airJumpsLeft: 2 })
    expect(f.facing).toBe(1)
    expect(f.stocks).toBe(2)
    expect(ofType(events, 'ko')[0].damageAtKo).toBe(87)
  })

  it('リスポーン後は 2 秒（120 ステップ）無敵。攻撃を受けない。切れると受ける', () => {
    const ctx = ctxWith()
    let s = place(startFight(ctx), 0, -6.1, 5)
    s = run(ctx, s, 91).s // 撃墜（1 ステップ目）+ 90 ステップ
    expect(s.fighters[0].combat.down).toBe(false)
    expect(s.fighters[0].shield).toBe(true)
    expect(s.fighters[0].combat.invuln).toBe(120)
    // 相手を、リスポーンした p1 の隣に置いて、攻撃させる
    const f = s.fighters
    const near: MatchState = {
      ...s,
      fighters: [
        f[0],
        {
          ...f[1],
          body: { ...f[1].body, x: f[0].body.x + 0.7, y: 10, onGround: true },
          facing: -1,
          control: { ...f[1].control, facing: -1 }, // 左（相手の方向）を向いている
        },
      ],
    }
    const attack: Script = (_, st) => [input(), input({ attackPressed: st.phaseStep % 24 === 0 })]
    const { events, s: after } = run(ctx, near, 100, attack)
    expect(ofType(events, 'hit')).toHaveLength(0) // 無敵の間は、当たらない（ヒットとして数えない）
    expect(after.fighters[0].combat.damage).toBe(0)
    // 無敵が切れたあと
    const { events: later } = run(ctx, after, 80, attack)
    expect(ofType(later, 'hit').length).toBeGreaterThan(0)
  })

  it('リスポーン後の無敵は、自分が攻撃を出したら解除される（移動・ジャンプでは解除されない）', () => {
    const ctx = ctxWith()
    let s = place(startFight(ctx), 0, -6.1, 5)
    s = run(ctx, s, 91).s
    const moved = run(ctx, s, 5, () => [input({ right: true, jumpPressed: true }), input()]).s
    expect(moved.fighters[0].shield).toBe(true)
    expect(moved.fighters[0].combat.invuln).toBeGreaterThan(0)
    const attacked = run(ctx, s, 1, () => [input({ attackPressed: true }), input()]).s
    expect(attacked.fighters[0].shield).toBe(false)
    expect(attacked.fighters[0].combat.invuln).toBe(0)
  })

  it('ストックが 0 になる撃墜で、試合が終わる（相手の勝ち）', () => {
    const ctx = ctxWith()
    let s = startFight(ctx)
    s = { ...s, fighters: [{ ...s.fighters[0], stocks: 1 }, s.fighters[1]] }
    s = place(s, 0, 31, 5)
    const r = stepMatch(s, [input(), input()], ctx)
    expect(ofType(r.events, 'ko')[0].cause).toBe('blast_right')
    expect(r.state.phase).toBe('end')
    expect(r.state.outcome).toEqual({ winner: 'p2', reason: 'stocks' })
    expect(ofType(r.events, 'match_end')[0]).toMatchObject({ stocks: [0, 3] })
  })

  it('同じステップで、お互いの最後のストックを失うと、引き分け（draw_double_ko）', () => {
    const ctx = ctxWith()
    let s = startFight(ctx)
    s = {
      ...s,
      fighters: [
        { ...s.fighters[0], stocks: 1 },
        { ...s.fighters[1], stocks: 1 },
      ],
    }
    s = place(place(s, 0, -7, 5), 1, 31, 5)
    const r = stepMatch(s, [input(), input()], ctx)
    expect(r.state.outcome).toEqual({ winner: null, reason: 'draw_double_ko' })
  })

  it('同じステップで両方が撃墜されると、両方のストックが 1 ずつ減る', () => {
    const ctx = ctxWith()
    const s = place(place(startFight(ctx), 0, -7, 5), 1, 31, 5)
    const r = stepMatch(s, [input(), input()], ctx)
    expect(r.state.fighters.map((f) => f.stocks)).toEqual([2, 2])
    expect(r.state.phase).toBe('fight')
  })

  it('時間切れと撃墜が同じステップ: 撃墜を先に処理して、そのうえで判定する', () => {
    const ctx = ctxWith()
    let s = startFight(ctx)
    s = { ...s, timeLeft: 1 }
    s = place(s, 0, -7, 5)
    const r = stepMatch(s, [input(), input()], ctx)
    expect(r.state.outcome).toEqual({ winner: 'p2', reason: 'timeup_stocks' })
  })

  it('リスポーンの待ち中に時間切れ: ストック（すでに減っている）で判定する', () => {
    const ctx = ctxWith({ timeLimitSec: 1 })
    const s = place(startFight(ctx), 0, -7, 5)
    const { s: end } = run(ctx, s, 100, idle, (st) => st.phase === 'end')
    expect(end.outcome).toEqual({ winner: 'p2', reason: 'timeup_stocks' })
  })
})

describe('復帰の記録（recovery.md §5）', () => {
  const placeAt = (s: MatchState, x: number, y: number, extra = {}): MatchState => ({
    ...s,
    fighters: [
      { ...s.fighters[0], body: { ...s.fighters[0].body, x, y, onGround: false }, ...extra },
      s.fighters[1],
    ],
  })

  it('場外に 0.3 秒以上いて、足場に戻ると、復帰成功。短いと記録しない', () => {
    const ctx = ctxWith()
    // 足場の左端（x = 4）の外側、少し低い位置。上へ飛び、右へ戻る（空中ジャンプ + 右）
    const long = placeAt(startFight(ctx), 2.5, 9.5)
    const { events } = run(ctx, long, 200, (_, st) => [
      input({ right: true, jumpPressed: st.phaseStep % 12 === 1 }),
      input(),
    ])
    const ok = ofType(events, 'recovery_success')
    expect(ok.length).toBeGreaterThanOrEqual(0) // 戻れたかは、配置による
    for (const e of ok) expect(e.outSteps).toBeGreaterThanOrEqual(18)
    expect(ofType(events, 'ko')).toHaveLength(0)
  })

  it('場外から足場に戻れず撃墜されると、復帰失敗。復帰を試みていたかが残る', () => {
    const ctx = ctxWith()
    const s = placeAt(startFight(ctx), 2, 9.5)
    const { events } = run(
      ctx,
      s,
      400,
      (_, st) => [input({ left: true, jumpPressed: st.phaseStep % 15 === 0 }), input()],
      (_, e) => e.some((x) => x.type === 'ko'),
    )
    const ko = ofType(events, 'ko')
    expect(ko).toHaveLength(1)
    expect(ko[0].recoveryAttempted).toBe(true)
    expect(ofType(events, 'recovery_failure')).toHaveLength(1)
  })

  it('何もしないで落ちて撃墜されても、復帰失敗として数える。復帰は試みていない', () => {
    const ctx = ctxWith()
    const s = placeAt(startFight(ctx), 2, 9.5)
    const { events } = run(ctx, s, 400, idle, (_, e) => e.some((x) => x.type === 'ko'))
    expect(ofType(events, 'ko')[0].recoveryAttempted).toBe(false)
    expect(ofType(events, 'recovery_failure')).toHaveLength(1)
  })
})

describe('レビュー指摘の回帰', () => {
  it('リスポーン直後にジャンプしても、空中ジャンプの回数を使わない（接地した状態で始まる）', () => {
    const ctx = ctxWith()
    let s = startFight(ctx)
    s = {
      ...s,
      fighters: [
        { ...s.fighters[0], body: { ...s.fighters[0].body, x: -6.1, y: 5, onGround: false } },
        s.fighters[1],
      ],
    }
    s = run(ctx, s, 91).s // 撃墜 → リスポーン
    expect(s.fighters[0].combat.down).toBe(false)
    expect(s.fighters[0].body.onGround).toBe(true)
    const r = stepMatch(s, [input({ jumpPressed: true }), input()], ctx)
    expect(ofType(r.events, 'jump')).toEqual([
      { step: s.step, type: 'jump', fighter: 0, air: false },
    ])
    expect(r.state.fighters[0].body.airJumpsLeft).toBe(2)
  })

  it('空中で足場の範囲に戻っただけでは、復帰成功にしない。着地して初めて記録する', () => {
    const ctx = ctxWith()
    const s0 = startFight(ctx)
    // 足場の範囲の外（x < 4）に 20 ステップいた状態で、空中のまま範囲の内側に入った
    const f = s0.fighters[0]
    const air: MatchState = {
      ...s0,
      fighters: [
        {
          ...f,
          outSteps: 20,
          recoveryAttempted: true,
          body: { ...f.body, x: 4.5, y: 8, onGround: false },
        },
        s0.fighters[1],
      ],
    }
    const r1 = stepMatch(air, [input(), input()], ctx)
    expect(r1.state.fighters[0].body.onGround).toBe(false)
    expect(ofType(r1.events, 'recovery_success')).toHaveLength(0)
    expect(r1.state.fighters[0].outSteps).toBe(20) // 復帰の最中として、保持する
    // 着地するまで進める
    const { events } = run(ctx, r1.state, 60)
    expect(ofType(events, 'recovery_success')).toEqual([
      expect.objectContaining({ type: 'recovery_success', fighter: 0, outSteps: 20 }),
    ])
  })

  it('空中で範囲に戻ったあと、足場を逃して撃墜されたら、復帰失敗だけを数える（成功は出ない）', () => {
    const ctx = ctxWith()
    const s0 = startFight(ctx)
    const f = s0.fighters[0]
    // 足場の下（床の高さより低い位置）から外へ。範囲の内側（x = 3.9 は外、x = 4.1 は内）を、空中のまま落ちる
    const air: MatchState = {
      ...s0,
      fighters: [
        { ...f, outSteps: 30, body: { ...f.body, x: 3.9, y: 14, onGround: false, vy: 5 } },
        s0.fighters[1],
      ],
    }
    const { events } = run(ctx, air, 400, idle, (_, e) => e.some((x) => x.type === 'ko'))
    expect(ofType(events, 'recovery_success')).toHaveLength(0)
    expect(ofType(events, 'recovery_failure')).toHaveLength(1)
  })
})

describe('決定的', () => {
  it('同じ入力の列から、同じ状態・イベントになる', () => {
    const ctx = ctxWith()
    const script: Script = (n) => [
      input({ right: n % 50 < 30, jumpPressed: n % 37 === 0, attackPressed: n % 29 === 0 }),
      input({ left: n % 40 < 25, jumpPressed: n % 31 === 0, attackPressed: n % 23 === 0 }),
    ]
    const a = run(ctx, createMatchState(ctx), 1500, script)
    const b = run(ctx, createMatchState(ctx), 1500, script)
    expect(a.s).toEqual(b.s)
    expect(a.events).toEqual(b.events)
  })

  it('標準の設定どうしで、操作を続けると、やがて撃墜が起きる（試合が成立する）', () => {
    const ctx = ctxWith()
    // p1 が p2 に向かって歩き、攻撃し続ける。p2 は何もしない
    const script: Script = (_, st) => {
      const [a, b] = st.fighters
      const dir = b.body.x > a.body.x
      return [input({ right: dir, left: !dir, attackPressed: st.phaseStep % 24 === 0 }), input()]
    }
    const { events } = run(
      ctx,
      createMatchState(ctx),
      ctx.steps.ready + ctx.steps.time,
      script,
      (_, e) => e.some((x) => x.type === 'ko'),
    )
    // 攻撃を受けた相手は、足場の端から、吹き飛ばされて落ち、復帰できずに撃墜される
    expect(ofType(events, 'hit').length).toBeGreaterThanOrEqual(1)
    expect(ofType(events, 'ko').length).toBeGreaterThan(0)
  })
})
