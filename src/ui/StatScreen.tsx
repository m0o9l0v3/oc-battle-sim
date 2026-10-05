import { useId } from 'react'
import { messages } from '../assets/index.ts'
import { DEFAULT_STATS, nextBlock } from '../fighter/index.ts'
import type { Stats } from '../model/index.ts'
import { StatEditor } from './StatEditor.tsx'

const m = messages.stat

export type StatScreenProps = {
  stats: Stats
  onChange: (stats: Stats) => void
  /** 「つぎへ」。全ポイントを使い切っているときだけ押せる */
  onNext: () => void
  /** 「もどる」。戻れない画面では、渡さない（ボタンを出さない） */
  onBack?: () => void
}

/** S03 能力値を決める（ui-design.md §7.3） */
export function StatScreen({ stats, onChange, onNext, onBack }: StatScreenProps) {
  const id = useId()
  const block = nextBlock(stats)
  const reason = !block
    ? null
    : block.kind === 'REMAINING'
      ? m.nextBlocked(block.points)
      : block.kind === 'OVER'
        ? m.nextBlockedOver(block.points)
        : m.nextBlockedInvalid

  return (
    <div className="stat-screen">
      <StatEditor stats={stats} onChange={onChange} heading={m.title} />
      <div className="stat-screen__reset">
        <button
          type="button"
          className="button button--sub"
          onClick={() => onChange({ ...DEFAULT_STATS })}
        >
          {m.reset}
        </button>
      </div>
      <footer className="stat-screen__footer">
        {onBack ? (
          <button type="button" className="button button--sub" onClick={onBack}>
            {m.back}
          </button>
        ) : (
          <span />
        )}
        <div className="stat-screen__next">
          {/* 押せない理由は、ボタンの近くに出す（無反応にしない） */}
          <p id={`${id}-reason`} className="stat-screen__reason" role="status">
            {reason ?? ''}
          </p>
          <button
            type="button"
            className="button button--main"
            disabled={block !== null}
            aria-describedby={block ? `${id}-reason` : undefined}
            onClick={onNext}
          >
            {m.next}
          </button>
        </div>
      </footer>
    </div>
  )
}
