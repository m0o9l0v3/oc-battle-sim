// アニメーションの型。仕様: docs/02-fighter/animation.md §4.2〜§4.5、§6.1
// 単位は、長さ = 身長 H の百分率（%H）、角度 = 度（0° は真下。正は前方）。向きは右向きで定義する。

/** 動かす部位。root はファイター全体 */
export const PART_KEYS = ['root', 'torso', 'head', 'armF', 'armB', 'legF', 'legB'] as const
export type PartKey = (typeof PART_KEYS)[number]

/** 部位ごとの値の名前。affects に書けるのは、これだけ（animation.md §4.5） */
export const POSE_VALUES = ['dx', 'dy', 'rot', 'sx', 'sy'] as const
export type PoseValue = (typeof POSE_VALUES)[number]

export type PartPose = { dx?: number; dy?: number; rot?: number; sx?: number; sy?: number }
/** すべての値が決まっている部位のポーズ */
export type FullPartPose = Required<PartPose>

export type FaceState = 'normal' | 'attack' | 'hit' | 'ko'

/** クリップの1か所に書くポーズ。書かない部分は、前のキーフレームを引き継ぐ */
export type PartialPose = Partial<Record<PartKey, PartPose>> & { face?: FaceState }

/** すべての部位・値が決まったポーズ（描画に渡すもの） */
export type Pose = Record<PartKey, FullPartPose> & { face: FaceState }

export type Ease = 'linear' | 'easeOut' | 'easeInOut'

export type Keyframe = {
  /** ミリ秒（クリップの先頭から） */
  t: number
  pose: PartialPose
  /** 直前のキーフレームから、このキーフレームへの補間 */
  ease?: Ease
}

/**
 * そのクリップが動かす部位と値。true は、その部位のすべての値。配列は、指定した値だけ。
 * face は true のみ（animation.md §4.3）
 */
export type AffectMask = {
  [K in PartKey]?: true | PoseValue[]
} & { face?: true }

export type ClipState = 'idle' | 'run' | 'jump' | 'fall' | 'attack' | 'hit' | 'ko'

export type Clip = {
  state: ClipState
  /** true: 繰り返す。false: 最後のポーズで止まる */
  loop: boolean
  /** ミリ秒 */
  duration: number
  affects: AffectMask
  keyframes: Keyframe[]
}

/** 下の層の動き（常に1つ選ぶ。animation.md §6.2 の選択A） */
export type LocomotionState = 'idle' | 'run' | 'jump' | 'fall'
/** 上に重ねる動き（選択B） */
export type OverlayState = 'attack' | 'hit' | 'ko'

/** アニメーションが、1ステップごとに見る、ファイターの状態（animation.md §6.1） */
export type FighterSnapshot = {
  onGround: boolean
  /** 横の速度（セル/秒） */
  vx: number
  /** 縦の速度（セル/秒。正が下） */
  vy: number
  moveInput: -1 | 0 | 1
  attackPhase: null | 'startup' | 'active' | 'recovery'
  /** 攻撃全体の進み（0〜1） */
  attackProgress: number
  /** やられ中の残り時間（ms）。0 ならやられ中でない */
  hitstunRemaining: number
  /** 地面に着いたステップだけ、着く直前の下向きの速さ（セル/秒）。それ以外は null */
  landingImpactSpeed: number | null
  /** 撃墜されている */
  ko: boolean
  /** ヒットストップ中（時間が止まる）。見た目の時間を止めるために使う。仕様の外の補助値 */
  frozen: boolean
}

/** 攻撃のフレーム（ステップ）。animation.md §5.5 */
export type AttackFrames = { startup: number; active: number; recovery: number }
