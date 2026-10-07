import { describe, expect, it } from 'vitest'
import { simulateMatch } from '../battle/balance.ts'
import { createDefaultConfig, DEFAULT_STATS } from '../fighter/index.ts'
import type { CharacterConfig, ScreenId, Stats } from '../model/index.ts'
import { presetStage } from '../stage/index.ts'
import {
  canGoBack,
  canRematch,
  reduceFlow,
  restoreScreen,
  statsChanged,
  type FlowAction,
} from './flow.ts'
import { createSession, nextMatchNo, type Session } from './state.ts'

const stats = (attackPower: number, defense: number, jumpPower: number, speed: number): Stats => ({
  attackPower,
  defense,
  jumpPower,
  speed,
})
const run = (s: Session, ...actions: FlowAction[]) => actions.reduce(reduceFlow, s)
const at = (s: Session) => s.data.screen
const withP1 = (s: Session, st: Stats): Session =>
  reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, stats: st } })
/** 1P を 6/4/5/5 にする（第 1 戦の設定として使う） */
const withP1Raw = (s: Session): Session => withP1(s, stats(6, 4, 5, 5))
const win = { winner: 'p1', reason: 'stocks' } as const

/** S01 → S06 まで、すべて標準で進める */
const toS06 = (): Session =>
  run(
    createSession(),
    { type: 'START' },
    { type: 'NEXT' },
    { type: 'NEXT' },
    { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' },
    { type: 'NEXT' },
  )

describe('MVP の流れ（S01 → S12）', () => {
  it('最初から最後まで通せる。第1戦の設定と結果が、第2戦のあとも参照できる', () => {
    let s = createSession()
    expect(at(s)).toBe('S01')
    const seen: ScreenId[] = [at(s)]
    const step = (...a: FlowAction[]) => {
      s = run(s, ...a)
      seen.push(at(s))
    }
    step({ type: 'START' }) // S02
    s = reduceFlow(s, {
      type: 'SET_P1',
      config: {
        ...s.data.p1,
        name: 'ひろし',
        appearance: { body: 'b3', face: 'f2', color: 'c4', accessory: 'a1' },
      },
    })
    step({ type: 'NEXT' }) // S03
    s = withP1(s, stats(8, 2, 5, 5))
    step({ type: 'NEXT' }) // S04
    step({ type: 'CONFIRM_STAGE', stage: presetStage('wide'), presetId: 'wide' }) // S05
    step({ type: 'NEXT' }) // S06
    step({ type: 'BEGIN_MATCH' }) // S07
    const sim1 = simulateMatch(s.data.stage, [s.data.p1.stats, s.data.p2.stats], 1)
    step({ type: 'FINISH_MATCH', outcome: sim1.outcome, durationSec: 60 }) // S08
    step({ type: 'REDESIGN' }) // S09
    s = withP1(s, stats(2, 8, 5, 5))
    step({ type: 'BEGIN_MATCH' }) // S10
    const sim2 = simulateMatch(s.data.stage, [s.data.p1.stats, s.data.p2.stats], 2)
    step({ type: 'FINISH_MATCH', outcome: sim2.outcome, durationSec: 70 }) // S11
    step({ type: 'END' }) // S12

    expect(seen).toEqual([
      'S01',
      'S02',
      'S03',
      'S04',
      'S05',
      'S06',
      'S07',
      'S08',
      'S09',
      'S10',
      'S11',
      'S12',
    ])
    // 第 1 戦・第 2 戦の設定と結果が、残っている
    const [m1, m2] = s.data.matches
    expect(s.data.matches).toHaveLength(2)
    expect(m1!.matchNo).toBe(1)
    expect(m2!.matchNo).toBe(2)
    expect(m1!.p1Config.stats).toEqual(stats(8, 2, 5, 5))
    expect(m2!.p1Config.stats).toEqual(stats(2, 8, 5, 5))
    expect(m1!.p1Config.name).toBe('ひろし')
    expect(m1!.p1Config.appearance.body).toBe('b3')
    expect(m1!.outcome).toEqual(sim1.outcome)
    expect(m1!.stage.name).toBe('ひろば')
    expect(m1!.durationSec).toBe(60)
    // S12 でも、見た目・能力値・ステージを保持している（持ち帰り用QRに使う）
    expect(s.data.p1.stats).toEqual(stats(2, 8, 5, 5))
    expect(s.data.stage.name).toBe('ひろば')
  })

  it('再戦は何度でもできる。新しい戦として追加し、既存の戦を上書きしない', () => {
    let s = toS06()
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 50 },
      { type: 'REDESIGN' },
    )
    const first = JSON.stringify(s.data.matches[0])
    for (let i = 0; i < 4; i++) {
      s = withP1(s, i % 2 === 0 ? stats(6, 4, 5, 5) : stats(4, 6, 5, 5))
      s = run(s, { type: 'BEGIN_MATCH' }, { type: 'FINISH_MATCH', outcome: win, durationSec: 40 })
      expect(at(s)).toBe('S11')
      s = run(s, { type: 'REDESIGN' })
    }
    expect(s.data.matches.map((m) => m.matchNo)).toEqual([1, 2, 3, 4, 5])
    expect(JSON.stringify(s.data.matches[0])).toBe(first)
  })

  it('戦の記録は、その時点の設定を持つ。あとで設定を変えても、過去の戦は変わらない', () => {
    let s = toS06()
    s = run(s, { type: 'BEGIN_MATCH' })
    // 対戦中に、編集が来ても（本来は来ない）、固定した設定は変わらない
    s = reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, stats: stats(8, 8, 2, 2) } })
    s = run(s, { type: 'FINISH_MATCH', outcome: win, durationSec: 30 })
    expect(s.data.matches[0]!.p1Config.stats).toEqual({ ...DEFAULT_STATS })
  })

  it('上限（20 戦）を超えたら、古い戦から捨てる。matchNo は戻らない', () => {
    let s = toS06()
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    for (let i = 0; i < 24; i++) {
      s = withP1(s, i % 2 === 0 ? stats(6, 4, 5, 5) : stats(5, 5, 5, 5))
      s = run(
        s,
        { type: 'BEGIN_MATCH' },
        { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
        { type: 'REDESIGN' },
      )
    }
    expect(s.data.matches).toHaveLength(20)
    expect(s.data.matches[0]!.matchNo).toBe(6)
    expect(s.data.matches.at(-1)!.matchNo).toBe(25)
    expect(nextMatchNo(s)).toBe(26)
  })
})

