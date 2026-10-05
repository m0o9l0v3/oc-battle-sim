import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { DEV_SECTIONS, initialSection } from './ui/DevPage'
import { isDevPage } from './ui/devMode'

describe('入口', () => {
  it('通常は、タイトルだけ。開発用の部品は出さない', () => {
    const html = renderToString(<App dev={false} />)
    expect(html).toContain('OC Battle Sim')
    for (const s of DEV_SECTIONS) expect(html).not.toContain(s.title)
    expect(html).not.toContain('開発用')
  })

  it('引数がないときの既定は、通常の画面（window がない環境でも落ちない）', () => {
    expect(renderToString(<App />)).not.toContain('開発用')
  })
})

describe('開発用ページ（?dev）', () => {
  it('?dev があるときだけ、開く', () => {
    expect(isDevPage('?dev')).toBe(true)
    expect(isDevPage('?perf&dev')).toBe(true)
    expect(isDevPage('?dev=1')).toBe(true)
    expect(isDevPage('')).toBe(false)
    expect(isDevPage('?perf')).toBe(false)
    expect(isDevPage('?developer=1')).toBe(false)
  })

  it('右上に、モードの切り替えボタン（部品ごと）が出る。いまのモードだけが選ばれ、中身は1つだけ', () => {
    expect(typeof window).toBe('undefined') // window がない環境でも描画できる
    const html = renderToString(<App dev />)
    expect(html).toContain('開発用')
    expect(html).toContain('href="/"') // 通常の画面へ戻るリンク
    for (const s of DEV_SECTIONS) {
      expect(html).toContain(`id="tab-${s.id}"`)
      expect(html).toContain(`>${s.label}</button>`)
    }
    // 先頭の部品が選ばれ、そのパネルだけが出る
    expect(html).toContain(`aria-selected="true"`)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html).toContain(`id="panel-${DEV_SECTIONS[0].id}"`)
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1)
    // 先頭以外の部品の中身は、出さない（例: 素材の一覧）
    expect(html).not.toContain('体型 × 色')
  })

  it('最初に開く部品は、URL の # で決まる。ない・知らない名前は、先頭', () => {
    expect(initialSection('#fighter')).toBe('fighter')
    expect(initialSection('keys')).toBe('keys')
    expect(initialSection('')).toBe(DEV_SECTIONS[0].id)
    expect(initialSection('#nothing')).toBe(DEV_SECTIONS[0].id)
  })

  it('見出し・ボタンの id は、重ならない', () => {
    expect(new Set(DEV_SECTIONS.map((s) => s.id)).size).toBe(DEV_SECTIONS.length)
  })
})
