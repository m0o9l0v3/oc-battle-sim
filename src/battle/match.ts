// 試合の進行。1ステップの更新 stepMatch（純関数。乱数・時計なし。同じ入力から同じ結果）。
// 仕様: docs/03-combat/battle-rules.md、combat-system.md §7
// 1ステップの順序: 入力 → 攻撃の開始 → 移動（physics）→ 戦闘（combat）→ 撃墜 → リスポーン → 時間・勝敗

import {
  DEFAULT_COMBAT_CONFIG,
  canAttack,
  createCombatState,
  isControllable,
  isFrozen,
  moveSpeedScale,
  resolveCombat,
  tryStartAttack,
  type CombatConfig,
  type CombatFighter,
  type Facing,
  type HitEvent,
} from '../combat/index.ts'
import type { MatchOutcome, StageData, Stats } from '../model/index.ts'
import {
  AIR_JUMPS,
  BODY_HEIGHT,
  DT,
  canJump,
  createBody,
  DEFAULT_COEFFICIENTS,
  fighterParams,
  type PhysicsCoefficients,
  gridFromStage,
  stepBody,
  type FighterParams,
  type SolidGrid,
} from '../physics/index.ts'
import {
  blastBounds,
  blastCause,
  isOutside,
  MIN_RECOVERY_STEPS,
  platformExtent,
  type BlastBounds,
  type BlastCause,
  type PlatformExtent,
} from './blast.ts'
import { initialControlState, stepControl, type ControlState } from './control.ts'
import type { PlayerInput } from './input.ts'
import { decideOutcome } from './outcome.ts'
import { DEFAULT_MATCH_RULES, secToSteps, type MatchRules } from './rules.ts'

export type MatchPhase = 'ready' | 'fight' | 'end'

export type MatchContext = {
  stage: StageData
  grid: SolidGrid
  params: [FighterParams, FighterParams]
  stats: [Pick<Stats, 'attackPower' | 'defense'>, Pick<Stats, 'attackPower' | 'defense'>]
  rules: MatchRules
  combat: CombatConfig
  blast: BlastBounds
  extent: PlatformExtent
  /** 足元の中心（スポーンのセルの、足場の上面） */
  spawns: [{ x: number; y: number }, { x: number; y: number }]
  steps: {
    ready: number
    time: number
    end: number
    respawnDelay: number
    respawnInvincible: number
  }
}

export function createMatchContext(
  stage: StageData,
  stats: [Stats, Stats],
  rules: MatchRules = DEFAULT_MATCH_RULES,
  combat: CombatConfig = DEFAULT_COMBAT_CONFIG,
  coeffs: PhysicsCoefficients = DEFAULT_COEFFICIENTS,
): MatchContext {
  const spawn = (s: { col: number; row: number }) => ({ x: s.col + 0.5, y: s.row + 1 })
  return {
    stage,
    grid: gridFromStage(stage),
    params: [fighterParams(stats[0], coeffs), fighterParams(stats[1], coeffs)],
    stats: [stats[0], stats[1]],
    rules,
    combat,
    blast: blastBounds(stage, rules.blastMargin),
    extent: platformExtent(stage),
    spawns: [spawn(stage.spawns.p1), spawn(stage.spawns.p2)],
    steps: {
      ready: secToSteps(rules.readySec),
      time: secToSteps(rules.timeLimitSec),
      end: secToSteps(rules.endSec),
      respawnDelay: secToSteps(rules.respawnDelaySec),
      respawnInvincible: secToSteps(rules.respawnInvincibleSec),
    },
  }
}

export type FighterMatch = CombatFighter & {
  stocks: number
  /** 撃墜されてからリスポーンまでの残りステップ（撃墜中のみ。それ以外は 0） */
  respawnIn: number
  control: ControlState
  /** リスポーン後の無敵が効いている（自分が攻撃を出すと解除される） */
  shield: boolean
  /** 連続して場外にいるステップ数（復帰の記録用） */
  outSteps: number
  /** 場外にいる間に、復帰を試みた（左右の操作かジャンプ） */
  recoveryAttempted: boolean
  /** 地面に着いたステップだけ、着く直前の下向きの速さ（アニメーション用）。それ以外は null */
  landingImpactSpeed: number | null
}

