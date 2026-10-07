// S01・S06〜S12 の画面。ファイター作成（S02・S03）、ステージ（S04）、試し動かし（S05）は、それぞれの部品。
// S08（Battle Report）・S11（結果の比較）・S12 の持ち帰り QR は、#38・#39・#61 で、本格的なものに置き換える。
// ここは、MVP の流れを、最初から最後まで通せるようにするための、最小の画面
import { useCallback, useState } from 'react'
import { messages } from '../assets/index.ts'
import { resolveName, STAT_KEYS } from '../fighter/index.ts'
import { DEFAULT_BINDINGS } from '../input/index.ts'
import type { CharacterConfig, MatchRecord, Stats } from '../model/index.ts'
import { canRematch, statsChanged, type Session } from '../session/index.ts'
import { keysLabel } from './keyLabels.ts'
import { MatchCanvas, type MatchHud } from './MatchCanvas.tsx'
import { StatEditor } from './StatEditor.tsx'
import { statPercent } from './statView.ts'

const m = messages.flow
const sm = messages.stat

/** 段階の表示（ui-design.md §4）。5 つの段階の、いまの段階を強調する */
export function StepBar({ screen }: { screen: Session['data']['screen'] }) {
  const index = {
    S02: 0,
    S03: 0,
    S04: 1,
    S05: 2,
    S06: 3,
    S07: 3,
    S08: 4,
    S09: 4,
    S10: 3,
    S11: 4,
    S12: 4,
  }[screen as Exclude<typeof screen, 'S01'>]
  if (index === undefined) return null
  return (
    <ol className="step-bar" aria-label="すすみぐあい">
      {m.steps.map((label, i) => (
        <li key={label} aria-current={i === index ? 'step' : undefined} data-current={i === index}>
          {i === index ? '▶ ' : ''}
          {label}
        </li>
      ))}
    </ol>
  )
}

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flow-start">
      <h1>{m.start.title}</h1>
      <p className="flow-start__lead">{m.start.lead}</p>
      <ol className="flow-start__steps">
        {m.start.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <button type="button" className="button button--main" onClick={onStart}>
        {m.start.begin}
      </button>
    </div>
  )
}

const OPERATIONS = ['left', 'right', 'jump', 'attack'] as const

function StatSummary({ stats }: { stats: Stats }) {
  return (
    <ul className="practice__stats">
      {STAT_KEYS.map((key) => (
        <li key={key}>
          <span>{sm.stats[key].label}</span>
          <b>{stats[key]}</b>
          <span className="practice__effect">
            {sm.stats[key].effect} {statPercent(key, stats[key])}%
          </span>
        </li>
      ))}
    </ul>
  )
}

