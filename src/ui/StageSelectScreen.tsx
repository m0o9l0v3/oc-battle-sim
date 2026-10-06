import { useId } from 'react'
import { messages, summarizeViolations } from '../assets/index.ts'
import type { StageData } from '../model/index.ts'
import { findPreset, presetStage, STAGE_PRESETS, validateStage } from '../stage/index.ts'
import { StageThumbnail } from './StageThumbnail.tsx'

const m = messages.stageSelect

export type StageSelectScreenProps = {
  /** 選んでいるプリセットの ID。見つからないときは、標準として扱う */
  selectedId: string
  onSelect: (id: string) => void
  /** 「つぎへ」。検証を通ったステージ（プリセットの複製）を渡す */
  onNext: (stage: StageData) => void
  /** 「もどる」。戻れない画面では、渡さない（ボタンを出さない） */
  onBack?: () => void
}

/**
 * S04 ステージを決める（プリセットを選ぶ部分。stage-editor.md §4〜§5）。
 * 入ったときから、標準のプリセットが選ばれ、検証を通った状態。何も操作しなくても、「つぎへ」を押せる。
 * 編集（グリッドエディタ）は #33
 */
export function StageSelectScreen({
  selectedId,
  onSelect,
  onNext,
  onBack,
}: StageSelectScreenProps) {
  const id = useId()
  const current = findPreset(selectedId) ?? STAGE_PRESETS[0]!
  const stage = presetStage(current.id)
  const result = validateStage(stage, 'match')
  const summary = result.ok ? null : summarizeViolations(result.violations)

  return (
    <div className="stage-select">
      <h2 className="stage-select__heading">{m.title}</h2>
      <fieldset className="stage-select__list">
        <legend className="stage-select__legend">{m.presets}</legend>
        <div className="stage-select__cards">
          {STAGE_PRESETS.map((p) => {
            const checked = p.id === current.id
            return (
              <label key={p.id} className="stage-card" data-checked={checked}>
                <input
                  type="radio"
                  name={`${id}-preset`}
                  checked={checked}
                  onChange={() => onSelect(p.id)}
                />
                {/* 色だけに頼らない、選択の印（ui-design.md §6。強制色のモードでも見える） */}
                {checked && (
                  <span className="stage-card__check" aria-hidden="true">
                    ✓
                  </span>
                )}
                <StageThumbnail stage={p.stage} />
                <span className="stage-card__name">{p.name}</span>
                <span className="stage-card__desc">{p.description}</span>
                <span className="visually-hidden">{m.thumbLabel(p.name)}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <footer className="stage-select__footer">
        {onBack ? (
          <button type="button" className="button button--sub" onClick={onBack}>
            {m.back}
          </button>
        ) : (
          <span />
        )}
        <div className="stage-select__next">
          {/* 結果は、ボタンの近くに出す（通らないとき、理由が見える） */}
          <p className="stage-select__result" role="status">
            {result.ok ? `✓ ${m.usable}` : (summary?.shown.map((s) => s.message).join(' / ') ?? '')}
          </p>
          <button
            type="button"
            className="button button--main"
            disabled={!result.ok}
            onClick={() => result.ok && onNext(result.stage)}
          >
            {m.next}
          </button>
        </div>
      </footer>
    </div>
  )
}
