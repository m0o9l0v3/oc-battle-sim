// 戦の比較。仕様: docs/07-report/comparison.md。2 つの戦の記録（設定・結果）だけから、決定的に作る
//  - ②「すうじの ききめ」は、能力値から計算で決まる値（確定）だけ。試合中に測った値は、③ に入れる
//  - 差は、右（あと）− 左（前）。よい・わるいを判定しない
import type {
  CharacterConfig,
  MatchOutcome,
  MatchRecord,
  PlayerMetrics,
  Stats,
} from '../model/index.ts'
import { confirmedMotion, type ConfirmedMotion } from './motion.ts'

export const STAT_ORDER = ['attackPower', 'defense', 'jumpPower', 'speed'] as const
export type StatKey = (typeof STAT_ORDER)[number]

export type StatChange = { key: StatKey; before: number; after: number; delta: number }

export type MetricDiff = { before: number | null; after: number | null; delta: number | null }

export type SideSummary = {
  matchNo: number
  outcome: MatchOutcome
  stocksLeft: { p1: number | null; p2: number | null }
}

export type ResultKey =
  | 'damageDealt'
  | 'damageTaken'
  | 'kos'
  | 'deaths'
  | 'maxDamageEndured'
  | 'recoverySuccess'
  | 'recoveryFailure'
export type ObservedKey = 'hitsLanded' | 'avgKnockbackDistance' | 'jumps' | 'moveDistance'

export type CompareNote =
  'p2_changed' | 'p1_unchanged' | 'duration_differs' | 'stage_differs' | 'appearance_differs'

/** 能力値と、確定の値の対応（1 つの能力値に、1 つの値） */
export const DERIVED_OF: Record<StatKey, keyof ConfirmedMotion> = {
  attackPower: 'damagePerHit',
  defense: 'knockbackDistance',
  jumpPower: 'jumpHeight',
  speed: 'moveSpeed',
}

export type ComparisonView = {
  left: SideSummary
  right: SideSummary
  /** 4 つすべて（変わっていないものは delta 0） */
  p1StatChanges: StatChange[]
  p2StatChanges: StatChange[]
  p1Unchanged: boolean
  p2Changed: boolean
  /** ②。1P の、変えた能力値の分だけ。確定の値（能力値から計算） */
  effects: { key: StatKey; delta: number; derived: MetricDiff }[]
  /** ③ の「しあいで みた うごき」（観察の値） */
  observed: Record<ObservedKey, { p1: MetricDiff; p2: MetricDiff }>
  results: Record<ResultKey, { p1: MetricDiff; p2: MetricDiff }>
  durationSec: { before: number; after: number }
  /** いちばん おおきく かわった すうじ（1P。差の絶対値が最大。同じ大きさなら STAT_ORDER の順）。変わっていなければ null */
  largestChange: StatKey | null
  notes: CompareNote[]
  stageDiffers: boolean
  appearanceDiffers: { p1: boolean; p2: boolean }
}

/** 試合の長さの差が、これ以上のとき、注意を出す（秒） */
export const DURATION_NOTE_SECONDS = 30

const diff = (before: number | null | undefined, after: number | null | undefined): MetricDiff => {
  const b = before ?? null
  const a = after ?? null
  return { before: b, after: a, delta: b === null || a === null ? null : a - b }
}

const statChanges = (a: Stats, b: Stats): StatChange[] =>
  STAT_ORDER.map((key) => ({ key, before: a[key], after: b[key], delta: b[key] - a[key] }))

const sameAppearance = (a: CharacterConfig, b: CharacterConfig) =>
  a.name === b.name && JSON.stringify(a.appearance) === JSON.stringify(b.appearance)

const metricsDiff = <K extends keyof PlayerMetrics>(
  a: PlayerMetrics | undefined,
  b: PlayerMetrics | undefined,
  key: K,
): MetricDiff => diff(a ? (a[key] as number | null) : null, b ? (b[key] as number | null) : null)

