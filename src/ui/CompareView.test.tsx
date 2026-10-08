import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import type { MatchRecord, PlayerMetrics, Stats } from '../model/index.ts'
import { findBannedWords } from '../report/index.ts'
import { presetStage } from '../stage/index.ts'
import { CompareView, fmtDelta } from './CompareView.tsx'

const m = messages.comparison
const S = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})

const metrics = (o: Partial<PlayerMetrics> = {}): PlayerMetrics => ({
  stocksLeft: 2,
  damageDealt: 40,
  damageTaken: 30,
  hitsLanded: 3,
  attacksThrown: 8,
  kos: 1,
  selfKos: 0,
  deaths: 1,
  maxDamageEndured: 70,
  recoverySuccess: 1,
  recoveryFailure: 0,
  jumps: 10,
  moveDistance: 50,
  avgKnockbackDistance: 3,
  ...o,
})

const rec = (
  matchNo: number,
  p1: Stats,
  o: Partial<MatchRecord> = {},
  m1 = metrics(),
  m2 = metrics(),
): MatchRecord => ({
  schemaVersion: 1,
  matchNo,
  p1Config: { ...createDefaultConfig('p1'), stats: p1 },
  p2Config: createDefaultConfig('p2'),
  stage: presetStage('standard'),
  outcome: { winner: 'p1', reason: 'stocks' },
  durationSec: 60,
  p1: m1,
  p2: m2,
  ...o,
})

const html = (matches: MatchRecord[]) =>
  renderToStaticMarkup(<CompareView matches={matches} onRedesign={() => {}} onEnd={() => {}} />)

const two = () => [
  rec(
    1,
    S(5, 5, 5, 5),
    { durationSec: 50 },
    metrics({ damageDealt: 40, hitsLanded: 3, moveDistance: 50 }),
  ),
  rec(
    2,
    S(7, 3, 5, 5),
    { outcome: { winner: null, reason: 'draw_timeup' }, durationSec: 62 },
    metrics({ damageDealt: 55.5, hitsLanded: 5, moveDistance: 41.2 }),
  ),
]

describe('S11 結果の比較', () => {
  it('①: 1P の能力値 4 つが、前・あと・差で並ぶ。変わった行は ◆ で強調（変わらない行は 0）', () => {
    const markup = html(two())
    for (const k of ['attackPower', 'defense', 'jumpPower', 'speed'] as const) {
      expect(markup).toContain(messages.stat.stats[k].label)
    }
    expect(markup).toContain('<span aria-hidden="true">◆ </span>＋2')
    expect(markup).toContain('<span aria-hidden="true">◆ </span>−2')
    // 変わった行は、強調のクラス。変わらない行は、そうでない
    expect(markup).toMatch(/compare-row compare-row--changed"><th scope="row">こうげき力/)
    expect(markup).toMatch(
      /class="compare-row"><th scope="row">ジャンプ力<\/th><td>5<\/td><td>5<\/td><td class="compare-row__delta">0</,
    )
    expect(markup).toContain(m.matchShort(1))
    expect(markup).toContain(`${m.matchShort(2)}（${m.now}）`)
  })

  it('②: 変えた能力値と、すうじから きまる うごきが、直接つながる（左 → 右、差）', () => {
    const markup = html(two())
    expect(markup).toContain(m.effects)
    expect(markup).toContain('→ 1かいの ダメージ')
    expect(markup).toContain('12% → 12.72%')
    expect(markup).toContain('（＋0.72）')
    expect(markup).toContain(messages.battleReport.motionRows.defense.confirmed(60))
    // 変えていない能力値（ジャンプ、速さ）は、②に出ない
    expect(markup).not.toContain('→ ジャンプの たかさ')
    expect(markup).not.toContain('→ いどうの はやさ')
  })

  it('③: 各指標の、前 → あとの変化が、差つきで出る。勝敗は、それぞれ文で。試合の長さも', () => {
    const markup = html(two())
    expect(markup).toContain(m.results)
    expect(markup).toContain(m.resultsNote)
    expect(markup).toContain('40%') // 前
    expect(markup).toContain('55.5%') // あと
    expect(markup).toContain('＋15.5') // 差
    expect(markup).toContain(messages.flow.report.win('ファイター'))
    expect(markup).toContain(messages.flow.report.draw)
    expect(markup).toContain('50びょう')
    expect(markup).toContain('62びょう')
    expect(markup).toContain('＋12')
    // しあいで みた うごき: あてた かいすう 3 → 5（＋2）、うごいた きょり 50 → 41.2（−8.8）
    expect(markup).toContain(m.observedHead)
    expect(markup).toContain('＋2')
    expect(markup).toContain('−8.8')
  })

  it('①②と③を、区別して見せる（②は「すうじから きまる」、③は「うんや あいての うごきでも かわる」）', () => {
    const markup = html(two())
    expect(markup).toContain(m.effectsNote)
    expect(markup).toContain(m.resultsNote)
    expect(markup.indexOf(m.effects)).toBeLessThan(markup.indexOf(m.results))
  })

  it('比べる戦を選べる（既定は、直前の戦と、いま終わった戦。同じ戦は選べない）', () => {
    const three = [...two(), rec(3, S(6, 4, 5, 5))]
    const markup = html(three)
    // 既定: 第 2 戦と 第 3 戦
    expect(markup).toMatch(/<select[^>]*>[^]*?<option value="2"[^>]*>だい 2 せん/)
    expect(markup).toMatch(/<option value="3"[^>]*>だい 3 せん/)
    // 左の選択に、右と同じ戦（3）は出ない
    const left = /<select[^>]*>([^]*?)<\/select>/.exec(markup)![1]!
    expect(left).not.toContain('value="3"')
    expect(left).toContain('value="1"')
  })

  it('戦が 1 つしかないときは、比べられない案内。「おわる」は、押せる', () => {
    const markup = html(two().slice(0, 1))
    expect(markup).toContain(m.needTwo)
    expect(markup).toContain(`>${messages.flow.compare.finish}<`)
  })

  it('「もう一度 すうじを かえる」「おわる」', () => {
    const markup = html(two())
    expect(markup).toContain(`>${messages.flow.compare.again}<`)
    expect(markup).toContain(`>${messages.flow.compare.finish}<`)
  })
})

describe('注意（誤解を防ぐ）', () => {
  it('結果のばらつきの注意が、いつも出る', () => {
    expect(html(two())).toContain(m.notes.resultsVary)
  })

  it('2P の能力値も変わっているとき、2P の見出しに ◆ と、注意', () => {
    const b = {
      ...rec(2, S(7, 3, 5, 5)),
      p2Config: { ...createDefaultConfig('p2'), stats: S(8, 2, 5, 5) },
    }
    const markup = html([rec(1, S(5, 5, 5, 5)), b])
    expect(markup).toContain(m.notes.p2Changed)
    expect(markup).toMatch(/<summary><span aria-hidden="true">◆ <\/span>2P の すうじ/)
    expect(html(two())).not.toContain(m.notes.p2Changed)
  })

  it('試合の長さが 30 秒以上違うとき', () => {
    const markup = html([
      rec(1, S(5, 5, 5, 5), { durationSec: 40 }),
      rec(2, S(7, 3, 5, 5), { durationSec: 80 }),
    ])
    expect(markup).toContain(m.notes.durationDiffers(40, 80))
  })

  it('1P の能力値が同じとき: 「おなじ だよ」。②は出さず、原因を決めつけない問いかけ', () => {
    const markup = html([rec(1, S(5, 5, 5, 5)), rec(2, S(5, 5, 5, 5))])
    expect(markup).toContain(m.notes.p1Unchanged)
    expect(markup).toContain(m.effectsNone)
    expect(markup).toContain(m.questions.same)
  })

  it('結果に違いがないときは、「けっかは おなじ くらい だったよ」（事実だけ）', () => {
    const same = [rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5))]
    expect(html(same)).toContain(m.notes.resultsSame)
    expect(html(two())).not.toContain(m.notes.resultsSame)
  })

  it('みためと ステージが同じときだけ、「おなじ」を出す。違うときは、警告に置き換える', () => {
    expect(html(two())).toContain(m.sameLook)
    const diffStage = [rec(1, S(5, 5, 5, 5)), rec(2, S(7, 3, 5, 5), { stage: presetStage('wide') })]
    const markup = html(diffStage)
    expect(markup).not.toContain(m.sameLook)
    expect(markup).toContain(m.notes.stageDiffers)
    const cfg = createDefaultConfig('p1')
    const look = [
      rec(1, S(5, 5, 5, 5)),
      rec(2, S(7, 3, 5, 5), {
        p1Config: { ...cfg, stats: S(7, 3, 5, 5), appearance: { ...cfg.appearance, body: 'b2' } },
      }),
    ]
    expect(html(look)).toContain(m.notes.appearanceDiffers)
    expect(html(look)).not.toContain(m.sameLook)
  })
})

