// ビルド成果物（dist）に、外部の資源への参照がないことを調べる（test-plan.md §5.3、ui-design.md §10）。
// 使い方: npm run build && npm run check:dist
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 許可する参照の先頭。XML の名前空間の識別子（読み込まない）と、React のエラー文言に含まれる説明の URL（開かない） */
export const ALLOWED = ['http://www.w3.org/', 'https://react.dev/errors/']

const TEXT_EXT = /\.(html|js|mjs|css|json|svg|webmanifest|txt|map)$/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

/** 文字列の中の外部参照（http(s):// と、スキームを省いた //host の形）のうち、許可されないもの */
export function findExternalRefs(text) {
  const found = []
  // http(s):// は、どこにあっても。スキームを省いた //host は、引用符・括弧・= などの直後だけ（a//b のような式を除く）
  const re = /(?:https?:\/\/|(?<=["'`(=,\s])\/\/(?=[A-Za-z0-9[]))[A-Za-z0-9.:[\]-]+[^\s"'`)<>]*/g
  for (const m of text.matchAll(re)) {
    const url = m[0]
    if (!ALLOWED.some((a) => url.startsWith(a))) found.push(url)
  }
  return found
}

export function checkDist(dir) {
  const problems = []
  for (const file of walk(dir)) {
    if (!TEXT_EXT.test(file)) continue
    for (const url of findExternalRefs(readFileSync(file, 'utf8'))) problems.push({ file, url })
  }
  return problems
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = process.argv[2] ?? 'dist'
  const problems = checkDist(dir)
  if (problems.length > 0) {
    console.error(`外部の参照が見つかりました（${dir}）:`)
    for (const p of problems) console.error(`  ${p.file}: ${p.url}`)
    process.exit(1)
  }
  console.log(`外部の参照はありません（${dir}）`)
}
