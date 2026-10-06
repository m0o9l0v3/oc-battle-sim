// ステージの検証。例外を投げず、決定的（乱数・時計なし）。仕様: docs/04-stage/validation.md §4〜§7
import { isNameWithinLimit, normalizeName } from '../fighter/config.ts'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'
import {
  findPlatforms,
  isBlock,
  mainPlatform,
  platformCells,
  unreachableCells,
  type Cell,
} from './analysis.ts'
import { DEFAULT_STAGE_RULES, SUPPORTED_STAGE_SCHEMA_VERSION, type StageRules } from './rules.ts'

export type StageViolationCode =
  | 'MALFORMED'
  | 'SCHEMA_UNSUPPORTED'
  | 'BLOCKS_TOO_FEW'
  | 'BLOCKS_TOO_MANY'
  | 'MAIN_PLATFORM_NARROW'
  | 'PLATFORM_TOO_NARROW'
  | 'STAGE_TOO_HIGH'
  | 'SPAWN_MISSING'
  | 'SPAWN_OUT_OF_RANGE'
  | 'SPAWN_BLOCKED'
  | 'SPAWN_NO_GROUND'
  | 'SPAWN_TOO_CLOSE'
  | 'UNREACHABLE'
  | 'NAME_TOO_LONG'

export type StageViolation = {
  code: StageViolationCode
  /** 強調するセル（エディタで示す） */
  cells?: Cell[]
  /** 数値（あと何個、など）。BLOCKS_TOO_FEW は足りない数、BLOCKS_TOO_MANY は多い数 */
  detail?: number
}

/** 'editing': 編集中（案内として使う）／ 'match': 対戦開始 ／ 'import': 外部からの読み込み（版も確かめる） */
export type StageValidationMode = 'editing' | 'match' | 'import'

export type StageValidationResult =
  { ok: true; stage: StageData } | { ok: false; violations: StageViolation[] }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const malformed = (): StageValidationResult => ({ ok: false, violations: [{ code: 'MALFORMED' }] })

export function validateStage(
  stage: unknown,
  mode: StageValidationMode,
  rules: StageRules = DEFAULT_STAGE_RULES,
): StageValidationResult {
  try {
    return validate(stage, mode, rules)
  } catch {
    // getter が例外を投げる、など。失敗として返す
    return malformed()
  }
}

type SpawnRead = { kind: 'missing' } | { kind: 'ok'; col: number; row: number }

function readSpawn(v: unknown): SpawnRead | 'malformed' {
  if (v === undefined || v === null) return { kind: 'missing' }
  if (!isRecord(v)) return 'malformed'
  const { col, row } = v
  if (typeof col !== 'number' || typeof row !== 'number') return 'malformed'
  if (!Number.isInteger(col) || !Number.isInteger(row)) return 'malformed'
  return { kind: 'ok', col, row }
}

