// ビジュアルテーマ（ファイターラボ）。仕様: docs/06-ui/ui-design.md §4〜§5
// 色・大きさの値は、ここと `ui/theme.css` の変数に、同じものを持つ（Canvas に描く色は、CSS の変数を読めないため）。
// 2つが食い違わないことは、theme.test.ts が確かめる。コードに、色を直接書かない
//   - 明るい背景、濃い文字。文字の対比は 4.5 : 1 以上。色だけで意味を伝えない（記号・文字を併用）
//   - フォントは OS のもの（外部から読まない）。外部の素材・既存作品のロゴを使わない（NFR-07）

export const APP_NAME = 'ファイターラボ'

/** 画面（CSS）の役割ごとの色。名前は、`ui/theme.css` の `--c-*` と同じ */
export const UI_COLORS = {
  bg: '#f6f8fc',
  surface: '#ffffff',
  text: '#1b2338',
  textSub: '#475069',
  /** 枠・区切り（隣の色との対比 3 : 1 以上） */
  border: '#5f739c',
  main: '#1d4ed8',
  onMain: '#ffffff',
  mainHover: '#1e40af',
  sub: '#e3e9f6',
  onSub: '#1b2338',
  selectedBg: '#e8efff',
  focus: '#b45309',
  success: '#166534',
  successBg: '#e6f4ea',
  danger: '#b91c1c',
  dangerBg: '#fdecec',
  warn: '#8a3b0a',
  warnBg: '#fff4e0',
  info: '#1e3a8a',
  infoBg: '#e8efff',
} as const

/** 1P は青系（暗め）、2P は橙系（明るめ）。色相だけでなく、明るさも変える（character-design.md §5.4）。文字（「1P」「2P」）を併用 */
export const PLAYER_COLORS = {
  p1: { bg: '#0a4f9e', text: '#ffffff' },
  p2: { bg: '#ffb347', text: '#1b2338' },
} as const

/** 対戦画面（Canvas）の色。やや暗めの落ち着いた色（ファイターとステージが目立つ） */
export const BATTLE_COLORS = {
  background: '#0f1420',
  outOfBounds: '#1a2030',
  stage: '#262f45',
  block: '#8fa3c8',
  blockEdge: '#5f739c',
  /** マウスの位置・スタート位置の縁 */
  highlight: '#ffffff',
  /** 検証で違反したセルの枠と ✕（暗い背景の上で、見やすい赤） */
  violation: '#ff5c5c',
  /** 暗い背景の上の、うすい重ね・文字（置けない行、マウスの見本） */
  tint: 'rgba(255,255,255,0.07)',
  tintStrong: 'rgba(255,255,255,0.18)',
  hoverBlock: 'rgba(143,163,200,0.45)',
  label: 'rgba(255,255,255,0.55)',
  grid: 'rgba(255,255,255,0.06)',
} as const

/** ファイターまわりの効果の色 */
export const EFFECT_COLORS = {
  /** 足元の影（プレビュー） */
  shadow: 'rgba(0, 0, 0, 0.18)',
  /** 攻撃の軌跡（持続の間、判定の範囲に沿って描く） */
  trail: 'rgba(255, 255, 255, 0.4)',
} as const

/** 文字の大きさ（ピクセル。ui-design.md §4.2）。`ui/theme.css` の `--fs-*`（rem）と同じ */
export const FONT_SIZES_PX = {
  /** 補足（注意書き・ヒント）。仕様の「本文 24」の例外（ui-design.md §4.2 の変更履歴） */
  note: 20,
  body: 24,
  heading: 32,
  title: 48,
  number: 48,
} as const

/** ボタンなど、押すものの最小の高さ（ピクセル） */
export const MIN_TARGET_PX = 56

/** OS に入っているフォントだけ（外部から読まない。会場の有線LANは、インターネットに出られない） */
export const FONT_FAMILY =
  '"Yu Gothic UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, "Noto Sans CJK JP", system-ui, sans-serif'
