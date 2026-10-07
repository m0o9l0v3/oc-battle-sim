import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { DEV_SECTIONS } from './ui/DevPage'
import { isDevPage } from './ui/devMode'

describe('入口', () => {
  it('通常は、体験の入口（S01 スタート）。開発用の部品は出さない', () => {
    const html = renderToString(<App dev={false} />)
    expect(html).toContain('ファイターラボ')
    expect(html).toContain('はじめる')
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

  it('部品の一覧が、すべて出る（window がない環境でも描画できる）。見出しの id は、重ならない', () => {
    expect(typeof window).toBe('undefined')
    const html = renderToString(<App dev />)
    expect(html).toContain('開発用')
    expect(html).toContain('href="/"') // 通常の画面へ戻るリンク
    for (const s of DEV_SECTIONS) {
      expect(html).toContain(s.title)
      expect(html).toContain(`href="#${s.id}"`)
      expect(html).toContain(`id="${s.id}"`)
    }
    expect(new Set(DEV_SECTIONS.map((s) => s.id)).size).toBe(DEV_SECTIONS.length)
  })
})
