// ファイター設定（CharacterConfig）の検証・標準設定・変更の判定。
// 仕様: docs/02-fighter/character-config.md、stat-system.md §5、character-design.md §5.1.1
// 参加者向けのメッセージは、エラーのコードから、画面側の設定ファイルで日本語にする（ここには書かない）。
import type { Appearance, CharacterConfig, PlayerSlot, Stats } from '../model/index.ts'

// --- ポイント制（stat-system.md §5.1） ---
export const STAT_MIN = 2
export const STAT_MAX = 8
export const TOTAL_POINTS = 20
export const STAT_KEYS = [
  'attackPower',
  'defense',
  'jumpPower',
  'speed',
] as const satisfies readonly (keyof Stats)[]

// --- 名前（character-config.md §5.5） ---
export const NAME_MAX_CODEPOINTS = 10
export const NAME_MAX_BYTES = 30

/** 読み込める形式の版 */
export const SUPPORTED_SCHEMA_VERSION = 1

/** 許可する外観のID。これ以外は APPEARANCE_UNKNOWN（character-design.md §5.1.1） */
export const APPEARANCE_IDS = {
  body: ['b1', 'b2', 'b3', 'b4'],
  face: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
  color: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
  accessory: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], // このほかに null（付けない）
} as const

// --- 標準値（character-config.md §7） ---
export const DEFAULT_STATS: Readonly<Stats> = Object.freeze({
  attackPower: 5,
  defense: 5,
  jumpPower: 5,
  speed: 5,
})

export const DEFAULT_NAMES: Record<PlayerSlot, string> = { p1: 'ファイター', p2: 'あいて' }

const DEFAULT_APPEARANCE: Record<PlayerSlot, Appearance> = {
  p1: { body: 'b1', face: 'f1', color: 'c1', accessory: null },
  p2: { body: 'b1', face: 'f2', color: 'c2', accessory: null },
}

/** 標準の設定（5/5/5/5。外観と名前は、プレイヤーごとの初期値）を作る。呼ぶたびに新しいオブジェクト */
export function createDefaultConfig(player: PlayerSlot): CharacterConfig {
  return {
    schemaVersion: 1,
    name: DEFAULT_NAMES[player],
    stats: { ...DEFAULT_STATS },
    appearance: { ...DEFAULT_APPEARANCE[player] },
  }
}

/** 「標準設定に戻す」: 能力値だけを標準に戻す。外観と名前は変えない */
export function resetStats(config: CharacterConfig): CharacterConfig {
  return { ...config, stats: { ...DEFAULT_STATS }, appearance: { ...config.appearance } }
}

// --- 検証 ---

/** 'editing': 編集中（1項目ごとの範囲。合計の過不足は許す）／ 'match': 対戦開始 ／ 'import': 外部からの読み込み */
export type ValidationMode = 'editing' | 'match' | 'import'

export type ValidationErrorCode =
  | 'STAT_NOT_INTEGER'
  | 'STAT_OUT_OF_RANGE'
  | 'POINT_TOTAL_NOT_20'
  | 'NAME_TOO_LONG'
  | 'APPEARANCE_UNKNOWN'
  | 'SCHEMA_UNSUPPORTED'
  | 'MALFORMED'

export type ValidationError = {
  code: ValidationErrorCode
  /** 場所。例: 'stats.speed'、'name'、'appearance.body'、'schemaVersion'、''（全体） */
  field: string
}

export type ValidationResult =
  { ok: true; config: CharacterConfig } | { ok: false; errors: ValidationError[] }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const utf8Length = (s: string) => new TextEncoder().encode(s).length

/**
 * 名前をそろえる: 制御文字を取り除き、NFC に正規化し、前後の空白を取り除く。
 * （絵文字の結合に使うゼロ幅接合子などは、制御文字ではないので、残る）
 */
export function normalizeName(name: string): string {
  return name
    .replace(/\p{Cc}/gu, '')
    .normalize('NFC')
    .trim()
}

/** 名前の長さ（コードポイント数とバイト数）が、上限内か。そろえたあとの名前で調べる */
export function isNameWithinLimit(normalized: string): boolean {
  return [...normalized].length <= NAME_MAX_CODEPOINTS && utf8Length(normalized) <= NAME_MAX_BYTES
}

/** 未入力（空）のときは、プレイヤーごとのデフォルト名にする */
export const resolveName = (name: string, player: PlayerSlot): string =>
  normalizeName(name) === '' ? DEFAULT_NAMES[player] : normalizeName(name)

