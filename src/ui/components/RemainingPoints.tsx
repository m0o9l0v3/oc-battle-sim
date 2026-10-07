/** 残りポイント表示。能力値の画面の上部に、「あと ○ポイント」を、大きく出す（ui-design.md §6）。変わったことが、読み上げでも伝わる */
export function RemainingPoints({ remaining, text }: { remaining: number; text: string }) {
  return (
    <p
      className="stat-editor__remaining"
      role="status"
      aria-live="polite"
      data-remaining={remaining}
    >
      {text}
    </p>
  )
}