export type MatchState = {
  /** 試合の最初（READY の最初）からのステップ数 */
  step: number
  phase: MatchPhase
  /** いまの区間に入ってからのステップ数 */
  phaseStep: number
  /** FIGHT の残りステップ（制限時間） */
  timeLeft: number
  fighters: [FighterMatch, FighterMatch]
  outcome: MatchOutcome | null
}

export type MatchEvent = { step: number } & (
  | HitEvent
  | { type: 'jump'; fighter: 0 | 1; air: boolean }
  /** 左右の入力があり、操作できるステップ。動こうとした距離（移動速度 × dt。battle-report.md §4.3） */
  | { type: 'move'; fighter: 0 | 1; distance: number }
  | {
      type: 'ko'
      fighter: 0 | 1
      cause: BlastCause
      damageAtKo: number
      /** 場外で、復帰を試みていた */
      recoveryAttempted: boolean
    }
  /** 攻撃を出した（攻撃が始まった）。同じステップで、すぐに打ち消されても、出した 1 回として数える（指標用） */
  | { type: 'attack'; fighter: 0 | 1 }
  | { type: 'respawn'; fighter: 0 | 1 }
  | { type: 'recovery_success'; fighter: 0 | 1; outSteps: number }
  | { type: 'recovery_failure'; fighter: 0 | 1; outSteps: number }
  | { type: 'fight_start' }
  | {
      type: 'match_end'
      outcome: MatchOutcome
      stocks: [number, number]
      damage: [number, number]
      /** FIGHT の経過ステップ */
      fightSteps: number
    }
)

const facingToCenter = (x: number, cols: number): Facing => (x < cols / 2 ? 1 : -1)

function spawnFighter(ctx: MatchContext, i: 0 | 1, stocks: number): FighterMatch {
  const sp = ctx.spawns[i]
  return {
    body: { ...createBody(sp.x, sp.y), onGround: true },
    facing: facingToCenter(sp.x, ctx.stage.cols),
    stats: ctx.stats[i],
    combat: createCombatState(),
    stocks,
    respawnIn: 0,
    control: initialControlState(),
    shield: false,
    outSteps: 0,
    recoveryAttempted: false,
    landingImpactSpeed: null,
  }
}

export function createMatchState(ctx: MatchContext): MatchState {
  return {
    step: 0,
    phase: 'ready',
    phaseStep: 0,
    timeLeft: ctx.steps.time,
    fighters: [spawnFighter(ctx, 0, ctx.rules.stocks), spawnFighter(ctx, 1, ctx.rules.stocks)],
    outcome: null,
  }
}

/** END の表示が終わり、結果の画面へ進んでよいか */
export const isMatchFinished = (s: MatchState, ctx: MatchContext) =>
  s.phase === 'end' && s.phaseStep >= ctx.steps.end

const center = (f: FighterMatch) => ({ x: f.body.x, y: f.body.y - BODY_HEIGHT / 2 })

/**
 * 試合を1ステップ進める。
 * @param clockSkip 低性能端末で捨てたステップ数。制限時間からだけ引く（物理・戦闘には影響しない。frontend.md §6.2）
 */
