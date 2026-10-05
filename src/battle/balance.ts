// バランス調整用のシミュレーション（#25）。簡易な「操作のしかたが同じ」ボット2体で、試合を最後まで進める。
// 本番のゲームでは使わない。簡易CPU（#72）とは別物で、能力値の違いだけを比べるための、公平な基準にする。
// 乱数は、シードつきの疑似乱数（同じシードから同じ結果。決定的）。
import type { MatchOutcome, StageData, Stats } from '../model/index.ts'
import { BODY_HEIGHT } from '../physics/index.ts'
import type { PhysicsCoefficients } from '../physics/index.ts'
import type { PlayerInput } from './input.ts'
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
import type { CombatConfig } from '../combat/index.ts'

/** 疑似乱数（mulberry32）。0 以上 1 未満 */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 基準のボット。両者が同じ方針で動く（能力値の違いだけが、結果の差になる）。
 *  - 相手に近づき、攻撃が届く距離で攻撃する（反応の揺らぎとして、攻撃の機会の一部を見送る）
 *  - 場外にいるときは、ステージの中央に向かって動き、落ちているとき（上向きの速さがない）にジャンプする
 *  - 相手が高い足場にいるときは、跳んで上がる。高さが違う相手の近くで動けなくなったら、位置を取り直す
 */
export function createBot(slot: 0 | 1, ctx: MatchContext, seed: number) {
  const rand = rng(seed * 2 + slot + 1)
  const cx = ctx.stage.cols / 2
  // 高さが違う相手の真下・真上で動けなくならないための、位置の取り直し（人が、足場を回り込むのに近い）
  let stuck = 0
  let wander = 0
  let wanderDir: 1 | -1 = 1
  // 見切りの判断は、攻撃のたびに1回（毎ステップ引き直さない）
  const dodgeMemo = new Map<number, boolean>()
  const dodgeRoll = (step: number) => {
    const key = Math.floor(step / 24)
    let v = dodgeMemo.get(key)
    if (v === undefined) {
      v = rand() < 0.6
      dodgeMemo.set(key, v)
    }
    return v
  }
  const none: PlayerInput = { left: false, right: false, jumpPressed: false, attackPressed: false }

  return (s: MatchState): PlayerInput => {
    const me = s.fighters[slot]
    const foe = s.fighters[1 - slot]
    if (s.phase !== 'fight' || me.combat.down) return none

    const toCenter = cx - me.body.x
    const dx = foe.body.x - me.body.x
    const dyFoe = foe.body.y - me.body.y
    const outside =
      !me.body.onGround &&
      (me.body.x < ctx.extent.minX ||
        me.body.x > ctx.extent.maxX ||
        me.body.y - BODY_HEIGHT / 2 > ctx.extent.lowestTop)

    if (outside || (!me.body.onGround && me.combat.hitstun === 0 && Math.abs(toCenter) > 8)) {
      // 復帰: 中央へ。落ち始めたら、空中ジャンプ（回数が残っているとき）
      return {
        left: toCenter < 0,
        right: toCenter > 0,
        jumpPressed: me.body.vy > 0 && me.body.airJumpsLeft > 0 && s.step % 6 === 0,
        attackPressed: false,
      }
    }

    // 高さが違う相手の近くで動けないときは、少し離れて、位置を取り直す
    const levelDiff = Math.abs(dx) < 1.2 && Math.abs(dyFoe) > 0.6
    stuck = levelDiff ? stuck + 1 : 0
    if (wander === 0 && stuck > 45) {
      wander = 45
      wanderDir = rand() < 0.5 ? -1 : 1
      stuck = 0
    }
    if (wander > 0) {
      wander--
      return {
        left: wanderDir < 0,
        right: wanderDir > 0,
        // 位置取りの最後に、跳ぶ（足場に乗る・足場から降りる）
        jumpPressed: wander < 12 && me.body.onGround && s.step % 6 === 0 && rand() < 0.5,
        attackPressed: false,
      }
    }

    // 間合い: 相手が攻撃を出しているとき（発生・持続）は、届かない距離まで下がる（見切り）。
    // 攻撃を空振りした相手の硬直には、近づいて攻撃する（差し込み）。移動速度が高いほど、有利になる
    const foeAtk = foe.combat.attack
    const foeThreat =
      foeAtk !== null && foeAtk.t < ctx.combat.attackStartup + ctx.combat.attackActive
    if (
      foeThreat &&
      Math.abs(dx) < 1.6 &&
      Math.abs(dyFoe) < 0.6 &&
      me.combat.attack === null &&
      dodgeRoll(s.step)
    ) {
      return { left: dx > 0, right: dx < 0, jumpPressed: false, attackPressed: false }
    }

    // 相手に向かう。近ければ止まって攻撃する
    const close = Math.abs(dx) < 0.95 && Math.abs(dyFoe) < 0.6
    const attack = close && s.step % 4 === 0 && rand() < 0.7
    const faceFoe = dx > 0 ? 1 : -1
    // 相手が高い足場に立っているときだけ、跳ぶ。同じ高さ・空中の相手には、跳ばない
    const jump =
      dyFoe < -1.5 &&
      foe.body.onGround &&
      me.body.onGround &&
      Math.abs(dx) < 2.5 &&
      s.step % 10 === 0
    return {
      left: !close && dx < 0,
      right: !close && dx > 0,
      jumpPressed: jump,
      attackPressed: attack && (me.facing === faceFoe || rand() < 0.2),
    }
  }
}

