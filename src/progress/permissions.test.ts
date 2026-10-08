import { describe, expect, it } from 'vitest'
import type { Phase, ProgressState } from '../model/index.ts'
import { offersTakeHome, permissionsOf, type Operation } from './permissions.ts'
import { PHASES } from './phase.ts'

const p = (phase: Phase | string, rematchOpen = true): ProgressState => ({
  phase: phase as Phase,
  sessionId: 's',
  revision: 1,
  turnStartedAt: null,
  turnEndsAt: null,
  rematchOpen,
  serverTime: 0,
})

const OPS: Operation[] = ['fighter', 'stage', 'test', 'battle', 'rematch', 'share']

describe('フェーズごとの操作の可否（event-control.md §6.2）', () => {
  it('表のとおり', () => {
    const table: Record<Phase, string> = {
      // fighter stage test battle rematch share
      PREPARE: '××××××',
      PRODUCTION: '○○○○××',
      BATTLE: '○○○○○○',
      SHARING: '×××××○',
      BUFFER: '○○○○○○',
      ENDED: '××××××',
    }
    for (const phase of PHASES) {
      const got = OPS.map((op) => (permissionsOf(p(phase))[op] ? '○' : '×')).join('')
      expect(got, phase).toBe(table[phase])
    }
  })

  it('再戦の受付が止まっているときは、再戦だけ不可。ほかは変わらない（§6.3）', () => {
    for (const phase of PHASES) {
      const open = permissionsOf(p(phase, true))
      const closed = permissionsOf(p(phase, false))
      expect(closed.rematch).toBe(false)
      for (const op of OPS.filter((o) => o !== 'rematch')) expect(closed[op]).toBe(open[op])
    }
  })

  it('進行状態がない（未取得・通信不能が続いた）とき、未知のフェーズのときは、すべて許可（§6.2、§10）', () => {
    for (const op of OPS) {
      expect(permissionsOf(null)[op]).toBe(true)
      expect(permissionsOf(p('FINISHING'))[op]).toBe(true)
    }
    // 未知のフェーズでも、再戦の受付の停止は効く
    expect(permissionsOf(p('FINISHING', false)).rematch).toBe(false)
  })

  it('「もちかえる」ボタンは、SHARING と BUFFER だけ（§5.3）', () => {
    expect(PHASES.filter((ph) => offersTakeHome(p(ph)))).toEqual(['SHARING', 'BUFFER'])
    expect(offersTakeHome(null)).toBe(false)
  })
})
