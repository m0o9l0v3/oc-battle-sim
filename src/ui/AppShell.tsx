import { useCallback, useEffect, useRef, useState } from 'react'
import { messages } from '../assets/index.ts'
import type { ProgressState } from '../model/index.ts'
import type { HostLink } from '../net/index.ts'
import { offersTakeHome } from '../progress/index.ts'
import { editorFromStage, type EditorState } from '../stage/index.ts'
import {
  BLOCK_REASONS,
  canGoBack,
  isAllowed,
  nextMatchNo,
  NO_HOST,
  operationBlockReason,
  screenBlockReason,
  type HostContext,
  type Session,
  type SessionRepository,
} from '../session/index.ts'
import { AppearanceScreen } from './AppearanceScreen.tsx'
import { BattleReport } from './BattleReport.tsx'
import { CompareView } from './CompareView.tsx'
import { Button, MessageBand, StepBar } from './components/index.ts'
import { EndScreen, MatchScreen, PrepScreen, RedesignScreen, StartScreen } from './FlowScreens.tsx'
import { PracticeScreen } from './PracticeScreen.tsx'
import { useHostProgress } from './hostProgress.ts'
import { useSession } from './session.ts'
import { isMobileEnvironment, TakeHomeEntry } from './TakeHomeEntry.tsx'
import { StageEditorScreen } from './StageEditorScreen.tsx'
import { StageScreen } from './StageScreen.tsx'
import { StatScreen } from './StatScreen.tsx'

/**
 * 体験の入口。S01〜S12 の画面を、セッションの状態（reducer）に従って出す。
 * 遷移の可否は reducer（session/flow.ts）が持つ。親機の進行による可否は session/gate.ts が持つ。
 * ここは、画面を選んで、操作を渡すだけ
 */
export function AppShell({ repo, link }: { repo?: SessionRepository; link?: HostLink }) {
  const { session, dispatch: baseDispatch, syncHost } = useSession(repo)
  // リセットのたびに、画面の部品の状態（S04 のエディタなど）を、作り直す（前の参加者の作品を、次の参加者に見せない）
  const [generation, setGeneration] = useState(0)
  const reset = useCallback(() => {
    setGeneration((g) => g + 1)
    baseDispatch({ type: 'RESET' })
  }, [baseDispatch])

  // 一斉リセット: 親機の sessionId が変わったら、全データを破棄して S01 へ（対戦中でも。event-control.md §9.1）
  const onProgress = useCallback(
    (p: ProgressState) => {
      if (syncHost(p.sessionId) === 'reset') reset()
    },
    [syncHost, reset],
  )
  const host = useHostProgress(link, onProgress)

  // 操作は、親機の進行で許されるものだけを通す（進行中の対戦・勝敗の確定・リセットは、いつでも通す）
  const hostRef = useRef(host)
  const sessionRef = useRef(session)
  useEffect(() => {
    hostRef.current = host
    sessionRef.current = session
  }, [host, session])
  const dispatch = useCallback<Dispatch>(
    (a) => {
      if (!isAllowed(hostRef.current, sessionRef.current, a)) return
      if (a.type === 'RESET') setGeneration((g) => g + 1)
      baseDispatch(a)
    },
    [baseDispatch],
  )

  return <Screens key={generation} session={session} dispatch={dispatch} host={host} />
}

type Dispatch = ReturnType<typeof useSession>['dispatch']

const m = messages.flow

export function Screens({
  session,
  dispatch,
  host = NO_HOST,
}: {
  session: Session
  dispatch: Dispatch
  host?: HostContext
}) {
  const { data } = session
  const rematchBlocked = operationBlockReason(host, 'rematch')
  // S04 のエディタの状態。S05 から戻ったとき、直前に編集していたステージが、そのまま残る
  const [editor, setEditor] = useState<EditorState>(() =>
    editorFromStage(data.stage, data.stagePresetId),
  )
  const back = canGoBack(session) ? () => dispatch({ type: 'BACK' }) : undefined
  const last = data.matches.at(-1)
  const finish = useCallback(
    (r: Parameters<React.ComponentProps<typeof MatchScreen>['onFinish']>[0]) =>
      dispatch({ type: 'FINISH_MATCH', ...r }),
    [dispatch],
  )

  let screen
  switch (data.screen) {
    case 'S01':
      screen = (
        <StartScreen
          onStart={() => dispatch({ type: 'START' })}
          blocked={operationBlockReason(host, 'fighter')}
        />
      )
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
        <BattleReport
          record={last}
          hasPreviousMatch={data.matches.length > 1}
          onRedesign={() => dispatch({ type: 'REDESIGN' })}
          redesignBlocked={rematchBlocked}
        />
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
          rematchBlocked={rematchBlocked}
        />
      )
      break
    case 'S11':
      screen = (
        <CompareView
          // 戦が増えたら、既定（直前の戦と、いま終わった戦）から、始め直す
          key={data.matches.at(-1)?.matchNo}
          matches={data.matches}
          onRedesign={() => dispatch({ type: 'REDESIGN' })}
          onEnd={() => dispatch({ type: 'END' })}
          redesignBlocked={rematchBlocked}
          endBlocked={operationBlockReason(host, 'share')}
        />
      )
      break
    case 'S12':
      screen = <EndScreen session={session} onReset={() => dispatch({ type: 'RESET' })} />
      break
  }

  // 画面の中の操作が、親機の進行で止まっているとき: 画面は見せたまま、操作できなくし、理由を出す（§12「表示のみ」）
  const blocked = screenBlockReason(host, data.screen)
  // 「もちかえる」（SHARING・BUFFER の間、S12 以外のすべての画面。対戦中は、終わってから。event-control.md §5.3）
  const inMatch = data.screen === 'S07' || data.screen === 'S10'
  const takeHome = offersTakeHome(host.last) && data.screen !== 'S12'

  return (
    <main className="flow" data-screen={data.screen}>
      {(data.screen !== 'S01' || takeHome) && (
        <div className="flow__top">
          <StepBar screen={data.screen} />
          {takeHome && (
            <Button
              variant="main"
              disabled={inMatch}
              reason={inMatch ? BLOCK_REASONS.takeHomeInMatch : undefined}
              onClick={() => dispatch({ type: 'SHARE' })}
            >
              {m.takeHome}
            </Button>
          )}
        </div>
      )}
      {blocked && <MessageBand kind="info">{blocked}</MessageBand>}
      <div className="flow__body" inert={!!blocked}>
        {screen}
      </div>
    </main>
  )
}
