// 「すうじと うごき」（battle-report.md §4.2）。能力値だけから、計算で決まる値（確定）。
// 試合の運・相手・操作に左右されない。数字を変えると、必ず、この値が変わる。保存せず、画面で計算する。
import {
  DEFAULT_COMBAT_CONFIG,
  damageDealt,
  launchSpeed,
  launchVelocity,
  type CombatConfig,
} from '../combat/index.ts'
import type { Stats } from '../model/index.ts'
import { DT, GRAVITY, jumpHeightOf, moveSpeedOf } from '../physics/index.ts'

/** 「ふっとぶ きょり」を出すときの、蓄積ダメージ（%）。設定で変えられる（battle-report.md §4.2） */
export const REPORT_REFERENCE_DAMAGE = 60

/**
 * 吹き飛ぶ速さから、水平に飛ぶ距離（セル）。固定ステップの計算（knockback.md §6、§7）:
 * 発射した高さから、同じ高さまで戻った最初のステップの、水平の位置。連続の式より、わずかに小さい
 */
export function launchDistance(speed: number, c: CombatConfig = DEFAULT_COMBAT_CONFIG): number {
  const { vx, vy: vy0 } = launchVelocity(speed, 1, c)
  let x = 0
  let y = 0
  let vy = vy0
  // 上へ飛び、重力で戻る。戻らない（速さが 0 以下）なら、すぐ終わる
  for (let i = 0; i < 100000; i++) {
    vy += GRAVITY * DT
    y += vy * DT
    x += vx * DT
    if (y >= 0) break
  }
  return x
}

export type ConfirmedMotion = {
  /** 1かいの ダメージ（%）。attackPower だけで決まる */
  damagePerHit: number
  /** ダメージが基準（60 %）たまったときに、ふっとぶ きょり（セル）。defense だけで決まる */
  knockbackDistance: number
  /** ジャンプの たかさ（セル）。jumpPower だけで決まる */
  jumpHeight: number
  /** いどうの はやさ（セル/秒）。speed だけで決まる */
  moveSpeed: number
}

export function confirmedMotion(
  stats: Stats,
  referenceDamage = REPORT_REFERENCE_DAMAGE,
  c: CombatConfig = DEFAULT_COMBAT_CONFIG,
): ConfirmedMotion {
  return {
    damagePerHit: damageDealt(stats.attackPower, c),
    knockbackDistance: launchDistance(launchSpeed(referenceDamage, stats.defense, c), c),
    jumpHeight: jumpHeightOf(stats.jumpPower),
    moveSpeed: moveSpeedOf(stats.speed),
  }
}
