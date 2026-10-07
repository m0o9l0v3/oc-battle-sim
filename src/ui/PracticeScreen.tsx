import { useCallback, useState } from 'react'
import { messages } from '../assets/index.ts'
import { createDefaultConfig, resolveName, STAT_KEYS } from '../fighter/index.ts'
import { DEFAULT_BINDINGS } from '../input/index.ts'
import type { CharacterConfig, StageData } from '../model/index.ts'
import { keysLabel } from './keyLabels.ts'
import { PracticeCanvas, type PracticeHud } from './PracticeCanvas.tsx'
import { statPercent } from './statView.ts'

const m = messages.practice
const sm = messages.stat

export type PracticeScreenProps = {
  /** 1P の設定（能力値・見た目・名前）。確定したもの */
  config: CharacterConfig
  /** 確定したステージ */
  stage: StageData
  /** 「すうじを なおす」→ S03 へ。入力した内容は、親が保持する */
  onFixStats: () => void
  /** 「ステージを なおす」→ S04 へ */
  onFixStage: () => void
  /** 「たいせんへ」→ S06 へ。試さなくても、押せる */
  onNext: () => void
}

const OPERATIONS = ['left', 'right', 'jump', 'attack'] as const

/** S05 試しに動かす（ui-design.md §7.5、user-flow.md §5.5） */
export function PracticeScreen({
  config,
  stage,
  onFixStats,
  onFixStage,
  onNext,
}: PracticeScreenProps) {
  const [hud, setHud] = useState<PracticeHud>({ dummyDamage: 0, lastHit: null })
  const [resetKey, setResetKey] = useState(0)
  const onHud = useCallback((h: PracticeHud) => setHud(h), [])
  const dummy = createDefaultConfig('p2')

  return (
    <div className="practice">
      <h2 className="practice__heading">{m.title}</h2>
      <div className="practice__body">
        <div className="practice__stage">
          <PracticeCanvas
            stage={stage}
            stats={config.stats}
            look={config.appearance}
            dummyLook={dummy.appearance}
            onHud={onHud}
            resetKey={resetKey}
          />
        </div>

        <aside className="practice__side">
          <section aria-labelledby="practice-controls">
            <h3 id="practice-controls">
              {m.controls}（1P: {resolveName(config.name, 'p1')}）
            </h3>
            <dl className="practice__keys">
              {OPERATIONS.map((op) => (
                <div key={op} className="practice__key-row">
                  <dt>{m[op]}</dt>
                  <dd>
                    <kbd>{keysLabel(DEFAULT_BINDINGS.p1[op])}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="practice__note">{m.jumpNote}</p>
          </section>

          <section aria-labelledby="practice-stats">
            <h3 id="practice-stats">{m.stats}</h3>
            <ul className="practice__stats">
              {STAT_KEYS.map((key) => (
                <li key={key}>
                  <span>{sm.stats[key].label}</span>
                  <b>{config.stats[key]}</b>
                  <span className="practice__effect">
                    {sm.stats[key].effect} {statPercent(key, config.stats[key])}%
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="practice-dummy">
            <h3 id="practice-dummy">{m.dummy}</h3>
            <p className="practice__hud" role="status">
              <b>{m.dummyDamage(hud.dummyDamage)}</b>
              <br />
              {hud.lastHit ? m.lastHit(hud.lastHit.damage, hud.lastHit.launch) : m.noHit}
            </p>
            <button
              type="button"
              className="button button--sub"
              onClick={() => setResetKey((k) => k + 1)}
            >
              {m.resetDummy}
            </button>
          </section>
        </aside>
      </div>

      <footer className="practice__footer">
        <div className="practice__fix">
          <button type="button" className="button button--sub" onClick={onFixStats}>
            {m.fixStats}
          </button>
          <button type="button" className="button button--sub" onClick={onFixStage}>
            {m.fixStage}
          </button>
        </div>
        <div className="practice__next">
          <p className="practice__note">{m.skipNote}</p>
          <button type="button" className="button button--main" onClick={onNext}>
            {m.toBattle}
          </button>
        </div>
      </footer>
    </div>
  )
}
