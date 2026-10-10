import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { messages } from '../assets/index.ts'
import { createDefaultConfig } from '../fighter/index.ts'
import { presetStage } from '../stage/index.ts'
import { cpuOutcomeLine, CpuPlayScreen } from './CpuPlayScreen.tsx'

const m = messages.cpuPlay

describe('CPUと たいせん（PC）', () => {
  const html = renderToStaticMarkup(
    <CpuPlayScreen
      config={createDefaultConfig('p1')}
      stage={presetStage('standard')}
      onBack={() => {}}
    />,
  )

  it('1P のキー、CPU の強さ（3 段階。標準は「ふつう」）、CPU の能力値（標準）', () => {
    expect(html).toContain(m.title)
    expect(html).toContain('A')
    for (const id of ['easy', 'normal', 'hard'] as const) expect(html).toContain(m.levels[id])
    expect(html).toMatch(/data-checked="true"[^>]*>(?:(?!<\/label>).)*ふつう/s)
    expect(html).toContain(m.foeNote)
    expect(html).toContain(m.changeFoe)
    expect(html).toContain(m.start)
  })

  it('結果は、きみ（1P）から見た言葉で出す', () => {
    expect(cpuOutcomeLine({ winner: 'p1', reason: 'stocks' })).toContain(m.win)
    expect(cpuOutcomeLine({ winner: 'p2', reason: 'timeup_damage' })).toContain(m.lose)
    expect(cpuOutcomeLine({ winner: null, reason: 'draw_timeup' })).toContain(m.draw)
  })
})
