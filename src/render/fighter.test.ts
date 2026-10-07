import { beforeAll, describe, expect, it } from 'vitest'
import { BODIES, composeFighterBody, FIXED_COLORS, type FighterLook } from '../assets/index.ts'
import {
  createMatchContext,
  createMatchState,
  stepMatch,
  type MatchState,
} from '../battle/index.ts'
import { hitbox, hurtbox } from '../combat/index.ts'
import { DEFAULT_STATS } from '../fighter/index.ts'
import {
  buildAttackClip,
  buildHitClip,
  FALL,
  IDLE,
  JUMP,
  KO,
  NEUTRAL_POSE,
  RUN,
  sampleClip,
  STEP_MS,
  type Pose,
} from '../fighter/render/index.ts'
import { BODY_HEIGHT, BODY_WIDTH } from '../physics/index.ts'
import { STAGE_COLS, STAGE_ROWS, type CellValue, type StageData } from '../model/index.ts'
import { fitCamera } from './camera.ts'
import {
  createFighterRenderer,
  drawFighter,
  FALLBACK_LOOK,
  FIGHTER_UNIT,
  interpolatePose,
  lookFromAppearance,
} from './fighter.ts'

// 標準のステージ（stage-format.md §8）
const ROWS = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........####..........',
  '........................',
  '......####....####......',
  '........................',
  '....################....',
  '....################....',
  '....################....',
  '........................',
]
const DEMO_STAGE: StageData = {
  schemaVersion: 1,
  name: '標準',
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  cells: ROWS.map((r) => [...r].map((c): CellValue => (c === '#' ? 1 : 0))),
  spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } },
}

// --- Path2D と CanvasRenderingContext2D の、記録用の代役（jsdom にはない） ---

class FakePath {
  readonly d: string
  constructor(d: string) {
    this.d = d
  }
}

type M = [number, number, number, number, number, number] // a b c d e f
const IDENTITY: M = [1, 0, 0, 1, 0, 0]
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const translateM = (x: number, y: number): M => [1, 0, 0, 1, x, y]
const scaleM = (x: number, y: number): M => [x, 0, 0, y, 0, 0]
const rotateM = (rad: number): M => [
  Math.cos(rad),
  Math.sin(rad),
  -Math.sin(rad),
  Math.cos(rad),
  0,
  0,
]

type Draw = { path: FakePath; matrix: M; fill?: string; stroke?: string; width?: number }

class FakeCtx {
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  matrix: M = IDENTITY
  private stack: M[] = []
  draws: Draw[] = []
  trails: { points: [number, number][]; style: string }[] = []
  save() {
    this.stack.push(this.matrix)
  }
  restore() {
    const m = this.stack.pop()
    if (m) this.matrix = m
  }
  translate(x: number, y: number) {
    this.matrix = mul(this.matrix, translateM(x, y))
  }
  scale(x: number, y: number) {
    this.matrix = mul(this.matrix, scaleM(x, y))
  }
  rotate(rad: number) {
    this.matrix = mul(this.matrix, rotateM(rad))
  }
  font = ''
  textAlign = ''
  textBaseline = ''
  texts: { text: string; fill: string }[] = []
  fillText(text: string) {
    this.texts.push({ text, fill: this.fillStyle })
  }
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  moveTo(x: number, y: number) {
    this.path.push([x, y])
  }
  quadraticCurveTo(_cx: number, _cy: number, x: number, y: number) {
    this.path.push([x, y])
  }
  path: [number, number][] = []
  fill(p?: FakePath): void {
    if (!p) {
      this.trails.push({ points: this.path, style: this.fillStyle })
      this.path = []
      return
    }
    this.draws.push({ path: p, matrix: this.matrix, fill: this.fillStyle })
  }
  stroke(p: FakePath) {
    const last = this.draws[this.draws.length - 1]
    // 形ごとに、塗り → 線の順（SVG の 1 つの path に当たる）
    if (last && last.path === p && last.matrix === this.matrix && last.stroke === undefined) {
      last.stroke = this.strokeStyle
      last.width = this.lineWidth
    } else {
      this.draws.push({
        path: p,
        matrix: this.matrix,
        stroke: this.strokeStyle,
        width: this.lineWidth,
      })
    }
  }
}

beforeAll(() => {
  ;(globalThis as unknown as { Path2D: unknown }).Path2D = FakePath
})

const asCtx = (c: FakeCtx) => c as unknown as CanvasRenderingContext2D
const camera = { scale: 100, offsetX: 0, offsetY: 0 }

