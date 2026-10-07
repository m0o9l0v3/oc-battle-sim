import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { BATTLE_COLORS, messages, PLAYER_COLORS, summarizeViolations } from '../assets/index.ts'
import { STAGE_COLS, STAGE_ROWS, type StageData } from '../model/index.ts'
import {
  canUndo,
  clearBlocks,
  confirmStage,
  DEFAULT_STAGE_NAME,
  DEFAULT_STAGE_RULES,
  editorValidation,
  resetToPreset,
  selectPreset,
  setStageName,
  setTool,
  STAGE_PRESETS,
  strokeEnd,
  strokeMove,
  strokeStart,
  undo,
  type Cell,
  type EditorState,
  type EditorTool,
  type StageViolation,
} from '../stage/index.ts'
import { StageThumbnail } from './StageThumbnail.tsx'
import { Button, ChoiceCard } from './components/index.ts'

const m = messages.stageEditor
const TOOLS: EditorTool[] = ['block', 'eraser', 'spawn1', 'spawn2']

export type StageEditorScreenProps = {
  /** 編集の状態。S05 から戻ったとき、そのまま残すため、親が持つ */
  editor: EditorState
  /** setState をそのまま渡す（ドラッグで、続けて更新が来るため、更新の関数を受け取る） */
  onChange: Dispatch<SetStateAction<EditorState>>
  /** 「つぎへ」。検証（'match'）を通ったステージを渡す */
  onNext: (stage: StageData) => void
  /** 「もどる」。戻れない画面では、渡さない */
  onBack?: () => void
}

/** 入力が続いている間は、待ってから、まとめて検証する（stage-editor.md §8.1） */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

type Flash = {
  cells?: Cell[]
  part?: 'block' | 'eraser' | 'spawn1' | 'spawn2' | 'name' | 'frame' | 'presets'
}

/** 場所を持たない違反の、強調する対象（§8.5） */
function flashFor(v: StageViolation): Flash {
  if (v.cells && v.cells.length > 0) return { cells: v.cells }
  switch (v.code) {
    case 'BLOCKS_TOO_FEW':
      return { part: 'block' }
    case 'BLOCKS_TOO_MANY':
      return { part: 'eraser' }
    case 'SPAWN_MISSING':
      return { part: 'spawn1' }
    case 'NAME_TOO_LONG':
      return { part: 'name' }
    default:
      return { part: 'frame' }
  }
}

