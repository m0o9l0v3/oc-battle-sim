import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { DEV_SECTIONS } from './ui/DevPage'
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

  it('部品の一覧が、すべて出る。見出しの id は、重ならない', () => {
    // DevPage は、リンクのために window を使う。描画だけを確かめるため、最小の window を用意する
    const g = globalThis as { window?: unknown }
    const before = g.window
    g.window = { location: { pathname: '/', search: '?dev' } }
    try {
      const html = renderToString(<App dev />)
      expect(html).toContain('開発用')
      for (const s of DEV_SECTIONS) {
        expect(html).toContain(s.title)
        expect(html).toContain(`href="#${s.id}"`)
        expect(html).toContain(`id="${s.id}"`)
      }
    } finally {
      g.window = before
    }
    expect(new Set(DEV_SECTIONS.map((s) => s.id)).size).toBe(DEV_SECTIONS.length)
  })
})
