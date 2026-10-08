import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { createDefaultConfig, DEFAULT_STATS } from '../fighter/index.ts'
import type { MatchRecord, PlayerMetrics } from '../model/index.ts'
import { findBannedWords } from '../report/index.ts'
import { presetStage } from '../stage/index.ts'
import { BattleReport, durationText, fmt, fmtOrDash } from './BattleReport.tsx'

const m = messages.battleReport

const metrics = (o: Partial<PlayerMetrics> = {}): PlayerMetrics => ({
  stocksLeft: 2,
  damageDealt: 48,
  damageTaken: 30.5,
  hitsLanded: 4,
  attacksThrown: 11,
  kos: 1,
  selfKos: 0,
  deaths: 1,
  maxDamageEndured: 87,
  recoverySuccess: 2,
  recoveryFailure: 1,
  jumps: 14,
  moveDistance: 52.34,
  avgKnockbackDistance: 3.256,
  ...o,
})

const record = (o: Partial<MatchRecord> = {}): MatchRecord => ({
  schemaVersion: 1,
  matchNo: 1,
  p1Config: {
    ...createDefaultConfig('p1'),
    stats: { attackPower: 8, defense: 2, jumpPower: 5, speed: 5 },
  },
  p2Config: createDefaultConfig('p2'),
  stage: presetStage('standard'),
  outcome: { winner: 'p1', reason: 'stocks' },
  durationSec: 83,
  p1: metrics(),
  p2: metrics({
    stocksLeft: 0,
    deaths: 3,
    damageDealt: 30.5,
    damageTaken: 48,
    kos: 0,
    avgKnockbackDistance: null,
  }),
  ...o,
})

const html = (r: MatchRecord = record(), prev = false) =>
  renderToStaticMarkup(<BattleReport record={r} hasPreviousMatch={prev} onRedesign={() => {}} />)

describe('S08 Battle Report', () => {
  it('勝敗と理由、残りのストック、時間が出る', () => {
    const markup = html()
    expect(markup).toContain(messages.flow.report.win('ファイター'))
    expect(markup).toContain(messages.flow.report.reasons.stocks)
    expect(markup).toContain('●●') // 1P の残り 2
    expect(markup).toContain('○') // 失った分
    expect(markup).toContain('1ふん 23びょう')
  })

  it('引き分けも、結果の 1 つとして、同じ扱い', () => {
    const markup = html(record({ outcome: { winner: null, reason: 'draw_timeup' } }))
    expect(markup).toContain(messages.flow.report.draw)
    expect(markup).toContain(messages.flow.report.reasons.draw_timeup)
  })

  it('たいせんの けっか: 6 つの指標が、1P・2P の列に並ぶ', () => {
    const markup = html()
    for (const label of Object.values(m.rows)) expect(markup).toContain(label)
    expect(markup).toContain('48%') // 1P の与ダメージ
    expect(markup).toContain('30.5%') // 小数は 1 桁
    expect(markup).toContain('87%') // 耐えた最大ダメージ
    expect(markup).toContain('2 / 1') // もどれた / もどれなかった
    expect(markup).toContain(`>${m.players.p1}<`)
    expect(markup).toContain(`>${m.players.p2}<`)
  })

  it('すうじと うごき: 能力値ごとに、確定（すうじから きまる）と観察（しあいで みた）が、1 つずつ。使った能力値も出る', () => {
    const markup = html()
    expect(markup).toContain(`${m.motion}（${m.motionYours}）`)
    expect(markup).toContain(m.confirmed)
    expect(markup).toContain(m.observed)
    // 使った能力値（こうげき力 8、ふっとばされにくさ 2、…）
    expect(markup).toContain(`${messages.stat.stats.attackPower.label} 8`)
    expect(markup).toContain(`${messages.stat.stats.defense.label} 2`)
    // 確定: こうげき力 8 → 1 かいの ダメージ 13.08 %
    expect(markup).toContain(m.motionRows.attackPower.confirmed)
    expect(markup).toContain('13.08%')
    // 確定: ジャンプ 1.69 セル（5）、速さ 3.75
    expect(markup).toContain('1.69セル')
    expect(markup).toContain('3.75セル/びょう')
    // 確定: ふっとぶ きょり（defense 2、60 % → 6.9 セル）
    expect(markup).toContain(m.motionRows.defense.confirmed(60))
    expect(markup).toContain('6.9セル')
    // 観察: あてた かいすう、ふっとんだ きょり、ジャンプ / もどれた、うごいた きょり
    expect(markup).toContain('4かい')
    expect(markup).toContain('3.3セル')
    expect(markup).toContain('14かい / 2かい')
    expect(markup).toContain('52.3セル')
  })

  it('2P の「すうじと うごき」は、折りたたみで見られる。2P の能力値も出る', () => {
    const markup = html()
    expect(markup).toContain('<details')
    expect(markup).toContain(m.foeMotion)
  })

  it('当てはまらない値は「—」。受けたヒットが 0 のとき', () => {
    expect(fmtOrDash(null)).toBe('—')
    expect(fmtOrDash(2.25)).toBe('2.3')
    const markup = html(record({ p1: metrics({ avgKnockbackDistance: null }) }))
    expect(markup).toContain('>—<')
  })

  it('自滅は、0 でないときだけ、補足で出す', () => {
    expect(html()).not.toContain('じぶんで おちた かいすう')
    expect(html(record({ p1: metrics({ selfKos: 2 }) }))).toContain(m.selfKos(2))
  })

  it('問いかけは、1 つだけ。選び方は、battle-report.md §8.3', () => {
    const all = Object.values(m.questions)
    const count = (markup: string) => all.filter((q) => markup.includes(q)).length
    // 1P の与ダメージ 48・被ダメージ 30.5: 2 倍に届かない、自滅なし、復帰の成功 > 失敗 → 順 6
    expect(html()).toContain(m.questions.default)
    expect(count(html())).toBe(1)
    // 2 戦目以降
    expect(html(record({ matchNo: 2 }), true)).toContain(m.questions.changed)
    expect(count(html(record({ matchNo: 2 }), true))).toBe(1)
    expect(html(record({ p1: metrics({ selfKos: 1 }) }))).toContain(m.questions.selfKo)
    expect(html(record({ p1: metrics({ damageDealt: 20, damageTaken: 50 }) }))).toContain(
      m.questions.tookMuch,
    )
  })

  it('「すうじを かえて もういちど」へ進める', () => {
    const markup = html()
    expect(markup).toContain(`>${m.redesign}<`)
    expect(markup).toMatch(
      /<button[^>]*class="button button--main"[^>]*>すうじを かえて もういちど/,
    )
  })

  it('指標のない戦の記録（指標の記録ができる前の保存）でも、使った能力値と勝敗は、見られる', () => {
    const markup = html(record({ p1: undefined, p2: undefined }))
    expect(markup).toContain(m.noMetrics)
    expect(markup).toContain(`${messages.stat.stats.attackPower.label}`)
    expect(markup).toContain('<b>8</b>')
    expect(markup).toContain(`>${m.redesign}<`)
  })
})

