import { AppShell } from './ui/AppShell.tsx'
import { DevPage } from './ui/DevPage.tsx'
import { isDevPage } from './ui/devMode.ts'

/**
 * 入口。通常は、体験（S01〜S12）。画面の遷移とセッションは、`ui/AppShell`。
 * URL に `?dev` を付けると、部品の動作確認用のページを開く（参加者の画面には、出さない）。
 * `?reset` は、その台の保存を破棄して、S01 から始める（個別リセット用のブックマーク）
 */
export default function App({
  dev = typeof window !== 'undefined' && isDevPage(window.location.search),
}: {
  dev?: boolean
}) {
  if (dev) return <DevPage />
  return <AppShell />
}
