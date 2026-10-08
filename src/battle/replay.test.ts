// リプレイテスト（test-plan.md §5.1。R1・R4）。
// 入力の列を記録し、ReplaySource で再生して、イベント列と最終状態が一致することを確かめる（決定性・回帰の基準）。
// R2・R3・R5・R6 は、match.test.ts・outcome.test.ts・control.test.ts に、場面ごとに置いてある。
import { describe, expect, it } from 'vitest'
import { DEFAULT_STATS } from '../fighter/config.ts'
import {
  createAnimatorConfig,
  createAnimatorState,
  stepAnimator,
} from '../fighter/render/animator.ts'
import { snapshotOf } from '../fighter/render/snapshot.ts'
import { ReplaySource } from '../input/replay.ts'
import type { Stats } from '../model/index.ts'
import { presetStage } from '../stage/presets.ts'
import { createBot } from './balance.ts'
import type { PlayerInput } from './input.ts'
import {
  createMatchContext,
  createMatchState,
  isMatchFinished,
  stepMatch,
  type MatchEvent,
  type MatchState,
} from './match.ts'
import { DEFAULT_MATCH_RULES } from './rules.ts'

const stage = presetStage('standard')

type Recording = {
  inputs: [PlayerInput[], PlayerInput[]]
  events: MatchEvent[]
  final: MatchState
}

/** ボット2体で試合を最後まで進め、入力の列を記録する */
function record(stats: [Stats, Stats], seed: number): Recording {
  const ctx = createMatchContext(stage, stats, DEFAULT_MATCH_RULES)
  const bots = [createBot(0, ctx, seed), createBot(1, ctx, seed)] as const
  const inputs: [PlayerInput[], PlayerInput[]] = [[], []]
  const events: MatchEvent[] = []
  let s = createMatchState(ctx)
  while (!isMatchFinished(s, ctx)) {
    const pair: [PlayerInput, PlayerInput] = [bots[0](s), bots[1](s)]
    inputs[0].push(pair[0])
    inputs[1].push(pair[1])
    const r = stepMatch(s, pair, ctx)
    s = r.state
    events.push(...r.events)
  }
  return { inputs, events, final: s }
}

/** 記録した入力の列を、ReplaySource から読んで再生する */
function replay(stats: [Stats, Stats], rec: Recording, onStep?: (s: MatchState) => void) {
  const ctx = createMatchContext(stage, stats, DEFAULT_MATCH_RULES)
  const sources = [new ReplaySource(rec.inputs[0]), new ReplaySource(rec.inputs[1])] as const
  const events: MatchEvent[] = []
  let s = createMatchState(ctx)
  while (!isMatchFinished(s, ctx)) {
    const r = stepMatch(
      s,
      [sources[0].sample({ step: s.step }), sources[1].sample({ step: s.step })],
      ctx,
    )
    s = r.state
    events.push(...r.events)
    onStep?.(s)
  }
  return { events, final: s }
}

const count = (events: MatchEvent[], type: MatchEvent['type']) =>
  events.filter((e) => e.type === type).length

describe('R1: 標準設定どうしで、ストックを使い切る', () => {
  const stats: [Stats, Stats] = [DEFAULT_STATS, DEFAULT_STATS]

  it('決着する。再生しても、同じイベント列・同じ最終状態になる（2回実行して比べる）', () => {
    const rec = record(stats, 1)
    expect(rec.final.phase).toBe('end')
    expect(rec.final.outcome).not.toBeNull()
    const a = replay(stats, rec)
    const b = replay(stats, rec)
    expect(a.events).toEqual(rec.events)
    expect(a.final).toEqual(rec.final)
    expect(b.events).toEqual(a.events)
    expect(b.final).toEqual(a.final)
  })

  it('勝敗は、ストックと、撃墜のイベントの数に合う', () => {
    const rec = record(stats, 1)
    const kos = [0, 1].map(
      (i) => rec.events.filter((e) => e.type === 'ko' && e.fighter === i).length,
    )
    expect(rec.final.fighters.map((f) => f.stocks)).toEqual([3 - kos[0]!, 3 - kos[1]!])
    expect(count(rec.events, 'match_end')).toBe(1)
  })

  it('入力を1ステップ変えると、結果が変わりうる（再生が、入力だけに依存している）', () => {
    const rec = record(stats, 1)
    const tampered: Recording = {
      ...rec,
      inputs: [
        rec.inputs[0].map(() => ({ ...rec.inputs[0][0]!, left: false, right: false })),
        rec.inputs[1],
      ],
    }
    const a = replay(stats, rec)
    const b = replay(stats, tampered)
    expect(b.final).not.toEqual(a.final)
  })
})

describe('R4: 極端な配分どうし', () => {
  const heavy: Stats = { attackPower: 8, defense: 2, jumpPower: 5, speed: 5 }
  const sturdy: Stats = { attackPower: 2, defense: 8, jumpPower: 5, speed: 5 }
  const cases: Array<[string, [Stats, Stats]]> = [
    ['攻撃8/防御2 どうし', [heavy, heavy]],
    ['攻撃2/防御8 どうし', [sturdy, sturdy]],
    ['攻撃8/防御2 と 攻撃2/防御8', [heavy, sturdy]],
  ]

  it.each(cases)('%s: 試合が成立し、再生で同じ結果になる', (_name, stats) => {
    const rec = record(stats, 3)
    expect(rec.final.outcome).not.toBeNull()
    expect(count(rec.events, 'hit')).toBeGreaterThan(0)
    const again = replay(stats, rec)
    expect(again.events).toEqual(rec.events)
    expect(again.final).toEqual(rec.final)
  })
})

describe('描画は、試合の結果を変えない（animation.md の受入条件）', () => {
  it('見た目のアニメーションを毎ステップ進めても、MatchState は変わらない', () => {
    const stats: [Stats, Stats] = [DEFAULT_STATS, DEFAULT_STATS]
    const rec = record(stats, 2)
    const frames = { startup: 6, active: 4, recovery: 14 }
    const cfg = createAnimatorConfig(frames)
    const anims = [createAnimatorState(), createAnimatorState()]
    const withAnim = replay(stats, rec, (s) => {
      // 描画側が状態を書き換えないことの確認（読んだあとの JSON が、読む前と同じ）
      const before = JSON.stringify(s)
      for (const i of [0, 1] as const) {
        anims[i] = stepAnimator(
          anims[i]!,
          snapshotOf(s.fighters[i], frames, s.phase === 'fight'),
          cfg,
        )
      }
      expect(JSON.stringify(s)).toBe(before)
    })
    expect(withAnim.final).toEqual(rec.final)
    expect(withAnim.events).toEqual(rec.events)
  })
})
