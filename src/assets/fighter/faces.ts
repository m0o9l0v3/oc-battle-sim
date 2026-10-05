// 顔 6 種（f1〜f6）と、全員共通の表情 3 種（攻撃・やられ・撃墜）。
// 顔の空間: 中心が原点（0, 0）、おおよそ 幅 ±14、高さ ±10。体型ごとの置く位置・大きさは、BodyDef.face。
// 目・口の形と大きさの差で、表情として読み取れるようにする（character-design.md §7.1）。
import type { ExpressionId, FaceId, Part, Shape } from './types.ts'

const line = (d: string, sw = 1.8): Shape => ({ d, fill: 'none', stroke: 'outline', sw })
const dark = (d: string): Shape => ({ d, fill: 'eye' })
const white = (d: string): Shape => ({ d, fill: 'white' })
const cheek = (d: string): Shape => ({ d, fill: 'cheek' })
const part = (...shapes: Shape[]): Part => ({ shapes })

/** 左右の目（楕円に近い、ゆがんだ形）。cx、cy が中心。w、h が大きさ */
const eyeWhite = (cx: number, cy: number, w: number, h: number) =>
  `M ${cx - w},${cy} C ${cx - w},${cy - h * 1.2} ${cx + w},${cy - h * 1.2} ${cx + w},${cy} C ${cx + w},${cy + h} ${cx - w},${cy + h} ${cx - w},${cy} Z`
const pupil = (cx: number, cy: number, r: number) =>
  `M ${cx - r},${cy} C ${cx - r},${cy - r * 1.3} ${cx + r},${cy - r * 1.3} ${cx + r},${cy} C ${cx + r},${cy + r * 1.1} ${cx - r},${cy + r * 1.1} ${cx - r},${cy} Z`
const glint = (cx: number, cy: number) =>
  `M ${cx - 0.9},${cy} C ${cx - 0.9},${cy - 1.2} ${cx + 0.9},${cy - 1.2} ${cx + 0.9},${cy} C ${cx + 0.9},${cy + 1.2} ${cx - 0.9},${cy + 1.2} ${cx - 0.9},${cy} Z`

export const FACES: Record<FaceId, { name: string; part: Part }> = {
  // 元気: 大きな目と、ひらいた口
  f1: {
    name: 'げんき',
    part: part(
      { ...white(eyeWhite(-7, -2, 4.4, 4.8)), stroke: 'outline', sw: 1.4 },
      { ...white(eyeWhite(7, -2, 4.4, 4.8)), stroke: 'outline', sw: 1.4 },
      dark(pupil(-6.6, -1.6, 2.5)),
      dark(pupil(7.4, -1.6, 2.5)),
      white(glint(-5.8, -2.8)),
      white(glint(8.2, -2.8)),
      line('M -11,-9 C -9,-11 -5,-11 -3,-9', 1.5),
      line('M 3,-9 C 5,-11 9,-11 11,-9', 1.5),
      { d: 'M -5,4.5 C -4,10.5 4,10.5 5,4.5 Z', fill: 'eye', stroke: 'outline', sw: 1.2 },
      cheek('M -3,8 C -2,10 2,10 3,8 C 1,7 -1,7 -3,8 Z'),
      cheek('M -14,3 C -14,0.5 -10,0.5 -10,3 C -10,5.5 -14,5.5 -14,3 Z'),
      cheek('M 10,3 C 10,0.5 14,0.5 14,3 C 14,5.5 10,5.5 10,3 Z'),
    ),
  },
  // にやり: 半分とじた目と、ななめの口
  f2: {
    name: 'にやり',
    part: part(
      {
        ...white('M -11,-3 C -9,-5.5 -5,-5.5 -3,-3 C -4,0.5 -10,0.5 -11,-3 Z'),
        stroke: 'outline',
        sw: 1.3,
      },
      {
        ...white('M 3,-3 C 5,-5.5 9,-5.5 11,-3 C 10,0.5 4,0.5 3,-3 Z'),
        stroke: 'outline',
        sw: 1.3,
      },
      dark(pupil(-6, -2.2, 1.9)),
      dark(pupil(8, -2.2, 1.9)),
      line('M -12,-4.5 C -9,-6.5 -5,-6.5 -2,-4.5', 2),
      line('M 2,-4.5 C 5,-6.5 9,-6.5 12,-4.5', 2),
      line('M -5,5 C -1,8.5 5,8.5 8,3', 1.8),
      line('M 8,3 L 9.5,1.8', 1.5),
      cheek('M -14,3 C -14,0.5 -10,0.5 -10,3 C -10,5.5 -14,5.5 -14,3 Z'),
    ),
  },
  // きりっ: つり上がったまゆと、まっすぐな口
  f3: {
    name: 'きりっ',
    part: part(
      {
        ...white('M -11,-2.5 C -9,-5 -5,-5 -3,-2.5 C -3,1 -11,1 -11,-2.5 Z'),
        stroke: 'outline',
        sw: 1.3,
      },
      { ...white('M 3,-2.5 C 5,-5 9,-5 11,-2.5 C 11,1 3,1 3,-2.5 Z'), stroke: 'outline', sw: 1.3 },
      dark(pupil(-5.2, -1.8, 2.1)),
      dark(pupil(8.6, -1.8, 2.1)),
      line('M -12.5,-9.5 L -3,-5.8', 2.6),
      line('M 12.5,-9.5 L 3,-5.8', 2.6),
      line('M -4,6.5 L 5,6.5', 2),
    ),
  },
  // のんびり: とじた目（弧）と、小さな笑顔
  f4: {
    name: 'のんびり',
    part: part(
      line('M -11,-1 C -9.5,-5.5 -5.5,-5.5 -4,-1', 2),
      line('M 4,-1 C 5.5,-5.5 9.5,-5.5 11,-1', 2),
      line('M -3.5,5 C -2,8 2,8 3.5,5', 1.8),
      cheek('M -14,3 C -14,0.5 -10,0.5 -10,3 C -10,5.5 -14,5.5 -14,3 Z'),
      cheek('M 10,3 C 10,0.5 14,0.5 14,3 C 14,5.5 10,5.5 10,3 Z'),
    ),
  },
  // びっくり: 大きく見ひらいた目と、小さな黒目、まるい口
  f5: {
    name: 'びっくり',
    part: part(
      { ...white(eyeWhite(-7, -2, 5.2, 5.6)), stroke: 'outline', sw: 1.4 },
      { ...white(eyeWhite(7, -2, 5.2, 5.6)), stroke: 'outline', sw: 1.4 },
      dark(pupil(-7, -2, 1.5)),
      dark(pupil(7, -2, 1.5)),
      line('M -12,-10.5 C -9.5,-13 -5,-13 -2.5,-10.5', 1.5),
      line('M 2.5,-10.5 C 5,-13 9.5,-13 12,-10.5', 1.5),
      {
        d: 'M -2.6,5.5 C -2.6,3.5 2.6,3.5 2.6,5.5 C 2.6,9.5 -2.6,9.5 -2.6,5.5 Z',
        fill: 'eye',
        stroke: 'outline',
        sw: 1.2,
      },
    ),
  },
  // ねむそう: 重いまぶたと、小さな口
  f6: {
    name: 'ねむそう',
    part: part(
      {
        ...white('M -11,-3 C -9,-4.5 -5,-4.5 -3,-3 C -4,0 -10,0 -11,-3 Z'),
        stroke: 'outline',
        sw: 1.2,
      },
      { ...white('M 3,-3 C 5,-4.5 9,-4.5 11,-3 C 10,0 4,0 3,-3 Z'), stroke: 'outline', sw: 1.2 },
      dark(pupil(-6.5, -1.5, 1.6)),
      dark(pupil(7.5, -1.5, 1.6)),
      {
        d: 'M -12,-3.2 C -9,-6.5 -5,-6.5 -2,-3.2 L -2,-2.6 C -5,-4.2 -9,-4.2 -12,-2.6 Z',
        fill: 'skin',
        stroke: 'outline',
        sw: 1.4,
      },
      {
        d: 'M 2,-3.2 C 5,-6.5 9,-6.5 12,-3.2 L 12,-2.6 C 9,-4.2 5,-4.2 2,-2.6 Z',
        fill: 'skin',
        stroke: 'outline',
        sw: 1.4,
      },
      line('M -3,6.5 C -1,5.5 1,5.5 3,6.5', 1.6),
      cheek('M 10,3 C 10,0.5 14,0.5 14,3 C 14,5.5 10,5.5 10,3 Z'),
    ),
  },
}