describe('戦の結果に、指標が付く（FINISH_MATCH）', () => {
  it('指標を渡すと、戦の記録に、1P・2P の指標が入る。なくても、記録できる', () => {
    const m = {
      stocksLeft: 1,
      damageDealt: 1,
      damageTaken: 2,
      hitsLanded: 3,
      attacksThrown: 4,
      kos: 0,
      selfKos: 0,
      deaths: 2,
      maxDamageEndured: 9,
      recoverySuccess: 0,
      recoveryFailure: 0,
      jumps: 0,
      moveDistance: 0,
      avgKnockbackDistance: null,
    }
    let s = run(
      toS06(),
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 5, p1: m, p2: { ...m, kos: 2 } },
    )
    expect(s.data.matches[0]!.p1).toEqual(m)
    expect(s.data.matches[0]!.p2!.kos).toBe(2)
    s = run(s, { type: 'REDESIGN' })
    s = withP1(s, stats(6, 4, 5, 5))
    s = run(s, { type: 'BEGIN_MATCH' }, { type: 'FINISH_MATCH', outcome: win, durationSec: 5 })
    expect(s.data.matches[1]!.p1).toBeUndefined()
  })
})

describe('戻る・進むのルール（user-flow.md §5.11）', () => {
  it('S03 → S02、S04 → S03、S06 → S05。入力した内容は保持する', () => {
    let s = run(createSession(), { type: 'START' })
    s = reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, name: 'ひろし' } })
    s = run(s, { type: 'NEXT' }, { type: 'BACK' })
    expect(at(s)).toBe('S02')
    expect(s.data.p1.name).toBe('ひろし')
    s = run(s, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'BACK' })
    expect(at(s)).toBe('S03')
    s = toS06()
    expect(at(run(s, { type: 'BACK' }))).toBe('S05')
  })

  it('S01・S02・S05（直接）・S07・S08・S10・S11・S12 は、「戻る」で戻れない', () => {
    for (const screen of ['S01', 'S02', 'S05', 'S07', 'S08', 'S10', 'S11', 'S12'] as const) {
      const s = { ...createSession(), data: { ...createSession().data, screen } }
      expect(reduceFlow(s, { type: 'BACK' }), screen).toBe(s)
      expect(canGoBack(s), screen).toBe(false)
    }
    for (const screen of ['S03', 'S04', 'S06', 'S09'] as const) {
      expect(canGoBack({ ...createSession(), data: { ...createSession().data, screen } })).toBe(
        true,
      )
    }
  })

  it('S05 → S03 に戻ったとき、S03 の「つぎへ」は S04 を通らず S05 へ戻る。S05 → S04 は、S04 の「つぎへ」で S05 へ', () => {
    let s = toS06()
    s = run(s, { type: 'BACK' }) // S05
    s = run(s, { type: 'FIX_STATS' })
    expect(at(s)).toBe('S03')
    s = withP1(s, stats(8, 2, 5, 5))
    s = run(s, { type: 'NEXT' })
    expect(at(s)).toBe('S05')
    expect(s.data.p1.stats).toEqual(stats(8, 2, 5, 5))
    // もう一度。次の S03 は、通常の経路（S04 へ）
    s = run(s, { type: 'FIX_STAGE' })
    expect(at(s)).toBe('S04')
    s = run(s, { type: 'CONFIRM_STAGE', stage: presetStage('tower'), presetId: 'tower' })
    expect(at(s)).toBe('S05')
    expect(s.data.stage.name).toBe('たかいとう')
    expect(s.data.stagePresetId).toBe('tower')
    // S05 → S03 → 「もどる」（S02）→ ふたたび S03 の「つぎへ」は S04 へ
    s = run(s, { type: 'FIX_STATS' }, { type: 'BACK' }, { type: 'NEXT' }, { type: 'NEXT' })
    expect(at(s)).toBe('S04')
  })

  it('S09 の「もどる」: 第1戦の直後は S08、再戦のあとは S11。変更は、破棄する', () => {
    let s = toS06()
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    s = withP1(s, stats(8, 2, 5, 5))
    s = run(s, { type: 'BACK' })
    expect(at(s)).toBe('S08')
    expect(s.data.p1.stats).toEqual({ ...DEFAULT_STATS }) // 破棄された
    s = run(s, { type: 'REDESIGN' })
    s = withP1(s, stats(8, 2, 5, 5))
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    s = withP1(s, stats(3, 7, 5, 5))
    s = run(s, { type: 'BACK' })
    expect(at(s)).toBe('S11')
    expect(s.data.p1.stats).toEqual(stats(8, 2, 5, 5)) // 直前の戦の値
  })
})

