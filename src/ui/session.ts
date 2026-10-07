// セッションのストア（useReducer）と、保存先（localStorage）の接続。仕様: docs/08-architecture/frontend.md §9.2
import { useEffect, useReducer, useRef, useState } from 'react'
import {
  boot,
  createRepository,
  createSession,
  reduceFlow,
  stripResetFlag,
  toSnapshot,
  type FlowAction,
  type Session,
  type SessionRepository,
  type StorageLike,
} from '../session/index.ts'

/** ブラウザの localStorage。使えない環境（無効化、サーバー側の描画）では undefined */
function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

const log = (e: unknown) => console.warn('[session]', e)

export const browserRepository = (): SessionRepository => createRepository(browserStorage(), log)

/** 編集中の値を保存するまでの待ち（data-model.md §6.3） */
const SAVE_DEBOUNCE_MS = 300

export function useSession(repo?: SessionRepository) {
  // 保存先は、最初に決めたものを使い続ける（再描画で、作り直さない）
  const [repository] = useState<SessionRepository>(() => repo ?? browserRepository())
  const repoRef = useRef(repository)
  const [session, dispatch] = useReducer(
    (s: Session, a: FlowAction) => reduceFlow(s, a),
    undefined,
    () => {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      return boot(repository, search, createSession).session
    },
  )

  // `?reset` は、破棄したら、すぐ URL から取り除く（残すと、次の更新が、またリセットになる）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const next = stripResetFlag(window.location.search)
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${next}${window.location.hash}`,
      )
    }
  }, [])

  // 保存: 画面の遷移・対戦の終了は、すぐ。編集中の値は、待ってから（対戦中のループの中では、保存しない）
  const lastScreen = useRef(session.data.screen)
  const lastMatches = useRef(session.data.matches.length)
  useEffect(() => {
    const immediate =
      session.data.screen !== lastScreen.current ||
      session.data.matches.length !== lastMatches.current
    lastScreen.current = session.data.screen
    lastMatches.current = session.data.matches.length
    // S01（まだ何も作っていない）は、保存を残さない（リセットのあとに、前の参加者の保存が残らない）
    const save = () =>
      session.data.screen === 'S01'
        ? repoRef.current.clear()
        : repoRef.current.save(toSnapshot(session))
    if (immediate) {
      save()
      return
    }
    const t = setTimeout(save, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [session])

  return { session, dispatch }
}
