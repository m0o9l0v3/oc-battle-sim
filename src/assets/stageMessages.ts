// ステージの違反 → 参加者向けのメッセージ。仕様: docs/04-stage/validation.md §6
// 文言は messages.ts。ここは、違反から文を選び、重要な順に並べる。
import { DEFAULT_STAGE_RULES, type StageRules, type StageViolation } from '../stage/index.ts'
import { messages } from './messages.ts'

const m = messages.stageRules

/** 1件の違反の、メッセージ。数値は、検証の規則から作る */
export function describeViolation(
  v: StageViolation,
  rules: StageRules = DEFAULT_STAGE_RULES,
): string {
  switch (v.code) {
    case 'BLOCKS_TOO_FEW':
      return m.BLOCKS_TOO_FEW(v.detail ?? 0)
    case 'BLOCKS_TOO_MANY':
      return m.BLOCKS_TOO_MANY(v.detail ?? 0)
    case 'MAIN_PLATFORM_NARROW':
      return m.MAIN_PLATFORM_NARROW(rules.mainPlatformMin)
    case 'PLATFORM_TOO_NARROW':
      return m.PLATFORM_TOO_NARROW(rules.platformMin)
    case 'STAGE_TOO_HIGH':
      return m.STAGE_TOO_HIGH(rules.topEmptyRows)
    default:
      return m[v.code]
  }
}

/** 重要な順（MALFORMED > スポーン > 足場 > 数）。同じ重要度は、検証が返した順 */
const PRIORITY: Record<StageViolation['code'], number> = {
  MALFORMED: 0,
  SCHEMA_UNSUPPORTED: 0,
  SPAWN_MISSING: 1,
  SPAWN_OUT_OF_RANGE: 1,
  SPAWN_BLOCKED: 1,
  SPAWN_NO_GROUND: 1,
  SPAWN_TOO_CLOSE: 1,
  UNREACHABLE: 2,
  PLATFORM_TOO_NARROW: 2,
  MAIN_PLATFORM_NARROW: 2,
  STAGE_TOO_HIGH: 2,
  BLOCKS_TOO_FEW: 3,
  BLOCKS_TOO_MANY: 3,
  NAME_TOO_LONG: 3,
}

export type ViolationSummary = {
  /** 画面に出す、最初の件（重要な順） */
  shown: { violation: StageViolation; message: string }[]
  /** 「ほかにも ○こ あるよ」。残りがなければ null */
  others: string | null
}

/** 複数の違反を、最初の limit 件（既定 3）と、残りの件数にまとめる */
export function summarizeViolations(
  violations: readonly StageViolation[],
  limit = 3,
  rules: StageRules = DEFAULT_STAGE_RULES,
): ViolationSummary {
  const sorted = violations
    .map((violation, i) => ({ violation, i }))
    .sort((a, b) => PRIORITY[a.violation.code] - PRIORITY[b.violation.code] || a.i - b.i)
    .map((x) => x.violation)
  const shown = sorted
    .slice(0, limit)
    .map((violation) => ({ violation, message: describeViolation(violation, rules) }))
  const rest = sorted.length - shown.length
  return { shown, others: rest > 0 ? m.others(rest) : null }
}
