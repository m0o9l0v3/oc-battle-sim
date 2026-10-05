import { DEMO_STAGE } from './ui/demoStage.ts'
import { KeyCheck } from './ui/KeyCheck.tsx'
import { StageCanvas } from './ui/StageCanvas.tsx'

export default function App() {
  return (
    <main>
      <h1>OC Battle Sim</h1>
      <p>Design → Test → Evaluate → Improve</p>
      <StageCanvas stage={DEMO_STAGE} />
      <KeyCheck />
    </main>
  )
}
