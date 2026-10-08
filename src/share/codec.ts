// 持ち帰りデータの符号化・復号。仕様: docs/05-multiplayer/take-home-share.md §6
//  - 1P の CharacterConfig と StageData を、ビットにつめて、Base64URL にする（固定長に近い。RLE は使わない）
//  - 復号は、例外を投げない。失敗は `ok: false` と理由で返す。標準の設定にする判断は、呼び出し側が行う
import {
  APPEARANCE_IDS,
  normalizeName,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  validateConfig,
} from '../fighter/index.ts'
import {
  STAGE_COLS,
  STAGE_ROWS,
  type CellValue,
  type CharacterConfig,
  type StageData,
} from '../model/index.ts'
import { validateStage } from '../stage/index.ts'
import { TAKE_HOME_PREFIX } from './config.ts'

export type DecodeFailure =
  /** 識別子が `t1.` ではない */
  | 'UNKNOWN_VERSION'
  /** Base64URL として正しくない */
  | 'BAD_ENCODING'
  /** 欄の途中で切れている、または余りがある */
  | 'TOO_SHORT'
  | 'BAD_CHECKSUM'
  /** 値が範囲外（予備ビット、能力値、外観、名前の長さ、UTF-8） */
  | 'OUT_OF_RANGE'
  | 'INVALID_CONFIG'
  | 'INVALID_STAGE'

export type TakeHomeData = { character: CharacterConfig; stage: StageData }

export type DecodeResult = ({ ok: true } & TakeHomeData) | { ok: false; reason: DecodeFailure }
export type EncodeResult = { ok: true; payload: string } | { ok: false }

const RESERVED_BITS = 5
const NAME_LEN_BITS = 5
const STAT_BITS = 3
const CRC_BITS = 16

// --- ビットの読み書き ---

class BitWriter {
  readonly bytes: number[] = []
  private cur = 0
  private n = 0
  write(value: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >>> i) & 1)
      if (++this.n === 8) {
        this.bytes.push(this.cur)
        this.cur = 0
        this.n = 0
      }
    }
  }
  get aligned() {
    return this.n === 0
  }
}

class BitReader {
  private pos = 0
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }
  get remaining() {
    return this.bytes.length * 8 - this.pos
  }
  /** 足りないときは null */
  read(bits: number): number | null {
    if (bits > this.remaining) return null
    let v = 0
    for (let i = 0; i < bits; i++) {
      const byte = this.bytes[this.pos >> 3]!
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1)
      this.pos++
    }
    return v >>> 0
  }
}

/** CRC-16/CCITT-FALSE（多項式 0x1021、初期値 0xFFFF） */
export function crc16(bytes: ArrayLike<number>): number {
  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]! << 8
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc
}

// --- Base64URL（パディングなし） ---

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toBase64Url(bytes: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!
    if (i + 2 < bytes.length) out += B64[n & 63]!
  }
  return out
}

/** 正しくない文字、または長さ（4 で割った余りが 1）のときは null。余りのビットが 0 でないときも null（一意な表現だけを許す） */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null
  const out: number[] = []
  let acc = 0
  let bits = 0
  for (const ch of text) {
    const v = B64.indexOf(ch)
    if (v < 0) return null
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 255)
      acc &= (1 << bits) - 1
    }
  }
  return acc === 0 ? Uint8Array.from(out) : null
}

// --- UTF-8 ---

const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s))

function utf8Decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

// --- 符号化 ---

/**
 * 1P の設定とステージを、ペイロード（Base64URL の文字列。識別子は含まない）にする。
 * 検証（'import'）を通らない値は、符号化しない（`ok: false`）。例外を投げない。
 */
export function encodeTakeHome(character: CharacterConfig, stage: StageData): EncodeResult {
  const c = validateConfig(character, 'import')
  const s = validateStage(stage, 'import')
  if (!c.ok || !s.ok) return { ok: false }
  const cfg = c.config
  const stg = s.stage
  const ap = cfg.appearance
  const body = APPEARANCE_IDS.body.indexOf(ap.body as never)
  const face = APPEARANCE_IDS.face.indexOf(ap.face as never)
  const color = APPEARANCE_IDS.color.indexOf(ap.color as never)
  const acc =
    ap.accessory === null ? 0 : APPEARANCE_IDS.accessory.indexOf(ap.accessory as never) + 1
  if (body < 0 || face < 0 || color < 0 || acc < 0 || (ap.accessory !== null && acc === 0))
    return { ok: false }

  const w = new BitWriter()
  w.write(0, RESERVED_BITS)
  for (const k of STAT_KEYS) w.write(cfg.stats[k] - STAT_MIN, STAT_BITS)
  w.write(body, 2)
  w.write(face, 3)
  w.write(color, 3)
  w.write(acc, 3)
  const cname = utf8(normalizeName(cfg.name))
  w.write(cname.length, NAME_LEN_BITS)
  for (const b of cname) w.write(b, 8)
  for (let r = 0; r < STAGE_ROWS; r++)
    for (let col = 0; col < STAGE_COLS; col++) w.write(stg.cells[r]![col]!, 1)
  w.write(stg.spawns.p1.col, 5)
  w.write(stg.spawns.p1.row, 4)
  w.write(stg.spawns.p2.col, 5)
  w.write(stg.spawns.p2.row, 4)
  const sname = utf8(normalizeName(stg.name))
  w.write(sname.length, NAME_LEN_BITS)
  for (const b of sname) w.write(b, 8)
  // 欄 1〜9 は、常に 8 の倍数のビット（予備の 5 ビットで調整してある）。チェックサムは、そのバイト列
  if (!w.aligned) return { ok: false }
  w.write(crc16(w.bytes), CRC_BITS)
  return { ok: true, payload: toBase64Url(w.bytes) }
}

