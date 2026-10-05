import { describe, expect, it } from 'vitest'
import {
  STAGE_COLS,
  STAGE_ROWS,
  type CellValue,
  type StageData,
  type Stats,
} from '../model/index.ts'
import { DEFAULT_COMBAT_CONFIG } from '../combat/index.ts'
import { runMatchup, simulateMatch } from './balance.ts'

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
const stage: StageData = {
  schemaVersion: 1,
  name: '標準',
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  cells: ROWS.map((r) => [...r].map((c): CellValue => (c === '#' ? 1 : 0))),
  spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } },
}
const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})

const std = S(5, 5, 5, 5)
// 代表的な配分（Issue #25 の 4 つ + 極端な配分 + 中間の配分）
const PRESETS: [string, Stats][] = [
  ['5/5/5/5 標準', std],
  ['8/2/5/5 攻撃特化', S(8, 2, 5, 5)],
  ['2/8/5/5 耐久特化', S(2, 8, 5, 5)],
  ['5/5/8/2 ジャンプ特化', S(5, 5, 8, 2)],
  ['5/5/2/8 スピード特化', S(5, 5, 2, 8)],
  ['8/8/2/2 攻守特化', S(8, 8, 2, 2)],
  ['2/2/8/8 機動特化', S(2, 2, 8, 8)],
  ['6/6/4/4', S(6, 6, 4, 4)],
  ['4/4/6/6', S(4, 4, 6, 6)],
  ['3/3/7/7', S(3, 3, 7, 7)],
  ['7/7/3/3', S(7, 7, 3, 3)],
]

describe('シミュレーションの基盤', () => {
  it('同じシードから同じ結果になる（決定的）', () => {
    const a = simulateMatch(stage, [std, std], 7)
    const b = simulateMatch(stage, [std, std], 7)
    expect(a).toEqual(b)
  })

  it('試合が、時間内に決着（または時間切れで判定）する', () => {
    const r = simulateMatch(stage, [std, std], 1)
    expect(r.fightSteps).toBeGreaterThan(0)
    expect(r.fightSteps).toBeLessThanOrEqual(5400)
  })

  it('左右（スポーン位置）を入れ替えた同じ配分どうしの対戦は、勝ちと負けが近い（位置による有利不利が小さい）', () => {
    const m = runMatchup(stage, std, std, 8)
    expect(Math.abs(m.winsA - m.winsB)).toBeLessThanOrEqual(m.games * 0.35)
  })
})

/** 配分ごとの平均の勝率（0〜100）と、最も分が悪い相手との勝率。他のすべての配分との対戦（左右入れ替え）の合計 */
function winRates(opts: Parameters<typeof runMatchup>[4], seeds: number) {
  const score = new Map<string, number>()
  const games = new Map<string, number>()
  const worst = new Map<string, number>()
  const add = (k: string, w: number, g: number) => {
    score.set(k, (score.get(k) ?? 0) + w)
    games.set(k, (games.get(k) ?? 0) + g)
    worst.set(k, Math.min(worst.get(k) ?? 100, (100 * w) / g))
  }
  for (let i = 0; i < PRESETS.length; i++) {
    for (let j = i + 1; j < PRESETS.length; j++) {
      const m = runMatchup(stage, PRESETS[i][1], PRESETS[j][1], seeds, opts)
      add(PRESETS[i][0], m.winsA + m.draws / 2, m.games)
      add(PRESETS[j][0], m.winsB + m.draws / 2, m.games)
    }
  }
  return PRESETS.map(([k]) => ({
    name: k,
    mean: (100 * score.get(k)!) / games.get(k)!,
    worst: worst.get(k)!,
  }))
}

// 結果の表は、BALANCE_REPORT=1 で実行したときに、console に出す（docs/03-combat/balance.md に転記する）
const report = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env?.BALANCE_REPORT

describe('バランス（代表的な配分の総当たり。調整後の係数）', () => {
  it(
    'どの配分も、勝率が極端に偏らない（特定の配分が常に勝つ・常に負ける状態でない）',
    { timeout: 120_000 },
    () => {
      for (const r of winRates({}, 12)) {
        expect(r.mean, r.name).toBeGreaterThan(30)
        expect(r.mean, r.name).toBeLessThan(70)
        // 無敗の配分がない（どの配分にも、勝ち越せない相手がいる）
        expect(r.worst, r.name).toBeLessThan(50)
      }
    },
  )

  it('総当たりの結果（BALANCE_REPORT=1 のとき、表を出す）', { timeout: 900_000 }, () => {
    if (!report) return
    const seeds = 20
    const rows: string[] = []
    for (let i = 0; i < 7; i++) {
      for (let j = i + 1; j < 7; j++) {
        const m = runMatchup(stage, PRESETS[i][1], PRESETS[j][1], seeds)
        rows.push(
          `${PRESETS[i][0]} | ${PRESETS[j][0]} | ${m.winsA} | ${m.winsB} | ${m.draws} | ${m.avgFightSec.toFixed(0)} | ${m.avgKos.toFixed(1)} | ${m.avgHits.toFixed(0)} | ${m.reasons['stocks'] ?? 0}/${m.games}`,
        )
      }
    }
    const old = {
      combat: { ...DEFAULT_COMBAT_CONFIG, kAttack: 0.1, kDefense: 0.1 },
      coeffs: { kSpeed: 0.1, kJump: 0.1 },
    }
    const before = winRates(old, seeds)
    const after = winRates({}, seeds)
    console.log(
      'BALANCE\n' +
        rows.join('\n') +
        '\n--- mean win rate (before | after)\n' +
        before
          .map(
            (r, i) =>
              `${r.name} | ${r.mean.toFixed(0)} (${r.worst.toFixed(0)}) | ${after[i].mean.toFixed(0)} (${after[i].worst.toFixed(0)})`,
          )
          .join('\n'),
    )
  })
})
