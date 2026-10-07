import { describe, expect, it } from 'vitest'
import { simulateMatch } from '../battle/balance.ts'
import { DEFAULT_STATS } from '../fighter/index.ts'
import {
  canUndo,
  clearBlocks,
  confirmStage,
  createEditor,
  editorFromStage,
  editorValidation,
  HISTORY_MAX,
  resetToPreset,
  selectPreset,
  setStageName,
  setTool,
  strokeEnd,
  strokeMove,
  strokeStart,
  undo,
  type EditorState,
} from './editing.ts'
import { findPreset } from './presets.ts'

const has = (s: EditorState, col: number, row: number) => s.stage.cells[row]![col] === 1
const blocks = (s: EditorState) => s.stage.cells.flat().filter((c) => c === 1).length
/** 1 回のクリック */
const click = (s: EditorState, col: number, row: number) => strokeEnd(strokeStart(s, { col, row }))
/** 1 回のドラッグ（通るマスの列） */
const drag = (s: EditorState, cells: [number, number][]) => {
  let st = strokeStart(s, { col: cells[0]![0], row: cells[0]![1] })
  for (const [col, row] of cells.slice(1)) st = strokeMove(st, { col, row })
  return strokeEnd(st)
}
const tool = (s: EditorState, t: Parameters<typeof setTool>[1]) => setTool(s, t)

describe('はじまり', () => {
  it('標準のプリセットが選ばれ、変更なし。検証を通る。道具は「ブロック」', () => {
    const s = createEditor()
    expect(s.selectedPresetId).toBe('standard')
    expect(s.dirty).toBe(false)
    expect(s.tool).toBe('block')
    expect(canUndo(s)).toBe(false)
    expect(editorValidation(s).ok).toBe(true)
    expect(confirmStage(s).ok).toBe(true)
  })

  it('作業用のステージは、プリセットとは別の複製（直しても、プリセットは変わらない）', () => {
    const before = JSON.stringify(findPreset('standard')!.stage)
    const s = click(createEditor(), 12, 5)
    expect(has(s, 12, 5)).toBe(true)
    expect(JSON.stringify(findPreset('standard')!.stage)).toBe(before)
  })

  it('知らないプリセットの ID は、標準', () => {
    expect(createEditor('nothing').selectedPresetId).toBe('standard')
  })
})

