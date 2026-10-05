import { describe, expect, it } from 'vitest'
import { createBody } from '../physics/index.ts'
import { DEFAULT_COMBAT_CONFIG as C } from './config.ts'
import {
  attackPhase,
  canAttack,
  createCombatState,
  hitbox,
  hurtbox,
  isControllable,
  isFrozen,
  isVulnerable,
  moveSpeedScale,
  overlaps,
  resolveCombat,
  tryStartAttack,
  type CombatFighter,
  type Facing,
} from './fighter.ts'
import { damageDealt } from './formulas.ts'

const fighter = (
  x: number,
  facing: Facing,
  stats = { attackPower: 5, defense: 5 },
  y = 10,
): CombatFighter => ({
  body: { ...createBody(x, y), onGround: true },
  facing,
  stats,
  combat: createCombatState(),
})

type Pair = readonly [CombatFighter, CombatFighter]

/** 1ステップ: 攻撃の開始 → （移動は、ここでは省く）→ 戦闘の処理 */
function step(pair: Pair, starts: [boolean, boolean] = [false, false]) {
  const f0 = starts[0] ? tryStartAttack(pair[0], pair[0].facing) : pair[0]
  const f1 = starts[1] ? tryStartAttack(pair[1], pair[1].facing) : pair[1]
  return resolveCombat([f0, f1])
}

/** 攻撃を始めてから、n ステップ進める（毎ステップの結果を返す） */
function run(pair: Pair, n: number, first: [boolean, boolean] = [true, false]) {
  let p: Pair = pair
  const log: ReturnType<typeof resolveCombat>[] = []
  for (let i = 0; i < n; i++) {
    const r = step(p, i === 0 ? first : [false, false])
    log.push(r)
    p = r.fighters
  }
  return log
}

describe('当たり判定の形（combat-system.md §5.1、§6.2）', () => {
  it('やられ判定: 幅 0.50 × 高さ 0.80。足元の中心が基準（y は下が正）', () => {
    const h = hurtbox({ x: 5, y: 10 })
    expect(h).toEqual({ x0: 4.75, x1: 5.25, y0: 9.2, y1: 10 })
  })

  it('攻撃の判定: 体の前の端から前へ 0.60、足元から 0.30〜0.70 の高さ（右向き）', () => {
    const f = {
      ...fighter(5, 1),
      combat: { ...createCombatState(), attack: { t: 6, facing: 1 as Facing, hasHit: false } },
    }
    const b = hitbox(f)!
    expect(b.x0).toBeCloseTo(5.25, 10)
    expect(b.x1).toBeCloseTo(5.85, 10) // 体の中心から 0.85 先まで
    expect(b.y0).toBeCloseTo(9.3, 10) // 足元（10）から 0.70 上
    expect(b.y1).toBeCloseTo(9.7, 10) // 足元から 0.30 上
  })

  it('左向きは、左右が反転', () => {
    const f = {
      ...fighter(5, -1),
      combat: { ...createCombatState(), attack: { t: 6, facing: -1 as Facing, hasHit: false } },
    }
    const b = hitbox(f)!
    expect(b.x0).toBeCloseTo(4.15, 10)
    expect(b.x1).toBeCloseTo(4.75, 10)
  })

  it('接しているだけでは重ならない', () => {
    expect(overlaps({ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 1, x1: 2, y0: 0, y1: 1 })).toBe(false)
    expect(overlaps({ x0: 0, x1: 1.01, y0: 0, y1: 1 }, { x0: 1, x1: 2, y0: 0, y1: 1 })).toBe(true)
  })
})

