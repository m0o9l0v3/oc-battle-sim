// 持ち帰りURLの固定部分。仕様: docs/05-multiplayer/take-home-share.md §5
// 公開URLは、`location` から組み立てない（当日の画面は、親機のローカルサーバーから配信されるため）。
// ビルド時の環境変数 VITE_PUBLIC_URL で上書きできる（独自ドメインなど）。

/** GitHub Pages の固定URL（末尾は `/`） */
export const DEFAULT_PUBLIC_APP_URL = 'https://m0o9l0v3.github.io/oc-battle-sim/'

/** 持ち帰りURLの形式の識別子（バージョン 1） */
export const TAKE_HOME_PREFIX = 't1.'

/** QR（バイトモード・誤り訂正 M・バージョン 10）に入る最大のバイト数（take-home-share.md §7） */
export const QR_MAX_BYTES = 213

/** 実際に使う公開URL。ビルド時の環境変数 VITE_PUBLIC_URL（なければ既定） */
export const PUBLIC_APP_URL: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_URL) ||
  DEFAULT_PUBLIC_APP_URL
