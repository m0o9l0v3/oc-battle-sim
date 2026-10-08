import { describe, expect, it } from 'vitest'
import { reduceFlow } from './flow.ts'
import { createSession } from './state.ts'
import { syncSessionId } from './sync.ts'

const fresh = createSession()
const working = reduceFlow(fresh, { type: 'START' })

describe('sessionId の照合（event-control.md §9.1、data-model.md §6.4）', () => {
  it('同じ sessionId なら、何もしない', () => {
    expect(syncSessionId({ sessionId: 'a', restored: true }, working, 'a')).toBe('keep')
  })

  it('違う sessionId なら、破棄して S01 へ（一斉リセット、または受け取り損ねた台）', () => {
    expect(syncSessionId({ sessionId: 'a', restored: false }, working, 'b')).toBe('reset')
    expect(syncSessionId({ sessionId: 'a', restored: true }, working, 'b')).toBe('reset')
    expect(syncSessionId({ sessionId: 'a', restored: false }, fresh, 'b')).toBe('reset')
  })

  it('まだ持っていない（null）: このページで作ったデータなら、採用する（作業を消さない）', () => {
    expect(syncSessionId({ sessionId: null, restored: false }, working, 'a')).toBe('adopt')
    expect(syncSessionId({ sessionId: null, restored: false }, fresh, 'a')).toBe('adopt')
  })

  it('まだ持っていない（null）: 保存から復元したデータなら、破棄する（ターンをまたいだかもしれない）', () => {
    expect(syncSessionId({ sessionId: null, restored: true }, working, 'a')).toBe('reset')
  })

  it('復元したが、まだ何も作っていない（S01）なら、採用してよい', () => {
    expect(syncSessionId({ sessionId: null, restored: true }, fresh, 'a')).toBe('adopt')
  })
})