/** 使い切っていない（または超えた）ポイント。正: あと何ポイント使えるか、負: 何ポイント超えたか */
export const remainingPoints = (stats: Stats): number =>
  TOTAL_POINTS - STAT_KEYS.reduce((sum, k) => sum + stats[k], 0)

/**
 * 設定を検証する。例外を投げず、不正な入力でも `ok: false` を返す。すべての違反を返す。
 * 成功したときの config は、**新しいオブジェクト**（名前はそろえたもの。余分な項目は含めない）。
 */
export function validateConfig(config: unknown, mode: ValidationMode): ValidationResult {
  try {
    return validate(config, mode)
  } catch {
    // getter が例外を投げる、など。検証は、失敗として返す
    return { ok: false, errors: [{ code: 'MALFORMED', field: '' }] }
  }
}

function validate(config: unknown, mode: ValidationMode): ValidationResult {
  const errors: ValidationError[] = []
  const add = (code: ValidationErrorCode, field: string) => errors.push({ code, field })

  if (!isRecord(config)) return { ok: false, errors: [{ code: 'MALFORMED', field: '' }] }

  // 形式の版（読み込みのときだけ）
  if (mode === 'import') {
    const v = config.schemaVersion
    if (typeof v !== 'number') add('MALFORMED', 'schemaVersion')
    else if (v !== SUPPORTED_SCHEMA_VERSION) add('SCHEMA_UNSUPPORTED', 'schemaVersion')
  }

  // 名前
  let name = ''
  if (typeof config.name !== 'string') add('MALFORMED', 'name')
  else {
    name = normalizeName(config.name)
    if (!isNameWithinLimit(name)) add('NAME_TOO_LONG', 'name')
  }

  // 能力値
  const stats: Partial<Stats> = {}
  let allNumbers = true
  if (!isRecord(config.stats)) {
    add('MALFORMED', 'stats')
    allNumbers = false
  } else {
    for (const key of STAT_KEYS) {
      const v = config.stats[key]
      if (typeof v !== 'number') {
        add('MALFORMED', `stats.${key}`)
        allNumbers = false
      } else {
        stats[key] = v
        if (!Number.isInteger(v)) {
          add('STAT_NOT_INTEGER', `stats.${key}`)
          allNumbers = false
        } else if (v < STAT_MIN || v > STAT_MAX) add('STAT_OUT_OF_RANGE', `stats.${key}`)
      }
    }
  }
  // 合計（対戦開始・読み込み）。4つとも整数のときだけ調べる（合計が意味を持たないため）
  if (mode !== 'editing' && allNumbers) {
    const sum = STAT_KEYS.reduce((s, k) => s + (stats[k] as number), 0)
    if (sum !== TOTAL_POINTS) add('POINT_TOTAL_NOT_20', 'stats')
  }

  // 外観
  const appearance: Partial<Appearance> = {}
  if (!isRecord(config.appearance)) add('MALFORMED', 'appearance')
  else {
    for (const key of ['body', 'face', 'color'] as const) {
      const v = config.appearance[key]
      if (typeof v !== 'string') add('MALFORMED', `appearance.${key}`)
      else if (!(APPEARANCE_IDS[key] as readonly string[]).includes(v)) {
        add('APPEARANCE_UNKNOWN', `appearance.${key}`)
      } else appearance[key] = v
    }
    const acc = config.appearance.accessory
    if (acc === null) appearance.accessory = null
    else if (typeof acc !== 'string') add('MALFORMED', 'appearance.accessory')
    else if (!(APPEARANCE_IDS.accessory as readonly string[]).includes(acc)) {
      add('APPEARANCE_UNKNOWN', 'appearance.accessory')
    } else appearance.accessory = acc
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    config: {
      schemaVersion: 1,
      name,
      stats: { ...(stats as Stats) },
      appearance: { ...(appearance as Appearance) },
    },
  }
}

/** 対戦を始められるか（対戦開始の検証を通るか）。通らないときは、始められない */
export const canStartMatch = (config: unknown): boolean => validateConfig(config, 'match').ok

// --- 変更の判定（character-config.md §6.1） ---

export type StatChange = { key: keyof Stats; before: number; after: number }

/** 値が違う能力値だけを返す（比較画面で、変更点を示すために使う） */
export function statsDiff(before: Stats, after: Stats): StatChange[] {
  return STAT_KEYS.filter((k) => before[k] !== after[k]).map((key) => ({
    key,
    before: before[key],
    after: after[key],
  }))
}

/** 能力値が1つでも変わったか（S09 から再戦に進めるかの判定）。外観・名前の違いは含めない */
export const hasStatChange = (before: Stats, after: Stats): boolean =>
  statsDiff(before, after).length > 0
