import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BATTLE_COLORS, messages } from '../assets/index.ts'
import {
  clearBlocks,
  createEditor,
  setTool,
  strokeEnd,
  strokeStart,
  STAGE_PRESETS,
  type EditorState,
} from '../stage/index.ts'
import { StageEditorScreen } from './StageEditorScreen.tsx'

const m = messages.stageEditor
const html = (editor: EditorState, extra: { onBack?: () => void } = {}) =>
  renderToStaticMarkup(
    <StageEditorScreen editor={editor} onChange={() => {}} onNext={() => {}} {...extra} />,
  )
const nextButton = (markup: string) =>
  markup.match(/<button[^>]*>つぎへ（ためしに うごかす）<\/button>/)![0]

describe('S04 エディタの表示', () => {
  it('入ったときから、標準が選ばれ、「✓ つかえるよ！」。「つぎへ」が押せる', () => {
    const markup = html(createEditor())
    expect(markup).toContain(`✓ ${m.usable}`)
    expect(nextButton(markup)).not.toContain('disabled')
    expect(markup).toMatch(/data-checked="true"[^]*?ひょうじゅん/)
    expect(markup).not.toContain(m.pickPreset)
  })

  it('プリセット（見本つき）・4 つの道具・操作ボタン・名前の注意書きが並ぶ', () => {
    const markup = html(createEditor())
    for (const p of STAGE_PRESETS) expect(markup).toContain(p.name)
    for (const label of Object.values(m.toolLabels)) expect(markup).toContain(label)
    for (const t of [m.undo, m.clear, m.resetPreset]) expect(markup).toContain(t)
    expect(markup).toContain(m.nameNotice)
    expect(markup).toContain(m.topRows)
  })

  it('選んでいる道具が、色だけでなく ✓ で分かる。初期の道具は「ブロック」', () => {
    const markup = html(createEditor())
    expect((markup.match(/data-checked="true"[^>]*>[^]*?✓ /g) ?? []).length).toBeGreaterThan(0)
    expect(markup).toMatch(
      /class="choice choice--compact" data-checked="true"[^]*?choice__check[^]*?ブロック/,
    )
    const eraser = html(setTool(createEditor(), 'eraser'))
    expect(eraser).toMatch(
      /class="choice choice--compact" data-checked="true"[^]*?choice__check[^]*?けしごむ/,
    )
  })

  it('「ひとつ もどす」は、戻れるときだけ押せる。変更がなければ「プリセットから やりなおす」は押せない', () => {
    const fresh = html(createEditor())
    expect(fresh).toMatch(/<button[^>]*disabled[^>]*>ひとつ もどす/)
    expect(fresh).toMatch(/<button[^>]*disabled[^>]*>プリセットから やりなおす/)
    const edited = strokeEnd(strokeStart(createEditor(), { col: 2, row: 5 }))
    const markup = html(edited)
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>ひとつ もどす/)
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>プリセットから やりなおす/)
  })

  it('検証エラーのとき: 「つぎへ」は押せず、理由（メッセージ）が出る。プリセットへの導線が出る', () => {
    const markup = html(clearBlocks(createEditor()))
    expect(markup).not.toContain(`✓ ${m.usable}`)
    expect(nextButton(markup)).toContain('disabled')
    expect(markup).toContain('ブロックが すくないよ。あと 30こ おこう')
    expect(markup).toContain(m.nextBlocked)
    expect(markup).toContain(m.pickPreset)
    // 違反が 3 件以上: 主ボタンとして、目立たせる
    expect(markup).toMatch(/button--main[^>]*>プリセットから えらびなおす/)
  })

  it('違反のセルが、✕ と赤い枠で示される（スタート位置の下の足場を消した場合）', () => {
    let s = createEditor()
    s = setTool(s, 'eraser')
    for (const row of [10, 11, 12]) s = strokeEnd(strokeStart(s, { col: 4, row }))
    const markup = html(s)
    expect(markup).toContain(messages.stageRules.SPAWN_NO_GROUND)
    expect(markup).toContain('✕')
    expect(markup).toContain(BATTLE_COLORS.violation)
  })

  it('スタート位置に、色と「1P」「2P」の文字がある（色だけに頼らない）', () => {
    const markup = html(createEditor())
    expect(markup).toContain(m.marker1)
    expect(markup).toContain(m.marker2)
  })

  it('「もどる」は、渡したときだけ', () => {
    expect(html(createEditor())).not.toContain(`>${m.back}<`)
    expect(html(createEditor(), { onBack: () => {} })).toContain(`>${m.back}<`)
  })
})
