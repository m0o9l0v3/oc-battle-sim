import { describe, expect, it } from 'vitest'
import { MAX_MATCHES, SESSION_STORAGE_KEY, type MatchRecord, type Stats } from '../model/index.ts'
import { presetStage } from '../stage/index.ts'
import { reduceFlow, type FlowAction } from './flow.ts'
import {
  boot,
  createRepository,
  hasResetFlag,
  readSessionData,
  readSnapshot,
  stripResetFlag,
  toSnapshot,
  type StorageLike,
} from './persist.ts'
import { createSession, sessionFromData, type Session } from './state.ts'

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

const run = (s: Session, ...a: FlowAction[]) => a.reduce(reduceFlow, s)
const win = { winner: 'p2', reason: 'timeup_damage' } as const
const stats = (attackPower: number, defense: number): Stats => ({
  attackPower,
  defense,
  jumpPower: 5,
  speed: 5,
})

/** 第 2 戦のあと（S11）まで進めたセッション */
function played(): Session {
  let s = run(
    createSession(),
    { type: 'START' },
    { type: 'NEXT' },
    { type: 'NEXT' },
    { type: 'CONFIRM_STAGE', stage: presetStage('tower'), presetId: 'tower' },
    { type: 'NEXT' },
    { type: 'BEGIN_MATCH' },
    { type: 'FINISH_MATCH', outcome: win, durationSec: 55 },
    { type: 'REDESIGN' },
  )
  s = reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, stats: stats(7, 3) } })
  return run(s, { type: 'BEGIN_MATCH' }, { type: 'FINISH_MATCH', outcome: win, durationSec: 61 })
}

describe('保存と復元', () => {
  it('保存して、読み直すと、同じ（設定・ステージ・戦の記録・画面）', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    const s = played()
    repo.save(toSnapshot(s))
    expect(storage.map.has(SESSION_STORAGE_KEY)).toBe(true)
    const loaded = repo.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.data).toEqual(s.data)
    expect(loaded!.data.matches).toHaveLength(2)
    expect(loaded!.data.screen).toBe('S11')
    // 保存のキーは 1 つだけ（ほかのキーを使わない）
    expect([...storage.map.keys()]).toEqual([SESSION_STORAGE_KEY])
  })

  it('sessionId を、データと同じ 1 つの値に入れて保存する', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    repo.save(toSnapshot(createSession(), 'abc'))
    expect(repo.load()!.sessionId).toBe('abc')
    repo.save(toSnapshot(createSession()))
    expect(repo.load()!.sessionId).toBeNull()
  })

  it('更新（再開）: 対戦中（S07・S10）だった場合は、S06 から。戦の記録・設定は保持', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    let s = played()
    s = run(s, { type: 'REDESIGN' })
    s = reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, stats: stats(4, 6) } })
    s = run(s, { type: 'BEGIN_MATCH' })
    expect(s.data.screen).toBe('S10')
    repo.save(toSnapshot(s))
    const { session } = boot(repo, '', createSession)
    expect(session.data.screen).toBe('S06')
    expect(session.data.matches).toHaveLength(2)
    expect(session.data.p1.stats).toEqual(stats(4, 6))
    expect(session.current).toBeNull()
  })

  it('S12 は、そのまま復元（見た目・能力値・ステージを保持。QR を再表示できる）', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    const s = run(played(), { type: 'END' })
    repo.save(toSnapshot(s))
    const { session } = boot(repo, '', createSession)
    expect(session.data.screen).toBe('S12')
    expect(session.data.stage.name).toBe('たかいとう')
    expect(session.data.p1.stats).toEqual(stats(7, 3))
  })

  it('編集中の画面（S03: 合計が 20 でない途中の値）も、保存・復元できる', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    let s = run(createSession(), { type: 'START' }, { type: 'NEXT' })
    s = reduceFlow(s, { type: 'SET_P1', config: { ...s.data.p1, stats: stats(2, 2) } }) // 合計 14
    repo.save(toSnapshot(s))
    expect(boot(repo, '', createSession).session.data.p1.stats).toEqual(stats(2, 2))
    // 編集中でない画面（S05）に、合計 14 の保存は、通らない
    const bad = { ...s, data: { ...s.data, screen: 'S05' as const } }
    repo.save(toSnapshot(bad))
    expect(repo.load()).toBeNull()
  })

  it('S06 で、2P の能力値を変えている途中（合計が 20 でない）も、復元できる', () => {
    const repo = createRepository(new MemoryStorage())
    let s = played()
    s = { ...s, data: { ...s.data, screen: 'S06' } }
    s = reduceFlow(s, { type: 'SET_P2', config: { ...s.data.p2, stats: stats(2, 2) } })
    repo.save(toSnapshot(s))
    expect(repo.load()!.data.p2.stats).toEqual(stats(2, 2))
  })
})

