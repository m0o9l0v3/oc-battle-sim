import { describe, expect, it } from 'vitest'
import { STAGE_COLS, STAGE_ROWS, type StageData } from '../model/index.ts'
import { canJump, findPlatforms, isStandable, standableCells } from './analysis.ts'
import { stageFromRows } from './rows.ts'
import { DEFAULT_STAGE_NAME } from './rules.ts'
import { validateStage, type StageViolation, type StageViolationCode } from './validate.ts'

// 標準のステージ（stage-format.md §8）
const STD = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........####..........',
  '........................',
  '......####....####......',
  '....1..............2....',
  '....################....',
  '....################....',
  '....################....',
  '........................',
]
const std = () => stageFromRows(STD, '標準')

/** 標準のステージを、少し変える */
function edit(change: (cells: number[][], s: StageData) => void): StageData {
  const s = std()
  change(s.cells, s)
  return s
}
const codes = (
  s: unknown,
  mode: 'editing' | 'match' | 'import' = 'match',
): StageViolationCode[] => {
  const r = validateStage(s, mode)
  return r.ok ? [] : r.violations.map((v) => v.code)
}
const violation = (s: unknown, code: StageViolationCode): StageViolation => {
  const r = validateStage(s, 'match')
  if (r.ok) throw new Error('ok')
  return r.violations.find((v) => v.code === code)!
}
const count = (s: StageData) => s.cells.flat().filter((c) => c === 1).length

describe('標準のステージ', () => {
  it('すべての規則に通る（3 つの場面すべて）', () => {
    for (const mode of ['editing', 'match', 'import'] as const) {
      const r = validateStage(std(), mode)
      expect(r.ok, mode).toBe(true)
    }
    expect(count(std())).toBe(16 * 3 + 4 + 8)
  })

  it('立てるセルと足場: メイン足場は行 10・幅 16、行 8 の左右と行 6 の中央は幅 4', () => {
    const p = findPlatforms(std().cells)
    expect(p).toEqual([
      { row: 6, col: 10, width: 4 },
      { row: 8, col: 6, width: 4 },
      { row: 8, col: 14, width: 4 },
      { row: 10, col: 4, width: 16 },
    ])
    expect(standableCells(std().cells)).toHaveLength(28)
  })

  it('成功したときの stage は、新しいオブジェクト（入力を共有しない）。名前はそろえる', () => {
    const input = { ...std(), name: '  ひろし ' }
    const r = validateStage(input, 'match')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.stage.name).toBe('ひろし')
    expect(r.stage).not.toBe(input)
    expect(r.stage.cells[0]).not.toBe(input.cells[0])
  })
})

describe('ブロックの数', () => {
  /** 足場の形を変えずに、ブロックを n 個にする（減らすときは、行 12・11 の下の段から。増やすときは、下から埋める） */
  const withCount = (n: number) =>
    edit((cells) => {
      let diff = n - cells.flat().filter((c) => c === 1).length
      for (const r of [12, 11]) {
        for (let c = 19; c >= 4 && diff < 0; c--) {
          cells[r]![c] = 0
          diff++
        }
      }
      for (let r = 13; r >= 5 && diff > 0; r--) {
        for (let c = 0; c < 24 && diff > 0; c++) {
          if (cells[r]![c] === 0 && !(r === 9 && (c === 4 || c === 19))) {
            cells[r]![c] = 1
            diff--
          }
        }
      }
    })

  it('29 個は BLOCKS_TOO_FEW（あと 1 こ）、30 個は通る', () => {
    expect(count(withCount(29))).toBe(29)
    expect(violation(withCount(29), 'BLOCKS_TOO_FEW').detail).toBe(1)
    expect(violation(withCount(28), 'BLOCKS_TOO_FEW').detail).toBe(2)
    expect(count(withCount(30))).toBe(30)
    expect(codes(withCount(30))).not.toContain('BLOCKS_TOO_FEW')
  })

  it('151 個は BLOCKS_TOO_MANY（1 こ へらす）、150 個は通る', () => {
    expect(count(withCount(151))).toBe(151)
    expect(violation(withCount(151), 'BLOCKS_TOO_MANY').detail).toBe(1)
    expect(count(withCount(150))).toBe(150)
    expect(codes(withCount(150))).not.toContain('BLOCKS_TOO_MANY')
  })
})