describe('基本攻撃のフレーム（§6.1）', () => {
  it('発生 6 → 持続 4 → 硬直 14 の、計 24 ステップ。判定は持続の間だけ', () => {
    let p: Pair = [fighter(5, 1), fighter(20, -1)]
    const phases: string[] = []
    const boxes: boolean[] = []
    for (let i = 0; i < 26; i++) {
      p = step(p, [i === 0, false]).fighters
      const a = p[0].combat.attack
      phases.push(a ? attackPhase(a) : 'none')
      boxes.push(hitbox(p[0]) !== null)
    }
    // i 番目の結果は、そのステップの処理のあと。攻撃は、始めたステップを 0 として数える
    expect(phases.slice(0, 5)).toEqual(['startup', 'startup', 'startup', 'startup', 'startup'])
    expect(phases[5]).toBe('active') // t = 6
    expect(phases[8]).toBe('active') // t = 9
    expect(phases[9]).toBe('recovery') // t = 10
    expect(phases[22]).toBe('recovery') // t = 23
    expect(phases[23]).toBe('none') // 24 ステップで終わる
    expect(boxes.filter(Boolean)).toHaveLength(4)
  })

  it('途中でキャンセルできない。硬直が終わるまで、次の攻撃を始められない（最短の間隔は 24 ステップ）', () => {
    let p: Pair = [fighter(5, 1), fighter(20, -1)]
    const starts: number[] = []
    for (let i = 0; i < 60; i++) {
      const before = p[0].combat.attack
      const canStart = canAttack(p[0])
      p = step(p, [true, false]).fighters // 毎ステップ、攻撃ボタンを押す
      if (canStart && before === null) starts.push(i)
    }
    expect(starts.slice(0, 3)).toEqual([0, 24, 48])
  })

  it('攻撃を始めたときの向きで出る。始めたあとに向きを変えても変わらない', () => {
    const f = tryStartAttack(fighter(5, 1), 1)
    const turned = { ...f, facing: -1 as Facing }
    // 持続の最初のステップまで進める
    let p: Pair = [turned, fighter(20, -1)]
    for (let i = 0; i < 6; i++) p = resolveCombat(p).fighters
    expect(hitbox(p[0])!.x0).toBeGreaterThan(5) // 右に出ている
  })
})

