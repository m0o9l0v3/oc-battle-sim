// パーツを重ねて、ファイター1体を、SVG として組み立てる（静的な表示用。S02 のプレビュー、素材の確認）。
// アニメーション（#29）は、同じパーツ・同じ関節・同じ親子関係を使う:
//   root > legB、legF、torso > armB、head（> face）、armF
// 重ね順（奥 → 手前）: 背中のアクセサリー → 奥の腕 → 奥の脚 → 胴体 → 手前の脚 → 頭 → 顔 → 手前の腕 → 頭・顔・首のアクセサリー
// （character-design.md §4.2）。
import { ACCESSORIES } from './accessories.ts'
import { BODIES } from './bodies.ts'
import { EXPRESSIONS, FACES } from './faces.ts'
import { FIXED_COLORS, OUTLINE_WIDTH, PALETTES } from './palette.ts'
import type {
  AccessoryId,
  BodyId,
  ColorId,
  ExpressionId,
  FaceId,
  Paint,
  Part,
  Shape,
} from './types.ts'

/** 外観の選択（CharacterConfig.appearance で検証済みのID） */
export type FighterLook = {
  body: BodyId
  face: FaceId
  color: ColorId
  accessory: AccessoryId | null
}

/** 動かす値。0 が基準（拡大縮小は 1）。角度は度。0° は真下、正は前方（animation.md §4.2） */
export type PartTransform = { dx?: number; dy?: number; rot?: number; sx?: number; sy?: number }

export type PoseInput = Partial<
  Record<'root' | 'torso' | 'head' | 'armF' | 'armB' | 'legF' | 'legB', PartTransform>
> & { face?: 'normal' | ExpressionId }

const round = (n: number) => Math.round(n * 100) / 100

/** 塗りの種類 → 色 */
export function paintColor(paint: Paint, color: ColorId): string {
  if (paint === 'none') return 'none'
  if (paint === 'primary' || paint === 'secondary' || paint === 'accent')
    return PALETTES[color][paint]
  return FIXED_COLORS[paint]
}

function shapeSvg(s: Shape, color: ColorId): string {
  const fill = paintColor(s.fill, color)
  const stroke = s.stroke
    ? ` stroke="${paintColor(s.stroke, color)}" stroke-width="${s.sw ?? OUTLINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"`
    : ''
  return `<path d="${s.d}" fill="${fill}"${stroke}/>`
}

/** パーツ1点（形のまとまり）の SVG。ローカル座標のまま（関節が原点） */
export function partSvg(part: Part, color: ColorId): string {
  return part.shapes.map((s) => shapeSvg(s, color)).join('')
}

/** 部位の変換を、関節を中心に（親の座標で）かける。at は、親の座標での関節の位置 */
function place(
  at: { x: number; y: number },
  t: PartTransform | undefined,
  inner: string,
  extra = '',
): string {
  const parts = [`translate(${round(at.x + (t?.dx ?? 0))} ${round(at.y - (t?.dy ?? 0))})`]
  if (t?.rot) parts.push(`rotate(${round(-t.rot)})`) // 正の角度は前方（右）へ振る。SVG の rotate は時計回りが正
  if (t?.sx !== undefined || t?.sy !== undefined) parts.push(`scale(${t?.sx ?? 1} ${t?.sy ?? 1})`)
  return `<g transform="${parts.join(' ')}"${extra}>${inner}</g>`
}

/** 腕・脚の、奥側の暗さ（陰影を重ねる） */
const backOverlay = (part: Part): string =>
  part.shapes
    .filter((s) => s.fill !== 'shade' && s.fill !== 'light' && s.fill !== 'none')
    .map((s) => `<path d="${s.d}" fill="${FIXED_COLORS.shade}"/>`)
    .join('')

/** 基準のポーズ（animation.md §4.4）。腕・脚の、少し開いた垂れ方 */
const NEUTRAL: Required<Pick<PoseInput, 'armF' | 'armB' | 'legF' | 'legB'>> = {
  armF: { rot: 4 },
  armB: { rot: -4 },
  legF: { rot: 3 },
  legB: { rot: -3 },
}