describe('足場', () => {
  it('メイン足場が 10 未満: 9 は MAIN_PLATFORM_NARROW、10 は通る', () => {
    // 行 10 のメイン足場を、幅 w にする（中央の足場・左右の足場は、そのまま。スポーンは、足場の上）
    const main = (w: number) =>
      edit((cells, st) => {
        for (let r = 10; r <= 12; r++) for (let c = 4; c < 20; c++) cells[r]![c] = 0
        for (let r = 10; r <= 12; r++) for (let c = 7; c < 7 + w; c++) cells[r]![c] = 1
        st.spawns = { p1: { col: 7, row: 9 }, p2: { col: 15, row: 9 } }
      })
    // 幅 9 のメインより広い足場は、ほかにない（行 8・6 は幅 4）
    expect(codes(main(9))).toContain('MAIN_PLATFORM_NARROW')
    expect(violation(main(9), 'MAIN_PLATFORM_NARROW').cells).toHaveLength(9)
    expect(codes(main(10))).not.toContain('MAIN_PLATFORM_NARROW')
  })

  it('1 マス幅の柱は PLATFORM_TOO_NARROW（その足場のセルを示す）', () => {
    const s = edit((cells) => {
      cells[8]![2] = 1 // 行 8 の左の、1 マスの柱
      cells[9]![2] = 1
      cells[9]![3] = 1
    })
    // (8,2) は上が空で立てる。(9,2) は上が (8,2)、(9,3) は立てる
    const v = violation(s, 'PLATFORM_TOO_NARROW')
    expect(v.cells).toContainEqual({ col: 2, row: 8 })
  })

  it('全面が地面の床だけのステージ（隙間なし）は通る', () => {
    const floor = edit((cells) => {
      for (let r = 0; r < 14; r++) for (let c = 0; c < 24; c++) cells[r]![c] = 0
      for (const r of [10, 11, 12, 13]) for (let c = 0; c < 24; c++) cells[r]![c] = 1
    })
    expect(codes(floor)).toEqual([])
  })

  it('全面がブロックなら、BLOCKS_TOO_MANY と、立てるセルがないことによる MAIN_PLATFORM_NARROW', () => {
    const full = edit((cells) => {
      for (const row of cells) row.fill(1)
    })
    const c = codes(full)
    expect(c).toContain('BLOCKS_TOO_MANY')
    expect(c).toContain('MAIN_PLATFORM_NARROW')
    expect(standableCells(full.cells)).toHaveLength(0)
  })
})

describe('高さ', () => {
  it('行 0〜3 にブロックがあると STAGE_TOO_HIGH（そのセルを示す）。行 4 は通る', () => {
    for (const row of [0, 1, 2, 3]) {
      const s = edit((cells) => {
        cells[row]![12] = 1
      })
      const v = violation(s, 'STAGE_TOO_HIGH')
      expect(v.cells).toEqual([{ col: 12, row }])
    }
    const ok = edit((cells) => {
      cells[4]![12] = 1
      cells[4]![13] = 1
    })
    expect(codes(ok)).not.toContain('STAGE_TOO_HIGH')
  })
})

