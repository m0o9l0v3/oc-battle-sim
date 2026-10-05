# ファイターの動き（#29）

7 状態（Idle / Run / Jump / Fall / Attack / Hit / KO）を、少数のパーツの移動・回転・拡大縮小で動かす計算。**DOM を持たない、純粋な関数**（core 層）。仕様は [animation.md](../../../docs/02-fighter/animation.md)。

| ファイル      | 内容                                                                                   |
| ------------- | -------------------------------------------------------------------------------------- |
| `types.ts`    | `Pose`、`Clip`、`FighterSnapshot` など                                                 |
| `clips.ts`    | 7 つのクリップのデータ（数値はここだけ）、Attack・Hit のクリップの作成、`validateClip` |
| `sample.ts`   | `sampleClip(clip, t)`、`lerpPose`                                                      |
| `pose.ts`     | ポーズの合成（置き換え `replacePose`、重ね `overlayPose`）                             |
| `select.ts`   | 状態の選び方（`selectLocomotion` = 選択 A、`selectOverlay` = 選択 B）                  |
| `snapshot.ts` | 試合のファイター → `FighterSnapshot`（読み取りだけ）                                   |
| `animator.ts` | ファイター 1 体の、1 ステップの更新 `stepAnimator`（時刻、Hit の保持、つなぎ、着地）   |

Canvas への描画は、`src/render/fighter.ts`（adapter 層）。絵は `src/assets/fighter/`（#28）。

```ts
const renderer = createFighterRenderer({ looks: [lookP1, lookP2], combat })
// ステップごとに renderer.step(state)、描画ごとに renderer.draw(dc, prev, curr, alpha)
```

- 時間は、ゲームのステップで進める（壁の時計は使わない）。同じ入力から、同じポーズ。
- 描画は、試合の状態を書き換えない。見た目は、当たり判定に影響しない（REQ-FTR-05）。
- 動作確認: `?dev` の開発用ページ（「7状態のポーズ」「ファイターの描画とアニメーション」。`?perf` で FPS）。
