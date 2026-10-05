// クリップの再生と、ポーズの補間。純粋な関数。仕様: docs/02-fighter/animation.md §4.3
import {
  PART_KEYS,
  POSE_VALUES,
  type Clip,
  type Ease,
  type FaceState,
  type FullPartPose,
  type PartialPose,
  type Pose,
} from './types.ts'

/** 基準のポーズ（Neutral）。animation.md §4.4 */
export const NEUTRAL_POSE: Readonly<Pose> = deepFreeze({
  root: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 },
  torso: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 },
  head: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 },
  armF: { dx: 0, dy: 0, rot: 4, sx: 1, sy: 1 },
  armB: { dx: 0, dy: 0, rot: -4, sx: 1, sy: 1 },
  legF: { dx: 0, dy: 0, rot: 3, sx: 1, sy: 1 },
  legB: { dx: 0, dy: 0, rot: -3, sx: 1, sy: 1 },
  face: 'normal',
} satisfies Pose)

function deepFreeze<T extends object>(o: T): Readonly<T> {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v)
  return Object.freeze(o)
}

export const clonePose = (p: Pose): Pose => ({
  root: { ...p.root },
  torso: { ...p.torso },
  head: { ...p.head },
  armF: { ...p.armF },
  armB: { ...p.armB },
  legF: { ...p.legF },
  legB: { ...p.legB },
  face: p.face,
})

export const EASES: Record<Ease, (x: number) => number> = {
  linear: (x) => x,
  easeOut: (x) => 1 - (1 - x) * (1 - x),
  easeInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** 2つのポーズの間を、数値ごとに補間する。face は補間せず、b の値にする（animation.md §4.3） */
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose
  for (const part of PART_KEYS) {
    const pa = a[part]
    const pb = b[part]
    out[part] = {
      dx: lerp(pa.dx, pb.dx, k),
      dy: lerp(pa.dy, pb.dy, k),
      rot: lerp(pa.rot, pb.rot, k),
      sx: lerp(pa.sx, pb.sx, k),
      sy: lerp(pa.sy, pb.sy, k),
    }
  }
  out.face = b.face
  return out
}

/** root の回転を、-180〜180 に直す（撃墜の回転 +720° から戻るとき、逆回転しないため） */
export const normalizeRootRot = (p: Pose): Pose => {
  const r = p.root.rot
  const n = ((((r + 180) % 360) + 360) % 360) - 180
  return n === r ? p : { ...p, root: { ...p.root, rot: n } }
}

type Frame = { t: number; ease: Ease; pose: Pose }

/** キーフレームを、「前を引き継いだ、すべての値が決まったポーズ」にしたもの */
export type CompiledClip = { clip: Clip; frames: Frame[] }

const cache = new WeakMap<Clip, CompiledClip>()

function resolve(prev: Pose, delta: PartialPose): Pose {
  const next = clonePose(prev)
  for (const part of PART_KEYS) {
    const d = delta[part]
    if (!d) continue
    for (const v of POSE_VALUES) {
      const x = d[v]
      if (x !== undefined) (next[part] as FullPartPose)[v] = x
    }
  }
  if (delta.face) next.face = delta.face
  return next
}

export function compileClip(clip: Clip): CompiledClip {
  const hit = cache.get(clip)
  if (hit) return hit
  let prev: Pose = clonePose(NEUTRAL_POSE)
  const frames = clip.keyframes.map((k): Frame => {
    prev = resolve(prev, k.pose)
    return { t: k.t, ease: k.ease ?? 'linear', pose: prev }
  })
  const compiled = { clip, frames }
  cache.set(clip, compiled)
  return compiled
}

/**
 * クリップの、時刻 t（ミリ秒）のポーズ。
 * 繰り返すクリップは t を長さで折り返す。繰り返さないクリップは、最後のポーズで止まる。
 * 数値は ease に従って補間し、face は階段で切り替える（次のキーフレームの時刻に切り替わる）
 */
export function sampleClip(clip: Clip, t: number): Pose {
  const { frames } = compileClip(clip)
  const first = frames[0]
  const last = frames[frames.length - 1]
  if (!first || !last) return clonePose(NEUTRAL_POSE)
  let time = Number.isFinite(t) ? t : 0
  if (clip.loop && clip.duration > 0)
    time = ((time % clip.duration) + clip.duration) % clip.duration
  if (time <= first.t) return clonePose(first.pose)
  if (time >= last.t) return clonePose(last.pose)
  let i = 0
  while (i < frames.length - 2 && time >= frames[i + 1]!.t) i++
  const a = frames[i]!
  const b = frames[i + 1]!
  const k = EASES[b.ease]((time - a.t) / (b.t - a.t))
  const pose = lerpPose(a.pose, b.pose, k)
  pose.face = (time >= b.t ? b : a).pose.face as FaceState
  return pose
}
