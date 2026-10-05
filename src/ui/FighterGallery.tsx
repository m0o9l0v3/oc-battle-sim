import {
  ACCESSORIES,
  BODIES,
  EXPRESSIONS,
  FACES,
  PALETTES,
  fighterSvg,
  partPreviewSvg,
} from '../assets/index.ts'
import type { AccessoryId, BodyId, ColorId, FaceId } from '../assets/index.ts'

const bodyIds = Object.keys(BODIES) as BodyId[]
const faceIds = Object.keys(FACES) as FaceId[]
const colorIds = Object.keys(PALETTES) as ColorId[]
const accessoryIds = Object.keys(ACCESSORIES) as AccessoryId[]

const Svg = ({ html }: { html: string }) => <span dangerouslySetInnerHTML={{ __html: html }} />

/** ファイターの素材の確認用の一覧（#28）。S02 の実装（#30）までの、開発用の表示 */
export function FighterGallery() {
  return (
    <section>
      <h2>体型 × 色</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', background: '#262f45', padding: 8 }}>
        {bodyIds.map((b, i) => (
          <Svg
            key={b}
            html={fighterSvg(
              { appearance: { body: b, face: faceIds[i], color: colorIds[i], accessory: null } },
              150,
            )}
          />
        ))}
        {bodyIds.map((b, i) => (
          <Svg
            key={`b2-${b}`}
            html={fighterSvg(
              {
                appearance: {
                  body: b,
                  face: faceIds[i + 2],
                  color: colorIds[i + 4],
                  accessory: accessoryIds[i],
                },
              },
              150,
            )}
          />
        ))}
      </div>
      <h2>顔 6 種 + 共通の表情</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', background: '#fff' }}>
        {faceIds.map((fid) => (
          <Svg
            key={fid}
            html={
              partPreviewSvg({ shapes: [] }, 'c1', 1) &&
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-18 -16 36 32" width="110" height="98"><circle cx="0" cy="0" r="18" fill="#fbe7cd"/>${FACES[fid].part.shapes.map((s) => `<path d="${s.d}" fill="${s.fill === 'none' ? 'none' : s.fill === 'white' ? '#fff' : s.fill === 'cheek' ? '#f59aa5' : s.fill === 'skin' ? '#fbe7cd' : '#2a2340'}"${s.stroke ? ` stroke="#2a2340" stroke-width="${s.sw ?? 2.2}" stroke-linecap="round"` : ''}/>`).join('')}</svg>`
            }
          />
        ))}
        {(['attack', 'hit', 'ko'] as const).map((e) => (
          <Svg
            key={e}
            html={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-18 -16 36 32" width="110" height="98"><circle cx="0" cy="0" r="18" fill="#fbe7cd"/>${EXPRESSIONS[e].part.shapes.map((s) => `<path d="${s.d}" fill="${s.fill === 'none' ? 'none' : s.fill === 'white' ? '#fff' : s.fill === 'cheek' ? '#f59aa5' : s.fill === 'glass' ? '#bfe8ff' : s.fill === 'skin' ? '#fbe7cd' : '#2a2340'}"${s.stroke ? ` stroke="#2a2340" stroke-width="${s.sw ?? 2.2}" stroke-linecap="round"` : ''}/>`).join('')}</svg>`}
          />
        ))}
      </div>
      <h2>色 8 種</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', background: '#1a2030', padding: 8 }}>
        {colorIds.map((c) => (
          <Svg
            key={c}
            html={fighterSvg(
              { appearance: { body: 'b1', face: 'f1', color: c, accessory: null } },
              100,
            )}
          />
        ))}
      </div>
      <h2>アクセサリー 6 種（体型 4 種）</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', background: '#262f45', padding: 8 }}>
        {bodyIds.flatMap((b) =>
          accessoryIds.map((a) => (
            <Svg
              key={`${b}${a}`}
              html={fighterSvg(
                { appearance: { body: b, face: 'f1', color: 'c2', accessory: a } },
                90,
              )}
            />
          )),
        )}
      </div>
    </section>
  )
}
