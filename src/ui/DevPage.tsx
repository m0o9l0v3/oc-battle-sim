import { useEffect, useState, type ReactNode } from 'react'
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

export type DevSection = {
  id: string
  /** 右上のボタンの文字（短く） */
  label: string
  /** 見出し */
  title: string
  render: () => ReactNode
}

/**
 * 開発用の部品の一覧。部品を足したら、ここに1行足す。
 * 画面の遷移（S01〜S12）は #35 で作る。ここは、部品の動作確認だけに使う
 */
export const DEV_SECTIONS: DevSection[] = [
  { id: 'stat', label: '能力値', title: '能力値の設定（S03。#27）', render: () => <StatDemo /> },
  {
    id: 'fighter',
    label: 'ファイター',
    title: 'ファイターの素材（#28）',
    render: () => <FighterGallery />,
  },
  {
    id: 'stage',
    label: 'ステージ',
    title: 'ステージの描画（#20。?perf も付けると FPS を表示）',
    render: () => <StageCanvas stage={DEMO_STAGE} />,
  },
  { id: 'keys', label: 'キー', title: 'キーの確認（#21）', render: () => <KeyCheck /> },
]

/** URL の # から、最初に開く部品を決める。ない・知らない名前のときは、先頭 */
export function initialSection(hash: string): string {
  const id = hash.replace(/^#/, '')
  return DEV_SECTIONS.some((s) => s.id === id) ? id : DEV_SECTIONS[0].id
}

/** 通常の画面へ戻るリンク。window がない環境（サーバー側の描画、テスト）でも落ちない */
const returnHref = () => (typeof window !== 'undefined' ? window.location.pathname : '/')

/**
 * 開発用ページ（URL に `?dev`）。参加者の画面ではない。
 * 右上のボタンで、部品（モード）を切り替える。1度に、1つの部品だけを表示する
 */
export function DevPage() {
  const [current, setCurrent] = useState(() =>
    initialSection(typeof window !== 'undefined' ? window.location.hash : ''),
  )
  // アドレスの # を書き換えたとき（戻る・進む、手で入力）も、同じ部品を開く
  useEffect(() => {
    const onHash = () => setCurrent(initialSection(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const section = DEV_SECTIONS.find((s) => s.id === current) ?? DEV_SECTIONS[0]

  const select = (id: string) => {
    setCurrent(id)
    // 更新しても、同じ部品を開く（履歴は増やさない）
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="mode-page">
      <header className="mode-header">
        <h1 className="mode-header__title">
          OC Battle Sim — 開発用 <span className="mode-header__current">{section.title}</span>
        </h1>
        <nav aria-label="部品の切り替え">
          <div role="tablist" className="mode-tabs">
            {DEV_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`tab-${s.id}`}
                aria-selected={s.id === section.id}
                aria-controls={`panel-${s.id}`}
                className={`mode-button${s.id === section.id ? ' mode-button--active' : ''}`}
                onClick={() => select(s.id)}
              >
                {s.label}
              </button>
            ))}
            <a className="mode-button" href={returnHref()}>
              通常の画面
            </a>
          </div>
        </nav>
      </header>
      <main
        role="tabpanel"
        id={`panel-${section.id}`}
        aria-labelledby={`tab-${section.id}`}
        className="mode-panel"
      >
        {section.render()}
      </main>
    </div>
  )
}
