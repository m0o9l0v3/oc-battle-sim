// スマホの対戦画面（横持ち、仮想コントローラー）。docs/06-ui/mobile-ui.md §4〜§5
// 相手は、簡易CPU（cpu-opponent.md。強さは「ふつう」、能力値は標準）。ルールは、会場の対戦と同じ（§4.2）
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { messages } from '../assets/index.ts'
import { CPU_LEVELS, DEFAULT_CPU_LEVEL_ID } from '../cpu/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import { VirtualPadInput } from '../input/index.ts'
import type { CharacterConfig, MatchOutcome, StageData } from '../model/index.ts'
import type { Rect } from '../render/index.ts'
import { cpuOutcomeLine } from './CpuPlayScreen.tsx'
import { MatchCanvas, type MatchHud } from './MatchCanvas.tsx'
import { VirtualPad } from './VirtualPad.tsx'

const m = messages.mobile

/** スマホで映す範囲: ステージと、まわりの少し（横持ちの横長の画面では、左右の場外も映る） */
const MOBILE_VIEW: Rect = { minX: -2, minY: -3, maxX: 26, maxY: 17 }

/** 試合ごとのシード（CPU の乱数）。毎回、ちがう動きにする */
const newSeed = () => Math.floor(Math.random() * 2 ** 31)

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
  const [round, setRound] = useState(() => ({ no: 1, seed: newSeed() }))
  const [hud, setHud] = useState<MatchHud | null>(null)
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null)
  const onHud = useCallback((h: MatchHud) => setHud(h), [])
  const onFinish = useCallback((r: { outcome: MatchOutcome }) => setOutcome(r.outcome), [])
  const again = () => {
    pad.releaseAll()
    setHud(null)
    setOutcome(null)
    setRound((r) => ({ no: r.no + 1, seed: newSeed() }))
  }
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
      <MatchCanvas
        key={round.no}
        className="mobile-play__canvas"
        p1={config}
        p2={foe}
        stage={stage}
        p1Input={pad}
        cpu={{ level: CPU_LEVELS[DEFAULT_CPU_LEVEL_ID], seed: round.seed }}
        view={MOBILE_VIEW}
        onHud={onHud}
        onFinish={onFinish}
        paused={portrait}
      />
      <VirtualPad pad={pad} />
      <button type="button" className="mobile-play__back" onClick={back}>
        {m.back}
      </button>
      <p className="mobile-play__hud" role="status">
        {hud && (
          <>
            <span>{hud.phase === 'ready' ? m.ready : m.time(hud.timeLeftSec)}</span>
            <span>{m.youStatus(hud.damage[0], hud.stocks[0])}</span>
            <span>{m.foeStatus(hud.damage[1], hud.stocks[1])}</span>
          </>
        )}
      </p>
      {outcome && (
        <div className="mobile-play__result" role="alert">
          <p>{cpuOutcomeLine(outcome)}</p>
          <button type="button" className="mobile-play__again" onClick={again}>
            {m.again}
          </button>
        </div>
      )}
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
