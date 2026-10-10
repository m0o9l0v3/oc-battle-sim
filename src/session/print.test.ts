// 持ち帰りカードの印刷の待機（take-home-print.md §7）
import { describe, expect, it } from 'vitest'
import { SESSION_STORAGE_KEY } from '../model/index.ts'
import { reduceFlow, type FlowAction } from './flow.ts'
import { boot, createRepository, toSnapshot, type StorageLike } from './persist.ts'
import { createSession, type Session } from './state.ts'

const run = (s: Session, ...a: FlowAction[]) => a.reduce(reduceFlow, s)

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

const s12 = run(createSession(), { type: 'SHARE' })

describe('印刷を受け付けたあとの待機（PRINT_ACCEPTED）', () => {
  it('S12 で、整理番号を持つ。2 回目は、上書きしない', () => {
    expect(s12.data.screen).toBe('S12')
    const s = run(s12, { type: 'PRINT_ACCEPTED', number: 3 })
    expect(s.data.printNumber).toBe(3)
    expect(run(s, { type: 'PRINT_ACCEPTED', number: 4 }).data.printNumber).toBe(3)
  })

  it('S12 以外では、無視する', () => {
    const s = run(createSession(), { type: 'PRINT_ACCEPTED', number: 3 })
    expect(s.data.printNumber).toBeUndefined()
  })

  it('リセット（一斉・個別）で消える', () => {
    const s = run(s12, { type: 'PRINT_ACCEPTED', number: 3 }, { type: 'RESET' })
    expect(s.data.printNumber).toBeUndefined()
    expect(s.data.screen).toBe('S01')
  })

  it('更新（再開）しても、待機のまま（再び依頼させない）', () => {
    const repo = createRepository(memoryStorage())
    repo.save(toSnapshot(run(s12, { type: 'PRINT_ACCEPTED', number: 5 })))
    const restored = boot(repo, '', createSession).session
    expect(restored.data.screen).toBe('S12')
    expect(restored.data.printNumber).toBe(5)
  })

  it('S12 以外の画面の整理番号・正でない整理番号は、読み捨てる', () => {
    const storage = memoryStorage()
    const repo = createRepository(storage)
    for (const [screen, printNumber] of [
      ['S12', 0],
      ['S12', 1.5],
      ['S12', '3'],
    ] as const) {
      repo.save(toSnapshot(s12))
      const snap = JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)
      snap.data = { ...snap.data, screen, printNumber }
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snap))
      expect(boot(repo, '', createSession).session.data.printNumber).toBeUndefined()
    }
    // 待機の印がないときは、保存に書かない
    repo.save(toSnapshot(s12))
    expect(storage.getItem(SESSION_STORAGE_KEY)).not.toContain('printNumber')
  })
})
