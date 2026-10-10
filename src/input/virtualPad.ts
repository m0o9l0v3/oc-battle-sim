// スマホの仮想コントローラーの入力ソース。1人用（左右・ジャンプ・攻撃）。
// 仕様: docs/06-ui/mobile-ui.md §6
// ボタンの描画と、指の位置からボタンを決める処理は ui/ が持ち、ここは指ごとの状態だけを持つ

import type { InputSource, PlayerInput } from '../battle/index.ts'
import { ACTIONS, type Action } from './bindings.ts'

type ActionState = {
  /** 前のサンプルから今までに、押された（離されたあとでも）。短いタップを1ステップ分は動かす */
  tapped: boolean
  /** 前のサンプルから今までに、押した瞬間があった。ラッチ */
  edge: boolean
}

export class VirtualPadInput implements InputSource {
  /** 指（pointerId）ごとに、いま押しているボタン */
  private readonly pointers = new Map<number, Action>()
  private readonly state: Record<Action, ActionState>
  private readonly listeners = new Set<() => void>()

  constructor() {
    this.state = Object.fromEntries(
      ACTIONS.map((a) => [a, { tapped: false, edge: false }]),
    ) as Record<Action, ActionState>
  }

  /**
   * 指の下のボタンを伝える。`pointerdown`・`pointermove` のたびに呼ぶ。
   * `null` は、ボタンの外。別のボタンに入ったら、前のボタンを離し、新しいボタンを押す
   */
  point(pointerId: number, action: Action | null) {
    const prev = this.pointers.get(pointerId) ?? null
    if (prev === action) return
    const before = this.isHeld(action)
    if (action === null) this.pointers.delete(pointerId)
    else this.pointers.set(pointerId, action)
    // 別の指がすでに押しているボタンに入っても、押した瞬間にはしない（押し直しではない）
    if (action !== null && !before) {
      this.state[action].tapped = true
      this.state[action].edge = true
    }
    this.notify()
  }

  /** 指を離した（`pointerup`・`pointercancel`） */
  release(pointerId: number) {
    this.point(pointerId, null)
  }

  /** すべての指を離した扱いにする。ためていた入力も捨てる（画面が隠れた、縦持ちになった） */
  releaseAll() {
    const changed = this.pointers.size > 0
    this.pointers.clear()
    for (const a of ACTIONS) {
      this.state[a].tapped = false
      this.state[a].edge = false
    }
    if (changed) this.notify()
  }

  /** いま押している操作（ボタンの見た目用。対戦のラッチとは別の経路） */
  pressed(): ReadonlySet<Action> {
    return new Set(this.pointers.values())
  }

  /** 押している状態が変わったときの通知（ボタンの見た目用） */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  sample(): PlayerInput {
    const s = this.state
    const held = (a: Action) => this.isHeld(a) || s[a].tapped
    const out: PlayerInput = {
      left: held('left'),
      right: held('right'),
      jumpPressed: s.jump.edge,
      attackPressed: s.attack.edge,
    }
    for (const a of ACTIONS) {
      s[a].tapped = false
      s[a].edge = false
    }
    return out
  }

  dispose() {
    this.pointers.clear()
    this.listeners.clear()
  }

  private isHeld(action: Action | null): boolean {
    if (action === null) return false
    for (const a of this.pointers.values()) if (a === action) return true
    return false
  }

  private notify() {
    for (const l of this.listeners) l()
  }
}
