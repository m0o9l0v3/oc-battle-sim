import { useSyncExternalStore } from 'react'
import { KeyboardInput } from '../input/index.ts'

const ROWS: { label: string; keys: { code: string; text: string }[] }[] = [
  {
    label: '1P',
    keys: [
      { code: 'KeyA', text: 'A' },
      { code: 'KeyD', text: 'D' },
      { code: 'KeyW', text: 'W' },
      { code: 'KeyF', text: 'F' },
    ],
  },
  {
    label: '2P',
    keys: [
      { code: 'Numpad4', text: '4' },
      { code: 'Numpad6', text: '6' },
      { code: 'Numpad8', text: '8' },
      { code: 'Numpad5', text: '5' },
      { code: 'ArrowLeft', text: '←' },
      { code: 'ArrowRight', text: '→' },
      { code: 'ArrowUp', text: '↑' },
      { code: 'Slash', text: '/' },
    ],
  },
]

let snapshot = ''

// 購読している間だけ、window のキー入力を受け取る
function subscribe(onChange: () => void) {
  const input = new KeyboardInput(window)
  const off = input.subscribe(() => {
    snapshot = [...input.pressedKeys()].sort().join(',')
    onChange()
  })
  return () => {
    off()
    input.dispose()
    snapshot = ''
  }
}
const getSnapshot = () => snapshot

/** 押しているキーが光る。キー確認画面（S06。pc-ui.md §7）の土台 */
export function KeyCheck() {
  const pressed = useSyncExternalStore(subscribe, getSnapshot, () => '')
  const set = new Set(pressed.split(',').filter(Boolean))

  return (
    <div aria-label="キーの確認">
      {ROWS.map((row) => (
        <p key={row.label} style={{ margin: '4px 0' }}>
          <b style={{ display: 'inline-block', width: '2.5em' }}>{row.label}</b>
          {row.keys.map((k) => (
            <kbd
              key={k.code}
              data-code={k.code}
              data-on={set.has(k.code)}
              style={{
                display: 'inline-block',
                minWidth: '1.6em',
                margin: '0 4px',
                padding: '2px 6px',
                textAlign: 'center',
                border: '1px solid #888',
                borderRadius: 4,
                background: set.has(k.code) ? '#ffd54f' : 'transparent',
              }}
            >
              {k.text}
            </kbd>
          ))}
        </p>
      ))}
    </div>
  )
}
