import { describe, expect, it } from 'vitest'
import {
  INPUT_BUFFER_STEPS,
  initialControlState,
  stepControl,
  type ControlContext,
  type ControlState,
} from './control.ts'
import { NO_INPUT, type PlayerInput } from './input.ts'

const input = (p: Partial<PlayerInput> = {}): PlayerInput => ({ ...NO_INPUT, ...p })
const ctx = (step: number, p: Partial<ControlContext> = {}): ControlContext => ({
  step,
  acceptInput: true,
  canJump: true,
  canAttack: true,
  defaultFacing: 1,
  ...p,
})

/** 入力の列を、順に流す */
function run(
  steps: { input?: Partial<PlayerInput>; ctx?: Partial<ControlContext> }[],
  from: ControlState = initialControlState(),
) {
  let state = from
  return steps.map((s, i) => {
    const r = stepControl(state, input(s.input), ctx(i, s.ctx))
    state = r.state
    return r.control
  })
}

describe('左右', () => {
  it('片方だけ押すと、その向きに動く。向きも変わる', () => {
    const [a, b] = run([{ input: { left: true } }, { input: { right: true } }])
    expect(a).toMatchObject({ move: -1, facing: -1 })
    expect(b).toMatchObject({ move: 1, facing: 1 })
  })

  it('両方押すと、打ち消して止まる', () => {
    const [c] = run([{ input: { left: true, right: true } }])
    expect(c.move).toBe(0)
  })

  it('押していないときは、直前の向きを保つ', () => {
    const [, b] = run([{ input: { left: true } }, {}])
    expect(b).toMatchObject({ move: 0, facing: -1 })
  })

  it('一度も入力がないときは、既定の向き（相手の方向）', () => {
    expect(run([{}, { ctx: { defaultFacing: -1 } }]).map((c) => c.facing)).toEqual([1, -1])
  })

  it('両方押したとき、あとに押した向きに向く', () => {
    // 左を先に押し、右をあとから押す
    const cs = run([{ input: { left: true } }, { input: { left: true, right: true } }])
    expect(cs[1]).toMatchObject({ move: 0, facing: 1 })
    // 右を先に押し、左をあとから押す
    const ds = run([{ input: { right: true } }, { input: { left: true, right: true } }])
    expect(ds[1]).toMatchObject({ move: 0, facing: -1 })
  })

  it('両方を同じステップに初めて押したときは、直前の向きを保つ', () => {
    const cs = run([{ input: { left: true } }, {}, { input: { left: true, right: true } }])
    expect(cs[2].facing).toBe(-1)
    const ds = run([{ input: { right: true } }, {}, { input: { left: true, right: true } }])
    expect(ds[2].facing).toBe(1)
  })

  it('押したまま持ちかえる（古い向きを離す前に新しい向きを押す）と、新しい向きになる', () => {
    const cs = run([
      { input: { left: true } },
      { input: { left: true } },
      { input: { left: true, right: true } }, // 右を押し足した
      { input: { right: true } }, // 左を離した
    ])
    expect(cs.map((c) => c.facing)).toEqual([-1, -1, 1, 1])
    expect(cs[3].move).toBe(1)
  })

  it('入力を受け付けない間も、左右は追う（終わった瞬間に動き出せる）', () => {
    const cs = run([
      { input: { left: true }, ctx: { acceptInput: false } },
      { input: { left: true } },
    ])
    expect(cs[0]).toMatchObject({ move: -1, facing: -1 })
    expect(cs[1]).toMatchObject({ move: -1, facing: -1 })
  })
})

describe('ジャンプ・攻撃（押した瞬間）', () => {
  it('できるときに押すと、そのステップで実行する', () => {
    const [a, b] = run([{ input: { jumpPressed: true } }, { input: { attackPressed: true } }])
    expect(a).toMatchObject({ jump: true, attack: false })
    expect(b).toMatchObject({ jump: false, attack: true })
  })

  it('押していなければ、実行しない', () => {
    expect(run([{}, {}]).every((c) => !c.jump && !c.attack)).toBe(true)
  })

  it('先行入力: できるようになる 4 ステップ前までの入力を、取りこぼさない', () => {
    const cs = run([
      { input: { attackPressed: true }, ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: true } }, // 押してから 4 ステップ後
    ])
    expect(INPUT_BUFFER_STEPS).toBe(4)
    expect(cs[4].attack).toBe(true)
  })

  it('先行入力は、4 ステップを過ぎると消える', () => {
    const cs = run([
      { input: { attackPressed: true }, ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: false } },
      { ctx: { canAttack: true } }, // 5 ステップ後
    ])
    expect(cs[5].attack).toBe(false)
  })

  it('実行したら、先行入力は消える（繰り返さない）', () => {
    const cs = run([{ input: { jumpPressed: true } }, {}, {}])
    expect(cs.map((c) => c.jump)).toEqual([true, false, false])
  })

  it('同じ操作を続けて押しても、ためない（最後の1つだけ）', () => {
    const cs = run([
      { input: { jumpPressed: true }, ctx: { canJump: false } },
      { input: { jumpPressed: true }, ctx: { canJump: false } },
      { ctx: { canJump: true } },
      { ctx: { canJump: true } },
    ])
    expect(cs.map((c) => c.jump)).toEqual([false, false, true, false])
  })

  it('やられ中などに押したものは、捨てる（先行入力にしない）', () => {
    const cs = run([
      { input: { jumpPressed: true, attackPressed: true }, ctx: { acceptInput: false } },
      { ctx: { acceptInput: true } },
    ])
    expect(cs[1]).toMatchObject({ jump: false, attack: false })
  })

  it('受け付けない状態になったとき、ためていた先行入力も捨てる', () => {
    const cs = run([
      { input: { attackPressed: true }, ctx: { canAttack: false } },
      { ctx: { acceptInput: false, canAttack: false } },
      { ctx: { acceptInput: true, canAttack: true } },
    ])
    expect(cs[2].attack).toBe(false)
  })

  it('同じステップに両方できるときは、ジャンプ → 攻撃の順に、1ステップに1つ', () => {
    const cs = run([{ input: { jumpPressed: true, attackPressed: true } }, {}, {}])
    expect(cs[0]).toMatchObject({ jump: true, attack: false })
    expect(cs[1]).toMatchObject({ jump: false, attack: true })
    expect(cs[2]).toMatchObject({ jump: false, attack: false })
  })

  it('決定的: 同じ入力の列から、同じ結果になる', () => {
    const seq = [
      { input: { left: true, jumpPressed: true } },
      { input: { attackPressed: true }, ctx: { canAttack: false } },
      { input: { right: true, left: true } },
      {},
      { ctx: { canAttack: true } },
    ]
    expect(run(seq)).toEqual(run(seq))
  })
})
