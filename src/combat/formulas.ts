// ダメージと吹き飛ばしの式。docs/03-combat/damage.md、knockback.md
import { DEFAULT_COMBAT_CONFIG, type CombatConfig } from './config.ts'

/** 1回のヒットで与えるダメージ（%）。攻撃する側の attackPower だけで決まる（相手の defense では変わらない） */
export const damageDealt = (attackPower: number, c: CombatConfig = DEFAULT_COMBAT_CONFIG) =>
  c.baseDamage * (1 + c.kAttack * (attackPower - 5))

/** 蓄積。上限で止まる。内部の値は小数のまま（丸めない） */
export const accumulateDamage = (
  old: number,
  dealt: number,
  c: CombatConfig = DEFAULT_COMBAT_CONFIG,
) => Math.min(c.damageMax, old + dealt)

/** 表示は整数に切り捨て（例: 33.6 % → 33 %）。小数の足し算の誤差（41.999…）で1つ減らない */
export const displayDamage = (damage: number) => Math.floor(damage + 1e-9)

/**
 * 吹き飛ぶ速さ（セル/秒）。damageAfter は、今のヒットのダメージを足したあとの、相手の蓄積ダメージ。
 * 攻撃側の attackPower は入らない
 */
export const launchSpeed = (
  damageAfter: number,
  defense: number,
  c: CombatConfig = DEFAULT_COMBAT_CONFIG,
) => (c.kbBase + c.kbScale * damageAfter) * (1 - c.kDefense * (defense - 5))

/**
 * 速度への分解。direction は 1（右）か -1（左）。縦は下が正（上向きは負）
 * vx = 速さ × cos(角度) × 向き、vy = −速さ × sin(角度)
 */
export function launchVelocity(
  speed: number,
  direction: 1 | -1,
  c: CombatConfig = DEFAULT_COMBAT_CONFIG,
) {
  const rad = (c.kbAngleDeg * Math.PI) / 180
  return { vx: speed * Math.cos(rad) * direction, vy: -speed * Math.sin(rad) }
}

/** やられ中の長さ（ms） */
export const hitstunMs = (speed: number, c: CombatConfig = DEFAULT_COMBAT_CONFIG) =>
  Math.min(c.hitstunMaxMs, c.hitstunBaseMs + c.hitstunScaleMs * speed)

/**
 * やられ中のステップ数 = ceil(hitstunMs × 60 ÷ 1000)。
 * 1ステップは 1000/60 ms ちょうど（丸めた 16.67 ms では割らない）。1e-9 は、浮動小数点の誤差の吸収
 */
export const hitstunSteps = (speed: number, c: CombatConfig = DEFAULT_COMBAT_CONFIG) =>
  Math.ceil((hitstunMs(speed, c) * 60) / 1000 - 1e-9)
