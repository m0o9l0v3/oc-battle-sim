// ファイターの描画。パーツを階層的に重ねて、Canvas 2D に描く。
// 仕様: docs/02-fighter/animation.md、character-design.md §4.2、docs/08-architecture/frontend.md §6.3
//  - 絵（パーツ・関節・重ね順）は assets/fighter、動き（クリップ・状態の選択・合成）は fighter/render。ここは、それを Canvas に描く
//  - 描画は状態を読むだけ。試合の状態（位置・当たり判定）は書き換えない（見た目は当たり判定に影響しない。REQ-FTR-05）
//  - 重ね順と変換の順は、assets/fighter/compose.ts（SVG）と同じ。fighter.test.ts が、2つの結果が一致することを確認する
import {
  ACCESSORIES,
  BODIES,
  EXPRESSIONS,
  FACES,
  FIXED_COLORS,
  OUTLINE_WIDTH,
  paintColor,
  type BodyDef,
  type FighterLook,
  type Part,
  type Shape,
} from '../assets/index.ts'
import { DEFAULT_COMBAT_CONFIG, hitbox, type CombatConfig } from '../combat/index.ts'
import { APPEARANCE_IDS } from '../fighter/index.ts'
import type { Appearance } from '../model/index.ts'
import {
  createAnimatorConfig,
  createAnimatorState,
  snapshotOf,
  stepAnimator,
  type AnimatorConfig,
  type AnimatorState,
  type AttackFrames,
  type PartKey,
  type Pose,
} from '../fighter/render/index.ts'
import type { MatchState } from '../battle/index.ts'
import { BODY_HEIGHT } from '../physics/index.ts'
import type { DrawContext, Renderer } from './types.ts'

/** 身長 100（ファイターの空間）が、体（やられ判定）の高さ 0.8 セルに当たる（character-design.md §7.3） */
export const FIGHTER_UNIT = BODY_HEIGHT / 100

const DEG = Math.PI / 180

/** 標準の見た目（外観の ID が不正なときの代わり。検証済みの設定では起きない） */
export const FALLBACK_LOOK: FighterLook = { body: 'b1', face: 'f1', color: 'c1', accessory: null }

/** CharacterConfig.appearance → 描画用の見た目。未知の ID は、標準の見た目にする（描画で落とさない） */
export function lookFromAppearance(a: Appearance): FighterLook {
  const has = (list: readonly string[], v: string | null) => v !== null && list.includes(v)
  if (
    !has(APPEARANCE_IDS.body, a.body) ||
    !has(APPEARANCE_IDS.face, a.face) ||
    !has(APPEARANCE_IDS.color, a.color) ||
    (a.accessory !== null && !has(APPEARANCE_IDS.accessory, a.accessory))
  ) {
    return FALLBACK_LOOK
  }
  return a as FighterLook
}

// --- パスの準備（形ごとに、最初の1回だけ Path2D を作る） ---

const pathCache = new WeakMap<Shape, Path2D>()
const pathOf = (s: Shape): Path2D => {
  let p = pathCache.get(s)
  if (!p) {
    p = new Path2D(s.d)
    pathCache.set(s, p)
  }
  return p
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, color: FighterLook['color']) {
  const path = pathOf(s)
  if (s.fill !== 'none') {
    ctx.fillStyle = paintColor(s.fill, color)
    ctx.fill(path)
  }
  if (s.stroke) {
    ctx.strokeStyle = paintColor(s.stroke, color)
    ctx.lineWidth = s.sw ?? OUTLINE_WIDTH
    ctx.stroke(path)
  }
}

function drawPart(ctx: CanvasRenderingContext2D, part: Part, color: FighterLook['color']) {
  for (const s of part.shapes) drawShape(ctx, s, color)
}

/** 腕・脚の、奥側の暗さ（陰影を重ねる）。compose.ts の backOverlay と同じ */
function drawBackShade(ctx: CanvasRenderingContext2D, part: Part) {
  ctx.fillStyle = FIXED_COLORS.shade
  for (const s of part.shapes) {
    if (s.fill !== 'shade' && s.fill !== 'light' && s.fill !== 'none') ctx.fill(pathOf(s))
  }
}

/**
 * 部位の変換（関節が原点）。at は、親の座標での関節の位置。
 * 腕・脚（下に垂れる。hangs）は、正が前方へ振る。胴体・頭は、正が前傾（animation.md §4.2）
 */
function applyJoint(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  p: Pose[PartKey],
  hangs: boolean,
) {
  ctx.translate(at.x + p.dx, at.y - p.dy)
  if (p.rot !== 0) ctx.rotate((hangs ? -p.rot : p.rot) * DEG)
  if (p.sx !== 1 || p.sy !== 1) ctx.scale(p.sx, p.sy)
}

/**
 * ファイター1体を、ファイターの空間（身長 100、足元 y = 100、体の中心 x = 0）に描く。
 * 呼び出し側が、ctx をこの空間に合わせておく（drawFighter）
 */
