import { messages } from '../assets/index.ts'
import { resolveName, STAT_KEYS } from '../fighter/index.ts'
import type { MatchRecord, PlayerMetrics, Stats } from '../model/index.ts'
import { confirmedMotion, REPORT_REFERENCE_DAMAGE, selectQuestion } from '../report/index.ts'
import { Button } from './components/index.ts'

const m = messages.battleReport
const sm = messages.stat

/** 数字の表示: 整数ならそのまま、そうでなければ、小数第 1 位まで（画面に出すときだけ丸める） */
export const fmt = (n: number, digits = 1): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(digits)

/** 「—」: 当てはまらない値（0 回で、平均が計算できない場合） */
export const fmtOrDash = (n: number | null, digits = 1): string =>
  n === null ? '—' : fmt(n, digits)

export const durationText = (sec: number) => m.time(Math.floor(sec / 60), Math.round(sec % 60))

/** 残りのストックの印（●が残り、○が失った分）。数字でも示す（色・形だけに頼らない） */
function Stocks({ m: metrics }: { m: PlayerMetrics }) {
  const total = metrics.stocksLeft + metrics.deaths
  return (
    <span aria-label={`${m.stocks} ${metrics.stocksLeft}`}>
      {'●'.repeat(metrics.stocksLeft)}
      {'○'.repeat(Math.max(0, total - metrics.stocksLeft))} ({metrics.stocksLeft})
    </span>
  )
}

