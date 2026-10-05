// 状態の選び方。純粋な関数（同じ入力から、同じ状態。乱数・時計なし）。仕様: docs/02-fighter/animation.md §6.2
import { ANIM } from './clips.ts'
import type { FighterSnapshot, LocomotionState, OverlayState } from './types.ts'

/** 選択A: 移動の動き（下の層）。常に1つ選ぶ。上から順に、最初に当てはまるもの */
export function selectLocomotion(s: FighterSnapshot): LocomotionState {
  if (!s.onGround) return s.vy < 0 ? 'jump' : 'fall'
  if (s.moveInput !== 0 || Math.abs(s.vx) > ANIM.runVxThreshold) return 'run'
  return 'idle'
}

/** 選択B: 上に重ねる動き。当てはまらなければ null */
export function selectOverlay(s: FighterSnapshot): OverlayState | null {
  if (s.ko) return 'ko'
  if (s.hitstunRemaining > 0) return 'hit'
  if (s.attackPhase !== null) return 'attack'
  return null
}

/** Run の再生倍率。実際の移動速度 ÷ 標準の移動速度（animation.md §5.2） */
export const runPlaybackRate = (vx: number, baseSpeed: number) =>
  Math.min(ANIM.runRate.max, Math.max(ANIM.runRate.min, Math.abs(vx) / baseSpeed))

/** 着地のオーバーレイを始めるか（animation.md §6.1） */
export const startsLanding = (s: FighterSnapshot) =>
  s.landingImpactSpeed !== null && s.landingImpactSpeed >= ANIM.landing.minImpactSpeed
