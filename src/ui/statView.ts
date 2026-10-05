// 能力値の「標準との比較」（stat-system.md §9）。倍率をパーセントに丸めて表示する。
import { damageDealt, launchSpeed } from '../combat/index.ts'
import type { Stats } from '../model/index.ts'
import { jumpHeightOf, moveSpeedOf } from '../physics/index.ts'

const STANDARD = 5

/** 標準（5）を 100 %とした、その能力値の効果（整数に丸める）。画面に出すときだけ丸める */
export function statPercent(key: keyof Stats, value: number): number {
  const ratio = {
    attackPower: () => damageDealt(value) / damageDealt(STANDARD),
    // 吹き飛ばされる量。高いほど小さい（受けるダメージは変えない）
    defense: () => launchSpeed(0, value) / launchSpeed(0, STANDARD),
    jumpPower: () => jumpHeightOf(value) / jumpHeightOf(STANDARD),
    speed: () => moveSpeedOf(value) / moveSpeedOf(STANDARD),
  }[key]()
  return Math.round(ratio * 100)
}
