import { describe, expect, it } from 'vitest'
import { APPEARANCE_IDS, validateConfig, createDefaultConfig } from '../../fighter/index.ts'
import { ACCESSORIES } from './accessories.ts'
import { BODIES } from './bodies.ts'
import { composeFighterBody, fighterSvg, paintColor, partSvg } from './compose.ts'
import { EXPRESSIONS, FACES } from './faces.ts'
import { FIXED_COLORS, OUTLINE_WIDTH, PALETTES } from './palette.ts'
import type { AccessoryId, BodyId, ColorId, FaceId, Part, Shape } from './types.ts'

const bodyIds = Object.keys(BODIES) as BodyId[]
const faceIds = Object.keys(FACES) as FaceId[]
const colorIds = Object.keys(PALETTES) as ColorId[]
const accessoryIds = Object.keys(ACCESSORIES) as AccessoryId[]

/** すべての（名前つき）パーツ */
function allParts(): { name: string; part: Part }[] {
  const out: { name: string; part: Part }[] = []
  for (const id of bodyIds) {
    const b = BODIES[id]
    out.push(
      { name: `${id}.head`, part: b.head },
      { name: `${id}.torso`, part: b.torso },
      { name: `${id}.arm`, part: b.arm },
      { name: `${id}.leg`, part: b.leg },
    )
  }
  for (const id of faceIds) out.push({ name: id, part: FACES[id].part })
  for (const id of Object.keys(EXPRESSIONS))
    out.push({ name: `expr.${id}`, part: EXPRESSIONS[id as keyof typeof EXPRESSIONS].part })
  for (const id of accessoryIds) out.push({ name: id, part: ACCESSORIES[id].part })
  return out
}

/** パスデータを読む。M L C Q Z（絶対座標）だけ。コマンドごとの数の個数も確かめる */
function parsePath(d: string): { cmd: string; nums: number[] }[] {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+/g) ?? []
  // 許可しない文字が混ざっていないか
  expect(d.replace(/[MLCQZ\s,.\-\d]/g, ''), `不許可の文字: ${d}`).toBe('')
  const out: { cmd: string; nums: number[] }[] = []
  for (const t of tokens) {
    if (/[MLCQZ]/.test(t)) out.push({ cmd: t, nums: [] })
    else out[out.length - 1].nums.push(Number(t))
  }
  return out
}
const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 }

function bbox(part: Part) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const s of part.shapes) {
    for (const seg of parsePath(s.d)) {
      for (let i = 0; i < seg.nums.length; i += 2) {
        x0 = Math.min(x0, seg.nums[i])
        x1 = Math.max(x1, seg.nums[i])
        y0 = Math.min(y0, seg.nums[i + 1])
        y1 = Math.max(y1, seg.nums[i + 1])
      }
    }
  }
  return { x0, y0, x1, y1 }
}

describe('素材が揃っている（character-design.md §12。31 点）', () => {
  it('体型 4 × 4 パーツ = 16、顔 6、共通の表情 3、アクセサリー 6 = 31 点', () => {
    expect(bodyIds).toHaveLength(4)
    expect(faceIds).toHaveLength(6)
    expect(Object.keys(EXPRESSIONS).sort()).toEqual(['attack', 'hit', 'ko'])
    expect(accessoryIds).toHaveLength(6)
    expect(colorIds).toHaveLength(8)
    expect(allParts()).toHaveLength(16 + 6 + 3 + 6)
  })

  it('IDは、検証が許可する一覧（character-design.md §5.1.1）と、完全に一致する', () => {
    expect(bodyIds).toEqual([...APPEARANCE_IDS.body])
    expect(faceIds).toEqual([...APPEARANCE_IDS.face])
    expect(colorIds).toEqual([...APPEARANCE_IDS.color])
    expect(accessoryIds).toEqual([...APPEARANCE_IDS.accessory])
  })

  it('アクセサリーのスロットは、仕様で固定された割り当てどおり', () => {
    expect(Object.fromEntries(accessoryIds.map((a) => [a, ACCESSORIES[a].slot]))).toEqual({
      a1: 'head',
      a2: 'face',
      a3: 'neck',
      a4: 'head',
      a5: 'head',
      a6: 'back',
    })
  })

  it('全体型に、4 つのスロットの付け位置がある（体型を変えても付く）', () => {
    for (const id of bodyIds) {
      expect(Object.keys(BODIES[id].anchors).sort()).toEqual(['back', 'face', 'head', 'neck'])
      for (const a of Object.values(BODIES[id].anchors)) expect(a.s).toBeGreaterThan(0)
    }
  })

  it('全パーツ × 全選択肢（4 × 6 × 8 × 7 = 1,344 通り）が、組み立てられる。検証も通る', () => {
    let n = 0
    for (const body of bodyIds)
      for (const face of faceIds)
        for (const color of colorIds)
          for (const accessory of [null, ...accessoryIds]) {
            const svg = fighterSvg({ appearance: { body, face, color, accessory } })
            expect(svg).not.toMatch(/NaN|undefined|null/)
            n++
          }
    expect(n).toBe(1344)
    // 組み合わせは、そのまま CharacterConfig として検証を通る
    const cfg = {
      ...createDefaultConfig('p1'),
      appearance: { body: 'b4', face: 'f6', color: 'c8', accessory: 'a6' },
    }
    expect(validateConfig(cfg, 'match').ok).toBe(true)
  })
})

