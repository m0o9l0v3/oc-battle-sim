import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { APPEARANCE_IDS, createDefaultConfig } from '../fighter/index.ts'
import { messages } from '../assets/index.ts'
import { AppearanceScreen } from './AppearanceScreen.tsx'

const m = messages.appearance
const noop = () => {}
const html = (config = createDefaultConfig('p1'), extra: { onBack?: () => void } = {}) =>
  renderToStaticMarkup(
    <AppearanceScreen config={config} onChange={noop} onNext={noop} {...extra} />,
  )

const group = (markup: string, key: string) =>
  markup.split(`data-group="${key}"`)[1]!.split('</fieldset>')[0]!

describe('S02 の表示', () => {
  it('4 つの選択が、1 画面に並ぶ（体型 4・顔 6・色 8・アクセサリー 6 + なし）', () => {
    const markup = html()
    const count = (k: string) => (group(markup, k).match(/type="radio"/g) ?? []).length
    expect(count('body')).toBe(APPEARANCE_IDS.body.length)
    expect(count('face')).toBe(APPEARANCE_IDS.face.length)
    expect(count('color')).toBe(APPEARANCE_IDS.color.length)
    expect(count('accessory')).toBe(APPEARANCE_IDS.accessory.length + 1)
    expect(markup).toContain(m.title)
    for (const g of Object.values(m.groups)) expect(markup).toContain(g)
  })

  it('初期値が選ばれた状態で始まる（各グループで、ちょうど 1 つ）', () => {
    const markup = html()
    for (const k of ['body', 'face', 'color', 'accessory']) {
      expect((group(markup, k).match(/data-checked="true"/g) ?? []).length, k).toBe(1)
    }
    // アクセサリーは「なし」
    expect(group(markup, 'accessory')).toMatch(/data-checked="true"[^]*?なし/)
  })

  it('選んだものが、チェックされる', () => {
    const cfg = createDefaultConfig('p1')
    const markup = html({
      ...cfg,
      appearance: { body: 'b3', face: 'f5', color: 'c7', accessory: 'a2' },
    })
    for (const k of ['body', 'face', 'color', 'accessory']) {
      expect((group(markup, k).match(/data-checked="true"/g) ?? []).length, k).toBe(1)
    }
    expect(group(markup, 'body')).toMatch(/data-checked="true"[^]*?すらっと/)
    expect(group(markup, 'accessory')).toMatch(/data-checked="true"[^]*?ゴーグル/)
  })

  it('プレビューがある（読み上げ用の説明つき）。名前が空なら、デフォルト名', () => {
    const cfg = { ...createDefaultConfig('p1'), name: '' }
    const markup = html(cfg)
    expect(markup).toContain('role="img"')
    expect(markup).toContain(m.previewLabel('ファイター'))
    expect(html({ ...cfg, name: 'ひろし' })).toContain(m.previewLabel('ひろし'))
  })

  it('名前の欄: 残り文字数、注意書き（必須）、ランダムボタン', () => {
    const markup = html({ ...createDefaultConfig('p1'), name: 'ひろし' })
    expect(markup).toContain(m.nameRemaining(7))
    expect(markup).toContain(m.nameMax)
    expect(markup).toContain(m.nameNotice)
    expect(markup).toContain(m.random)
    expect(markup).toContain('aria-describedby')
  })

  it('「つぎへ」は、いつでも押せる（未入力でも進める）。「もどる」は、渡したときだけ', () => {
    const markup = html({ ...createDefaultConfig('p1'), name: '' })
    const next = markup.match(/<button[^>]*>つぎへ<\/button>/)?.[0]
    expect(next).toBeDefined()
    expect(next).not.toContain('disabled')
    expect(markup).not.toContain(m.back)
    expect(html(undefined, { onBack: noop })).toContain(m.back)
  })
})
