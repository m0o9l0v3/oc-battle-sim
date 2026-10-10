// シードつきの疑似乱数（mulberry32）。同じシードから、同じ列（決定的）。
// バランス調整のボット（balance.ts）と、簡易CPU（cpu/）が使う。Math.random は使わない（frontend.md §4.3 D6）

/** 0 以上 1 未満の値を返す関数を作る */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