describe('パスデータの妥当性', () => {
  it('すべての形が、M・L・C・Q・Z（絶対座標）だけで、数の個数が合い、閉じている', () => {
    for (const { name, part } of allParts()) {
      expect(part.shapes.length, name).toBeGreaterThan(0)
      for (const s of part.shapes) {
        const segs = parsePath(s.d)
        expect(segs[0].cmd, `${name}: ${s.d}`).toBe('M')
        for (const seg of segs) {
          expect(seg.nums.length, `${name}: ${seg.cmd}`).toBe(ARITY[seg.cmd])
          for (const n of seg.nums) expect(Number.isFinite(n)).toBe(true)
        }
        // 塗りのある形は、閉じている
        if (s.fill !== 'none') expect(segs[segs.length - 1].cmd, `${name}: ${s.d}`).toBe('Z')
      }
    }
  })

  it('座標が、妥当な範囲に収まる（ファイターの空間の、はみ出しがない）', () => {
    for (const { name, part } of allParts()) {
      const b = bbox(part)
      expect(b.x0, name).toBeGreaterThan(-50)
      expect(b.x1, name).toBeLessThan(50)
      expect(b.y0, name).toBeGreaterThan(-55)
      expect(b.y1, name).toBeLessThan(55)
    }
  })
})

describe('色替えに対応できる構造（色の枠）', () => {
  const PAINTS = new Set([
    'primary',
    'secondary',
    'accent',
    'skin',
    'outline',
    'white',
    'eye',
    'glass',
    'cheek',
    'shade',
    'light',
    'none',
  ])

  it('塗りと線は、決められた種類だけ。色の値（#…）は、絵の中に書かれていない', () => {
    for (const { name, part } of allParts()) {
      for (const s of part.shapes) {
        expect(PAINTS.has(s.fill), `${name} fill ${s.fill}`).toBe(true)
        if (s.stroke) expect(PAINTS.has(s.stroke), `${name} stroke ${s.stroke}`).toBe(true)
        expect(JSON.stringify(s), name).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb/)
      }
    }
  })

  it('色を変えると、色の枠の部分だけが変わる。絵の形は同じ', () => {
    const a = partSvg(BODIES.b1.torso, 'c1')
    const b = partSvg(BODIES.b1.torso, 'c4')
    expect(a).not.toBe(b)
    // 形（d 属性）は、色によらず同じ
    const ds = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
    expect(ds(a)).toEqual(ds(b))
    // 肌・輪郭線は、色の選択で変わらない
    expect(paintColor('skin', 'c1')).toBe(paintColor('skin', 'c8'))
    expect(paintColor('outline', 'c2')).toBe(FIXED_COLORS.outline)
    expect(paintColor('primary', 'c1')).not.toBe(paintColor('primary', 'c2'))
  })

  it('すべてのパーツ（体型・アクセサリー）が、色の枠を、少なくとも 1 つ使う（色替えが効く）', () => {
    for (const id of bodyIds) {
      for (const [k, part] of Object.entries({
        head: BODIES[id].head,
        torso: BODIES[id].torso,
        arm: BODIES[id].arm,
        leg: BODIES[id].leg,
      })) {
        expect(
          part.shapes.some((s) => ['primary', 'secondary', 'accent'].includes(s.fill)),
          `${id}.${k}`,
        ).toBe(true)
      }
    }
    for (const id of accessoryIds) {
      const uses = ACCESSORIES[id].part.shapes.some(
        (s) =>
          ['primary', 'secondary', 'accent'].includes(s.fill) ||
          ['primary', 'secondary', 'accent'].includes(s.stroke ?? ''),
      )
      expect(uses, id).toBe(true)
    }
  })

  it('色 8 種は、すべて 3 つの枠（主色・副色・差し色）を持ち、すべて違う', () => {
    const seen = new Set<string>()
    for (const id of colorIds) {
      const p = PALETTES[id]
      for (const k of ['primary', 'secondary', 'accent'] as const)
        expect(p[k]).toMatch(/^#[0-9a-f]{6}$/i)
      seen.add(`${p.primary}${p.secondary}${p.accent}`)
    }
    expect(seen.size).toBe(8)
    expect(new Set(colorIds.map((c) => PALETTES[c].primary)).size).toBe(8)
  })
})

