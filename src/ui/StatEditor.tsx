import { useId } from 'react'
import { messages } from '../assets/index.ts'
import {
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  blockReason,
  changeStat,
  remainingPoints,
  type StatBlockReason,
} from '../fighter/index.ts'
import type { Stats } from '../model/index.ts'
import { statPercent } from './statView.ts'

const m = messages.stat

const reasonText = (r: StatBlockReason): string =>
  r === 'AT_MAX' ? m.atMax(STAT_MAX) : r === 'AT_MIN' ? m.atMin(STAT_MIN) : m.noPoints

export type StatEditorProps = {
  stats: Stats
  onChange: (stats: Stats) => void
  /** 画面の見出し（S03 は「すうじを きめよう」）。省略すると、表示しない */
  heading?: string
}

/**
 * 能力値の設定部品（S03、S06 の2P、S09 で使う）。
 * 残りポイントを常に表示し、範囲外・合計超過の操作は、できない（ボタンを無効にして、理由を近くに出す）。
 * 各能力値の意味と、標準との比較（%）を表示する。
 */
export function StatEditor({ stats, onChange, heading }: StatEditorProps) {
  const id = useId()
  const remaining = remainingPoints(stats)

  return (
    <section className="stat-editor" aria-labelledby={`${id}-heading`}>
      <header className="stat-editor__header">
        <h2 id={`${id}-heading`} className="stat-editor__heading">
          {heading ?? ''}
        </h2>
        {/* 残りポイント: 常に表示。変わったことが、読み上げでも伝わる */}
        <p
          className="stat-editor__remaining"
          role="status"
          aria-live="polite"
          data-remaining={remaining}
        >
          {remaining === 0 ? m.remainingDone : m.remaining(remaining)}
        </p>
      </header>

      <ul className="stat-editor__list">
        {STAT_KEYS.map((key) => {
          const text = m.stats[key]
          const value = stats[key]
          const minus = blockReason(stats, key, -1)
          const plus = blockReason(stats, key, 1)
          const hintId = `${id}-${key}-hint`
          // 押せない理由。範囲の端（2・8）は、その行に出す。ポイントがないことは、画面の下に1つだけ出す
          // （全部の行に同じ文を並べない）
          const hint = minus ?? (plus === 'AT_MAX' ? plus : null)
          return (
            <li key={key} className="stat-row" data-stat={key}>
              <div className="stat-row__name" title={text.meaning}>
                <span className="stat-row__label">{text.label}</span>
                <span className="stat-row__meaning">{text.meaning}</span>
              </div>
              <div className="stat-row__stepper" role="group" aria-label={text.label}>
                <button
                  type="button"
                  className="stepper-button"
                  aria-label={m.decrease(text.label)}
                  aria-describedby={hint ? hintId : undefined}
                  disabled={minus !== null}
                  onClick={() => onChange(changeStat(stats, key, -1))}
                >
                  −
                </button>
                <output className="stat-row__value" aria-label={`${text.label} ${value}`}>
                  {value}
                </output>
                <button
                  type="button"
                  className="stepper-button"
                  aria-label={m.increase(text.label)}
                  aria-describedby={
                    plus === 'NO_POINTS' ? `${id}-nopoints` : hint ? hintId : undefined
                  }
                  disabled={plus !== null}
                  onClick={() => onChange(changeStat(stats, key, 1))}
                >
                  ＋
                </button>
              </div>
              <p className="stat-row__effect" title={m.compareNote}>
                {text.effect} {statPercent(key, value)}%
              </p>
              <p id={hintId} className="stat-row__hint">
                {hint ? reasonText(hint) : ''}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="stat-editor__rule">{m.rule}</p>
      <p id={`${id}-nopoints`} className="stat-editor__nopoints">
        {remaining === 0 ? m.noPoints : ''}
      </p>
    </section>
  )
}
