// 持ち帰りURLの組み立て。仕様: docs/05-multiplayer/take-home-share.md §5、§7
import type { CharacterConfig, StageData } from '../model/index.ts'
import { encodeTakeHome } from './codec.ts'
import { DEFAULT_PUBLIC_APP_URL, QR_MAX_BYTES, TAKE_HOME_PREFIX } from './config.ts'

/** 公開URL（`#` より前）に、持ち帰りのデータをつける。公開URLは、呼び出し側が固定の値を渡す（`location` から作らない） */
export function buildTakeHomeUrl(
  publicUrl: string,
  character: CharacterConfig,
  stage: StageData,
): string | null {
  const r = encodeTakeHome(character, stage)
  return r.ok ? `${publicUrl}#${TAKE_HOME_PREFIX}${r.payload}` : null
}

/** 最悪の長さの持ち帰りURL（名前が 30 バイト）。QR に入るか調べるために使う */
export const worstCaseUrlLength = (publicUrl: string = DEFAULT_PUBLIC_APP_URL): number => {
  // 欄 1〜9 の最大は 392 + 8 × 60 ビット = 872、チェックサム 16 → 888 ビット = 111 バイト = 148 文字
  return new TextEncoder().encode(publicUrl).length + 1 + TAKE_HOME_PREFIX.length + 148
}

/** 最悪の長さが QR の容量（バージョン 10・誤り訂正 M）に収まるか */
export const fitsInQr = (publicUrl: string = DEFAULT_PUBLIC_APP_URL): boolean =>
  worstCaseUrlLength(publicUrl) <= QR_MAX_BYTES