describe('スポーン', () => {
  it('SPAWN_MISSING: 片方がない（null、undefined）', () => {
    const a = { ...std(), spawns: { p1: null, p2: { col: 19, row: 9 } } }
    const b = { ...std(), spawns: { p2: { col: 19, row: 9 } } }
    expect(codes(a)).toContain('SPAWN_MISSING')
    expect(codes(b)).toContain('SPAWN_MISSING')
    expect(codes({ ...std(), spawns: {} })).toContain('SPAWN_MISSING')
  })

  it('SPAWN_OUT_OF_RANGE: 範囲の外（列 24、行 -1、行 14）。例外を投げず、ほかの規則も調べる', () => {
    for (const bad of [
      { col: 24, row: 9 },
      { col: -1, row: 9 },
      { col: 4, row: -1 },
      { col: 4, row: 14 },
    ]) {
      const s = { ...std(), spawns: { p1: bad, p2: { col: 19, row: 9 } } }
      const r = validateStage(s, 'match')
      expect(r.ok).toBe(false)
      expect(codes(s), JSON.stringify(bad)).toContain('SPAWN_OUT_OF_RANGE')
      expect(violation(s, 'SPAWN_OUT_OF_RANGE').cells).toEqual([bad])
    }
  })

  it('SPAWN_BLOCKED: スポーンのセル、または上の 3 セルにブロック。4 セル上は通る', () => {
    for (const dy of [0, 1, 2, 3]) {
      const s = edit((cells) => {
        cells[9 - dy]![4] = 1
      })
      expect(codes(s), `dy=${dy}`).toContain('SPAWN_BLOCKED')
      expect(violation(s, 'SPAWN_BLOCKED').cells).toContainEqual({ col: 4, row: 9 - dy })
    }
    const ok = edit((cells) => {
      cells[5]![4] = 1
      cells[5]![5] = 1
    })
    expect(codes(ok)).not.toContain('SPAWN_BLOCKED')
  })

  it('グリッドの上端の近く（行 1）のスポーンは、上の外を空として扱う', () => {
    const s = edit((cells, st) => {
      for (let c = 4; c < 8; c++) cells[2]![c] = 1
      st.spawns.p1 = { col: 4, row: 1 }
    })
    expect(codes(s)).not.toContain('SPAWN_BLOCKED')
    expect(codes(s)).not.toContain('SPAWN_OUT_OF_RANGE')
  })

  it('スポーン自身がブロックで、真下が空のときは、SPAWN_BLOCKED だけ（SPAWN_NO_GROUND を重ねない）', () => {
    const s = edit((cells) => {
      cells[9]![4] = 1
      cells[10]![4] = 0
      cells[11]![4] = 0
      cells[12]![4] = 0
    })
    const c = codes(s)
    expect(c).toContain('SPAWN_BLOCKED')
    expect(c).not.toContain('SPAWN_NO_GROUND')
  })

  it('SPAWN_NO_GROUND: 真下にブロックがない、または最下行', () => {
    const s = edit((cells) => {
      cells[10]![4] = 0
      cells[11]![4] = 0
      cells[12]![4] = 0
    })
    expect(codes(s)).toContain('SPAWN_NO_GROUND')
    expect(violation(s, 'SPAWN_NO_GROUND').cells).toEqual([{ col: 4, row: 9 }])
    const bottom = edit((_c, st) => {
      st.spawns.p1 = { col: 4, row: 13 }
    })
    expect(codes(bottom)).toContain('SPAWN_NO_GROUND')
  })

  it('SPAWN_TOO_CLOSE: 列の差が 7 は違反、8 は通る', () => {
    const at = (c1: number, c2: number) =>
      edit((_c, st) => {
        st.spawns = { p1: { col: c1, row: 9 }, p2: { col: c2, row: 9 } }
      })
    expect(codes(at(10, 17))).toContain('SPAWN_TOO_CLOSE')
    expect(codes(at(10, 18))).not.toContain('SPAWN_TOO_CLOSE')
    expect(codes(at(12, 12))).toContain('SPAWN_TOO_CLOSE')
    expect(codes(at(18, 10))).not.toContain('SPAWN_TOO_CLOSE')
    expect(violation(at(10, 17), 'SPAWN_TOO_CLOSE').cells).toHaveLength(2)
  })
})

