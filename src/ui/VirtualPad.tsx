// スマホの仮想コントローラー（ボタンの描画と、指の受け取り）。docs/06-ui/mobile-ui.md §5、§6
// 状態は VirtualPadInput（input/）が持つ。ここは Pointer イベントを、指の下のボタンに直して渡すだけ
import { useEffect, useRef } from 'react'
import { messages } from '../assets/index.ts'
import type { Action, VirtualPadInput } from '../input/index.ts'

const m = messages.mobile

const BUTTONS: readonly { action: Action; mark: string; label: string }[] = [
  { action: 'left', mark: '◀', label: m.left },
  { action: 'right', mark: '▶', label: m.right },
  { action: 'jump', mark: '', label: m.jump },
  { action: 'attack', mark: '', label: m.attack },
]

/** 画面の点の下にある、ボタンの操作。ボタンの外なら null */
function actionAt(root: HTMLElement, x: number, y: number): Action | null {
  const el = document.elementFromPoint(x, y)
  const button = el?.closest<HTMLElement>('[data-action]')
  if (!button || !root.contains(button)) return null
  return button.dataset.action as Action
}

/**
 * 画面の全面に重ねる、透明な受け取り面と、4つのボタン。
 * 面のどこに指を置いても受け取り、指の下のボタンを押す（すべらせて、ボタンに入れる）
 */
export function VirtualPad({ pad }: { pad: VirtualPadInput }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const active = new Set<number>()

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      active.add(e.pointerId)
      // マウスでも、面の外へ出た指（ポインター）を追う
      try {
        root.setPointerCapture(e.pointerId)
      } catch {
        // 追えなくても、押す・離すは受け取れる
      }
      pad.point(e.pointerId, actionAt(root, e.clientX, e.clientY))
    }
    const onMove = (e: PointerEvent) => {
      if (!active.has(e.pointerId)) return
      pad.point(e.pointerId, actionAt(root, e.clientX, e.clientY))
    }
    const onUp = (e: PointerEvent) => {
      if (!active.delete(e.pointerId)) return
      pad.release(e.pointerId)
    }
    const releaseAll = () => {
      active.clear()
      pad.releaseAll()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') releaseAll()
    }
    // ダブルタップの拡大・スクロール・長押しのメニューを起こさない（mobile-ui.md §7）
    const stop = (e: Event) => e.preventDefault()

    // 押している見た目は、React の再描画を待たずに、属性を直接切りかえる（mobile-ui.md §6.4）
    const buttons = [...root.querySelectorAll<HTMLElement>('[data-action]')]
    const paint = () => {
      const pressed = pad.pressed()
      for (const b of buttons) {
        b.dataset.pressed = String(pressed.has(b.dataset.action as Action))
      }
    }
    const unsubscribe = pad.subscribe(paint)
    paint()

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('touchstart', stop, { passive: false })
    root.addEventListener('touchmove', stop, { passive: false })
    root.addEventListener('contextmenu', stop)
    // iOS Safari のピンチ（拡大）
    document.addEventListener('gesturestart', stop)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unsubscribe()
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('touchstart', stop)
      root.removeEventListener('touchmove', stop)
      root.removeEventListener('contextmenu', stop)
      document.removeEventListener('gesturestart', stop)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
      releaseAll()
    }
  }, [pad])

  return (
    <div ref={rootRef} className="vpad" role="group" aria-label={m.padLabel}>
      <div className="vpad__move">
        {BUTTONS.slice(0, 2).map((b) => (
          <PadButton key={b.action} {...b} />
        ))}
      </div>
      <div className="vpad__act">
        {BUTTONS.slice(2).map((b) => (
          <PadButton key={b.action} {...b} />
        ))}
      </div>
    </div>
  )
}

function PadButton({ action, mark, label }: { action: Action; mark: string; label: string }) {
  return (
    <div
      className={`vpad__btn vpad__btn--${action}`}
      data-action={action}
      data-pressed="false"
      aria-label={label}
    >
      {mark ? <span aria-hidden="true">{mark}</span> : label}
    </div>
  )
}
