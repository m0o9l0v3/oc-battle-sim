import { describe, expect, it } from 'vitest'
import type { Phase, ProgressState, ScreenId } from '../model/index.ts'
import { PHASES } from '../progress/index.ts'
import { presetStage } from '../stage/index.ts'
import { reduceFlow, type FlowAction } from './flow.ts'
import {
  BLOCK_REASONS,
  blockReason,
  isAllowed,
  NO_HOST,
  operationBlocked,
  screenBlocked,
  type HostContext,
} from './gate.ts'
import { createSession, type Session } from './state.ts'

const run = (s: Session, ...a: FlowAction[]) => a.reduce(reduceFlow, s)
const win = { winner: 'p1', reason: 'stocks' } as const

const progress = (phase: Phase, rematchOpen = true): ProgressState => ({
  phase,
  sessionId: 's',
  revision: 1,
  turnStartedAt: null,
  turnEndsAt: null,
  rematchOpen,
  serverTime: 0,
})
const at = (phase: Phase, rematchOpen = true): HostContext => {
  const p = progress(phase, rematchOpen)
  return { live: p, last: p }
}

const s01 = createSession()
const s02 = run(s01, { type: 'START' })
const s06 = run(
  s02,
  { type: 'NEXT' },
  { type: 'NEXT' },
  { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' },
  { type: 'NEXT' },
)
const s07 = run(s06, { type: 'BEGIN_MATCH' })
const s08 = run(s07, { type: 'FINISH_MATCH', outcome: win, durationSec: 30 })
const s09 = run(s08, { type: 'REDESIGN' })
const s09changed = run(s09, {
  type: 'SET_P1',
  config: { ...s09.data.p1, stats: { attackPower: 6, defense: 4, jumpPower: 5, speed: 5 } },
})
const s10 = run(s09changed, { type: 'BEGIN_MATCH' })
const s11 = run(s10, { type: 'FINISH_MATCH', outcome: win, durationSec: 30 })

it('前提: 画面の順', () => {
  expect([s01, s02, s06, s07, s08, s09, s10, s11].map((s) => s.data.screen)).toEqual([
    'S01',
    'S02',
    'S06',
    'S07',
    'S08',
    'S09',
    'S10',
    'S11',
  ])
})

describe('操作の可否（event-control.md §12）', () => {
  it('S01 の「はじめる」: PREPARE・SHARING・ENDED では押せない', () => {
    const ok = PHASES.filter((ph) => isAllowed(at(ph), s01, { type: 'START' }))
    expect(ok).toEqual(['PRODUCTION', 'BATTLE', 'BUFFER'])
  })

  it('S02〜S06・S08 の画面の操作: PRODUCTION・BATTLE・BUFFER だけ', () => {
    for (const screen of ['S02', 'S03', 'S04', 'S05', 'S06', 'S08'] as ScreenId[]) {
      const ok = PHASES.filter((ph) => !screenBlocked(at(ph), screen))
      expect(ok, screen).toEqual(['PRODUCTION', 'BATTLE', 'BUFFER'])
    }
    expect(isAllowed(at('SHARING'), s02, { type: 'NEXT' })).toBe(false)
    expect(isAllowed(at('PRODUCTION'), s02, { type: 'NEXT' })).toBe(true)
  })

  it('第1戦の開始（S06）は、PRODUCTION から', () => {
    const ok = PHASES.filter((ph) => isAllowed(at(ph), s06, { type: 'BEGIN_MATCH' }))
    expect(ok).toEqual(['PRODUCTION', 'BATTLE', 'BUFFER'])
  })

  it('S09 へ（設定を変えて再戦）・再戦の開始: BATTLE・BUFFER だけ。再戦の受付が止まっていれば、できない', () => {
    for (const [s, a] of [
      [s08, { type: 'REDESIGN' }],
      [s11, { type: 'REDESIGN' }],
      [s09changed, { type: 'BEGIN_MATCH' }],
    ] as const) {
      expect(PHASES.filter((ph) => isAllowed(at(ph), s, a))).toEqual(['BATTLE', 'BUFFER'])
      expect(isAllowed(at('BATTLE', false), s, a)).toBe(false)
      expect(isAllowed(at('BUFFER', false), s, a)).toBe(false)
    }
  })

  it('再戦の途中で更新（再開）した S06 の「対戦開始」は、再戦として扱う', () => {
    const resumed: Session = { ...s11, data: { ...s11.data, screen: 'S06' } }
    expect(isAllowed(at('PRODUCTION'), resumed, { type: 'BEGIN_MATCH' })).toBe(false)
    expect(isAllowed(at('BATTLE', false), resumed, { type: 'BEGIN_MATCH' })).toBe(false)
    expect(isAllowed(at('BATTLE'), resumed, { type: 'BEGIN_MATCH' })).toBe(true)
  })

  it('再戦の受付が止まっても、S09 で「もどる」ができ、S11 の「おわる」で S12 へ行ける', () => {
    const ctx = at('BATTLE', false)
    expect(screenBlocked(ctx, 'S09')).toBe(false)
    expect(isAllowed(ctx, s09, { type: 'BACK' })).toBe(true)
    expect(isAllowed(ctx, s11, { type: 'END' })).toBe(true)
  })

  it('S11 の「おわる」（S12 へ）: BATTLE・SHARING・BUFFER', () => {
    const ok = PHASES.filter((ph) => isAllowed(at(ph), s11, { type: 'END' }))
    expect(ok).toEqual(['BATTLE', 'SHARING', 'BUFFER'])
  })

  it('「もちかえる」（SHARE）: SHARING・BUFFER だけ', () => {
    const ok = PHASES.filter((ph) => isAllowed(at(ph), s02, { type: 'SHARE' }))
    expect(ok).toEqual(['SHARING', 'BUFFER'])
  })

  it('進行中の対戦は止めない: 勝敗の確定は、どのフェーズでも通る。S07・S10 の画面は止まらない', () => {
    for (const ph of PHASES) {
      expect(
        isAllowed(at(ph, false), s07, { type: 'FINISH_MATCH', outcome: win, durationSec: 1 }),
      ).toBe(true)
      expect(
        isAllowed(at(ph, false), s10, { type: 'FINISH_MATCH', outcome: win, durationSec: 1 }),
      ).toBe(true)
      expect(screenBlocked(at(ph), 'S07')).toBe(false)
      expect(screenBlocked(at(ph), 'S10')).toBe(false)
    }
  })

  it('リセットは、いつでも通る', () => {
    for (const ph of PHASES) expect(isAllowed(at(ph), s08, { type: 'RESET' })).toBe(true)
  })

  it('親機がない・通信不能が続いた（live が null）ときは、すべて許可。「もちかえる」は、最後に分かったフェーズで出す', () => {
    const actions: [Session, FlowAction][] = [
      [s01, { type: 'START' }],
      [s02, { type: 'NEXT' }],
      [s06, { type: 'BEGIN_MATCH' }],
      [s08, { type: 'REDESIGN' }],
      [s09changed, { type: 'BEGIN_MATCH' }],
      [s11, { type: 'END' }],
    ]
    const lastSharing: HostContext = { live: null, last: progress('SHARING') }
    for (const [s, a] of actions) {
      expect(isAllowed(NO_HOST, s, a)).toBe(true)
      expect(isAllowed(lastSharing, s, a)).toBe(true)
    }
    expect(isAllowed(NO_HOST, s02, { type: 'SHARE' })).toBe(false)
    expect(isAllowed(lastSharing, s02, { type: 'SHARE' })).toBe(true)
  })
})

describe('押せない理由', () => {
  it('フェーズで決まる理由', () => {
    expect(blockReason(at('PREPARE'), 'fighter')).toBe(BLOCK_REASONS.prepare)
    expect(blockReason(at('SHARING'), 'rematch')).toBe(BLOCK_REASONS.sharing)
    expect(blockReason(at('ENDED'), 'battle')).toBe(BLOCK_REASONS.ended)
  })

  it('再戦の受付の停止・制作中の再戦は「いまは さいせんは できません」', () => {
    expect(operationBlocked(at('BATTLE', false), 'rematch')).toBe(true)
    expect(blockReason(at('BATTLE', false), 'rematch')).toBe(BLOCK_REASONS.rematch)
    expect(blockReason(at('PRODUCTION'), 'rematch')).toBe(BLOCK_REASONS.rematch)
  })
})