function validate(
  input: unknown,
  mode: StageValidationMode,
  rules: StageRules,
): StageValidationResult {
  // --- 1. 型・値の検査（先に行う。通ったものだけを、ほかの規則で調べる） ---
  if (!isRecord(input)) return malformed()
  const version = input.schemaVersion
  if (typeof version !== 'number') return malformed()
  if (typeof input.name !== 'string') return malformed()
  if (input.cols !== STAGE_COLS || input.rows !== STAGE_ROWS) return malformed()
  if (!Array.isArray(input.cells) || input.cells.length !== STAGE_ROWS) return malformed()
  const cells: CellValue[][] = []
  for (const row of input.cells as unknown[]) {
    if (!Array.isArray(row) || row.length !== STAGE_COLS) return malformed()
    const out: CellValue[] = []
    for (const v of row as unknown[]) {
      if (v !== 0 && v !== 1) return malformed()
      out.push(v)
    }
    cells.push(out)
  }
  if (!isRecord(input.spawns)) return malformed()
  const p1 = readSpawn(input.spawns.p1)
  const p2 = readSpawn(input.spawns.p2)
  if (p1 === 'malformed' || p2 === 'malformed') return malformed()
  if (mode === 'import' && version !== SUPPORTED_STAGE_SCHEMA_VERSION) {
    return { ok: false, violations: [{ code: 'SCHEMA_UNSUPPORTED' }] }
  }

  // --- 2. 規則 ---
  const v: StageViolation[] = []

  // スポーン
  const spawns: Cell[] = []
  if (p1.kind === 'missing' || p2.kind === 'missing') v.push({ code: 'SPAWN_MISSING' })
  const inRange: Cell[] = []
  const outOfRange: Cell[] = []
  for (const s of [p1, p2]) {
    if (s.kind !== 'ok') continue
    spawns.push({ col: s.col, row: s.row })
    const inside = s.col >= 0 && s.col < STAGE_COLS && s.row >= 0 && s.row < STAGE_ROWS
    ;(inside ? inRange : outOfRange).push({ col: s.col, row: s.row })
  }
  if (outOfRange.length > 0) v.push({ code: 'SPAWN_OUT_OF_RANGE', cells: outOfRange })
  // 範囲内であることを確かめたあとにだけ、セルを参照する
  const blocked: Cell[] = []
  const noGround: Cell[] = []
  for (const s of inRange) {
    for (let r = s.row; r >= s.row - rules.spawnHeadroom; r--) {
      if (isBlock(cells, s.col, r)) blocked.push({ col: s.col, row: r })
    }
    if (!isBlock(cells, s.col, s.row + 1)) noGround.push(s)
  }
  if (blocked.length > 0) v.push({ code: 'SPAWN_BLOCKED', cells: blocked })
  if (noGround.length > 0) v.push({ code: 'SPAWN_NO_GROUND', cells: noGround })
  if (
    p1.kind === 'ok' &&
    p2.kind === 'ok' &&
    Math.abs(p1.col - p2.col) < rules.spawnMinColDistance
  ) {
    v.push({ code: 'SPAWN_TOO_CLOSE', cells: spawns })
  }

  // 足場
  const platforms = findPlatforms(cells)
  const unreachable = unreachableCells(cells, rules)
  if (unreachable.length > 0) v.push({ code: 'UNREACHABLE', cells: unreachable })
  const narrow = platforms.filter((p) => p.width < rules.platformMin)
  if (narrow.length > 0) {
    v.push({ code: 'PLATFORM_TOO_NARROW', cells: narrow.flatMap(platformCells) })
  }
  const main = mainPlatform(platforms)
  if (!main || main.width < rules.mainPlatformMin) {
    v.push({ code: 'MAIN_PLATFORM_NARROW', cells: main ? platformCells(main) : [] })
  }

  // 高さ・ブロックの数
  const high: Cell[] = []
  let blocks = 0
  for (let row = 0; row < STAGE_ROWS; row++) {
    for (let col = 0; col < STAGE_COLS; col++) {
      if (cells[row]![col] !== 1) continue
      blocks++
      if (row < rules.topEmptyRows) high.push({ col, row })
    }
  }
  if (high.length > 0) v.push({ code: 'STAGE_TOO_HIGH', cells: high })
  if (blocks < rules.blocksMin) v.push({ code: 'BLOCKS_TOO_FEW', detail: rules.blocksMin - blocks })
  if (blocks > rules.blocksMax)
    v.push({ code: 'BLOCKS_TOO_MANY', detail: blocks - rules.blocksMax })

  // 名前
  const name = normalizeName(input.name)
  if (!isNameWithinLimit(name)) v.push({ code: 'NAME_TOO_LONG' })

  if (v.length > 0 || p1.kind !== 'ok' || p2.kind !== 'ok') return { ok: false, violations: v }
  return {
    ok: true,
    stage: {
      schemaVersion: 1,
      name,
      cols: STAGE_COLS,
      rows: STAGE_ROWS,
      cells: cells.map((r) => [...r]),
      spawns: { p1: { col: p1.col, row: p1.row }, p2: { col: p2.col, row: p2.row } },
    },
  }
}

/** 検証を通るか（対戦を始められるか） */
export const isValidStage = (stage: unknown, mode: StageValidationMode = 'match'): boolean =>
  validateStage(stage, mode).ok
