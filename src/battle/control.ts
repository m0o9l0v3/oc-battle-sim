// 生の入力（PlayerInput）から、そのステップの「操作」を決める。
// 左右同時押しの打ち消し、向き、先行入力。仕様: docs/06-ui/pc-ui.md §5.1〜§5.4
// どの入力ソースでも同じ規則が働くよう、core で行う。純関数（状態は引数と戻り値）。

import type { PlayerInput } from './input.ts'

/** 先行入力の長さ（ステップ）。約67 ms（pc-ui.md §5.2） */
export const INPUT_BUFFER_STEPS = 4

export type Facing = -1 | 1 // -1: 左、1: 右

export type ControlState = {
  /** 現在の左右のキーが押され始めたステップ。押していなければ null */
  leftSince: number | null
  rightSince: number | null
  /** 最後に決まった向き。一度も入力がなければ null（相手の方向を向く） */
  facing: Facing | null
  /** 先行入力。操作ごとに1つ（押したステップ） */
  jumpBufferedAt: number | null
  attackBufferedAt: number | null
}

export const initialControlState = (): ControlState => ({
  leftSince: null,
  rightSince: null,
  facing: null,
  jumpBufferedAt: null,
  attackBufferedAt: null,
})

export type ControlContext = {
  step: number
  /**
   * 押した瞬間（ジャンプ・攻撃）を受け付けるか。
   * READY・END、やられ中、撃墜中、リスポーン待ちは false。
   * false の間に押したものは捨てる（先行入力にしない）。左右の状態は、false でも追う
   */
  acceptInput: boolean
  /** いま、ジャンプを実行できるか（ファイターの状態から決まる） */
  canJump: boolean
  canAttack: boolean
  /** 一度も入力がないときの向き（相手の方向。開始時はステージの中央） */
  defaultFacing: Facing
}

export type Control = {
  /** -1: 左、0: 止まる（どちらも押さない、または両方を押す）、1: 右 */
  move: -1 | 0 | 1
  facing: Facing
  /** このステップでジャンプを実行する */
  jump: boolean
  /** このステップで攻撃を実行する。ジャンプと同じステップには実行しない */
  attack: boolean
}

const buffered = (at: number | null, step: number) => at !== null && step - at <= INPUT_BUFFER_STEPS

export function stepControl(
  state: ControlState,
  input: PlayerInput,
  ctx: ControlContext,
): { state: ControlState; control: Control } {
  const { step } = ctx

  const leftSince = input.left ? (state.leftSince ?? step) : null
  const rightSince = input.right ? (state.rightSince ?? step) : null

  // 向き（pc-ui.md §5.3）
  let facing = state.facing
  if (input.left && !input.right) facing = -1
  else if (input.right && !input.left) facing = 1
  else if (input.left && input.right) {
    // 押した時刻があとのほう。同じステップに初めて押したときは、直前の向きを保つ
    if (leftSince! > rightSince!) facing = -1
    else if (rightSince! > leftSince!) facing = 1
  }

  // 先行入力（§5.2、§5.4）
  let jumpAt = state.jumpBufferedAt
  let attackAt = state.attackBufferedAt
  if (!ctx.acceptInput) {
    jumpAt = null
    attackAt = null
  } else {
    if (input.jumpPressed) jumpAt = step
    if (input.attackPressed) attackAt = step
    if (!buffered(jumpAt, step)) jumpAt = null
    if (!buffered(attackAt, step)) attackAt = null
  }

  // 同じステップに両方できるときは、ジャンプ → 攻撃の順に、1ステップに1つ
  let jump = false
  let attack = false
  if (jumpAt !== null && ctx.canJump) {
    jump = true
    jumpAt = null
  } else if (attackAt !== null && ctx.canAttack) {
    attack = true
    attackAt = null
  }

  const move = input.left === input.right ? 0 : input.left ? -1 : 1

  return {
    state: {
      leftSince,
      rightSince,
      facing,
      jumpBufferedAt: jumpAt,
      attackBufferedAt: attackAt,
    },
    control: { move, facing: facing ?? ctx.defaultFacing, jump, attack },
  }
}
