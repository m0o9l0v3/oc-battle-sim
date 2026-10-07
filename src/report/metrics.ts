// 対戦指標の記録。仕様: docs/07-report/battle-report.md §4〜§6
// 試合中のイベントと、1 ステップごとの状態から、その場で積み上げる（試合のあとに、記録を読み直さない）。
//  - 同じ入力から、同じ結果（乱数・時計なし）。描画・DOM から独立していて、ユニットテストできる
//  - 1 ステップあたりの処理は、数個の数字の更新だけ（60 FPS に影響しない。NFR-03）。積み上げ用の数字は、
//    記録のためだけに持つ可変の状態（ここの外には出さない）。ステップごとに、新しい配列・オブジェクトを作らない
import type { MatchEvent, MatchState } from '../battle/index.ts'
import type {
  CharacterConfig,
  MatchOutcome,
  MatchResult,
  PlayerMetrics,
  StageData,
} from '../model/index.ts'

/** 撃墜に数える、「最後に当てた」から、撃墜までの長さ（5 秒 = 300 ステップ。battle-report.md §4.3） */
export const KO_ATTRIBUTION_STEPS = 300

/** 蓄積ダメージの上限（%）。これで止まったあとの増加は、与ダメージ・被ダメージに含めない（damage.md §4） */
export const DAMAGE_CAP = 999

type Side = {
  damageDealt: number
  damageTaken: number
  hitsLanded: number
  attacksThrown: number
  kos: number
  selfKos: number
  deaths: number
  maxDamageEndured: number
  recoverySuccess: number
  recoveryFailure: number
  jumps: number
  moveDistance: number
  /** 受けたヒットの、吹き飛んだ横の距離の合計と、数 */
  knockbackTotal: number
  knockbackCount: number
  /** 最後に当てられた時刻（ステップ）と相手。撃墜・リスポーンで消去する */
  lastHitStep: number | null
  lastHitBy: 0 | 1 | null
  /** いま吹き飛ばされている最中なら、始まりの位置（x）。そうでなければ null */
  knockbackFromX: number | null
}

const newSide = (): Side => ({
  damageDealt: 0,
  damageTaken: 0,
  hitsLanded: 0,
  attacksThrown: 0,
  kos: 0,
  selfKos: 0,
  deaths: 0,
  maxDamageEndured: 0,
  recoverySuccess: 0,
  recoveryFailure: 0,
  jumps: 0,
  moveDistance: 0,
  knockbackTotal: 0,
  knockbackCount: 0,
  lastHitStep: null,
  lastHitBy: null,
  knockbackFromX: null,
})

/**
 * 1 試合分の指標を、積み上げる記録係。試合ごとに 1 つ作る。
 * ステップごとに `record(prev, curr, events)` を呼び、試合が終わったら `result(curr)` で、指標を取り出す
 */
export class MetricsRecorder {
  private readonly sides: [Side, Side] = [newSide(), newSide()]
  private ended = false

  /**
   * 1 ステップを記録する。
   * @param prev そのステップの前の状態
   * @param curr そのステップの後の状態
   * @param events そのステップで起きたイベント（stepMatch の戻り値）
   */
  record(prev: MatchState, curr: MatchState, events: readonly MatchEvent[]): void {
    if (this.ended) return

