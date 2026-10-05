// 物理の定数。単位はセル（ステージの1マス = 1）と秒。
// 出どころ: docs/02-fighter/stat-system.md §6.1、docs/03-combat/recovery.md §3、knockback.md §6
// 調整は #25。調整するときは、仕様書の数値も合わせて更新する。

/** 固定ステップの頻度（Hz）と、1ステップの秒数（combat-system.md §4） */
export const STEP_HZ = 60
export const DT = 1 / STEP_HZ

/** 重力（セル/秒²）。全員同じ */
export const GRAVITY = 37.5

/** 基準の移動速度（セル/秒）。speed 5 のとき */
export const BASE_SPEED = 3.75

/** 基準のジャンプ高さ（セル）。jumpPower 5 のとき。oc26-stage の 9.0² ÷ (2 × 0.5) ÷ 48（stat-system.md §6.1） */
export const BASE_JUMP_HEIGHT = 81 / 48

/** 能力値 1 ポイントあたりの変化の係数（factor = 1 + K × (v − 5)）。stat-system.md §6.2 */
// 調整後の値（#25。docs/03-combat/balance.md）。speed は、0.10 だと、速さが勝敗を支配したため 0.075 に下げた。
// 最小の移動速度は上がる（2.63 → 2.91 セル/秒）ので、ステージ検証の到達可能性は、より安全側になる
export const K_SPEED = 0.075
export const K_JUMP = 0.1

/** 空中ジャンプの回数（地面のジャンプは別。recovery.md §3.1） */
export const AIR_JUMPS = 2

/** 空中の横の動き（recovery.md §3.2） */
export const AIR_ACCEL = 60 // 入力の向きへの加速（セル/秒²）
export const AIR_DRAG = 10 // 入力がないときの減速（セル/秒²）

/** 地面の上の摩擦。吹き飛ばされて地面を滑るときの減速（knockback.md §6）。入力がないときの停止にも使う */
export const GROUND_FRICTION = 60

// --- 以下は、仕様書に値がなく、実装で定めた暫定値（#25 で調整し、確定したら仕様書に書く） ---

/** 地面で左右を押したときの、目標の速さへの加速（セル/秒²）。約 2 ステップで目標に届く */
export const GROUND_ACCEL = 150

/**
 * 最大落下速度（セル/秒）。stat-system.md §6.1 は「別途（#22）」。
 * 吹き飛ばしの距離の表（knockback.md §7。150 % の標準で上向きの速さ約 36 セル/秒）を変えない大きさにする
 */
export const MAX_FALL_SPEED = 40

/** 1回の移動で進む距離の上限（セル）。これより長い移動は分割して判定し、薄い足場のすり抜けを防ぐ */
export const MAX_SUBSTEP = 0.25