describe('ブロックの配置・削除', () => {
  it('クリックで置く。ブロックのあるマスをクリックすると、消える', () => {
    let s = click(createEditor(), 12, 5)
    expect(has(s, 12, 5)).toBe(true)
    expect(s.dirty).toBe(true)
    s = click(s, 12, 5)
    expect(has(s, 12, 5)).toBe(false)
    expect(s.dirty).toBe(false) // 元に戻ったので、変更なし
  })

  it('ドラッグで、通った場所に続けて置く', () => {
    const s = drag(createEditor(), [
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ])
    for (const c of [2, 3, 4, 5]) expect(has(s, c, 5)).toBe(true)
    expect(s.history).toHaveLength(1) // 1 回のドラッグ = 1 件
  })

  it('始めたマスにブロックがあれば、そのドラッグは「消す」（空のマスは、そのまま。置き直さない）', () => {
    // 標準: 行 10 の列 4〜19 がブロック
    const s = drag(createEditor(), [
      [5, 10],
      [6, 10],
      [7, 9],
      [8, 9],
      [9, 10],
    ])
    expect(has(s, 5, 10)).toBe(false)
    expect(has(s, 6, 10)).toBe(false)
    expect(has(s, 7, 9)).toBe(false) // 空のマスに、置かない
    expect(has(s, 9, 10)).toBe(false)
    expect(has(s, 10, 10)).toBe(true)
  })

  it('始めたマスが空なら「置く」。通ったブロックは、消さない', () => {
    const s = drag(createEditor(), [
      [3, 10],
      [4, 10],
      [5, 10],
      [20, 10],
    ])
    expect(has(s, 3, 10)).toBe(true) // 置いた
    expect(has(s, 4, 10)).toBe(true) // 元からあった。消さない
    expect(has(s, 5, 10)).toBe(true)
    expect(has(s, 20, 10)).toBe(true) // 空のマス → 置いた
  })

  it('速いマウスの動き（マスが飛ぶ）でも、間のマスを通ったものとして、続けて置く', () => {
    const s = drag(createEditor(), [
      [2, 5],
      [9, 5],
    ])
    for (let c = 2; c <= 9; c++) expect(has(s, c, 5), `col ${c}`).toBe(true)
    // ななめも、途切れない
    const d = drag(createEditor(), [
      [1, 4],
      [5, 8],
    ])
    for (const [c, r] of [
      [1, 4],
      [2, 5],
      [3, 6],
      [4, 7],
      [5, 8],
    ])
      expect(has(d, c!, r!)).toBe(true)
    expect(d.history).toHaveLength(1)
  })

  it('ドラッグがグリッドの外へ出たら、線を切る。遠くのマスに戻っても、間のマスは変えない', () => {
    let s = strokeStart(createEditor(), { col: 2, row: 5 })
    s = strokeMove(s, { col: 3, row: 5 })
    s = strokeMove(s, { col: -1, row: -1 }) // 外
    s = strokeMove(s, { col: 12, row: 5 }) // 外を回って、遠くに戻った
    s = strokeEnd(s)
    expect(has(s, 12, 5)).toBe(true) // 戻ったマスは、通ったので、処理する
    for (const c of [4, 5, 6, 7, 8, 9, 10, 11]) expect(has(s, c, 5), `col ${c}`).toBe(false)
    expect(s.history).toHaveLength(1)
  })

  it('同じマスは、1 回のドラッグで 1 回だけ（置いたそばから消えない往復を防ぐ）', () => {
    const s = drag(createEditor(), [
      [2, 5],
      [3, 5],
      [2, 5],
      [3, 5],
      [2, 5],
    ])
    expect(has(s, 2, 5)).toBe(true)
    expect(has(s, 3, 5)).toBe(true)
  })

  it('けしごむは、常に「消す」。空のマスは、何も起きない', () => {
    let s = tool(createEditor(), 'eraser')
    s = drag(s, [
      [3, 10],
      [4, 10],
      [5, 10],
      [6, 10],
    ])
    expect(has(s, 3, 10)).toBe(false)
    expect(has(s, 4, 10)).toBe(false)
    expect(has(s, 6, 10)).toBe(false)
    expect(s.history).toHaveLength(1)
    // 何も消えない操作は、履歴に残さない
    const none = click(s, 0, 0)
    expect(none.history).toHaveLength(1)
  })

  it('グリッドの外は、反応しない', () => {
    let s = createEditor()
    for (const c of [
      { col: -1, row: 5 },
      { col: 24, row: 5 },
      { col: 3, row: 14 },
      { col: 1.5, row: 5 },
      { col: NaN, row: 1 },
    ]) {
      s = strokeEnd(strokeStart(s, c))
    }
    expect(blocks(s)).toBe(blocks(createEditor()))
    expect(s.history).toHaveLength(0)
    // ドラッグの途中で、外に出ても、続けられる
    let d = strokeStart(createEditor(), { col: 1, row: 5 })
    d = strokeMove(d, { col: -1, row: 5 })
    d = strokeMove(d, { col: 2, row: 5 })
    expect(has(d, 2, 5)).toBe(true)
  })
})

