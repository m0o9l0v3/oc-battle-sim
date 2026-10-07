export type StepperProps = {
  /** 何の数字か（読み上げ用。「こうげき力」など） */
  label: string
  value: number
  decreaseLabel: string
  increaseLabel: string
  canDecrease: boolean
  canIncrease: boolean
  onDecrease: () => void
  onIncrease: () => void
  /** 押せない理由の要素の id（ボタンの aria-describedby） */
  decreaseHintId?: string
  increaseHintId?: string
}

/** 数字ステッパー。「−」「＋」のボタンと、大きな数字。範囲の端で、押せなくなる（ui-design.md §6） */
export function Stepper(p: StepperProps) {
  return (
    <div className="stat-row__stepper" role="group" aria-label={p.label}>
      <button
        type="button"
        className="stepper-button"
        aria-label={p.decreaseLabel}
        aria-describedby={p.decreaseHintId}
        disabled={!p.canDecrease}
        onClick={p.onDecrease}
      >
        −
      </button>
      <output className="stat-row__value" aria-label={`${p.label} ${p.value}`}>
        {p.value}
      </output>
      <button
        type="button"
        className="stepper-button"
        aria-label={p.increaseLabel}
        aria-describedby={p.increaseHintId}
        disabled={!p.canIncrease}
        onClick={p.onIncrease}
      >
        ＋
      </button>
    </div>
  )
}
