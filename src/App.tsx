import { useState } from 'react'
import { DEFAULT_STATS } from './fighter/index.ts'
import type { Stats } from './model/index.ts'
import { DEMO_STAGE } from './ui/demoStage.ts'
import { KeyCheck } from './ui/KeyCheck.tsx'
import { StageCanvas } from './ui/StageCanvas.tsx'
import { StatScreen } from './ui/StatScreen.tsx'

export default function App() {
  // 画面の遷移（S01〜S12）は #35。ここは、部品の動作確認用
  const [stats, setStats] = useState<Stats>({ ...DEFAULT_STATS })
  const [done, setDone] = useState(false)
  return (
    <main>
      <h1>OC Battle Sim</h1>
      <p>Design → Test → Evaluate → Improve</p>
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
      <StageCanvas stage={DEMO_STAGE} />
      <KeyCheck />
    </main>
  )
}
