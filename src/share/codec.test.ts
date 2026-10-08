import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../fighter/index.ts'
import { type CellValue, type CharacterConfig, type StageData } from '../model/index.ts'
import { STAGE_PRESETS, presetStage, validateStage } from '../stage/index.ts'
import {
  crc16,
  decodeTakeHome,
  encodeTakeHome,
  fromBase64Url,
  toBase64Url,
  type DecodeFailure,
} from './codec.ts'
import { DEFAULT_PUBLIC_APP_URL, QR_MAX_BYTES } from './config.ts'
import { buildTakeHomeUrl, fitsInQr, worstCaseUrlLength } from './url.ts'

const fighter = (patch: Partial<CharacterConfig> = {}): CharacterConfig => ({
  ...createDefaultConfig('p1'),
  ...patch,
})
const stage = presetStage('standard')
const frag = (c: CharacterConfig, s: StageData) => {
  const r = encodeTakeHome(c, s)
  if (!r.ok) throw new Error('encode failed')
  return `t1.${r.payload}`
}

describe('Base64URL・CRC', () => {
  it('往復する。パディングは付けない。URL に安全な文字だけ', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 111]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)
      const text = toBase64Url(bytes)
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(fromBase64Url(text)).toEqual(bytes)
    }
  })
  it('正しくない文字・長さ・余りのビットは null', () => {
    expect(fromBase64Url('ab+c')).toBeNull()
    expect(fromBase64Url('a')).toBeNull()
    expect(fromBase64Url('AAAB')).not.toBeNull()
    expect(fromBase64Url('AB')).toBeNull() // 余りのビットが 0 でない
  })
  it('CRC-16/CCITT-FALSE の標準の確認値（"123456789" → 0x29B1）', () => {
    expect(crc16(Array.from('123456789', (c) => c.charCodeAt(0)))).toBe(0x29b1)
  })
})

describe('符号化と復号の往復', () => {
  it('標準の設定とプリセットのステージが、そのまま戻る', () => {
    for (const p of STAGE_PRESETS) {
      const s = presetStage(p.id)
      const c = fighter({ name: 'たろう' })
      const r = decodeTakeHome(frag(c, s))
      expect(r).toMatchObject({ ok: true })
      if (r.ok) {
        expect(r.character).toEqual(c)
        expect(r.stage).toEqual(s)
      }
    }
  })

  it('先頭の # は、付いていても付いていなくてもよい', () => {
    const f = frag(fighter(), stage)
    expect(decodeTakeHome(`#${f}`)).toEqual(decodeTakeHome(f))
  })

  it('能力値・外観の、すべての値が戻る（2/8 の極端な配分、アクセサリーあり・なし）', () => {
    const configs: CharacterConfig[] = [
      { ...fighter(), stats: { attackPower: 8, defense: 2, jumpPower: 5, speed: 5 } },
      { ...fighter(), stats: { attackPower: 2, defense: 8, jumpPower: 2, speed: 8 } },
      { ...fighter(), appearance: { body: 'b4', face: 'f6', color: 'c8', accessory: 'a6' } },
      { ...fighter(), appearance: { body: 'b2', face: 'f3', color: 'c5', accessory: 'a1' } },
    ]
    for (const c of configs) {
      const r = decodeTakeHome(frag(c, stage))
      expect(r).toMatchObject({ ok: true })
      if (r.ok) expect(r.character).toEqual(c)
    }
  })

  it('日本語・絵文字の名前が戻る（NFC にそろえて）', () => {
    for (const name of ['ゆうしゃ', 'ABC', '😀😀😀', 'が'.normalize('NFD')]) {
      const r = decodeTakeHome(frag(fighter({ name }), stage))
      expect(r).toMatchObject({ ok: true })
      if (r.ok) expect(r.character.name).toBe(name.normalize('NFC'))
    }
  })

  it('ステージの名前・スポーン・セルが戻る。名前が空なら既定名', () => {
    const cells: CellValue[][] = stage.cells.map((row) => row.map((c) => c))
    const s: StageData = { ...stage, name: 'わたしの ばしょ', cells }
    const r = decodeTakeHome(frag(fighter(), s))
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.stage).toEqual(s)
  })
})

