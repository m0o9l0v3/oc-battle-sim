import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 持ち帰りURLの公開URL（VITE_PUBLIC_URL）の長さの上限。最悪の持ち帰りURL（公開URL + `#t1.` + 148 文字）が、
// QR（バイトモード・誤り訂正 M・バージョン 10）の容量 213 バイトに収まること（docs/05-multiplayer/take-home-share.md §7）
const QR_MAX_BYTES = 213
const TAKE_HOME_SUFFIX_BYTES = '#t1.'.length + 148
const publicUrl = process.env.VITE_PUBLIC_URL
if (publicUrl && Buffer.byteLength(publicUrl) + TAKE_HOME_SUFFIX_BYTES > QR_MAX_BYTES) {
  throw new Error(
    `VITE_PUBLIC_URL が長すぎます（${Buffer.byteLength(publicUrl)} バイト。上限 ${QR_MAX_BYTES - TAKE_HOME_SUFFIX_BYTES}）。持ち帰り QR に収まりません`,
  )
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス配下で配信されるため、CI から BASE_PATH を渡す
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
