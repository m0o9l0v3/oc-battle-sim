/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
// ビジュアルテーマの確認。docs/06-ui/ui-design.md §4、§5、§10、§11
import { describe, expect, it } from 'vitest'
import {
  APP_NAME,
  BATTLE_COLORS,
  FONT_SIZES_PX,
  MIN_TARGET_PX,
  PLAYER_COLORS,
  UI_COLORS,
} from '../assets/theme.ts'

// ファイルは、Node で読む（このテストだけ、Node の型を使う）
const root = join(__dirname, '..', '..')

/** プロジェクトの、すべての対象ファイル（パスは、直下からの相対） */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(relative(root, p))
  }
  return out
}
const files: Record<string, string> = {}
for (const p of [
  ...walk(join(root, 'src')).filter((f) => /\.(ts|tsx|css)$/.test(f)),
  'index.html',
  ...walk(join(root, 'public')).filter((f) => f.endsWith('.svg')),
]) {
  files[`/${p}`] = readFileSync(join(root, p), 'utf8')
}
const read = (p: string): string => {
  const text = files[`/${p}`]
  if (text === undefined) throw new Error(`not found: ${p}`)
  return text
}

/** theme.css の :root の変数 */
function cssVars(): Record<string, string> {
  const css = read('src/ui/theme.css')
  const block = /:root\s*\{([^}]*)\}/.exec(css)![1]!
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))
    out[m[1]!] = m[2]!.replace(/\s+/g, ' ').trim()
  return out
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** 文字の対比（WCAG） */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

describe('theme.css と assets/theme.ts の値が、同じ', () => {
  const vars = cssVars()
  it('画面の色（UI_COLORS）: すべて、--c-* にある', () => {
    for (const [name, value] of Object.entries(UI_COLORS)) {
      expect(vars[`c-${kebab(name)}`], name).toBe(value)
    }
  })
  it('1P・2P の色（札の色と、文字の色）', () => {
    expect(vars['c-p1']).toBe(PLAYER_COLORS.p1.bg)
    expect(vars['c-on-p1']).toBe(PLAYER_COLORS.p1.text)
    expect(vars['c-p2']).toBe(PLAYER_COLORS.p2.bg)
    expect(vars['c-on-p2']).toBe(PLAYER_COLORS.p2.text)
  })
  it('対戦画面の背景', () => {
    expect(vars['c-battle-bg']).toBe(BATTLE_COLORS.background)
    expect(vars['c-battle-panel']).toBe(BATTLE_COLORS.stage)
  })
  it('文字の大きさ（rem × 16 = ピクセル）と、押すものの最小の高さ', () => {
    const px = (v: string) => parseFloat(v) * 16
    expect(px(vars['fs-note']!)).toBe(FONT_SIZES_PX.note)
    expect(px(vars['fs-body']!)).toBe(FONT_SIZES_PX.body)
    expect(px(vars['fs-heading']!)).toBe(FONT_SIZES_PX.heading)
    expect(px(vars['fs-title']!)).toBe(FONT_SIZES_PX.title)
    expect(px(vars['fs-number']!)).toBe(FONT_SIZES_PX.number)
    expect(parseFloat(vars['min-target']!)).toBe(MIN_TARGET_PX)
  })
})

