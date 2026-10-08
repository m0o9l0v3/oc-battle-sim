// QR コードの表示（SVG）。参加者PC上で生成する。外部への通信はしない（take-home-share.md §7）
import qrcode from 'qrcode-generator'
import { QR_COLORS } from '../assets/index.ts'

/** 誤り訂正 M。型番は自動（最悪の持ち帰りURLで、バージョン 10 = 57 モジュール） */
export function makeQr(text: string): { size: number; dark: (r: number, c: number) => boolean } {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) }
}

/** 余白（クワイエットゾーン）は 4 モジュール。色は、画面のテーマに関わらず、白地に黒（読み取りのため） */
export function QrCode({ text, label, px = 360 }: { text: string; label: string; px?: number }) {
  const { size, dark } = makeQr(text)
  const quiet = 4
  const total = size + quiet * 2
  let d = ''
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (dark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      width={px}
      height={px}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill={QR_COLORS.light} />
      <path d={d} fill={QR_COLORS.dark} />
    </svg>
  )
}