describe('データ量（take-home-share.md §6.2、§7）', () => {
  it('最悪（名前が 30 バイトずつ）でも、ペイロードは 148 文字を超えない', () => {
    const longName = '😀😀😀😀😀😀😀' // 28 バイト
    const tenKana = 'あいうえおかきくけこ' // 10 文字 = 30 バイト
    const longStage: StageData = { ...stage, name: tenKana }
    const r = encodeTakeHome(fighter({ name: tenKana }), longStage)
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.payload.length).toBe(148)
    const short = encodeTakeHome(fighter({ name: 'a' }), { ...stage, name: 'b' })
    if (short.ok) expect(short.payload.length).toBeLessThan(148)
    expect(longName).toBeTruthy()
  })

  it('ステージの形に関わらず、同じ長さ（名前が同じなら）', () => {
    const lens = STAGE_PRESETS.map((p) => {
      const res = encodeTakeHome(fighter(), { ...presetStage(p.id), name: 'x' })
      return res.ok ? res.payload.length : -1
    })
    expect(lens.length).toBeGreaterThan(1)
    expect(new Set(lens).size).toBe(1)
    expect(lens[0]).toBeGreaterThan(0)
  })

  it('最悪の持ち帰りURLは、QR の容量（213 バイト）に収まる', () => {
    expect(worstCaseUrlLength()).toBeLessThanOrEqual(QR_MAX_BYTES)
    expect(fitsInQr()).toBe(true)
    expect(fitsInQr(`https://${'x'.repeat(80)}.example/`)).toBe(false)
    const ten = 'あいうえおかきくけこ'
    const url = buildTakeHomeUrl(DEFAULT_PUBLIC_APP_URL, fighter({ name: ten }), {
      ...stage,
      name: ten,
    })
    expect(new TextEncoder().encode(url!).length).toBe(worstCaseUrlLength())
  })
})

