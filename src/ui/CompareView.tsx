import { useState } from 'react'
import { messages } from '../assets/index.ts'
import { resolveName } from '../fighter/index.ts'
import type { MatchRecord } from '../model/index.ts'
import {
  compare,
  defaultPair,
  pickPair,
  selectCompareQuestion,
  type ComparisonView,
  type MetricDiff,
  type StatChange,
} from '../report/index.ts'
import { fmt, fmtOrDash } from './BattleReport.tsx'
import { Button } from './components/index.ts'

const m = messages.comparison
const br = messages.battleReport
const sm = messages.stat

/** 差の表示: 「＋2」「−2」「0」。差が計算できないとき（片方が「—」）は「—」。四捨五入で、0 になるときも、符号なしの 0（価値づけの記号を付けない） */
export function fmtDelta(d: number | null, digits = 0): string {
  if (d === null) return '—'
  const rounded = Number(d.toFixed(digits))
  if (rounded === 0) return '0'
  const body = Number.isInteger(rounded)
    ? String(Math.abs(rounded))
    : Math.abs(rounded).toFixed(digits)
  return `${rounded > 0 ? '＋' : '−'}${body}`
}

/** 比べる 3 つの値を、「前、あと、差」の形に */
function Row({
  label,
  diff,
  digits = 1,
  unit = '',
  strong,
}: {
  label: string
  diff: MetricDiff
  digits?: number
  unit?: string
  strong?: boolean
}) {
  const f = (n: number | null) => (n === null ? '—' : `${fmt(n, digits)}${unit}`)
  return (
    <tr className={strong ? 'compare-row compare-row--changed' : 'compare-row'}>
      <th scope="row">{label}</th>
      <td className="compare-row__pair">
        {f(diff.before)} → {f(diff.after)}
      </td>
      <td className="compare-row__delta">{fmtDelta(diff.delta, digits)}</td>
    </tr>
  )
}