/** S06 対戦の準備（ui-design.md §7.6）。2 人のキー配置と、2P の能力値（標準で始まる。変えられる） */
export function PrepScreen({
  p1,
  p2,
  onChangeP2,
  onStart,
  onBack,
}: {
  p1: CharacterConfig
  p2: CharacterConfig
  onChangeP2: (c: CharacterConfig) => void
  onStart: () => void
  onBack: () => void
}) {
  const [open, setOpen] = useState(false)
  const sum = STAT_KEYS.reduce((t, k) => t + p2.stats[k], 0)
  const ready = sum === 20
  return (
    <div className="prep">
      <h2>{m.prep.title}</h2>
      <p>{m.prep.keysNote}</p>
      <div className="prep__players">
        {(
          [
            ['p1', m.prep.you, p1],
            ['p2', m.prep.foe, p2],
          ] as const
        ).map(([slot, label, cfg]) => (
          <section key={slot} className="prep__player" aria-labelledby={`prep-${slot}`}>
            <h3 id={`prep-${slot}`}>
              {label}: {resolveName(cfg.name, slot)}
            </h3>
            <dl className="practice__keys">
              {OPERATIONS.map((op) => (
                <div key={op} className="practice__key-row">
                  <dt>{messages.practice[op]}</dt>
                  <dd>
                    <kbd>{keysLabel(DEFAULT_BINDINGS[slot][op])}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <StatSummary stats={cfg.stats} />
            {slot === 'p2' && <p className="practice__note">{m.prep.foeNote}</p>}
          </section>
        ))}
      </div>
      {open ? (
        <div className="prep__edit">
          <StatEditor
            stats={p2.stats}
            onChange={(stats) => onChangeP2({ ...p2, stats })}
            heading={m.prep.foe}
          />
          <button
            type="button"
            className="button button--sub"
            disabled={!ready}
            onClick={() => setOpen(false)}
          >
            {m.prep.closeFoe}
          </button>
        </div>
      ) : (
        <button type="button" className="button button--sub" onClick={() => setOpen(true)}>
          {m.prep.changeFoe}
        </button>
      )}
      <footer className="flow-footer">
        <button type="button" className="button button--sub" onClick={onBack}>
          {messages.stat.back}
        </button>
        <button type="button" className="button button--main" disabled={!ready} onClick={onStart}>
          {m.prep.start}
        </button>
      </footer>
    </div>
  )
}

/** S07・S10 対戦。勝敗が確定したら、自動で次へ進む（user-flow.md §5.7） */
export function MatchScreen({
  matchNo,
  setup,
  onFinish,
}: {
  matchNo: number
  setup: NonNullable<Session['current']>
  onFinish: (r: Parameters<React.ComponentProps<typeof MatchCanvas>['onFinish']>[0]) => void
}) {
  const [hud, setHud] = useState<MatchHud | null>(null)
  const onHud = useCallback((h: MatchHud) => setHud(h), [])
  const { p1, p2 } = setup
  return (
    <div className="match">
      <h2>{m.match.title(matchNo)}</h2>
      <div className="match__hud" role="status">
        {hud?.phase === 'ready' ? (
          <b>{m.match.ready}</b>
        ) : (
          hud && <b>{m.match.time(hud.timeLeftSec)}</b>
        )}
        {([p1, p2] as const).map((c, i) => (
          <span key={i} className="match__player">
            {i === 0 ? '1P' : '2P'} {resolveName(c.name, i === 0 ? 'p1' : 'p2')}:{' '}
            {hud ? `${m.match.stocks(hud.stocks[i]!)} ${m.match.damage(hud.damage[i]!)}` : ''}
          </span>
        ))}
      </div>
      <div className="match__stage">
        <MatchCanvas p1={p1} p2={p2} stage={setup.stage} onHud={onHud} onFinish={onFinish} />
      </div>
    </div>
  )
}

function outcomeText(r: MatchRecord): string {
  const { winner, reason } = r.outcome
  const head =
    winner === null
      ? m.report.draw
      : m.report.win(resolveName(winner === 'p1' ? r.p1Config.name : r.p2Config.name, winner))
  return `${head}（${m.report.reasons[reason]}）`
}

/** S08 Battle Report（最小。本格的なレポートは #38） */
export function ReportScreen({
  record,
  onRedesign,
}: {
  record: MatchRecord
  onRedesign: () => void
}) {
  return (
    <div className="report">
      <h2>{m.report.title(record.matchNo)}</h2>
      <p className="report__outcome" role="status">
        {outcomeText(record)}
      </p>
      <h3>{m.report.used}</h3>
      <div className="prep__players">
        <section>
          <h4>1P {resolveName(record.p1Config.name, 'p1')}</h4>
          <StatSummary stats={record.p1Config.stats} />
        </section>
        <section>
          <h4>2P {resolveName(record.p2Config.name, 'p2')}</h4>
          <StatSummary stats={record.p2Config.stats} />
        </section>
      </div>
      <p className="practice__note">{m.report.note}</p>
      <button type="button" className="button button--main" onClick={onRedesign}>
        {m.report.redesign}
      </button>
    </div>
  )
}

/** S09 設定を変えて作り直す。直前の戦の値（まえ）を見ながら、能力値だけを変える */
export function RedesignScreen({
  session,
  onChangeP1,
  onChangeP2,
  onRematch,
  onBack,
}: {
  session: Session
  onChangeP1: (c: CharacterConfig) => void
  onChangeP2: (c: CharacterConfig) => void
  onRematch: () => void
  onBack: () => void
}) {
  const { p1, p2 } = session.data
  const last = session.data.matches.at(-1)
  const [foeOpen, setFoeOpen] = useState(false)
  const changed = !!last && statsChanged(p1, last.p1Config)
  const ok = canRematch(session)
  return (
    <div className="redesign">
      <h2>{m.redesign.title}</h2>
      {last && (
        <p className="practice__note">
          {m.redesign.before}:{' '}
          {STAT_KEYS.map((k) => `${sm.stats[k].label} ${last.p1Config.stats[k]}`).join(' / ')}
        </p>
      )}
      <StatEditor
        stats={p1.stats}
        onChange={(stats) => onChangeP1({ ...p1, stats })}
        heading="1P"
      />
      {foeOpen ? (
        <>
          <p className="practice__note">{m.redesign.foe}</p>
          <StatEditor
            stats={p2.stats}
            onChange={(stats) => onChangeP2({ ...p2, stats })}
            heading="2P"
          />
        </>
      ) : (
        <button type="button" className="button button--sub" onClick={() => setFoeOpen(true)}>
          {m.prep.changeFoe}
        </button>
      )}
      <footer className="flow-footer">
        <button type="button" className="button button--sub" onClick={onBack}>
          {m.redesign.back}
        </button>
        <div className="stat-screen__next">
          {/* 押せない理由は、ボタンの近くに出す */}
          <p className="stat-screen__reason" role="status">
            {!changed ? m.redesign.mustChange : ''}
          </p>
          <button type="button" className="button button--main" disabled={!ok} onClick={onRematch}>
            {m.redesign.rematch}
          </button>
        </div>
      </footer>
    </div>
  )
}

/** S11 結果の比較（最小。本格的な比較は #39） */
export function CompareScreen({
  matches,
  onRedesign,
  onEnd,
}: {
  matches: MatchRecord[]
  onRedesign: () => void
  onEnd: () => void
}) {
  return (
    <div className="compare">
      <h2>{m.compare.title}</h2>
      <table className="compare__table">
        <thead>
          <tr>
            <th scope="col" />
            {STAT_KEYS.map((k) => (
              <th key={k} scope="col">
                {sm.stats[k].label}
              </th>
            ))}
            <th scope="col">{m.report.used}</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((r) => (
            <tr key={r.matchNo}>
              <th scope="row">{m.compare.match(r.matchNo)}</th>
              {STAT_KEYS.map((k) => (
                <td key={k}>{r.p1Config.stats[k]}</td>
              ))}
              <td>{outcomeText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="practice__note">{m.compare.note}</p>
      <footer className="flow-footer">
        <button type="button" className="button button--main" onClick={onRedesign}>
          {m.compare.again}
        </button>
        <button type="button" className="button button--sub" onClick={onEnd}>
          {m.compare.finish}
        </button>
      </footer>
    </div>
  )
}

/** S12 おわり（最小。持ち帰り QR は #61）。見た目・能力値・ステージは、リセットまで保持する */
export function EndScreen({ session, onReset }: { session: Session; onReset: () => void }) {
  const { p1, stage } = session.data
  return (
    <div className="end">
      <h2>{m.end.title}</h2>
      <p>{m.end.lead}</p>
      <section>
        <h3>
          {m.end.yours}: {resolveName(p1.name, 'p1')}
        </h3>
        <StatSummary stats={p1.stats} />
        <p className="practice__note">{stage.name}</p>
      </section>
      <p className="practice__note">{m.end.qrNote}</p>
      <button type="button" className="button button--sub" onClick={onReset}>
        {m.end.reset}
      </button>
    </div>
  )
}