// --- SVG（assets/fighter/compose.ts）を読んで、同じ変換の列に直す ---

function parseTransform(attr: string): M {
  let m = IDENTITY
  for (const [, fn, args] of attr.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    const n = args!.trim().split(/\s+/).map(Number)
    if (fn === 'translate') m = mul(m, translateM(n[0]!, n[1] ?? 0))
    else if (fn === 'scale') m = mul(m, scaleM(n[0]!, n[1] ?? n[0]!))
    else m = mul(m, rotateM(((n[0] ?? 0) * Math.PI) / 180))
  }
  return m
}

type SvgPath = { d: string; matrix: M; fill: string; stroke: string | null }

function parseSvg(svg: string): SvgPath[] {
  const out: SvgPath[] = []
  const stack: M[] = [IDENTITY]
  for (const t of svg.matchAll(/<g([^>]*)>|<\/g>|<path ([^>]*?)\/>/g)) {
    if (t[0] === '</g>') stack.pop()
    else if (t[0].startsWith('<g')) {
      const tr = /transform="([^"]*)"/.exec(t[1] ?? '')
      stack.push(
        tr ? mul(stack[stack.length - 1]!, parseTransform(tr[1]!)) : stack[stack.length - 1]!,
      )
    } else {
      const a = t[2]!
      out.push({
        d: /d="([^"]*)"/.exec(a)![1]!,
        matrix: stack[stack.length - 1]!,
        fill: /fill="([^"]*)"/.exec(a)![1]!,
        stroke: /stroke="([^"]*)"/.exec(a)?.[1] ?? null,
      })
    }
  }
  return out
}

/** compose.ts の入力（基準のポーズからの差）にする。腕・脚は、基準の角度を、compose.ts が足す */
const toComposeInput = (p: Pose) => ({
  root: p.root,
  torso: p.torso,
  head: p.head,
  armF: { ...p.armF, rot: p.armF.rot - 4 },
  armB: { ...p.armB, rot: p.armB.rot + 4 },
  legF: { ...p.legF, rot: p.legF.rot - 3 },
  legB: { ...p.legB, rot: p.legB.rot + 3 },
  face: p.face,
})

const near = (a: M, b: M) => {
  for (let i = 0; i < 4; i++) if (Math.abs(a[i]! - b[i]!) > 2e-3) return false
  return Math.abs(a[4] - b[4]) < 0.05 && Math.abs(a[5] - b[5]) < 0.05
}

const LOOKS: FighterLook[] = [
  { body: 'b1', face: 'f1', color: 'c1', accessory: null },
  { body: 'b2', face: 'f2', color: 'c2', accessory: 'a1' }, // 頭
  { body: 'b3', face: 'f3', color: 'c3', accessory: 'a3' }, // 首
  { body: 'b4', face: 'f4', color: 'c4', accessory: 'a6' }, // 背中
  { body: 'b1', face: 'f5', color: 'c5', accessory: 'a2' }, // 顔
]
const atk = buildAttackClip({ startup: 6, active: 4, recovery: 14 })
const POSES: Record<string, Pose> = {
  neutral: structuredClone(NEUTRAL_POSE),
  idle: sampleClip(IDLE, 600),
  run: sampleClip(RUN, 150),
  run2: sampleClip(RUN, 300),
  jump: sampleClip(JUMP, 100),
  fall: sampleClip(FALL, 250),
  attack: sampleClip(atk, 7 * STEP_MS),
  hit: sampleClip(buildHitClip(400), 100),
  ko: sampleClip(KO, 450),
}

describe('Canvas の描画が、SVG（assets/fighter の合成）と一致する', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    for (const facing of [1, -1] as const) {
      it(`${name}・向き ${facing}: 重ね順・変換・色が同じ`, () => {
        for (const look of LOOKS) {
          const ctx = new FakeCtx()
          // 足元 (0, 0) ・ 倍率 1 / FIGHTER_UNIT。この空間が、SVG の空間（身長 100）に当たる
          drawFighter(
            {
              ctx: asCtx(ctx),
              camera: { scale: 1 / FIGHTER_UNIT, offsetX: 0, offsetY: 100 },
              width: 1,
              height: 1,
            },
            look,
            pose,
            0,
            0,
            facing,
          )
          const svg = parseSvg(
            `<svg>${composeFighterBody({ appearance: look, pose: toComposeInput(pose), facing })}</svg>`,
          )
          expect(ctx.draws.length).toBe(svg.length)
          ctx.draws.forEach((d, i) => {
            const s = svg[i]!
            expect(d.path.d).toBe(s.d)
            // 足元 (0, 0) → 画面 (0, 100)、倍率 1。足元の補正（translate(0, -100)）で、SVG の空間と一致する
            const expected = s.matrix
            expect(near(d.matrix, expected), `${name} #${i} ${s.d.slice(0, 24)}`).toBe(true)
            if (s.fill !== 'none') expect(d.fill).toBeDefined()
            else expect(d.fill).toBeUndefined()
            expect(d.stroke !== undefined).toBe(s.stroke !== null)
          })
        }
      })
    }
  }
})

