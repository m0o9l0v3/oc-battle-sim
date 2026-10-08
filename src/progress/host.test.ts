import { describe, expect, it } from 'vitest'
import type { Phase } from '../model/index.ts'
import {
  adminView,
  applyCommand,
  canApply,
  createHostProgress,
  formatRemaining,
  HOST_COMMANDS,
  readHostProgress,
  toProgressState,
  TURN_DURATION_MS,
  type HostCommand,
  type HostProgress,
} from './host.ts'
import { PHASES } from './phase.ts'
import { readProgressState } from './read.ts'

const T0 = 1_760_000_000_000
let seq = 0
const ctx = (now = T0) => ({ now, newSessionId: `s-${++seq}` })

/** 成功する前提で、操作を続けて適用する */
function run(p: HostProgress, ...commands: HostCommand[]): HostProgress {
  return commands.reduce((s, c) => {
    const r = applyCommand(s, c, ctx())
    if (!r.ok) throw new Error(`${c} は ${s.phase} で押せない`)
    return r.progress
  }, p)
}

const at = (phase: Phase): HostProgress => {
  const path: Record<Phase, HostCommand[]> = {
    PREPARE: [],
    PRODUCTION: ['START_PRODUCTION'],
    BATTLE: ['START_PRODUCTION', 'START_BATTLE'],
    SHARING: ['START_PRODUCTION', 'START_BATTLE', 'START_SHARING'],
    BUFFER: ['START_PRODUCTION', 'START_BATTLE', 'START_SHARING', 'TO_BUFFER'],
    ENDED: ['START_PRODUCTION', 'START_BATTLE', 'START_SHARING', 'END'],
  }
  return run(createHostProgress('first'), ...path[phase])
}

describe('親機の進行状態（event-control.md §5.2・§7.2・§9.1）', () => {
  it('起動直後は、準備中・タイマー未開始・再戦は受付中', () => {
    expect(createHostProgress('abc')).toEqual({
      phase: 'PREPARE',
      sessionId: 'abc',
      revision: 0,
      turnStartedAt: null,
      turnEndsAt: null,
      rematchOpen: true,
    })
  })

  it('制作開始 → 対戦開始 → 持ち帰り開始 → 予備時間へ → 終了 の順に進む', () => {
    let p = createHostProgress('a')
    const seen: Phase[] = [p.phase]
    for (const c of [
      'START_PRODUCTION',
      'START_BATTLE',
      'START_SHARING',
      'TO_BUFFER',
      'END',
    ] as const) {
      p = run(p, c)
      seen.push(p.phase)
    }
    expect(seen).toEqual(['PREPARE', 'PRODUCTION', 'BATTLE', 'SHARING', 'BUFFER', 'ENDED'])
    expect(p.revision).toBe(5)
  })

  it('遅れた組がいなければ、持ち帰り（SHARING）から、直接「終了」できる', () => {
    expect(run(at('SHARING'), 'END').phase).toBe('ENDED')
  })

  it('順番を飛ばす・戻す遷移は、押せない（状態は変わらない）', () => {
    const allowed: Record<Phase, HostCommand[]> = {
      PREPARE: ['START_PRODUCTION'],
      PRODUCTION: ['START_BATTLE'],
      BATTLE: ['START_SHARING'],
      SHARING: ['TO_BUFFER', 'END'],
      BUFFER: ['END'],
      ENDED: [],
    }
    const moves = ['START_PRODUCTION', 'START_BATTLE', 'START_SHARING', 'TO_BUFFER', 'END'] as const
    for (const phase of PHASES) {
      const p = at(phase)
      for (const c of moves) {
        const r = applyCommand(p, c, ctx())
        expect(r.ok, `${phase} で ${c}`).toBe(allowed[phase].includes(c))
        if (!r.ok) expect(r.error).toBe('not_allowed')
      }
    }
  })

  it('制作開始で、ターンのタイマーが始まる。終了予定は 19 分後（ターン全体が 0:00〜20:00）', () => {
    const r = applyCommand(createHostProgress('a'), 'START_PRODUCTION', ctx(T0 + 60_000))
    expect(r.ok && r.progress.turnStartedAt).toBe(T0 + 60_000)
    expect(r.ok && r.progress.turnEndsAt).toBe(T0 + 60_000 + 19 * 60_000)
    expect(TURN_DURATION_MS).toBe(19 * 60_000)
  })

  it('フェーズを進めても、タイマーは変わらない', () => {
    const p = at('PRODUCTION')
    const q = run(p, 'START_BATTLE', 'START_SHARING')
    expect(q.turnStartedAt).toBe(p.turnStartedAt)
    expect(q.turnEndsAt).toBe(p.turnEndsAt)
  })

  it('再戦の受付は、どのフェーズでも、止める・再開できる。フェーズは変わらない', () => {
    for (const phase of PHASES) {
      const p = at(phase)
      const stopped = run(p, 'STOP_REMATCH')
      expect(stopped.rematchOpen).toBe(false)
      expect(stopped.phase).toBe(phase)
      expect(stopped.revision).toBe(p.revision + 1)
      expect(run(stopped, 'OPEN_REMATCH').rematchOpen).toBe(true)
    }
  })

  it('すでに止まっているときの「止める」、受付中の「再開する」は、押せない（revision は増えない）', () => {
    const p = createHostProgress('a')
    expect(applyCommand(p, 'OPEN_REMATCH', ctx()).ok).toBe(false)
    const stopped = run(p, 'STOP_REMATCH')
    expect(applyCommand(stopped, 'STOP_REMATCH', ctx()).ok).toBe(false)
  })

  it('一斉リセット: どのフェーズからも、準備中へ。sessionId を更新し、revision を増やし、タイマーと再戦の受付を初期化', () => {
    for (const phase of PHASES) {
      const p = run(at(phase), 'STOP_REMATCH')
      const r = applyCommand(p, 'RESET', { now: T0, newSessionId: 'next-turn' })
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.progress).toEqual({
        phase: 'PREPARE',
        sessionId: 'next-turn',
        revision: p.revision + 1,
        turnStartedAt: null,
        turnEndsAt: null,
        rematchOpen: true,
      })
    }
  })

  it('操作は、元の状態を書き換えない', () => {
    const p = createHostProgress('a')
    const copy = structuredClone(p)
    run(p, 'START_PRODUCTION', 'STOP_REMATCH', 'RESET')
    expect(p).toEqual(copy)
  })

  it('配信する形は、進行状態だけ（§8.1 の 7 項目）', () => {
    const s = toProgressState(at('BATTLE'), T0 + 5)
    expect(Object.keys(s).sort()).toEqual(
      [
        'phase',
        'sessionId',
        'revision',
        'turnStartedAt',
        'turnEndsAt',
        'rematchOpen',
        'serverTime',
      ].sort(),
    )
    expect(s.serverTime).toBe(T0 + 5)
    expect(readProgressState(s)).toEqual(s)
  })
})