describe('表現のルール（comparison.md §7。正解を押しつけない）', () => {
  const texts = (): string[] => {
    const out: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') out.push(v)
      else if (typeof v === 'function') out.push(String((v as (...a: number[]) => unknown)(1, 2)))
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(m)
    return out
  }

  it('使わない言葉が、文言にない（よい・わるい、おすすめ、点数）', () => {
    const all = texts()
    expect(all.length).toBeGreaterThan(30)
    for (const t of all) expect(findBannedWords(t), t).toEqual([])
  })

  it('問いかけは、1 つだけ。答えを決めない。「1つずつ変える」ことを勧めない。ふやした数字と、へらした数字の「組」', () => {
    const questions = Object.values(m.questions)
    const markup = html(two())
    expect(questions.filter((q) => markup.includes(q)).length).toBe(1)
    for (const q of questions) {
      expect(q, q).toMatch(/[？?）]$/)
      expect(q).not.toMatch(/ひとつずつ|1つずつ|ためそう|しよう/)
    }
    for (const k of ['attackPower', 'defense', 'jumpPower', 'speed'] as const) {
      expect(m.questions[k]).toContain('ふやした すうじと、へらした すうじ')
    }
  })

  it('差に、よい・わるいの色・矢印を使わない（中立）。点数・順位がない', () => {
    const markup = html(two())
    expect(markup).not.toMatch(/style="[^"]*color/)
    for (const w of ['▲', '▼', '↑', '↓', '★', '順位', 'ポイント'])
      expect(markup, w).not.toContain(w)
  })
})

describe('差の表示（comparison.md §5.4）', () => {
  it('＋ − 0。小数は指定の桁。四捨五入で 0 になるときは、符号なしの 0。計算できないときは「—」', () => {
    expect(fmtDelta(2)).toBe('＋2')
    expect(fmtDelta(-2)).toBe('−2')
    expect(fmtDelta(0)).toBe('0')
    expect(fmtDelta(0.724, 1)).toBe('＋0.7')
    expect(fmtDelta(0.72, 2)).toBe('＋0.72')
    expect(fmtDelta(-8.8, 1)).toBe('−8.8')
    expect(fmtDelta(0.04, 1)).toBe('0')
    expect(fmtDelta(-0.04, 1)).toBe('0')
    expect(fmtDelta(null)).toBe('—')
  })
})