describe('置けない場所（§6.3）', () => {
  it('上の 4 行（行 0〜3）には、置けない。理由が出る。行 4 は置ける', () => {
    for (const row of [0, 1, 2, 3]) {
      const s = click(createEditor(), 10, row)
      expect(has(s, 10, row)).toBe(false)
      expect(s.notice?.code).toBe('TOP_ROWS')
      expect(s.history).toHaveLength(0)
    }
    const ok = click(createEditor(), 10, 4)
    expect(has(ok, 10, 4)).toBe(true)
    expect(ok.notice).toBeNull()
  })

  it('置けなかったたびに、通知の番号（seq）が増える（同じ理由でも、また表示できる）', () => {
    const a = click(createEditor(), 10, 0)
    const b = click(a, 11, 0)
    expect(b.notice!.seq).toBeGreaterThan(a.notice!.seq)
  })

  it('スタート位置のセルには、ブロックを置けない', () => {
    const s = click(createEditor(), 4, 9) // 標準の 1P のスタート
    expect(has(s, 4, 9)).toBe(false)
    expect(s.notice?.code).toBe('SPAWN_CELL')
  })

  it('ドラッグで、上の 4 行を通っても、置かれない。通れるマスには置く', () => {
    const s = drag(createEditor(), [
      [1, 5],
      [1, 4],
      [1, 3],
      [1, 2],
    ])
    expect(has(s, 1, 5)).toBe(true)
    expect(has(s, 1, 4)).toBe(true)
    expect(has(s, 1, 3)).toBe(false)
    expect(has(s, 1, 2)).toBe(false)
  })
})

describe('スタート位置', () => {
  it('クリックしたマスが、スタート位置になる（前の位置は、動く）', () => {
    const s = click(tool(createEditor(), 'spawn1'), 6, 9)
    expect(s.stage.spawns.p1).toEqual({ col: 6, row: 9 })
    expect(s.stage.spawns.p2).toEqual({ col: 19, row: 9 })
    const t = click(tool(s, 'spawn2'), 17, 9)
    expect(t.stage.spawns.p2).toEqual({ col: 17, row: 9 })
    expect(t.dirty).toBe(true)
  })

  it('ブロックのセルには、置けない。もう一方のスタート位置と、同じセルにもできない', () => {
    const onBlock = click(tool(createEditor(), 'spawn1'), 6, 10)
    expect(onBlock.stage.spawns.p1).toEqual({ col: 4, row: 9 })
    expect(onBlock.notice?.code).toBe('SPAWN_ON_BLOCK')
    const onOther = click(tool(createEditor(), 'spawn1'), 19, 9)
    expect(onOther.stage.spawns.p1).toEqual({ col: 4, row: 9 })
    expect(onOther.notice?.code).toBe('SPAWN_SAME')
    // 自分のいまの位置をクリックしても、何も起きない
    const self = click(tool(createEditor(), 'spawn1'), 4, 9)
    expect(self.history).toHaveLength(0)
  })

  it('スタート位置の変更も、1 回の操作として、もどせる', () => {
    const s = click(tool(createEditor(), 'spawn1'), 6, 9)
    expect(undo(s).stage.spawns.p1).toEqual({ col: 4, row: 9 })
  })
})

