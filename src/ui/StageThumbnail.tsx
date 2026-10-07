import { BATTLE_COLORS, PLAYER_COLORS } from '../assets/index.ts'
import type { StageData } from '../model/index.ts'

// 1P は青系、2P は橙系（assets/theme.ts）
const SPAWN_COLORS = [PLAYER_COLORS.p1.bg, PLAYER_COLORS.p2.bg] as const

/** ステージの見本の絵（SVG。24 × 14 マス）。ブロックと、1P・2P のスタート位置 */
export function StageThumbnail({ stage, width = 168 }: { stage: StageData; width?: number }) {
  const { cols, rows } = stage
  // 同じ行の、連続したブロックを、1 つの長方形にまとめる
  const runs: { col: number; row: number; len: number }[] = []
  stage.cells.forEach((line, row) => {
    let start = -1
    for (let col = 0; col <= cols; col++) {
      const on = col < cols && line[col] === 1
      if (on && start < 0) start = col
      else if (!on && start >= 0) {
        runs.push({ col: start, row, len: col - start })
        start = -1
      }
    }
  })
  return (
    <svg
      className="stage-thumb"
      viewBox={`0 0 ${cols} ${rows}`}
      width={width}
      height={Math.round((width * rows) / cols)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={cols} height={rows} fill={BATTLE_COLORS.stage} />
      {runs.map((r) => (
        <rect
          key={`${r.row}-${r.col}`}
          x={r.col}
          y={r.row}
          width={r.len}
          height={1}
          fill={BATTLE_COLORS.block}
        />
      ))}
      {(['p1', 'p2'] as const).map((slot, i) => (
        <circle
          key={slot}
          cx={stage.spawns[slot].col + 0.5}
          cy={stage.spawns[slot].row + 0.5}
          r={0.45}
          fill={SPAWN_COLORS[i]}
        />
      ))}
    </svg>
  )
}
