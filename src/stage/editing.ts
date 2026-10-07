// ステージエディタの編集の規則。純粋な関数（描画・画面から独立）。仕様: docs/04-stage/stage-editor.md §6、§10
//  - 道具: ブロック・けしごむ・1Pスタート・2Pスタート。ドラッグの規則は oc26-stage から引き継ぐ（§6.2）
//  - 置けない場所: 上の 4 行、スタート位置のセル（§6.3）
//  - もどす: 編集の状態の丸ごとの記録（最大 20）。1回のクリック・ドラッグ、ぜんぶ けす、プリセットの選び直しが、それぞれ 1 件
import { clampName } from '../fighter/naming.ts'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'
import { DEFAULT_PRESET_ID, findPreset, presetStage } from './presets.ts'
import { DEFAULT_STAGE_RULES } from './rules.ts'
import { validateStage, type StageValidationResult } from './validate.ts'

export type EditorTool = 'block' | 'eraser' | 'spawn1' | 'spawn2'

export type EditorSnapshot = {
  stage: StageData
  selectedPresetId: string | null
  dirty: boolean
}

/** 置けなかった理由（画面の隅に、短く出す） */
export type EditorNoticeCode =
  /** 上の 4 行（STAGE_TOO_HIGH を、置く前に防ぐ） */
  | 'TOP_ROWS'
  /** スタート位置のセルに、ブロックは置けない */
  | 'SPAWN_CELL'
  /** スタート位置は、ブロックのないセルに置く */
  | 'SPAWN_ON_BLOCK'
  /** 2 人のスタート位置は、別のセル */
  | 'SPAWN_SAME'

export type EditorNotice = { code: EditorNoticeCode; seq: number }

/** 1回のドラッグ。同じマスは 1 回だけ処理する（§6.2） */
export type Stroke = {
  mode: 'place' | 'erase' | 'spawn1' | 'spawn2'
  visited: ReadonlySet<number>
  /** 直前に通ったマス（速いマウスの動きで、マスが飛ばないよう、間を補う）。グリッドの外へ出たら null（戻ってきても、間を補わない） */
  last: CellPos | null
  /** この操作で、履歴に残したか（最初に変わったときに、1 件だけ残す） */
  recorded: boolean
}

export type EditorState = {
  /** 編集中の、作業用のステージ（プリセットの複製） */
  stage: StageData
  selectedPresetId: string | null
  tool: EditorTool
  history: EditorSnapshot[]
  dirty: boolean
  stroke: Stroke | null
  notice: EditorNotice | null
}

export const HISTORY_MAX = 20

export type CellPos = { col: number; row: number }

const inGrid = (c: CellPos) =>
  Number.isInteger(c.col) &&
  Number.isInteger(c.row) &&
  c.col >= 0 &&
  c.col < STAGE_COLS &&
  c.row >= 0 &&
  c.row < STAGE_ROWS

const key = (c: CellPos) => c.row * STAGE_COLS + c.col
const same = (a: CellPos, b: CellPos) => a.col === b.col && a.row === b.row

/** プリセットから変更したか（セルとスタート位置。名前は、変更に数えない） */
export function differsFromPreset(stage: StageData, presetId: string | null): boolean {
  const p = findPreset(presetId)
  if (!p) return true
  const q = p.stage
  for (let r = 0; r < STAGE_ROWS; r++) {
    for (let c = 0; c < STAGE_COLS; c++) if (stage.cells[r]![c] !== q.cells[r]![c]) return true
  }
  return !same(stage.spawns.p1, q.spawns.p1) || !same(stage.spawns.p2, q.spawns.p2)
}

export function createEditor(presetId: string = DEFAULT_PRESET_ID): EditorState {
  const id = findPreset(presetId)?.id ?? DEFAULT_PRESET_ID
  return {
    stage: presetStage(id),
    selectedPresetId: id,
    tool: 'block',
    history: [],
    dirty: false,
    stroke: null,
    notice: null,
  }
}

