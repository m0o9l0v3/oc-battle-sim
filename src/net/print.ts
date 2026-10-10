// 持ち帰りカードの印刷の依頼（参加者PC → 親機）。仕様: docs/05-multiplayer/take-home-print.md §6
//
// - 送るのは、持ち帰りURL（S12 の QR と同じもの）だけ。親機が整理番号を付けて返す
// - 失敗しても例外を投げない。`{ ok: false }` を返すだけ（画面は、もういちど押せる状態に戻す）

export type PrintRequestResult = { ok: true; number: number } | { ok: false }

export const PRINT_REQUEST_TIMEOUT_MS = 5000

export async function sendPrintRequest(
  takeHomeUrl: string,
  options: {
    /** 依頼の URL（親機の `/api/print/job`） */
    endpoint?: string
    fetch?: typeof fetch
    timeoutMs?: number
  } = {},
): Promise<PrintRequestResult> {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const endpoint = options.endpoint ?? `${import.meta.env.BASE_URL}api/print/job`
  const abort = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = abort
    ? setTimeout(() => abort.abort(), options.timeoutMs ?? PRINT_REQUEST_TIMEOUT_MS)
    : null
  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: takeHomeUrl }),
      cache: 'no-store',
      ...(abort ? { signal: abort.signal } : {}),
    })
    if (!res.ok) return { ok: false }
    const body: unknown = await res.json()
    const number =
      typeof body === 'object' && body !== null ? (body as { number?: unknown }).number : null
    return Number.isInteger(number) && (number as number) > 0
      ? { ok: true, number: number as number }
      : { ok: false }
  } catch {
    return { ok: false }
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}
