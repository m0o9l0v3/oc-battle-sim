// 入力の抽象化。core（対戦）が受け取る唯一の入力の形。
// 仕様: docs/08-architecture/frontend.md §5、docs/06-ui/pc-ui.md §5

/** 1ステップ分の、1人の生の操作 */
export type PlayerInput = {
  /** そのステップで押している（短い入力も、1ステップ分は含める） */
  left: boolean
  right: boolean
  /** そのステップで「押した瞬間」があった（エッジ。ラッチ済み） */
  jumpPressed: boolean
  attackPressed: boolean
}

export const NO_INPUT: Readonly<PlayerInput> = Object.freeze({
  left: false,
  right: false,
  jumpPressed: false,
  attackPressed: false,
})

export type SampleContext<O = unknown> = {
  /** 試合内のステップ番号 */
  step: number
  /** 盤面の読み取り専用ビュー（簡易CPUだけが使う。ほかの入力ソースは無視する） */
  observation?: O
}

/** 入力ソース（キーボード、仮想パッド、簡易CPU、リプレイ、…）。対戦の側は、これだけを知っている */
export interface InputSource<O = unknown> {
  /** 次のステップの入力を取り出す。ラッチしたエッジは、ここで消費する。ステップごとに1回だけ呼ぶ */
  sample(ctx: SampleContext<O>): PlayerInput
  dispose(): void
}