export type ComposeOptions = {
  appearance: FighterLook
  pose?: PoseInput
  /** viewBox の余白（身長 100 に対して）。既定 14（頭の上の帽子・リボンなどが切れない） */
  margin?: number
  /** 向き。-1 で、左向き（左右反転） */
  facing?: 1 | -1
}

/** ファイター1体の SVG の中身（<g>）。viewBox は、-50 -6 100 112 が基準（幅 100、足元まで） */
export function composeFighterBody(opts: ComposeOptions): string {
  const { appearance: a, pose = {} } = opts
  const body = BODIES[a.body]
  const c = a.color
  const t = (
    k: 'root' | 'torso' | 'head' | 'armF' | 'armB' | 'legF' | 'legB',
  ): PartTransform | undefined => {
    const n = (NEUTRAL as Partial<Record<string, PartTransform>>)[k]
    const p = pose[k]
    return n || p ? { ...n, ...p, rot: (n?.rot ?? 0) + (p?.rot ?? 0) } : undefined
  }

  const accessory = a.accessory ? ACCESSORIES[a.accessory] : null
  const anchor = accessory ? body.anchors[accessory.slot] : null
  const accSvg =
    accessory && anchor
      ? `<g transform="translate(${anchor.x} ${anchor.y}) scale(${anchor.s})">${partSvg(accessory.part, c)}</g>`
      : ''
  const slot = accessory?.slot

  const faceId = pose.face ?? 'normal'
  const facePart = faceId === 'normal' ? FACES[a.face].part : EXPRESSIONS[faceId].part
  const faceSvg = `<g transform="translate(${body.face.x} ${body.face.y}) scale(${body.face.s})">${partSvg(facePart, c)}</g>`

  const armF = place(body.at.armF, t('armF'), partSvg(body.arm, c))
  const armB = place(body.at.armB, t('armB'), partSvg(body.arm, c) + backOverlay(body.arm))

  // 頭（顔と、頭・顔のスロットのアクセサリー）。頭のアクセサリーは、頭に付いて動く
  const headInner =
    partSvg(body.head, c) + faceSvg + (slot === 'head' || slot === 'face' ? accSvg : '')
  const head = place(body.at.head, t('head'), headInner)

  // 胴体: 背中のアクセサリー → 奥の腕 → 胴体 → 頭 → 手前の腕 → 首のアクセサリー
  const torsoInner =
    (slot === 'back' ? accSvg : '') +
    armB +
    partSvg(body.torso, c) +
    head +
    armF +
    (slot === 'neck' ? accSvg : '')
  const torso = place(body.at.torso, t('torso'), torsoInner)

  const legB = place(body.at.legB, t('legB'), partSvg(body.leg, c) + backOverlay(body.leg))
  const legF = place(body.at.legF, t('legF'), partSvg(body.leg, c))

  const root = t('root')
  const flip = opts.facing === -1 ? ' scale(-1 1)' : ''
  const rootT = `translate(0 ${round(100 - (root?.dy ?? 0))}) translate(${round(root?.dx ?? 0)} 0)${flip}${
    root?.sx !== undefined || root?.sy !== undefined
      ? ` scale(${root?.sx ?? 1} ${root?.sy ?? 1})`
      : ''
  } translate(0 -100)`
  return `<g transform="${rootT}">${legB}${torso}${legF}</g>`
}

/** ファイター1体の、単独の SVG（プレビュー・素材の確認用） */
export function fighterSvg(opts: ComposeOptions, size = 200): string {
  const m = opts.margin ?? 14
  const w = 100 + m * 2
  const h = 100 + m * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-50 - m} ${-m} ${w} ${h}" width="${size}" height="${round((size * h) / w)}" role="img">${composeFighterBody(opts)}</svg>`
}

/** パーツ1点だけの SVG（素材の一覧・確認用）。関節（原点）を、十字で示す */
export function partPreviewSvg(part: Part, color: ColorId, size = 120, joint = true): string {
  const cross = joint
    ? '<path d="M -3,0 L 3,0 M 0,-3 L 0,3" stroke="#e0245e" stroke-width="0.8" fill="none"/>'
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -50 80 100" width="${size}" height="${round(size * 1.25)}" role="img">${partSvg(part, color)}${cross}</svg>`
}