describe('配色（ui-design.md §4.1、§11）', () => {
  const c = UI_COLORS
  it('文字と背景の対比が、4.5 : 1 以上', () => {
    const pairs: [string, string, string][] = [
      ['text/bg', c.text, c.bg],
      ['text/surface', c.text, c.surface],
      ['textSub/bg', c.textSub, c.bg],
      ['textSub/surface', c.textSub, c.surface],
      ['onMain/main（主ボタン）', c.onMain, c.main],
      ['onMain/mainHover', c.onMain, c.mainHover],
      ['onSub/sub（補助ボタン）', c.onSub, c.sub],
      ['text/selectedBg', c.text, c.selectedBg],
      ['textSub/sub（押せない）', c.textSub, c.sub],
      ['success/successBg', c.success, c.successBg],
      ['danger/dangerBg', c.danger, c.dangerBg],
      ['warn/warnBg', c.warn, c.warnBg],
      ['info/infoBg', c.info, c.infoBg],
      ['danger/surface', c.danger, c.surface],
      ['success/surface', c.success, c.surface],
      ['main/surface（リンク）', c.main, c.surface],
      ['1P の札の文字', PLAYER_COLORS.p1.text, PLAYER_COLORS.p1.bg],
      ['2P の札の文字', PLAYER_COLORS.p2.text, PLAYER_COLORS.p2.bg],
      ['対戦画面の文字', '#ffffff', BATTLE_COLORS.background],
    ]
    for (const [name, fg, bg] of pairs) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('枠・フォーカスの対比が、3 : 1 以上（背景・面に対して）', () => {
    for (const bg of [c.bg, c.surface]) {
      expect(contrast(c.border, bg), `border/${bg}`).toBeGreaterThanOrEqual(3)
      expect(contrast(c.focus, bg), `focus/${bg}`).toBeGreaterThanOrEqual(3)
      expect(contrast(c.main, bg), `main/${bg}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('1P（青系）と 2P（橙系）は、明るさも違う（色覚の違いでも見分けられる）', () => {
    expect(Math.abs(lum(PLAYER_COLORS.p1.bg) - lum(PLAYER_COLORS.p2.bg))).toBeGreaterThan(0.25)
    // 青系 / 橙系
    const hue = (hex: string) => {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      return { blueish: b > r, orangish: r > b }
    }
    expect(hue(PLAYER_COLORS.p1.bg).blueish).toBe(true)
    expect(hue(PLAYER_COLORS.p2.bg).orangish).toBe(true)
  })

  it('背景は明るく（白に近い）、文字は濃い。対戦画面の背景は、やや暗め', () => {
    expect(lum(c.bg)).toBeGreaterThan(0.85)
    expect(lum(c.text)).toBeLessThan(0.05)
    expect(lum(BATTLE_COLORS.background)).toBeLessThan(0.05)
  })
})

describe('文字・大きさ（ui-design.md §4.2）', () => {
  it('見出し 32 以上、本文・ボタン 24 以上、数字 48 以上。補足は 20 以上', () => {
    expect(FONT_SIZES_PX.heading).toBeGreaterThanOrEqual(32)
    expect(FONT_SIZES_PX.body).toBeGreaterThanOrEqual(24)
    expect(FONT_SIZES_PX.number).toBeGreaterThanOrEqual(48)
    expect(FONT_SIZES_PX.note).toBeGreaterThanOrEqual(20)
    expect(MIN_TARGET_PX).toBeGreaterThanOrEqual(56)
  })

  it('ボタンは、高さ（--min-target）と、文字の大きさ（--fs-body）を、変数で持つ', () => {
    const css = read('src/ui/components.css')
    const rule = /\.button,\s*\.stepper-button\s*\{([^}]*)\}/.exec(css)![1]!
    expect(rule).toContain('min-height: var(--min-target)')
    expect(rule).toContain('font-size: var(--fs-body)')
  })

  it('フォントは、OS に入っているものだけ（外部から読み込まない）', () => {
    const font = cssVars().font!
    expect(font).toMatch(/Yu Gothic UI|Hiragino|Meiryo/)
    expect(font).toMatch(/sans-serif$/)
  })
})

/** 条件に合うファイル（パスは、プロジェクトの直下からの相対）と、中身 */
function sources(match: (path: string) => boolean): [string, string][] {
  return Object.entries(files)
    .map(([k, v]) => [k.slice(1), v] as [string, string])
    .filter(([p]) => match(p))
}

const isTest = (p: string) => /\.test\.tsx?$/.test(p)
/** 開発用ページの部品（参加者の画面ではない） */
const DEV_ONLY = [
  'src/ui/DevPage.tsx',
  'src/ui/AnimationSheet.tsx',
  'src/ui/FighterGallery.tsx',
  'src/ui/FighterArena.tsx',
  'src/ui/KeyCheck.tsx',
  'src/ui/StageCanvas.tsx',
]

describe('色の直書きがない（役割の変数だけを使う）', () => {
  it('CSS: theme.css 以外に、色の値（#rrggbb、rgb()）を書かない', () => {
    const css = sources((p) => p.endsWith('.css') && p !== 'src/ui/theme.css')
    expect(css.length).toBeGreaterThanOrEqual(2)
    for (const [p, text] of css) expect(text, p).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('画面・描画のコード: 色の値を書かない（assets/theme.ts と、ファイターの素材を除く）', () => {
    const target = (r: string) =>
      /^src\/(ui|render)\/[^/]+\.tsx?$/.test(r) && !isTest(r) && !DEV_ONLY.includes(r)
    const list = sources(target)
    expect(list.length).toBeGreaterThan(10)
    for (const [p, text] of list) {
      expect(text, p).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/)
    }
  })
})

describe('外部の資源を使わない（ui-design.md §10）', () => {
  it('CSS・HTML・同梱の画像が、外部の URL を読み込まない（フォント・画像・スクリプト）', () => {
    const list = sources((p) => p.endsWith('.css') || p === 'index.html' || p.endsWith('.svg'))
    expect(list.length).toBeGreaterThanOrEqual(4)
    for (const [p, raw] of list) {
      const text = raw.replace(/xmlns="http:\/\/www\.w3\.org\/\d+\/svg"/g, '')
      expect(text, p).not.toMatch(/https?:\/\//)
      expect(text, p).not.toMatch(/@import|url\(\s*['"]?https?:/)
    }
  })
})

describe('独自性（NFR-07。ui-design.md §5）', () => {
  const BANNED = [
    'スマブラ',
    '大乱闘',
    'Smash',
    'Nintendo',
    '任天堂',
    'Mario',
    'マリオ',
    'Pokemon',
    'ポケモン',
    'Kirby',
    'カービィ',
  ]
  it('画面・コード・HTML・同梱の画像に、既存作品の名前がない', () => {
    const list = sources(
      (p) =>
        !isTest(p) &&
        (/^src\/.*\.(ts|tsx|css)$/.test(p) || p === 'index.html' || p.endsWith('.svg')),
    )
    expect(list.length).toBeGreaterThan(50)
    for (const [p, text] of list) {
      for (const w of BANNED) expect(text, `${p}: ${w}`).not.toContain(w)
    }
  })

  it('アプリの名前は「ファイターラボ」。ページの題も同じ', () => {
    expect(APP_NAME).toBe('ファイターラボ')
    expect(read('index.html')).toContain(`<title>${APP_NAME}</title>`)
  })

  it('favicon は、自作（開発ツールの初期のロゴではない）', () => {
    const svg = read('public/favicon.svg')
    expect(svg).not.toContain('#863bff') // 開発ツールの雛形の色
    expect(svg).toContain('ファイターラボ')
    expect(svg).toContain('このプロジェクトで描いた')
  })
})
