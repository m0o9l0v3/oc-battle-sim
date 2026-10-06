import { describe, expect, it } from 'vitest'
import { simulateMatch } from '../battle/balance.ts'
import { DEFAULT_STATS } from '../fighter/index.ts'
import { findPlatforms } from './analysis.ts'
import { cloneStage, DEFAULT_PRESET_ID, findPreset, presetStage, STAGE_PRESETS } from './presets.ts'
import { stageFromRows } from './rows.ts'
import { validateStage } from './validate.ts'

describe('プリセット', () => {
  it('最低 3 つ。ID は重複しない。1 つ目が標準', () => {
    expect(STAGE_PRESETS.length).toBeGreaterThanOrEqual(3)
    expect(new Set(STAGE_PRESETS.map((p) => p.id)).size).toBe(STAGE_PRESETS.length)
    expect(STAGE_PRESETS[0]!.id).toBe(DEFAULT_PRESET_ID)
  })

  it('標準は、stage-format.md §8 のステージ', () => {
    const std = stageFromRows(
      [
        ...Array(6).fill('.'.repeat(24)),
        '..........####..........',
        '.'.repeat(24),
        '......####....####......',
        '....1..............2....',
        '....################....',
        '....################....',
        '....################....',
        '.'.repeat(24),
      ],
      'ひょうじゅん',
    )
    expect(findPreset('standard')!.stage).toEqual(std)
  })

  for (const p of STAGE_PRESETS) {
    it(`${p.id}: 全規則（対戦開始・編集・読み込み）を通る。名前と説明がある`, () => {
      for (const mode of ['match', 'editing', 'import'] as const) {
        const r = validateStage(p.stage, mode)
        expect(r.ok, `${p.id} ${mode} ${JSON.stringify(r.ok ? '' : r.violations)}`).toBe(true)
      }
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(p.stage.name).toBe(p.name)
    })

    it(`${p.id}: そのまま対戦を始められ、最後まで進む（ボット）`, () => {
      const r = simulateMatch(p.stage, [{ ...DEFAULT_STATS }, { ...DEFAULT_STATS }], 1)
      expect(r.outcome.reason).toBeDefined()
      expect(r.fightSteps).toBeGreaterThan(0)
    })
  }

  it('広さ・足場の高さが、違う（メイン足場の幅、足場の段数）', () => {
    const shape = STAGE_PRESETS.map((p) => {
      const pl = findPlatforms(p.stage.cells)
      return {
        main: Math.max(...pl.map((x) => x.width)),
        levels: new Set(pl.map((x) => x.row)).size,
        top: Math.min(...pl.map((x) => x.row)),
      }
    })
    expect(new Set(shape.map((s) => s.main)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(shape.map((s) => s.top)).size).toBeGreaterThanOrEqual(3)
    expect(Math.max(...shape.map((s) => s.levels))).toBeGreaterThanOrEqual(4)
  })

  it('複製を直しても、プリセットは変わらない。見つからない ID は標準', () => {
    const before = JSON.stringify(STAGE_PRESETS)
    const copy = presetStage('wide')
    copy.cells[10]![5] = 0
    copy.spawns.p1.col = 0
    copy.name = 'へんこう'
    expect(JSON.stringify(STAGE_PRESETS)).toBe(before)
    expect(presetStage('nothing')).toEqual(findPreset('standard')!.stage)
    expect(presetStage(null)).toEqual(findPreset('standard')!.stage)
    expect(cloneStage(copy)).toEqual(copy)
    expect(cloneStage(copy).cells[0]).not.toBe(copy.cells[0])
  })
})
