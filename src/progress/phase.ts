// フェーズの一覧と表示名。仕様: docs/01-experience/event-control.md §5.1
import type { Phase } from '../model/progress.ts'

/** 進行の順（§5.2） */
export const PHASES: readonly Phase[] = [
  'PREPARE',
  'PRODUCTION',
  'BATTLE',
  'SHARING',
  'BUFFER',
  'ENDED',
]

export const isPhase = (v: unknown): v is Phase =>
  typeof v === 'string' && (PHASES as readonly string[]).includes(v)

/** 日本語の表示（§5.1） */
export const PHASE_LABELS: Record<Phase, string> = {
  PREPARE: '準備中',
  PRODUCTION: '制作中',
  BATTLE: '対戦中',
  SHARING: 'もちかえる',
  BUFFER: '予備時間',
  ENDED: 'おしまい',
}