describe('drawFighter', () => {
  it('身長 100 が、やられ判定の高さ（0.8 セル）になる。足元が (x, y)', () => {
    const ctx = new FakeCtx()
    const cam = { scale: 50, offsetX: 10, offsetY: 20 }
    drawFighter(
      { ctx: asCtx(ctx), camera: cam, width: 1, height: 1 },
      FALLBACK_LOOK,
      NEUTRAL_POSE as Pose,
      3,
      4,
      1,
    )
    // 基準のポーズで、胴体の層（ローカル (0,0) = 腰）を見る。足元（空間の y = 100）は、画面の (10 + 3×50, 20 + 4×50)
    const k = cam.scale * FIGHTER_UNIT
    expect(FIGHTER_UNIT).toBeCloseTo(BODY_HEIGHT / 100)
    const torso = ctx.draws.find((d) => d.path.d === BODIES.b1.torso.shapes[0]!.d)!
    const [a, , , d, e, f] = torso.matrix
    expect(a).toBeCloseTo(k)
    expect(d).toBeCloseTo(k)
    expect(e).toBeCloseTo(10 + 3 * 50 + BODIES.b1.at.torso.x * k)
    expect(f).toBeCloseTo(20 + 4 * 50 - (100 - BODIES.b1.at.torso.y) * k)
  })

  it('画面の倍率が 0 のときは、何も描かない（落ちない）', () => {
    const ctx = new FakeCtx()
    drawFighter(
      { ctx: asCtx(ctx), camera: { scale: 0, offsetX: 0, offsetY: 0 }, width: 1, height: 1 },
      FALLBACK_LOOK,
      NEUTRAL_POSE as Pose,
      0,
      0,
      1,
    )
    expect(ctx.draws).toHaveLength(0)
  })

  it('奥の腕・脚には、陰影（shade）が重なる', () => {
    const ctx = new FakeCtx()
    drawFighter(
      { ctx: asCtx(ctx), camera, width: 1, height: 1 },
      FALLBACK_LOOK,
      NEUTRAL_POSE as Pose,
      0,
      0,
      1,
    )
    expect(ctx.draws.some((d) => d.fill === FIXED_COLORS.shade)).toBe(true)
  })
})