function drawFighterSpace(
  ctx: CanvasRenderingContext2D,
  look: FighterLook,
  pose: Pose,
  facing: 1 | -1,
) {
  const body: BodyDef = BODIES[look.body]
  const c = look.color
  const accessory = look.accessory ? ACCESSORIES[look.accessory] : null
  const anchor = accessory ? body.anchors[accessory.slot] : null
  const slot = accessory?.slot

  const drawAccessory = () => {
    if (!accessory || !anchor) return
    ctx.translate(anchor.x, anchor.y)
    ctx.scale(anchor.s, anchor.s)
    drawPart(ctx, accessory.part, c)
  }
  const toTorso = () => applyJoint(ctx, body.at.torso, pose.torso, false)
  const toHead = () => {
    toTorso()
    applyJoint(ctx, body.at.head, pose.head, false)
  }
  /** 層を1つ描く。変換は、層ごとに親から積み直す（枝をまたいだ重ね順を守るため） */
  const layer = (chain: () => void, draw: () => void) => {
    ctx.save()
    chain()
    draw()
    ctx.restore()
  }

  // ファイター全体（root）: 足元を基準に拡大縮小、体の中心（身長の半分）を中心に回転。
  // 左向きは左右反転。反転の内側で動かすので、前方への移動（dx）・回転も、向きに合わせて反転する
  const r = pose.root
  ctx.translate(0, 100 - r.dy)
  if (facing === -1) ctx.scale(-1, 1)
  ctx.translate(r.dx, 0)
  if (r.rot !== 0) {
    ctx.translate(0, -50)
    ctx.rotate(r.rot * DEG)
    ctx.translate(0, 50)
  }
  if (r.sx !== 1 || r.sy !== 1) ctx.scale(r.sx, r.sy)
  ctx.translate(0, -100)

  // 奥 → 手前（character-design.md §4.2）
  if (slot === 'back') layer(toTorso, drawAccessory)
  layer(
    () => {
      toTorso()
      applyJoint(ctx, body.at.armB, pose.armB, true)
    },
    () => {
      drawPart(ctx, body.arm, c)
      drawBackShade(ctx, body.arm)
    },
  )
  layer(
    () => applyJoint(ctx, body.at.legB, pose.legB, true),
    () => {
      drawPart(ctx, body.leg, c)
      drawBackShade(ctx, body.leg)
    },
  )
  layer(toTorso, () => drawPart(ctx, body.torso, c))
  layer(
    () => applyJoint(ctx, body.at.legF, pose.legF, true),
    () => drawPart(ctx, body.leg, c),
  )
  layer(toHead, () => drawPart(ctx, body.head, c))
  layer(toHead, () => {
    ctx.translate(body.face.x, body.face.y)
    ctx.scale(body.face.s, body.face.s)
    drawPart(ctx, pose.face === 'normal' ? FACES[look.face].part : EXPRESSIONS[pose.face].part, c)
  })
  layer(
    () => {
      toTorso()
      applyJoint(ctx, body.at.armF, pose.armF, true)
    },
    () => drawPart(ctx, body.arm, c),
  )
  if (slot === 'head' || slot === 'face') layer(toHead, drawAccessory)
  if (slot === 'neck') layer(toTorso, drawAccessory)
}

/**
 * ファイター1体を、ステージの座標（セル）の (x, y) に描く。(x, y) は足元の中心（物理の体と同じ）。
 * 大きさは、身長がやられ判定の高さ（0.8 セル）になるように決まる。見た目だけで、当たり判定は変えない
 */
export function drawFighter(
  { ctx, camera }: DrawContext,
  look: FighterLook,
  pose: Pose,
  x: number,
  y: number,
  facing: 1 | -1,
) {
  const k = camera.scale * FIGHTER_UNIT
  if (!(k > 0)) return
  ctx.save()
  ctx.translate(camera.offsetX + x * camera.scale, camera.offsetY + y * camera.scale)
  ctx.scale(k, k)
  ctx.translate(0, -100) // ファイターの空間の足元（y = 100）を、(x, y) に合わせる
  drawFighterSpace(ctx, look, pose, facing)
  ctx.restore()
}

// --- 試合の描画 ---

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** 描画用の、2ステップの間の補間。root の回転は、近い向きに回る（撃墜の +720° から戻るとき、逆回転しない） */
export function interpolatePose(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose
  for (const part of ['root', 'torso', 'head', 'armF', 'armB', 'legF', 'legB'] as const) {
    const pa = a[part]
    const pb = b[part]
    let rot = lerp(pa.rot, pb.rot, k)
    if (part === 'root') {
      const d = ((((pb.rot - pa.rot) % 360) + 540) % 360) - 180
      rot = pa.rot + d * k
    }
    out[part] = {
      dx: lerp(pa.dx, pb.dx, k),
      dy: lerp(pa.dy, pb.dy, k),
      rot,
      sx: lerp(pa.sx, pb.sx, k),
      sy: lerp(pa.sy, pb.sy, k),
    }
  }
  out.face = b.face
  return out
}

