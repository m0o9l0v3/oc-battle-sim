import { useId, type ReactNode } from 'react'

/**
 * ツールチップ。マウスを乗せる、または、キーボードでフォーカスすると、短い説明を出す（ui-design.md §6）。
 * 説明は、読み上げにも、つながる（aria-describedby）。説明がなくても、操作は、できる
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId()
  return (
    <span className="tooltip" tabIndex={0} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className="tooltip__text">
        {text}
      </span>
    </span>
  )
}
