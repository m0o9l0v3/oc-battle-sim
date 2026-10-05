// ポーズの合成。純粋な関数。仕様: docs/02-fighter/animation.md §4.5
// 層の順序（下から上）: 移動の動き → Attack（affects の分だけ置き換え）→ Hit / KO（すべて置き換え）→ 着地（重ね）
import { clonePose } from './sample.ts'
import {
  PART_KEYS,
  POSE_VALUES,
  type AffectMask,
  type FullPartPose,
  type PartKey,
  type Pose,
} from './types.ts'

/** 置き換え: affects で指定された部位・値だけ、clip の値にする。残りは base のまま */
export function replacePose(base: Pose, clipPose: Pose, affects: AffectMask): Pose {
  const out = clonePose(base)
  for (const part of PART_KEYS) {
    const mask = affects[part]
    if (!mask) continue
    const values = mask === true ? POSE_VALUES : mask
    for (const v of values) (out[part] as FullPartPose)[v] = clipPose[part][v]
  }
  if (affects.face) out.face = clipPose.face
  return out
}

/** 重ね（オーバーレイ）の1部位分。何も変えない値は、sx・sy が 1、dx・dy・rot が 0 */
export type Overlay = Partial<Record<PartKey, Partial<FullPartPose>>>

/** 重ね: 拡大縮小は乗算、位置と角度は加算 */
export function overlayPose(base: Pose, overlay: Overlay): Pose {
  const out = clonePose(base)
  for (const part of PART_KEYS) {
    const o = overlay[part]
    if (!o) continue
    const p = out[part]
    p.dx += o.dx ?? 0
    p.dy += o.dy ?? 0
    p.rot += o.rot ?? 0
    p.sx *= o.sx ?? 1
    p.sy *= o.sy ?? 1
  }
  return out
}