describe('進める条件', () => {
  it('S03: ポイントを使い切るまで、S04 へ進めない', () => {
    let s = run(createSession(), { type: 'START' }, { type: 'NEXT' })
    s = withP1(s, stats(5, 5, 5, 4))
    expect(at(run(s, { type: 'NEXT' }))).toBe('S03')
    s = withP1(s, stats(5, 5, 5, 6))
    expect(at(run(s, { type: 'NEXT' }))).toBe('S03')
    s = withP1(s, stats(5, 5, 5, 5))
    expect(at(run(s, { type: 'NEXT' }))).toBe('S04')
  })

  it('S02: 名前が未入力なら、デフォルト名で進む', () => {
    let s = run(createSession(), { type: 'START' })
    s = reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, name: '   ' } })
    s = run(s, { type: 'NEXT' })
    expect(s.data.p1.name).toBe('ファイター')
  })

  it('S04: 検証を通らないステージは、確定できない', () => {
    let s = run(createSession(), { type: 'START' }, { type: 'NEXT' }, { type: 'NEXT' })
    const bad = presetStage('standard')
    bad.cells[0]![0] = 1 // 上の 4 行
    s = run(s, { type: 'CONFIRM_STAGE', stage: bad, presetId: null })
    expect(at(s)).toBe('S04')
    expect(s.data.stagePresetId).toBe('standard')
    expect(at(run(s, { type: 'CONFIRM_STAGE', stage: { name: 1 } as never, presetId: null }))).toBe(
      'S04',
    )
  })

  it('S09: 1P の能力値が 1 つ以上変わるまで、再戦に進めない（2P だけ変えても進めない）', () => {
    let s = toS06()
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    expect(canRematch(s)).toBe(false)
    expect(at(run(s, { type: 'BEGIN_MATCH' }))).toBe('S09')
    // 2P だけ変える
    s = reduceFlow(s, { type: 'SET_P2', config: { ...s.data.p2, stats: stats(8, 2, 5, 5) } })
    expect(canRematch(s)).toBe(false)
    expect(at(run(s, { type: 'BEGIN_MATCH' }))).toBe('S09')
    // 1P が変わっても、合計が 20 でないと進めない
    const broken = reduceFlow(s, {
      type: 'SET_P1',
      config: { ...s.data.p1, stats: stats(6, 5, 5, 5) },
    })
    expect(canRematch(broken)).toBe(false)
    // 1P を変え、1P・2P とも 20 → 進める
    s = withP1(s, stats(6, 4, 5, 5))
    expect(canRematch(s)).toBe(true)
    expect(at(run(s, { type: 'BEGIN_MATCH' }))).toBe('S10')
  })

  it('S09: 変えてから、元に戻すと、また進めない', () => {
    let s = toS06()
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    s = withP1(s, stats(6, 4, 5, 5))
    expect(canRematch(s)).toBe(true)
    s = withP1(s, { ...DEFAULT_STATS })
    expect(canRematch(s)).toBe(false)
    expect(statsChanged(s.data.p1, s.data.matches[0]!.p1Config)).toBe(false)
  })

  it('S05: 設定が対戦を始められる形でなければ、S06 へ進めない（合計 20 でない）', () => {
    let s = toS06()
    s = run(s, { type: 'BACK' })
    s = { ...s, data: { ...s.data, p1: { ...s.data.p1, stats: stats(2, 2, 2, 2) } } }
    expect(at(run(s, { type: 'NEXT' }))).toBe('S05')
  })
})

