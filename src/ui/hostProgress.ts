// 親機の進行状態の購読（frontend.md §8.2 H2〜H4）。HostLink の値を、画面が使う形（HostContext）にする
import { useEffect, useRef, useState } from 'react'
import type { ProgressState } from '../model/index.ts'
import { createHostLink, nullHostLink, type HostLink } from '../net/index.ts'
import { NO_HOST, type HostContext } from '../session/index.ts'

/**
 * 当日（親機の配信）は、親機から進行状態を取得する。持ち帰り後（GitHub Pages）は、親機がない。
 * GitHub Pages 用のビルドでは `VITE_HOST_LINK=off` を指定する（.github/workflows/deploy.yml）
 */
export function defaultHostLink(): HostLink {
  if (typeof window === 'undefined' || import.meta.env.VITE_HOST_LINK === 'off') return nullHostLink
  return createHostLink({ url: `${import.meta.env.BASE_URL}api/progress` })
}

/**
 * 進行状態を購読する。HostLink が null（通信不能が続いた）を通知したら、live を null にして、すべて許可にする。
 * last は、最後に取得できた値のまま残す（「もちかえる」ボタンの表示に使う）。
 * link を渡さないときは、ここで作って、外すときに止める。
 * onProgress は、進行状態を取得するたびに呼ぶ（sessionId の照合に使う）
 */
export function useHostProgress(
  link?: HostLink,
  onProgress?: (p: ProgressState) => void,
): HostContext {
  const [ctx, setCtx] = useState<HostContext>(NO_HOST)
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onProgressRef.current = onProgress
  }, [onProgress])
  useEffect(() => {
    const l = link ?? defaultHostLink()
    const off = l.subscribe((p) => {
      if (p) onProgressRef.current?.(p)
      setCtx((prev) => (p ? { live: p, last: p } : { live: null, last: prev.last }))
    })
    return () => {
      off()
      if (!link) l.dispose()
    }
  }, [link])
  return ctx
}
