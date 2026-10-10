// 持ち帰りカード（A4 縦 1 枚）の HTML。親機の印刷ステーションが iframe に読み込んで印刷する。
// 仕様: docs/05-multiplayer/take-home-print.md §8
//
// QR は親機で作る（SVG をそのまま埋め込む。外部への通信はしない）。学校ロゴ（server/assets/school-logo.jpg）は、
// data URI で埋め込む（印刷シートは、1 つの HTML で完結させる）
import { messages } from '../src/assets/messages.ts'
import { qrSvgPath } from '../src/share/index.ts'
import type { PrintJob } from './printQueue.ts'

const t = messages.print.sheet

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

export function renderPrintSheet(
  job: Pick<PrintJob, 'number' | 'url' | 'fighterName' | 'stageName'>,
  logoDataUri: string | null,
): string {
  const { total, d } = qrSvgPath(job.url)
  const logo = logoDataUri
    ? `<img class="logo" src="${escapeHtml(logoDataUri)}" alt="学校ロゴ" />`
    : ''
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<title>${escapeHtml(t.title)} ${job.number}</title>
<style>
  /* 余白 0 にすると、ブラウザが日時・URL のヘッダーとフッターを付けない。余白は本文で取る */
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #10131a; }
  body {
    font-family: 'Yu Gothic', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    position: relative;
    width: 210mm;
    height: 296mm;
    padding: 16mm 20mm 14mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
  }
  .number {
    position: absolute;
    top: 12mm;
    right: 14mm;
    min-width: 30mm;
    padding: 2mm 4mm;
    border: 0.6mm solid #003d70;
    border-radius: 3mm;
    text-align: center;
    color: #003d70;
  }
  .number small { display: block; font-size: 9pt; }
  .number strong { display: block; font-size: 28pt; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .logo { width: 82mm; height: auto; margin-top: 6mm; }
  .rule { width: 100%; border: 0; border-top: 0.4mm solid #003d70; margin: 7mm 0 6mm; }
  .heading { margin: 0; font-size: 14pt; font-weight: normal; letter-spacing: 0.2em; color: #8a8f99; }
  .qr { width: 92mm; height: 92mm; margin: 4mm 0; }
  .names { margin: 2mm 0 0; font-size: 13pt; text-align: center; }
  .names span { display: inline-block; margin: 0 4mm; }
  .names b { font-size: 15pt; }
  .lead { margin: 4mm 0 0; max-width: 150mm; font-size: 11pt; line-height: 1.6; text-align: center; }
  .url-label { margin: 6mm 0 1mm; font-size: 9pt; color: #555; }
  .url {
    margin: 0;
    max-width: 160mm;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 8.5pt;
    color: #555;
    text-align: center;
    word-break: break-all;
  }
  .note { position: absolute; bottom: 12mm; left: 0; right: 0; margin: 0; font-size: 9pt; color: #777; text-align: center; }
  @media screen {
    body { background: #e5e7eb; }
    .sheet { margin: 8mm auto; background: #fff; box-shadow: 0 1mm 4mm rgb(0 0 0 / 0.2); }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="number"><small>${escapeHtml(t.number)}</small><strong>${job.number}</strong></div>
  ${logo}
  <hr class="rule" />
  <p class="heading">${escapeHtml(t.qrHeading)}</p>
  <svg class="qr" role="img" aria-label="${escapeHtml(t.qrHeading)}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>
  <p class="names"><span>${escapeHtml(t.fighter)}: <b>${escapeHtml(job.fighterName)}</b></span><span>${escapeHtml(t.stage)}: <b>${escapeHtml(job.stageName)}</b></span></p>
  <p class="lead">${escapeHtml(t.lead)}</p>
  <p class="url-label">${escapeHtml(t.urlLabel)}</p>
  <p class="url">${escapeHtml(job.url)}</p>
  <p class="note">${escapeHtml(t.note)}</p>
</div>
</body>
</html>
`
}
