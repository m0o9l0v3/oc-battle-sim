// CPU が見てよい盤面（読み取り専用のビュー）。docs/03-combat/cpu-opponent.md §3.2、frontend.md §7.4
// プレイヤーが画面から知り得ること（位置・速さ・蓄積ダメージ・攻撃の様子）だけを写す。
// 相手の入力・先行入力・内部のタイマー（やられ中の残りなど）は、含めない
import type { MatchPhase, MatchState } from '../battle/index.ts'

export type FighterView = {
  /** 足元の中心（セル。y は下が正） */
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  airJumpsLeft: number
  facing: -1 | 1
  /** 蓄積ダメージ（%） */
  damage: number
  /** 攻撃中なら、始めてからのステップと向き（見た目の構えから分かる） */
  attack: { t: number; facing: -1 | 1 } | null
  /** やられ中（吹き飛ばされて、操作できない） */
  stunned: boolean
  /** 攻撃を受けない（点滅して見える） */
  invulnerable: boolean
  /** 撃墜中・リスポーン待ち */
  down: boolean
}

export type CpuView = {
  step: number
  phase: MatchPhase
  self: FighterView
  foe: FighterView
}

const fighterView = (f: MatchState['fighters'][number]): FighterView => ({
  x: f.body.x,
  y: f.body.y,
  vx: f.body.vx,
  vy: f.body.vy,
  onGround: f.body.onGround,
  airJumpsLeft: f.body.airJumpsLeft,
  facing: f.facing,
  damage: f.combat.damage,
  attack: f.combat.attack && { t: f.combat.attack.t, facing: f.combat.attack.facing },
  stunned: f.combat.hitstun > 0,
  invulnerable: f.combat.invuln > 0,
  down: f.combat.down,
})

/** 試合の状態から、slot の側の CPU が見るビューを作る（状態は変えない） */
export function viewOf(state: MatchState, slot: 0 | 1): CpuView {
  return {
    step: state.step,
    phase: state.phase,
    self: fighterView(state.fighters[slot]),
    foe: fighterView(state.fighters[1 - slot]),
  }
}