/** S04 ステージを決める（グリッドエディタ。stage-editor.md） */
export function StageEditorScreen({ editor, onChange, onNext, onBack }: StageEditorScreenProps) {
  const id = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [hiddenSeq, setHiddenSeq] = useState(0)
  const [showOutside, setShowOutside] = useState(false)

  // --- 検証（編集のたびに。待ちを置く） ---
  const stage = useDebounced(editor.stage, 200)
  const validation = useMemo(() => editorValidation({ ...editor, stage }), [stage]) // eslint-disable-line react-hooks/exhaustive-deps
  const violations = useMemo(() => (validation.ok ? [] : validation.violations), [validation])
  const summary = summarizeViolations(violations)

  // --- 置けない理由（画面の隅に、数秒） ---
  const noticeSeq = editor.notice?.seq ?? 0
  useEffect(() => {
    if (noticeSeq === 0) return
    const t = setTimeout(() => setHiddenSeq(noticeSeq), 3000)
    return () => clearTimeout(t)
  }, [noticeSeq])
  const toast = editor.notice && noticeSeq !== hiddenSeq ? m.notices[editor.notice.code] : ''

  // --- 強調（数秒、点滅） ---
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const doFlash = useCallback((f: Flash) => {
    setFlash(f)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2500)
  }, [])
  useEffect(() => () => clearTimeout(flashTimer.current), [])

  // --- マウスの位置 → マス ---
  const cellAt = (e: ReactPointerEvent<SVGSVGElement>): Cell | null => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return null
    const col = Math.floor(((e.clientX - r.left) / r.width) * STAGE_COLS)
    const row = Math.floor(((e.clientY - r.top) / r.height) * STAGE_ROWS)
    return col >= 0 && col < STAGE_COLS && row >= 0 && row < STAGE_ROWS ? { col, row } : null
  }
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const c = cellAt(e)
    if (!c || e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    onChange((s) => strokeStart(s, c))
  }
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const c = cellAt(e)
    setHover(c)
    // グリッドの外では、ドラッグの線を切る（外を回って戻っても、間のマスは変えない）
    if (e.buttons & 1) onChange((s) => strokeMove(s, c ?? { col: -1, row: -1 }))
  }
  const onUp = () => onChange((s) => strokeEnd(s))

  const spawnCells = [editor.stage.spawns.p1, editor.stage.spawns.p2]
  const violationCells = useMemo(
    () => new Set(violations.flatMap((v) => v.cells ?? []).map((c) => c.row * STAGE_COLS + c.col)),
    [violations],
  )
  const flashCells = new Set((flash?.cells ?? []).map((c) => c.row * STAGE_COLS + c.col))
  const flashPart = (p: NonNullable<Flash['part']>) => (flash?.part === p ? 'true' : undefined)

  const next = () => {
    const r = confirmStage(editor)
    if (r.ok) onNext(r.stage)
    else doFlash({ part: 'frame' }) // 通らなければ、進まず、結果の欄を強調する
  }
  const shown = summary.shown

  return (
    <div className="stage-editor">
      <header className="stage-editor__header">
        <h2 className="stage-editor__heading">{m.title}</h2>
        <div className="stage-editor__name" data-flash={flashPart('name')}>
          <label htmlFor={`${id}-name`}>{m.name}</label>
          <input
            id={`${id}-name`}
            type="text"
            value={editor.stage.name}
            placeholder={m.namePlaceholder || DEFAULT_STAGE_NAME}
            autoComplete="off"
            onChange={(e) => onChange((s) => setStageName(s, e.target.value))}
          />
          <small>{m.nameNotice}</small>
        </div>
      </header>

      <div className="stage-editor__main">
        <fieldset className="stage-editor__presets" data-flash={flashPart('presets')}>
          <legend>{m.presets}</legend>
          {STAGE_PRESETS.map((p) => {
            const checked = p.id === editor.selectedPresetId
            return (
              <ChoiceCard
                key={p.id}
                name={`${id}-preset`}
                checked={checked}
                onChange={() => onChange((s) => selectPreset(s, p.id))}
                className="stage-card stage-card--small"
              >
                <StageThumbnail stage={p.stage} width={120} />
                <span className="stage-card__name">{p.name}</span>
              </ChoiceCard>
            )
          })}
        </fieldset>

        <div className="stage-editor__work">
          <div className="stage-editor__frame" data-flash={flashPart('frame')}>
            <svg
              ref={svgRef}
              className="stage-editor__grid"
              viewBox={`0 0 ${STAGE_COLS} ${STAGE_ROWS}`}
              role="img"
              aria-label={m.gridLabel}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHover(null)}
            >
              <rect width={STAGE_COLS} height={STAGE_ROWS} fill={BATTLE_COLORS.stage} />
              {/* 上の 4 行: 置けない（薄い色） */}
              <rect
                width={STAGE_COLS}
                height={DEFAULT_STAGE_RULES.topEmptyRows}
                fill={BATTLE_COLORS.tint}
              />
              <text x={0.3} y={0.95} fontSize={0.8} fill={BATTLE_COLORS.label}>
                {m.topRows}
              </text>
              {editor.stage.cells.map((line, row) =>
                line.map((v, col) =>
                  v === 1 ? (
                    <rect
                      key={`${row}-${col}`}
                      x={col}
                      y={row}
                      width={1}
                      height={1}
                      fill={BATTLE_COLORS.block}
                      stroke={BATTLE_COLORS.blockEdge}
                      strokeWidth={0.06}
                    />
                  ) : null,
                ),
              )}
              {/* 格子線 */}
              {Array.from({ length: STAGE_COLS + 1 }, (_, c) => (
                <line
                  key={`v${c}`}
                  x1={c}
                  y1={0}
                  x2={c}
                  y2={STAGE_ROWS}
                  stroke={BATTLE_COLORS.tint}
                  strokeWidth={0.03}
                />
              ))}
              {Array.from({ length: STAGE_ROWS + 1 }, (_, r) => (
                <line
                  key={`h${r}`}
                  x1={0}
                  y1={r}
                  x2={STAGE_COLS}
                  y2={r}
                  stroke={BATTLE_COLORS.tint}
                  strokeWidth={0.03}
                />
              ))}
              {/* マウスの位置: 今のマスの枠と、道具の見本 */}
              {hover && (
                <rect
                  x={hover.col}
                  y={hover.row}
                  width={1}
                  height={1}
                  fill={
                    editor.tool === 'block' ? BATTLE_COLORS.hoverBlock : BATTLE_COLORS.tintStrong
                  }
                  stroke={BATTLE_COLORS.highlight}
                  strokeWidth={0.1}
                />
              )}
              {/* スタート位置: 色と文字（1P は青、2P は橙） */}
              {spawnCells.map((c, i) => (
                <g key={i} aria-hidden="true">
                  <circle
                    cx={c.col + 0.5}
                    cy={c.row + 0.5}
                    r={0.45}
                    fill={i === 0 ? PLAYER_COLORS.p1.bg : PLAYER_COLORS.p2.bg}
                    stroke={BATTLE_COLORS.highlight}
                    strokeWidth={0.08}
                  />
                  <text
                    x={c.col + 0.5}
                    y={c.row + 0.5}
                    fontSize={0.5}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={i === 0 ? PLAYER_COLORS.p1.text : PLAYER_COLORS.p2.text}
                  >
                    {i === 0 ? m.marker1 : m.marker2}
                  </text>
                </g>
              ))}
              {/* 違反したセル: 赤い枠と ✕（点滅は、メッセージをクリックしたとき） */}
              {[...violationCells].map((k) => {
                const col = k % STAGE_COLS
                const row = Math.floor(k / STAGE_COLS)
                return (
                  <g
                    key={`x${k}`}
                    data-flash={flashCells.has(k) ? 'true' : undefined}
                    aria-hidden="true"
                  >
                    <rect
                      x={col + 0.05}
                      y={row + 0.05}
                      width={0.9}
                      height={0.9}
                      fill="none"
                      stroke={BATTLE_COLORS.violation}
                      strokeWidth={0.12}
                    />
                    <text
                      x={col + 0.5}
                      y={row + 0.5}
                      fontSize={0.7}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={BATTLE_COLORS.violation}
                    >
                      ✕
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <p className="stage-editor__toast" role="status">
            {toast}
          </p>

          <div className="stage-editor__tools" role="radiogroup" aria-label={m.tools}>
            <span className="stage-editor__tools-label">{m.tools}:</span>
            {TOOLS.map((t) => (
              <ChoiceCard
                key={t}
                name={`${id}-tool`}
                checked={editor.tool === t}
                onChange={() => onChange((s) => setTool(s, t))}
                compact
              >
                <span data-flash={flashPart(t)}>{m.toolLabels[t]}</span>
              </ChoiceCard>
            ))}
          </div>

          <div className="stage-editor__actions">
            <Button
              variant="sub"
              disabled={!canUndo(editor)}
              onClick={() => onChange((s) => undo(s))}
            >
              {m.undo}
            </Button>
            <Button variant="sub" onClick={() => onChange((s) => clearBlocks(s))}>
              {m.clear}
            </Button>
            <Button
              variant="sub"
              disabled={!editor.selectedPresetId || !editor.dirty}
              onClick={() => onChange((s) => resetToPreset(s))}
            >
              {m.resetPreset}
            </Button>
            <button
              type="button"
              className="button button--sub"
              aria-expanded={showOutside}
              onClick={() => setShowOutside((v) => !v)}
            >
              ⓘ {m.outsideButton}
            </button>
          </div>
          {showOutside && <p className="stage-editor__outside">{m.outside}</p>}
        </div>
      </div>

      <section
        className="stage-editor__result"
        data-flash={flashPart('frame')}
        aria-label="けんさの けっか"
      >
        {validation.ok ? (
          <p className="stage-editor__ok" role="status">
            ✓ {m.usable}
          </p>
        ) : (
          <>
            <ul className="stage-editor__violations" role="status">
              {shown.map(({ violation, message }) => (
                <li key={violation.code}>
                  <button
                    type="button"
                    className="stage-editor__violation"
                    onClick={() => doFlash(flashFor(violation))}
                  >
                    ！ {message}
                  </button>
                </li>
              ))}
              {summary.others && <li>{summary.others}</li>}
            </ul>
            <button
              type="button"
              className={`button ${violations.length >= 3 ? 'button--main' : 'button--sub'}`}
              onClick={() => doFlash({ part: 'presets' })}
            >
              {m.pickPreset}
            </button>
          </>
        )}
      </section>

      <footer className="stage-editor__footer">
        {onBack ? (
          <Button variant="sub" onClick={onBack}>
            {m.back}
          </Button>
        ) : (
          <span />
        )}
        <div className="stage-editor__next">
          {!validation.ok && <p className="stage-editor__next-hint">{m.nextBlocked}</p>}
          <Button variant="main" disabled={!validation.ok} onClick={next}>
            {m.next}
          </Button>
        </div>
      </footer>
    </div>
  )
}