describe('ヒット（§6.3、§7）', () => {
  // 発生 6 → 持続の最初のステップ（t = 6）で、相手に当たる位置。相手は右に 0.7 離れた位置
  const setup = () => [fighter(5, 1), fighter(5.7, -1)] as const

  it('持続の最初のステップで当たる。発生の間は当たらない', () => {
    const log = run(setup(), 8)
    const hitSteps = log.map((r, i) => (r.events.length > 0 ? i : -1)).filter((i) => i >= 0)
    expect(hitSteps).toEqual([6])
  })

  it('ダメージを与え、吹き飛ばす。攻撃側から離れる向き（右）に、65° 上向き', () => {
    const [, victim] = run(setup(), 7)[6].fighters
    expect(victim.combat.damage).toBeCloseTo(12, 10)
    expect(victim.body.vx).toBeGreaterThan(0)
    expect(victim.body.vy).toBeLessThan(0)
    expect(victim.body.vy / victim.body.vx).toBeCloseTo(-Math.tan((65 * Math.PI) / 180), 6)
    expect(victim.body.onGround).toBe(false)
  })

  it('1回目のヒットは、標準で 9.8 セル/秒、やられ中 24 ステップ（§8 の例）', () => {
    const e = run(setup(), 7)[6].events[0]
    expect(e.launchSpeed).toBeCloseTo(9.8, 1)
    expect(e.hitstunSteps).toBe(24)
    expect(e.damageDealt).toBeCloseTo(12, 10)
  })

  it('1回の攻撃で、同じ相手には1回だけ当たる（持続の 4 ステップで何度も当たらない）', () => {
    const log = run(setup(), 30)
    expect(log.flatMap((r) => r.events)).toHaveLength(1)
  })

  it('攻撃側の attackPower はダメージだけを変える。受けた側の defense は吹き飛ばしだけを変える', () => {
    const hit = (atk: number, def: number) =>
      run(
        [
          fighter(5, 1, { attackPower: atk, defense: 5 }),
          fighter(5.7, -1, { attackPower: 5, defense: def }),
        ],
        7,
      )[6].events[0]
    const strong = hit(8, 5)
    const weak = hit(2, 5)
    expect(strong.damageDealt).toBeGreaterThan(weak.damageDealt)
    expect(strong.damageDealt).toBeCloseTo(damageDealt(8), 10)
    const tough = hit(5, 8)
    const soft = hit(5, 2)
    expect(tough.damageDealt).toBe(soft.damageDealt) // 受けるダメージは変わらない
    expect(tough.launchSpeed).toBeLessThan(soft.launchSpeed)
  })

  it('蓄積が大きいほど、大きく吹き飛ぶ', () => {
    const victimWith = (damage: number) => {
      const v = fighter(5.7, -1)
      return [fighter(5, 1), { ...v, combat: { ...v.combat, damage } }] as const
    }
    const s0 = run(victimWith(0), 7)[6].events[0].launchSpeed
    const s60 = run(victimWith(60), 7)[6].events[0].launchSpeed
    expect(s60).toBeGreaterThan(s0)
    expect(run(victimWith(60), 7)[6].fighters[1].combat.damage).toBeCloseTo(72, 10)
  })

  it('左の相手には、左へ吹き飛ばす', () => {
    const left = run([fighter(5, -1), fighter(4.3, 1)], 7)[6].fighters[1]
    expect(left.body.vx).toBeLessThan(0)
  })

  it('届かない相手には当たらない', () => {
    const log = run([fighter(5, 1), fighter(7, -1)], 30)
    expect(log.flatMap((r) => r.events)).toHaveLength(0)
  })

  it('後ろにいる相手には当たらない', () => {
    const log = run([fighter(5, 1), fighter(4.3, 1)], 30)
    expect(log.flatMap((r) => r.events)).toHaveLength(0)
  })

  it('高さが合わない相手（上の足場にいる）には当たらない', () => {
    const log = run([fighter(5, 1), fighter(5.7, -1, undefined, 8)], 30)
    expect(log.flatMap((r) => r.events)).toHaveLength(0)
  })

  it('攻撃を受けた側の攻撃は、打ち切られる（硬直の途中だった場合）', () => {
    const v0 = fighter(5.7, -1)
    const busy = {
      ...v0,
      combat: { ...v0.combat, attack: { t: 12, facing: -1 as Facing, hasHit: false } },
    }
    const before = run([fighter(5, 1), busy], 6)[5].fighters[1]
    expect(before.combat.attack).not.toBeNull() // ヒットの直前までは、攻撃中
    const after = run([fighter(5, 1), busy], 7)[6].fighters[1]
    expect(after.combat.attack).toBeNull()
  })
})

describe('相打ち（§6.3）', () => {
  it('同じステップに、お互いに当たったら、両方にヒットする', () => {
    const log = run([fighter(5, 1), fighter(5.7, -1)], 7, [true, true])
    const r = log[6]
    expect(r.events.map((e) => [e.attacker, e.victim]).sort()).toEqual([
      [0, 1],
      [1, 0],
    ])
    const [a, b] = r.fighters
    expect(a.combat.damage).toBeCloseTo(12, 10)
    expect(b.combat.damage).toBeCloseTo(12, 10)
    expect(a.body.vx).toBeLessThan(0) // 相手から離れる
    expect(b.body.vx).toBeGreaterThan(0)
  })
})

