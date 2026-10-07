import { useCallback, useState } from 'react'
import { editorFromStage, type EditorState } from '../stage/index.ts'
import { canGoBack, nextMatchNo, type Session, type SessionRepository } from '../session/index.ts'
import { AppearanceScreen } from './AppearanceScreen.tsx'
import { StepBar } from './components/index.ts'
import {
  CompareScreen,
  EndScreen,
  MatchScreen,
  PrepScreen,
  RedesignScreen,
  ReportScreen,
  StartScreen,
} from './FlowScreens.tsx'
import { PracticeScreen } from './PracticeScreen.tsx'
import { useSession } from './session.ts'
import { StageEditorScreen } from './StageEditorScreen.tsx'
import { StageScreen } from './StageScreen.tsx'
import { StatScreen } from './StatScreen.tsx'

/**
 * 体験の入口。S01〜S12 の画面を、セッションの状態（reducer）に従って出す。
 * 遷移の可否は reducer（session/flow.ts）が持つ。ここは、画面を選んで、操作を渡すだけ
 */
export function AppShell({ repo }: { repo?: SessionRepository }) {
  const { session, dispatch: baseDispatch } = useSession(repo)
  // リセットのたびに、画面の部品の状態（S04 のエディタなど）を、作り直す（前の参加者の作品を、次の参加者に見せない）
  const [generation, setGeneration] = useState(0)
  const dispatch = useCallback<Dispatch>(
    (a) => {
      if (a.type === 'RESET') setGeneration((g) => g + 1)
      baseDispatch(a)
    },
    [baseDispatch],
  )
  return <Screens key={generation} session={session} dispatch={dispatch} />
}

type Dispatch = ReturnType<typeof useSession>['dispatch']

export function Screens({ session, dispatch }: { session: Session; dispatch: Dispatch }) {
  const { data } = session
  // S04 のエディタの状態。S05 から戻ったとき、直前に編集していたステージが、そのまま残る
  const [editor, setEditor] = useState<EditorState>(() =>
    editorFromStage(data.stage, data.stagePresetId),
  )
  const back = canGoBack(session) ? () => dispatch({ type: 'BACK' }) : undefined
  const last = data.matches.at(-1)
  const finish = useCallback(
    (r: { outcome: import('../model/index.ts').MatchOutcome; durationSec: number }) =>
      dispatch({ type: 'FINISH_MATCH', ...r }),
    [dispatch],
  )

  let screen
  switch (data.screen) {
    case 'S01':
      screen = <StartScreen onStart={() => dispatch({ type: 'START' })} />
      break
    case 'S02':
      screen = (
        <AppearanceScreen
          config={data.p1}
          onChange={(config) => dispatch({ type: 'SET_P1', config })}
          onNext={(config) => {
            dispatch({ type: 'SET_P1', config })
            dispatch({ type: 'NEXT' })
          }}
        />
      )
      break
    case 'S03':
      screen = (
        <StatScreen
          stats={data.p1.stats}
          onChange={(stats) => dispatch({ type: 'SET_P1', config: { ...data.p1, stats } })}
          onNext={() => dispatch({ type: 'NEXT' })}
          onBack={back}
        />
      )
      break
    case 'S04':
      screen = (
        <StageScreen
          onNext={(stage) =>
            dispatch({ type: 'CONFIRM_STAGE', stage, presetId: data.stagePresetId })
          }
          onBack={back}
        >
          <StageEditorScreen
            editor={editor}
            onChange={setEditor}
            onNext={(stage) =>
              dispatch({ type: 'CONFIRM_STAGE', stage, presetId: editor.selectedPresetId })
            }
            onBack={back}
          />
        </StageScreen>
      )
      break
    case 'S05':
      screen = (
        <PracticeScreen
          config={data.p1}
          stage={data.stage}
          onFixStats={() => dispatch({ type: 'FIX_STATS' })}
          onFixStage={() => dispatch({ type: 'FIX_STAGE' })}
          onNext={() => dispatch({ type: 'NEXT' })}
        />
      )
      break
    case 'S06':
      screen = (
        <PrepScreen
          p1={data.p1}
          p2={data.p2}
          onChangeP2={(config) => dispatch({ type: 'SET_P2', config })}
          onStart={() => dispatch({ type: 'BEGIN_MATCH' })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      )
      break
    case 'S07':
    case 'S10':
      screen = session.current ? (
        // 試合ごとに、画面を作り直す（前の試合の状態を引き継がない）
        <MatchScreen
          key={nextMatchNo(session)}
          matchNo={nextMatchNo(session)}
          setup={session.current}
          onFinish={finish}
        />
      ) : null
      break
    case 'S08':
      screen = last ? (
        <ReportScreen record={last} onRedesign={() => dispatch({ type: 'REDESIGN' })} />
      ) : null
      break
    case 'S09':
      screen = (
        <RedesignScreen
          session={session}
          onChangeP1={(config) => dispatch({ type: 'SET_P1', config })}
          onChangeP2={(config) => dispatch({ type: 'SET_P2', config })}
          onRematch={() => dispatch({ type: 'BEGIN_MATCH' })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      )
      break
    case 'S11':
      screen = (
        <CompareScreen
          matches={data.matches}
          onRedesign={() => dispatch({ type: 'REDESIGN' })}
          onEnd={() => dispatch({ type: 'END' })}
        />
      )
      break
    case 'S12':
      screen = <EndScreen session={session} onReset={() => dispatch({ type: 'RESET' })} />
      break
  }

  return (
    <main className="flow" data-screen={data.screen}>
      <StepBar screen={data.screen} />
      {screen}
    </main>
  )
}