describe('buildTakeHomeUrl', () => {
  it('公開URL + # + t1. + ペイロード。同じデータからは同じ URL', () => {
    const a = buildTakeHomeUrl(DEFAULT_PUBLIC_APP_URL, fighter(), stage)
    const b = buildTakeHomeUrl(DEFAULT_PUBLIC_APP_URL, fighter(), stage)
    expect(a).toBe(b)
    expect(a).toMatch(/^https:\/\/m0o9l0v3\.github\.io\/oc-battle-sim\/#t1\.[A-Za-z0-9_-]+$/)
    expect(a).not.toContain('?')
  })
  it('検証を通らない値は URL にしない', () => {
    const bad = { ...fighter(), stats: { attackPower: 9, defense: 5, jumpPower: 3, speed: 3 } }
    expect(buildTakeHomeUrl(DEFAULT_PUBLIC_APP_URL, bad, stage)).toBeNull()
    expect(buildTakeHomeUrl(DEFAULT_PUBLIC_APP_URL, fighter(), { ...stage, cells: [] })).toBeNull()
  })
})

describe('復号の失敗（例外を投げず ok: false）', () => {
  const good = frag(fighter({ name: 'たろう' }), stage)
  const reason = (s: string): DecodeFailure | 'ok' => {
    const r = decodeTakeHome(s)
    return r.ok ? 'ok' : r.reason
  }

  it('識別子が違う・ない・空', () => {
    expect(reason('')).toBe('UNKNOWN_VERSION')
    expect(reason('#')).toBe('UNKNOWN_VERSION')
    expect(reason(`u1.${good.slice(3)}`)).toBe('UNKNOWN_VERSION')
    expect(reason(`t2.${good.slice(3)}`)).toBe('UNKNOWN_VERSION')
    expect(reason('hello')).toBe('UNKNOWN_VERSION')
  })

  it('切れている（途中で終わる）', () => {
    for (const n of [4, 10, 50, good.length - 4, good.length - 1]) {
      expect(reason(good.slice(0, n)), `n=${n}`).not.toBe('ok')
    }
  })

  it('1文字でも書き換えると失敗する（チェックサム）', () => {
    const payloadStart = 3
    for (let i = payloadStart; i < good.length; i += 7) {
      const ch = good[i] === 'A' ? 'B' : 'A'
      const bad = good.slice(0, i) + ch + good.slice(i + 1)
      expect(reason(bad), `i=${i}`).not.toBe('ok')
    }
  })

  it('Base64URL にない文字', () => {
    expect(reason(`t1.${'!'.repeat(20)}`)).toBe('BAD_ENCODING')
    expect(reason(`t1.ab+/`)).toBe('BAD_ENCODING')
  })

  it('チェックサムは合っているが、値が範囲外・検証を通らない', () => {
    // 手で作った列に、正しいチェックサムをつける
    const make = (build: (put: (v: number, bits: number) => void) => void) => {
      const bits: number[] = []
      build((v, n) => {
        for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1)
      })
      while (bits.length % 8) bits.push(0)
      const bytes: number[] = []
      for (let i = 0; i < bits.length; i += 8)
        bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
      const crc = crc16(bytes)
      return `t1.${toBase64Url([...bytes, crc >> 8, crc & 255])}`
    }
    const stageBits = (put: (v: number, n: number) => void) => {
      for (let i = 0; i < 336; i++) put(i >= 240 ? 1 : 0, 1)
      put(4, 5)
      put(9, 4)
      put(19, 5)
      put(9, 4)
      put(0, 5)
    }
    const fighterBits = (
      put: (v: number, n: number) => void,
      o: { reserved?: number; stats?: number[]; accessory?: number; nameLen?: number } = {},
    ) => {
      put(o.reserved ?? 0, 5)
      for (const v of o.stats ?? [3, 3, 3, 3]) put(v, 3)
      put(0, 2)
      put(0, 3)
      put(0, 3)
      put(o.accessory ?? 0, 3)
      put(o.nameLen ?? 0, 5)
    }
    const ok = make((p) => {
      fighterBits(p)
      stageBits(p)
    })
    expect(reason(ok)).toBe('ok')
    expect(reason(make((p) => (fighterBits(p, { reserved: 1 }), stageBits(p))))).toBe(
      'OUT_OF_RANGE',
    )
    expect(reason(make((p) => (fighterBits(p, { stats: [7, 3, 3, 3] }), stageBits(p))))).toBe(
      'OUT_OF_RANGE',
    )
    expect(reason(make((p) => (fighterBits(p, { accessory: 7 }), stageBits(p))))).toBe(
      'OUT_OF_RANGE',
    )
    expect(reason(make((p) => (fighterBits(p, { nameLen: 31 }), stageBits(p))))).toBe(
      'OUT_OF_RANGE',
    )
    // 合計が 20 でない（3,3,3,3 → 5,5,5,5 の合計は 20。3×4+8=20 なので、4,4,4,4 は 16）
    expect(reason(make((p) => (fighterBits(p, { stats: [2, 2, 2, 2] }), stageBits(p))))).toBe(
      'INVALID_CONFIG',
    )
    // ステージの検証を通らない（床がない）
    expect(
      reason(
        make((p) => {
          fighterBits(p)
          for (let i = 0; i < 336; i++) p(0, 1)
          p(4, 5)
          p(9, 4)
          p(19, 5)
          p(9, 4)
          p(0, 5)
        }),
      ),
    ).toBe('INVALID_STAGE')
    // 余りがある
    expect(
      reason(
        make((p) => {
          fighterBits(p)
          stageBits(p)
          p(0, 8)
        }),
      ),
    ).toBe('TOO_SHORT')
  })

  it('壊れた UTF-8 の名前は失敗', () => {
    // 名前の長さ 1、バイトが 0xFF（UTF-8 として不正）
    const bits: number[] = []
    const put = (v: number, n: number) => {
      for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1)
    }
    put(0, 5)
    for (let i = 0; i < 4; i++) put(3, 3)
    put(0, 2)
    put(0, 3)
    put(0, 3)
    put(0, 3)
    put(1, 5)
    put(0xff, 8)
    for (let i = 0; i < 336; i++) put(i >= 240 ? 1 : 0, 1)
    put(4, 5)
    put(9, 4)
    put(19, 5)
    put(9, 4)
    put(0, 5)
    while (bits.length % 8) bits.push(0)
    const bytes: number[] = []
    for (let i = 0; i < bits.length; i += 8)
      bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
    const crc = crc16(bytes)
    expect(reason(`t1.${toBase64Url([...bytes, crc >> 8, crc & 255])}`)).toBe('OUT_OF_RANGE')
  })

  it('どんな文字列でも例外を投げない', () => {
    const inputs = [
      '\u0000',
      '😀',
      't1.',
      't1.' + 'A'.repeat(500),
      '#t1.' + '_'.repeat(3),
      'x'.repeat(10000),
    ]
    for (const s of inputs) expect(() => decodeTakeHome(s)).not.toThrow()
  })

  it('復元したステージは、検証を通る', () => {
    const r = decodeTakeHome(good)
    expect(r.ok && validateStage(r.stage, 'match').ok).toBe(true)
  })
})
