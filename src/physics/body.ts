// ファイターの動き。1ステップ（1/60 秒）の更新。純関数。
// 縦は下が正（上向きの速さは負）。物理は半陰的オイラー法（knockback.md §6）:
//   vy ← vy + 重力 × dt、そのあと x ← x + vx × dt、y ← y + vy × dt
import {
  AIR_ACCEL,
  AIR_DRAG,
  AIR_JUMPS,
  DT,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_FRICTION,
  MAX_FALL_SPEED,
  MAX_SUBSTEP,
} from './constants.ts'
import { EPS, overlapsSolid, type SolidGrid } from './grid.ts'
import type { FighterParams } from './params.ts'

/** 体（やられ判定）の大きさ。全員同じ（combat-system.md §5.1）。位置は足元の中心 */
export const BODY_WIDTH = 0.5
export const BODY_HEIGHT = 0.8

export type Body = {
  /** 足元の中心 */
  x: number
  y: number
  vx: number
  /** 縦の速さ（セル/秒）。正が下 */
  vy: number
  onGround: boolean
  /** 残っている空中ジャンプの回数 */
  airJumpsLeft: number
}

export type MoveInput = {
  /** 左右の操作（core の stepControl の結果） */
  move: -1 | 0 | 1
  /** ジャンプを実行する（core の stepControl の結果） */
  jump: boolean
  /** 操作できるか。やられ中は false（左右の入力も、ジャンプも効かない） */
  controllable: boolean
  /** 横の移動速度の倍率。地上で攻撃中は 0.4（combat-system.md §6.4）。既定 1 */
  speedScale?: number
}

export type StepResult = {
  body: Body
  /** 地面に着いたステップだけ、着く直前の下向きの速さ（セル/秒）。それ以外は null（animation.md §6.1） */
  landingImpactSpeed: number | null
  /** このステップで、ジャンプ（地上・空中）をした */
  jumped: boolean
}

export const createBody = (x: number, y: number): Body => ({
  x,
  y,
  vx: 0,
  vy: 0,
  onGround: false,
  airJumpsLeft: AIR_JUMPS,
})

/** ジャンプできるか（地上、または、空中ジャンプが残っている）。操作できるときだけ */
export const canJump = (body: Body, controllable = true) =>
  controllable && (body.onGround || body.airJumpsLeft > 0)

/** 吹き飛ばす。速度を置き換える。空中ジャンプの回数は戻さない（recovery.md §3.1） */
export function launch(body: Body, vx: number, vy: number): Body {
  return { ...body, vx, vy, onGround: false }
}

const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target)

/** 横の速さの更新（recovery.md §3.2、knockback.md §6） */
function nextVx(body: Body, p: FighterParams, input: MoveInput): number {
  const { vx, onGround } = body
  if (!input.controllable) {
    // やられ中: 空中は重力だけ（水平の速さはそのまま）。地面は摩擦で減る
    return onGround ? approach(vx, 0, GROUND_FRICTION * DT) : vx
  }
  const target = input.move * p.moveSpeed * (input.speedScale ?? 1)
  if (onGround) {
    return input.move !== 0
      ? approach(vx, target, GROUND_ACCEL * DT)
      : approach(vx, 0, GROUND_FRICTION * DT)
  }
  return input.move !== 0 ? approach(vx, target, AIR_ACCEL * DT) : approach(vx, 0, AIR_DRAG * DT)
}

/**
 * 横に動かす。壁に当たったら、その手前で止まる（跳ね返らない）。
 * 長い移動は、MAX_SUBSTEP ごとに分けて判定する（薄いブロックのすり抜けを防ぐ）
 */
function moveX(grid: SolidGrid, x: number, y: number, dx: number) {
  const h = BODY_WIDTH / 2
  let hit = false
  const n = Math.max(1, Math.ceil(Math.abs(dx) / MAX_SUBSTEP))
  const d = dx / n
  for (let i = 0; i < n; i++) {
    const nx = x + d
    if (overlapsSolid(grid, nx - h, nx + h, y - BODY_HEIGHT, y)) {
      // 当たったブロックの面にそろえる（体の端を、境界に接する位置へ）
      if (d > 0) x = Math.floor(nx + h - EPS) - h
      else x = Math.ceil(nx - h + EPS) + h
      hit = true
      break
    }
    x = nx
  }
  return { x, hit }
}

function moveY(grid: SolidGrid, x: number, y: number, dy: number) {
  const h = BODY_WIDTH / 2
  let hit = false
  const n = Math.max(1, Math.ceil(Math.abs(dy) / MAX_SUBSTEP))
  const d = dy / n
  for (let i = 0; i < n; i++) {
    const ny = y + d
    if (overlapsSolid(grid, x - h, x + h, ny - BODY_HEIGHT, ny)) {
      if (d > 0)
        y = Math.floor(ny - EPS) // 足元を、ブロックの上面にそろえる
      else y = Math.ceil(ny - BODY_HEIGHT + EPS) + BODY_HEIGHT // 頭を、天井の下面にそろえる
      hit = true
      break
    }
    y = ny
  }
  return { y, hit }
}

/** ファイターを1ステップ進める */
export function stepBody(
  body: Body,
  p: FighterParams,
  input: MoveInput,
  grid: SolidGrid,
): StepResult {
  let { vy, airJumpsLeft } = body
  let jumped = false

  // ジャンプ（地上は何度でも。空中は回数が残っているとき）。上向きの初速を与える
  if (input.jump && canJump(body, input.controllable)) {
    if (!body.onGround) airJumpsLeft -= 1
    vy = -p.jumpVelocity
    jumped = true
  }

  const vx = nextVx(body, p, input)

  // 半陰的オイラー法: 先に速度を更新し、更新した速度で位置を進める
  vy = Math.min(vy + GRAVITY * DT, MAX_FALL_SPEED)

  const mx = moveX(grid, body.x, body.y, vx * DT)
  const my = moveY(grid, mx.x, body.y, vy * DT)

  const nvx = mx.hit ? 0 : vx
  let nvy = vy
  let onGround = false
  let landingImpactSpeed: number | null = null
  if (my.hit) {
    if (vy > 0) {
      // 下向きに進んで当たった = 着地（足場の上に立つ）
      onGround = true
      if (!body.onGround) landingImpactSpeed = vy
      airJumpsLeft = AIR_JUMPS // 地面に着いたら、空中ジャンプが戻る
    }
    nvy = 0 // 天井・床に当たったら、縦の速さを 0 にする
  }

  return {
    body: { x: mx.x, y: my.y, vx: nvx, vy: nvy, onGround, airJumpsLeft },
    landingImpactSpeed,
    jumped,
  }
}
