import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import { createSession } from '../session/index.ts'
import { decodeTakeHome, worstCaseUrlLength } from '../share/index.ts'
import { presetStage } from '../stage/index.ts'
import { EndScreen } from './FlowScreens.tsx'
import { makeQr, QrCode } from './QrCode.tsx'
import { TakeHomeEntry } from './TakeHomeEntry.tsx'

const m = messages.takeHome
const noop = () => {}
const restored = {
  status: 'restored' as const,
  character: { ...createDefaultConfig('p1'), name: 'ゆうしゃ' },
  stage: presetStage('standard'),
}

describe('QR コード', () => {
  it('最悪の持ち帰りURLでも、バージョン 10（57 モジュール）以内に収まる', () => {
    const url = `https://m0o9l0v3.github.io/oc-battle-sim/#t1.${'A'.repeat(148)}`
    expect(url.length).toBe(worstCaseUrlLength())
    const { size } = makeQr(url)
    expect(size).toBeLessThanOrEqual(57)
    expect((size - 17) % 4).toBe(0)
  })

  it('左上に位置検出パターン（7×7 の枠）がある。同じ文字列からは同じ図', () => {
    const a = makeQr('https://example.com/#t1.abc')
    for (let i = 0; i < 7; i++) {
      expect(a.dark(0, i)).toBe(true)
      expect(a.dark(i, 0)).toBe(true)
      expect(a.dark(6, i)).toBe(true)
    }
    expect(a.dark(1, 1)).toBe(false)
    expect(a.dark(3, 3)).toBe(true)
    const b = makeQr('https://example.com/#t1.abc')
    expect(
      [...Array(a.size).keys()].every((r) =>
        [...Array(a.size).keys()].every((c) => a.dark(r, c) === b.dark(r, c)),
      ),
    ).toBe(true)
  })

  it('白地に黒の SVG。余白 4 モジュール。代替テキストつき', () => {
    const html = renderToStaticMarkup(<QrCode text="abc" label="説明" px={300} />)
    expect(html).toContain('<svg')
    expect(html).toContain('aria-label="説明"')
    expect(html).toContain('fill="#ffffff"')
    expect(html).toContain('fill="#000000"')
  })
})

describe('S12 の持ち帰り', () => {
  it('QR と URL の文字、個人情報の注意書きがある。URL を復号すると、1P の設定が戻る', () => {
    const s = createSession()
    const html = renderToStaticMarkup(<EndScreen session={s} onReset={noop} />)
    expect(html).toContain('<svg')
    expect(html).toContain(messages.flow.end.qrNameNote)
    const url = /value="([^"]+)"/.exec(html)?.[1]
    expect(url).toMatch(/^https:\/\/m0o9l0v3\.github\.io\/oc-battle-sim\/#t1\./)
    const r = decodeTakeHome(url!.slice(url!.indexOf('#')))
    expect(r.ok && r.character).toEqual(s.data.p1)
    expect(r.ok && r.stage).toEqual(s.data.stage)
  })

  it('URL は、location ではなく、固定の公開URLから作る（jsdom なしでも同じ）', () => {
    const html = renderToStaticMarkup(<EndScreen session={createSession()} onReset={noop} />)
    expect(html).not.toContain('localhost')
    expect(html).not.toContain('192.168')
  })
})

describe('持ち帰りの入口', () => {
  it('PC: 復元した設定と、「ふたりで あそぶ」「はじめから つくる」', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={restored}
        mobile={false}
        onPlay={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).toContain('ゆうしゃ')
    expect(html).toContain(m.playTwo)
    expect(html).toContain(m.fresh)
    expect(html).not.toContain(m.mobileBody)
  })

  it('復元した外観（プレビュー）とステージの形（見本）を表示する', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={restored}
        mobile={false}
        onPlay={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).toContain('<canvas')
    expect(html).toContain(m.previewLabel('ゆうしゃ'))
    expect(html).toContain('stage-thumb')
  })

  it('失敗で、保存した途中がある（resume）ときは、「まえの つづきから」にする', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={{ status: 'failed', reason: 'BAD_CHECKSUM' }}
        mobile={false}
        resume
        onPlay={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).toContain(m.failedResume)
    expect(html).not.toContain(m.failedStandard)
  })

  it('スマホ: 「スマホで あそぶ」と、パソコンへの案内、URL のコピー。2人で遊ぶボタンはない', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={restored}
        mobile
        onPlay={noop}
        onPlayMobile={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).toContain(m.playMobile)
    expect(html).toContain(m.mobileBody)
    expect(html).toContain('ゆうしゃ')
    expect(html).toContain('#t1.')
    expect(html).not.toContain(m.playTwo)
    expect(html).not.toContain(m.fresh)
  })

  it('PC では「スマホで あそぶ」を出さない', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={restored}
        mobile={false}
        onPlay={noop}
        onPlayMobile={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).not.toContain(m.playMobile)
  })

  it('失敗: 理由と次の操作を示し、復元できたようには見せない', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={{ status: 'failed', reason: 'BAD_CHECKSUM' }}
        mobile={false}
        onPlay={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).toContain(m.failedBody('BAD_CHECKSUM'))
    expect(html).toContain(m.failedStandard)
    expect(html).not.toContain(m.lead)
  })

  it('知らない版: 専用の案内', () => {
    const html = renderToStaticMarkup(
      <TakeHomeEntry
        result={{ status: 'failed', reason: 'UNKNOWN_VERSION' }}
        mobile={false}
        onPlay={noop}
        onFresh={noop}
        onDismiss={noop}
      />,
    )
    expect(html).toContain(m.failedBody('UNKNOWN_VERSION'))
  })
})