describe('S05 から S03 へ戻っている途中の印（returnToPractice）', () => {
  it('更新（再開）でも保たれる。S03 の「つぎへ」は、S05 へ戻る', () => {
    const repo = createRepository(new MemoryStorage())
    let s = run(
      createSession(),
      { type: 'START' },
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'CONFIRM_STAGE', stage: presetStage('standard'), presetId: 'standard' },
      { type: 'FIX_STATS' },
    )
    expect(s.data.screen).toBe('S03')
    expect(s.returnToPractice).toBe(true)
    repo.save(toSnapshot(s))
    const restored = boot(repo, '', createSession).session
    expect(restored.returnToPractice).toBe(true)
    expect(restored.data).toEqual(s.data) // 印は、data の中に入らない
    s = run(restored, { type: 'NEXT' })
    expect(s.data.screen).toBe('S05')
  })

  it('印がないとき（通常）は、保存に書かない。S03 以外の画面の印は、読み捨てる', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    repo.save(toSnapshot(played()))
    expect(storage.getItem(SESSION_STORAGE_KEY)).not.toContain('returnToPractice')
    const snap = JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)
    snap.data.returnToPractice = true
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snap))
    expect(boot(repo, '', createSession).session.returnToPractice).toBe(false)
  })
})

describe('戦の記録の指標（battle-report.md §6）', () => {
  const metrics = (n = 1) => ({
    stocksLeft: 2,
    damageDealt: 40.5,
    damageTaken: 10,
    hitsLanded: 3,
    attacksThrown: 9,
    kos: n,
    selfKos: 0,
    deaths: 1,
    maxDamageEndured: 55,
    recoverySuccess: 1,
    recoveryFailure: 0,
    jumps: 12,
    moveDistance: 31.2,
    avgKnockbackDistance: 2.5,
  })

  it('指標つきの戦の記録を、保存して、そのまま読み戻せる。指標のない記録も読める', () => {
    const repo = createRepository(new MemoryStorage())
    const s = played()
    const withMetrics = {
      ...s,
      data: {
        ...s.data,
        matches: s.data.matches.map((m, i) =>
          i === 0 ? { ...m, p1: metrics(), p2: { ...metrics(0), avgKnockbackDistance: null } } : m,
        ),
      },
    }
    repo.save(toSnapshot(withMetrics))
    const loaded = repo.load()!
    expect(loaded.data.matches[0]!.p1).toEqual(metrics())
    expect(loaded.data.matches[0]!.p2!.avgKnockbackDistance).toBeNull()
    expect(loaded.data.matches[1]!.p1).toBeUndefined()
  })

  it('壊れた指標は、保存全体を捨てる', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    repo.save(toSnapshot(played()))
    for (const bad of [{ ...metrics(), kos: -1 }, { ...metrics(), jumps: 'x' }, { jumps: 1 }, 5]) {
      const snap = JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)
      snap.data.matches[0].p1 = bad
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snap))
      expect(repo.load()).toBeNull()
    }
  })
})

describe('壊れた保存は、全体を捨てて S01 から', () => {
  const corrupt: Record<string, (d: Record<string, unknown>) => void> = {
    '見た目の ID が未知': (d) => {
      ;((d.p1 as Record<string, unknown>).appearance as Record<string, unknown>).body = 'b9'
    },
    ステージが検証に通らない: (d) => {
      const st = d.stage as { cells: number[][] }
      st.cells[0]![0] = 1
    },
    画面が未知: (d) => {
      d.screen = 'S99'
    },
    戦の記録の勝敗が壊れている: (d) => {
      ;(d.matches as { outcome: unknown }[])[0]!.outcome = { winner: 'x' }
    },
    戦の番号が昇順でない: (d) => {
      ;(d.matches as { matchNo: number }[])[1]!.matchNo = 1
    },
    戦の記録の設定が壊れている: (d) => {
      ;(d.matches as { p1Config: unknown }[])[0]!.p1Config = { name: 1 }
    },
    戦の数が上限を超える: (d) => {
      const m = (d.matches as unknown[])[0]
      d.matches = Array.from({ length: MAX_MATCHES + 1 }, (_, i) => ({
        ...(m as object),
        matchNo: i + 1,
      }))
    },
    'stagePresetId が数値': (d) => {
      d.stagePresetId = 5
    },
  }
  for (const [name, change] of Object.entries(corrupt)) {
    it(name, () => {
      const storage = new MemoryStorage()
      const repo = createRepository(storage)
      repo.save(toSnapshot(played()))
      const snap = JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!)
      change(snap.data)
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snap))
      expect(repo.load()).toBeNull()
      const { session } = boot(repo, '', createSession)
      expect(session).toEqual(createSession())
      expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull() // 壊れたデータは、残さない
    })
  }

  it('JSON でない、空、別の形、版が違う', () => {
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    for (const raw of [
      'not json',
      '',
      '[]',
      'null',
      '{"schemaVersion":2}',
      '{"schemaVersion":1,"sessionId":5,"data":{}}',
    ]) {
      storage.setItem(SESSION_STORAGE_KEY, raw)
      expect(repo.load(), raw).toBeNull()
    }
    expect(readSnapshot(undefined)).toBeNull()
    expect(readSessionData(42)).toBeNull()
  })
})

