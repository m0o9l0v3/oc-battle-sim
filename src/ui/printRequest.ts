// S12 の持ち帰りカードの印刷の依頼（送信中 → 送れた・送れなかった）。仕様: docs/05-multiplayer/take-home-print.md §7.2
// 画面（EndScreen）から切り離して、DOM なしで確かめられるようにする
import type { PrintRequestResult } from '../net/index.ts'

export type PrintStatus = 'idle' | 'sending' | 'success' | 'failed'

export type PrintRequesterDeps = {
  send: (takeHomeUrl: string) => Promise<PrintRequestResult>
  /** 受け付けられた整理番号（すぐにセッションへ残す） */
  onAccepted: (number: number) => void
  onStatus: (status: PrintStatus) => void
}

/**
 * 依頼を送る関数を作る。送信中は、何度呼んでも 1 回だけ送る（同じ描画の中の連打も）。
 * send が例外を投げても、送れなかったとして扱う
 */
export function createPrintRequester(deps: () => PrintRequesterDeps) {
  let sending = false
  return async (takeHomeUrl: string): Promise<void> => {
    if (sending) return
    sending = true
    const d = deps()
    d.onStatus('sending')
    let r: PrintRequestResult
    try {
      r = await d.send(takeHomeUrl)
    } catch {
      r = { ok: false }
    } finally {
      sending = false
    }
    if (r.ok) {
      d.onAccepted(r.number)
      d.onStatus('success')
    } else {
      d.onStatus('failed')
    }
  }
}