export type SimResult = {
  outcome: MatchOutcome
  /** FIGHT の経過ステップ */
  fightSteps: number
  kos: [number, number]
  hits: [number, number]
  damageDealt: [number, number]
  stocksLeft: [number, number]
  damage: [number, number]
  events: MatchEvent[]
}

export function simulateMatch(
  stage: StageData,
  stats: [Stats, Stats],
  seed: number,
  opts: {
    rules?: MatchRules
    combat?: CombatConfig
    coeffs?: PhysicsCoefficients
    keepEvents?: boolean
  } = {},
): SimResult {
  const ctx = createMatchContext(
    stage,
    stats,
    opts.rules ?? DEFAULT_MATCH_RULES,
    opts.combat,
    opts.coeffs,
  )
  const bots = [createBot(0, ctx, seed), createBot(1, ctx, seed)] as const
  let s = createMatchState(ctx)
  const events: MatchEvent[] = []
  const kos: [number, number] = [0, 0]
  const hits: [number, number] = [0, 0]
  const dealt: [number, number] = [0, 0]
  const limit = ctx.steps.ready + ctx.steps.time + ctx.steps.end + 10
  for (let i = 0; i < limit && !isMatchFinished(s, ctx); i++) {
    const r = stepMatch(s, [bots[0](s), bots[1](s)], ctx)
    s = r.state
    for (const e of r.events) {
      if (e.type === 'ko') kos[e.fighter]++
      if (e.type === 'hit') {
        hits[e.attacker]++
        dealt[e.attacker] += e.damageDealt
      }
      if (opts.keepEvents) events.push(e)
    }
  }
  const end = events.find((e) => e.type === 'match_end')
  return {
    outcome: s.outcome ?? { winner: null, reason: 'draw_timeup' },
    fightSteps: ctx.steps.time - s.timeLeft,
    kos,
    hits,
    damageDealt: dealt,
    stocksLeft: [s.fighters[0].stocks, s.fighters[1].stocks],
    damage: [s.fighters[0].combat.damage, s.fighters[1].combat.damage],
    events: end ? events : events,
  }
}

export type MatchupSummary = {
  /** A の勝ち・B の勝ち・引き分け（A を p1 にした試合と p2 にした試合の合計） */
  winsA: number
  winsB: number
  draws: number
  games: number
  avgFightSec: number
  avgKos: number
  avgHits: number
  reasons: Record<string, number>
}

/** A と B を、左右を入れ替えて、複数のシードで対戦させる（スポーンの位置による有利不利を打ち消す） */
export function runMatchup(
  stage: StageData,
  a: Stats,
  b: Stats,
  seeds: number,
  opts: Parameters<typeof simulateMatch>[3] = {},
): MatchupSummary {
  const sum: MatchupSummary = {
    winsA: 0,
    winsB: 0,
    draws: 0,
    games: 0,
    avgFightSec: 0,
    avgKos: 0,
    avgHits: 0,
    reasons: {},
  }
  let steps = 0
  let kos = 0
  let hits = 0
  for (let seed = 1; seed <= seeds; seed++) {
    for (const aIsP1 of [true, false]) {
      const r = simulateMatch(stage, aIsP1 ? [a, b] : [b, a], seed, opts)
      const w = r.outcome.winner
      if (w === null) sum.draws++
      else if ((w === 'p1') === aIsP1) sum.winsA++
      else sum.winsB++
      sum.reasons[r.outcome.reason] = (sum.reasons[r.outcome.reason] ?? 0) + 1
      sum.games++
      steps += r.fightSteps
      kos += r.kos[0] + r.kos[1]
      hits += r.hits[0] + r.hits[1]
    }
  }
  sum.avgFightSec = steps / sum.games / 60
  sum.avgKos = kos / sum.games
  sum.avgHits = hits / sum.games
  return sum
}
