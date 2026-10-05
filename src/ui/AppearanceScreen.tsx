import { useId, useMemo, useRef, useState } from 'react'
import {
  ACCESSORIES,
  BODIES,
  FACES,
  PALETTES,
  fighterSvg,
  messages,
  type FighterLook,
} from '../assets/index.ts'
import {
  APPEARANCE_IDS,
  DEFAULT_NAMES,
  clampName,
  nameRemaining,
  randomAppearance,
  resolveName,
  stoppedEarlyByBytes,
  type NameLimit,
} from '../fighter/index.ts'
import type { Appearance, CharacterConfig, PlayerSlot } from '../model/index.ts'
import { FighterPreview } from './FighterPreview.tsx'

const m = messages.appearance

export type AppearanceScreenProps = {
  /** 外観と名前（能力値は、この画面では触らない） */
  config: CharacterConfig
  onChange: (config: CharacterConfig) => void
  /** 「つぎへ」。名前が未入力なら、デフォルト名にそろえた設定を渡す */
  onNext: (config: CharacterConfig) => void
  /** 「もどる」。戻れない画面では、渡さない（ボタンを出さない） */
  onBack?: () => void
  /** デフォルト名に使う。既定は 1P */
  player?: PlayerSlot
  /** 乱数（「ランダム」ボタン）。既定は Math.random。テストで差し替える */
  random?: () => number
}

type Option = { id: string | null; label: string; look: FighterLook }

/** S02 見た目を選ぶ（ui-design.md §7.2、character-design.md §9） */
export function AppearanceScreen({
  config,
  onChange,
  onNext,
  onBack,
  player = 'p1',
  random = Math.random,
}: AppearanceScreenProps) {
  const id = useId()
  const a = config.appearance
  const look = a as FighterLook
  const [limitedBy, setLimitedBy] = useState<NameLimit | null>(null)
  const composing = useRef(false)

  const setAppearance = (next: Appearance) => onChange({ ...config, appearance: next })
  const setName = (raw: string) => {
    const r = clampName(raw)
    setLimitedBy(r.limitedBy)
    onChange({ ...config, name: r.value })
  }

  // 各選択肢の見本: ほかの選択は、いまのまま、その選択肢だけ入れ替えた姿
  const groups = useMemo(() => {
    const swap = (patch: Partial<FighterLook>): FighterLook => ({ ...look, ...patch })
    return {
      body: APPEARANCE_IDS.body.map((v): Option => ({
        id: v,
        label: BODIES[v].name,
        look: swap({ body: v }),
      })),
      face: APPEARANCE_IDS.face.map((v): Option => ({
        id: v,
        label: FACES[v].name,
        look: swap({ face: v }),
      })),
      color: APPEARANCE_IDS.color.map((v): Option => ({
        id: v,
        label: PALETTES[v].name,
        look: swap({ color: v }),
      })),
      accessory: [
        ...APPEARANCE_IDS.accessory.map((v): Option => ({
          id: v,
          label: ACCESSORIES[v].name,
          look: swap({ accessory: v }),
        })),
        { id: null, label: m.none, look: swap({ accessory: null }) } as Option,
      ],
    }
  }, [look])

  const remaining = nameRemaining(config.name)
  const shownName = resolveName(config.name, player)

  return (
    <div className="appearance-screen">
      <h2 className="appearance-screen__heading">{m.title}</h2>
      <div className="appearance-screen__body">
        <div className="appearance-screen__preview">
          <FighterPreview look={look} label={m.previewLabel(shownName)} />
          <p className="appearance-screen__preview-name">{shownName}</p>
        </div>

        <div className="appearance-screen__choices">
          {(['body', 'face', 'color', 'accessory'] as const).map((key) => (
            <fieldset key={key} className="choice-group" data-group={key}>
              <legend>{m.groups[key]}</legend>
              <div className="choice-group__options">
                {groups[key].map((o) => {
                  const checked = a[key] === o.id
                  return (
                    <label key={o.id ?? 'none'} className="choice" data-checked={checked}>
                      <input
                        type="radio"
                        name={`${id}-${key}`}
                        checked={checked}
                        onChange={() => setAppearance({ ...a, [key]: o.id })}
                      />
                      {key === 'color' ? (
                        <span
                          className="choice__swatch"
                          style={{ background: PALETTES[o.id as keyof typeof PALETTES].primary }}
                        />
                      ) : key === 'accessory' && o.id === null ? (
                        <span className="choice__none" aria-hidden="true">
                          ✕
                        </span>
                      ) : (
                        <span
                          className={`choice__thumb choice__thumb--${key}`}
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{
                            __html: fighterSvg({ appearance: o.look }, 56),
                          }}
                        />
                      )}
                      <span className="choice__label">{o.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <div className="name-field">
            <label htmlFor={`${id}-name`} className="name-field__label">
              {m.name}
            </label>
            <input
              id={`${id}-name`}
              className="name-field__input"
              type="text"
              value={config.name}
              placeholder={m.namePlaceholder(DEFAULT_NAMES[player])}
              autoComplete="off"
              aria-describedby={`${id}-name-notice ${id}-name-count`}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={(e) => {
                composing.current = false
                setName(e.currentTarget.value)
              }}
              onChange={(e) => {
                // 変換中は、切らない（変換の途中の文字が消えるため）。確定したときに切る
                if (composing.current) onChange({ ...config, name: e.target.value })
                else setName(e.target.value)
              }}
            />
            <span id={`${id}-name-count`} className="name-field__count" aria-live="polite">
              {m.nameMax}・{m.nameRemaining(remaining)}
            </span>
            <button
              type="button"
              className="button button--sub"
              onClick={() => setAppearance(randomAppearance(random))}
            >
              {m.random}
            </button>
            <p className="name-field__bytes" role="status">
              {stoppedEarlyByBytes(config.name, limitedBy) ? m.nameBytesNote : ''}
            </p>
            <p id={`${id}-name-notice`} className="name-field__notice">
              {m.nameNotice}
            </p>
          </div>
        </div>
      </div>

      <footer className="appearance-screen__footer">
        {onBack ? (
          <button type="button" className="button button--sub" onClick={onBack}>
            {m.back}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="button button--main"
          onClick={() => onNext({ ...config, name: resolveName(config.name, player) })}
        >
          {m.next}
        </button>
      </footer>
    </div>
  )
}
