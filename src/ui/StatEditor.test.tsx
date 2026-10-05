import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import type { Stats } from '../model/index.ts'
import { StatEditor } from './StatEditor.tsx'
import { StatScreen } from './StatScreen.tsx'

const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})
const noop = () => {}
const html = (stats: Stats, extra: { onBack?: () => void } = {}) =>
  renderToStaticMarkup(<StatScreen stats={stats} onChange={noop} onNext={noop} {...extra} />)

/** aria-label が label のボタンが、無効（disabled）か */
function isDisabled(markup: string, label: string): boolean {
  const re = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`)
  const tag = markup.match(re)?.[0]
  if (!tag) throw new Error(`button not found: ${label}`)
  return /\sdisabled(=|\s|>)/.test(tag)
}

const m = messages.stat

describe('S03 の表示', () => {
  it('残りポイントが常に表示される（使い切ったときも）', () => {
    expect(html(S(5, 5, 5, 4))).toContain(m.remaining(1))
    expect(html(S(2, 2, 2, 2))).toContain(m.remaining(12))
    expect(html(S(5, 5, 5, 5))).toContain(m.remainingDone)
  })

  it('各能力値の参加者向けの意味が表示される（4 つとも）', () => {
    const markup = html(S(5, 5, 5, 5))
    for (const key of ['attackPower', 'defense', 'jumpPower', 'speed'] as const) {
      expect(markup).toContain(m.stats[key].label)
      expect(markup).toContain(m.stats[key].meaning)
    }
  })

  it('標準との比較（%）が表示される', () => {
    const markup = html(S(8, 2, 5, 5))
    expect(markup).toContain('ダメージ 109%')
    expect(markup).toContain('ふっとび 109%')
    expect(markup).toContain('たかさ 100%')
    expect(markup).toContain('はやさ 100%')
  })

  it('現在の値が大きく表示される', () => {
    const markup = html(S(8, 2, 6, 4))
    expect(markup).toMatch(/<output[^>]*>8<\/output>/)
    expect(markup).toMatch(/<output[^>]*>2<\/output>/)
    expect(markup).toMatch(/<output[^>]*>6<\/output>/)
    expect(markup).toMatch(/<output[^>]*>4<\/output>/)
  })
})

describe('範囲外の操作ができない（ボタンが無効）', () => {
  it('最大（8）の「＋」・最小（2）の「−」は無効。理由が近くに出る', () => {
    const markup = html(S(8, 2, 5, 5))
    expect(isDisabled(markup, m.increase(m.stats.attackPower.label))).toBe(true)
    expect(isDisabled(markup, m.decrease(m.stats.defense.label))).toBe(true)
    expect(markup).toContain(m.atMax(8))
    expect(markup).toContain(m.atMin(2))
  })

  it('範囲内の「−」「＋」は有効（残りがあるとき）', () => {
    const markup = html(S(5, 5, 5, 4))
    expect(isDisabled(markup, m.increase(m.stats.speed.label))).toBe(false)
    expect(isDisabled(markup, m.decrease(m.stats.speed.label))).toBe(false)
    expect(isDisabled(markup, m.decrease(m.stats.attackPower.label))).toBe(false)
  })

  it('合計が 20 のとき、すべての「＋」が無効。理由（ポイントがない）が出る。「−」は有効', () => {
    const markup = html(S(5, 5, 5, 5))
    for (const key of ['attackPower', 'defense', 'jumpPower', 'speed'] as const) {
      expect(isDisabled(markup, m.increase(m.stats[key].label))).toBe(true)
      expect(isDisabled(markup, m.decrease(m.stats[key].label))).toBe(false)
    }
    expect(markup).toContain(m.noPoints)
  })

  it('ポイントが残っているとき、「ポイントがない」理由は出さない', () => {
    expect(html(S(5, 5, 5, 4))).not.toContain(m.noPoints)
  })
})

describe('「つぎへ」（全ポイント使用が条件）', () => {
  const nextTag = (markup: string) => markup.match(/<button[^>]*>つぎへ<\/button>/)?.[0] ?? ''

  it('使い切っていないときは、押せない。理由（あと何ポイント）が表示される', () => {
    const markup = html(S(5, 5, 5, 4))
    expect(nextTag(markup)).toMatch(/\sdisabled(=|\s|>)/)
    expect(markup).toContain(m.nextBlocked(1))
  })

  it('使い切ったときは、押せる。理由は出ない', () => {
    const markup = html(S(8, 2, 5, 5))
    expect(nextTag(markup)).not.toMatch(/\sdisabled(=|\s|>)/)
    expect(markup).not.toContain('つかおう')
  })

  it('合計が 20 でも、範囲外の値があれば押せない。理由が表示される', () => {
    const markup = html(S(9, 3, 4, 4))
    expect(nextTag(markup)).toMatch(/\sdisabled(=|\s|>)/)
    expect(markup).toContain(m.nextBlockedInvalid)
  })

  it('押せない理由は、ボタンから参照される（読み上げで伝わる）', () => {
    const markup = html(S(2, 2, 2, 2))
    const tag = nextTag(markup)
    const id = tag.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(markup).toContain(`id="${id}"`)
    expect(markup).toContain(m.nextBlocked(12))
  })
})

describe('標準設定へのリセット・もどる', () => {
  it('「ひょうじゅんに もどす」ボタンがある', () => {
    expect(html(S(8, 2, 5, 5))).toContain(m.reset)
  })

  it('onBack があるときだけ、「もどる」を出す（戻れない画面では出さない）', () => {
    expect(html(S(5, 5, 5, 5))).not.toContain(m.back)
    expect(html(S(5, 5, 5, 5), { onBack: noop })).toContain(m.back)
  })
})

describe('操作できる大きさ・読み上げ', () => {
  it('ボタンに、文字のラベル（aria-label）がある', () => {
    const markup = renderToStaticMarkup(
      <StatEditor stats={S(5, 5, 5, 5)} onChange={noop} heading="x" />,
    )
    expect(markup).toContain(`aria-label="${m.decrease(m.stats.jumpPower.label)}"`)
    expect(markup).toContain(`aria-label="${m.increase(m.stats.jumpPower.label)}"`)
  })

  it('残りポイントは、変化が読み上げられる領域（role=status）', () => {
    expect(html(S(5, 5, 5, 4))).toMatch(/role="status"[^>]*aria-live="polite"/)
  })

  it('能力値の意味は、ツールチップ（title）でも見られる', () => {
    expect(html(S(5, 5, 5, 5))).toContain(`title="${m.stats.jumpPower.meaning}"`)
  })
})
