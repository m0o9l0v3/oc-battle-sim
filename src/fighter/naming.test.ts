import { describe, expect, it } from 'vitest'
import { APPEARANCE_IDS, createDefaultConfig, validateConfig } from './config.ts'
import { randomAppearance } from './appearance.ts'
import { clampName, nameRemaining, stoppedEarlyByBytes } from './naming.ts'

describe('clampName', () => {
  it('上限内は、そのまま', () => {
    expect(clampName('')).toEqual({ value: '', limitedBy: null })
    expect(clampName('ひろし')).toEqual({ value: 'ひろし', limitedBy: null })
    expect(clampName('あいうえおかきくけこ')).toEqual({
      value: 'あいうえおかきくけこ',
      limitedBy: null,
    })
    expect(clampName('abcdefghij').limitedBy).toBeNull()
  })

  it('11 文字目は、受け付けない（文字数の上限）', () => {
    expect(clampName('あいうえおかきくけこさ')).toEqual({
      value: 'あいうえおかきくけこ',
      limitedBy: 'chars',
    })
    expect(clampName('abcdefghijk')).toEqual({ value: 'abcdefghij', limitedBy: 'chars' })
  })

  it('4 バイトの文字（絵文字）は、10 文字より早く止まる（バイト数の上限）', () => {
    const r = clampName('😀'.repeat(10))
    expect(r.value).toBe('😀'.repeat(7))
    expect(r.limitedBy).toBe('bytes')
    expect(stoppedEarlyByBytes(r.value, r.limitedBy)).toBe(true)
    expect(stoppedEarlyByBytes('あ'.repeat(10), 'chars')).toBe(false)
  })

  it('制御文字は取り除く。どんな入力でも、検証（match）を通る', () => {
    expect(clampName('あ\nい\u0000う').value).toBe('あいう')
    const inputs = [
      '😀'.repeat(20),
      'あ'.repeat(30),
      'a😀b😀c😀d😀e😀f',
      '家族👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦',
      'é'.repeat(15),
    ]
    for (const input of inputs) {
      const cfg = { ...createDefaultConfig('p1'), name: clampName(input).value }
      expect(validateConfig(cfg, 'match').ok, input).toBe(true)
    }
  })
})

describe('nameRemaining', () => {
  it('あと何文字か（日本語の前提）', () => {
    expect(nameRemaining('')).toBe(10)
    expect(nameRemaining('ひろし')).toBe(7)
    expect(nameRemaining('あ'.repeat(10))).toBe(0)
    expect(nameRemaining('😀'.repeat(7))).toBe(0)
    expect(nameRemaining('😀'.repeat(5))).toBe(3)
  })
})

describe('randomAppearance', () => {
  it('許可された ID だけ。null（なし）も出る。乱数は引数', () => {
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    let sawNull = false
    for (let i = 0; i < 300; i++) {
      const a = randomAppearance(rand)
      expect(APPEARANCE_IDS.body).toContain(a.body)
      expect(APPEARANCE_IDS.face).toContain(a.face)
      expect(APPEARANCE_IDS.color).toContain(a.color)
      if (a.accessory === null) sawNull = true
      else expect(APPEARANCE_IDS.accessory).toContain(a.accessory)
    }
    expect(sawNull).toBe(true)
    // 端の値でも範囲外にならない
    expect(randomAppearance(() => 0.9999999).body).toBe('b4')
    expect(randomAppearance(() => 0).accessory).toBe('a1')
  })
})