describe('到達可能性（最小の能力値でも、全足場に行き来できる）', () => {
  it('高さの差が +2 の足場は、行き来できる（標準）', () => {
    expect(codes(std())).not.toContain('UNREACHABLE')
  })

  it('高さの差が +3 の足場がある: UNREACHABLE（その足場を示す）', () => {
    // 行 10 のメイン足場から +3 は、行 7。左右の足場（行 8）から見ても +1 だが、中央の足場だけが +3 離れる
    const s = edit((cells) => {
      for (let c = 6; c < 10; c++) cells[8]![c] = 0
      for (let c = 14; c < 18; c++) cells[8]![c] = 0
      for (let c = 10; c < 14; c++) cells[6]![c] = 0
      for (let c = 10; c < 14; c++) cells[7]![c] = 1
    })
    expect(codes(s)).toContain('UNREACHABLE')
    const cells = violation(s, 'UNREACHABLE').cells!
    expect(cells.every((c) => c.row === 7)).toBe(true)
  })

  it('隙間 2（rise 0）は UNREACHABLE。隙間 1 は通る', () => {
    const gap = (g: number) =>
      edit((cells, st) => {
        // メイン足場を、左右に分ける（行 10〜12 の、中央を空ける）。足場の幅は 8 ずつで、メインは 8 のまま
        for (let r = 10; r <= 12; r++) for (let c = 4; c < 20; c++) cells[r]![c] = 0
        const left = 4
        for (let r = 10; r <= 12; r++) {
          for (let c = left; c < left + 8; c++) cells[r]![c] = 1
          for (let c = left + 8 + g; c < left + 16 + g; c++) cells[r]![c] = 1
        }
        for (let c = 6; c < 10; c++) cells[8]![c] = 0
        for (let c = 14; c < 18; c++) cells[8]![c] = 0
        for (let c = 10; c < 14; c++) cells[6]![c] = 0
        st.spawns = { p1: { col: 4, row: 9 }, p2: { col: 12 + g, row: 9 } }
      })
    expect(codes(gap(1))).not.toContain('UNREACHABLE')
    expect(codes(gap(2))).toContain('UNREACHABLE')
  })

  it('メイン足場の途中に 4 セルの穴: メイン足場が狭くなる（足場どうしは、中央の足場でつながる）', () => {
    const s = edit((cells) => {
      for (let r = 10; r <= 12; r++) for (let c = 10; c < 14; c++) cells[r]![c] = 0
    })
    expect(codes(s)).toContain('MAIN_PLATFORM_NARROW')
    expect(codes(s)).not.toContain('UNREACHABLE')
    // 中央の足場もなければ、行き来できない
    const cut = edit((cells) => {
      for (let r = 10; r <= 12; r++) for (let c = 10; c < 14; c++) cells[r]![c] = 0
      for (let c = 10; c < 14; c++) cells[6]![c] = 0
    })
    expect(codes(cut)).toContain('UNREACHABLE')
  })

  it('向きごとに、別々に判定する（上へは行けて、下へ戻れない、またはその逆がある）', () => {
    const cells = std().cells
    // 標準: 行 10 の列 5 ⇔ 行 8 の列 6（高さの差 ±2、隙間 0）は、どちらの向きにも飛べる
    expect(canJump(cells, { col: 5, row: 10 }, { col: 6, row: 8 })).toBe(true)
    expect(canJump(cells, { col: 6, row: 8 }, { col: 5, row: 10 })).toBe(true)
    // 列 5 の行 5 にブロック: 登る向きは、出発の列の、行 5〜9 を通る。降りる向きは、到着の列の、行 7〜9 だけを通る
    const roof = edit((c) => {
      c[5]![5] = 1
    }).cells
    expect(canJump(roof, { col: 5, row: 10 }, { col: 6, row: 8 })).toBe(false)
    expect(canJump(roof, { col: 6, row: 8 }, { col: 5, row: 10 })).toBe(true)
  })

  it('天井のブロックで、飛び移りの通り道がふさがれる', () => {
    expect(canJump(std().cells, { col: 8, row: 8 }, { col: 10, row: 6 })).toBe(true)
    const blocked = edit((c) => {
      c[4]![9] = 1 // 隙間の列（列 9）の、行 4。通り道は、行 3〜7
    })
    expect(canJump(blocked.cells, { col: 8, row: 8 }, { col: 10, row: 6 })).toBe(false)
    // 通り道の外（行 2）なら、ふさがない
    const high = edit((c) => {
      c[2]![9] = 1
    })
    expect(canJump(high.cells, { col: 8, row: 8 }, { col: 10, row: 6 })).toBe(true)
  })

  it('隙間が広すぎる、高さの差が大きすぎる飛び移りは、成立しない', () => {
    const c = std().cells
    expect(canJump(c, { col: 7, row: 8 }, { col: 10, row: 6 })).toBe(false) // 隙間 2、rise +2
    expect(canJump(c, { col: 5, row: 10 }, { col: 6, row: 7 })).toBe(false) // rise +3（立てるセルでなくても、規則だけを見る）
    expect(canJump(c, { col: 5, row: 10 }, { col: 5, row: 8 })).toBe(false) // 同じ列
  })

  it('隣り合う列の段差は、歩く・飛び移りで行き来できる。立てるセルがなければ、何も言わない', () => {
    expect(isStandable(std().cells, 4, 10)).toBe(true)
    expect(isStandable(std().cells, 4, 11)).toBe(false) // 上がブロック
    expect(isStandable(std().cells, 0, 5)).toBe(false) // ブロックでない
    const empty = edit((cells) => {
      for (const row of cells) row.fill(0)
    })
    expect(codes(empty)).not.toContain('UNREACHABLE')
  })
})

describe('名前', () => {
  it('10 文字・30 バイトを超えると NAME_TOO_LONG。ちょうどは通る', () => {
    expect(codes({ ...std(), name: 'あ'.repeat(10) })).toEqual([])
    expect(codes({ ...std(), name: 'あ'.repeat(11) })).toContain('NAME_TOO_LONG')
    expect(codes({ ...std(), name: '😀'.repeat(8) })).toContain('NAME_TOO_LONG') // 32 バイト
    expect(codes({ ...std(), name: '😀'.repeat(7) })).toEqual([])
    expect(codes({ ...std(), name: '' })).toEqual([])
  })

  it('未入力（空・空白だけ）のときは、デフォルト名にする', () => {
    for (const name of ['', '   ']) {
      const r = validateStage({ ...std(), name }, 'match')
      expect(r.ok && r.stage.name).toBe(DEFAULT_STAGE_NAME)
    }
  })
})

