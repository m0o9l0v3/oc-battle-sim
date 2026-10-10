// 持ち帰りURLの QR コード（モジュールの並び）。参加者PCの画面（ui/QrCode.tsx）と、親機の印刷シート（server/printSheet.ts）で使う。
// 外部への通信はしない（take-home-share.md §7）。DOM に依存しない
import qrcode from 'qrcode-generator'

/** 余白（クワイエットゾーン）のモジュール数 */
export const QR_QUIET_ZONE = 4

/** 誤り訂正 M。型番は自動（最悪の持ち帰りURLで、バージョン 10 = 57 モジュール） */
export function makeQr(text: string): { size: number; dark: (r: number, c: number) => boolean } {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) }
}

/** SVG の path（1 モジュール = 1 単位）と、余白を含めた一辺のモジュール数 */
export function qrSvgPath(text: string): { total: number; d: string } {
  const { size, dark } = makeQr(text)
  const total = size + QR_QUIET_ZONE * 2
  let d = ''
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (dark(r, c)) d += `M${c + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h1v1h-1z`
  return { total, d }
}
