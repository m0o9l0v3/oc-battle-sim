// 戦闘中のファイターの状態と、1ステップの処理。純関数（状態は引数と戻り値）。
// 仕様: docs/03-combat/combat-system.md §5〜§7
import type { Stats } from '../model/index.ts'
import { BODY_HEIGHT, BODY_WIDTH, launch, type Body } from '../physics/index.ts'
import { DEFAULT_COMBAT_CONFIG, type CombatConfig } from './config.ts'
import {
  accumulateDamage,
  damageDealt,
  hitstunSteps,
  launchSpeed,
  launchVelocity,
} from './formulas.ts'

export type Facing = -1 | 1 // -1: 左、1: 右

export type AttackPhase = 'startup' | 'active' | 'recovery'

export type AttackState = {
  /** 攻撃を始めてからのステップ（0 から）。始めたステップが 0 */
  t: number
  /** 攻撃を始めたときの向き。持続中に向きを変えても変わらない */
  facing: Facing
  /** この攻撃が、すでに当たった（1回の攻撃で、同じ相手には1回だけ） */
  hasHit: boolean
}

export type CombatState = {
  /** 蓄積ダメージ（%）。内部は小数 */
  damage: number
  /** やられ中の残りステップ。0 なら、やられ中でない */
  hitstun: number
  /** 攻撃を受けない残りステップ（回復後の無敵。リスポーン後の無敵も、#24 でここを使う） */
  invuln: number
  /** ヒットストップの残りステップ。0 より大きい間は、位置・速度・タイマーがすべて止まる */
  hitstop: number
  attack: AttackState | null
  /** 撃墜中・リスポーン待ち。操作できず、攻撃を受けず、攻撃もしない（battle が設定する） */
  down: boolean
}

export const createCombatState = (): CombatState => ({
  damage: 0,
  hitstun: 0,
  invuln: 0,
  hitstop: 0,
  attack: null,
  down: false,
})

export type CombatFighter = {
  body: Body
  facing: Facing
  stats: Pick<Stats, 'attackPower' | 'defense'>
  combat: CombatState
}

export type HitEvent = {
  type: 'hit'
  attacker: 0 | 1
  victim: 0 | 1
  /** そのヒットで与えたダメージ（%）。上限で止まったあとも、式の値を記録する（ヒットした時点の値） */
  damageDealt: number
  /** ヒット後の、受けた側の蓄積ダメージ（%） */
  damageAfter: number
  launchSpeed: number
  vx: number
  vy: number
  hitstunSteps: number
}

// --- 状態の問い合わせ ---

export const attackPhase = (
  a: AttackState,
  c: CombatConfig = DEFAULT_COMBAT_CONFIG,
): AttackPhase =>
  a.t < c.attackStartup ? 'startup' : a.t < c.attackStartup + c.attackActive ? 'active' : 'recovery'

/** 位置・速度・タイマーが止まっているか（ヒットストップ） */
export const isFrozen = (f: CombatFighter) => f.combat.hitstop > 0

/** 操作できるか。やられ中、撃墜中・リスポーン待ちは false */
export const isControllable = (f: CombatFighter) => f.combat.hitstun === 0 && !f.combat.down

/** 攻撃を始められるか。攻撃中は始められない（硬直が終わるまで）。やられ中・ヒットストップ中も不可 */
export const canAttack = (f: CombatFighter) =>
  f.combat.attack === null && isControllable(f) && !isFrozen(f)

/** 横の移動速度の倍率。地上で攻撃中は 0.4 倍。空中は通常のまま（combat-system.md §6.4） */
export const moveSpeedScale = (f: CombatFighter, c: CombatConfig = DEFAULT_COMBAT_CONFIG) =>
  f.combat.attack !== null && f.body.onGround ? c.groundAttackSpeedScale : 1

/** ヒットを受けられるか（やられ中と、回復後の無敵の間は受けない） */
export const isVulnerable = (f: CombatFighter) =>
  !f.combat.down && f.combat.hitstun === 0 && f.combat.invuln === 0

// --- 当たり判定 ---

export type Rect = { x0: number; x1: number; y0: number; y1: number }

/** やられ判定（hurtbox）。足元の中心を基準にした 0.50 × 0.80 の長方形。全員同じ（y は下が正） */
export const hurtbox = (b: Pick<Body, 'x' | 'y'>): Rect => ({
  x0: b.x - BODY_WIDTH / 2,
  x1: b.x + BODY_WIDTH / 2,
  y0: b.y - BODY_HEIGHT,
  y1: b.y,
})

/** 攻撃の当たり判定（hitbox）。体の前の端から前へ。出ていない間は null */
export function hitbox(f: CombatFighter, c: CombatConfig = DEFAULT_COMBAT_CONFIG): Rect | null {
  const a = f.combat.attack
  if (!a || attackPhase(a, c) !== 'active') return null
  const front = f.body.x + (a.facing * BODY_WIDTH) / 2
  const [x0, x1] = a.facing > 0 ? [front, front + c.hitboxWidth] : [front - c.hitboxWidth, front]
  return { x0, x1, y0: f.body.y - c.hitboxTop, y1: f.body.y - c.hitboxBottom }
}

/** 長方形どうしが重なるか（接しているだけでは重ならない） */
export const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

// --- 1ステップの処理 ---

