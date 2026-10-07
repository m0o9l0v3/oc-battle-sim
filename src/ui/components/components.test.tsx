import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  Button,
  ChoiceCard,
  HudPanel,
  HudPlayer,
  MESSAGE_SYMBOLS,
  MessageBand,
  RemainingPoints,
  StepBar,
  Stepper,
  Tooltip,
} from './index.ts'

const html = renderToStaticMarkup

describe('Button', () => {
  it('主・補助。文字のラベルつき', () => {
    expect(html(<Button variant="main">つぎへ</Button>)).toContain('class="button button--main"')
    expect(html(<Button>もどる</Button>)).toContain('class="button button--sub"')
    expect(html(<Button>もどる</Button>)).toContain('>もどる<')
  })

  it('押せないとき: disabled と、近くに理由（読み上げにも、つながる）', () => {
    const markup = html(
      <Button variant="main" disabled reason="あと 1ポイント つかおう">
        つぎへ
      </Button>,
    )
    expect(markup).toContain('disabled')
    expect(markup).toMatch(/aria-describedby="([^"]+)"/)
    const id = /aria-describedby="([^"]+)"/.exec(markup)![1]
    expect(markup).toContain(`id="${id}"`)
    expect(markup).toContain('あと 1ポイント つかおう')
  })

  it('押せるときは、理由を出さない（場所だけ確保して、画面が動かない）', () => {
    const markup = html(
      <Button variant="main" reason="ひみつ">
        つぎへ
      </Button>,
    )
    expect(markup).not.toContain('ひみつ')
    expect(markup).not.toContain('aria-describedby')
    expect(markup).toContain('button-wrap__reason')
  })
})

describe('ChoiceCard', () => {
  it('選んだものは、枠（data-checked）と ✓ で示す。選んでいないものは、✓ がない', () => {
    const on = html(
      <ChoiceCard name="g" checked onChange={() => {}}>
        あか
      </ChoiceCard>,
    )
    const off = html(
      <ChoiceCard name="g" checked={false} onChange={() => {}}>
        あお
      </ChoiceCard>,
    )
    expect(on).toContain('data-checked="true"')
    expect(on).toContain('choice__check')
    expect(on).toContain('✓')
    expect(off).toContain('data-checked="false"')
    expect(off).not.toContain('✓')
    expect(on).toContain('type="radio"')
  })
})

describe('MessageBand', () => {
  it('成功は ✓、注意は ！、情報は i。記号と文字つき', () => {
    expect(MESSAGE_SYMBOLS).toEqual({ success: '✓', warn: '！', info: 'i' })
    for (const kind of ['success', 'warn', 'info'] as const) {
      const markup = html(<MessageBand kind={kind}>つかえるよ</MessageBand>)
      expect(markup).toContain(`message-band--${kind}`)
      expect(markup).toContain(MESSAGE_SYMBOLS[kind])
      expect(markup).toContain('つかえるよ')
    }
  })
})

describe('Tooltip・Stepper・RemainingPoints・StepBar・HUD', () => {
  it('Tooltip: キーボードでもフォーカスできる。説明は読み上げにつながる', () => {
    const markup = html(<Tooltip text="ジャンプの たかさが かわるよ">ジャンプ力</Tooltip>)
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('role="tooltip"')
    expect(markup).toContain('ジャンプの たかさが かわるよ')
  })

  it('Stepper: 範囲の端で、押せなくなる。数字を大きく出す', () => {
    const markup = html(
      <Stepper
        label="こうげき力"
        value={8}
        decreaseLabel="へらす"
        increaseLabel="ふやす"
        canDecrease
        canIncrease={false}
        onDecrease={() => {}}
        onIncrease={() => {}}
      />,
    )
    expect(markup).toMatch(/aria-label="へらす"[^>]*>/)
    expect(markup).toMatch(
      /<button[^>]*disabled[^>]*aria-label="ふやす"|<button[^>]*aria-label="ふやす"[^>]*disabled/,
    )
    expect(markup).not.toMatch(/<button[^>]*aria-label="へらす"[^>]*disabled/)
    expect(markup).toContain('stat-row__value')
    expect(markup).toContain('>8<')
  })

  it('RemainingPoints: 読み上げ領域（role=status）', () => {
    const markup = html(<RemainingPoints remaining={3} text="あと 3ポイント" />)
    expect(markup).toContain('role="status"')
    expect(markup).toContain('あと 3ポイント')
  })

  it('StepBar: 5 つの段階。いまの段階を、色と ▶ で強調。S01 には出さない', () => {
    const markup = html(<StepBar screen="S05" />)
    expect((markup.match(/<li/g) ?? []).length).toBe(5)
    expect(markup).toContain('▶ ためす')
    expect(markup).toContain('aria-current="step"')
    expect(html(<StepBar screen="S01" />)).toBe('')
    expect(html(<StepBar screen="S07" />)).toContain('▶ たいせん')
  })

  it('HUD: ダメージ・ストック・名前。1P・2P の文字つき', () => {
    const markup = html(
      <HudPanel headline="のこり 80びょう">
        <HudPlayer slot="p1" name="ひろし" stocksText="のこり 3たい" damageText="42%" />
        <HudPlayer slot="p2" name="あいて" stocksText="のこり 2たい" damageText="120%" />
      </HudPanel>,
    )
    expect(markup).toContain('のこり 80びょう')
    expect(markup).toContain('1P')
    expect(markup).toContain('2P')
    expect(markup).toContain('42%')
    expect(markup).toContain('120%')
    expect(markup).toContain('hud-player--p1')
  })
})
