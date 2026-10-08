import { describe, expect, it } from 'vitest'
import { DEFAULT_BINDINGS, validateBindings, type KeyBindings } from './bindings.ts'
import { KeyboardInput } from './keyboard.ts'
import { ReplaySource } from './replay.ts'
import { NO_INPUT } from '../battle/index.ts'

function setup(bindings?: KeyBindings) {
  const target = new EventTarget()
  const kb = new KeyboardInput(target, bindings)
  const fire = (type: 'keydown' | 'keyup', code: string, extra: object = {}) => {
    const e = new Event(type, { cancelable: true })
    Object.defineProperties(e, {
      code: { value: code },
      repeat: { value: false },
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])),
    })
    target.dispatchEvent(e)
    return e
  }
  return {
    kb,
    target,
    down: (code: string, extra?: object) => fire('keydown', code, extra),
    up: (code: string) => fire('keyup', code),
    s1: () => kb.p1.sample({ step: 0 }),
    s2: () => kb.p2.sample({ step: 0 }),
  }
}

describe('KeyboardInput: 1台で2人が同時に操作できる', () => {
  it('1P と 2P の入力が、独立して取れる', () => {
    const t = setup()
    t.down('KeyA')
    t.down('KeyW')
    t.down('Numpad6')
    t.down('Numpad5')
    expect(t.s1()).toEqual({ left: true, right: false, jumpPressed: true, attackPressed: false })
    expect(t.s2()).toEqual({ left: false, right: true, jumpPressed: false, attackPressed: true })
  })

  it('6 キー同時（1P: W D スペース、2P: 8 6 5）が、すべて取れる', () => {
    const t = setup()
    for (const k of ['KeyW', 'KeyD', 'Space', 'Numpad8', 'Numpad6', 'Numpad5']) t.down(k)
    expect(t.s1()).toEqual({ left: false, right: true, jumpPressed: true, attackPressed: true })
    expect(t.s2()).toEqual({ left: false, right: true, jumpPressed: true, attackPressed: true })
  })

  it('1P の攻撃は、スペースでも、補助の F でも出せる', () => {
    const t = setup()
    t.down('Space')
    expect(t.s1().attackPressed).toBe(true)
    t.up('Space')
    t.down('KeyF')
    expect(t.s1().attackPressed).toBe(true)
  })

  it('テンキーなしの配置（← → ↑ /）でも、2P を操作できる', () => {
    const t = setup()
    for (const k of ['ArrowLeft', 'ArrowUp', 'Slash']) t.down(k)
    expect(t.s2()).toEqual({ left: true, right: false, jumpPressed: true, attackPressed: true })
  })

  it('操作に使わないキーは、無視する（既定の動作も止めない）', () => {
    const t = setup()
    const e = t.down('KeyQ')
    expect(e.defaultPrevented).toBe(false)
    expect(t.s1()).toEqual(NO_INPUT)
    expect(t.s2()).toEqual(NO_INPUT)
  })
})

describe('押している状態と、押した瞬間（エッジ）', () => {
  it('押している間は left / right が真。離すと偽', () => {
    const t = setup()
    t.down('KeyD')
    expect(t.s1().right).toBe(true)
    expect(t.s1().right).toBe(true)
    t.up('KeyD')
    expect(t.s1().right).toBe(false)
  })

  it('ジャンプ・攻撃は、押した瞬間の1回だけ。押しっぱなしでは繰り返さない', () => {
    const t = setup()
    t.down('KeyW')
    expect(t.s1().jumpPressed).toBe(true)
    expect(t.s1().jumpPressed).toBe(false)
    t.down('KeyW', { repeat: true }) // キーリピート
    expect(t.s1().jumpPressed).toBe(false)
  })

  it('押して離すまでが、次のサンプルより前に終わっても、取りこぼさない（ラッチ）', () => {
    const t = setup()
    t.down('Space')
    t.up('Space')
    t.down('KeyA')
    t.up('KeyA')
    expect(t.s1()).toEqual({ left: true, right: false, jumpPressed: false, attackPressed: true })
    // 1回だけ。次のサンプルには残らない
    expect(t.s1()).toEqual(NO_INPUT)
  })

  it('同じ操作に2つのキーがあるとき、片方を押したまま、もう片方を押しても、押した瞬間になる', () => {
    const t = setup()
    t.down('Numpad8')
    t.s2()
    t.down('ArrowUp')
    expect(t.s2().jumpPressed).toBe(true)
  })

  it('同じ操作の2つのキーのうち、片方を離しても、もう片方を押している間は押している', () => {
    const t = setup()
    t.down('Numpad4')
    t.down('ArrowLeft')
    t.s2()
    t.up('Numpad4')
    expect(t.s2().left).toBe(true)
    t.up('ArrowLeft')
    expect(t.s2().left).toBe(false)
  })

  it('左右を同時に押すと、両方が真（打ち消しは core で行う）', () => {
    const t = setup()
    t.down('KeyA')
    t.down('KeyD')
    expect(t.s1()).toMatchObject({ left: true, right: true })
  })
})

