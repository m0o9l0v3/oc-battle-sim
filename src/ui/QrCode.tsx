// QR コードの表示（SVG）。参加者PC上で生成する。外部への通信はしない（take-home-share.md §7）
import { QR_COLORS } from '../assets/index.ts'
import { qrSvgPath } from '../share/index.ts'

/** 余白（クワイエットゾーン）は 4 モジュール。色は、画面のテーマに関わらず、白地に黒（読み取りのため） */
export function QrCode({ text, label, px = 360 }: { text: string; label: string; px?: number }) {
  const { total, d } = qrSvgPath(text)
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