/** 確定したステージから、編集を始める（S05 から S04 へ戻ったとき、更新（再開）のとき）。もどすの履歴は、空 */
export function editorFromStage(stage: StageData, presetId: string | null): EditorState {
  const id = findPreset(presetId)?.id ?? null
  return {
    stage: {
      ...stage,
      cells: stage.cells.map((r) => [...r]),
      spawns: { p1: { ...stage.spawns.p1 }, p2: { ...stage.spawns.p2 } },
    },
    selectedPresetId: id,
    tool: 'block',
    history: [],
    dirty: differsFromPreset(stage, id),
    stroke: null,
    notice: null,
  }
}

const snapshotOf = (s: EditorState): EditorSnapshot => ({
  stage: s.stage,
  selectedPresetId: s.selectedPresetId,
  dirty: s.dirty,
})

/** 履歴に、いまの状態を残す（最大 20。古いものから捨てる） */
const record = (s: EditorState): EditorState => ({
  ...s,
  history: [...s.history, snapshotOf(s)].slice(-HISTORY_MAX),
})

const notice = (s: EditorState, code: EditorNoticeCode): EditorState => ({
  ...s,
  notice: { code, seq: (s.notice?.seq ?? 0) + 1 },
})

export const setTool = (s: EditorState, tool: EditorTool): EditorState =>
  s.tool === tool ? s : { ...s, tool, stroke: null }

const withCell = (stage: StageData, c: CellPos, v: CellValue): StageData => {
  const cells = stage.cells.map((row, r) =>
    r === c.row ? row.map((x, i) => (i === c.col ? v : x)) : row,
  )
  return { ...stage, cells }
}

/** 変わる操作を、1 回のドラッグにつき 1 件だけ、履歴に残して、反映する */
function commit(s: EditorState, stroke: Stroke, stage: StageData): EditorState {
  const base = stroke.recorded ? s : record(s)
  return {
    ...base,
    stage,
    dirty: differsFromPreset(stage, s.selectedPresetId),
    stroke: { ...stroke, recorded: true },
  }
}

function applyCell(s: EditorState, stroke: Stroke, c: CellPos): EditorState {
  const st = s.stage
  const has = st.cells[c.row]![c.col] === 1
  if (stroke.mode === 'place') {
    if (has) return { ...s, stroke }
    if (c.row < DEFAULT_STAGE_RULES.topEmptyRows) return notice({ ...s, stroke }, 'TOP_ROWS')
    if (same(c, st.spawns.p1) || same(c, st.spawns.p2))
      return notice({ ...s, stroke }, 'SPAWN_CELL')
    return commit(s, stroke, withCell(st, c, 1))
  }
  if (stroke.mode === 'erase') {
    return has ? commit(s, stroke, withCell(st, c, 0)) : { ...s, stroke }
  }
  // スタート位置
  const mine = stroke.mode === 'spawn1' ? 'p1' : 'p2'
  const other = mine === 'p1' ? 'p2' : 'p1'
  if (has) return notice({ ...s, stroke }, 'SPAWN_ON_BLOCK')
  if (same(c, st.spawns[other])) return notice({ ...s, stroke }, 'SPAWN_SAME')
  if (same(c, st.spawns[mine])) return { ...s, stroke }
  return commit(s, stroke, { ...st, spawns: { ...st.spawns, [mine]: { col: c.col, row: c.row } } })
}

/** ドラッグ（またはクリック）の始まり。ブロックの道具は、始めたマスのブロックの有無で、置く・消すが決まる */
export function strokeStart(s: EditorState, c: CellPos): EditorState {
  if (!inGrid(c)) return s
  const base = s.stroke ? strokeEnd(s) : s
  const has = base.stage.cells[c.row]![c.col] === 1
  const mode: Stroke['mode'] =
    base.tool === 'block'
      ? has
        ? 'erase'
        : 'place'
      : base.tool === 'eraser'
        ? 'erase'
        : base.tool === 'spawn1'
          ? 'spawn1'
          : 'spawn2'
  const stroke: Stroke = { mode, visited: new Set([key(c)]), last: c, recorded: false }
  return applyCell({ ...base, notice: base.notice }, stroke, c)
}

