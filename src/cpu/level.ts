// 簡易CPUの強さ。docs/03-combat/cpu-opponent.md §6
// 強さは、ここの数値だけで変える（行動の種類や、物理・能力値は変えない）

export type CpuLevel = {
  /** 相手の動きに反応するまでの遅れ（ステップ。1 ステップ = 1/60 秒）。相手の位置・攻撃は、この分だけ前のものを見る */
  reactionSteps: number
  /** 判断を見直す間隔（ステップ）。攻撃・ミスの抽選は、この間隔ごとに 1 回 */
  thinkSteps: number
  /** 攻撃が届くときに、攻撃する確率（判断ごと） */
  attackChance: number
  /** 相手の攻撃に、回避（離れる・ジャンプでかわす）で応じる確率（相手の攻撃ごとに 1 回） */
  evadeChance: number
  /** 自分の攻撃が終わったあと、距離を取る確率 */
  retreatChance: number
  /** 間合いを読み違えて、届かない距離で攻撃してしまう確率（判断ごと） */
  missChance: number
}

export type CpuLevelId = 'easy' | 'normal' | 'hard'

export const CPU_LEVELS: Readonly<Record<CpuLevelId, Readonly<CpuLevel>>> = Object.freeze({
  easy: Object.freeze({
    reactionSteps: 14,
    thinkSteps: 8,
    attackChance: 0.35,
    evadeChance: 0.15,
    retreatChance: 0.2,
    missChance: 0.3,
  }),
  normal: Object.freeze({
    reactionSteps: 8,
    thinkSteps: 4,
    attackChance: 0.6,
    evadeChance: 0.35,
    retreatChance: 0.3,
    missChance: 0.15,
  }),
  hard: Object.freeze({
    reactionSteps: 4,
    thinkSteps: 3,
    attackChance: 0.8,
    evadeChance: 0.6,
    retreatChance: 0.4,
    missChance: 0.05,
  }),
})

export const DEFAULT_CPU_LEVEL_ID: CpuLevelId = 'normal'

/** 調整してよい範囲（cpu-opponent.md §6.2）。この外の値は、範囲に収める */
export const CPU_LEVEL_RANGE: Readonly<Record<keyof CpuLevel, readonly [number, number]>> =
  Object.freeze({
    reactionSteps: [4, 30],
    thinkSteps: [2, 15],
    attackChance: [0, 1],
    evadeChance: [0, 1],
    retreatChance: [0, 1],
    missChance: [0, 0.5],
  })

const KEYS = Object.keys(CPU_LEVEL_RANGE) as (keyof CpuLevel)[]
const INTEGER_KEYS: readonly (keyof CpuLevel)[] = ['reactionSteps', 'thinkSteps']

/** 範囲に収める（ステップ数は整数に丸める）。数でない値は、標準の値にする */
export function clampCpuLevel(level: Partial<CpuLevel>): CpuLevel {
  const base = CPU_LEVELS[DEFAULT_CPU_LEVEL_ID]
  const out = { ...base }
  for (const k of KEYS) {
    const v = level[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const [lo, hi] = CPU_LEVEL_RANGE[k]
    const n = INTEGER_KEYS.includes(k) ? Math.round(v) : v
    out[k] = Math.min(hi, Math.max(lo, n))
  }
  return out
}
