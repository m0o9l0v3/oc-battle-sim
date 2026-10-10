// 持ち帰りの設定を復元したときの入口（take-home-share.md §9）。S01 の前に出す
import { useState } from 'react'
import { messages } from '../assets/index.ts'
import { resolveName } from '../fighter/index.ts'
import type { TakeHomeImport } from '../session/index.ts'
import { buildTakeHomeUrl, PUBLIC_APP_URL } from '../share/index.ts'
import type { FighterLook } from '../assets/index.ts'
import { StatSummary } from './FlowScreens.tsx'
import { FighterPreview } from './FighterPreview.tsx'
import { StageThumbnail } from './StageThumbnail.tsx'
import { Button, MessageBand } from './components/index.ts'

const m = messages.takeHome

/** スマホ（主な操作がタッチ、または画面が狭い）か。スマホでは、仮想コントローラーで遊ぶ（mobile-ui.md §4.1） */
export function isMobileEnvironment(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse), (max-width: 767px)').matches
    )
  } catch {
    return false
  }
}

export function TakeHomeEntry({
  result,
  mobile,
  onPlay,
  onPlayMobile,
  onFresh,
  onDismiss,
  resume = false,
}: {
  result: TakeHomeImport
  mobile: boolean
  /** 「ふたりで あそぶ」 */
  onPlay: () => void
  /** スマホ: 「スマホで あそぶ」（持ち帰った設定のまま、仮想コントローラーで） */
  onPlayMobile?: () => void
  /** 「はじめから つくる」 */
  onFresh: () => void
  /** 失敗のとき: 標準の設定で始める */
  onDismiss: () => void
  /** 失敗のとき、保存した途中のデータがある（標準ではなく、その続きになる） */
  resume?: boolean
}) {
  const [copied, setCopied] = useState(false)

  if (result.status === 'failed') {
    return (
      <div className="takehome">
        <h2>{m.failedTitle}</h2>
        <MessageBand kind="warn">{m.failedBody(result.reason)}</MessageBand>
        {!mobile && !resume && <p className="practice__note">{m.failedNote}</p>}
        {!mobile && (
          <Button variant="main" onClick={onDismiss}>
            {resume ? m.failedResume : m.failedStandard}
          </Button>
        )}
      </div>
    )
  }

  const { character, stage } = result
  // 現在の location ではなく、復元したデータから作り直した URL（フラグメントを取り除いても失わない）
  const url = buildTakeHomeUrl(PUBLIC_APP_URL, character, stage)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url ?? '')
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="takehome">
      <h2>{m.title}</h2>
      <p>{m.lead}</p>
      {/* スマホの横持ちは、画面が低い。遊ぶボタンを、上に出す */}
      {mobile && onPlayMobile && (
        <div className="takehome__actions">
          <Button variant="main" onClick={onPlayMobile}>
            {m.playMobile}
          </Button>
          <p className="practice__note">{m.playMobileNote}</p>
        </div>
      )}
      <div className="takehome__summary">
        <section>
          <h3>{resolveName(character.name, 'p1')}</h3>
          <FighterPreview
            look={character.appearance as FighterLook}
            label={m.previewLabel(resolveName(character.name, 'p1'))}
            height={180}
          />
          <StatSummary stats={character.stats} />
        </section>
        <section>
          <h3>
            {m.stage}: {stage.name}
          </h3>
          <StageThumbnail stage={stage} width={288} />
        </section>
      </div>
      {mobile ? (
        <section>
          <MessageBand kind="info">{m.mobileBody}</MessageBand>
          {url && (
            <>
              <label className="end__url">
                <span>{m.copyHint}</span>
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              </label>
              {typeof navigator !== 'undefined' && navigator.clipboard && (
                <Button variant="main" onClick={copy}>
                  {copied ? m.copied : m.copy}
                </Button>
              )}
            </>
          )}
        </section>
      ) : (
        <div className="takehome__actions">
          <Button variant="main" onClick={onPlay}>
            {m.playTwo}
          </Button>
          <p className="practice__note">{m.playTwoNote}</p>
          <Button variant="sub" onClick={onFresh}>
            {m.fresh}
          </Button>
        </div>
      )}
    </div>
  )
}
