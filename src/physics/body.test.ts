import { describe, expect, it } from 'vitest'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'
import {
  BODY_HEIGHT,
  BODY_WIDTH,
  canJump,
  createBody,
  launch,
  stepBody,
  type Body,
  type MoveInput,
} from './body.ts'
import { AIR_JUMPS, DT, GRAVITY, MAX_FALL_SPEED } from './constants.ts'
import { gridFromStage } from './grid.ts'
import { fighterParams } from './params.ts'

/** '#' はブロック、'.' は空の、14 行の文字列からステージを作る */
function stage(rows: string[]): StageData {
  const full = [...rows, ...Array(STAGE_ROWS - rows.length).fill('.'.repeat(STAGE_COLS))]
  return {
    schemaVersion: 1,
    name: 't',
    cols: STAGE_COLS,
    rows: STAGE_ROWS,
    cells: full.map((r) =>
      [...r.padEnd(STAGE_COLS, '.')].map((c): CellValue => (c === '#' ? 1 : 0)),
    ),
    spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } },
  }
}

// 床（行 10、列 4〜19）と、足場 2 つ、天井つきの区画を持つ
const rows = [
  '........................', // 0
  '........................', // 1
  '........................', // 2
  '........................', // 3
  '........................', // 4
  '........................', // 5
  '..........####..........', // 6 中央の足場
  '........................', // 7
  '......####....####......', // 8 左右の足場
  '........................', // 9
  '....################....', // 10 メインの床（上面 y = 10）
  '....################....', // 11
  '....################....', // 12
]
const grid = gridFromStage(stage(rows))
const open = gridFromStage(stage([]))
const FLOOR_Y = 10
const std = fighterParams({ speed: 5, jumpPower: 5 })
const idle: MoveInput = { move: 0, jump: false, controllable: true }

/** n ステップ進める */
function run(
  body: Body,
  n: number,
  input: Partial<MoveInput> | ((i: number) => Partial<MoveInput>) = {},
  p = std,
) {
  let b = body
  const landings: number[] = []
  for (let i = 0; i < n; i++) {
    const inp = { ...idle, ...(typeof input === 'function' ? input(i) : input) }
    const r = stepBody(b, p, inp, grid)
    b = r.body
    if (r.landingImpactSpeed !== null) landings.push(r.landingImpactSpeed)
  }
  return { b, landings }
}

const standing = (x = 10) => run({ ...createBody(x, FLOOR_Y - 0.5) }, 60).b

describe('重力と着地', () => {
  it('空中から落ちて、床の上面に立つ。めり込まない', () => {
    const { b } = run(createBody(5, 5), 120)
    expect(b.onGround).toBe(true)
    expect(b.y).toBeCloseTo(FLOOR_Y, 9)
    expect(b.vy).toBe(0)
  })

  it('落下中は、半陰的オイラー法で、1ステップに vy が 重力 × dt ずつ増える', () => {
    const r = stepBody(createBody(10, 3), std, idle, grid)
    expect(r.body.vy).toBeCloseTo(GRAVITY * DT, 12)
    expect(r.body.y).toBeCloseTo(3 + GRAVITY * DT * DT, 12) // 更新した速度で位置を進める
  })

  it('着地したステップだけ、着く直前の下向きの速さを通知する（それ以外は null）', () => {
    const { landings, b } = run(createBody(5, 5), 120)
    expect(landings).toHaveLength(1)
    expect(landings[0]).toBeGreaterThan(5)
    expect(b.onGround).toBe(true)
    // 立っている間は、毎ステップ接地していても、通知しない
    const r = stepBody(b, std, idle, grid)
    expect(r.landingImpactSpeed).toBeNull()
    expect(r.body.onGround).toBe(true)
  })

  it('最大落下速度で頭打ちになる', () => {
    let b = createBody(0.5, -100) // 場外（床がない）を落ち続ける
    for (let i = 0; i < 400; i++) b = stepBody(b, std, idle, grid).body
    expect(b.vy).toBe(MAX_FALL_SPEED)
  })

  it('床のない場所（ステージの外）は、そのまま落ちる', () => {
    const { b } = run(createBody(1, 5), 200) // 列 1 の下に床はない
    expect(b.onGround).toBe(false)
    expect(b.y).toBeGreaterThan(14)
  })
})

