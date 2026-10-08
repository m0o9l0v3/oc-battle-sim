// 接続中の参加者PCの台数（目安）。参加者PCを識別しないため、進行状態の取得の回数を、匿名で数える（event-control.md §11）。
// アドレスなど、台を見分ける情報は、記録しない。参加者PCは、つながっている間、1 秒に 1 回取得する（§8.2）

/** 数える期間 */
const WINDOW_MS = 5000
/** 参加者PCの取得の間隔（event-control.md §8.2） */
const POLL_INTERVAL_MS = 1000

export interface ClientCounter {
  /** 進行状態の取得を 1 回数える */
  hit(now: number): void
  /** 直近の取得の回数から見積もった、接続中の台数 */
  estimate(now: number): number
}

export function createClientCounter(): ClientCounter {
  // 取得の時刻だけを持つ（古い順）
  let times: number[] = []
  const prune = (now: number) => {
    const from = now - WINDOW_MS
    let i = 0
    while (i < times.length && times[i]! <= from) i++
    if (i > 0) times = times.slice(i)
  }
  return {
    hit(now) {
      times.push(now)
      prune(now)
    },
    estimate(now) {
      prune(now)
      return Math.round(times.length / (WINDOW_MS / POLL_INTERVAL_MS))
    },
  }
}