function StatsTable({
  changes,
  caption,
  matchNos,
}: {
  changes: StatChange[]
  caption: string
  matchNos: [number, number]
}) {
  return (
    <table className="report-table compare-table compare-table--stats">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">{m.matchShort(matchNos[0])}</th>
          <th scope="col">
            {m.matchShort(matchNos[1])}（{m.now}）
          </th>
          <th scope="col">{m.changed}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          // 変わった行は、◆ と、強調（色だけに頼らない）
          <tr
            key={c.key}
            className={c.delta !== 0 ? 'compare-row compare-row--changed' : 'compare-row'}
          >
            <th scope="row">{sm.stats[c.key].label}</th>
            <td>{c.before}</td>
            <td>{c.after}</td>
            <td className="compare-row__delta">
              {c.delta !== 0 && <span aria-hidden="true">◆ </span>}
              {fmtDelta(c.delta)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ResultRows({ view, who }: { view: ComparisonView; who: 'p1' | 'p2' }) {
  const r = view.results
  return (
    <>
      <Row label={br.rows.dealt} diff={r.damageDealt[who]} unit="%" />
      <Row label={br.rows.taken} diff={r.damageTaken[who]} unit="%" />
      <Row label={br.rows.kos} diff={r.kos[who]} digits={0} />
      <Row label={br.rows.deaths} diff={r.deaths[who]} digits={0} />
      <Row label={br.rows.max} diff={r.maxDamageEndured[who]} unit="%" />
      <Row
        label={br.rows.recovery.split(' / ')[0] ?? ''}
        diff={r.recoverySuccess[who]}
        digits={0}
      />
      <Row
        label={br.rows.recovery.split(' / ')[1] ?? ''}
        diff={r.recoveryFailure[who]}
        digits={0}
      />
    </>
  )
}

/** しあいで みた うごき（観察の値）。試合の長さも、ここに並べる */
function ObservedRows({ view, who }: { view: ComparisonView; who: 'p1' | 'p2' }) {
  const o = view.observed
  return (
    <>
      <Row label={br.motionRows.attackPower.observed} diff={o.hitsLanded[who]} digits={0} />
      <Row label={br.motionRows.defense.observed} diff={o.avgKnockbackDistance[who]} />
      <Row
        label={br.motionRows.jumpPower.observed.split(' / ')[0] ?? ''}
        diff={o.jumps[who]}
        digits={0}
      />
      <Row label={br.motionRows.speed.observed} diff={o.moveDistance[who]} />
    </>
  )
}

const stocksText = (s: { p1: number | null; p2: number | null }) =>
  s.p1 === null || s.p2 === null
    ? '—'
    : `1P ${'●'.repeat(s.p1)}(${s.p1}) / 2P ${'●'.repeat(s.p2)}(${s.p2})`

function outcomeLine(r: MatchRecord): string {
  const { winner, reason } = r.outcome
  const head =
    winner === null
      ? messages.flow.report.draw
      : messages.flow.report.win(
          resolveName(winner === 'p1' ? r.p1Config.name : r.p2Config.name, winner),
        )
  return `${head}（${messages.flow.report.reasons[reason]}）`
}

/** 結果（③）に、違いがないか（1P の、すべての差が 0 で、勝敗も同じ） */
function resultsSame(view: ComparisonView): boolean {
  const all = [...Object.values(view.results), ...Object.values(view.observed)].map(
    (x) => x.p1.delta,
  )
  return (
    all.every((d) => d === 0 || d === null) &&
    all.some((d) => d === 0) &&
    view.left.outcome.winner === view.right.outcome.winner
  )
}

export type CompareViewProps = {
  matches: MatchRecord[]
  onRedesign: () => void
  onEnd: () => void
}

/**
 * S11 結果の比較（comparison.md）。①すうじ ②すうじの ききめ（確定）③けっか・しあいで みた うごき（観察）。
 * 結果と判断材料を、並べるだけ。原因を決めつけず、よい・わるいを判定せず、おすすめも出さない。問いかけは、1つだけ
 */
export function CompareView({ matches, onRedesign, onEnd }: CompareViewProps) {
  const initial = defaultPair(matches)
  const [sel, setSel] = useState<[number, number] | null>(initial)
  const pair = sel ? pickPair(matches, sel[0], sel[1]) : null

  const footer = (
    <footer className="flow-footer">
      <Button variant="main" onClick={onRedesign}>
        {messages.flow.compare.again}
      </Button>
      <Button onClick={onEnd}>{messages.flow.compare.finish}</Button>
    </footer>
  )

  if (!pair) {
    return (
      <div className="compare">
        <h2>{m.title}</h2>
        <p>{m.needTwo}</p>
        {footer}
      </div>
    )
  }

  const [leftRec, rightRec] = pair
  const view = compare(leftRec, rightRec)
  const nos: [number, number] = [view.left.matchNo, view.right.matchNo]
  const select = (which: 0 | 1, value: number) => {
    // 同じ戦は、2 つに選べない（選んだら、もう一方を、別の戦にする）
    const next: [number, number] = which === 0 ? [value, nos[1]] : [nos[0], value]
    if (next[0] === next[1]) return
    setSel(next)
  }
  const options = (exclude: number) =>
    matches
      .filter((x) => x.matchNo !== exclude)
      .map((x) => (
        <option key={x.matchNo} value={x.matchNo}>
          {m.matchOption(x.matchNo)}
        </option>
      ))

  const effectLabel = {
    attackPower: br.motionRows.attackPower.confirmed,
    defense: br.motionRows.defense.confirmed(60),
    jumpPower: br.motionRows.jumpPower.confirmed,
    speed: br.motionRows.speed.confirmed,
  } as const
  const unit = {
    attackPower: '%',
    defense: br.units.cell,
    jumpPower: br.units.cell,
    speed: br.units.perSec,
  } as const
  const digits = { attackPower: 2, defense: 1, jumpPower: 2, speed: 2 } as const

  const notes: string[] = []
  const n = m.notes
  if (view.notes.includes('p2_changed')) notes.push(n.p2Changed)
  if (view.notes.includes('p1_unchanged')) notes.push(n.p1Unchanged)
  if (view.notes.includes('duration_differs'))
    notes.push(n.durationDiffers(view.durationSec.before, view.durationSec.after))
  if (view.stageDiffers) notes.push(n.stageDiffers)
  if (view.appearanceDiffers.p1 || view.appearanceDiffers.p2) notes.push(n.appearanceDiffers)
  if (resultsSame(view)) notes.push(n.resultsSame)

  return (
    <div className="compare">
      <header className="compare__head">
        <h2>{m.title}</h2>
        <p className="compare__pick">
          <label>
            {m.pick}:{' '}
            <select value={nos[0]} onChange={(e) => select(0, Number(e.target.value))}>
              <option value={nos[0]}>{m.matchOption(nos[0])}</option>
              {options(nos[0]).filter((o) => Number(o.key) !== nos[1])}
            </select>
          </label>{' '}
          {m.and}{' '}
          <label>
            <select
              aria-label={m.matchOption(nos[1])}
              value={nos[1]}
              onChange={(e) => select(1, Number(e.target.value))}
            >
              <option value={nos[1]}>{m.matchOption(nos[1])}</option>
              {options(nos[1]).filter((o) => Number(o.key) !== nos[0])}
            </select>
          </label>
        </p>
        <p className="compare__same-look">
          {!view.stageDiffers && !view.appearanceDiffers.p1 && !view.appearanceDiffers.p2
            ? m.sameLook
            : ''}
        </p>
      </header>

      <div className="compare__top">
        <div className="compare__col">
          <StatsTable changes={view.p1StatChanges} caption={`1P ${m.stats}`} matchNos={nos} />
          <details className="compare__foe">
            <summary>
              {view.p2Changed && <span aria-hidden="true">◆ </span>}
              {m.foeStats}
            </summary>
            <StatsTable changes={view.p2StatChanges} caption={m.foeStats} matchNos={nos} />
          </details>
        </div>

        <div className="compare__col">
          <h3 className="compare__h">
            {m.effects} <small>{m.effectsNote}</small>
          </h3>
          {view.effects.length === 0 ? (
            <p className="compare__none">{m.effectsNone}</p>
          ) : (
            <table className="report-table compare-table">
              <tbody>
                {view.effects.map((e) => (
                  <tr key={e.key} className="compare-row">
                    <th scope="row">
                      {sm.stats[e.key].label} <span aria-hidden="true">◆</span> {fmtDelta(e.delta)}
                      <br />
                      <span className="compare__arrow">→ {effectLabel[e.key]}</span>
                    </th>
                    <td className="compare-row__delta">
                      {fmtOrDash(e.derived.before, digits[e.key])}
                      {unit[e.key]} → {fmtOrDash(e.derived.after, digits[e.key])}
                      {unit[e.key]}
                      <br />（{fmtDelta(e.derived.delta, digits[e.key])}）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="compare__results">
        <div className="compare__col">
          <h3 className="compare__h">
            {m.results} <small>{m.resultsNote}</small>
          </h3>
          <ul className="compare__outcomes">
            <li>
              {m.matchOption(nos[0])}: {outcomeLine(leftRec)} / {m.stocks}{' '}
              {stocksText(view.left.stocksLeft)}
            </li>
            <li>
              {m.matchOption(nos[1])}: {outcomeLine(rightRec)} / {m.stocks}{' '}
              {stocksText(view.right.stocksLeft)}
            </li>
          </ul>
          <div className="compare__tables">
            <table className="report-table compare-table compare-table--results">
              <thead>
                <tr>
                  <th scope="col">1P {m.results.split(' ')[0]}</th>
                  <th scope="col">
                    {nos[0]} → {nos[1]}
                  </th>
                  <th scope="col">{m.changed}</th>
                </tr>
              </thead>
              <tbody>
                <ResultRows view={view} who="p1" />
              </tbody>
            </table>
            <table className="report-table compare-table compare-table--results">
              <thead>
                <tr>
                  <th scope="col">{m.observedHead}</th>
                  <th scope="col">
                    {nos[0]} → {nos[1]}
                  </th>
                  <th scope="col">{m.changed}</th>
                </tr>
              </thead>
              <tbody>
                <ObservedRows view={view} who="p1" />
                <tr className="compare-row">
                  <th scope="row">{m.length}</th>
                  <td className="compare-row__pair">
                    {view.durationSec.before}びょう → {view.durationSec.after}びょう
                  </td>
                  <td className="compare-row__delta">
                    {fmtDelta(view.durationSec.after - view.durationSec.before)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <details className="compare__foe">
            <summary>{m.foeResults}</summary>
            <table className="report-table compare-table">
              <tbody>
                <ResultRows view={view} who="p2" />
                <ObservedRows view={view} who="p2" />
              </tbody>
            </table>
          </details>
        </div>
      </div>

      <ul className="compare__notes">
        <li>{n.resultsVary}</li>
        {notes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div className="compare__end">
        <p className="battle-report__question">{m.questions[selectCompareQuestion(view)]}</p>
        {footer}
      </div>
    </div>
  )
}