describe('横移動（speed）', () => {
  it('speed が高いほど、同じ時間で遠くへ動く', () => {
    const dist = (speed: number) => {
      const start = standing(8)
      const p = fighterParams({ speed, jumpPower: 5 })
      const { b } = run(start, 30, { move: 1 }, p)
      return b.x - start.x
    }
    const [d2, d5, d8] = [dist(2), dist(5), dist(8)]
    expect(d2).toBeLessThan(d5)
    expect(d5).toBeLessThan(d8)
    // 0.5 秒で、おおよそ moveSpeed × 0.5（加速の立ち上がり分だけ小さい）
    expect(d5).toBeGreaterThan(3.75 * 0.5 * 0.95)
    expect(d5).toBeLessThanOrEqual(3.75 * 0.5)
  })

  it('目標の速さに達したら、moveSpeed ちょうどで動く', () => {
    const b = run(standing(8), 20, { move: 1 }).b
    expect(b.vx).toBeCloseTo(3.75, 9)
  })

  it('入力をやめると、摩擦で止まる', () => {
    const moving = run(standing(8), 20, { move: 1 }).b
    const { b } = run(moving, 10)
    expect(b.vx).toBe(0)
  })

  it('左右とも同じ速さ', () => {
    const l = run(standing(12), 20, { move: -1 }).b
    const r = run(standing(12), 20, { move: 1 }).b
    expect(-l.vx).toBeCloseTo(r.vx, 9)
  })

  it('地上で攻撃中は、速度の倍率（0.4）がかかる', () => {
    const b = run(standing(8), 20, { move: 1, speedScale: 0.4 }).b
    expect(b.vx).toBeCloseTo(3.75 * 0.4, 9)
  })

  it('空中でも、speed の速さへ向かう（加速 60 セル/秒²）', () => {
    const airborne = createBody(10, 3)
    const { b } = run(airborne, 6, { move: 1 }) // 0.1 秒
    expect(b.vx).toBeCloseTo(3.75, 9) // 60 × 0.1 = 6 > 3.75 なので、目標に届く
    const { b: b1 } = run(airborne, 1, { move: 1 })
    expect(b1.vx).toBeCloseTo(60 * DT, 9)
  })

  it('空中で入力をやめると、10 セル/秒² で減速する', () => {
    const b0 = { ...createBody(10, 3), vx: 3 }
    const { b } = run(b0, 6) // 0.1 秒で 1 減る
    expect(b.vx).toBeCloseTo(2, 9)
  })
})

describe('ジャンプ（jumpPower）', () => {
  /** 地面からジャンプして、最も高く上がったときの高さ（足元の、床からの高さ） */
  function peak(jumpPower: number) {
    const p = fighterParams({ speed: 5, jumpPower })
    let b = standing(8)
    let top = 0
    for (let i = 0; i < 120; i++) {
      b = stepBody(b, p, { ...idle, jump: i === 0 }, grid).body
      top = Math.max(top, FLOOR_Y - b.y)
    }
    return top
  }

  it('jumpPower が高いほど、高く跳ぶ', () => {
    const [h2, h5, h8] = [peak(2), peak(5), peak(8)]
    expect(h2).toBeLessThan(h5)
    expect(h5).toBeLessThan(h8)
  })

  it('跳ぶ高さは、式（jumpHeight）に近い（1/60 秒の刻みで、少し低くなる。差は 8 % 以内）', () => {
    for (const jp of [2, 5, 8]) {
      const expected = fighterParams({ speed: 5, jumpPower: jp }).jumpHeight
      const actual = peak(jp)
      expect(actual).toBeLessThanOrEqual(expected + 1e-9)
      expect(actual).toBeGreaterThan(expected * 0.92)
    }
  })

  it('最小のジャンプ（jumpPower 2）でも、1 セルの段差を越えられる（stat-system.md §8）', () => {
    expect(peak(2)).toBeGreaterThan(1.0)
  })

  it('ジャンプは、最初の上向きの速さを与える。ステップで進めると、上に動く', () => {
    const r = stepBody(standing(8), std, { ...idle, jump: true }, grid)
    expect(r.jumped).toBe(true)
    expect(r.body.vy).toBeLessThan(0)
    expect(r.body.y).toBeLessThan(FLOOR_Y)
    expect(r.body.onGround).toBe(false)
  })

  it('空中ジャンプは 2 回まで。3 回目は効かない', () => {
    let b = standing(8)
    b = stepBody(b, std, { ...idle, jump: true }, grid).body // 地上
    expect(b.airJumpsLeft).toBe(AIR_JUMPS)
    const a1 = stepBody(b, std, { ...idle, jump: true }, grid)
    const a2 = stepBody(a1.body, std, { ...idle, jump: true }, grid)
    const a3 = stepBody(a2.body, std, { ...idle, jump: true }, grid)
    expect([a1.jumped, a2.jumped, a3.jumped]).toEqual([true, true, false])
    expect(a2.body.airJumpsLeft).toBe(0)
    expect(canJump(a2.body)).toBe(false)
  })

  it('空中ジャンプは、落下中でも、上向きの速さを取り戻す。横の速さは変えない', () => {
    const falling = { ...createBody(10, 3), vy: 8, vx: 2 }
    const r = stepBody(falling, std, { ...idle, move: 1, jump: true }, grid)
    expect(r.body.vy).toBeLessThan(0)
    expect(r.body.airJumpsLeft).toBe(AIR_JUMPS - 1)
  })

  it('着地すると、空中ジャンプの回数が戻る', () => {
    const used = { ...createBody(5, 5), airJumpsLeft: 0 }
    const { b } = run(used, 120)
    expect(b.onGround).toBe(true)
    expect(b.airJumpsLeft).toBe(AIR_JUMPS)
  })

  it('やられ中（操作できない）は、ジャンプしない', () => {
    const r = stepBody(standing(8), std, { ...idle, jump: true, controllable: false }, grid)
    expect(r.jumped).toBe(false)
    expect(canJump(standing(8), false)).toBe(false)
  })
})