describe('もどす・ぜんぶ けす・プリセット', () => {
  it('ひとつ もどす: 直前の 1 回の操作だけ（クリック、1 回のドラッグ）', () => {
    let s = click(createEditor(), 12, 5)
    s = drag(s, [
      [2, 5],
      [3, 5],
    ])
    s = undo(s)
    expect(has(s, 2, 5)).toBe(false)
    expect(has(s, 12, 5)).toBe(true)
    s = undo(s)
    expect(has(s, 12, 5)).toBe(false)
    expect(s.dirty).toBe(false)
    expect(undo(s)).toBe(s) // もう戻れない
  })

  it('最大 20 回前まで。それより古い操作は、戻れない', () => {
    let s = createEditor()
    for (let i = 0; i < 25; i++) s = click(s, i % 24, 5 + Math.floor(i / 24))
    expect(s.history).toHaveLength(HISTORY_MAX)
    for (let i = 0; i < 25; i++) s = undo(s)
    // 20 回戻る = 最初の 5 回の操作は、残る
    expect(blocks(s)).toBe(blocks(createEditor()) + 5)
  })

  it('ぜんぶ けす: ブロックをすべて消す。スタート位置は残る。もどせる（確認なし）', () => {
    const s = clearBlocks(createEditor())
    expect(blocks(s)).toBe(0)
    expect(s.stage.spawns.p1).toEqual({ col: 4, row: 9 })
    expect(s.dirty).toBe(true)
    expect(blocks(undo(s))).toBe(blocks(createEditor()))
    // すでに空なら、何も起きない（履歴に残さない）
    expect(clearBlocks(s)).toBe(s)
  })

  it('プリセットを選ぶ: 編集内容は置き換わる。1 回の操作として、編集していた状態に、まとめて戻せる', () => {
    let s = click(createEditor(), 2, 5)
    s = selectPreset(s, 'tower')
    expect(s.selectedPresetId).toBe('tower')
    expect(s.dirty).toBe(false)
    expect(has(s, 2, 5)).toBe(false)
    expect(s.stage.name).toBe('たかいとう')
    s = undo(s)
    expect(s.selectedPresetId).toBe('standard')
    expect(s.dirty).toBe(true)
    expect(has(s, 2, 5)).toBe(true)
  })

  it('同じプリセットを、変更なしで選び直しても、何も起きない。変更があれば、元に戻る', () => {
    const s0 = createEditor()
    expect(selectPreset(s0, 'standard')).toBe(s0)
    expect(selectPreset(s0, 'nothing')).toBe(s0)
    const edited = click(s0, 12, 5)
    const back = selectPreset(edited, 'standard')
    expect(back.dirty).toBe(false)
    expect(has(back, 12, 5)).toBe(false)
  })

  it('プリセットから やりなおす: 選んでいるプリセットの元の状態に戻す。もどせる', () => {
    let s = clearBlocks(createEditor('wide'))
    s = resetToPreset(s)
    expect(s.dirty).toBe(false)
    expect(s.selectedPresetId).toBe('wide')
    expect(blocks(s)).toBe(blocks(createEditor('wide')))
    expect(blocks(undo(s))).toBe(0)
    // 変更がなければ、何も起きない
    expect(resetToPreset(createEditor())).toEqual(createEditor())
  })
})

describe('確定したステージから、編集を始める', () => {
  it('プリセットのままなら、変更なし。直してあれば、変更あり。履歴は空。複製（元を変えない）', () => {
    const preset = findPreset('wide')!.stage
    const same = editorFromStage(preset, 'wide')
    expect(same.dirty).toBe(false)
    expect(same.selectedPresetId).toBe('wide')
    expect(same.history).toHaveLength(0)
    expect(same.stage).not.toBe(preset)
    const edited = click(same, 2, 5)
    const again = editorFromStage(edited.stage, 'wide')
    expect(again.dirty).toBe(true)
    expect(has(again, 2, 5)).toBe(true)
    // プリセットの ID がない（一から作った）ステージ
    expect(editorFromStage(edited.stage, null).selectedPresetId).toBeNull()
    expect(editorFromStage(edited.stage, null).dirty).toBe(true)
  })
})

describe('名前', () => {
  it('入力できる。10 文字・30 バイトを超える入力は受け付けない。履歴には残さない', () => {
    let s = setStageName(createEditor(), 'ぼくの ステージ')
    expect(s.stage.name).toBe('ぼくの ステージ')
    expect(s.history).toHaveLength(0)
    s = setStageName(s, 'あ'.repeat(15))
    expect(s.stage.name).toBe('あ'.repeat(10))
    expect(setStageName(createEditor(), '😀'.repeat(10)).stage.name).toBe('😀'.repeat(7))
    // 名前だけの変更は、「プリセットから変更した」にならない
    expect(s.dirty).toBe(false)
  })

  it('もどしても、あとから入力した名前は消えない（プリセットの切り替えを戻したときも）', () => {
    let s = click(createEditor(), 2, 5)
    s = setStageName(s, 'ぼくの')
    expect(undo(s).stage.name).toBe('ぼくの')
    expect(has(undo(s), 2, 5)).toBe(false)
    let t = selectPreset(createEditor(), 'wide')
    t = setStageName(t, 'あたらしい')
    const back = undo(t)
    expect(back.selectedPresetId).toBe('standard')
    expect(back.stage.name).toBe('あたらしい')
  })

  it('未入力のまま確定すると、デフォルト名になる', () => {
    const s = setStageName(createEditor(), '')
    const r = confirmStage(s)
    expect(r.ok && r.stage.name).toBe('マイステージ')
  })
})

