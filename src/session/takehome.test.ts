// 持ち帰りの設定の復元（起動時のフラグメント）。仕様: docs/05-multiplayer/take-home-share.md §9
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../fighter/index.ts'
import { SESSION_STORAGE_KEY } from '../model/index.ts'
import { encodeTakeHome } from '../share/index.ts'
import { presetStage } from '../stage/index.ts'
import { reduceFlow } from './flow.ts'
import { boot, createRepository, toSnapshot, type StorageLike } from './persist.ts'
import { createSession } from './state.ts'

class MemoryStorage implements StorageLike {
  map = new Map<string, string>()
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
}

const fighter = {
  ...createDefaultConfig('p1'),
  name: 'ゆうしゃ',
  stats: { attackPower: 7, defense: 3, jumpPower: 5, speed: 5 },
}
const stage = { ...presetStage('wide'), name: 'ひろば' }
const fragment = () => {
  const r = encodeTakeHome(fighter, stage)
  if (!r.ok) throw new Error('encode')
  return `#t1.${r.payload}`
}

describe('起動時の持ち帰りデータ', () => {
  it('フラグメントがなければ、これまでどおり（takeHome は null）', () => {
    const r = boot(createRepository(new MemoryStorage()), '', createSession)
    expect(r.takeHome).toBeNull()
    expect(boot(createRepository(new MemoryStorage()), '', createSession, '#').takeHome).toBeNull()
  })

  it('復元できたら、1P とステージを入れた S01 から始める。2P は標準', () => {
    const r = boot(createRepository(new MemoryStorage()), '', createSession, fragment())
    expect(r.takeHome).toMatchObject({ status: 'restored' })
    expect(r.session.data.screen).toBe('S01')
    expect(r.session.data.p1).toEqual(fighter)
    expect(r.session.data.stage).toEqual(stage)
    expect(r.session.data.stagePresetId).toBeNull()
    expect(r.session.data.p2).toEqual(createDefaultConfig('p2'))
    expect(r.session.data.matches).toEqual([])
  })

  it('保存が残っていても、持ち帰りのデータを優先する', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    repo.save(toSnapshot(reduceFlow(createSession(), { type: 'START' })))
    const r = boot(repo, '', createSession, fragment())
    expect(r.session.data.p1).toEqual(fighter)
  })

  it('失敗したら、理由を返し、保存を使う（なければ S01 から）。落ちない', () => {
    const bad = `${fragment().slice(0, -3)}AAA`
    const r = boot(createRepository(new MemoryStorage()), '', createSession, bad)
    expect(r.takeHome).toMatchObject({ status: 'failed' })
    expect(r.session).toEqual(createSession())

    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    const saved = reduceFlow(createSession(), { type: 'START' })
    repo.save(toSnapshot(saved))
    const r2 = boot(repo, '', createSession, '#u1.abc')
    expect(r2.takeHome).toEqual({ status: 'failed', reason: 'UNKNOWN_VERSION' })
    expect(r2.session.data.screen).toBe('S02')
  })

  it('?reset が先。破棄して S01 から、持ち帰りデータは使わない', () => {
    const storage = new MemoryStorage()
    storage.setItem(SESSION_STORAGE_KEY, '{}')
    const r = boot(createRepository(storage), '?reset', createSession, fragment())
    expect(r.resetDone).toBe(true)
    expect(r.takeHome).toBeNull()
    expect(r.session).toEqual(createSession())
  })

  it('復元したあとの「ふたりで あそぶ」で S06 へ。2P は標準', () => {
    const { session } = boot(createRepository(new MemoryStorage()), '', createSession, fragment())
    const s = reduceFlow(session, { type: 'IMPORT_PLAY' })
    expect(s.data.screen).toBe('S06')
    expect(s.data.p1.stats.attackPower).toBe(7)
    expect(s.data.p2).toEqual(createDefaultConfig('p2'))
  })

  it('IMPORT_PLAY は S01 だけ', () => {
    const s = reduceFlow(createSession(), { type: 'START' })
    expect(reduceFlow(s, { type: 'IMPORT_PLAY' })).toBe(s)
  })
})
