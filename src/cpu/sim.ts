// 簡易CPUの試合のシミュレーション（テスト・調整用。本番の画面では使わない）。
// CPU どうし・CPU と別の入力ソースで、試合を最後まで進める（cpu-opponent.md §8）
import {
  createMatchContext,
  createMatchState,
  isMatchFinished,
  stepMatch,
  type InputSource,
  type MatchContext,
  type MatchEvent,
  type MatchState,
} from '../battle/index.ts'
import type { StageData, Stats } from '../model/index.ts'
import { CpuSource } from './source.ts'
import type { CpuLevel } from './level.ts'

export type CpuSimResult = {
  state: MatchState
  events: MatchEvent[]
  /** 入力の列（決定性の確認用） */
  inputs: [string[], string[]]
  /** 自分で落ちた回数（撃墜の前の 5 秒に、ヒットを受けていない） */
  selfKos: [number, number]
  /** 操作できる（攻撃中でもない）のに、何も押さなかった、いちばん長い連続のステップ数 */
  maxIdle: [number, number]
  /** 行動ごとのステップ数 */
  actions: [Record<string, number>, Record<string, number>]
}

const SELF_KO_WINDOW = 300

/** players に CpuLevel を渡した側は、CPU（シードは seed から決める）。InputSource を渡した側は、それで動かす */
export function simulateCpuMatch(
  stage: StageData,
  stats: [Stats, Stats],
  players: [CpuLevel | InputSource, CpuLevel | InputSource],
  seed: number,
  ctxOverride?: MatchContext,
): CpuSimResult {
  const ctx = ctxOverride ?? createMatchContext(stage, stats)
  const sources = players.map((p, i) =>
    'sample' in p ? p : new CpuSource(ctx, i as 0 | 1, p, seed * 2 + i + 1),
  ) as [InputSource<MatchState>, InputSource<MatchState>]
  let s = createMatchState(ctx)
  const events: MatchEvent[] = []
  const inputs: [string[], string[]] = [[], []]
  const lastHit: [number, number] = [-Infinity, -Infinity]
  const selfKos: [number, number] = [0, 0]
  const idle: [number, number] = [0, 0]
  const maxIdle: [number, number] = [0, 0]
  const actions: [Record<string, number>, Record<string, number>] = [{}, {}]
  const limit = ctx.steps.ready + ctx.steps.time + ctx.steps.end + 10
  for (let i = 0; i < limit && !isMatchFinished(s, ctx); i++) {
    const inp = [0, 1].map((k) => sources[k]!.sample({ step: s.step, observation: s })) as [
      ReturnType<InputSource['sample']>,
      ReturnType<InputSource['sample']>,
    ]
    for (const k of [0, 1] as const) {
      const x = inp[k]
      inputs[k].push(`${+x.left}${+x.right}${+x.jumpPressed}${+x.attackPressed}`)
      const f = s.fighters[k]
      const src = sources[k]
      if (src instanceof CpuSource && src.last) {
        actions[k][src.last.action] = (actions[k][src.last.action] ?? 0) + 1
      }
      const controllable =
        s.phase === 'fight' && !f.combat.down && f.combat.hitstun === 0 && f.combat.attack === null
      const none = !x.left && !x.right && !x.jumpPressed && !x.attackPressed
      idle[k] = controllable && none ? idle[k] + 1 : 0
      maxIdle[k] = Math.max(maxIdle[k], idle[k])
    }
    const r = stepMatch(s, inp, ctx)
    for (const e of r.events) {
      if (e.type === 'hit') lastHit[e.victim] = e.step
      if (e.type === 'ko' && e.step - lastHit[e.fighter] > SELF_KO_WINDOW) selfKos[e.fighter]++
    }
    events.push(...r.events)
    s = r.state
  }
  return { state: s, events, inputs, selfKos, maxIdle, actions }
}
