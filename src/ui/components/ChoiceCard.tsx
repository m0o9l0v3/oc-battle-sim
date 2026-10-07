import type { ReactNode } from 'react'

export type ChoiceCardProps = {
  /** 同じ選択の仲間（ラジオボタンの name） */
  name: string
  checked: boolean
  onChange: () => void
  /** 画面の読み上げ用の名前（中身が絵だけのとき） */
  label?: string
  /** 小さいカード（道具など） */
  compact?: boolean
  className?: string
  children: ReactNode
}

/**
 * 選択肢のカード（見た目・プリセット・道具）。選んだものは、**枠と ✓** で示す（色だけに頼らない。ui-design.md §6）。
 * 中身はラジオボタン（キーボード・読み上げで操作できる）
 */
export function ChoiceCard({
  name,
  checked,
  onChange,
  label,
  compact,
  className,
  children,
}: ChoiceCardProps) {
  return (
    <label
      className={`choice${compact ? ' choice--compact' : ''}${className ? ` ${className}` : ''}`}
      data-checked={checked}
    >
      <input type="radio" name={name} checked={checked} aria-label={label} onChange={onChange} />
      {checked && (
        <span className="choice__check" aria-hidden="true">
          ✓
        </span>
      )}
      {children}
    </label>
  )
}