describe('編集できる画面・できない画面', () => {
  it('1P の設定は S02・S03・S09、2P は S06・S09 だけ。対戦中・結果の画面では、変わらない', () => {
    const cfg = (s: Session): CharacterConfig => ({ ...s.data.p1, name: 'へんこう' })
    for (const screen of ['S01', 'S04', 'S05', 'S06', 'S07', 'S08', 'S10', 'S11', 'S12'] as const) {
      const s = { ...createSession(), data: { ...createSession().data, screen } }
      expect(reduceFlow(s, { type: 'SET_P1', config: cfg(s) }), `p1 ${screen}`).toBe(s)
    }
    for (const screen of [
      'S01',
      'S02',
      'S03',
      'S04',
      'S05',
      'S07',
      'S08',
      'S10',
      'S11',
      'S12',
    ] as const) {
      const s = { ...createSession(), data: { ...createSession().data, screen } }
      expect(reduceFlow(s, { type: 'SET_P2', config: cfg(s) }), `p2 ${screen}`).toBe(s)
    }
    const s06 = { ...createSession(), data: { ...createSession().data, screen: 'S06' as const } }
    expect(reduceFlow(s06, { type: 'SET_P2', config: createDefaultConfig('p2') }).data.p2).toEqual(
      createDefaultConfig('p2'),
    )
  })

  it('FINISH_MATCH は、対戦中だけ。固定した設定がなければ無視する', () => {
    const s = toS06()
    expect(reduceFlow(s, { type: 'FINISH_MATCH', outcome: win, durationSec: 1 })).toBe(s)
  })
})

