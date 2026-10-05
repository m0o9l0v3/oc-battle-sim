import { DevPage } from './ui/DevPage.tsx'
import { isDevPage } from './ui/devMode.ts'

/**
 * 入口。通常は、体験の入口（S01 の場所）。画面の遷移（S01〜S12）は #35 で作る。
 * URL に `?dev` を付けると、部品の動作確認用のページを開く（参加者の画面には、出さない）。
 */
export default function App({
  dev = typeof window !== 'undefined' && isDevPage(window.location.search),
}: {
  dev?: boolean
}) {
  if (dev) return <DevPage />
  return (
    <main>
      <h1>OC Battle Sim</h1>
      <p>Design → Test → Evaluate → Improve</p>
    </main>
  )
}