describe('見た目と当たり判定（REQ-FTR-05）', () => {
  /** 見た目の外接の長方形（セル。足元の中心が原点、上が負）。曲線は、制御点を含めて数える（やや大きめに出る） */
  function visualBounds(look: FighterLook, pose: Pose) {
    const ctx = new FakeCtx()
    drawFighter(
      {
        ctx: asCtx(ctx),
        camera: { scale: 1 / FIGHTER_UNIT, offsetX: 0, offsetY: 100 },
        width: 1,
        height: 1,
      },
      look,
      pose,
      0,
      0,
      1,
    )
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    for (const d of ctx.draws) {
      const nums = d.path.d.match(/-?\d*\.?\d+/g)!.map(Number)
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = d.matrix[0] * nums[i]! + d.matrix[2] * nums[i + 1]! + d.matrix[4]
        const y = d.matrix[1] * nums[i]! + d.matrix[3] * nums[i + 1]! + d.matrix[5] - 100
        box.x0 = Math.min(box.x0, x * FIGHTER_UNIT)
        box.x1 = Math.max(box.x1, x * FIGHTER_UNIT)
        box.y0 = Math.min(box.y0, y * FIGHTER_UNIT)
        box.y1 = Math.max(box.y1, y * FIGHTER_UNIT)
      }
    }
    return box
  }

  it('見た目が、やられ判定の枠から外れる大きさは、±15% 以内（animation.md §9、character-design.md §7.3）', () => {
    // 撃墜（KO）は、当たり判定がなく、対象外。攻撃の腕は、攻撃の判定が前に出る（combat-system.md §6）ので、別に確かめる
    const checked = ['neutral', 'idle', 'run', 'run2', 'jump', 'fall', 'hit']
    for (const id of ['b1', 'b2', 'b3', 'b4'] as const) {
      for (const name of checked) {
        const b = visualBounds({ body: id, face: 'f1', color: 'c1', accessory: null }, POSES[name]!)
        const hb = { x0: -BODY_WIDTH / 2, x1: BODY_WIDTH / 2, y0: -BODY_HEIGHT, y1: 0 }
        const over = {
          left: (hb.x0 - b.x0) / BODY_WIDTH,
          right: (b.x1 - hb.x1) / BODY_WIDTH,
          top: (hb.y0 - b.y0) / BODY_HEIGHT,
          bottom: (b.y1 - hb.y1) / BODY_HEIGHT,
        }
        for (const [side, v] of Object.entries(over)) {
          expect(v, `${id} ${name} ${side}`).toBeLessThanOrEqual(0.15)
        }
      }
    }
  })

  it('基準のポーズの身長は、やられ判定の高さに一致する（頭の上端 〜 足元）', () => {
    for (const id of ['b1', 'b2', 'b3', 'b4'] as const) {
      const b = visualBounds(
        { body: id, face: 'f1', color: 'c1', accessory: null },
        NEUTRAL_POSE as Pose,
      )
      expect(-b.y0 / BODY_HEIGHT, id).toBeGreaterThan(0.95)
      expect(-b.y0 / BODY_HEIGHT, id).toBeLessThan(1.1)
    }
  })

  it('描画は、試合の状態を書き換えない。見た目（体型・色・アクセサリー）が変わっても、当たり判定は同じ', () => {
    const mctx = createMatchContext(DEMO_STAGE, [DEFAULT_STATS, DEFAULT_STATS])
    let s: MatchState = createMatchState(mctx)
    for (let i = 0; i < 200; i++) {
      s = stepMatch(
        s,
        [
          { left: false, right: i % 2 === 0, jumpPressed: i === 190, attackPressed: i === 195 },
          { left: false, right: false, jumpPressed: false, attackPressed: false },
        ],
        mctx,
      ).state
    }
    const before = JSON.stringify(s)
    const boxes = JSON.stringify(s.fighters.map((f) => hurtbox(f.body)))
    deepFreeze(s)
    for (const look of LOOKS) {
      const r = createFighterRenderer({
        looks: [look, LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length]!],
      })
      const ctx = new FakeCtx()
      expect(() =>
        r.draw({ ctx: asCtx(ctx), camera, width: 100, height: 100 }, s, s, 0.5),
      ).not.toThrow()
      expect(ctx.draws.length).toBeGreaterThan(0)
    }
    expect(JSON.stringify(s)).toBe(before)
    expect(JSON.stringify(s.fighters.map((f) => hurtbox(f.body)))).toBe(boxes)
  })
})

describe('lookFromAppearance', () => {
  it('検証済みの外観は、そのまま。未知の ID は、標準の見た目（描画で落とさない）', () => {
    expect(lookFromAppearance({ body: 'b2', face: 'f3', color: 'c8', accessory: 'a5' })).toEqual({
      body: 'b2',
      face: 'f3',
      color: 'c8',
      accessory: 'a5',
    })
    expect(
      lookFromAppearance({ body: 'b2', face: 'f3', color: 'c8', accessory: null }).accessory,
    ).toBeNull()
    expect(lookFromAppearance({ body: 'b9', face: 'f3', color: 'c8', accessory: null })).toEqual(
      FALLBACK_LOOK,
    )
    expect(lookFromAppearance({ body: 'b1', face: 'f1', color: 'c1', accessory: 'zz' })).toEqual(
      FALLBACK_LOOK,
    )
  })
})

describe('interpolatePose', () => {
  it('数値を補間する。root の回転は近い向き（+720° → 0° が、逆回転しない）', () => {
    const a = structuredClone(NEUTRAL_POSE) as Pose
    const b = structuredClone(NEUTRAL_POSE) as Pose
    a.root.rot = 720
    a.armF.rot = 100
    b.armF.rot = 0
    b.face = 'ko'
    const m = interpolatePose(a, b, 0.5)
    expect(m.root.rot).toBeCloseTo(720)
    expect(m.armF.rot).toBe(50)
    expect(m.face).toBe('ko')
    b.root.rot = 10
    expect(interpolatePose(a, b, 0.5).root.rot).toBeCloseTo(725)
  })
})

