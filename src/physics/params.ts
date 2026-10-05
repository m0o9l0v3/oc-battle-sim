// 能力値 → 物理パラメータの変換。docs/02-fighter/stat-system.md §6.2
import type { Stats } from '../model/index.ts'
import { BASE_JUMP_HEIGHT, BASE_SPEED, GRAVITY, K_JUMP, K_SPEED } from './constants.ts'

export type FighterParams = {
  /** 横方向の移動速度（セル/秒）。speed だけで決まる */
  moveSpeed: number
  /** ジャンプの高さ（セル）。jumpPower だけで決まる */
  jumpHeight: number
  /** ジャンプの初速（セル/秒。大きさ）。√(2 × 重力 × 高さ) */
  jumpVelocity: number
}

export type PhysicsCoefficients = { kSpeed: number; kJump: number }

export const DEFAULT_COEFFICIENTS: PhysicsCoefficients = {
  kSpeed: K_SPEED,
  kJump: K_JUMP,
}

/** 倍率。標準（5）を 1.0 とする */
const factor = (v: number, k: number) => 1 + k * (v - 5)

export const moveSpeedOf = (speed: number, k = DEFAULT_COEFFICIENTS.kSpeed) =>
  BASE_SPEED * factor(speed, k)

export const jumpHeightOf = (jumpPower: number, k = DEFAULT_COEFFICIENTS.kJump) =>
  BASE_JUMP_HEIGHT * factor(jumpPower, k)

export const jumpVelocityOf = (jumpHeight: number) => Math.sqrt(2 * GRAVITY * jumpHeight)

/** 式の結果は丸めず、そのまま物理に使う（画面に出すときだけ丸める） */
export function fighterParams(
  stats: Pick<Stats, 'speed' | 'jumpPower'>,
  coeffs: PhysicsCoefficients = DEFAULT_COEFFICIENTS,
): FighterParams {
  const jumpHeight = jumpHeightOf(stats.jumpPower, coeffs.kJump)
  return {
    moveSpeed: moveSpeedOf(stats.speed, coeffs.kSpeed),
    jumpHeight,
    jumpVelocity: jumpVelocityOf(jumpHeight),
  }
}