/** 攻撃を始める。できないときは、そのまま返す */
export function tryStartAttack<F extends CombatFighter>(f: F, facing: Facing): F {
  if (!canAttack(f)) return f
  return {
    ...f,
    combat: { ...f.combat, attack: { t: 0, facing, hasHit: false } },
  }
}

/**
 * 戦闘の1ステップ。移動（physics）のあとに呼ぶ。
 *  1. ヒット判定（このステップの状態から。相打ちは、両方に当たる）
 *  2. ヒットの処理: ダメージ → 吹き飛ばし → やられ中 → ヒットストップ（攻撃側・受けた側の両方）
 *  3. タイマーを進める（ヒットストップ中の側は、ヒットストップだけが減り、ほかは止まる）。
 *     今ヒットを受けた側は進めない（新しいやられ中は、ヒットストップが終わってから減り始める）
 * 呼び出し側は、ヒットストップ中（isFrozen）のファイターの、移動（physics）を飛ばす。
 */
export function resolveCombat(
  fighters: readonly [CombatFighter, CombatFighter],
  c: CombatConfig = DEFAULT_COMBAT_CONFIG,
): { fighters: [CombatFighter, CombatFighter]; events: HitEvent[] } {
  const next: [CombatFighter, CombatFighter] = [fighters[0], fighters[1]]
  const events: HitEvent[] = []

  // 1. ヒット判定。どちらも、このステップの最初の状態から判定する（相打ちを両方に当てる）
  const hits: [0 | 1, 0 | 1][] = []
  for (const i of [0, 1] as const) {
    const attacker = fighters[i]
    const victimIdx = (1 - i) as 0 | 1
    const victim = fighters[victimIdx]
    if (attacker.combat.down || isFrozen(attacker) || isFrozen(victim)) continue
    const a = attacker.combat.attack
    if (!a || a.hasHit) continue
    const box = hitbox(attacker, c)
    if (box && isVulnerable(victim) && overlaps(box, hurtbox(victim.body))) {
      hits.push([i, victimIdx])
    }
  }

  // 2. ヒットの処理（結果を求める。相打ちは、両方とも、このステップの最初の状態から）
  const attackers = new Set<number>(hits.map(([i]) => i))
  type Outcome = { vx: number; vy: number; damageAfter: number; steps: number }
  const outcome = new Map<number, Outcome>()
  for (const [i, v] of hits) {
    const attacker = fighters[i]
    const victim = fighters[v]
    const dealt = damageDealt(attacker.stats.attackPower, c)
    const damageAfter = accumulateDamage(victim.combat.damage, dealt, c)
    const speed = launchSpeed(damageAfter, victim.stats.defense, c)
    // 向き: 攻撃してきた相手から離れる向き。同じ位置のときは、攻撃した側の向きの前方
    const dx = victim.body.x - attacker.body.x
    const dir: 1 | -1 = dx > 0 ? 1 : dx < 0 ? -1 : attacker.combat.attack!.facing
    const { vx, vy } = launchVelocity(speed, dir, c)
    const steps = hitstunSteps(speed, c)
    outcome.set(v, { vx, vy, damageAfter, steps })
    events.push({
      type: 'hit',
      attacker: i,
      victim: v,
      damageDealt: dealt,
      damageAfter,
      launchSpeed: speed,
      vx,
      vy,
      hitstunSteps: steps,
    })
  }

  // 3. 反映。受けた側は、新しいやられ中・ヒットストップにする（タイマーは進めない）。
  //    当てた側は、このステップの分のタイマーを進めてから、ヒットストップを始める
  for (const i of [0, 1] as const) {
    const f = fighters[i]
    const o = outcome.get(i)
    if (o) {
      next[i] = {
        ...f,
        body: launch(f.body, o.vx, o.vy),
        combat: {
          ...f.combat,
          damage: o.damageAfter,
          hitstun: o.steps,
          hitstop: c.hitstopSteps,
          attack: null, // 攻撃中だった場合、その攻撃は打ち切る
        },
      }
    } else if (attackers.has(i)) {
      const marked = {
        ...f,
        combat: { ...f.combat, attack: f.combat.attack && { ...f.combat.attack, hasHit: true } },
      }
      const ticked = tick(marked, c)
      next[i] = { ...ticked, combat: { ...ticked.combat, hitstop: c.hitstopSteps } }
    } else {
      next[i] = tick(f, c)
    }
  }
  return { fighters: next, events }
}

/** タイマーを1ステップ進める。ヒットストップ中は、ヒットストップだけが減る */
function tick(f: CombatFighter, c: CombatConfig): CombatFighter {
  const s = f.combat
  if (s.down) return f // 撃墜中は、battle がタイマー（リスポーン待ち）を管理する
  if (s.hitstop > 0) return { ...f, combat: { ...s, hitstop: s.hitstop - 1 } }

  let { hitstun, invuln, attack } = s
  if (hitstun > 0) {
    hitstun -= 1
    if (hitstun === 0) invuln = c.recoveryInvulnSteps // やられ中が終わったら、無敵が続く
  } else if (invuln > 0) {
    invuln -= 1
  }
  if (attack) {
    const t = attack.t + 1
    const total = c.attackStartup + c.attackActive + c.attackRecovery
    attack = t >= total ? null : { ...attack, t }
  }
  return { ...f, combat: { ...s, hitstun, invuln, attack } }
}
