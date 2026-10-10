import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import { presetStage } from '../stage/index.ts'
import { MobilePlayScreen } from './MobilePlayScreen.tsx'

const m = messages.mobile

describe('スマホの対戦画面', () => {
  const html = renderToStaticMarkup(
    <MobilePlayScreen
      config={createDefaultConfig('p1')}
      stage={presetStage('standard')}
      onBack={() => {}}
    />,
  )

  it('対戦の画面と、4つのボタン（左右・ジャンプ・攻撃）と、もどる', () => {
    expect(html).toContain('<canvas')
    expect(html).toContain('mobile-play__canvas')
    for (const a of ['left', 'right', 'jump', 'attack']) {
      expect(html).toContain(`data-action="${a}"`)
    }
    expect(html).toContain(m.back)
  })

  it('ボタンは、記号やことばで示す（色だけに頼らない）', () => {
    expect(html).toContain('◀')
    expect(html).toContain('▶')
    expect(html).toContain(m.jump)
    expect(html).toContain(m.attack)
    expect(html).toContain(`aria-label="${m.left}"`)
  })
})