describe('形式（MALFORMED、SCHEMA_UNSUPPORTED）', () => {
  it('壊れた入力は、例外を投げず、MALFORMED だけを返す', () => {
    const cases: unknown[] = [
      null,
      undefined,
      42,
      'x',
      [],
      {},
      { ...std(), name: 5 },
      { ...std(), schemaVersion: '1' },
      { ...std(), cols: 23 },
      { ...std(), rows: 15 },
      { ...std(), cells: null },
      { ...std(), cells: std().cells.slice(1) },
      { ...std(), cells: std().cells.map((r, i) => (i === 3 ? r.slice(1) : r)) },
      { ...std(), cells: std().cells.map((r, i) => (i === 3 ? r.map(() => 2) : r)) },
      { ...std(), cells: std().cells.map((r, i) => (i === 3 ? r.map(() => '1') : r)) },
      { ...std(), spawns: null },
      { ...std(), spawns: { p1: 'a', p2: { col: 19, row: 9 } } },
      { ...std(), spawns: { p1: { col: 4.5, row: 9 }, p2: { col: 19, row: 9 } } },
      { ...std(), spawns: { p1: { col: NaN, row: 9 }, p2: { col: 19, row: 9 } } },
      { ...std(), spawns: { p1: { col: Infinity, row: 9 }, p2: { col: 19, row: 9 } } },
      { ...std(), spawns: { p1: { col: '4', row: 9 }, p2: { col: 19, row: 9 } } },
      {
        ...std(),
        get name(): string {
          throw new Error('boom')
        },
      },
    ]
    for (const c of cases) {
      for (const mode of ['editing', 'match', 'import'] as const) {
        const r = validateStage(c, mode)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.violations).toEqual([{ code: 'MALFORMED' }])
      }
    }
  })

  it('スポーンが小数 { col: 4.5, row: 9 } は MALFORMED（例外を投げない）', () => {
    expect(
      codes({ ...std(), spawns: { p1: { col: 4.5, row: 9 }, p2: { col: 19, row: 9 } } }),
    ).toEqual(['MALFORMED'])
  })

  it('schemaVersion が 2 は、読み込みで SCHEMA_UNSUPPORTED。ほかの場面では、版の比較をしない', () => {
    expect(codes({ ...std(), schemaVersion: 2 }, 'import')).toEqual(['SCHEMA_UNSUPPORTED'])
    expect(codes({ ...std(), schemaVersion: 2 }, 'match')).toEqual([])
    expect(codes({ ...std(), schemaVersion: 1 }, 'import')).toEqual([])
  })

  it('MALFORMED の検査が先: 壊れた入力で、セルの参照が起きない', () => {
    const s = { ...std(), cells: [], spawns: { p1: { col: 4, row: 9 }, p2: { col: 19, row: 9 } } }
    expect(codes(s)).toEqual(['MALFORMED'])
  })
})

describe('複数の違反・決定性・入力を変えない', () => {
  it('複数の違反は、すべて返す', () => {
    const s = edit((cells, st) => {
      cells[0]![0] = 1
      st.spawns = { p1: { col: 10, row: 9 }, p2: { col: 12, row: 9 } }
    })
    const c = codes(s)
    expect(c).toContain('STAGE_TOO_HIGH')
    expect(c).toContain('SPAWN_TOO_CLOSE')
  })

  it('同じ入力から、同じ結果。入力は書き換えない。3 つの場面で、同じ規則の結果', () => {
    const s = edit((cells) => {
      cells[2]![5] = 1
      cells[9]![4] = 1
    })
    const before = JSON.stringify(s)
    const a = validateStage(s, 'match')
    const b = validateStage(s, 'match')
    expect(a).toEqual(b)
    expect(JSON.stringify(s)).toBe(before)
    expect(validateStage(s, 'editing')).toEqual(a)
    expect(validateStage(s, 'import')).toEqual(a)
  })

  it('グリッド全体の組み合わせ（ランダムなステージ 300 個）でも、例外を投げない', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 300; i++) {
      const density = rand()
      const s = edit((cells, st) => {
        for (let r = 0; r < STAGE_ROWS; r++)
          for (let c = 0; c < STAGE_COLS; c++) cells[r]![c] = rand() < density ? 1 : 0
        st.spawns = {
          p1: { col: Math.floor(rand() * 26) - 1, row: Math.floor(rand() * 16) - 1 },
          p2: { col: Math.floor(rand() * 26) - 1, row: Math.floor(rand() * 16) - 1 },
        }
      })
      expect(() => validateStage(s, 'match')).not.toThrow()
    }
  })
})
