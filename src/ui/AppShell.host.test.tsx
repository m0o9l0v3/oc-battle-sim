import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import type { Phase, ProgressState } from '../model/index.ts'
import {
  BLOCK_REASONS,
  createSession,
  NO_HOST,
  reduceFlow,
  type FlowAction,
  type HostContext,
  type Session,
} from '../session/index.ts'
import { presetStage } from '../stage/index.ts'
import { Screens } from './AppShell.tsx'

const m = messages.flow
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
const html = (s: Session, host: HostContext) =>
  renderToStaticMarkup(<Screens session={s} dispatch={() => {}} host={host} />)

const s01 = createSession()
const s03 = run(s01, { type: 'START' }, { type: 'NEXT' })
const s06 = run(
  s03,
  { type: 'NEXT' },
  { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' },
  { type: 'NEXT' },
)
const s07 = run(s06, { type: 'BEGIN_MATCH' })
const s08 = run(s07, { type: 'FINISH_MATCH', outcome: win, durationSec: 30 })
const s09 = run(s08, { type: 'REDESIGN' })

const takeHomeButton = `>${m.takeHome}</button>`

describe('親機の進行による画面の表示（event-control.md §5.3、§6、§12）', () => {
  it('親機がないときは、ふだんどおり（「もちかえる」なし、止めない）', () => {
    for (const s of [s01, s03, s08, s09]) {
      const markup = html(s, NO_HOST)
      expect(markup).not.toContain(takeHomeButton)
      expect(markup).not.toContain('inert')
    }
    expect(html(s01, NO_HOST)).not.toContain('disabled')
  })

  it('PREPARE の S01: 「はじめる」を押せず、理由を出す', () => {
    const markup = html(s01, at('PREPARE'))
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>はじめる<\/button>/)
    expect(markup).toContain(BLOCK_REASONS.prepare)
  })

  it('PRODUCTION の S01: 「はじめる」を押せる', () => {
    const markup = html(s01, at('PRODUCTION'))
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>はじめる<\/button>/)
  })

  it('SHARING: どの画面にも「もちかえる」。設定の画面は表示のみ（操作できない）で、理由を出す', () => {
    const markup = html(s03, at('SHARING'))
    expect(markup).toContain(takeHomeButton)
    expect(markup).toContain('inert')
    expect(markup).toContain(BLOCK_REASONS.sharing)
    // S01 でも出す（「はじめる」は押せない）
    const start = html(s01, at('SHARING'))
    expect(start).toContain(takeHomeButton)
    expect(start).toMatch(/<button[^>]*disabled[^>]*>はじめる<\/button>/)
  })

  it('BUFFER: 「もちかえる」を出す。操作は止めない', () => {
    const markup = html(s03, at('BUFFER'))
    expect(markup).toContain(takeHomeButton)
    expect(markup).not.toContain('inert')
  })

  it('対戦中（S07）は止めない。「もちかえる」は、対戦が終わるまで押せない', () => {
    const markup = html(s07, at('SHARING'))
    expect(markup).not.toContain('inert')
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>もちかえる<\/button>/)
    expect(markup).toContain(BLOCK_REASONS.takeHomeInMatch)
  })

  it('S12 には「もちかえる」を出さない', () => {
    const s12 = run(s03, { type: 'SHARE' })
    expect(s12.data.screen).toBe('S12')
    expect(html(s12, at('SHARING'))).not.toContain(takeHomeButton)
  })

  it('再戦の受付が止まっているとき: S08 の「さいせん」へ進めず、理由を出す', () => {
    const markup = html(s08, at('BATTLE', false))
    expect(markup).toMatch(
      new RegExp(`<button[^>]*disabled[^>]*>${messages.battleReport.redesign}</button>`),
    )
    expect(markup).toContain(BLOCK_REASONS.rematch)
  })

  it('再戦の受付が止まっているとき: S09 の「さいせん」を押せず、理由を出す。「もどる」は押せる', () => {
    const markup = html(s09, at('BATTLE', false))
    expect(markup).toMatch(new RegExp(`<button[^>]*disabled[^>]*>${m.redesign.rematch}</button>`))
    expect(markup).toContain(BLOCK_REASONS.rematch)
    expect(markup).not.toContain('inert')
    expect(markup).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>${m.redesign.back}</button>`))
  })

  it('通信不能が続いた（live が null）: すべて許可。「もちかえる」は、最後に分かったフェーズで出す', () => {
    const ctx: HostContext = { live: null, last: progress('SHARING') }
    const markup = html(s03, ctx)
    expect(markup).not.toContain('inert')
    expect(markup).toContain(takeHomeButton)
    expect(html(s01, { live: null, last: progress('PREPARE') })).not.toMatch(
      /<button[^>]*disabled[^>]*>はじめる<\/button>/,
    )
  })
})
