// 印刷ステーションの処理（ブラウザで動く ES モジュール。server/print-station.html が読み込む）。
// 仕様: docs/05-multiplayer/take-home-print.md §9
//
// 印刷待ちを 1 件ずつ取り出し、印刷シートを iframe に読み込んで印刷する。
// - 印刷の終わりは、afterprint で待つ（print() が、印刷の終わりを待たずに戻るブラウザでも、次の 1 枚で上書きしない）
// - 印刷シートを読めない・印刷できなかったときは、済みにしない。自動印刷を止めて、スタッフに知らせる
//   （取り出したものは、CLAIM_TIMEOUT_MS のあと、印刷待ちへ戻る。再開すると、もう一度印刷する）
// 画面の表示（DOM）は、受け取った view に任せる（ここは、テストから、DOM なしで動かせる）

/** 1 枚を印刷したあと、次を取り出すまでの待ち（プリンタへの送信を詰まらせない） */
export const GAP_MS = 1500
/** afterprint が来ないときに、印刷できたとみなすまでの待ち */
export const AFTERPRINT_TIMEOUT_MS = 120_000

/** 親機の API。応答が成功でなければ、例外を投げる（済みの報告の 409 は、すでに済み・状態が変わったとして、一覧を返す） */
export function createApi(token, fetchFn = (...args) => fetch(...args)) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const call = async (path, init, allow409 = false) => {
    const res = await fetchFn(path, { cache: 'no-store', headers, ...init })
    if (!res.ok && !(allow409 && res.status === 409)) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
  return {
    status: () => call('/api/print/status', {}),
    claim: () => call('/api/print/claim', { method: 'POST' }),
    done: (id) => call('/api/print/done', { method: 'POST', body: JSON.stringify({ id }) }, true),
    reprint: (id) =>
      call('/api/print/reprint', { method: 'POST', body: JSON.stringify({ id }) }, true),
  }
}

/**
 * 印刷の手順。
 * deps: { api, printSheet(job) → Promise<boolean>, view: { render(summary), connected(ok), message(text), failed(job) }, wait(ms) }
 */
export function createStation(deps) {
  let paused = false
  let busy = false

  async function tick() {
    if (busy) return
    busy = true
    try {
      deps.view.render(await deps.api.status())
      deps.view.connected(true)
      if (paused) return
      const { job } = await deps.api.claim()
      if (!job) return
      deps.view.message(`整理番号 ${job.number} を印刷しています…`)
      if (!(await deps.printSheet(job))) {
        paused = true
        deps.view.failed(job)
        return
      }
      deps.view.render(await deps.api.done(job.id))
      deps.view.message(`整理番号 ${job.number} を印刷しました`)
      await deps.wait(GAP_MS)
    } catch {
      deps.view.connected(false)
    } finally {
      busy = false
    }
  }

  return {
    tick,
    isPaused: () => paused,
    setPaused: (v) => {
      paused = v
    },
  }
}

/** iframe に印刷シートを読み込んで印刷する関数を作る。印刷できたら true */
export function createIframePrinter(frame, token, options = {}) {
  const fetchFn = options.fetchFn ?? ((...args) => fetch(...args))
  const timeoutMs = options.afterprintTimeoutMs ?? AFTERPRINT_TIMEOUT_MS
  return async (job) => {
    let html
    try {
      const res = await fetchFn(
        `/print-station/sheet?id=${encodeURIComponent(job.id)}&token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return false
      html = await res.text()
    } catch {
      return false
    }
    await new Promise((resolve) => {
      frame.onload = () => {
        frame.onload = null
        resolve()
      }
      frame.srcdoc = html
    })
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) return false
    // ロゴの画像の描画を待つ（失敗しても、印刷は続ける）
    await Promise.all(Array.from(doc.images, (img) => img.decode().catch(() => {})))
    return new Promise((resolve) => {
      let finished = false
      const finish = (ok) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        resolve(ok)
      }
      const timer = setTimeout(() => finish(true), timeoutMs)
      win.addEventListener('afterprint', () => finish(true), { once: true })
      try {
        win.focus()
        win.print()
      } catch {
        finish(false)
      }
    })
  }
}
