// ゲームの状態（試合のファイター）から、アニメーションが見る状態（FighterSnapshot）を作る。
// 読み取りだけ。ファイターの状態は書き換えない（見た目は、当たり判定と物理を変えない。REQ-FTR-05）。
import { STEP_MS } from './clips.ts'
import type { AttackFrames, FighterSnapshot } from './types.ts'

/** 試合のファイターのうち、アニメーションが読む部分（構造だけで受ける。FighterMatch が、そのまま当てはまる） */
export type FighterView = {
  readonly body: { readonly vx: number; readonly vy: number; readonly onGround: boolean }
  readonly combat: {
    readonly hitstun: number
    readonly hitstop: number
    readonly down: boolean
    readonly attack: { readonly t: number } | null
  }
  readonly control: { readonly leftSince: number | null; readonly rightSince: number | null }
  readonly landingImpactSpeed: number | null
}

/** 左右の入力。両方を押しているときは、打ち消して 0（pc-ui.md §5.1） */
export function moveInputOf(c: FighterView['control']): -1 | 0 | 1 {
  const l = c.leftSince !== null
  const r = c.rightSince !== null
  return l === r ? 0 : l ? -1 : 1
}

export function snapshotOf(
  f: FighterView,
  frames: AttackFrames,
  /** 試合が FIGHT のとき true。READY・END は、押している左右の入力を、走る動きにしない */
  fighting: boolean,
): FighterSnapshot {
  const a = f.combat.attack
  const total = frames.startup + frames.active + frames.recovery
  const phase = !a
    ? null
    : a.t < frames.startup
      ? 'startup'
      : a.t < frames.startup + frames.active
        ? 'active'
        : 'recovery'
  return {
    onGround: f.body.onGround,
    vx: f.body.vx,
    vy: f.body.vy,
    moveInput: fighting ? moveInputOf(f.control) : 0,
    attackPhase: phase,
    attackProgress: a ? Math.min(1, a.t / total) : 0,
    hitstunRemaining: f.combat.hitstun * STEP_MS,
    landingImpactSpeed: f.landingImpactSpeed,
    ko: f.combat.down,
    frozen: f.combat.hitstop > 0,
  }
}
