import { useState, type ReactNode } from 'react'
import { DEFAULT_STATS } from '../fighter/index.ts'
import type { Stats } from '../model/index.ts'
import { DEMO_STAGE } from './demoStage.ts'
import { FighterGallery } from './FighterGallery.tsx'
import { KeyCheck } from './KeyCheck.tsx'
import { StageCanvas } from './StageCanvas.tsx'
import { StatScreen } from './StatScreen.tsx'

function StatDemo() {
  const [stats, setStats] = useState<Stats>({ ...DEFAULT_STATS })
  const [done, setDone] = useState(false)
  return (
    <>
      <StatScreen
        stats={stats}
        onChange={(s) => {
          setStats(s)
          setDone(false)
        }}
        onNext={() => setDone(true)}
        onBack={() => {}}
      />
      {done && <p role="status">つぎの がめんへ すすむよ（{JSON.stringify(stats)}）</p>}
    </>
  )
}

export type DevSection = { id: string; title: string; render: () => ReactNode }

/**
 * 開発用の部品の一覧。部品を足したら、ここに1行足す。
 * 画面の遷移（S01〜S12）は #35 で作る。ここは、部品の動作確認だけに使う
 */
export const DEV_SECTIONS: DevSection[] = [
  { id: 'stat', title: '能力値の設定（S03。#27）', render: () => <StatDemo /> },
  { id: 'fighter', title: 'ファイターの素材（#28）', render: () => <FighterGallery /> },
  {
    id: 'stage',
    title: 'ステージの描画（#20。?perf も付けると FPS を表示）',
    render: () => <StageCanvas stage={DEMO_STAGE} />,
  },
  { id: 'keys', title: 'キーの確認（#21）', render: () => <KeyCheck /> },
]

/** 開発用ページ（URL に `?dev`）。参加者の画面ではない */
export function DevPage() {
  return (
    <main>
      <h1>OC Battle Sim — 開発用</h1>
      <p>部品の動作確認用のページです。参加者の画面ではありません。</p>
      <nav aria-label="部品の一覧">
        <ul>
          {DEV_SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ul>
        <p>
          <a href={window.location.pathname}>通常の画面にもどる</a>
        </p>
      </nav>
      {DEV_SECTIONS.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.title}</h2>
          {s.render()}
        </section>
      ))}
    </main>
  )
}
