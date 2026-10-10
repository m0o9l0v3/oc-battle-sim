// スマホの対戦画面（横持ち、仮想コントローラー）。docs/06-ui/mobile-ui.md §4〜§5
// 相手は、簡易CPU（#72）の実装までは、動かないダミー（S05 の試し動かしと同じルール。§4.2）
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { messages } from '../assets/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import { VirtualPadInput } from '../input/index.ts'
import type { CharacterConfig, StageData } from '../model/index.ts'
import { PracticeCanvas, type PracticeHud } from './PracticeCanvas.tsx'
import { VirtualPad } from './VirtualPad.tsx'

const m = messages.mobile

const PORTRAIT = '(orientation: portrait)'

function subscribePortrait(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(PORTRAIT)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function isPortrait(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(PORTRAIT).matches
  )
}

/**
 * 全画面と横向きの固定を、試みる（Android Chrome。iPhone の Safari では使えない。mobile-ui.md §5.2）。
 * ボタンを押した処理の中で呼ぶ（ブラウザが、ユーザーの操作の中でしか許さないため）。失敗しても何もしない
 */
export function tryEnterLandscape() {
  try {
    const el = document.documentElement
    if (document.fullscreenElement || typeof el.requestFullscreen !== 'function') return
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        return o.lock?.('landscape')
      })
      .catch(() => {})
  } catch {
    // 使えないブラウザ
  }
}

function exitFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  } catch {
    // 使えないブラウザ
  }
}

export function MobilePlayScreen({
  config,
  stage,
  onBack,
}: {
  config: CharacterConfig
  stage: StageData
  onBack: () => void
}) {
  const [pad] = useState(() => new VirtualPadInput())
  const [foe] = useState(() => createDefaultConfig('p2'))
  const [hud, setHud] = useState<PracticeHud>({ dummyDamage: 0, lastHit: null })
  const onHud = useCallback((h: PracticeHud) => setHud(h), [])
  const portrait = useSyncExternalStore(subscribePortrait, isPortrait, () => false)

  // 縦持ちの間は、押しているボタンを、すべて離した扱いにする（対戦も止める）
  useEffect(() => {
    if (portrait) pad.releaseAll()
  }, [portrait, pad])

  // 対戦の画面の間だけ、ページのスクロール・引っぱって更新を止める（mobile-ui.md §7）
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('is-mobile-play')
    return () => html.classList.remove('is-mobile-play')
  }, [])

  const back = () => {
    exitFullscreen()
    onBack()
  }

  return (
    <div className="mobile-play">
      <PracticeCanvas
        className="mobile-play__canvas"
        stage={stage}
        stats={config.stats}
        look={config.appearance}
        dummyLook={foe.appearance}
        onHud={onHud}
        input={pad}
        paused={portrait}
      />
      <VirtualPad pad={pad} />
      <button type="button" className="mobile-play__back" onClick={back}>
        {m.back}
      </button>
      <p className="mobile-play__hud" role="status">
        {m.foeDamage(hud.dummyDamage)}
      </p>
      <p className="mobile-play__hint">{m.hint}</p>
      {portrait && (
        <div className="mobile-play__rotate" role="alert">
          <span className="mobile-play__phone" aria-hidden="true" />
          <p>{m.rotate}</p>
        </div>
      )}
    </div>
  )
}
