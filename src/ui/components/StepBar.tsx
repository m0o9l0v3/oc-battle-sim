import { messages } from '../../assets/index.ts'
import type { ScreenId } from '../../model/index.ts'

/** 画面 → 段階（0〜4: つくる・ステージ・ためす・たいせん・ふりかえり）。S01 は、段階の外 */
const STEP_OF: Partial<Record<ScreenId, number>> = {
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
}

/** 段階の表示（画面の上部。ui-design.md §4）。いまの段階を、強調（色と ▶ の記号）する */
export function StepBar({ screen }: { screen: ScreenId }) {
  const index = STEP_OF[screen]
  if (index === undefined) return null
  return (
    <ol className="step-bar" aria-label="すすみぐあい">
      {messages.flow.steps.map((label, i) => (
        <li key={label} aria-current={i === index ? 'step' : undefined} data-current={i === index}>
          {i === index ? '▶ ' : ''}
          {label}
        </li>
      ))}
    </ol>
  )
}
