import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { DEFAULT_PRESET_ID, STAGE_PRESETS } from '../stage/index.ts'
import { StageSelectScreen } from './StageSelectScreen.tsx'

const m = messages.stageSelect
const html = (selectedId = DEFAULT_PRESET_ID, extra: { onBack?: () => void } = {}) =>
  renderToStaticMarkup(
    <StageSelectScreen selectedId={selectedId} onSelect={() => {}} onNext={() => {}} {...extra} />,
  )

describe('S04 ステージの選択', () => {
  it('すべてのプリセットが、見本・名前・説明つきで並ぶ', () => {
    const markup = html()
    expect((markup.match(/type="radio"/g) ?? []).length).toBe(STAGE_PRESETS.length)
    expect((markup.match(/<svg/g) ?? []).length).toBe(STAGE_PRESETS.length)
    for (const p of STAGE_PRESETS) {
      expect(markup).toContain(p.name)
      expect(markup).toContain(p.description)
    }
  })

  it('選んだカードには、色だけでなく、✓ の印が付く（1 枚だけ）', () => {
    const markup = html()
    expect((markup.match(/stage-card__check/g) ?? []).length).toBe(1)
    expect(markup).toMatch(/data-checked="true"[^]*?stage-card__check[^]*?ひょうじゅん/)
  })

  it('入ったときから、標準が選ばれ、「つかえるよ！」。「つぎへ」は押せる', () => {
    const markup = html()
    expect((markup.match(/data-checked="true"/g) ?? []).length).toBe(1)
    expect(markup).toMatch(/data-checked="true"[^]*?ひょうじゅん/)
    expect(markup).toContain(`✓ ${m.usable}`)
    const next = markup.match(/<button[^>]*>つぎへ<\/button>/)![0]
    expect(next).not.toContain('disabled')
  })

  it('どのプリセットを選んでも、「つかえるよ！」で、「つぎへ」が押せる', () => {
    for (const p of STAGE_PRESETS) {
      const markup = html(p.id)
      expect(markup, p.id).toContain(`✓ ${m.usable}`)
      expect(markup.match(/<button[^>]*>つぎへ<\/button>/)![0]).not.toContain('disabled')
      expect(markup).toMatch(new RegExp(`data-checked="true"[^]*?${p.name}`))
    }
  })

  it('知らない ID は、標準として扱う（落ちない）。「もどる」は、渡したときだけ', () => {
    expect(html('nothing')).toMatch(/data-checked="true"[^]*?ひょうじゅん/)
    expect(html()).not.toContain(m.back)
    expect(html(DEFAULT_PRESET_ID, { onBack: () => {} })).toContain(m.back)
  })
})