    // 攻撃を出した瞬間（攻撃なし → 攻撃中）。攻撃を出した回数（画面には出さない）
    for (const i of [0, 1] as const) {
      if (prev.fighters[i].combat.attack === null && curr.fighters[i].combat.attack !== null) {
        this.sides[i].attacksThrown++
      }
    }

    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const a = this.sides[e.attacker]
          const v = this.sides[e.victim]
          // 蓄積の上限（999 %）で止まったあとの増加は、含めない
          const before = prev.fighters[e.victim].combat.damage
          const dealt = Math.max(
            0,
            Math.min(e.damageDealt, e.damageAfter - before, DAMAGE_CAP - before),
          )
          a.damageDealt += dealt
          a.hitsLanded++
          v.damageTaken += dealt
          v.lastHitStep = e.step
          v.lastHitBy = e.attacker
          // 吹き飛び始めの位置（ふっとんだ きょりの測定の開始）
          v.knockbackFromX = curr.fighters[e.victim].body.x
          break
        }
        case 'jump':
          this.sides[e.fighter].jumps++
          break
        case 'move':
          this.sides[e.fighter].moveDistance += e.distance
          break
        case 'ko': {
          const v = this.sides[e.fighter]
          v.deaths++
          // 直前 5 秒以内に、相手の攻撃を受けていれば、相手の撃墜。そうでなければ、自滅
          if (
            v.lastHitBy !== null &&
            v.lastHitStep !== null &&
            e.step - v.lastHitStep <= KO_ATTRIBUTION_STEPS
          ) {
            this.sides[v.lastHitBy].kos++
          } else {
            v.selfKos++
          }
          this.endKnockback(e.fighter, curr)
          // 前のストックの記録が、次のストックの撃墜の判定に、残らないようにする
          v.lastHitStep = null
          v.lastHitBy = null
          break
        }
        case 'respawn':
          this.sides[e.fighter].lastHitStep = null
          this.sides[e.fighter].lastHitBy = null
          break
        case 'recovery_success':
          this.sides[e.fighter].recoverySuccess++
          break
        case 'recovery_failure':
          this.sides[e.fighter].recoveryFailure++
          break
        case 'match_end':
          // 吹き飛ばされている最中の側がいれば、その時点の位置で測定を終える
          this.endKnockback(0, curr)
          this.endKnockback(1, curr)
          this.ended = true
          break
        default:
          break
      }
    }

    for (const i of [0, 1] as const) {
      const s = this.sides[i]
      const f = curr.fighters[i]
      // 蓄積ダメージの最大値（撃墜で 0 に戻る前の値を含む）
      if (f.combat.damage > s.maxDamageEndured) s.maxDamageEndured = f.combat.damage
      // やられ中が終わった: 吹き飛んだ距離を確定する
      if (
        s.knockbackFromX !== null &&
        prev.fighters[i].combat.hitstun > 0 &&
        f.combat.hitstun === 0
      ) {
        this.endKnockback(i, curr)
      }
    }
  }

  private endKnockback(i: 0 | 1, curr: MatchState): void {
    const s = this.sides[i]
    if (s.knockbackFromX === null) return
    s.knockbackTotal += Math.abs(curr.fighters[i].body.x - s.knockbackFromX)
    s.knockbackCount++
    s.knockbackFromX = null
  }

  /** 試合が終わったときの指標（1P、2P）。残りのストックは、試合の終わりの状態から */
  result(end: MatchState): [PlayerMetrics, PlayerMetrics] {
    const make = (i: 0 | 1): PlayerMetrics => {
      const s = this.sides[i]
      return {
        stocksLeft: Math.max(0, end.fighters[i].stocks),
        damageDealt: s.damageDealt,
        damageTaken: s.damageTaken,
        hitsLanded: s.hitsLanded,
        attacksThrown: s.attacksThrown,
        kos: s.kos,
        selfKos: s.selfKos,
        deaths: s.deaths,
        // 試合の終わりの値も含める（撃墜されなかった場合）
        maxDamageEndured: Math.max(s.maxDamageEndured, end.fighters[i].combat.damage),
        recoverySuccess: s.recoverySuccess,
        recoveryFailure: s.recoveryFailure,
        jumps: s.jumps,
        moveDistance: s.moveDistance,
        avgKnockbackDistance: s.knockbackCount > 0 ? s.knockbackTotal / s.knockbackCount : null,
      }
    }
    return [make(0), make(1)]
  }
}

/** 戦の結果（MatchResult）。その戦で使った設定とステージを、紐づける（battle-report.md §6） */
export function buildMatchResult(input: {
  matchNo: number
  p1Config: CharacterConfig
  p2Config: CharacterConfig
  stage: StageData
  outcome: MatchOutcome
  durationSec: number
  metrics: [PlayerMetrics, PlayerMetrics]
}): MatchResult {
  return {
    schemaVersion: 1,
    matchNo: input.matchNo,
    p1Config: input.p1Config,
    p2Config: input.p2Config,
    stage: input.stage,
    outcome: input.outcome,
    durationSec: input.durationSec,
    p1: input.metrics[0],
    p2: input.metrics[1],
  }
}

const METRIC_KEYS = [
  'stocksLeft',
  'damageDealt',
  'damageTaken',
  'hitsLanded',
  'attacksThrown',
  'kos',
  'selfKos',
  'deaths',
  'maxDamageEndured',
  'recoverySuccess',
  'recoveryFailure',
  'jumps',
  'moveDistance',
] as const

/** 保存・読み込みの検証用。指標の形が正しいか（すべて、0 以上の有限の数。平均の距離は、数または null） */
export function isPlayerMetrics(v: unknown): v is PlayerMetrics {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  for (const k of METRIC_KEYS) {
    const n = r[k]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false
  }
  const a = r.avgKnockbackDistance
  return a === null || (typeof a === 'number' && Number.isFinite(a) && a >= 0)
}