describe('足場・壁・天井との衝突（すり抜けない）', () => {
  it('足場の下から跳んで頭をぶつけたら、通り抜けず、縦の速さが 0 になる', () => {
    // 中央の足場（行 6、列 10〜13）の下（行 7 の空間）から、強く跳ぶ
    const p = fighterParams({ speed: 5, jumpPower: 8 })
    let b: Body = { ...createBody(11.5, 9.5), onGround: false }
    b = launch(b, 0, -20) // 足場に向かって
    let minY = Infinity
    for (let i = 0; i < 30; i++) {
      b = stepBody(b, p, idle, grid).body
      minY = Math.min(minY, b.y)
    }
    // 頭（y − 高さ）が、足場の下面（y = 7）より上に出ない
    expect(minY - BODY_HEIGHT).toBeGreaterThanOrEqual(7 - 1e-9)
  })

  it('足場の上に、上から着地できる（足場にのる）', () => {
    const b0: Body = { ...createBody(11.5, 3), onGround: false }
    const { b } = run(b0, 120)
    expect(b.onGround).toBe(true)
    expect(b.y).toBeCloseTo(6, 9) // 中央の足場の上面
  })

  it('壁（床の横）に、横から当たると止まる。跳ね返らない', () => {
    // 床の左端（列 4）の壁面に向かって歩く。床の上面より下（行 10 の高さ）に、左から
    const b0: Body = { ...createBody(2, 10.99), onGround: false }
    let b = launch(b0, 12, 0)
    for (let i = 0; i < 30; i++) b = stepBody(b, std, idle, grid).body
    // 体の右端が、壁の面（x = 4）を越えない
    expect(b.x + BODY_WIDTH / 2).toBeLessThanOrEqual(4 + 1e-9)
    expect(b.vx).toBe(0)
  })

  it('床に向かって歩いて、床の端から落ちる', () => {
    const b0 = standing(19.2)
    const { b } = run(b0, 40, { move: 1 })
    expect(b.onGround).toBe(false) // 床（列 19 まで）の右端を過ぎた
    expect(b.x).toBeGreaterThan(20)
  })

  it('速い吹き飛ばし（1 ステップに 1 セル以上）でも、薄い足場をすり抜けない', () => {
    // 足場（行 8、列 6〜9。厚さ 1 セル）の上から、真下に、非常に速く落とす
    for (const v of [40, 80, 150, 300]) {
      const b0 = launch({ ...createBody(7.5, 5), onGround: false }, 0, v)
      let b = b0
      for (let i = 0; i < 4; i++) b = stepBody(b, std, idle, grid).body
      expect(b.y, `速さ ${v}`).toBeLessThanOrEqual(8 + 1e-9) // 足場の上面（y = 8）より下に出ない
    }
  })

  it('速い横移動でも、壁をすり抜けない', () => {
    for (const v of [30, 100, 300]) {
      let b = launch({ ...createBody(2, 10.99), onGround: false }, v, 0)
      for (let i = 0; i < 10; i++) b = stepBody(b, std, idle, grid).body
      expect(b.x + BODY_WIDTH / 2, `速さ ${v}`).toBeLessThanOrEqual(4 + 1e-9)
    }
  })

  it('決定的: 同じ入力から、同じ結果になる', () => {
    const seq = (i: number): Partial<MoveInput> => ({
      move: i % 7 < 3 ? 1 : -1,
      jump: i % 23 === 0,
    })
    const a = run(standing(8), 200, seq).b
    const b = run(standing(8), 200, seq).b
    expect(a).toEqual(b)
  })
})

