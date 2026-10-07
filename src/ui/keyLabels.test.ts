import { describe, expect, it } from 'vitest'
import { DEFAULT_BINDINGS } from '../input/index.ts'
import { keyLabel, keysLabel } from './keyLabels.ts'

describe('keyLabel', () => {
  it('文字・矢印・テンキー・記号を、画面向けの表記にする', () => {
    expect(keyLabel('KeyA')).toBe('A')
    expect(keyLabel('KeyF')).toBe('F')
    expect(keyLabel('ArrowLeft')).toBe('←')
    expect(keyLabel('Numpad4')).toBe('テンキーの 4')
    expect(keyLabel('Slash')).toBe('/')
    expect(keyLabel('Digit5')).toBe('5')
    expect(keyLabel('F13')).toBe('F13')
  })

  it('1P の 4 つの操作が、A D W F と表示される。2P は、テンキーと矢印の両方', () => {
    const p1 = DEFAULT_BINDINGS.p1
    expect([p1.left, p1.right, p1.jump, p1.attack].map(keysLabel)).toEqual(['A', 'D', 'W', 'F'])
    expect(keysLabel(DEFAULT_BINDINGS.p2.left)).toBe('テンキーの 4 / ←')
  })
})
