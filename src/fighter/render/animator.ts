// ファイター1体のアニメーションの状態と、1ステップの更新。純粋な関数（状態は引数と戻り値）。
// 仕様: docs/02-fighter/animation.md §6〜§7。時間は、ゲームのステップで進める（壁の時計は使わない）。
import { BASE_SPEED } from '../../physics/constants.ts'
import { ANIM, buildAttackClip, buildHitClip, KO, LOCOMOTION_CLIPS, STEP_MS } from './clips.ts'
import { overlayPose, replacePose } from './pose.ts'
import { clonePose, EASES, lerpPose, NEUTRAL_POSE, normalizeRootRot, sampleClip } from './sample.ts'
import { runPlaybackRate, selectLocomotion, selectOverlay, startsLanding } from './select.ts'
import type {
  AttackFrames,
  Clip,
  FighterSnapshot,
  LocomotionState,
  OverlayState,
  Pose,
} from './types.ts'

export type AnimatorState = {
  loco: LocomotionState
  /** 移動の動きの時刻（ms。再生倍率を掛けて進める） */
  locoT: number
  overlay: OverlayState | null
  /** Hit の再生。やられ中に入ったときに始まる */
  hit: { t: number; clip: Clip; hitstunSeen: number } | null
  /** KO の再生の時刻（ms） */
  koT: number
  /** 着地のオーバーレイの時刻（ms）。出ていないときは null */
  landingT: number | null
  /** 状態が切り替わったときの、つなぎ（補間） */
  blend: { from: Pose; t: number; duration: number } | null
  /** つなぎまでを含めた、重ねる前のポーズ（次のつなぎの出発点） */
  core: Pose
  /** このステップの、最終のポーズ（着地の重ねまで含む） */
  pose: Pose
  /** 1つ前のステップの、最終のポーズ（描画の補間用） */
  prevPose: Pose
}

export function createAnimatorState(): AnimatorState {
  return {
    loco: 'idle',
    locoT: 0,
    overlay: null,
    hit: null,
    koT: 0,
    landingT: null,
    blend: null,
    core: clonePose(NEUTRAL_POSE),
    pose: clonePose(NEUTRAL_POSE),
    prevPose: clonePose(NEUTRAL_POSE),
  }
}

/** アニメーションに渡す、固定の設定。攻撃のフレームは、起動時に検証済みのクリップを作る */
export type AnimatorConfig = {
  attackClip: Clip
  attackFrames: AttackFrames
}

export function createAnimatorConfig(attackFrames: AttackFrames): AnimatorConfig {
  // 式を満たさない攻撃のフレームは、ここで拒否する（animation.md §5.5、§8）
  return { attackClip: buildAttackClip(attackFrames), attackFrames }
}

/** つなぎの時間（ms）。animation.md §6.4 */
function blendMs(
  prevOverlay: OverlayState | null,
  next: OverlayState | null,
  locoChanged: boolean,
): number {
  if (next !== prevOverlay) {
    if (next === 'ko') return ANIM.blend.koIn
    if (next === 'hit') return ANIM.blend.hitIn
    if (prevOverlay === 'hit' || prevOverlay === 'ko') return ANIM.blend.back
    return ANIM.blend.attack
  }
  return locoChanged ? ANIM.blend.loco : 0
}

/** ファイター1体を、1ステップ進める */
export function stepAnimator(
  prev: AnimatorState,
  snap: FighterSnapshot,
  cfg: AnimatorConfig,
): AnimatorState {
  const loco = selectLocomotion(snap)
  const locoChanged = loco !== prev.loco
  // ヒットストップ中は、見た目の時間も止める（物理・タイマーと同じ）
  const dt = snap.frozen ? 0 : STEP_MS

  // --- Hit の再生（やられ中に入ったとき、また、続けて受けたときに、最初から） ---
  let hit = prev.hit
  if (snap.hitstunRemaining > 0) {
    hit =
      !hit || snap.hitstunRemaining > hit.hitstunSeen
        ? {
            t: 0,
            clip: buildHitClip(snap.hitstunRemaining),
            hitstunSeen: snap.hitstunRemaining,
          }
        : { ...hit, t: hit.t + dt, hitstunSeen: snap.hitstunRemaining }
  } else if (hit) {
    // やられ中が終わっても、最短の長さ（200 ms）までは、Hit のまま（ちらつきの防止）
    const t = hit.t + dt
    hit = t >= hit.clip.duration ? null : { ...hit, t, hitstunSeen: 0 }
  }

  // --- 選択B（重ねる動き）。やられ中が終わったあとの、最短の保持も含める ---
  let overlay = selectOverlay(snap)
  if (overlay !== 'ko' && hit) overlay = 'hit'

  // --- 時刻を進める ---
  const locoT = locoChanged
    ? 0
    : prev.locoT + dt * (loco === 'run' ? runPlaybackRate(snap.vx, BASE_SPEED) : 1)
  const koT = overlay === 'ko' ? (prev.overlay === 'ko' ? prev.koT + dt : 0) : 0

  // --- 下の層 → 上の層 ---
  let target = sampleClip(LOCOMOTION_CLIPS[loco], locoT)
  if (overlay === 'attack') {
    const t = snap.attackProgress * cfg.attackClip.duration
    target = replacePose(target, sampleClip(cfg.attackClip, t), cfg.attackClip.affects)
  } else if (overlay === 'hit' && hit) {
    target = replacePose(target, sampleClip(hit.clip, hit.t), hit.clip.affects)
  } else if (overlay === 'ko') {
    target = replacePose(target, sampleClip(KO, koT), KO.affects)
  }

  // --- つなぎ（切り替わったステップから、前のポーズと補間する。face は即時に新しい値） ---
  let blend = prev.blend
  const overlayChanged = overlay !== prev.overlay
  if (overlayChanged || locoChanged) {
    const duration = blendMs(prev.overlay, overlay, locoChanged)
    blend = duration > 0 ? { from: normalizeRootRot(prev.core), t: 0, duration } : null
  }
  let core = target
  if (blend) {
    const t = blend.t + STEP_MS
    if (t >= blend.duration) {
      blend = null
    } else {
      blend = { ...blend, t }
      core = lerpPose(blend.from, target, t / blend.duration)
    }
  }

  // --- 着地（重ねる。乗算・加算） ---
  let landingT = prev.landingT === null ? null : prev.landingT + dt
  if (startsLanding(snap)) landingT = 0
  if (landingT !== null && landingT >= ANIM.landing.durationMs) landingT = null
  let pose = core
  if (landingT !== null) {
    const e = EASES.easeOut(landingT / ANIM.landing.durationMs)
    pose = overlayPose(core, {
      root: {
        sx: ANIM.landing.sx + (1 - ANIM.landing.sx) * e,
        sy: ANIM.landing.sy + (1 - ANIM.landing.sy) * e,
      },
    })
  }

  return { loco, locoT, overlay, hit, koT, landingT, blend, core, pose, prevPose: prev.pose }
}