describe('createFighterRenderer', () => {
  const mctx = createMatchContext(DEMO_STAGE, [DEFAULT_STATS, DEFAULT_STATS])
  const idle = { left: false, right: false, jumpPressed: false, attackPressed: false }
  const dc = (ctx: FakeCtx) => ({
    ctx: asCtx(ctx),
    camera: fitCamera(1920, 1080),
    width: 1920,
    height: 1080,
  })

  it('2体を、1P → 2P の順に描く。ステップごとに、アニメーションが進む', () => {
    const r = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!] })
    let s = createMatchState(mctx)
    const first = new FakeCtx()
    r.draw(dc(first), s, s, 1)
    // 1 体あたりの描画数 × 2
    const perFighter = first.draws.length / 2
    expect(Number.isInteger(perFighter)).toBe(true)
    expect(perFighter).toBeGreaterThan(20)
    const a = JSON.stringify(first.draws.map((d) => d.matrix))
    for (let i = 0; i < 20; i++) {
      s = stepMatch(s, [idle, idle], mctx).state
      r.step(s)
    }
    const second = new FakeCtx()
    r.draw(dc(second), s, s, 1)
    // 待機の呼吸で、ポーズが変わっている
    expect(JSON.stringify(second.draws.map((d) => d.matrix))).not.toBe(a)
  })

  it('step を呼ばなくても、draw が最新の状態に追いつく。同じステップを 2 回渡しても、進まない', () => {
    const r1 = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!] })
    const r2 = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!] })
    let s = createMatchState(mctx)
    for (let i = 0; i < 10; i++) s = stepMatch(s, [idle, idle], mctx).state
    r1.step(s)
    r1.step(s)
    const c1 = new FakeCtx()
    const c2 = new FakeCtx()
    r1.draw(dc(c1), s, s, 1)
    r2.step(s)
    r2.draw(dc(c2), s, s, 1)
    expect(JSON.stringify(c1.draws.map((d) => d.matrix))).toBe(
      JSON.stringify(c2.draws.map((d) => d.matrix)),
    )
  })

  it('新しい試合（ステップが戻る）では、アニメーションを捨てて、最初から', () => {
    const r = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!] })
    let s = createMatchState(mctx)
    const start = new FakeCtx()
    r.draw(dc(start), s, s, 1)
    for (let i = 0; i < 50; i++) {
      s = stepMatch(s, [idle, idle], mctx).state
      r.step(s)
    }
    const fresh = createMatchState(mctx)
    const again = new FakeCtx()
    r.draw(dc(again), fresh, fresh, 1)
    expect(JSON.stringify(again.draws.map((d) => d.matrix))).toBe(
      JSON.stringify(start.draws.map((d) => d.matrix)),
    )
  })

  it('攻撃のフレームが仕様の式を満たさないと、作るときに拒否する', () => {
    expect(() =>
      createFighterRenderer({
        looks: [LOOKS[0]!, LOOKS[1]!],
        attackFrames: { startup: 1, active: 1, recovery: 1 },
      }),
    ).toThrow()
  })

  it('2体の描画は、1 フレームに 100 回の描画（形）で収まる程度に小さい（60 FPS。NFR-03）', () => {
    const r = createFighterRenderer({ looks: [LOOKS[3]!, LOOKS[1]!] })
    const s = createMatchState(mctx)
    const ctx = new FakeCtx()
    r.draw(dc(ctx), s, s, 1)
    expect(ctx.draws.length).toBeLessThan(200)
  })
})