/** 左（前）と右（あと）の戦を比べる。戦の番号の小さいほうが、左 */
export function compare(a: MatchRecord, b: MatchRecord): ComparisonView {
  const [left, right] = a.matchNo <= b.matchNo ? [a, b] : [b, a]
  const p1StatChanges = statChanges(left.p1Config.stats, right.p1Config.stats)
  const p2StatChanges = statChanges(left.p2Config.stats, right.p2Config.stats)
  const p1Unchanged = p1StatChanges.every((c) => c.delta === 0)
  const p2Changed = p2StatChanges.some((c) => c.delta !== 0)

  const mL = confirmedMotion(left.p1Config.stats)
  const mR = confirmedMotion(right.p1Config.stats)
  const effects = p1StatChanges
    .filter((c) => c.delta !== 0)
    .map((c) => ({
      key: c.key,
      delta: c.delta,
      derived: diff(mL[DERIVED_OF[c.key]], mR[DERIVED_OF[c.key]]),
    }))

  let largest: StatChange | null = null
  for (const c of p1StatChanges) {
    if (c.delta === 0) continue
    if (!largest || Math.abs(c.delta) > Math.abs(largest.delta)) largest = c
  }

  const pair = (key: ResultKey | ObservedKey) => ({
    p1: metricsDiff(left.p1, right.p1, key),
    p2: metricsDiff(left.p2, right.p2, key),
  })
  const results = Object.fromEntries(
    (
      [
        'damageDealt',
        'damageTaken',
        'kos',
        'deaths',
        'maxDamageEndured',
        'recoverySuccess',
        'recoveryFailure',
      ] as const
    ).map((k) => [k, pair(k)]),
  ) as ComparisonView['results']
  const observed = Object.fromEntries(
    (['hitsLanded', 'avgKnockbackDistance', 'jumps', 'moveDistance'] as const).map((k) => [
      k,
      pair(k),
    ]),
  ) as ComparisonView['observed']

  const stageDiffers = JSON.stringify(left.stage) !== JSON.stringify(right.stage)
  const appearanceDiffers = {
    p1: !sameAppearance(left.p1Config, right.p1Config),
    p2: !sameAppearance(left.p2Config, right.p2Config),
  }

  const notes: CompareNote[] = []
  if (p2Changed) notes.push('p2_changed')
  if (p1Unchanged) notes.push('p1_unchanged')
  if (Math.abs(right.durationSec - left.durationSec) >= DURATION_NOTE_SECONDS)
    notes.push('duration_differs')
  if (stageDiffers) notes.push('stage_differs')
  if (appearanceDiffers.p1 || appearanceDiffers.p2) notes.push('appearance_differs')

  const side = (r: MatchRecord): SideSummary => ({
    matchNo: r.matchNo,
    outcome: r.outcome,
    stocksLeft: { p1: r.p1?.stocksLeft ?? null, p2: r.p2?.stocksLeft ?? null },
  })

  return {
    left: side(left),
    right: side(right),
    p1StatChanges,
    p2StatChanges,
    p1Unchanged,
    p2Changed,
    effects,
    observed,
    results,
    durationSec: { before: left.durationSec, after: right.durationSec },
    largestChange: largest ? largest.key : null,
    notes,
    stageDiffers,
    appearanceDiffers,
  }
}

export type CompareQuestionId = 'same' | StatKey

/**
 * 問いかけの選び方（comparison.md §7.1。決定的。1 つだけ）。
 * 1P の能力値が同じなら「同じ」。違えば、いちばん おおきく かわった すうじの、ひな形
 */
export function selectCompareQuestion(
  view: Pick<ComparisonView, 'p1Unchanged' | 'largestChange'>,
): CompareQuestionId {
  if (view.p1Unchanged || view.largestChange === null) return 'same'
  return view.largestChange
}

/** 比べられる戦の選び方（comparison.md §4）: 既定は、直前の戦と、いま終わった戦。戦が 2 つ未満なら null */
export function defaultPair(matches: readonly MatchRecord[]): [number, number] | null {
  if (matches.length < 2) return null
  return [matches[matches.length - 2]!.matchNo, matches[matches.length - 1]!.matchNo]
}

/** 2 つの戦の番号から、記録を引く。同じ戦・無い戦は、null。戦の番号の小さいほうが、左 */
export function pickPair(
  matches: readonly MatchRecord[],
  x: number,
  y: number,
): [MatchRecord, MatchRecord] | null {
  if (x === y) return null
  const a = matches.find((m) => m.matchNo === x)
  const b = matches.find((m) => m.matchNo === y)
  if (!a || !b) return null
  return a.matchNo < b.matchNo ? [a, b] : [b, a]
}
