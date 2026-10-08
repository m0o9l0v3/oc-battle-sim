// 親機の進行状態の保存（再起動しても、同じ sessionId で続ける）。
// 再起動のたびに sessionId が変わると、参加者PCが、一斉リセットと同じように S01 へ戻ってしまう（event-control.md §10）。
// 保存するのは進行状態だけ（フェーズ・sessionId・revision・タイマー・再戦の受付）。参加者のデータは、持たない（§11）
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readHostProgress, type HostProgress } from '../src/progress/index.ts'

export interface ProgressStore {
  /** 保存がない・壊れているときは null。例外を投げない */
  load(): HostProgress | null
  /** 失敗しても、例外を投げない（進行はメモリで続ける） */
  save(progress: HostProgress): void
}

export function createFileStore(
  path: string,
  log: (msg: string) => void = console.warn,
): ProgressStore {
  return {
    load() {
      let raw: string
      try {
        raw = readFileSync(path, 'utf8')
      } catch {
        return null
      }
      try {
        const p = readHostProgress(JSON.parse(raw))
        if (!p) log(`[host] 保存された進行状態が壊れているため、使いません: ${path}`)
        return p
      } catch {
        log(`[host] 保存された進行状態を読めないため、使いません: ${path}`)
        return null
      }
    },
    save(progress) {
      // 書きかけのファイルを残さないよう、別名に書いてから置き換える
      const tmp = `${path}.tmp`
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(tmp, `${JSON.stringify(progress, null, 2)}\n`)
        renameSync(tmp, path)
      } catch (e) {
        log(`[host] 進行状態を保存できませんでした: ${(e as Error).message}`)
      }
    },
  }
}

/** 保存しない（テスト用） */
export function createMemoryStore(initial: HostProgress | null = null): ProgressStore & {
  saved: HostProgress | null
} {
  return {
    saved: initial,
    load() {
      return this.saved
    },
    save(progress) {
      this.saved = progress
    },
  }
}
