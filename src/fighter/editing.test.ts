import { describe, expect, it } from 'vitest'
import type { Stats } from '../model/index.ts'
import { STAT_KEYS, canStartMatch, remainingPoints } from './config.ts'
import { blockReason, changeStat, nextBlock } from './editing.ts'

const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})

describe('1ポイントの増減（範囲外・合計超過の操作ができない）', () => {
  it('最大（8）では増やせない。最小（2）では減らせない', () => {
    expect(blockReason(S(8, 4, 4, 4), 'attackPower', 1)).toBe('AT_MAX')
    expect(blockReason(S(2, 6, 6, 6), 'attackPower', -1)).toBe('AT_MIN')
    expect(changeStat(S(8, 4, 4, 4), 'attackPower', 1)).toEqual(S(8, 4, 4, 4))
    expect(changeStat(S(2, 6, 6, 6), 'attackPower', -1)).toEqual(S(2, 6, 6, 6))
  })

  it('範囲内なら、増減できる（境界の 7 → 8、3 → 2）', () => {
    expect(changeStat(S(7, 4, 4, 4), 'attackPower', 1)).toEqual(S(8, 4, 4, 4))
    expect(changeStat(S(3, 6, 6, 5), 'attackPower', -1)).toEqual(S(2, 6, 6, 5))
  })

  it('合計が 20 のとき、増やせない（ポイントがない）。減らすのはできる', () => {
    expect(remainingPoints(S(5, 5, 5, 5))).toBe(0)
    expect(blockReason(S(5, 5, 5, 5), 'speed', 1)).toBe('NO_POINTS')
    expect(blockReason(S(5, 5, 5, 5), 'speed', -1)).toBeNull()
    expect(changeStat(S(5, 5, 5, 5), 'speed', 1)).toEqual(S(5, 5, 5, 5))
  })

  it('残りがあれば、増やせる（合計は 20 を超えない）', () => {
    expect(changeStat(S(5, 5, 5, 4), 'speed', 1)).toEqual(S(5, 5, 5, 5))
  })

  it('最大に達しているときの理由は、ポイントの有無より先に、AT_MAX', () => {
    expect(blockReason(S(8, 5, 5, 2), 'attackPower', 1)).toBe('AT_MAX')
  })

  it('元のオブジェクトを書き換えない', () => {
    const before = S(5, 5, 5, 4)
    changeStat(before, 'speed', 1)
    expect(before).toEqual(S(5, 5, 5, 4))
  })

  it('標準から、どの操作を、どんな順序で、何回繰り返しても、範囲外・合計超過にならない', () => {
    // 決定的な擬似乱数（線形合同法）で、1 万回の操作
    let stats = S(5, 5, 5, 5)
    let seed = 12345
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648)
    for (let i = 0; i < 10000; i++) {
      const key = STAT_KEYS[next() % 4]
      stats = changeStat(stats, key, next() % 2 === 0 ? 1 : -1)
      for (const k of STAT_KEYS) {
        expect(stats[k]).toBeGreaterThanOrEqual(2)
        expect(stats[k]).toBeLessThanOrEqual(8)
      }
      expect(remainingPoints(stats)).toBeGreaterThanOrEqual(0)
    }
  })

  it('標準から「減らす → 増やす」だけで、設定できるすべての組み合わせ（231 通り）に到達できる', () => {
    const seen = new Set<string>()
    const queue: Stats[] = [S(5, 5, 5, 5)]
    seen.add('5,5,5,5')
    while (queue.length > 0) {
      const cur = queue.pop()!
      for (const key of STAT_KEYS) {
        for (const d of [1, -1] as const) {
          const n = changeStat(cur, key, d)
          const id = STAT_KEYS.map((k) => n[k]).join(',')
          if (!seen.has(id)) {
            seen.add(id)
            queue.push(n)
          }
        }
      }
    }
    // 合計 20 のものと、途中の（合計が 20 未満の）ものを含む。合計 20 は 231 通り
    const full = [...seen].filter((id) => id.split(',').reduce((a, b) => a + Number(b), 0) === 20)
    expect(full).toHaveLength(231)
  })
})

describe('「つぎへ」が押せない理由', () => {
  it('合計が 20 なら、押せる（理由なし）', () => {
    expect(nextBlock(S(8, 2, 5, 5))).toBeNull()
    expect(
      canStartMatch({
        schemaVersion: 1,
        name: 'a',
        stats: S(8, 2, 5, 5),
        appearance: { body: 'b1', face: 'f1', color: 'c1', accessory: null },
      }),
    ).toBe(true)
  })

  it('使い切っていなければ、あと何ポイントかを返す', () => {
    expect(nextBlock(S(5, 5, 5, 4))).toEqual({ kind: 'REMAINING', points: 1 })
    expect(nextBlock(S(2, 2, 2, 2))).toEqual({ kind: 'REMAINING', points: 12 })
  })

  it('超えているとき（外部から入った値など）は、何ポイント多いかを返す', () => {
    expect(nextBlock(S(8, 8, 8, 8))).toEqual({ kind: 'OVER', points: 12 })
  })

  it('合計が 20 でも、範囲外・整数でない値があれば、押せない（対戦開始の検証と同じ結論）', () => {
    for (const bad of [
      S(9, 3, 4, 4),
      S(1, 7, 6, 6),
      S(2.5, 5.5, 6, 6),
      S(NaN, 5, 5, 5),
      S(5, 5, 5, Infinity),
    ]) {
      expect(nextBlock(bad), JSON.stringify(bad)).toEqual({ kind: 'INVALID' })
      expect(
        canStartMatch({
          schemaVersion: 1,
          name: 'a',
          stats: bad,
          appearance: { body: 'b1', face: 'f1', color: 'c1', accessory: null },
        }),
      ).toBe(false)
    }
  })

  it('「つぎへ」が押せる ⇔ 対戦開始の検証を通る（能力値について。9⁴ 通りすべてで一致）', () => {
    for (let a = 1; a <= 9; a++)
      for (let d = 1; d <= 9; d++)
        for (let j = 1; j <= 9; j++)
          for (let s = 1; s <= 9; s++) {
            const stats = S(a, d, j, s)
            const ok = canStartMatch({
              schemaVersion: 1,
              name: 'a',
              stats,
              appearance: { body: 'b1', face: 'f1', color: 'c1', accessory: null },
            })
            expect(nextBlock(stats) === null, `${a}${d}${j}${s}`).toBe(ok)
          }
  })
})
