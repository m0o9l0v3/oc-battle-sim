import type { ReactNode } from 'react'

export type MessageKind = 'success' | 'warn' | 'info'

/** 記号（色だけに頼らない）。成功は ✓、注意・違反は ！、情報は i */
export const MESSAGE_SYMBOLS: Record<MessageKind, string> = { success: '✓', warn: '！', info: 'i' }

/** メッセージ帯。記号と文字つき（ui-design.md §6、§11） */
export function MessageBand({ kind, children }: { kind: MessageKind; children: ReactNode }) {
  return (
    <p className={`message-band message-band--${kind}`} role="status">
      <span className="message-band__symbol" aria-hidden="true">
        {MESSAGE_SYMBOLS[kind]}
      </span>
      <span>{children}</span>
    </p>
  )
}