describe('ブラウザとの付き合い', () => {
  it('対戦のキーは preventDefault する（スクロールなどを起こさない）', () => {
    const t = setup()
    expect(t.down('ArrowUp').defaultPrevented).toBe(true)
    expect(t.down('Slash').defaultPrevented).toBe(true)
  })

  it('スペースは、押す・離すの両方で preventDefault する（フォーカス中のボタンを押さない、スクロールしない）', () => {
    const t = setup()
    expect(t.down('Space', { target: { tagName: 'BUTTON' } }).defaultPrevented).toBe(true)
    expect(t.up('Space').defaultPrevented).toBe(true)
  })

  it('Ctrl・Alt・Meta と一緒のときは、操作として扱わず、ブラウザのショートカットを妨げない', () => {
    const t = setup()
    const e = t.down('KeyF', { ctrlKey: true }) // Ctrl+F（ページ内検索）
    expect(e.defaultPrevented).toBe(false)
    expect(t.s1().attackPressed).toBe(false)
  })

  it('文字の入力欄にフォーカスがあるときは、操作として扱わない', () => {
    const t = setup()
    const e = t.down('KeyA', { target: { tagName: 'INPUT' } })
    expect(e.defaultPrevented).toBe(false)
    expect(t.s1().left).toBe(false)
  })

  it('入力欄にフォーカスが移っても、押していたキーを離したら、離した扱いになる', () => {
    const t = setup()
    t.down('KeyD')
    t.s1() // 押した分のラッチを消費
    const e = new Event('keyup', { cancelable: true })
    Object.defineProperties(e, {
      code: { value: 'KeyD' },
      target: { value: { tagName: 'INPUT' } },
    })
    t.target.dispatchEvent(e)
    expect(t.s1().right).toBe(false)
  })

  it('ウィンドウが非アクティブ（blur）になると、押しているキーをすべて離した扱いにする', () => {
    const t = setup()
    t.down('KeyD')
    t.down('Numpad4')
    t.target.dispatchEvent(new Event('blur'))
    expect(t.s1()).toEqual(NO_INPUT)
    expect(t.s2()).toEqual(NO_INPUT)
    expect(t.kb.pressedKeys().size).toBe(0)
  })

  it('blur の前に押して、まだサンプルされていない入力（ラッチ）も捨てる', () => {
    const t = setup()
    t.down('KeyW')
    t.down('KeyA')
    t.target.dispatchEvent(new Event('blur'))
    expect(t.s1()).toEqual(NO_INPUT)
  })

  it('dispose のあとは、イベントを受け取らない', () => {
    const t = setup()
    t.kb.dispose()
    t.down('KeyA')
    expect(t.s1()).toEqual(NO_INPUT)
  })
})

describe('キー確認用の読み取り（対戦のラッチとは別の経路）', () => {
  it('押している操作キーの一覧と、変化の通知がある。サンプルで消えない', () => {
    const t = setup()
    let n = 0
    t.kb.subscribe(() => n++)
    t.down('KeyW')
    t.down('Numpad8')
    t.s1()
    t.s2()
    expect([...t.kb.pressedKeys()].sort()).toEqual(['KeyW', 'Numpad8'])
    t.up('KeyW')
    expect([...t.kb.pressedKeys()]).toEqual(['Numpad8'])
    expect(n).toBe(3)
  })
})

describe('キー配置の検証', () => {
  it('標準の配置は、重ならない', () => {
    expect(validateBindings(DEFAULT_BINDINGS)).toEqual([])
  })

  it('同じキーが重なる配置を検出する（プレイヤーをまたいでも）', () => {
    const bad: KeyBindings = {
      p1: { ...DEFAULT_BINDINGS.p1, attack: ['Numpad5'] },
      p2: DEFAULT_BINDINGS.p2,
    }
    const errors = validateBindings(bad)
    expect(errors).toEqual([
      { code: 'DUPLICATE', key: 'Numpad5', where: ['p1.attack', 'p2.attack'] },
    ])
    expect(() => setup(bad)).toThrow(/Invalid key bindings/)
  })

  it('空の操作を検出する', () => {
    const bad: KeyBindings = {
      p1: { ...DEFAULT_BINDINGS.p1, jump: [] },
      p2: DEFAULT_BINDINGS.p2,
    }
    expect(validateBindings(bad)).toEqual([{ code: 'EMPTY', player: 'p1', action: 'jump' }])
  })

  it('設定を差し替えれば、別のキーで動く', () => {
    const custom: KeyBindings = {
      p1: { left: ['KeyJ'], right: ['KeyL'], jump: ['KeyI'], attack: ['KeyK'] },
      p2: DEFAULT_BINDINGS.p2,
    }
    const t = setup(custom)
    t.down('KeyJ')
    t.down('KeyA') // 標準の配置は、効かない
    expect(t.s1()).toMatchObject({ left: true })
    expect(t.kb.pressedKeys().has('KeyA')).toBe(false)
  })
})

describe('入力ソースの差し替え', () => {
  it('KeyboardInput と ReplaySource は、同じ InputSource として扱える', () => {
    const t = setup()
    t.down('KeyD')
    const replay = new ReplaySource([{ ...NO_INPUT, left: true }])
    const sources = [t.kb.p1, replay]
    expect(sources.map((s) => s.sample({ step: 0 }).right)).toEqual([true, false])
    expect(sources.map((s) => s.sample({ step: 0 }).left)).toEqual([false, true])
    expect(replay.sample({ step: 5 })).toEqual(NO_INPUT) // 記録の終わりのあとは、入力なし
  })
})