export function stepMatch(
  state: MatchState,
  inputs: readonly [PlayerInput, PlayerInput],
  ctx: MatchContext,
  clockSkip = 0,
): { state: MatchState; events: MatchEvent[] } {
  const step = state.step
  const events: MatchEvent[] = []
  const emit = (
    e: MatchEvent extends infer E ? (E extends { step: number } ? Omit<E, 'step'> : never) : never,
  ) => events.push({ step, ...e } as MatchEvent)

  // --- READY / END: 試合は進めない（END は、結果の表示） ---
  if (state.phase === 'ready') {
    const fighters = state.fighters.map((f, i) => ({
      ...f,
      // 操作はできないが、押している左右の状態は追う（FIGHT の最初から動き出せる）
      control: stepControl(f.control, inputs[i], {
        step,
        acceptInput: false,
        canJump: false,
        canAttack: false,
        defaultFacing: f.facing,
      }).state,
    })) as [FighterMatch, FighterMatch]
    const phaseStep = state.phaseStep + 1
    if (phaseStep >= ctx.steps.ready) {
      emit({ type: 'fight_start' })
      return {
        state: { ...state, step: step + 1, phase: 'fight', phaseStep: 0, fighters },
        events,
      }
    }
    return { state: { ...state, step: step + 1, phaseStep, fighters }, events }
  }
  if (state.phase === 'end') {
    return { state: { ...state, step: step + 1, phaseStep: state.phaseStep + 1 }, events }
  }

  // --- FIGHT ---
  let fighters: [FighterMatch, FighterMatch] = [state.fighters[0], state.fighters[1]]
  const landing: (number | null)[] = [null, null]

  // 1〜3. 入力 → 攻撃の開始 → 移動
  for (const i of [0, 1] as const) {
    let f = fighters[i]
    if (f.combat.down) continue // 撃墜中は、何もしない（リスポーン待ち）
    const frozen = isFrozen(f)
    const controllable = isControllable(f)

    const { state: control, control: ctl } = stepControl(f.control, inputs[i], {
      step,
      // やられ中・撃墜中は、押した瞬間を捨てる。ヒットストップ中は、先行入力としてためる
      acceptInput: controllable,
      canJump: !frozen && canJump(f.body, controllable),
      canAttack: canAttack(f),
      defaultFacing: facingToCenter(f.body.x, ctx.stage.cols),
    })
    f = { ...f, control, facing: ctl.facing }

    if (ctl.attack) {
      const wasIdle = f.combat.attack === null
      f = tryStartAttack(f, ctl.facing)
      if (wasIdle && f.combat.attack !== null) emit({ type: 'attack', fighter: i })
      if (f.shield) {
        // リスポーン後の無敵は、自分が攻撃を出したら解除（無敵のまま攻撃し続けない）
        f = { ...f, shield: false, combat: { ...f.combat, invuln: 0 } }
      }
    }

    if (!frozen) {
      const res = stepBody(
        f.body,
        ctx.params[i],
        {
          move: ctl.move,
          jump: ctl.jump,
          controllable,
          speedScale: moveSpeedScale(f, ctx.combat),
        },
        ctx.grid,
      )
      landing[i] = res.landingImpactSpeed
      if (res.jumped) emit({ type: 'jump', fighter: i, air: !f.body.onGround })
      if (controllable && ctl.move !== 0) {
        emit({ type: 'move', fighter: i, distance: ctx.params[i].moveSpeed * DT })
      }
      // 場外で、左右の操作かジャンプをしたら、復帰を試みたとする
      const attempted =
        f.recoveryAttempted || (f.outSteps > 0 && controllable && (ctl.move !== 0 || ctl.jump))
      f = { ...f, body: res.body, recoveryAttempted: attempted }
    }
    fighters[i] = f
  }

  // 4. 戦闘（ヒット判定、ダメージ、吹き飛ばし、ヒットストップ、タイマー）
  const combat = resolveCombat(fighters, ctx.combat)
  fighters = [
    { ...fighters[0], ...combat.fighters[0], landingImpactSpeed: landing[0] },
    { ...fighters[1], ...combat.fighters[1], landingImpactSpeed: landing[1] },
  ]
  for (const e of combat.events) events.push({ step, ...e })
  // リスポーン後の無敵は、時間が切れたら、印も外す
  for (const i of [0, 1] as const) {
    if (fighters[i].shield && fighters[i].combat.invuln === 0) {
      fighters[i] = { ...fighters[i], shield: false }
    }
  }

  // 5. 場外（撃墜）と、復帰の記録
  for (const i of [0, 1] as const) {
    let f = fighters[i]
    if (f.combat.down) continue
    const prev = center(state.fighters[i])
    const cur = center(f)
    const cause = blastCause(prev, cur, ctx.blast)
    if (cause) {
      // 場外にいたまま撃墜された（復帰を試みる前に撃墜された場合も、復帰失敗として数える）
      emit({ type: 'recovery_failure', fighter: i, outSteps: Math.max(1, f.outSteps) })
      emit({
        type: 'ko',
        fighter: i,
        cause,
        damageAtKo: f.combat.damage,
        recoveryAttempted: f.recoveryAttempted,
      })
      f = {
        ...f,
        // 決着しない試合（試し動かし）では、ストックを減らさない（リスポーンできなくならない）
        stocks: ctx.rules.endless ? f.stocks : f.stocks - 1,
        respawnIn: ctx.steps.respawnDelay,
        shield: false,
        outSteps: 0,
        recoveryAttempted: false,
        combat: { ...f.combat, down: true, attack: null, hitstun: 0, invuln: 0, hitstop: 0 },
      }
    } else {
      const out = isOutside(cur, f.body.onGround, ctx.extent)
      if (out) {
        f = { ...f, outSteps: f.outSteps + 1 }
      } else if (f.outSteps > 0 && f.body.onGround) {
        // 場外から、足場の上に着いた（空中で足場の範囲に戻っただけでは、まだ復帰ではない。
        // そのあと落ちて撃墜されたら、復帰失敗になる）。0.3 秒以上いたものだけを、復帰成功として記録する
        if (f.outSteps >= MIN_RECOVERY_STEPS) {
          emit({ type: 'recovery_success', fighter: i, outSteps: f.outSteps })
        }
        f = { ...f, outSteps: 0, recoveryAttempted: false }
      }
    }
    fighters[i] = f
  }

  // 6. リスポーン（待ち時間が終わり、ストックが残っているとき）
  for (const i of [0, 1] as const) {
    const f = fighters[i]
    if (!f.combat.down || f.respawnIn === 0) continue
    // 撃墜されたステップは、数え始めない（撃墜から respawnDelay ステップ後にリスポーン）
    if (state.fighters[i].combat.down === false) continue
    const left = f.respawnIn - 1
    if (left > 0 || f.stocks <= 0) {
      fighters[i] = { ...f, respawnIn: Math.max(left, 0) }
      continue
    }
    const fresh = spawnFighter(ctx, i, f.stocks)
    fighters[i] = {
      ...fresh,
      // 蓄積ダメージ 0 %、速度 0、空中ジャンプ回復、向きはステージの中央。そのうえで、無敵が続く
      // スポーン位置は足場の上。接地した状態で始める（すぐにジャンプしても、空中ジャンプの回数を使わない）
      body: { ...fresh.body, airJumpsLeft: AIR_JUMPS },
      shield: true,
      combat: { ...createCombatState(), invuln: ctx.steps.respawnInvincible },
    }
    emit({ type: 'respawn', fighter: i })
  }

  // 7. 時間と勝敗。時間切れと撃墜が同じステップなら、撃墜を先に処理したうえで、§7.1 の順で判定
  const timeLeft = Math.max(0, state.timeLeft - 1 - Math.max(0, clockSkip))
  const outcome = ctx.rules.endless
    ? null
    : decideOutcome({
        stocks: [fighters[0].stocks, fighters[1].stocks],
        damage: [fighters[0].combat.damage, fighters[1].combat.damage],
        timeUp: timeLeft === 0,
      })

  if (outcome) {
    emit({
      type: 'match_end',
      outcome,
      stocks: [fighters[0].stocks, fighters[1].stocks],
      damage: [fighters[0].combat.damage, fighters[1].combat.damage],
      fightSteps: ctx.steps.time - timeLeft,
    })
    return {
      state: { step: step + 1, phase: 'end', phaseStep: 0, timeLeft, fighters, outcome },
      events,
    }
  }
  return {
    state: {
      step: step + 1,
      phase: 'fight',
      phaseStep: state.phaseStep + 1,
      timeLeft,
      fighters,
      outcome: null,
    },
    events,
  }
}