// --- 復号 ---

const fail = (reason: DecodeFailure): DecodeResult => ({ ok: false, reason })

/**
 * 持ち帰りURLのフラグメント（`#t1.…`。先頭の `#` は付いていても付いていなくてもよい）を復号する。
 * 例外を投げない。成功した値は、検証（'import'）を通した新しいオブジェクト
 */
export function decodeTakeHome(fragment: string): DecodeResult {
  try {
    return decode(fragment)
  } catch {
    return fail('BAD_ENCODING')
  }
}

function decode(fragment: string): DecodeResult {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment
  if (!text.startsWith(TAKE_HOME_PREFIX)) return fail('UNKNOWN_VERSION')
  const bytes = fromBase64Url(text.slice(TAKE_HOME_PREFIX.length))
  if (!bytes) return fail('BAD_ENCODING')
  // チェックサムは末尾の 2 バイト。先に調べる（切れた・書き換えられたデータを、早く弾く）
  if (bytes.length < 2) return fail('TOO_SHORT')
  const body = bytes.subarray(0, bytes.length - 2)
  const stored = (bytes[bytes.length - 2]! << 8) | bytes[bytes.length - 1]!
  if (crc16(body) !== stored) return fail('BAD_CHECKSUM')

  const r = new BitReader(body)
  const need = (bits: number): number | null => r.read(bits)
  const reserved = need(RESERVED_BITS)
  if (reserved === null) return fail('TOO_SHORT')
  if (reserved !== 0) return fail('OUT_OF_RANGE')

  const stats: Record<string, number> = {}
  for (const k of STAT_KEYS) {
    const v = need(STAT_BITS)
    if (v === null) return fail('TOO_SHORT')
    if (v + STAT_MIN > STAT_MAX) return fail('OUT_OF_RANGE')
    stats[k] = v + STAT_MIN
  }
  const ap = [need(2), need(3), need(3), need(3)]
  if (ap.some((v) => v === null)) return fail('TOO_SHORT')
  const [bi, fi, ci, ai] = ap as number[]
  const body_ = APPEARANCE_IDS.body[bi!]
  const face = APPEARANCE_IDS.face[fi!]
  const color = APPEARANCE_IDS.color[ci!]
  const accessory = ai === 0 ? null : APPEARANCE_IDS.accessory[ai! - 1]
  if (!body_ || !face || !color || accessory === undefined) return fail('OUT_OF_RANGE')

  const readName = (): NameResult => {
    const len = need(NAME_LEN_BITS)
    if (len === null) return { kind: 'fail', reason: 'TOO_SHORT' }
    if (len > 30) return { kind: 'fail', reason: 'OUT_OF_RANGE' }
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      const b = need(8)
      if (b === null) return { kind: 'fail', reason: 'TOO_SHORT' }
      arr[i] = b
    }
    const value = utf8Decode(arr)
    return value === null ? { kind: 'fail', reason: 'OUT_OF_RANGE' } : { kind: 'ok', value }
  }
  const cname = readName()
  if (cname.kind === 'fail') return fail(cname.reason)

  const cells: CellValue[][] = []
  for (let row = 0; row < STAGE_ROWS; row++) {
    const line: CellValue[] = []
    for (let col = 0; col < STAGE_COLS; col++) {
      const v = need(1)
      if (v === null) return fail('TOO_SHORT')
      line.push(v as CellValue)
    }
    cells.push(line)
  }
  const sp = [need(5), need(4), need(5), need(4)]
  if (sp.some((v) => v === null)) return fail('TOO_SHORT')
  const [c1, r1, c2, r2] = sp as number[]
  const sname = readName()
  if (sname.kind === 'fail') return fail(sname.reason)
  // 余り（欄の後ろに、使われないビット）は、書き換えとみなす
  if (r.remaining !== 0) return fail('TOO_SHORT')

  const character = validateConfig(
    {
      schemaVersion: 1,
      name: cname.value,
      stats,
      appearance: { body: body_, face, color, accessory },
    },
    'import',
  )
  if (!character.ok) return fail('INVALID_CONFIG')
  const stage = validateStage(
    {
      schemaVersion: 1,
      name: sname.value,
      cols: STAGE_COLS,
      rows: STAGE_ROWS,
      cells,
      spawns: { p1: { col: c1, row: r1 }, p2: { col: c2, row: r2 } },
    },
    'import',
  )
  if (!stage.ok) return fail('INVALID_STAGE')
  return { ok: true, character: character.config, stage: stage.stage }
}

type NameResult = { kind: 'ok'; value: string } | { kind: 'fail'; reason: DecodeFailure }
