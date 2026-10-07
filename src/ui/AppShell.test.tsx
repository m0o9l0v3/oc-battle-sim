import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import type { ScreenId } from '../model/index.ts'
import { presetStage } from '../stage/index.ts'
import { createSession, reduceFlow, type FlowAction, type Session } from '../session/index.ts'
import { AppShell, Screens } from './AppShell.tsx'

const m = messages.flow
const run = (s: Session, ...a: FlowAction[]) => a.reduce(reduceFlow, s)
const win = { winner: 'p1', reason: 'stocks' } as const
const html = (s: Session) => renderToStaticMarkup(<Screens session={s} dispatch={() => {}} />)

const toS06 = () =>
  run(
    createSession(),
    { type: 'START' },
    { type: 'NEXT' },
    { type: 'NEXT' },
    { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' },
    { type: 'NEXT' },
  )
const afterMatch1 = () =>
  run(toS06(), { type: 'BEGIN_MATCH' }, { type: 'FINISH_MATCH', outcome: win, durationSec: 40 })

describe('画面の選択（S01〜S12）', () => {
  it('S01: スタート。「はじめる」', () => {
    const markup = html(createSession())
    expect(markup).toContain(m.start.title)
    expect(markup).toContain(`>${m.start.begin}<`)
    expect(markup).toContain('data-screen="S01"')
    expect(markup).not.toContain('step-bar') // S01 には、段階の表示がない
  })

  it('S02〜S06: それぞれの画面。段階の表示で、いまの段階が分かる', () => {
    let s = run(createSession(), { type: 'START' })
    expect(html(s)).toContain(messages.appearance.title)
    s = run(s, { type: 'NEXT' })
    expect(html(s)).toContain(messages.stat.title)
    s = run(s, { type: 'NEXT' })
    expect(html(s)).toContain(messages.stageEditor.title)
    s = run(s, { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' })
    expect(html(s)).toContain(messages.practice.title)
    s = run(s, { type: 'NEXT' })
    const prep = html(s)
    expect(prep).toContain(m.prep.title)
    expect(prep).toContain(m.prep.foeNote)
    expect(prep).toContain(`>${m.prep.start}<`)
    expect(prep).toMatch(/data-current="true"[^>]*>▶ たいせん/)
  })

  it('S06: 1P・2P のキー配置が表示される（A D W F とテンキー）', () => {
    const markup = html(toS06())
    expect(markup).toContain('<kbd>A</kbd>')
    expect(markup).toContain('テンキーの 4 / ←')
    expect(markup).toContain(m.prep.changeFoe)
  })

  it('S07: 対戦（第 1 戦）。固定した設定で、Canvas を出す', () => {
    const markup = html(run(toS06(), { type: 'BEGIN_MATCH' }))
    expect(markup).toContain(m.match.title(1))
    expect(markup).toContain('<canvas')
    expect(markup).toContain('data-screen="S07"')
  })

  it('S08: 勝敗と、使った能力値。「設定を変えて再戦」', () => {
    const markup = html(afterMatch1())
    expect(markup).toContain(m.report.title(1))
    expect(markup).toContain(m.report.win('ファイター'))
    expect(markup).toContain(m.report.reasons.stocks)
    expect(markup).toContain(m.report.used)
    expect(markup).toContain(`>${m.report.redesign}<`)
  })

  it('S09: 変更がないと「再戦」は押せず、理由が出る。前の値が見える', () => {
    const s = run(afterMatch1(), { type: 'REDESIGN' })
    const markup = html(s)
    expect(markup).toContain(m.redesign.title)
    expect(markup).toContain(m.redesign.mustChange)
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>さいせん<\/button>/)
    expect(markup).toContain(`${m.redesign.before}:`)
    expect(markup).toContain(`>${m.redesign.back}<`)
  })

  it('S09: 1P の能力値を変えると、「再戦」が押せる', () => {
    let s = run(afterMatch1(), { type: 'REDESIGN' })
    s = reduceFlow(s, {
      type: 'SET_P1',
      config: { ...s.data.p1, stats: { attackPower: 6, defense: 4, jumpPower: 5, speed: 5 } },
    })
    const markup = html(s)
    expect(markup).not.toContain(m.redesign.mustChange)
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>さいせん<\/button>/)
  })

  it('S11: 戦ごとの設定と結果を並べる。「もう一度」「おわる」', () => {
    let s = run(afterMatch1(), { type: 'REDESIGN' })
    s = reduceFlow(s, {
      type: 'SET_P1',
      config: { ...s.data.p1, stats: { attackPower: 6, defense: 4, jumpPower: 5, speed: 5 } },
    })
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: { winner: 'p2', reason: 'timeup_damage' }, durationSec: 50 },
    )
    const markup = html(s)
    expect(markup).toContain(m.compare.match(1))
    expect(markup).toContain(m.compare.match(2))
    expect(markup).toContain(m.report.win('あいて'))
    expect(markup).toContain(`>${m.compare.again}<`)
    expect(markup).toContain(`>${m.compare.finish}<`)
  })

  it('S12: ふりかえり。見た目・能力値・ステージを保持して表示。リセットのボタン', () => {
    const s = run(afterMatch1(), { type: 'SHARE' })
    const markup = html(s)
    expect(markup).toContain(m.end.title)
    expect(markup).toContain(m.end.yours)
    expect(markup).toContain(s.data.stage.name)
    expect(markup).toContain(`>${m.end.reset}<`)
  })

  it('「戻る」は、戻れる画面だけに出る（S03・S04・S06・S09）', () => {
    const labels = (screen: ScreenId) => {
      const s = { ...createSession(), data: { ...createSession().data, screen } }
      return html(s).includes('>もどる<')
    }
    expect(labels('S03')).toBe(true)
    expect(labels('S06')).toBe(true)
    expect(labels('S02')).toBe(false)
    expect(labels('S01')).toBe(false)
  })
})

describe('AppShell（保存先なしの環境）', () => {
  it('保存が使えない環境（サーバー側の描画）でも、S01 から始まる（例外を投げない）', () => {
    expect(typeof window).toBe('undefined')
    const markup = renderToStaticMarkup(<AppShell />)
    expect(markup).toContain(m.start.title)
  })
})
