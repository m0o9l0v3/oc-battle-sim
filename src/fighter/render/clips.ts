// 7つのクリップ（動きの定義）。全員共通。数値は暫定（docs/02-fighter/animation.md §5）。
// 数値は、このファイルだけに書く（調整は、ここの書き換えで済ませる）。
import { STEP_HZ } from '../../physics/constants.ts'
import type { AttackFrames, Clip, PartPose } from './types.ts'
import { PART_KEYS, POSE_VALUES } from './types.ts'

/** 1ステップの長さ（ミリ秒）。アニメーションの時間は、ゲームのステップで進める（animation.md §7） */
export const STEP_MS = 1000 / STEP_HZ

/** 繰り返さないクリップの、最後のポーズの保持など、仕様の定数 */
export const ANIM = {
  /** Run の再生倍率の範囲（animation.md §5.2） */
  runRate: { min: 0.6, max: 1.6 },
  /** A3: |vx| がこれを超えたら、入力がなくても Run（セル/秒） */
  runVxThreshold: 0.2,
  /** Hit の最短の長さ（ms） */
  hitMinMs: 200,
  /** 着地のオーバーレイ（animation.md §5.8） */
  landing: { minImpactSpeed: 6, durationMs: 80, sx: 1.08, sy: 0.9 },
  /** つなぎの時間（ms。animation.md §6.4） */
  blend: { loco: 60, attack: 30, hitIn: 20, koIn: 0, back: 60 },
} as const

const arm = (f: number, b: number): { armF: PartPose; armB: PartPose } => ({
  armF: { rot: f },
  armB: { rot: b },
})

export const IDLE: Clip = {
  state: 'idle',
  loop: true,
  duration: 1200,
  affects: { root: true, torso: true, head: true, armF: true, armB: true, legF: true, legB: true },
  keyframes: [
    {
      t: 0,
      pose: { root: { sy: 1 }, torso: { rot: 0 }, head: { dy: 0 }, ...arm(4, -4) },
    },
    {
      t: 600,
      ease: 'easeInOut',
      pose: { root: { sy: 1.02 }, torso: { rot: 1 }, head: { dy: 1 }, ...arm(7, -7) },
    },
    {
      t: 1200,
      ease: 'easeInOut',
      pose: { root: { sy: 1 }, torso: { rot: 0 }, head: { dy: 0 }, ...arm(4, -4) },
    },
  ],
}

const RUN_TORSO = { rot: 8 }
const RUN_HEAD = { rot: -4 }
export const RUN: Clip = {
  state: 'run',
  loop: true,
  duration: 600,
  affects: { root: true, torso: true, head: true, armF: true, armB: true, legF: true, legB: true },
  keyframes: [
    {
      t: 0,
      pose: {
        root: { dy: 0 },
        torso: RUN_TORSO,
        head: RUN_HEAD,
        ...arm(-40, 40),
        legF: { rot: 40 },
        legB: { rot: -40 },
      },
    },
    { t: 150, pose: { root: { dy: 3 }, ...arm(0, 0), legF: { rot: 0 }, legB: { rot: 20 } } },
    { t: 300, pose: { root: { dy: 0 }, ...arm(40, -40), legF: { rot: -40 }, legB: { rot: 40 } } },
    { t: 450, pose: { root: { dy: 3 }, ...arm(0, 0), legF: { rot: 20 }, legB: { rot: 0 } } },
    { t: 600, pose: { root: { dy: 0 }, ...arm(-40, 40), legF: { rot: 40 }, legB: { rot: -40 } } },
  ],
}

// 地面を離れてから始まる（溜めは入れない。animation.md §5.3）。位置の上昇は物理が行うので、root.dy は動かさない
export const JUMP: Clip = {
  state: 'jump',
  loop: false,
  duration: 160,
  affects: { root: true, torso: true, head: true, armF: true, armB: true, legF: true, legB: true },
  keyframes: [
    {
      t: 0,
      pose: {
        root: { sx: 1, sy: 1 },
        torso: { rot: 0 },
        ...arm(4, -4),
        legF: { rot: 3 },
        legB: { rot: -3 },
      },
    },
    {
      t: 60,
      ease: 'easeOut',
      pose: {
        root: { sx: 0.95, sy: 1.08 },
        torso: { rot: -3 },
        ...arm(140, 120),
        legF: { rot: 30 },
        legB: { rot: -15 },
      },
    },
    { t: 160, ease: 'easeOut', pose: { root: { sx: 1, sy: 1.03 } } },
  ],
}

