// 簡易CPUの意思決定。盤面のビューを読み、そのステップの入力（PlayerInput）を返す。
// 仕様: docs/03-combat/cpu-opponent.md §4〜§5
// プレイヤーと同じ入力（左右・ジャンプ・攻撃）を返すだけで、試合の状態を書き換える手段を持たない。
// 乱数は、シードつきの疑似乱数（同じシード・同じ盤面の列から、同じ入力の列。決定的）
import { NO_INPUT, rng, type MatchContext, type PlayerInput } from '../battle/index.ts'
import type { CombatConfig } from '../combat/index.ts'
import type { StageData } from '../model/index.ts'
import { BODY_WIDTH, GRAVITY, type FighterParams } from '../physics/index.ts'
import type { Platform } from '../stage/index.ts'
import type { CpuLevel } from './level.ts'
import { createTerrain, type Terrain } from './terrain.ts'
import type { CpuView, FighterView } from './view.ts'

/** CPU が試合の最初に知っていること。ステージの形と、ルール（攻撃の届く距離など）と、自分の能力値 */
export type CpuSetup = {
  stage: StageData
  /** 自分の移動速度・ジャンプの高さ（自分の能力値から決まる。プレイヤーと同じ式） */
  params: FighterParams
  combat: CombatConfig
}

export const cpuSetupOf = (ctx: MatchContext, slot: 0 | 1): CpuSetup => ({
  stage: ctx.stage,
  params: ctx.params[slot],
  combat: ctx.combat,
})

/** 行動の名前（テストと、仕様の説明に使う。cpu-opponent.md §4） */
export type CpuAction =
  | 'idle' // 動かない（試合の外・やられ中・撃墜中）
  | 'recover' // 場外から戻る
  | 'evade' // 回避（離れる・ジャンプでかわす）
  | 'retreat' // 距離を取る
  | 'attack'
  | 'approach' // 相手に近づく
  | 'climb' // 高い足場へ上がる
  | 'wait' // 足場の端で待つ（相手が場外のとき）・中央で待つ（相手が撃墜中）
  | 'wander' // 位置を取り直す（固まったとき）

export type CpuDecision = { input: PlayerInput; action: CpuAction }

// --- 間合い（combat-system.md §5〜§6 の当たり判定から決まる） ---

/** 攻撃が届く横の距離: 体の半分 + 攻撃の幅 + 相手の体の半分。発生までに相手が動く分だけ、少し短く見る */
const reachOf = (c: CombatConfig) => BODY_WIDTH + c.hitboxWidth - 0.1
/** 攻撃が届く縦の差（相手の足元 − 自分の足元）。当たり判定の高さの重なりから */
const inBand = (dy: number, c: CombatConfig) =>
  dy > -(c.hitboxTop - 0.1) && dy < c.hitboxBottom + 0.1

/** ジャンプの押し直しの間隔（ステップ）。押しっぱなしで、空中ジャンプを使い切らないため */
const JUMP_COOLDOWN = 8
/** 固まったかを調べる間隔（ステップ）と、動いたとみなす距離（セル） */
const STUCK_STEPS = 60
const STUCK_DIST = 0.3

type Plan = { action: 'evade' | 'retreat' | 'wander'; dir: -1 | 1; left: number; jumpAt: number }

const sign = (v: number, fallback: -1 | 1): -1 | 1 => (v > 0 ? 1 : v < 0 ? -1 : fallback)

const press = (move: -1 | 0 | 1, jump = false, attack = false): PlayerInput => ({
  left: move < 0,
  right: move > 0,
  jumpPressed: jump,
  attackPressed: attack,
})

/**
 * CPU を作る。返す関数は、ステップごとに 1 回、そのステップのビューを渡して呼ぶ。
 * 同じ setup・level・seed で作り、同じビューの列を渡せば、同じ入力の列を返す
 */