/** これより遠い移動（リスポーンなど）は、補間しない（瞬間移動を、すべるように描かない） */
const TELEPORT = 2

/**
 * 攻撃の軌跡。持続（当たり判定が出ている間）だけ、判定の範囲に沿った弧を描く。
 * 腕の先は、体の中心から約 0.45 セルまでしか届かないが、判定は前へ 0.85 セルまで出る。
 * 見た目と判定が、大きくずれて見えないようにする（animation.md §9）。判定は読むだけで、変えない
 */
function drawAttackTrail(
  { ctx, camera }: DrawContext,
  box: { x0: number; x1: number; y0: number; y1: number },
  facing: 1 | -1,
) {
  const px = (x: number) => camera.offsetX + x * camera.scale
  const py = (y: number) => camera.offsetY + y * camera.scale
  const [near, far] = facing > 0 ? [box.x0, box.x1] : [box.x1, box.x0]
  const mid = (box.y0 + box.y1) / 2
  const bulge = (far - near) * 0.12
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(px(near), py(box.y1))
  ctx.quadraticCurveTo(px(far + bulge), py(box.y1), px(far + bulge), py(mid))
  ctx.quadraticCurveTo(px(far + bulge), py(box.y0), px(near), py(box.y0))
  ctx.quadraticCurveTo(px(near + (far - near) * 0.45), py(mid), px(near), py(box.y1))
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.fill()
  ctx.restore()
}

export type FighterRendererOptions = {
  /** 1P・2P の見た目 */
  looks: readonly [FighterLook, FighterLook]
  /** 攻撃のフレーム（Attack の長さ・時刻に使う）。既定は、基本攻撃 */
  attackFrames?: AttackFrames
  combat?: CombatConfig
  /** 攻撃の軌跡を描くか。既定は描く */
  attackTrail?: boolean
}

/**
 * 2体のファイターを描く描画アダプタ。ステージは別（createStageRenderer）。
 * アニメーションは、ステップごとに進む（step を、ステップごとに呼ぶ）。draw は、最新の状態を取りこぼさないよう、
 * 呼ばれていないステップがあれば、自分で step を呼ぶ（その場合、途中のステップの状態は見えない）
 */
export interface FighterRenderer extends Renderer<MatchState> {
  /** 新しいステップの状態を、アニメーションに渡す。同じステップは、2回目以降は何もしない */
  step(state: MatchState): void
  /** 新しい試合の前に呼ぶ（アニメーションの状態を捨てる） */
  reset(): void
}

export function createFighterRenderer(opts: FighterRendererOptions): FighterRenderer {
  const frames: AttackFrames = opts.attackFrames ?? {
    startup: (opts.combat ?? DEFAULT_COMBAT_CONFIG).attackStartup,
    active: (opts.combat ?? DEFAULT_COMBAT_CONFIG).attackActive,
    recovery: (opts.combat ?? DEFAULT_COMBAT_CONFIG).attackRecovery,
  }
  const combat = opts.combat ?? DEFAULT_COMBAT_CONFIG
  const trail = opts.attackTrail ?? true
  const config: AnimatorConfig = createAnimatorConfig(frames)
  let anims: [AnimatorState, AnimatorState] = [createAnimatorState(), createAnimatorState()]
  let lastStep = -1

  const reset = () => {
    anims = [createAnimatorState(), createAnimatorState()]
    lastStep = -1
  }

  const step = (state: MatchState) => {
    if (state.step === lastStep) return
    if (state.step < lastStep) reset() // 新しい試合
    const fighting = state.phase === 'fight'
    anims = [
      stepAnimator(anims[0], snapshotOf(state.fighters[0], frames, fighting), config),
      stepAnimator(anims[1], snapshotOf(state.fighters[1], frames, fighting), config),
    ]
    lastStep = state.step
  }

  return {
    step,
    reset,
    draw(dc, prev, curr, alpha) {
      step(curr)
      const a = Math.min(1, Math.max(0, alpha))
      for (const i of [0, 1] as const) {
        const anim = anims[i]
        const cb = curr.fighters[i].body
        const pb = prev.fighters[i].body
        const near = Math.abs(cb.x - pb.x) < TELEPORT && Math.abs(cb.y - pb.y) < TELEPORT
        const x = near ? lerp(pb.x, cb.x, a) : cb.x
        const y = near ? lerp(pb.y, cb.y, a) : cb.y
        drawFighter(
          dc,
          opts.looks[i],
          interpolatePose(anim.prevPose, anim.pose, a),
          x,
          y,
          curr.fighters[i].facing,
        )
        const box = trail ? hitbox(curr.fighters[i], combat) : null
        if (box) drawAttackTrail(dc, box, curr.fighters[i].combat.attack?.facing ?? 1)
      }
    },
  }
}