describe('ヒットストップ（§7.1）', () => {
  /** ヒットしたステップの次から、3 ステップ止まる */
  const hitAndRun = (n: number) => run([fighter(5, 1), fighter(5.7, -1)], 7 + n)

  it('両方が、3 ステップ止まる。止まっている間、やられ中は減らない', () => {
    const log = hitAndRun(4)
    const after = log[6].fighters // ヒットしたステップ
    expect(after[0].combat.hitstop).toBe(3)
    expect(after[1].combat.hitstop).toBe(3)
    expect(after[1].combat.hitstun).toBe(24)
    for (let k = 1; k <= 3; k++) {
      const f = log[6 + k].fighters
      expect(isFrozen(log[5 + k].fighters[1])).toBe(true) // このステップの最初は、止まっている
      expect(f[1].combat.hitstun).toBe(24) // 減らない
      expect(f[1].combat.hitstop).toBe(3 - k)
    }
    expect(isFrozen(log[9].fighters[1])).toBe(false)
  })

  it('止まっている間は、攻撃側の攻撃の数え方（硬直など）も止まる。終わると続きから進む', () => {
    const log = hitAndRun(5)
    const t = (i: number) => log[i].fighters[0].combat.attack!.t
    expect(t(6)).toBe(7) // ヒットしたステップで、普通に 1 進む
    expect(t(7)).toBe(7)
    expect(t(8)).toBe(7)
    expect(t(9)).toBe(7) // 3 ステップ止まった
    expect(t(10)).toBe(8) // 再開
  })

  it('ヒットストップが終わると、やられ中が減り始める（24 ステップ）', () => {
    const log = hitAndRun(4 + 24)
    // ヒットは step 6。止まるのは 7〜9。10 から減る。24 回減って 0 になるのは step 33
    expect(log[10].fighters[1].combat.hitstun).toBe(23)
    expect(log[32].fighters[1].combat.hitstun).toBe(1)
    expect(log[33].fighters[1].combat.hitstun).toBe(0)
  })

  it('操作できない期間は、ヒットストップの後の 24 ステップ（物理を動かすステップ数）', () => {
    const log = hitAndRun(40)
    let uncontrollable = 0
    // ステップ i の移動（physics）の時点の状態 = 前のステップの結果
    for (let i = 7; i < log.length; i++) {
      const f = log[i - 1].fighters[1]
      if (!isFrozen(f) && !isControllable(f)) uncontrollable++
    }
    expect(uncontrollable).toBe(24)
  })
})

describe('やられ中と無敵（§7.2）', () => {
  it('やられ中は、追加の攻撃を受けない。操作できず、攻撃も始められない', () => {
    const v0 = fighter(5.7, -1)
    const victim = { ...v0, combat: { ...v0.combat, hitstun: 10 } }
    expect(isVulnerable(victim)).toBe(false)
    expect(isControllable(victim)).toBe(false)
    expect(canAttack(victim)).toBe(false)
    const log = run([fighter(5, 1), victim], 12)
    expect(log.flatMap((r) => r.events)).toHaveLength(0)
  })

  it('やられ中が終わると、12 ステップの無敵が続く。そのあとは、また当たる', () => {
    const v0 = fighter(5.7, -1)
    // やられ中の最後の 1 ステップ（次の tick で 0 になる）
    let p: Pair = [fighter(5, 1), { ...v0, combat: { ...v0.combat, hitstun: 1 } }]
    p = resolveCombat(p).fighters
    expect(p[1].combat.hitstun).toBe(0)
    expect(p[1].combat.invuln).toBe(12)
    expect(isVulnerable(p[1])).toBe(false)
    for (let i = 0; i < 12; i++) p = resolveCombat(p).fighters
    expect(p[1].combat.invuln).toBe(0)
    expect(isVulnerable(p[1])).toBe(true)
  })

  it('無敵の間に攻撃が当たる位置にいても、当たらない（無敵が切れるステップまで）', () => {
    const v0 = fighter(5.7, -1)
    const victim = { ...v0, combat: { ...v0.combat, invuln: 12 } }
    // 判定が出る t = 6 は、12 ステップの無敵の間
    const log = run([fighter(5, 1), victim], 10)
    expect(log.flatMap((r) => r.events)).toHaveLength(0)
  })

  it('連続ヒットで動けないままにならない: ヒット後、やられ中 + 無敵の間は、次のヒットを受けない', () => {
    // 攻撃を繰り返し続けても、続けて当たるのは、やられ中 + 無敵が終わったあと
    let p: Pair = [fighter(5, 1), fighter(5.7, -1)]
    const hitSteps: number[] = []
    for (let i = 0; i < 120; i++) {
      // 相手は、吹き飛ばされず、その場にいるものとする（位置を戻す）
      const r = step(p, [true, false])
      if (r.events.length > 0) hitSteps.push(i)
      p = [
        r.fighters[0],
        { ...r.fighters[1], body: { ...r.fighters[1].body, x: 5.7, y: 10, vx: 0, vy: 0 } },
      ]
    }
    expect(hitSteps.length).toBeGreaterThanOrEqual(2)
    // 1 回目のあと、次のヒットまでは、ヒットストップ 3 + やられ中 24 + 無敵 12 以上
    expect(hitSteps[1] - hitSteps[0]).toBeGreaterThanOrEqual(3 + 24 + 12)
  })
})