describe('吹き飛ばされているとき（knockback.md §6）', () => {
  it('空中: 重力だけが働き、水平の速さはそのまま（操作は効かない）', () => {
    const b0 = launch({ ...createBody(10, 5), onGround: false }, 5, -8)
    const r = stepBody(b0, std, { ...idle, move: -1, jump: true, controllable: false }, grid)
    expect(r.body.vx).toBe(5)
    expect(r.body.vy).toBeCloseTo(-8 + GRAVITY * DT, 12)
    expect(r.jumped).toBe(false)
  })

  it('地面の上: 水平の速さを、摩擦（60 セル/秒²）で減らす', () => {
    const b0 = { ...standing(8), vx: 6 }
    const r = stepBody(b0, std, { ...idle, controllable: false }, grid)
    expect(r.body.vx).toBeCloseTo(6 - 60 * DT, 9)
  })

  it('launch は、空中ジャンプの回数を戻さない', () => {
    const b = launch({ ...createBody(10, 5), airJumpsLeft: 1 }, 0, -5)
    expect(b.airJumpsLeft).toBe(1)
    expect(b.onGround).toBe(false)
  })

  /** 地面から速さ speed（セル/秒）、角度 65° で飛んだとき、飛び始めの高さまで戻った最初のステップの水平の距離 */
  function distance(speed: number) {
    const rad = (65 * Math.PI) / 180
    // 邪魔のない広い空間（ブロックなし）で、地面の高さから飛ぶ
    let b = launch(createBody(6, FLOOR_Y), speed * Math.cos(rad), -speed * Math.sin(rad))
    const x0 = b.x
    const y0 = b.y
    for (let i = 0; i < 300; i++) {
      b = stepBody(b, std, { ...idle, controllable: false }, open).body
      if (b.y >= y0 - 1e-9) return b.x - x0
    }
    return NaN
  }

  it.each([
    [9.8, 1.9],
    [13.4, 3.6],
    [17.0, 5.9],
    [23.0, 10.7],
  ])(
    '速さ %f セル/秒で飛ぶと、%f セル先に戻る（knockback.md §7 の表。固定ステップの数え方）',
    (v, d) => {
      expect(distance(v)).toBeCloseTo(d, 1)
    },
  )
})

describe('ステージ検証の基準との整合（validation.md §5.2 の「飛べる距離」の表）', () => {
  // 最小の能力値（speed 2・jumpPower 2）で、地上のジャンプ + 空中ジャンプ 1 回。最もよいタイミングで飛んだときの距離
  const minP = fighterParams({ speed: 2, jumpPower: 2 })
  function reach(rise: number) {
    let best = 0
    for (let d = 1; d < 60; d++) {
      let b: Body = { ...createBody(0, 0), onGround: true }
      for (let i = 0; i < 200; i++) {
        b = stepBody(b, minP, { move: 1, jump: i === 0 || i === d, controllable: true }, open).body
        // 足元の高さ（上が正）が rise 以下まで、落ちてきた最初のステップ
        if (i > 0 && b.vy > 0 && -b.y <= rise) {
          best = Math.max(best, b.x)
          break
        }
      }
    }
    return best
  }

  it.each([
    [2, 1.74],
    [1, 2.37],
    [0, 2.85],
    [-1, 3.14],
    [-2, 3.38],
    [-3, 3.58],
    [-4, 3.77],
  ])('rise %i のとき、飛べる距離は約 %f セル', (rise, expected) => {
    expect(reach(rise)).toBeCloseTo(expected, 1)
  })

  it('許す隙間（rise +2〜0 は 1 セル、−1 以下は rise −1 まで 1 セル、−2 以下は 2 セル）に、70 % の余裕がある', () => {
    for (const [rise, gap] of [
      [2, 1],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-2, 2],
      [-3, 2],
      [-4, 2],
    ] as const) {
      expect(reach(rise) * 0.7, `rise ${rise}`).toBeGreaterThanOrEqual(gap)
    }
  })
})
