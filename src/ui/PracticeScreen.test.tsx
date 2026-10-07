import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import type { CharacterConfig } from '../model/index.ts'
import { presetStage } from '../stage/index.ts'
import { PracticeScreen } from './PracticeScreen.tsx'

const m = messages.practice
const html = (config: CharacterConfig = createDefaultConfig('p1')) =>
  renderToStaticMarkup(
    <PracticeScreen
      config={config}
      stage={presetStage('standard')}
      onFixStats={() => {}}
      onFixStage={() => {}}
      onNext={() => {}}
    />,
  )

describe('S05 試しに動かす', () => {
  it('操作説明が表示される（1P: A D / W / F）', () => {
    const markup = html()
    expect(markup).toContain(m.controls)
    for (const key of ['A', 'D', 'W', 'F']) expect(markup).toContain(`<kbd>${key}</kbd>`)
    for (const op of [m.left, m.right, m.jump, m.attack]) expect(markup).toContain(op)
    expect(markup).toContain(m.jumpNote)
  })

  it('設定した能力値と、標準との比較（%）が表示される', () => {
    const cfg = {
      ...createDefaultConfig('p1'),
      stats: { attackPower: 8, defense: 2, jumpPower: 5, speed: 5 },
    }
    const markup = html(cfg)
    expect(markup).toContain(messages.stat.stats.attackPower.label)
    expect(markup).toContain('<b>8</b>')
    expect(markup).toContain('<b>2</b>')
    // 標準（5）は 100 %
    expect(markup).toContain(`${messages.stat.stats.jumpPower.effect} 100%`)
    // 8 は、標準より大きい
    expect(markup).not.toContain(`${messages.stat.stats.attackPower.effect} 100%`)
  })

  it('ひとりで動かす場所（Canvas）と、ダミーの表示がある', () => {
    const markup = html()
    expect(markup).toContain('<canvas')
    expect(markup).toContain(m.canvasLabel)
    expect(markup).toContain(m.dummy)
    expect(markup).toContain(m.dummyDamage(0))
    expect(markup).toContain(m.noHit)
    expect(markup).toContain(m.resetDummy)
  })

  it('設定画面に戻る 2 つのボタンと、「たいせんへ」がある（試さなくても進める）', () => {
    const markup = html()
    expect(markup).toContain(`>${m.fixStats}<`)
    expect(markup).toContain(`>${m.fixStage}<`)
    const next = markup.match(/<button[^>]*>たいせんへ<\/button>/)![0]
    expect(next).not.toContain('disabled')
    expect(markup).toContain(m.skipNote)
  })

  it('名前が空でも、デフォルト名で表示する', () => {
    expect(html({ ...createDefaultConfig('p1'), name: '' })).toContain('1P: ファイター')
    expect(html({ ...createDefaultConfig('p1'), name: 'ひろし' })).toContain('1P: ひろし')
  })
})