/** 2 つのマスの間の、通るマス（直線。始点は含まず、終点を含む） */
function lineBetween(a: CellPos, b: CellPos): CellPos[] {
  const out: CellPos[] = []
  const n = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row))
  for (let i = 1; i <= n; i++) {
    out.push({
      col: Math.round(a.col + ((b.col - a.col) * i) / n),
      row: Math.round(a.row + ((b.row - a.row) * i) / n),
    })
  }
  return out
}

/**
 * ドラッグ中、マスを通ったとき。同じマスは 1 回だけ処理する。グリッドの外は、反応しない。
 * 前のマスから離れていれば、間のマスも通ったものとして処理する
 */
export function strokeMove(s: EditorState, c: CellPos): EditorState {
  if (!s.stroke) return s
  // グリッドの外へ出たら、補う線を切る（外を回って、遠くのマスに戻っても、通っていないマスは変えない）
  if (!inGrid(c)) return s.stroke.last === null ? s : { ...s, stroke: { ...s.stroke, last: null } }
  let st = s
  for (const p of s.stroke.last ? lineBetween(s.stroke.last, c) : [c]) {
    const stroke = st.stroke
    if (!stroke) break
    const moved: Stroke = { ...stroke, last: p }
    if (stroke.visited.has(key(p))) {
      st = { ...st, stroke: moved }
      continue
    }
    st = applyCell(st, { ...moved, visited: new Set(stroke.visited).add(key(p)) }, p)
  }
  return st
}

export const strokeEnd = (s: EditorState): EditorState => (s.stroke ? { ...s, stroke: null } : s)

/** ひとつ もどす。直前の 1 回の操作を取り消す（最大 20 回前まで。やり直しは設けない） */
export function undo(s: EditorState): EditorState {
  const prev = s.history[s.history.length - 1]
  if (!prev) return s
  return {
    ...s,
    stage: prev.stage,
    selectedPresetId: prev.selectedPresetId,
    dirty: prev.dirty,
    history: s.history.slice(0, -1),
    stroke: null,
  }
}

export const canUndo = (s: EditorState) => s.history.length > 0

/** ぜんぶ けす。ブロックをすべて消す（スタート位置は残す）。1 回の操作として、もどせる */
export function clearBlocks(s: EditorState): EditorState {
  if (!s.stage.cells.some((r) => r.includes(1))) return s
  const stage: StageData = {
    ...s.stage,
    cells: s.stage.cells.map((r) => r.map((): CellValue => 0)),
  }
  return {
    ...record(s),
    stage,
    dirty: differsFromPreset(stage, s.selectedPresetId),
    stroke: null,
  }
}

/** プリセットを選ぶ。編集内容は置き換わるが、1 回の操作として履歴に残る（もどせる） */
export function selectPreset(s: EditorState, id: string): EditorState {
  const p = findPreset(id)
  if (!p) return s
  if (s.selectedPresetId === p.id && !s.dirty) return s
  return {
    ...record(s),
    stage: presetStage(p.id),
    selectedPresetId: p.id,
    dirty: false,
    stroke: null,
  }
}

/** プリセットから やりなおす。いま選んでいるプリセットの、元の状態に戻す（もどせる） */
export function resetToPreset(s: EditorState): EditorState {
  return s.selectedPresetId ? selectPreset(s, s.selectedPresetId) : s
}

/** ステージの名前。上限（10 文字・30 バイト）を超える入力は、受け付けない。履歴には残さず、もどしても変わらない */
export function setStageName(s: EditorState, raw: string): EditorState {
  const { value } = clampName(raw)
  if (value === s.stage.name) return s
  // 名前は、「もどす」の対象外。もどしても、あとから入力した名前が消えないよう、履歴の中の名前も、そろえる
  return {
    ...s,
    stage: { ...s.stage, name: value },
    history: s.history.map((h) => ({ ...h, stage: { ...h.stage, name: value } })),
  }
}

/** 編集中の検証（'editing'） */
export const editorValidation = (s: EditorState): StageValidationResult =>
  validateStage(s.stage, 'editing')

/** 「つぎへ」で確定するときの検証（'match'）。通れば、確定するステージ */
export const confirmStage = (s: EditorState): StageValidationResult =>
  validateStage(s.stage, 'match')