export const FALL: Clip = {
  state: 'fall',
  loop: true,
  duration: 500,
  affects: { root: true, torso: true, head: true, armF: true, armB: true, legF: true, legB: true },
  keyframes: [
    {
      t: 0,
      pose: {
        root: { sy: 1.02 },
        torso: { rot: -3 },
        ...arm(150, 135),
        legF: { rot: 20 },
        legB: { rot: -20 },
      },
    },
    {
      t: 250,
      ease: 'easeInOut',
      pose: {
        root: { sy: 1.04 },
        torso: { rot: -3 },
        ...arm(165, 150),
        legF: { rot: 28 },
        legB: { rot: -26 },
      },
    },
    {
      t: 500,
      ease: 'easeInOut',
      pose: {
        root: { sy: 1.02 },
        torso: { rot: -3 },
        ...arm(150, 135),
        legF: { rot: 20 },
        legB: { rot: -20 },
      },
    },
  ],
}

export const KO: Clip = {
  state: 'ko',
  loop: false,
  duration: 900,
  affects: {
    root: true,
    torso: true,
    head: true,
    armF: true,
    armB: true,
    legF: true,
    legB: true,
    face: true,
  },
  keyframes: [
    {
      t: 0,
      pose: {
        root: { rot: 0, sx: 1, sy: 1 },
        torso: { rot: -15 },
        ...arm(60, 60),
        legF: { rot: 40 },
        legB: { rot: -30 },
        face: 'ko',
      },
    },
    { t: 900, pose: { root: { rot: 720, sx: 0.6, sy: 0.6 } } },
  ],
}

/** 攻撃のフレームの最小値（combat-system.md §6.1。animation.md §5.5 の時刻の式が成り立つ条件） */
export const MIN_ATTACK_FRAMES: Readonly<AttackFrames> = { startup: 2, active: 1, recovery: 2 }

export const isValidAttackFrames = (f: AttackFrames) =>
  Number.isInteger(f.startup) &&
  Number.isInteger(f.active) &&
  Number.isInteger(f.recovery) &&
  f.startup >= MIN_ATTACK_FRAMES.startup &&
  f.active >= MIN_ATTACK_FRAMES.active &&
  f.recovery >= MIN_ATTACK_FRAMES.recovery

/** Attack の、キーフレームの時刻（ステップ）。animation.md §5.5 の式 */
export function attackKeySteps(f: AttackFrames) {
  const { startup: s, active: a, recovery: r } = f
  return {
    k0: 0,
    k1: Math.max(1, s - 2),
    k2: s + 1,
    k3: a >= 2 ? s + a : s + 2,
    k4: s + a + r,
  }
}

/** 攻撃のフレームから、Attack のクリップを作る。式を満たさないフレームは拒否する */
export function buildAttackClip(frames: AttackFrames): Clip {
  if (!isValidAttackFrames(frames)) {
    throw new RangeError(`attack frames out of range: ${JSON.stringify(frames)}`)
  }
  const k = attackKeySteps(frames)
  const ms = (n: number) => n * STEP_MS
  const strike = {
    root: { dx: 5 },
    torso: { rot: 14 },
    head: { rot: 4 },
    ...arm(95, -25),
    face: 'attack' as const,
  }
  return {
    state: 'attack',
    loop: false,
    duration: ms(k.k4),
    affects: { root: ['dx'], torso: true, head: true, armF: true, armB: true, face: true },
    keyframes: [
      {
        t: ms(k.k0),
        pose: {
          root: { dx: 0 },
          torso: { rot: 0 },
          head: { rot: 0 },
          ...arm(4, -4),
          face: 'normal',
        },
      },
      {
        t: ms(k.k1),
        ease: 'easeInOut',
        pose: {
          root: { dx: -2 },
          torso: { rot: -10 },
          head: { rot: -4 },
          ...arm(-70, 20),
          face: 'attack',
        },
      },
      { t: ms(k.k2), ease: 'linear', pose: strike },
      { t: ms(k.k3), ease: 'linear', pose: strike },
      {
        t: ms(k.k4),
        ease: 'easeOut',
        pose: {
          root: { dx: 0 },
          torso: { rot: 0 },
          head: { rot: 0 },
          ...arm(4, -4),
          face: 'normal',
        },
      },
    ],
  }
}

