// キー配置。docs/06-ui/pc-ui.md §4、§9
// 配置は、ここ（設定）にまとめる。コードを変えずに変更できる。

export type Action = 'left' | 'right' | 'jump' | 'attack'
export const ACTIONS: readonly Action[] = ['left', 'right', 'jump', 'attack']

/** KeyboardEvent.code のリスト（物理的な位置。キーボードの言語配列や NumLock に影響されにくい） */
export type KeyBinding = Record<Action, string[]>
export type KeyBindings = { p1: KeyBinding; p2: KeyBinding }

export const DEFAULT_BINDINGS: KeyBindings = {
  // 1P: キーボードの左側。Shift・Ctrl・Alt は使わない（固定キー機能・ショートカットとの衝突）
  p1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], attack: ['KeyF'] },
  // 2P: テンキー（4 6 8 5）。テンキーがない家庭のキーボード用に、矢印の配置も同時に使える
  p2: {
    left: ['Numpad4', 'ArrowLeft'],
    right: ['Numpad6', 'ArrowRight'],
    jump: ['Numpad8', 'ArrowUp'],
    attack: ['Numpad5', 'Slash'],
  },
}

export type BindingError =
  | { code: 'EMPTY'; player: 'p1' | 'p2'; action: Action }
  | { code: 'DUPLICATE'; key: string; where: string[] }

/** 空の操作がないこと、同じキーが複数のプレイヤー・操作に重ならないことを調べる */
export function validateBindings(b: KeyBindings): BindingError[] {
  const errors: BindingError[] = []
  const seen = new Map<string, string[]>()
  for (const player of ['p1', 'p2'] as const) {
    for (const action of ACTIONS) {
      const keys = b[player][action]
      if (keys.length === 0) errors.push({ code: 'EMPTY', player, action })
      for (const key of keys) {
        const where = seen.get(key) ?? []
        where.push(`${player}.${action}`)
        seen.set(key, where)
      }
    }
  }
  for (const [key, where] of seen) {
    if (where.length > 1) errors.push({ code: 'DUPLICATE', key, where })
  }
  return errors
}
