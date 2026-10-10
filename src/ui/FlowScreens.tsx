// S01・S06〜S12 の画面。ファイター作成（S02・S03）、ステージ（S04）、試し動かし（S05）は、それぞれの部品。
// S08（Battle Report）・S11（結果の比較）・S12 の持ち帰り QR は、#38・#39・#61 で、本格的なものに置き換える。
// ここは、MVP の流れを、最初から最後まで通せるようにするための、最小の画面
import { useCallback, useEffect, useRef, useState } from 'react'
import { messages } from '../assets/index.ts'
import { resolveName, STAT_KEYS } from '../fighter/index.ts'
import { DEFAULT_BINDINGS } from '../input/index.ts'
import type { CharacterConfig, Stats } from '../model/index.ts'
import type { PrintRequestResult } from '../net/index.ts'
import { canRematch, statsChanged, type Session } from '../session/index.ts'
import { buildTakeHomeUrl, PUBLIC_APP_URL } from '../share/index.ts'
import { keysLabel } from './keyLabels.ts'
import { QrCode } from './QrCode.tsx'
import { MatchCanvas, type MatchHud } from './MatchCanvas.tsx'
import { StatEditor } from './StatEditor.tsx'
import { statPercent } from './statView.ts'
import { Button, HudPanel, HudPlayer } from './components/index.ts'

const m = messages.flow
const sm = messages.stat