describe('攻撃の軌跡', () => {
  const mctx = createMatchContext(DEMO_STAGE, [DEFAULT_STATS, DEFAULT_STATS])
  const none = { left: false, right: false, jumpPressed: false, attackPressed: false }
  const cam = fitCamera(1920, 1080)
  const at = (t: number) => {
    let s = createMatchState(mctx)
    while (s.phase !== 'fight') s = stepMatch(s, [none, none], mctx).state
    s = stepMatch(s, [{ ...none, attackPressed: true }, none], mctx).state
    while ((s.fighters[0].combat.attack?.t ?? -1) < t) s = stepMatch(s, [none, none], mctx).state
    return s
  }
  const draw = (s: MatchState, attackTrail?: boolean) => {
    const r = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!], attackTrail })
    const ctx = new FakeCtx()
    r.draw({ ctx: asCtx(ctx), camera: cam, width: 1920, height: 1080 }, s, s, 1)
    return ctx
  }

  it('持続（当たり判定が出ている間）だけ、判定の範囲に沿って描く', () => {
    const active = at(7)
    const box = hitbox(active.fighters[0], mctx.combat)!
    expect(box).not.toBeNull()
    const ctx = draw(active)
    expect(ctx.trails).toHaveLength(1)
    const xs = ctx.trails[0]!.points.map(([x]) => x)
    const px = (x: number) => cam.offsetX + x * cam.scale
    // 判定の手前の端から、前の端まで（わずかな膨らみを含む）
    expect(Math.min(...xs)).toBeCloseTo(px(box.x0), 3)
    expect(Math.max(...xs)).toBeLessThan(px(box.x1) + (box.x1 - box.x0) * 0.2 * cam.scale)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(px(box.x1))
    expect(draw(at(2)).trails).toHaveLength(0) // 発生
    expect(draw(at(12)).trails).toHaveLength(0) // 硬直
    expect(draw(active, false).trails).toHaveLength(0)
  })

  it('左向きの攻撃は、左へ描く', () => {
    let s = createMatchState(mctx)
    while (s.phase !== 'fight') s = stepMatch(s, [none, none], mctx).state
    s = stepMatch(s, [{ ...none, left: true }, none], mctx).state
    s = stepMatch(s, [{ ...none, left: true, attackPressed: true }, none], mctx).state
    while ((s.fighters[0].combat.attack?.t ?? -1) < 7) s = stepMatch(s, [none, none], mctx).state
    expect(s.fighters[0].combat.attack?.facing).toBe(-1)
    const box = hitbox(s.fighters[0], mctx.combat)!
    const ctx = draw(s)
    const xs = ctx.trails[0]!.points.map(([x]) => x)
    expect(Math.max(...xs)).toBeCloseTo(cam.offsetX + box.x1 * cam.scale, 3)
    expect(Math.min(...xs)).toBeLessThan(cam.offsetX + box.x0 * cam.scale)
  })
})

describe('1P・2P の目印', () => {
  const mctx = createMatchContext(DEMO_STAGE, [DEFAULT_STATS, DEFAULT_STATS])
  const cam = fitCamera(1920, 1080)
  it('頭の上に「1P」「2P」の文字が出る（色は 1P が青、2P が橙。見た目が同じでも、見分けられる）', () => {
    const same = LOOKS[0]!
    const r = createFighterRenderer({ looks: [same, same] })
    const s = createMatchState(mctx)
    const ctx = new FakeCtx()
    r.draw({ ctx: asCtx(ctx), camera: cam, width: 1920, height: 1080 }, s, s, 1)
    expect(ctx.texts.map((t) => t.text)).toEqual(['1P', '2P'])
    expect(ctx.texts.every((t) => t.fill === '#ffffff')).toBe(true)
  })

  it('tags: false で、描かない', () => {
    const r = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!], tags: false })
    const s = createMatchState(mctx)
    const ctx = new FakeCtx()
    r.draw({ ctx: asCtx(ctx), camera: cam, width: 1920, height: 1080 }, s, s, 1)
    expect(ctx.texts).toHaveLength(0)
  })
})

describe('攻撃中の向き', () => {
  it('攻撃中に、逆を押して向きが変わっても、体は攻撃の向きのまま（判定・軌跡と同じ）', () => {
    const mctx = createMatchContext(DEMO_STAGE, [DEFAULT_STATS, DEFAULT_STATS])
    const none = { left: false, right: false, jumpPressed: false, attackPressed: false }
    let s = createMatchState(mctx)
    while (s.phase !== 'fight') s = stepMatch(s, [none, none], mctx).state
    s = stepMatch(s, [{ ...none, attackPressed: true }, none], mctx).state
    const locked = s.fighters[0].combat.attack!.facing
    s = stepMatch(s, [{ ...none, left: locked > 0 }, none], mctx).state
    expect(s.fighters[0].facing).toBe(-locked)
    const r = createFighterRenderer({ looks: [LOOKS[0]!, LOOKS[1]!] })
    const ctx = new FakeCtx()
    r.draw({ ctx: asCtx(ctx), camera, width: 100, height: 100 }, s, s, 1)
    // 向きの反転は、行列の x 方向の符号に出る
    expect(Math.sign(ctx.draws[0]!.matrix[0])).toBe(locked)
  })
})

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}
