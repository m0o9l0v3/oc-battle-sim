import { useId, type ReactNode } from 'react'

export type ButtonProps = {
  /** 主ボタン（次へ進む、など。目立つ色）／補助ボタン（控えめな色） */
  variant?: 'main' | 'sub'
  disabled?: boolean
  /** 押せないときの理由。**ボタンの近く**に表示する（無反応にしない。ui-design.md §6） */
  reason?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  children: ReactNode
}

/**
 * ボタン。高さ 56 ピクセル以上、文字のラベルつき。押せないときは、見た目を変え、理由を近くに出す。
 * 確認のダイアログは出さない（取り消しは「もどす」で行う）
 */
export function Button({
  variant = 'sub',
  disabled,
  reason,
  onClick,
  type = 'button',
  children,
}: ButtonProps) {
  const id = useId()
  const showReason = !!disabled && !!reason
  return (
    <span className="button-wrap">
      <button
        type={type}
        className={`button button--${variant}`}
        disabled={disabled}
        aria-describedby={showReason ? id : undefined}
        onClick={onClick}
      >
        {children}
      </button>
      {reason !== undefined && (
        <span id={id} className="button-wrap__reason" role="status">
          {showReason ? reason : ''}
        </span>
      )}
    </span>
  )
}