/** 全員共通の表情。通常の顔の位置・大きさに重ねる（character-design.md §4.3） */
export const EXPRESSIONS: Record<ExpressionId, { name: string; part: Part }> = {
  // 攻撃: 気合の入った目と、大きく開いた口
  attack: {
    name: 'こうげき',
    part: part(
      {
        ...white('M -11,-2 C -9,-4.5 -5,-4.5 -3,-2 C -3,1.5 -11,1.5 -11,-2 Z'),
        stroke: 'outline',
        sw: 1.3,
      },
      {
        ...white('M 3,-2 C 5,-4.5 9,-4.5 11,-2 C 11,1.5 3,1.5 3,-2 Z'),
        stroke: 'outline',
        sw: 1.3,
      },
      dark(pupil(-5.5, -1.5, 2.2)),
      dark(pupil(8.5, -1.5, 2.2)),
      line('M -13,-10 L -3,-5.5', 2.8),
      line('M 13,-10 L 3,-5.5', 2.8),
      {
        d: 'M -6,4 C -5,12 5,12 6,4 C 2,5.5 -2,5.5 -6,4 Z',
        fill: 'eye',
        stroke: 'outline',
        sw: 1.3,
      },
      { d: 'M -2.5,9 C -1,7.5 1,7.5 2.5,9 C 1,11 -1,11 -2.5,9 Z', fill: 'cheek' },
    ),
  },
  // やられ: ぎゅっとつぶった目（> <）と、ゆがんだ口
  hit: {
    name: 'やられ',
    part: part(
      line('M -11.5,-5.5 L -5.5,-2 L -11.5,1.5', 2.2),
      line('M 11.5,-5.5 L 5.5,-2 L 11.5,1.5', 2.2),
      line('M -5,7.5 C -3,4.5 -1,9.5 1,6.5 C 3,4 4,9 6,6', 1.8),
      {
        d: 'M 13,-8 C 12,-5 15,-5 14,-8 C 14,-9.5 13,-9.5 13,-8 Z',
        fill: 'glass',
        stroke: 'outline',
        sw: 1.2,
      },
    ),
  },
  // 撃墜: ×の目と、舌を出した口
  ko: {
    name: 'ダウン',
    part: part(
      line('M -11,-5 L -4,1.5 M -4,-5 L -11,1.5', 2.2),
      line('M 4,-5 L 11,1.5 M 11,-5 L 4,1.5', 2.2),
      {
        d: 'M -4,5.5 L 4,5.5 L 4,9 C 4,12.5 -0.5,13 -1,10.5 C -1.5,13 -4,12.5 -4,9 Z',
        fill: 'cheek',
        stroke: 'outline',
        sw: 1.3,
      },
      line('M -4,5.5 L 4,5.5', 1.8),
    ),
  },
}