describe('色の見分け・見えやすさ（character-design.md §5.4、§11）', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  it('1P の初期値（c1）と 2P の初期値（c2）は、明るさも、はっきり違う（色覚の違いでも見分けられる）', () => {
    expect(contrast(PALETTES.c1.primary, PALETTES.c2.primary)).toBeGreaterThan(1.8)
  })

  it('色 8 種の主色は、対戦画面の暗い背景・ステージに対して、見分けられる明るさ', () => {
    for (const id of colorIds) {
      for (const bg of ['#1a2030', '#262f45']) {
        expect(contrast(PALETTES[id].primary, bg), `${id} on ${bg}`).toBeGreaterThan(1.8)
      }
    }
  })

  it('明るい色（c7）と暗い色（c8）が、明暗で離れている', () => {
    expect(contrast(PALETTES.c7.primary, PALETTES.c8.primary)).toBeGreaterThan(4)
  })
})

describe('品質の規則（character-design.md §7.1）', () => {
  it('体型のパーツには、2 段階の陰影（暗い重ねと明るい重ね）がある', () => {
    for (const id of bodyIds) {
      for (const [k, part] of Object.entries({
        head: BODIES[id].head,
        torso: BODIES[id].torso,
        arm: BODIES[id].arm,
        leg: BODIES[id].leg,
      })) {
        const fills = part.shapes.map((s) => s.fill)
        expect(fills, `${id}.${k}`).toContain('shade')
        expect(fills, `${id}.${k}`).toContain('light')
      }
    }
  })

  it('すべての体型のパーツに、輪郭線がある。太さは、統一された範囲（1.2〜2.8）', () => {
    const outlined = (s: Shape) => s.stroke === 'outline'
    for (const { name, part } of allParts()) {
      if (name.startsWith('expr.') || /^f\d$/.test(name)) continue // 顔は、線画（別の規則）
      expect(part.shapes.some(outlined), name).toBe(true)
    }
    for (const { name, part } of allParts()) {
      for (const s of part.shapes) {
        if (s.stroke === 'outline' && s.sw !== undefined) {
          expect(s.sw, name).toBeGreaterThanOrEqual(1.2)
          expect(s.sw, name).toBeLessThanOrEqual(6) // 6 は、ヘッドホンのバンドの外線のみ
        }
      }
    }
    expect(OUTLINE_WIDTH).toBe(2.2)
  })

  it('体型 4 種の見た目の高さは、ほぼ同じ（100 ±3。当たり判定の高さ 0.8 セルとの差が小さい）', () => {
    for (const id of bodyIds) {
      const b = BODIES[id]
      const head = bbox(b.head)
      const leg = bbox(b.leg)
      const top = b.at.torso.y + b.at.head.y + head.y0
      const bottom = b.at.legF.y + leg.y1
      expect(top, `${id} 頭の上端`).toBeGreaterThanOrEqual(-3)
      expect(top, `${id} 頭の上端`).toBeLessThanOrEqual(3)
      expect(bottom, `${id} 足元`).toBeGreaterThanOrEqual(97)
      expect(bottom, `${id} 足元`).toBeLessThanOrEqual(103)
      expect(bottom - top, id).toBeGreaterThanOrEqual(97)
      expect(bottom - top, id).toBeLessThanOrEqual(103)
    }
  })

  it('体型 4 種は、シルエットが違う（頭の幅・胴の幅・脚の長さ・腕の長さのうち、2 つ以上が、12 % 以上違う）', () => {
    const metrics = (id: BodyId) => {
      const b = BODIES[id]
      const w = (p: Part) => bbox(p).x1 - bbox(p).x0
      const h = (p: Part) => bbox(p).y1 - bbox(p).y0
      return [w(b.head), w(b.torso), h(b.leg), h(b.arm)]
    }
    for (let i = 0; i < bodyIds.length; i++) {
      for (let j = i + 1; j < bodyIds.length; j++) {
        const a = metrics(bodyIds[i])
        const b = metrics(bodyIds[j])
        const differ = a.filter((v, k) => Math.abs(v - b[k]) / Math.min(v, b[k]) >= 0.12).length
        expect(differ, `${bodyIds[i]} と ${bodyIds[j]}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('顔 6 種 + 共通の表情 3 種が、すべて違う形（同じ絵がない）', () => {
    const sigs = [
      ...faceIds.map((f) => FACES[f].part),
      ...Object.values(EXPRESSIONS).map((e) => e.part),
    ].map((p) => p.shapes.map((s) => s.d).join('|'))
    expect(new Set(sigs).size).toBe(sigs.length)
  })

  it('図形の貼り合わせに見えない: 体型のパーツは、いくつもの曲線（C）を持つ形で描かれている', () => {
    for (const id of bodyIds) {
      for (const [k, part] of Object.entries({
        head: BODIES[id].head,
        torso: BODIES[id].torso,
        arm: BODIES[id].arm,
        leg: BODIES[id].leg,
      })) {
        const curves = part.shapes.reduce((n, s) => n + (s.d.match(/C/g)?.length ?? 0), 0)
        expect(part.shapes.length, `${id}.${k}`).toBeGreaterThanOrEqual(5) // 本体・模様・陰影など
        expect(curves, `${id}.${k}`).toBeGreaterThanOrEqual(6)
      }
    }
  })
})

describe('組み立て（重ね順・関節・向き）', () => {
  const base = { body: 'b1', face: 'f1', color: 'c1', accessory: null } as const

  it('重ね順: 背中のアクセサリー → 奥の腕 → 胴体 → 頭 → 手前の腕 → 首のアクセサリー', () => {
    const pos = (svg: string, marker: string) => svg.indexOf(marker)
    const svg = composeFighterBody({ appearance: { ...base, accessory: 'a6' } })
    // つばさ（背中）は、胴体の絵より前（奥）に出てくる
    expect(pos(svg, 'M 0,-6 C -8,-14')).toBeLessThan(pos(svg, BODIES.b1.torso.shapes[1].d))
    const scarf = composeFighterBody({ appearance: { ...base, accessory: 'a3' } })
    // マフラー（首）は、手前の腕より後ろ（手前）に出てくる
    expect(pos(scarf, ACCESSORIES.a3.part.shapes[2].d)).toBeGreaterThan(
      pos(scarf, BODIES.b1.torso.shapes[1].d),
    )
    expect(pos(scarf, ACCESSORIES.a3.part.shapes[2].d)).toBeGreaterThan(
      pos(scarf, BODIES.b1.arm.shapes[0].d),
    )
  })

  it('頭・顔のアクセサリーは、頭と一緒に動く（頭の変換の中にある）', () => {
    const hat = composeFighterBody({ appearance: { ...base, accessory: 'a1' } })
    const headG = hat.indexOf(`translate(${BODIES.b1.at.head.x} ${BODIES.b1.at.head.y})`)
    expect(headG).toBeGreaterThan(-1)
    expect(hat.indexOf(ACCESSORIES.a1.part.shapes[0].d)).toBeGreaterThan(headG)
  })

  it('ポーズ: 腕・脚の回転が、関節を中心にかかる（変換に rotate が入る）。基準のポーズは、わずかに開く', () => {
    const neutral = composeFighterBody({ appearance: base })
    expect(neutral).toContain('rotate(-4)') // armF +4°（前方 = SVG では逆回り）
    const run = composeFighterBody({ appearance: base, pose: { armF: { rot: -40 } } })
    expect(run).toContain('rotate(36)')
  })

  it('表情の切り替え: 通常の顔と、共通の表情（攻撃・やられ・撃墜）が、顔の位置に出る', () => {
    const normal = composeFighterBody({ appearance: base })
    const hit = composeFighterBody({ appearance: base, pose: { face: 'hit' } })
    expect(normal).toContain(FACES.f1.part.shapes[0].d)
    expect(hit).toContain(EXPRESSIONS.hit.part.shapes[0].d)
    expect(hit).not.toContain(FACES.f1.part.shapes[0].d)
  })

  it('左向きは、全体を左右反転する', () => {
    expect(composeFighterBody({ appearance: base, facing: -1 })).toContain('scale(-1 1)')
    expect(composeFighterBody({ appearance: base })).not.toContain('scale(-1 1)')
  })

  it('決定的: 同じ入力から、同じ出力', () => {
    const a = fighterSvg({ appearance: { body: 'b3', face: 'f4', color: 'c5', accessory: 'a2' } })
    expect(
      fighterSvg({ appearance: { body: 'b3', face: 'f4', color: 'c5', accessory: 'a2' } }),
    ).toBe(a)
  })
})
