// 簡易CPUの入力ソース。キーボード・仮想パッドと同じ InputSource として、対戦につなぐ（frontend.md §5.3）
import {
  NO_INPUT,
  type InputSource,
  type MatchContext,
  type MatchState,
  type PlayerInput,
  type SampleContext,
} from '../battle/index.ts'
import { createCpu, cpuSetupOf, type CpuDecision } from './brain.ts'
import type { CpuLevel } from './level.ts'
import { viewOf } from './view.ts'

/**
 * 盤面（observation に、そのステップの MatchState を渡す）を読み、入力を返す。
 * 盤面は、見てよいもの（viewOf）だけに写してから、判断に使う
 */
export class CpuSource implements InputSource<MatchState> {
  private readonly slot: 0 | 1
  private readonly decide: ReturnType<typeof createCpu>
  /** 直前の判断（テスト・開発用の表示） */
  last: CpuDecision | null = null

  constructor(ctx: MatchContext, slot: 0 | 1, level: CpuLevel, seed: number) {
    this.slot = slot
    this.decide = createCpu(cpuSetupOf(ctx, slot), level, seed)
  }

  sample({ observation }: SampleContext<MatchState>): PlayerInput {
    if (!observation) return NO_INPUT
    this.last = this.decide(viewOf(observation, this.slot))
    return this.last.input
  }

  dispose() {}
}