describe('表現のルール（battle-report.md §8）: 正解を押しつけない', () => {
  /** 使わない言葉（§8.2） */

  /** Battle Report に出す、すべての文言（問いかけ・見出し・単位） */
  const texts = (): string[] => {
    const out: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') out.push(v)
      else if (typeof v === 'function') {
        try {
          out.push(String((v as (...a: number[]) => unknown)(1, 2)))
        } catch {
          /* 引数を取らない関数は、ここでは見ない */
        }
      } else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(m)
    walk(messages.flow.report)
    return out
  }

  it('使わない言葉が、文言にない', () => {
    const all = texts()
    expect(all.length).toBeGreaterThan(30)
    for (const t of all) expect(findBannedWords(t), t).toEqual([])
  })

  it('問いかけは、答えを決めない（「か」「？」で終わる）。1 つの能力値を、勧めない', () => {
    for (const q of Object.values(m.questions)) {
      expect(q, q).toMatch(/[？?]$/)
      // 「〜を あげよう」「〜を ふやそう」など、行動の指示になる言い方をしない
      expect(q).not.toMatch(/しよう|あげよう|ふやそう|へらそう|えらんで ためそう/)
    }
  })

  it('点数・順位・星を、出さない', () => {
    const markup = html()
    for (const w of ['点', '位', '★', '☆', 'ポイント', '順位']) expect(markup, w).not.toContain(w)
  })

  it('数字に、よい・わるいの色を付けない（結果の表に、色の指定がない）', () => {
    const markup = html()
    expect(markup).not.toMatch(/style="[^"]*color/)
  })
})

describe('数字の表示', () => {
  it('整数はそのまま。そうでなければ小数 1 桁（指定すれば 2 桁）', () => {
    expect(fmt(48)).toBe('48')
    expect(fmt(30.5)).toBe('30.5')
    expect(fmt(3.256)).toBe('3.3')
    expect(fmt(13.08, 2)).toBe('13.08')
    expect(fmt(0)).toBe('0')
  })

  it('時間: 1 分以上は「○ふん ○びょう」', () => {
    expect(durationText(83)).toBe('1ふん 23びょう')
    expect(durationText(45)).toBe('45びょう')
    expect(durationText(120)).toBe('2ふん 0びょう')
    expect(DEFAULT_STATS.attackPower).toBe(5)
  })
})
