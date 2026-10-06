// 名前の入力の規則（S02）。docs/02-fighter/character-design.md §9.3、character-config.md §5.5
// 10 文字（コードポイント）以内、かつ UTF-8 で 30 バイト以内。入力の段階で、両方を守らせる
// （上限を超えた名前が、対戦の開始や持ち帰りで、NAME_TOO_LONG になることがないようにする）。
import { NAME_MAX_BYTES, NAME_MAX_CODEPOINTS, isNameWithinLimit, normalizeName } from './config.ts'

const utf8Length = (s: string) => new TextEncoder().encode(s).length

export type NameLimit = 'chars' | 'bytes'

export type ClampedName = {
  value: string
  /** 入力を切った理由。切っていなければ null */
  limitedBy: NameLimit | null
}

/**
 * 入力された名前を、上限に収める。上限を超えるぶんは、後ろから受け付けない。
 * 制御文字は取り除く。空白・正規化は、入力の途中では触らない（確定のとき normalizeName）
 */
export function clampName(input: string): ClampedName {
  const chars = [...input.replace(/\p{Cc}/gu, '')]
  let value = ''
  let bytes = 0
  let count = 0
  for (const ch of chars) {
    const b = utf8Length(ch)
    if (count + 1 > NAME_MAX_CODEPOINTS) return { value, limitedBy: 'chars' }
    if (bytes + b > NAME_MAX_BYTES) return { value, limitedBy: 'bytes' }
    // そろえたあとの名前でも、上限内であること（正規化で長さが変わる文字への備え）
    if (!isNameWithinLimit(normalizeName(value + ch))) return { value, limitedBy: 'bytes' }
    value += ch
    bytes += b
    count += 1
  }
  return { value, limitedBy: null }
}

/**
 * あと何文字、入力できるか（表示用）。文字の種類で、変わる。
 * 日本語（3 バイト）を入れる前提で数える。ASCII だけなら、表示より多く入ることがある
 */
export function nameRemaining(value: string): number {
  const cp = [...value].length
  const left = NAME_MAX_BYTES - utf8Length(value)
  return Math.max(0, Math.min(NAME_MAX_CODEPOINTS - cp, Math.floor(left / 3)))
}

/** バイト数のために、10 文字より早く止まったか（絵文字など。短い説明を出す） */
export const stoppedEarlyByBytes = (value: string, limitedBy: NameLimit | null): boolean =>
  limitedBy === 'bytes' && [...value].length < NAME_MAX_CODEPOINTS