/** S01 スタート。親機の進行で「はじめる」を押せないときは、理由をボタンの近くに出す（ui-design.md §7.1） */
export function StartScreen({ onStart, blocked }: { onStart: () => void; blocked?: string }) {
  return (
    <div className="flow-start">
      <h1>{m.start.title}</h1>
      <p className="flow-start__lead">{m.start.lead}</p>
      <ol className="flow-start__steps">
        {m.start.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <Button variant="main" onClick={onStart} disabled={!!blocked} reason={blocked ?? ''}>
        {m.start.begin}
      </Button>
    </div>
  )
}

const OPERATIONS = ['left', 'right', 'jump', 'attack'] as const

export function StatSummary({ stats }: { stats: Stats }) {
  return (
    <ul className="practice__stats">
      {STAT_KEYS.map((key) => (
        <li key={key}>
          <span>{sm.stats[key].label}</span>
          <b>{stats[key]}</b>
          <span className="practice__effect">
            {sm.stats[key].effect} {statPercent(key, stats[key])}%
          </span>
        </li>
      ))}
    </ul>
  )
}

/** S06 対戦の準備（ui-design.md §7.6）。2 人のキー配置と、2P の能力値（標準で始まる。変えられる） */
export function PrepScreen({
  p1,
  p2,
  onChangeP2,
  onStart,
  onBack,
}: {
  p1: CharacterConfig
  p2: CharacterConfig
  onChangeP2: (c: CharacterConfig) => void
  onStart: () => void
  onBack: () => void
}) {
  const [open, setOpen] = useState(false)
  const sum = STAT_KEYS.reduce((t, k) => t + p2.stats[k], 0)
  const ready = sum === 20
  return (
    <div className="prep">
      <h2>{m.prep.title}</h2>
      <p>{m.prep.keysNote}</p>
      <div className="prep__players">
        {(
          [
            ['p1', m.prep.you, p1],
            ['p2', m.prep.foe, p2],
          ] as const
        ).map(([slot, label, cfg]) => (
          <section key={slot} className="prep__player" aria-labelledby={`prep-${slot}`}>
            <h3 id={`prep-${slot}`}>
              {label}: {resolveName(cfg.name, slot)}
            </h3>
            <dl className="practice__keys">
              {OPERATIONS.map((op) => (
                <div key={op} className="practice__key-row">
                  <dt>{messages.practice[op]}</dt>
                  <dd>
                    <kbd>{keysLabel(DEFAULT_BINDINGS[slot][op])}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <StatSummary stats={cfg.stats} />
            {slot === 'p2' && <p className="practice__note">{m.prep.foeNote}</p>}
          </section>
        ))}
      </div>
      {open ? (
        <div className="prep__edit">
          <StatEditor
            stats={p2.stats}
            onChange={(stats) => onChangeP2({ ...p2, stats })}
            heading={m.prep.foe}
          />
          <Button variant="sub" disabled={!ready} onClick={() => setOpen(false)}>
            {m.prep.closeFoe}
          </Button>
        </div>
      ) : (
        <Button variant="sub" onClick={() => setOpen(true)}>
          {m.prep.changeFoe}
        </Button>
      )}
      <footer className="flow-footer">
        <Button variant="sub" onClick={onBack}>
          {messages.stat.back}
        </Button>
        <Button variant="main" disabled={!ready} onClick={onStart}>
          {m.prep.start}
        </Button>
      </footer>
    </div>
  )
}

/** S07・S10 対戦。勝敗が確定したら、自動で次へ進む（user-flow.md §5.7） */
export function MatchScreen({
  matchNo,
  setup,
  onFinish,
}: {
  matchNo: number
  setup: NonNullable<Session['current']>
  onFinish: (r: Parameters<React.ComponentProps<typeof MatchCanvas>['onFinish']>[0]) => void
}) {
  const [hud, setHud] = useState<MatchHud | null>(null)
  const onHud = useCallback((h: MatchHud) => setHud(h), [])
  const { p1, p2 } = setup
  return (
    <div className="match">
      <h2>{m.match.title(matchNo)}</h2>
      <HudPanel
        headline={hud?.phase === 'ready' ? m.match.ready : hud ? m.match.time(hud.timeLeftSec) : ''}
      >
        {([p1, p2] as const).map((c, i) => (
          <HudPlayer
            key={i}
            slot={i === 0 ? 'p1' : 'p2'}
            name={resolveName(c.name, i === 0 ? 'p1' : 'p2')}
            stocksText={hud ? m.match.stocks(hud.stocks[i]!) : ''}
            damageText={hud ? m.match.damage(hud.damage[i]!) : ''}
          />
        ))}
      </HudPanel>
      <div className="match__stage">
        <MatchCanvas p1={p1} p2={p2} stage={setup.stage} onHud={onHud} onFinish={onFinish} />
      </div>
    </div>
  )
}

/** S09 設定を変えて作り直す。直前の戦の値（まえ）を見ながら、能力値だけを変える */
export function RedesignScreen({
  session,
  onChangeP1,
  onChangeP2,
  onRematch,
  onBack,
  rematchBlocked,
}: {
  session: Session
  onChangeP1: (c: CharacterConfig) => void
  onChangeP2: (c: CharacterConfig) => void
  onRematch: () => void
  onBack: () => void
  /** 親機の進行で、再戦を始められない理由（再戦の受付の停止など。event-control.md §6.3） */
  rematchBlocked?: string
}) {
  const { p1, p2 } = session.data
  const last = session.data.matches.at(-1)
  const [foeOpen, setFoeOpen] = useState(false)
  const changed = !!last && statsChanged(p1, last.p1Config)
  const ok = canRematch(session) && !rematchBlocked
  return (
    <div className="redesign">
      <h2>{m.redesign.title}</h2>
      {last && (
        <p className="practice__note">
          {m.redesign.before}:{' '}
          {STAT_KEYS.map((k) => `${sm.stats[k].label} ${last.p1Config.stats[k]}`).join(' / ')}
        </p>
      )}
      <StatEditor
        stats={p1.stats}
        onChange={(stats) => onChangeP1({ ...p1, stats })}
        heading="1P"
      />
      {foeOpen ? (
        <>
          <p className="practice__note">{m.redesign.foe}</p>
          <StatEditor
            stats={p2.stats}
            onChange={(stats) => onChangeP2({ ...p2, stats })}
            heading="2P"
          />
        </>
      ) : (
        <Button variant="sub" onClick={() => setFoeOpen(true)}>
          {m.prep.changeFoe}
        </Button>
      )}
      <footer className="flow-footer">
        <Button variant="sub" onClick={onBack}>
          {m.redesign.back}
        </Button>
        <div className="stat-screen__next">
          {/* 押せない理由は、ボタンの近くに出す */}
          <p className="stat-screen__reason" role="status">
            {rematchBlocked ?? (!changed ? m.redesign.mustChange : '')}
          </p>
          <Button variant="main" disabled={!ok} onClick={onRematch}>
            {m.redesign.rematch}
          </Button>
        </div>
      </footer>
    </div>
  )
}

/** S12 おわり。見た目・能力値・ステージは、リセットまで保持する。持ち帰り用の QR と URL（take-home-share.md） */
/** S12 の印刷（親機があるときだけ）。send は依頼を送る、onAccepted は受け付けられた整理番号を、セッションへ */
export type EndScreenPrint = {
  send: (takeHomeUrl: string) => Promise<PrintRequestResult>
  onAccepted: (number: number) => void
  /** 印刷を依頼できない理由（親機の進行で止まっているとき） */
  blocked?: string
}

/** 「おくれたよ！」を見せてから、待機の画面へ切り替えるまで（take-home-print.md §7.2） */
export const PRINT_SUCCESS_MS = 1000

type PrintStatus = 'idle' | 'sending' | 'success' | 'failed'

export function EndScreen({
  session,
  onReset,
  print,
}: {
  session: Session
  onReset: () => void
  print?: EndScreenPrint
}) {
  const { p1, stage, printNumber } = session.data
  const url = buildTakeHomeUrl(PUBLIC_APP_URL, p1, stage)
  const [status, setStatus] = useState<PrintStatus>('idle')
  // 同じ描画の中の連打でも、1 回だけ送る
  const sendingRef = useRef(false)

  useEffect(() => {
    if (status !== 'success') return
    const t = setTimeout(() => setStatus('idle'), PRINT_SUCCESS_MS)
    return () => clearTimeout(t)
  }, [status])

  const requestPrint = useCallback(async () => {
    if (!print || !url || sendingRef.current) return
    sendingRef.current = true
    setStatus('sending')
    const r = await print.send(url)
    sendingRef.current = false
    if (r.ok) {
      // すぐにセッションへ残す（更新しても、待機の画面のまま。再び依頼させない）
      print.onAccepted(r.number)
      setStatus('success')
    } else {
      setStatus('failed')
    }
  }, [print, url])

  // 印刷を受け付けたあとは、待機の画面だけ（ボタンを出さない。リセットで戻る）
  if (printNumber !== undefined && status !== 'success') {
    return <PrintWaiting number={printNumber} />
  }

  const pm = messages.print
  return (
    <div className="end">
      <h2>{m.end.title}</h2>
      <p>{m.end.lead}</p>
      <div className="end__body">
        <div className="end__side">
          <section>
            <h3>
              {m.end.yours}: {resolveName(p1.name, 'p1')}
            </h3>
            <StatSummary stats={p1.stats} />
            <p className="practice__note">{stage.name}</p>
          </section>
          <section>
            <h3>{m.end.qrTitle}</h3>
            {url ? (
              <>
                <p className="practice__note">{m.end.qrLead}</p>
                <p className="practice__note">{m.end.qrNameNote}</p>
                <p className="practice__note">{m.end.qrShareNote}</p>
              </>
            ) : (
              <p role="alert">{m.end.qrFailed}</p>
            )}
          </section>
          {print && url && (
            <section className="end__print">
              <p className="practice__note">{pm.lead}</p>
              <Button
                variant="main"
                disabled={status === 'sending' || status === 'success' || !!print.blocked}
                reason={print.blocked}
                onClick={() => void requestPrint()}
              >
                {status === 'sending' && <span className="spinner" aria-hidden="true" />}
                {status === 'sending' ? pm.sending : pm.button}
              </Button>
              <p className="end__print-status" role="status" aria-live="polite">
                {status === 'success' ? pm.success : status === 'failed' ? pm.failed : ''}
              </p>
            </section>
          )}
          {status !== 'success' && (
            <Button variant="sub" onClick={onReset}>
              {m.end.reset}
            </Button>
          )}
        </div>
        {url && (
          <section className="end__qr">
            <QrCode text={url} label={m.end.qrAlt} />
            <label className="end__url">
              <span>{m.end.urlLabel}</span>
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            </label>
          </section>
        )}
      </div>
    </div>
  )
}

/** 印刷を受け付けたあとの待機の画面。操作するものは置かない（take-home-print.md §7.3） */
function PrintWaiting({ number }: { number: number }) {
  const pm = messages.print
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 画面が切り替わったことを、読み上げでも分かるように
  useEffect(() => titleRef.current?.focus(), [])
  return (
    <section className="print-waiting" aria-labelledby="print-waiting-title">
      <svg className="print-waiting__icon" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" />
        <path d="M14 25l7 7 14-15" />
      </svg>
      <h2 id="print-waiting-title" ref={titleRef} tabIndex={-1}>
        {pm.waitingTitle}
      </h2>
      <p>{pm.waitingBody}</p>
      <p className="print-waiting__number">
        <small>{pm.numberLabel}</small>
        <strong>{number}</strong>
      </p>
    </section>
  )
}