describe('未完成の設定を、編集しない画面へ持ち込まない', () => {
  it('S06 で、2P を途中（合計が 20 でない）のまま「もどる」: 2P は標準へ戻り、S05 から S06 へ進める', () => {
    let s = toS06()
    s = reduceFlow(s, { type: 'SET_P2', config: { ...s.data.p2, stats: stats(2, 2, 2, 2) } })
    s = run(s, { type: 'BACK' })
    expect(at(s)).toBe('S05')
    expect(s.data.p2.stats).toEqual({ ...DEFAULT_STATS })
    expect(at(run(s, { type: 'NEXT' }))).toBe('S06')
  })

  it('S03 の途中（1P の合計が 20 でない）で「もちかえる」: 1P は、直前の戦の値、なければ標準の値で S12 へ', () => {
    let s = run(createSession(), { type: 'START' }, { type: 'NEXT' })
    s = withP1(s, stats(2, 2, 2, 2))
    expect(at(run(s, { type: 'SHARE' }))).toBe('S12')
    expect(run(s, { type: 'SHARE' }).data.p1.stats).toEqual({ ...DEFAULT_STATS })
    // 戦のあとなら、直前の戦の値
    let t = run(createSession(), { type: 'START' }, { type: 'NEXT' })
    t = withP1Raw(t)
    t = run(
      t,
      { type: 'NEXT' },
      { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' },
      { type: 'NEXT' },
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    t = withP1(t, stats(2, 2, 2, 2))
    t = run(t, { type: 'SHARE' })
    expect(t.data.p1.stats).toEqual(stats(6, 4, 5, 5))
  })

  it('編集してよい画面（S02・S03・S04・S06・S09）の間では、途中の値を、そのまま持つ', () => {
    let s = run(createSession(), { type: 'START' }, { type: 'NEXT' })
    s = withP1(s, stats(2, 2, 2, 2))
    s = run(s, { type: 'BACK' }) // S02
    expect(s.data.p1.stats).toEqual(stats(2, 2, 2, 2))
  })
})

describe('再戦の途中で、更新（再開）したとき', () => {
  /** 第 1 戦のあと、再設計して、S10 を始めた状態を、S06 から再開したもの */
  const resumed = (): Session => {
    let s = toS06()
    s = run(
      s,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'REDESIGN' },
    )
    s = withP1(s, stats(6, 4, 5, 5))
    s = run(s, { type: 'BEGIN_MATCH' })
    expect(at(s)).toBe('S10')
    return { ...s, data: { ...s.data, screen: restoreScreen('S10') }, current: null }
  }

  it('S06 から始めると、S10（再戦）になる。終わると、S11（比較）へ。第 2 戦として記録される', () => {
    let s = resumed()
    expect(at(s)).toBe('S06')
    s = run(s, { type: 'BEGIN_MATCH' })
    expect(at(s)).toBe('S10')
    s = run(s, { type: 'FINISH_MATCH', outcome: win, durationSec: 5 })
    expect(at(s)).toBe('S11')
    expect(s.data.matches.map((m) => m.matchNo)).toEqual([1, 2])
  })

  it('S06 の「もどる」は、S05 ではなく S09（設定を変えて作り直す）へ', () => {
    expect(at(run(resumed(), { type: 'BACK' }))).toBe('S09')
  })

  it('第 1 戦の途中で再開したとき（戦の記録がない）は、これまでどおり S07', () => {
    const s = toS06()
    expect(at(run(s, { type: 'BEGIN_MATCH' }))).toBe('S07')
  })
})

describe('もちかえる・おわる・リセット', () => {
  it('「もちかえる」は、対戦中（S07・S10）以外のどの画面からでも S12 へ。対戦中は、押せない', () => {
    for (const screen of ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S08', 'S09', 'S11'] as const) {
      const s = { ...createSession(), data: { ...createSession().data, screen } }
      expect(at(reduceFlow(s, { type: 'SHARE' })), screen).toBe('S12')
    }
    for (const screen of ['S07', 'S10'] as const) {
      const s = { ...createSession(), data: { ...createSession().data, screen } }
      expect(reduceFlow(s, { type: 'SHARE' })).toBe(s)
    }
  })

  it('S11 の「おわる」だけが、S12 へ進む', () => {
    const s = { ...createSession(), data: { ...createSession().data, screen: 'S11' as const } }
    expect(at(reduceFlow(s, { type: 'END' }))).toBe('S12')
    expect(at(reduceFlow(createSession(), { type: 'END' }))).toBe('S01')
  })

  it('リセット: どの画面からでも（対戦中も）、全データを破棄して S01 へ。次の参加者に何も残らない', () => {
    let s = toS06()
    s = run(s, { type: 'BEGIN_MATCH' })
    s = reduceFlow(s, { type: 'RESET' })
    expect(s).toEqual(createSession())
    expect(s.data.matches).toHaveLength(0)
    expect(s.current).toBeNull()
    // 戦のあと（S12）からも
    let t = toS06()
    t = run(
      t,
      { type: 'BEGIN_MATCH' },
      { type: 'FINISH_MATCH', outcome: win, durationSec: 1 },
      { type: 'SHARE' },
      { type: 'RESET' },
    )
    expect(t).toEqual(createSession())
  })

  it('更新（再開）で復元する画面: 対戦中（S07・S10）は S06 から。ほかは、そのまま', () => {
    expect(restoreScreen('S07')).toBe('S06')
    expect(restoreScreen('S10')).toBe('S06')
    for (const s of [
      'S01',
      'S02',
      'S03',
      'S04',
      'S05',
      'S06',
      'S08',
      'S09',
      'S11',
      'S12',
    ] as const) {
      expect(restoreScreen(s)).toBe(s)
    }
  })
})

describe('reducer の性質', () => {
  it('入力を書き換えない。同じ入力から、同じ結果', () => {
    const s = toS06()
    const before = JSON.stringify(s)
    const a = run(s, { type: 'BEGIN_MATCH' })
    const b = run(s, { type: 'BEGIN_MATCH' })
    expect(JSON.stringify(s)).toBe(before)
    expect(a).toEqual(b)
  })

  it('条件を満たさない操作は、状態を変えない（そのままの参照）', () => {
    const s = createSession()
    for (const a of [
      { type: 'NEXT' },
      { type: 'BACK' },
      { type: 'BEGIN_MATCH' },
      { type: 'REDESIGN' },
      { type: 'FIX_STATS' },
      { type: 'FIX_STAGE' },
    ] as FlowAction[]) {
      expect(reduceFlow(s, a)).toBe(s)
    }
  })
})
