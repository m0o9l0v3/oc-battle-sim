// 簡易CPUとの対戦（PC。持ち帰りのあと、1 人で遊ぶ）。docs/03-combat/cpu-opponent.md §9
// 1P はキーボード（1P の配置）、2P は簡易CPU。対戦のルールは、会場の対戦と同じ（DEFAULT_MATCH_RULES）
import { useCallback, useState } from 'react'
import { messages } from '../assets/index.ts'
import { CPU_LEVELS, DEFAULT_CPU_LEVEL_ID, type CpuLevelId } from '../cpu/index.ts'
import { createDefaultConfig, resolveName, STAT_KEYS } from '../fighter/index.ts'
import { DEFAULT_BINDINGS } from '../input/index.ts'
import type { CharacterConfig, MatchOutcome, StageData } from '../model/index.ts'
import { keysLabel } from './keyLabels.ts'
import { MatchCanvas, type MatchHud } from './MatchCanvas.tsx'
import { StatEditor } from './StatEditor.tsx'
import { StatSummary } from './FlowScreens.tsx'
import { Button, ChoiceCard, HudPanel, HudPlayer, MessageBand } from './components/index.ts'

const m = messages.cpuPlay
const fm = messages.flow
const OPERATIONS = ['left', 'right', 'jump', 'attack'] as const
const LEVEL_IDS = Object.keys(CPU_LEVELS) as CpuLevelId[]

/** CPU の側から見ない、きみ（1P）から見た、結果の 1 行 */
export function cpuOutcomeLine(o: MatchOutcome): string {
  const head = o.winner === null ? m.draw : o.winner === 'p1' ? m.win : m.lose
  return `${head}（${fm.report.reasons[o.reason]}）`
}

/** 試合ごとのシード（CPU の乱数）。毎回、ちがう動きにする */
const newSeed = () => Math.floor(Math.random() * 2 ** 31)

export function CpuPlayScreen({
  config,
  stage,
  onBack,
}: {
  config: CharacterConfig
  stage: StageData
  onBack: () => void
}) {
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [level, setLevel] = useState<CpuLevelId>(DEFAULT_CPU_LEVEL_ID)
  // CPU は標準の能力値（5/5/5/5）で始まる。2P と同じく、能力値だけ変えられる（§3.3）
  const [foe, setFoe] = useState<CharacterConfig>(() => ({
    ...createDefaultConfig('p2'),
    name: m.foeName,
  }))
  const [editFoe, setEditFoe] = useState(false)
  const [round, setRound] = useState({ no: 0, seed: 0 })
  const [hud, setHud] = useState<MatchHud | null>(null)
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null)
  const onHud = useCallback((h: MatchHud) => setHud(h), [])
  const onFinish = useCallback((r: { outcome: MatchOutcome }) => {
    setOutcome(r.outcome)
    setPhase('result')
  }, [])
  const foeReady = STAT_KEYS.reduce((t, k) => t + foe.stats[k], 0) === 20

  const start = () => {
    setHud(null)
    setOutcome(null)
    setRound((r) => ({ no: r.no + 1, seed: newSeed() }))
    setPhase('play')
  }

  if (phase === 'play') {
    return (
      <div className="match cpu-play">
        <h2>{m.title}</h2>
        <HudPanel
          headline={
            hud?.phase === 'ready' ? fm.match.ready : hud ? fm.match.time(hud.timeLeftSec) : ''
          }
        >
          {(
            [
              ['p1', resolveName(config.name, 'p1')],
              ['p2', m.foeName],
            ] as const
          ).map(([slot, name], i) => (
            <HudPlayer
              key={slot}
              slot={slot}
              name={name}
              stocksText={hud ? fm.match.stocks(hud.stocks[i]!) : ''}
              damageText={hud ? fm.match.damage(hud.damage[i]!) : ''}
            />
          ))}
        </HudPanel>
        <div className="match__stage">
          <MatchCanvas
            key={round.no}
            p1={config}
            p2={foe}
            stage={stage}
            cpu={{ level: CPU_LEVELS[level], seed: round.seed }}
            onHud={onHud}
            onFinish={onFinish}
          />
        </div>
        <footer className="flow-footer">
          <Button variant="sub" onClick={() => setPhase('setup')}>
            {m.back}
          </Button>
        </footer>
      </div>
    )
  }

  if (phase === 'result' && outcome) {
    return (
      <div className="cpu-play">
        <h2>{m.title}</h2>
        <MessageBand kind="info">{cpuOutcomeLine(outcome)}</MessageBand>
        <footer className="flow-footer">
          <Button variant="sub" onClick={() => setPhase('setup')}>
            {m.changeLevel}
          </Button>
          <Button variant="main" onClick={start}>
            {m.again}
          </Button>
        </footer>
      </div>
    )
  }

  return (
    <div className="cpu-play">
      <h2>{m.title}</h2>
      <p>{m.lead}</p>
      <dl className="practice__keys">
        {OPERATIONS.map((op) => (
          <div key={op} className="practice__key-row">
            <dt>{messages.practice[op]}</dt>
            <dd>
              <kbd>{keysLabel(DEFAULT_BINDINGS.p1[op])}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <fieldset className="cpu-play__levels">
        <legend>{m.level}</legend>
        {LEVEL_IDS.map((id) => (
          <ChoiceCard
            key={id}
            name="cpu-level"
            checked={level === id}
            onChange={() => setLevel(id)}
          >
            <b>{m.levels[id]}</b>
            <span className="practice__note">{m.levelNotes[id]}</span>
          </ChoiceCard>
        ))}
      </fieldset>
      <section aria-label={m.foeName}>
        <h3>{m.foeName}</h3>
        <StatSummary stats={foe.stats} />
        {editFoe ? (
          <div className="prep__edit">
            <StatEditor
              stats={foe.stats}
              onChange={(stats) => setFoe({ ...foe, stats })}
              heading={m.foeName}
            />
            <Button variant="sub" disabled={!foeReady} onClick={() => setEditFoe(false)}>
              {m.closeFoe}
            </Button>
          </div>
        ) : (
          <>
            <p className="practice__note">{m.foeNote}</p>
            <Button variant="sub" onClick={() => setEditFoe(true)}>
              {m.changeFoe}
            </Button>
          </>
        )}
      </section>
      <footer className="flow-footer">
        <Button variant="sub" onClick={onBack}>
          {m.back}
        </Button>
        <Button variant="main" disabled={!foeReady || editFoe} onClick={start}>
          {m.start}
        </Button>
      </footer>
    </div>
  )
}
