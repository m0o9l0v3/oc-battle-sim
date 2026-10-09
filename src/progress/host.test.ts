import { describe, expect, it } from 'vitest'
import type { Phase } from '../model/index.ts'
import {
  adminView,
  applyAction,
  applyCommand,
  DEFAULT_PLAN,
  MAX_ADJUST_MS,
  readHostAction,
  type ApplyResult,
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
const MIN = 60_000

/** 成功する前提で、結果を取り出す */
function must(r: ApplyResult): HostProgress {
  if (!r.ok) throw new Error(r.error)
  return r.progress
}
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
      phaseStartedAt: null,
      phaseEndsAt: null,
      plan: DEFAULT_PLAN,
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
      // 制作中からも、持ち帰りへ進める（対戦を飛ばす。§7.5）
      PRODUCTION: ['START_BATTLE', 'START_SHARING'],
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

  it('予定どおりに進めば、ターンの終了予定は変わらない。開始の時刻は、制作開始のまま', () => {
    let p = must(applyCommand(createHostProgress('a'), 'START_PRODUCTION', ctx(T0)))
    const end = p.turnEndsAt
    p = must(applyCommand(p, 'START_BATTLE', ctx(T0 + 7 * MIN)))
    expect(p.turnEndsAt).toBe(end)
    p = must(applyCommand(p, 'START_SHARING', ctx(T0 + 17 * MIN)))
    expect(p.turnEndsAt).toBe(end)
    expect(p.turnStartedAt).toBe(T0)
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
        phaseStartedAt: null,
        phaseEndsAt: null,
        plan: DEFAULT_PLAN,
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

describe('時間の予定と調整（§7.5）', () => {
  const started = () => must(applyCommand(createHostProgress('a'), 'START_PRODUCTION', ctx(T0)))
  const plan = (production: number, battle: number, sharing: number) => ({
    production: production * MIN,
    battle: battle * MIN,
    sharing: sharing * MIN,
  })

  it('制作開始で、制作の終了予定（7 分後）と、ターンの終了予定（19 分後）が決まる', () => {
    const p = started()
    expect(p.phaseStartedAt).toBe(T0)
    expect(p.phaseEndsAt).toBe(T0 + 7 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 19 * MIN)
  })

  it('いまのフェーズの時間を延ばす・縮める。ターンの終了予定も同じだけ動く', () => {
    let p = started()
    p = must(applyAction(p, { type: 'ADJUST_TIME', deltaMs: 3 * MIN }, ctx(T0 + MIN)))
    expect(p.phaseEndsAt).toBe(T0 + 10 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 22 * MIN)
    p = must(applyAction(p, { type: 'ADJUST_TIME', deltaMs: -5 * MIN }, ctx(T0 + MIN)))
    expect(p.phaseEndsAt).toBe(T0 + 5 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 17 * MIN)
    expect(p.revision).toBe(3)
  })

  it('縮めても、いまより前にはならない（残り 0:00 まで）。動かなければ revision は増えない', () => {
    let p = started()
    p = must(applyAction(p, { type: 'ADJUST_TIME', deltaMs: -10 * MIN }, ctx(T0 + 2 * MIN)))
    expect(p.phaseEndsAt).toBe(T0 + 2 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 14 * MIN)
    const again = must(applyAction(p, { type: 'ADJUST_TIME', deltaMs: -MIN }, ctx(T0 + 2 * MIN)))
    expect(again).toBe(p)
  })

  it('予定の長さがないフェーズ（準備中・予備時間・おしまい）では、ずらせない', () => {
    for (const phase of ['PREPARE', 'BUFFER', 'ENDED'] as const) {
      const r = applyAction(at(phase), { type: 'ADJUST_TIME', deltaMs: MIN }, ctx())
      expect(r.ok, phase).toBe(false)
      expect(adminView(at(phase), T0).canAdjustTime).toBe(false)
    }
    for (const phase of ['PRODUCTION', 'BATTLE', 'SHARING'] as const) {
      expect(adminView(at(phase), T0).canAdjustTime, phase).toBe(true)
    }
  })

  it('予定の長さを変えると、いまのフェーズにも、すぐに反映する', () => {
    let p = started()
    p = must(applyAction(p, { type: 'SET_PLAN', plan: plan(10, 8, 3) }, ctx(T0 + MIN)))
    expect(p.plan).toEqual(plan(10, 8, 3))
    expect(p.phaseEndsAt).toBe(T0 + 10 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 21 * MIN)
    // 次のフェーズは、新しい予定の長さで始まる
    p = must(applyCommand(p, 'START_BATTLE', ctx(T0 + 10 * MIN)))
    expect(p.phaseEndsAt).toBe(T0 + 18 * MIN)
  })

  it('いまのフェーズの経過より短くしたら、残り 0:00（いまより前にはしない）', () => {
    const p = must(
      applyAction(started(), { type: 'SET_PLAN', plan: plan(3, 10, 2) }, ctx(T0 + 5 * MIN)),
    )
    expect(p.phaseEndsAt).toBe(T0 + 5 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 17 * MIN)
  })

  it('準備中に予定を変えると、制作開始から使う。一斉リセットのあとも、引き継ぐ', () => {
    let p = must(
      applyAction(createHostProgress('a'), { type: 'SET_PLAN', plan: plan(5, 12, 3) }, ctx()),
    )
    expect(p.phaseEndsAt).toBeNull()
    p = must(applyCommand(p, 'START_PRODUCTION', ctx(T0)))
    expect(p.phaseEndsAt).toBe(T0 + 5 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 20 * MIN)
    p = must(applyCommand(p, 'RESET', ctx()))
    expect(p.plan).toEqual(plan(5, 12, 3))
  })

  it('制作中から、対戦を飛ばして持ち帰りへ進める（予定の時間までに終わらなくても）。ターンの終了予定は、持ち帰りの長さで決め直す', () => {
    const p = must(applyCommand(started(), 'START_SHARING', ctx(T0 + 3 * MIN)))
    expect(p.phase).toBe('SHARING')
    expect(p.phaseEndsAt).toBe(T0 + 5 * MIN)
    expect(p.turnEndsAt).toBe(T0 + 5 * MIN)
  })

  it('遅れて進むと、ターンの終了予定も遅れる。予備時間・終了では、変えない', () => {
    let p = must(applyCommand(started(), 'START_BATTLE', ctx(T0 + 9 * MIN)))
    expect(p.turnEndsAt).toBe(T0 + 21 * MIN)
    p = must(applyCommand(p, 'START_SHARING', ctx(T0 + 19 * MIN)))
    p = must(applyCommand(p, 'TO_BUFFER', ctx(T0 + 22 * MIN)))
    expect(p.phaseEndsAt).toBeNull()
    expect(p.turnEndsAt).toBe(T0 + 21 * MIN)
  })

  it('制作中・対戦中にターンの終了予定を過ぎたら、次の操作は「持ち帰り開始」', () => {
    const p = started()
    expect(adminView(p, T0 + 18 * MIN).nextCommand).toBe('START_BATTLE')
    expect(adminView(p, T0 + 19 * MIN).nextCommand).toBe('START_SHARING')
    const v = adminView(p, T0 + MIN)
    expect(v.phaseRemainingMs).toBe(6 * MIN)
    expect(v.plan).toEqual(DEFAULT_PLAN)
  })

  it('配信には、フェーズの時刻・予定を含めない', () => {
    expect(Object.keys(toProgressState(started(), T0))).not.toContain('plan')
    expect(Object.keys(toProgressState(started(), T0))).not.toContain('phaseEndsAt')
  })

  it('管理画面の本文の読み取り: 形が違えば null', () => {
    expect(readHostAction({ command: 'START_SHARING' })).toEqual({ type: 'START_SHARING' })
    expect(readHostAction({ command: 'ADJUST_TIME', deltaMs: -60_000 })).toEqual({
      type: 'ADJUST_TIME',
      deltaMs: -60_000,
    })
    expect(readHostAction({ command: 'SET_PLAN', plan: { ...plan(7, 10, 2), x: 1 } })).toEqual({
      type: 'SET_PLAN',
      plan: plan(7, 10, 2),
    })
    for (const bad of [
      null,
      {},
      { command: 'setPhase' },
      { command: 'ADJUST_TIME' },
      { command: 'ADJUST_TIME', deltaMs: 0 },
      { command: 'ADJUST_TIME', deltaMs: 1500 },
      { command: 'ADJUST_TIME', deltaMs: MAX_ADJUST_MS + 1000 },
      { command: 'ADJUST_TIME', deltaMs: '60000' },
      { command: 'SET_PLAN' },
      { command: 'SET_PLAN', plan: plan(0, 10, 2) },
      { command: 'SET_PLAN', plan: plan(61, 10, 2) },
      { command: 'SET_PLAN', plan: { production: 7 * MIN, battle: 10 * MIN } },
      { command: 'SET_PLAN', plan: { ...plan(7, 10, 2), sharing: 90_500 } },
    ]) {
      expect(readHostAction(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('予定・フェーズの時刻がない保存（この機能より前）も読める。壊れた予定は null', () => {
    const old = {
      phase: 'BATTLE',
      sessionId: 'a',
      revision: 2,
      turnStartedAt: T0,
      turnEndsAt: T0 + 19 * MIN,
      rematchOpen: true,
    }
    expect(readHostProgress(old)).toEqual({
      ...old,
      phaseStartedAt: null,
      phaseEndsAt: null,
      plan: DEFAULT_PLAN,
    })
    expect(readHostProgress({ ...old, plan: plan(0, 1, 1) })).toBeNull()
    expect(readHostProgress({ ...old, phaseEndsAt: 'soon' })).toBeNull()
  })
})
