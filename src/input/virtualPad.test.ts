import { describe, expect, it } from 'vitest'
import {
  createMatchState,
  createPracticeContext,
  DUMMY_INPUT,
  NO_INPUT,
  stepMatch,
} from '../battle/index.ts'
import { DEFAULT_STATS } from '../fighter/index.ts'
import { presetStage } from '../stage/index.ts'
import { VirtualPadInput } from './virtualPad.ts'

const s = (pad: VirtualPadInput) => pad.sample()

describe('VirtualPadInput: マルチタッチ', () => {
  it('左手で移動、右手でジャンプ・攻撃を、同時に押せる', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'right')
    pad.point(2, 'jump')
    expect(s(pad)).toEqual({ left: false, right: true, jumpPressed: true, attackPressed: false })
    // 右へ押したまま、ジャンプの指を離して、攻撃
    pad.release(2)
    pad.point(3, 'attack')
    expect(s(pad)).toEqual({ left: false, right: true, jumpPressed: false, attackPressed: true })
  })

  it('同じボタンを2本の指で押して、1本を離しても、押している', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'left')
    pad.point(2, 'left')
    pad.release(1)
    expect(s(pad).left).toBe(true)
    pad.release(2)
    expect(s(pad).left).toBe(false)
  })

  it('別の指がすでに押しているボタンに、もう1本の指を置いても、押した瞬間にはしない', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'attack')
    s(pad)
    pad.point(2, 'attack')
    expect(s(pad).attackPressed).toBe(false)
  })
})

describe('すべらせる', () => {
  it('◀ から ▶ へすべらせると、向きが変わる（指を離さなくてよい）', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'left')
    expect(s(pad)).toMatchObject({ left: true, right: false })
    pad.point(1, 'right')
    expect(s(pad)).toMatchObject({ left: false, right: true })
  })

  it('ジャンプから攻撃へすべらせると、攻撃の押した瞬間になる', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'jump')
    s(pad)
    pad.point(1, 'attack')
    expect(s(pad)).toMatchObject({ jumpPressed: false, attackPressed: true })
  })

  it('ボタンの外に出ると離した扱い。戻ると押した扱い', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'jump')
    s(pad)
    pad.point(1, null)
    expect(pad.pressed().size).toBe(0)
    pad.point(1, 'jump')
    expect(s(pad).jumpPressed).toBe(true)
  })

  it('同じボタンの上で指を動かしても、押した瞬間を繰り返さない', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'attack')
    s(pad)
    pad.point(1, 'attack')
    expect(s(pad).attackPressed).toBe(false)
  })
})

describe('押した瞬間のラッチ', () => {
  it('ステップの間に、押して離した短いタップも、1回だけ受け取る', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'attack')
    pad.release(1)
    pad.point(2, 'left')
    pad.release(2)
    expect(s(pad)).toEqual({ left: true, right: false, jumpPressed: false, attackPressed: true })
    expect(s(pad)).toEqual(NO_INPUT)
  })

  it('押しっぱなしでは、ジャンプを繰り返さない', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'jump')
    expect(s(pad).jumpPressed).toBe(true)
    expect(s(pad).jumpPressed).toBe(false)
  })

  it('左右を同時に押すと、両方が真（打ち消しは core で行う）', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'left')
    pad.point(2, 'right')
    expect(s(pad)).toMatchObject({ left: true, right: true })
  })
})

describe('すべて離す・見た目の通知', () => {
  it('releaseAll で、押している指も、ためていた入力も捨てる', () => {
    const pad = new VirtualPadInput()
    pad.point(1, 'right')
    pad.point(2, 'jump')
    pad.releaseAll()
    expect(s(pad)).toEqual(NO_INPUT)
    expect(pad.pressed().size).toBe(0)
  })

  it('押している操作の一覧と、変化の通知がある。サンプルで消えない', () => {
    const pad = new VirtualPadInput()
    let n = 0
    pad.subscribe(() => n++)
    pad.point(1, 'left')
    pad.point(2, 'attack')
    s(pad)
    expect([...pad.pressed()].sort()).toEqual(['attack', 'left'])
    pad.release(1)
    expect([...pad.pressed()]).toEqual(['attack'])
    pad.point(2, 'attack') // 変化なし
    expect(n).toBe(3)
  })
})

describe('対戦とのつながり（キーボードと同じ規則）', () => {
  it('右を押したまま、もう1本の指で攻撃すると、ダミーに当たる', () => {
    const ctx = createPracticeContext(presetStage('standard'), DEFAULT_STATS)
    const pad = new VirtualPadInput()
    let s = createMatchState(ctx)
    const step = () => (s = stepMatch(s, [pad.sample(), DUMMY_INPUT], ctx).state)
    pad.point(1, 'right')
    const dist = () => s.fighters[1].body.x - s.fighters[0].body.x
    for (let i = 0; i < 600 && dist() > 0.8; i++) step()
    expect(dist()).toBeLessThanOrEqual(0.8)
    pad.point(2, 'attack')
    for (let i = 0; i < 30; i++) step()
    expect(s.fighters[1].combat.damage).toBeGreaterThan(0)
  })
})