describe('保存が使えないとき（体験を止めない）', () => {
  it('storage がない環境: 保存・読み込み・破棄は、何も起きない（例外を投げない）', () => {
    const repo = createRepository(undefined)
    expect(() => repo.save(toSnapshot(createSession()))).not.toThrow()
    expect(repo.load()).toBeNull()
    expect(() => repo.clear()).not.toThrow()
    expect(boot(repo, '', createSession).session).toEqual(createSession())
  })

  it('例外を投げる storage（無効化・プライベートブラウズ）でも、投げない。記録は、log に出る', () => {
    const logs: unknown[] = []
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const repo = createRepository(broken, (e) => logs.push(e))
    expect(() => repo.save(toSnapshot(createSession()))).not.toThrow()
    expect(repo.load()).toBeNull()
    expect(() => repo.clear()).not.toThrow()
    expect(logs.length).toBeGreaterThanOrEqual(3)
  })

  it('容量超過: 戦の古いものを減らして、1 回だけ再試行する。それでも失敗なら、諦める', () => {
    const storage = new MemoryStorage()
    let calls = 0
    const quota: StorageLike = {
      getItem: (k) => storage.getItem(k),
      removeItem: (k) => storage.removeItem(k),
      setItem: (k, v) => {
        calls++
        if (v.length > 10000) throw new DOMException('full', 'QuotaExceededError')
        storage.setItem(k, v)
      },
    }
    const repo = createRepository(quota)
    // 大きくなるまで戦を足す
    let s = played()
    const match = s.data.matches[0] as MatchRecord
    const many = Array.from({ length: 8 }, (_, i) => ({ ...match, matchNo: i + 1 }))
    s = { ...s, data: { ...s.data, matches: many } }
    expect(JSON.stringify(toSnapshot(s)).length).toBeGreaterThan(10000)
    repo.save(toSnapshot(s))
    expect(calls).toBe(2)
    const loaded = repo.load()
    expect(loaded!.data.matches.length).toBeLessThan(8)
    expect(loaded!.data.matches.at(-1)!.matchNo).toBe(8) // 新しいほうを残す
    // 半分にしても入らなければ、諦める（例外なし）
    const always: StorageLike = {
      ...quota,
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(() => createRepository(always).save(toSnapshot(s))).not.toThrow()
  })
})

describe('?reset（個別リセット）', () => {
  it('判定: ?reset があるときだけ。復元より前に、保存を破棄して S01 から', () => {
    expect(hasResetFlag('?reset')).toBe(true)
    expect(hasResetFlag('?dev&reset=1')).toBe(true)
    expect(hasResetFlag('?resetting')).toBe(false)
    expect(hasResetFlag('')).toBe(false)
    const storage = new MemoryStorage()
    const repo = createRepository(storage)
    repo.save(toSnapshot(played()))
    const r = boot(repo, '?reset', createSession)
    expect(r.resetDone).toBe(true)
    expect(r.session).toEqual(createSession())
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('URL から reset を取り除く（残すと、次の更新が、またリセットになる）。ほかの検索は残す', () => {
    expect(stripResetFlag('?reset')).toBe('')
    expect(stripResetFlag('?reset&dev')).toBe('?dev')
    expect(stripResetFlag('?perf&reset=1&dev')).toBe('?perf&dev')
    expect(stripResetFlag('')).toBe('')
  })

  it('?reset がなければ、保存を復元する', () => {
    const repo = createRepository(new MemoryStorage())
    const s = played()
    repo.save(toSnapshot(s))
    const r = boot(repo, '?dev', createSession)
    expect(r.resetDone).toBe(false)
    expect(r.session).toEqual(sessionFromData(s.data))
  })
})
