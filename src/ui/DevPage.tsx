import { useState, type ReactNode } from 'react'
import { DEFAULT_STATS, createDefaultConfig } from '../fighter/index.ts'
import type { CharacterConfig, StageData, Stats } from '../model/index.ts'
import { DEFAULT_PRESET_ID, createEditor, presetStage, type EditorState } from '../stage/index.ts'
import { DEMO_STAGE } from './demoStage.ts'
import { PracticeScreen } from './PracticeScreen.tsx'
import { StageEditorScreen } from './StageEditorScreen.tsx'
import { StageScreen } from './StageScreen.tsx'
import { StageSelectScreen } from './StageSelectScreen.tsx'
import { AppearanceScreen } from './AppearanceScreen.tsx'
import { AnimationSheet } from './AnimationSheet.tsx'
import { FighterArena } from './FighterArena.tsx'
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

function AppearanceDemo() {
  const [config, setConfig] = useState<CharacterConfig>(() => createDefaultConfig('p1'))
  const [done, setDone] = useState<CharacterConfig | null>(null)
  return (
    <>
      <AppearanceScreen config={config} onChange={setConfig} onNext={setDone} />
      {done && <p role="status">つぎの がめんへ すすむよ（{JSON.stringify(done)}）</p>}
    </>
  )
}

/** S03・S04 から S05 へ、S05 から S03・S04 へ戻る流れの確認（画面の遷移の本体は #35） */
function PracticeDemo() {
  const [config, setConfig] = useState<CharacterConfig>(() => createDefaultConfig('p1'))
  const [stage, setStage] = useState<StageData>(() => presetStage(DEFAULT_PRESET_ID))
  const [editor, setEditor] = useState<EditorState>(() => createEditor())
  const [view, setView] = useState<'practice' | 'stats' | 'stage' | 'battle'>('practice')
  if (view === 'stats') {
    return (
      <StatScreen
        stats={config.stats}
        onChange={(stats) => setConfig({ ...config, stats })}
        onNext={() => setView('practice')}
        onBack={() => setView('practice')}
      />
    )
  }
  if (view === 'stage') {
    return (
      <StageEditorScreen
        editor={editor}
        onChange={setEditor}
        onNext={(s) => {
          setStage(s)
          setView('practice')
        }}
        onBack={() => setView('practice')}
      />
    )
  }
  if (view === 'battle') {
    return (
      <>
        <p role="status">つぎは 「たいせんの じゅんび」（S06。#35 で つなぐよ）</p>
        <button type="button" className="button button--sub" onClick={() => setView('practice')}>
          もういちど ためす
        </button>
      </>
    )
  }
  return (
    <PracticeScreen
      config={config}
      stage={stage}
      onFixStats={() => setView('stats')}
      onFixStage={() => setView('stage')}
      onNext={() => setView('battle')}
    />
  )
}

function StageEditorDemo() {
  const [editor, setEditor] = useState<EditorState>(() => createEditor())
  const [done, setDone] = useState<StageData | null>(null)
  return (
    <>
      <StageScreen onNext={setDone}>
        <StageEditorScreen editor={editor} onChange={setEditor} onNext={setDone} />
      </StageScreen>
      {done && (
        <>
          <p role="status">つくった ステージで ためしに うごかすよ（{done.name}）</p>
          <FighterArena
            key={JSON.stringify(done.cells) + JSON.stringify(done.spawns)}
            stage={done}
          />
        </>
      )}
    </>
  )
}

function StageSelectDemo() {
  const [id, setId] = useState(DEFAULT_PRESET_ID)
  const [done, setDone] = useState<StageData | null>(null)
  return (
    <>
      <StageSelectScreen selectedId={id} onSelect={setId} onNext={setDone} />
      {done && <p role="status">つぎの がめんへ すすむよ（{done.name}）</p>}
    </>
  )
}

export type DevSection = { id: string; title: string; render: () => ReactNode }

/**
 * 開発用の部品の一覧。部品を足したら、ここに1行足す。
 * 画面の遷移（S01〜S12）は #35 で作る。ここは、部品の動作確認だけに使う
 */
export const DEV_SECTIONS: DevSection[] = [
  { id: 'practice', title: '試しに うごかす（S05。#34）', render: () => <PracticeDemo /> },
  { id: 'stage-editor', title: 'ステージを つくる（S04。#33）', render: () => <StageEditorDemo /> },
  { id: 'stage-select', title: 'ステージを えらぶ（S04。#32）', render: () => <StageSelectDemo /> },
  { id: 'appearance', title: '見た目を選ぶ（S02。#30）', render: () => <AppearanceDemo /> },
  { id: 'stat', title: '能力値の設定（S03。#27）', render: () => <StatDemo /> },
  { id: 'fighter', title: 'ファイターの素材（#28）', render: () => <FighterGallery /> },
  { id: 'sheet', title: '7状態のポーズ（#29）', render: () => <AnimationSheet /> },
  {
    id: 'arena',
    title: 'ファイターの描画とアニメーション（#29。?perf も付けると FPS を表示）',
    render: () => <FighterArena />,
  },
  {
    id: 'stage',
    title: 'ステージの描画（#20。?perf も付けると FPS を表示）',
    render: () => <StageCanvas stage={DEMO_STAGE} />,
  },
  { id: 'keys', title: 'キーの確認（#21）', render: () => <KeyCheck /> },
]

/** 通常の画面へ戻るリンク。window がない環境（サーバー側の描画、テスト）でも落ちない */
const returnHref = () => (typeof window !== 'undefined' ? window.location.pathname : '/')

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
          <a href={returnHref()}>通常の画面にもどる</a>
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