describe('検証と、作ったステージでの対戦', () => {
  it('編集のたびに、検証できる。違反は、理由つきで返る（ブロック 25 個、など）', () => {
    let s = createEditor()
    s = tool(s, 'eraser')
    s = drag(
      s,
      Array.from({ length: 16 }, (_, i) => [4 + i, 12] as [number, number]),
    )
    s = drag(
      s,
      Array.from({ length: 16 }, (_, i) => [4 + i, 11] as [number, number]),
    )
    expect(blocks(s)).toBe(28)
    const r = editorValidation(s)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.map((v) => v.code)).toContain('BLOCKS_TOO_FEW')
    expect(confirmStage(s).ok).toBe(false) // 対戦には、進めない
  })

  it('足場を、高さの差 +3 の位置に置くと UNREACHABLE。直すと通る', () => {
    let s = createEditor()
    s = tool(s, 'eraser')
    s = drag(s, [
      [6, 8],
      [7, 8],
      [8, 8],
      [9, 8],
      [14, 8],
      [15, 8],
      [16, 8],
      [17, 8],
      [10, 6],
      [11, 6],
      [12, 6],
      [13, 6],
    ])
    s = tool(s, 'block')
    s = drag(s, [
      [10, 7],
      [11, 7],
      [12, 7],
      [13, 7],
    ])
    const r = editorValidation(s)
    expect(r.ok === false && r.violations.map((v) => v.code)).toContain('UNREACHABLE')
    s = undo(s)
    s = drag(s, [
      [10, 8],
      [11, 8],
      [12, 8],
      [13, 8],
    ])
    expect(editorValidation(s).ok).toBe(true)
  })

  it('スタートの下の足場を消すと SPAWN_NO_GROUND', () => {
    let s = tool(createEditor(), 'eraser')
    s = drag(s, [
      [4, 10],
      [4, 11],
      [4, 12],
    ])
    const r = editorValidation(s)
    expect(r.ok === false && r.violations.map((v) => v.code)).toContain('SPAWN_NO_GROUND')
  })

  it('作ったステージ（プリセットを直したもの）で、対戦が最後まで進む', () => {
    let s = createEditor()
    // 左に、足場を足す（メイン足場の真上は、横から行く）
    s = drag(s, [
      [0, 8],
      [1, 8],
      [2, 8],
      [3, 8],
    ])
    s = click(tool(s, 'spawn2'), 18, 9) // 頭の上が空いている列（足場の列を避ける）
    const r = confirmStage(s)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sim = simulateMatch(r.stage, [{ ...DEFAULT_STATS }, { ...DEFAULT_STATS }], 3)
    expect(sim.fightSteps).toBeGreaterThan(0)
    expect(sim.outcome.reason).toBeDefined()
  })

  it('全部消して、自分で作る（約 2 分の経路）: 床と足場とスタートを置いて、通る', () => {
    let s = clearBlocks(createEditor())
    s = drag(
      s,
      Array.from({ length: 14 }, (_, i) => [5 + i, 10] as [number, number]),
    )
    s = drag(
      s,
      Array.from({ length: 14 }, (_, i) => [5 + i, 11] as [number, number]),
    )
    s = drag(
      s,
      Array.from({ length: 14 }, (_, i) => [5 + i, 12] as [number, number]),
    )
    s = drag(s, [
      [7, 8],
      [8, 8],
      [9, 8],
      [10, 8],
    ])
    s = click(tool(s, 'spawn1'), 5, 9)
    s = click(tool(s, 'spawn2'), 18, 9)
    expect(confirmStage(s).ok).toBe(true)
  })

  it('入力の状態を、書き換えない（前の状態は、そのまま）', () => {
    const s0 = createEditor()
    const before = JSON.stringify({ ...s0, stroke: null })
    const s1 = click(s0, 12, 5)
    undo(s1)
    clearBlocks(s0)
    selectPreset(s0, 'wide')
    expect(JSON.stringify({ ...s0, stroke: null })).toBe(before)
  })
})
