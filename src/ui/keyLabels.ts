// キー（KeyboardEvent.code）→ 画面に出す表記。docs/06-ui/pc-ui.md §4
const SPECIAL: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Slash: '/',
  Space: 'スペース',
}

export function keyLabel(code: string): string {
  const special = SPECIAL[code]
  if (special) return special
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]!
  const numpad = /^Numpad(\d)$/.exec(code)
  if (numpad) return `テンキーの ${numpad[1]}`
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]!
  return code
}

/** 1 つの操作に割り当てたキーを、「A」「テンキーの 4 / ←」のように並べる（最初のキーを先に） */
export const keysLabel = (codes: readonly string[]): string => codes.map(keyLabel).join(' / ')
