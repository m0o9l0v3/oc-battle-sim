// 戦闘の数値。docs/03-combat/combat-system.md §9、damage.md、knockback.md
// すべてここにまとめる（調整のために、コードを変えない。調整は #25）

export type CombatConfig = {
  // ダメージ（damage.md §3〜§4）
  baseDamage: number // %。attackPower 5 のとき
  kAttack: number
  damageMax: number // %
  // 吹き飛ばし（knockback.md §3〜§5）
  kbBase: number // セル/秒。蓄積 0 % のとき
  kbScale: number // セル/秒/%
  kDefense: number
  kbAngleDeg: number // 水平から上向き
  hitstunBaseMs: number
  hitstunScaleMs: number // ms/（セル/秒）
  hitstunMaxMs: number
  // 攻撃（combat-system.md §6）
  attackStartup: number // ステップ
  attackActive: number
  attackRecovery: number
  hitboxWidth: number // セル。体の前の端から前へ
  hitboxBottom: number // 足元からの高さ（下端）
  hitboxTop: number // 同（上端）
  groundAttackSpeedScale: number // 地上で攻撃中の、横の移動速度の倍率
  // ヒットしたときの処理（§7）
  hitstopSteps: number
  recoveryInvulnSteps: number // やられ中が終わったあとの無敵
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  baseDamage: 12,
  kAttack: 0.03, // 調整後（#25。0.10 だと、攻撃と防御を高めた配分が勝ち続けたため）
  damageMax: 999,
  kbBase: 8,
  kbScale: 0.15,
  kDefense: 0.03, // 同上
  kbAngleDeg: 65,
  hitstunBaseMs: 150,
  hitstunScaleMs: 25,
  hitstunMaxMs: 1200,
  attackStartup: 6,
  attackActive: 4,
  attackRecovery: 14,
  hitboxWidth: 0.6,
  hitboxBottom: 0.3,
  hitboxTop: 0.7,
  groundAttackSpeedScale: 0.4,
  hitstopSteps: 3,
  recoveryInvulnSteps: 12,
}

/** 攻撃のフレームの最小値（combat-system.md §6.1）。調整のときも守る */
export const MIN_ATTACK_FRAMES = { startup: 2, active: 1, recovery: 2 } as const

export function validateCombatConfig(c: CombatConfig): string[] {
  const errors: string[] = []
  if (c.attackStartup < MIN_ATTACK_FRAMES.startup) errors.push('attackStartup')
  if (c.attackActive < MIN_ATTACK_FRAMES.active) errors.push('attackActive')
  if (c.attackRecovery < MIN_ATTACK_FRAMES.recovery) errors.push('attackRecovery')
  return errors
}
