/** 対戦中の、1 人分の表示（名前、ストック、ダメージ%）。数字は、大きく（48 ピクセル以上。ui-design.md §4.2） */
export type HudPlayerProps = {
  slot: 'p1' | 'p2'
  name: string
  stocksText: string
  damageText: string
}

export function HudPlayer({ slot, name, stocksText, damageText }: HudPlayerProps) {
  return (
    <section
      className={`hud-player hud-player--${slot}`}
      aria-label={`${slot === 'p1' ? '1P' : '2P'} ${name}`}
    >
      {/* 色だけでなく、「1P」「2P」の文字を付ける */}
      <h3 className="hud-player__tag">
        {slot === 'p1' ? '1P' : '2P'} <span>{name}</span>
      </h3>
      <p className="hud-player__damage">{damageText}</p>
      <p className="hud-player__stocks">{stocksText}</p>
    </section>
  )
}

/** 対戦中の表示（HUD）。残り時間（または「じゅんび」）と、2 人分 */
export function HudPanel({ headline, children }: { headline: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel" role="status">
      <p className="hud-panel__headline">{headline}</p>
      <div className="hud-panel__players">{children}</div>
    </div>
  )
}