function ResultTable({ p1, p2 }: { p1: PlayerMetrics; p2: PlayerMetrics }) {
  const rows: [string, string, string][] = [
    [
      m.rows.dealt,
      `${fmt(p1.damageDealt)}${m.units.percent}`,
      `${fmt(p2.damageDealt)}${m.units.percent}`,
    ],
    [
      m.rows.taken,
      `${fmt(p1.damageTaken)}${m.units.percent}`,
      `${fmt(p2.damageTaken)}${m.units.percent}`,
    ],
    [m.rows.kos, `${p1.kos}${m.units.times}`, `${p2.kos}${m.units.times}`],
    [m.rows.deaths, `${p1.deaths}${m.units.times}`, `${p2.deaths}${m.units.times}`],
    [
      m.rows.max,
      `${fmt(p1.maxDamageEndured)}${m.units.percent}`,
      `${fmt(p2.maxDamageEndured)}${m.units.percent}`,
    ],
    [
      m.rows.recovery,
      `${p1.recoverySuccess} / ${p1.recoveryFailure}`,
      `${p2.recoverySuccess} / ${p2.recoveryFailure}`,
    ],
  ]
  return (
    <table className="report-table">
      <caption>{m.result}</caption>
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">{m.players.p1}</th>
          <th scope="col">{m.players.p2}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{a}</td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 「すうじと うごき」: 能力値 1 つに、確定（すうじから きまる）と、観察（しあいで みた）の数字を、1 つずつ */
function MotionTable({
  stats,
  metrics,
  caption,
}: {
  stats: Stats
  metrics: PlayerMetrics
  caption: string
}) {
  const c = confirmedMotion(stats)
  const u = m.units
  const cells: Record<keyof Stats, [string, string, string, string]> = {
    attackPower: [
      m.motionRows.attackPower.confirmed,
      `${fmt(c.damagePerHit, 2)}${u.percent}`,
      m.motionRows.attackPower.observed,
      `${metrics.hitsLanded}${u.times}`,
    ],
    defense: [
      m.motionRows.defense.confirmed(REPORT_REFERENCE_DAMAGE),
      `${fmt(c.knockbackDistance)}${u.cell}`,
      m.motionRows.defense.observed,
      `${fmtOrDash(metrics.avgKnockbackDistance)}${metrics.avgKnockbackDistance === null ? '' : u.cell}`,
    ],
    jumpPower: [
      m.motionRows.jumpPower.confirmed,
      `${fmt(c.jumpHeight, 2)}${u.cell}`,
      m.motionRows.jumpPower.observed,
      `${metrics.jumps}${u.times} / ${metrics.recoverySuccess}${u.times}`,
    ],
    speed: [
      m.motionRows.speed.confirmed,
      `${fmt(c.moveSpeed, 2)}${u.perSec}`,
      m.motionRows.speed.observed,
      `${fmt(metrics.moveDistance)}${u.cell}`,
    ],
  }
  return (
    <table className="report-table report-table--motion">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col" colSpan={2}>
            {m.confirmed}
          </th>
          <th scope="col" colSpan={2}>
            {m.observed}
          </th>
        </tr>
      </thead>
      <tbody>
        {STAT_KEYS.map((k) => {
          const [cl, cv, ol, ov] = cells[k]
          return (
            <tr key={k}>
              <th scope="row">
                {sm.stats[k].label} {stats[k]}
              </th>
              <td>{cl}</td>
              <td className="report-table__num">{cv}</td>
              <td>{ol}</td>
              <td className="report-table__num">{ov}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export type BattleReportProps = {
  record: MatchRecord
  /** 直前の戦がある（2 戦目以降） */
  hasPreviousMatch: boolean
  onRedesign: () => void
  /** 親機の進行で、再戦（S09 へ）に進めない理由 */
  redesignBlocked?: string
}

/**
 * S08 Battle Report（battle-report.md §7）。勝敗と、振り返りの指標、そのとき使った能力値。
 * 結果と判断材料を、事実として示す。評価（よい・わるい）、点数・順位、改善の指示は、出さない。問いかけは、1つだけ
 */
export function BattleReport({
  record,
  hasPreviousMatch,
  onRedesign,
  redesignBlocked,
}: BattleReportProps) {
  const { p1, p2 } = record
  const outcome = outcomeLine(record)
  return (
    <div className="battle-report">
      <header className="battle-report__head">
        <h2>{messages.flow.report.title(record.matchNo)}</h2>
        <p className="battle-report__outcome" role="status">
          {outcome}
        </p>
      </header>

      {p1 && p2 ? (
        <>
          <p className="battle-report__meta">
            {m.stocks}: {m.players.p1} <Stocks m={p1} /> {m.players.p2} <Stocks m={p2} />{' '}
            {durationText(record.durationSec)}
          </p>
          <div className="battle-report__body">
            <ResultTable p1={p1} p2={p2} />
            <div className="battle-report__motion">
              <MotionTable
                stats={record.p1Config.stats}
                metrics={p1}
                caption={`${m.motion}（${m.motionYours}）`}
              />
              <details className="battle-report__foe">
                <summary>{m.foeMotion}</summary>
                <MotionTable stats={record.p2Config.stats} metrics={p2} caption={m.foeMotion} />
              </details>
            </div>
          </div>
          {(p1.selfKos > 0 || p2.selfKos > 0) && (
            <p className="battle-report__note">
              {p1.selfKos > 0 && `${m.players.p1} ${m.selfKos(p1.selfKos)} `}
              {p2.selfKos > 0 && `${m.players.p2} ${m.selfKos(p2.selfKos)}`}
            </p>
          )}
          <p className="battle-report__question">
            {m.questions[selectQuestion(p1, hasPreviousMatch)]}
          </p>
        </>
      ) : (
        <>
          <p>{m.noMetrics}</p>
          <StatsOnly record={record} />
        </>
      )}

      <footer className="battle-report__footer">
        <Button
          variant="main"
          onClick={onRedesign}
          disabled={!!redesignBlocked}
          reason={redesignBlocked ?? ''}
        >
          {m.redesign}
        </Button>
      </footer>
    </div>
  )
}

/** 指標がない戦の記録（指標の記録ができる前の保存）でも、使った能力値は、見られる */
function StatsOnly({ record }: { record: MatchRecord }) {
  return (
    <div className="prep__players">
      {(
        [
          ['p1', record.p1Config],
          ['p2', record.p2Config],
        ] as const
      ).map(([slot, cfg]) => (
        <section key={slot}>
          <h3>
            {m.players[slot]} {resolveName(cfg.name, slot)}（{m.usedStats}）
          </h3>
          <ul className="practice__stats">
            {STAT_KEYS.map((k) => (
              <li key={k}>
                <span>{sm.stats[k].label}</span>
                <b>{cfg.stats[k]}</b>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

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