/** Hit の長さ（ms）。やられ中の長さに合わせ、最短 200 ms（animation.md §5.6、§6.4） */
export const hitDuration = (hitstunMs: number) => Math.max(ANIM.hitMinMs, hitstunMs)

/** やられ中の長さに合わせた Hit のクリップ。中間を保つ時間だけを伸ばす */
export function buildHitClip(hitstunMs: number): Clip {
  const d = hitDuration(hitstunMs)
  const recoil = {
    root: { dx: 0, sx: 0.94, sy: 1.05 },
    torso: { rot: -10 },
    head: { rot: -12 },
    ...arm(-35, -25),
    legF: { rot: 18 },
    legB: { rot: -12 },
    face: 'hit' as const,
  }
  return {
    state: 'hit',
    loop: false,
    duration: d,
    affects: {
      root: true,
      torso: true,
      head: true,
      armF: true,
      armB: true,
      legF: true,
      legB: true,
      face: true,
    },
    keyframes: [
      {
        t: 0,
        pose: {
          root: { dx: 0, sx: 1, sy: 1 },
          torso: { rot: 0 },
          head: { rot: 0 },
          ...arm(4, -4),
          legF: { rot: 3 },
          legB: { rot: -3 },
          face: 'hit',
        },
      },
      { t: 60, ease: 'easeOut', pose: recoil },
      { t: d - 100, ease: 'easeOut', pose: recoil },
      {
        t: d,
        ease: 'easeOut',
        pose: {
          root: { dx: 0, sx: 1, sy: 1 },
          torso: { rot: 0 },
          head: { rot: 0 },
          ...arm(4, -4),
          legF: { rot: 3 },
          legB: { rot: -3 },
          face: 'normal',
        },
      },
    ],
  }
}

export const LOCOMOTION_CLIPS = { idle: IDLE, run: RUN, jump: JUMP, fall: FALL } as const

/** 固定のクリップ（Attack と Hit は、長さが状況で決まるので、作って使う） */
export const FIXED_CLIPS: readonly Clip[] = [IDLE, RUN, JUMP, FALL, KO]

/**
 * クリップのデータの検証（animation.md §8）。問題の説明を返す（空なら問題なし）。
 * キーフレームの時刻が厳密に増えること、先頭が 0・末尾が duration、affects の名前が正しいこと
 */
export function validateClip(clip: Clip): string[] {
  const errors: string[] = []
  const name = clip.state
  const ks = clip.keyframes
  if (!(clip.duration > 0)) errors.push(`${name}: duration must be positive`)
  if (ks.length < 2) errors.push(`${name}: need at least 2 keyframes`)
  if (ks[0] && ks[0].t !== 0) errors.push(`${name}: first keyframe must be at t=0`)
  const lastK = ks[ks.length - 1]
  if (lastK && lastK.t !== clip.duration) errors.push(`${name}: last keyframe must be at duration`)
  for (let i = 1; i < ks.length; i++) {
    if (!(ks[i]!.t > ks[i - 1]!.t))
      errors.push(`${name}: keyframe times must strictly increase (#${i})`)
  }
  const parts: readonly string[] = PART_KEYS
  const values: readonly string[] = POSE_VALUES
  for (const [key, mask] of Object.entries(clip.affects)) {
    if (key === 'face') {
      if (mask !== true) errors.push(`${name}: affects.face must be true`)
      continue
    }
    if (!parts.includes(key)) {
      errors.push(`${name}: unknown part in affects: ${key}`)
      continue
    }
    if (mask === true) continue
    if (!Array.isArray(mask)) {
      errors.push(`${name}: affects.${key} must be true or a list`)
      continue
    }
    for (const v of mask)
      if (!values.includes(v)) errors.push(`${name}: unknown value in affects.${key}: ${v}`)
  }
  return errors
}