describe('攻撃中の移動（§6.4）', () => {
  it('地上で攻撃中は 0.4 倍。空中は通常のまま。攻撃していなければ通常', () => {
    const g = tryStartAttack(fighter(5, 1), 1)
    expect(moveSpeedScale(g)).toBe(C.groundAttackSpeedScale)
    expect(moveSpeedScale(g)).toBeCloseTo(0.4, 10)
    const air = { ...g, body: { ...g.body, onGround: false } }
    expect(moveSpeedScale(air)).toBe(1)
    expect(moveSpeedScale(fighter(5, 1))).toBe(1)
  })
})

describe('決定的', () => {
  it('同じ入力から、同じ結果になる', () => {
    const go = () => run([fighter(5, 1), fighter(5.7, -1)], 80, [true, true])
    expect(go()).toEqual(go())
  })
})

describe('physics との組み合わせ（battle の1ステップの順序）', () => {
  it('攻撃の開始 → 移動（ヒットストップ中は飛ばす）→ 戦闘の処理、で、吹き飛んで着地し、操作できるようになる', async () => {
    const { stepBody, gridFromStage, fighterParams } = await import('../physics/index.ts')
    const { STAGE_COLS, STAGE_ROWS } = await import('../model/index.ts')
    const floor = Array.from({ length: STAGE_ROWS }, (_, r) =>
      Array(STAGE_COLS).fill(r >= 10 ? 1 : 0),
    )
    const grid = gridFromStage({
      schemaVersion: 1,
      name: 't',
      cols: STAGE_COLS,
      rows: STAGE_ROWS,
      cells: floor,
      spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } },
    })
    const params = fighterParams({ speed: 5, jumpPower: 5 })
    let p: Pair = [fighter(10, 1), fighter(10.7, -1)]
    let uncontrollableAfterHit = 0
    let hit = false
    for (let i = 0; i < 120; i++) {
      const b = p[1]
      const a = i === 0 ? tryStartAttack(p[0], 1) : p[0]
      const move = (f: CombatFighter) =>
        isFrozen(f)
          ? f
          : {
              ...f,
              body: stepBody(
                f.body,
                params,
                {
                  move: 0,
                  jump: false,
                  controllable: isControllable(f),
                  speedScale: moveSpeedScale(f),
                },
                grid,
              ).body,
            }
      const r = resolveCombat([move(a), move(b)])
      p = r.fighters
      if (r.events.length) hit = true
      if (hit && !isControllable(p[1])) uncontrollableAfterHit++
    }
    const [, victim] = p
    expect(hit).toBe(true)
    expect(victim.body.onGround).toBe(true)
    expect(victim.body.x).toBeGreaterThan(10.7 + 1) // 右へ吹き飛んだ（約 1.9 セル、床を滑る分も）
    expect(isControllable(victim)).toBe(true)
    expect(uncontrollableAfterHit).toBeGreaterThan(0)
  })
})