export function createCpu(setup: CpuSetup, level: CpuLevel, seed: number) {
  const rand = rng(seed)
  const terrain: Terrain = createTerrain(setup.stage)
  const c = setup.combat
  const reach = reachOf(c)
  const threat = c.attackStartup + c.attackActive
  const jumpHeight = setup.params.jumpHeight

  // 相手の見え方（reactionSteps だけ前のもの）
  const foeHistory: FighterView[] = []
  let clock = 0
  let jumpCd = 0
  let plan: Plan | null = null
  // 相手の攻撃・接近ごとの、回避の抽選（1 回の攻撃・接近につき 1 回）
  let prevFoeAttackT: number | null = null
  let foeWasNear = false
  let evadeThis = false
  let prevSelfAttacking = false
  let anchor = { x: 0, step: 0 }
  // 攻撃が届く距離に、続けて相手がいるようになったステップ（届かない・攻撃中は null）
  let inRangeSince: number | null = null

  const safeAhead = (me: FighterView, dir: -1 | 1, dist: number) =>
    terrain.safe(me.x + dir * dist, me.y)
  const canRetreat = (me: FighterView, dir: -1 | 1) =>
    me.onGround && safeAhead(me, dir, 0.7) && safeAhead(me, dir, 1.5)

  const jump = (): boolean => {
    if (jumpCd > 0) return false
    jumpCd = JUMP_COOLDOWN
    return true
  }

  /**
   * 高い足場 p へ上がる・戻る動き。足場の下にいるときは、外側の縁へ回り込んでから跳ぶ。
   * 地上から上がるとき、回り込む縁の下に足場がなければ（落ちてしまう）、その縁は使わない。
   * 使える縁がなければ null（ここからは上がれない）
   */
  function climbTo(me: FighterView, p: Platform, inside: number): PlayerInput | null {
    const below = me.y > p.row + 0.01
    let tx = inside
    if (below) {
      const edges = [p.col - 0.45, p.col + p.width + 0.45].filter(
        (e) => !me.onGround || terrain.safe(e, me.y),
      )
      if (edges.length === 0) return null
      // 足場の上面より低い: 外側の縁の下まで行く（足場の裏に頭をぶつけない）
      tx = edges.reduce((a, b) => (Math.abs(b - me.x) < Math.abs(a - me.x) ? b : a))
      // 縁の外で、上面の近くまで上がった: 内側へ
      if (terrain.headroom(me.x, me.y) > 0.5 && me.y - p.row < 1.2 && me.vy < 0) tx = inside
    }
    const dx = tx - me.x
    const move: -1 | 0 | 1 = Math.abs(dx) < 0.15 ? 0 : dx > 0 ? 1 : -1
    let doJump = false
    // 頭の上が空いているときだけ跳ぶ（足場の裏にぶつけて、空中ジャンプをむだにしない）
    if (below && terrain.headroom(me.x, me.y) > 0.6) {
      if (me.onGround) doJump = Math.abs(dx) < 0.35 && jump()
      // 空中: 上向きの勢いが弱まったら、空中ジャンプ
      else if (me.vy > -2 && me.airJumpsLeft > 0) doJump = jump()
    }
    return press(move, doJump)
  }

  /** 戻る先の足場: 届く高さのうち、勢いを考えて、横に近いもの（cpu-opponent.md §5.2） */
  function recoveryTarget(me: FighterView): Platform {
    const rise = me.vy < 0 ? (me.vy * me.vy) / (2 * GRAVITY) : 0
    const budget = jumpHeight * me.airJumpsLeft + rise + 0.3
    const px = me.x + me.vx * 0.3
    let best: Platform | null = null
    let bestScore = Infinity
    for (const p of terrain.platforms) {
      const need = me.y - p.row // 正: 足場が上
      const hd = px < p.col ? p.col - px : px > p.col + p.width ? px - (p.col + p.width) : 0
      const score = hd + Math.max(0, need) * 0.5 + (need > budget ? 100 : 0)
      if (score < bestScore) {
        best = p
        bestScore = score
      }
    }
    return best ?? terrain.home
  }

  function recover(me: FighterView): PlayerInput {
    const p = recoveryTarget(me)
    const inside = Math.min(Math.max(me.x, p.col + 0.8), p.col + p.width - 0.8)
    const input = climbTo(me, p, inside) ?? press(sign(inside - me.x, me.facing))
    // 足場の上面より上にいても、落ち始めて、横にまだ届かないときは、空中ジャンプで高さを保つ
    if (
      !input.jumpPressed &&
      me.y <= p.row + 0.01 &&
      me.vy > 1 &&
      me.airJumpsLeft > 0 &&
      terrain.headroom(me.x, me.y) > 0.6
    ) {
      const hd = me.x < p.col ? p.col - me.x : me.x > p.col + p.width ? me.x - p.col - p.width : 0
      if (hd > 0.2 && p.row - me.y < 1.0) return { ...input, jumpPressed: jump() }
    }
    return input
  }

  /** 相手の攻撃・接近ごとに、回避するかを 1 回だけ決める */
  function trackFoe(me: FighterView, foe: FighterView) {
    const t = foe.attack ? foe.attack.t : null
    if (t !== null && (prevFoeAttackT === null || t < prevFoeAttackT)) {
      evadeThis = rand() < level.evadeChance
    }
    prevFoeAttackT = t
    const near =
      !foe.down && Math.abs(foe.x - me.x) < reach + 0.8 && inBand(foe.y - me.y, c) && !me.down
    // 相手が、こちらを向いて、間合いの外から近づいてきた（攻撃を読んで、先にかわす。確率は半分）
    const coming = foe.facing === sign(me.x - foe.x, foe.facing) && foe.vx * (me.x - foe.x) > 0
    if (near && !foeWasNear && coming) evadeThis = rand() < level.evadeChance * 0.5
    foeWasNear = near
  }

  function runPlan(me: FighterView): CpuDecision | null {
    if (!plan) return null
    // 進む先に足場がなければ、やめる（自分から落ちない）
    if (plan.left <= 0 || (me.onGround && !safeAhead(me, plan.dir, 0.6))) {
      plan = null
      return null
    }
    plan.left--
    const doJump = plan.left === plan.jumpAt && me.onGround && jump()
    return { input: press(plan.dir, doJump), action: plan.action }
  }

  function decide(v: CpuView): CpuDecision {
    foeHistory.push(v.foe)
    while (foeHistory.length > level.reactionSteps + 1) foeHistory.shift()
    const foe = foeHistory[0]!
    const me = v.self
    if (jumpCd > 0) jumpCd--
    trackFoe(me, foe)

    if (v.phase !== 'fight' || me.down || me.stunned) {
      plan = null
      prevSelfAttacking = false
      anchor = { x: me.x, step: v.step }
      return { input: NO_INPUT, action: 'idle' }
    }
    clock++
    const think = clock % level.thinkSteps === 0

    // 1. 復帰: 空中で、下に足場がない（このまま落ちると場外）
    if (!me.onGround && !terrain.safe(me.x, me.y)) {
      plan = null
      return { input: recover(me), action: 'recover' }
    }

    const dx = foe.x - me.x
    const dy = foe.y - me.y
    const toFoe = sign(dx, me.facing)
    const away = -toFoe as -1 | 1
    const foeOff = !foe.down && !foe.onGround && !terrain.safe(foe.x, foe.y)

    // 2. 自分の攻撃が終わったら、距離を取ることがある
    const attacking = me.attack !== null
    if (prevSelfAttacking && !attacking && rand() < level.retreatChance && canRetreat(me, away)) {
      plan = { action: 'retreat', dir: away, left: 15 + Math.floor(rand() * 15), jumpAt: -1 }
    }
    prevSelfAttacking = attacking
    // 届く距離に、続けて何ステップいるか（固まり防止。届かない間・攻撃中は数え直す）
    const canHit = !foe.down && !foe.stunned && !foe.invulnerable && inBand(dy, c)
    const inRange = canHit && Math.abs(dx) <= reach
    inRangeSince = inRange && !attacking ? (inRangeSince ?? v.step) : null
    if (attacking) return { input: NO_INPUT, action: 'attack' } // 攻撃の間は、その場で出し切る

    // 3. 回避: 相手が攻撃を構えた・間合いに入ってきた（抽選に当たったときだけ。1 回につき 1 回）
    const foeThreat = foe.attack !== null && foe.attack.t < threat
    if (
      evadeThis &&
      !foe.down &&
      !foeOff &&
      Math.abs(dx) < reach + 0.8 &&
      inBand(dy, c) &&
      (foeThreat || !foe.attack)
    ) {
      evadeThis = false
      const byJump = me.onGround && (rand() < 0.4 || !canRetreat(me, away))
      if (byJump) {
        const dir = canRetreat(me, away) ? away : toFoe // 離れられないときは、相手を跳び越える
        plan = { action: 'evade', dir, left: 12, jumpAt: 12 }
        return { input: press(dir, jump()), action: 'evade' }
      }
      if (canRetreat(me, away)) {
        plan = { action: 'evade', dir: away, left: 18, jumpAt: -1 }
        return { input: press(away), action: 'evade' }
      }
    }

    // 4. 続けている動き（回避・距離を取る・位置の取り直し）
    const planned = runPlan(me)
    if (planned) return planned

    // 5. 攻撃（判断の間隔ごとに抽選。届かない距離で出してしまうのが、ミス）
    if (think && canHit) {
      const nearMiss = !inRange && Math.abs(dx) <= reach + 0.7
      // 届く距離に 1 秒続けていて、まだ攻撃していない: 抽選なしで攻撃する（固まらない）
      const overdue = inRangeSince !== null && v.step - inRangeSince >= STUCK_STEPS
      if (
        overdue ||
        (inRange && rand() < level.attackChance) ||
        (nearMiss && rand() < level.missChance)
      ) {
        anchor = { x: me.x, step: v.step }
        return { input: press(toFoe, false, true), action: 'attack' }
      }
    }

    // 6. 固まっていないか（同じ場所で、攻撃もできずにいる）。固まっていたら、位置を取り直す
    if (Math.abs(me.x - anchor.x) > STUCK_DIST || foe.down) anchor = { x: me.x, step: v.step }
    else if (v.step - anchor.step >= STUCK_STEPS && !inRange) {
      anchor = { x: me.x, step: v.step }
      const first = (rand() < 0.5 ? -1 : 1) as -1 | 1
      const dir = safeAhead(me, first, 0.8) ? first : (-first as -1 | 1)
      plan = { action: 'wander', dir, left: 30 + Math.floor(rand() * 20), jumpAt: -1 }
      if (rand() < 0.5) plan.jumpAt = plan.left - 1
      const w = runPlan(me)
      if (w) return w
    }

    // 7. 動き先を決める
    // 相手が撃墜中: ステージの中央へ戻って待つ
    if (foe.down) return walkTo(me, terrain.home.col + terrain.home.width / 2, 'wait')
    // 相手が場外: 追って落ちない。自分の足場の、相手に近い端で待つ
    if (foeOff) {
      const p = terrain.platformAt(me.x, me.y) ?? terrain.home
      const tx = Math.min(Math.max(foe.x, p.col + 0.7), p.col + p.width - 0.7)
      return walkTo(me, tx, 'wait')
    }
    // 相手が高い足場に立っている: 上がる
    if (foe.onGround && dy < -0.9) {
      const p = terrain.platformAt(foe.x, foe.y)
      const input = p && climbTo(me, p, foe.x)
      if (input) return { input, action: 'climb' }
    }
    return walkTo(me, foe.x, 'approach', reach * 0.7)
  }

  /** 地上・空中で、tx へ向かう。足場の切れ目は、向こうに足場があれば跳び越え、なければ止まる */
  function walkTo(me: FighterView, tx: number, action: CpuAction, stopAt = 0.3): CpuDecision {
    const dx = tx - me.x
    if (Math.abs(dx) <= stopAt) return { input: NO_INPUT, action }
    const dir: -1 | 1 = dx > 0 ? 1 : -1
    if (me.onGround && !safeAhead(me, dir, 0.6)) {
      // 向こう側に、同じ高さか低い足場がある（切れ目の幅が、跳べる程度）
      let across = false
      for (let d = 1.0; d <= Math.min(3, Math.abs(dx) + 1); d += 0.25) {
        const g = terrain.groundBelow(me.x + dir * d, me.y - jumpHeight * 0.8)
        if (g !== null && g >= me.y - jumpHeight * 0.8) across = true
      }
      if (!across) return { input: NO_INPUT, action: 'wait' }
      return { input: press(dir, jump()), action }
    }
    return { input: press(dir), action }
  }

  return decide
}
