// キーボードの入力ソース。1つのキーボードを、1P と 2P で共有する。
// 仕様: docs/06-ui/pc-ui.md §4〜§5、§8、§10

import type { InputSource, PlayerInput } from '../battle/index.ts'
import {
  ACTIONS,
  DEFAULT_BINDINGS,
  validateBindings,
  type Action,
  type KeyBindings,
} from './bindings.ts'

type Slot = 'p1' | 'p2'

/** KeyboardEvent のうち、使う部分 */
export type KeyEventLike = {
  code: string
  repeat?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  target?: unknown
  preventDefault(): void
}

/** window など。キーのイベントを受け取る相手 */
export type KeyTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

/** 文字を入力する欄にフォーカスがあるときは、ゲームの操作として扱わない（pc-ui.md §10） */
function isEditable(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null
  if (!t || typeof t !== 'object') return false
  const tag = t.tagName?.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true
}

type ActionState = {
  /** 押しているキー */
  down: Set<string>
  /** 前のサンプルから今までに、押された（離されたあとでも）。短い入力を1ステップ分は動かす */
  tapped: boolean
  /** 前のサンプルから今までに、押した瞬間があった（リピートは除く）。ラッチ */
  edge: boolean
}

export class KeyboardInput {
  private readonly bindings: KeyBindings
  private readonly target: KeyTarget
  private readonly state: Record<Slot, Record<Action, ActionState>>
  private readonly codeMap = new Map<string, { slot: Slot; action: Action }>()
  private readonly down = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private disposed = false

  /** 1P・2P の入力ソース */
  readonly p1: InputSource
  readonly p2: InputSource

  constructor(target: KeyTarget, bindings: KeyBindings = DEFAULT_BINDINGS) {
    const errors = validateBindings(bindings)
    if (errors.length > 0) {
      throw new Error(`Invalid key bindings: ${JSON.stringify(errors)}`)
    }
    this.bindings = bindings
    this.target = target
    const blank = (): Record<Action, ActionState> =>
      Object.fromEntries(
        ACTIONS.map((a) => [a, { down: new Set<string>(), tapped: false, edge: false }]),
      ) as Record<Action, ActionState>
    this.state = { p1: blank(), p2: blank() }
    for (const slot of ['p1', 'p2'] as const) {
      for (const action of ACTIONS) {
        for (const code of bindings[slot][action]) this.codeMap.set(code, { slot, action })
      }
    }
    this.p1 = this.source('p1')
    this.p2 = this.source('p2')
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
    target.addEventListener('blur', this.onBlur)
  }

  /** いま押している、操作用のキー（キー確認の画面用。対戦のラッチとは別の経路） */
  pressedKeys(): ReadonlySet<string> {
    return this.down
  }

  /** 押している状態が変わったときの通知（キー確認の画面用） */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 押しているキーを、すべて離した扱いにする（ウィンドウが非アクティブになったとき） */
  releaseAll() {
    let changed = this.down.size > 0
    this.down.clear()
    for (const slot of ['p1', 'p2'] as const) {
      for (const action of ACTIONS) {
        const s = this.state[slot][action]
        if (s.down.size > 0) changed = true
        s.down.clear()
      }
    }
    if (changed) this.notify()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.target.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('keyup', this.onKeyUp)
    this.target.removeEventListener('blur', this.onBlur)
    this.listeners.clear()
  }

  /** 設定されている配置（読み取り用） */
  get currentBindings(): KeyBindings {
    return this.bindings
  }

  private source(slot: Slot): InputSource {
    return {
      sample: () => this.sample(slot),
      // 1つのキーボードを共有するため、個別の dispose は何もしない（KeyboardInput.dispose を使う）
      dispose: () => {},
    }
  }

  private sample(slot: Slot): PlayerInput {
    const s = this.state[slot]
    // 押している状態は、「サンプルの時点で押している」または「前のサンプルから押されたことがある」
    const held = (a: Action) => s[a].down.size > 0 || s[a].tapped
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

  private readonly onKeyDown = (event: Event) => {
    const e = event as unknown as KeyEventLike
    const hit = this.codeMap.get(e.code)
    if (!hit || isEditable(e.target)) return
    // ブラウザのショートカット（Ctrl+R など）と、操作を取り違えない
    if (e.ctrlKey || e.altKey || e.metaKey) return
    e.preventDefault() // スクロール・検索などを起こさない
    if (e.repeat) return // キーリピートは、押した瞬間として数えない
    const s = this.state[hit.slot][hit.action]
    s.down.add(e.code)
    s.tapped = true
    s.edge = true
    this.down.add(e.code)
    this.notify()
  }

  private readonly onKeyUp = (event: Event) => {
    const e = event as unknown as KeyEventLike
    const hit = this.codeMap.get(e.code)
    if (!hit) return
    // 離したときは、入力欄・修飾キーの有無に関わらず、離した扱いにする（押しっぱなしを防ぐ）
    if (!isEditable(e.target)) e.preventDefault()
    this.state[hit.slot][hit.action].down.delete(e.code)
    if (this.down.delete(e.code)) this.notify()
  }

  private readonly onBlur = () => this.releaseAll()

  private notify() {
    for (const l of this.listeners) l()
  }
}
