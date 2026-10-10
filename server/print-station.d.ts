// server/print-station.js（ブラウザで動く ES モジュール）の型。テストから使う
import type { PrintQueueSummary } from './printQueue.ts'

export type StationJob = { id: string; number: number }
export type StationSummary = PrintQueueSummary & { logo?: boolean }

export interface StationApi {
  status(): Promise<StationSummary>
  claim(): Promise<{ job: StationJob | null }>
  done(id: string): Promise<StationSummary>
  reprint(id: string): Promise<StationSummary>
}

export interface StationView {
  render(summary: StationSummary): void
  connected(ok: boolean): void
  message(text: string): void
  failed(job: StationJob): void
}

export const GAP_MS: number
export const AFTERPRINT_TIMEOUT_MS: number

export function createApi(token: string, fetchFn?: typeof fetch): StationApi

export function createStation(deps: {
  api: StationApi
  printSheet: (job: StationJob) => Promise<boolean>
  view: StationView
  wait: (ms: number) => Promise<void>
}): { tick(): Promise<void>; isPaused(): boolean; setPaused(v: boolean): void }

export function createIframePrinter(
  /** iframe 要素（サーバーの型は DOM を持たないため、object） */
  frame: object,
  token: string,
  options?: { fetchFn?: typeof fetch; afterprintTimeoutMs?: number },
): (job: StationJob) => Promise<boolean>