describe('保存からの読み戻し（親機の再起動）', () => {
  it('保存した状態を、そのまま読み戻せる', () => {
    const p = run(at('BATTLE'), 'STOP_REMATCH')
    expect(readHostProgress(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('壊れた保存は null（新しい状態で始める）', () => {
    const p = at('BATTLE')
    for (const bad of [
      null,
      'x',
      [],
      {},
      { ...p, phase: 'FINISHING' },
      { ...p, sessionId: '' },
      { ...p, revision: -1 },
      { ...p, revision: 1.5 },
      { ...p, turnStartedAt: 'now' },
      { ...p, rematchOpen: 'yes' },
    ]) {
      expect(readHostProgress(bad)).toBeNull()
    }
  })
})

describe('管理画面の表示（§7.1）', () => {
  it('フェーズの日本語表示・次に押すボタン・押せるボタン', () => {
    const next: Record<Phase, HostCommand> = {
      PREPARE: 'START_PRODUCTION',
      PRODUCTION: 'START_BATTLE',
      BATTLE: 'START_SHARING',
      SHARING: 'END',
      BUFFER: 'END',
      ENDED: 'RESET',
    }
    for (const phase of PHASES) {
      const p = at(phase)
      const v = adminView(p, T0)
      expect(v.nextCommand).toBe(next[phase])
      expect(v.commands[v.nextCommand]).toBe(true)
      for (const c of HOST_COMMANDS) expect(v.commands[c]).toBe(canApply(p, c))
    }
    expect(adminView(at('SHARING'), T0).phaseLabel).toBe('もちかえる')
  })

  it('残り時間: 未開始は null。制作開始からの経過で減り、過ぎると負', () => {
    expect(adminView(createHostProgress('a'), T0).remainingMs).toBeNull()
    const r = applyCommand(createHostProgress('a'), 'START_PRODUCTION', ctx(T0))
    if (!r.ok) throw new Error()
    expect(adminView(r.progress, T0 + 60_000).remainingMs).toBe(18 * 60_000)
    expect(adminView(r.progress, T0 + 20 * 60_000).remainingMs).toBe(-60_000)
  })

  it('残り時間の表示', () => {
    expect(formatRemaining(null)).toBe('—')
    expect(formatRemaining(19 * 60_000)).toBe('19:00')
    expect(formatRemaining(61_500)).toBe('1:02')
    expect(formatRemaining(0)).toBe('0:00')
    expect(formatRemaining(-500)).toBe('-0:01')
    expect(formatRemaining(-65_000)).toBe('-1:05')
  })
})
