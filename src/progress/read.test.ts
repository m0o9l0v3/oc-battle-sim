import { describe, expect, it } from 'vitest'
import type { ProgressState } from '../model/index.ts'
import { readProgressState } from './read.ts'

const valid: ProgressState = {
  phase: 'BATTLE',
  sessionId: '6b0c3f43-2f0a-4d1e-9a0e-4b7a1f1c2d3e',
  revision: 3,
  turnStartedAt: 1_760_000_000_000,
  turnEndsAt: 1_760_001_140_000,
  rematchOpen: true,
  serverTime: 1_760_000_100_000,
}

describe('進行状態の検証', () => {
  it('正しい形は、そのまま通る。タイマー未開始（null）も通る', () => {
    expect(readProgressState(valid)).toEqual(valid)
    const fresh = { ...valid, phase: 'PREPARE', turnStartedAt: null, turnEndsAt: null }
    expect(readProgressState(fresh)).toEqual(fresh)
  })

  it('余分なキーは、捨てる', () => {
    expect(readProgressState({ ...valid, extra: 'x' })).toEqual(valid)
  })

  it('形が違えば null', () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'BATTLE',
      [],
      {},
      { ...valid, phase: 1 },
      { ...valid, phase: '' },
      { ...valid, sessionId: '' },
      { ...valid, sessionId: 5 },
      { ...valid, sessionId: 'x'.repeat(65) },
      { ...valid, revision: -1 },
      { ...valid, revision: 1.5 },
      { ...valid, revision: '3' },
      { ...valid, turnStartedAt: Number.NaN },
      { ...valid, turnEndsAt: 'later' },
      { ...valid, rematchOpen: 1 },
      { ...valid, serverTime: null },
      { ...valid, serverTime: -1 },
    ]
    for (const v of bad) expect(readProgressState(v), JSON.stringify(v)).toBeNull()
  })

  it('未知のフェーズ: 既定は null。allowUnknownPhase のときは、受け付ける（§6.2: すべて許可にする）', () => {
    const v = { ...valid, phase: 'FINISHING' }
    expect(readProgressState(v)).toBeNull()
    expect(readProgressState(v, { allowUnknownPhase: true })?.phase).toBe('FINISHING')
    expect(
      readProgressState({ ...valid, phase: 'x'.repeat(33) }, { allowUnknownPhase: true }),
    ).toBeNull()
  })
})
