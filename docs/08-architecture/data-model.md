# データモデル（data-model.md）

- 文書ID: ARCH-DATA
- バージョン: 0.1
- 状態: 草案
- 上位文書: [system-overview.md](../00-overview/system-overview.md)（§7.1、REQ-RPT-02）
- 関連: [frontend.md](./frontend.md)、[character-config.md](../02-fighter/character-config.md)、[stage-format.md](../04-stage/stage-format.md)、[battle-report.md](../07-report/battle-report.md)、[battle-rules.md](../03-combat/battle-rules.md)、[event-control.md](../01-experience/event-control.md)、[user-flow.md](../01-experience/user-flow.md)
- 関連Issue: #18（本書）、#8、#13、#16、#60（持ち帰りQR）

## 1. 概要

参加者のデータ（`CharacterConfig`、`StageData`、`MatchResult`、セッション）の型と、ブラウザ内の保存方法、リセット方法を一元的に定める。各分野の仕様が定義した型は**そのまま**採用し、型定義ファイル `src/model/` に集める。本書は、それらの**置き場所・保存・破棄**を決める。

## 2. 目的

- 型の定義を1か所にし、各分野の仕様と矛盾させない（型を二重に定義しない）。
- 更新（再読み込み）では体験を再開でき、リセットでは前の参加者のデータが残らない保存方式にする。
- 個人情報を保存せず、アカウントや永続プロフィールを持たない（§7.1）。

## 3. Requirements

| ID | 要求 | 本書での具体化 |
|---|---|---|
| REQ-RPT-02 | 各戦の設定を保存し、比較に使う | §4（`MatchResult` に両者の設定とステージを含める）、§6 |
| §7.1 | アカウント・永続プロフィールを持たない | §6.1（ブラウザ内のみ。サーバーへ送らない）、§8 |
| REQ-OPS-02 | リセットで全データを破棄、通信できなくても体験を止めない | §6.4、§6.5 |
| REQ-SHR-01 | 持ち帰り用QRで設定を復元 | §5（QRに入れるデータの範囲） |
| NFR-01 | 安定性 | §6.6（保存が使えなくても動く） |

## 4. 型の一覧と定義場所

型は `src/model/` に置く（純粋な型と定数だけ。ロジックを持たない。core 層の最下位。依存方向は [frontend.md](./frontend.md) §4）。

| 型 | ファイル | 定義の根拠 | 備考 |
|---|---|---|---|
| `Stats`、`Appearance`、`CharacterConfig`、`PlayerSlot` | `character.ts` | character-config.md §4 | |
| `StageData`、`CellValue`、`Spawn`、`STAGE_COLS`、`STAGE_ROWS` | `stage.ts` | stage-format.md §4、§5 | 24 × 14 は定数にまとめる |
| `MatchResult`、`PlayerMetrics`、`MatchOutcome` | `match.ts` | battle-report.md §6、battle-rules.md §10 | 比較（comparison.md）は `MatchResult` 2つだけを入力にする |
| `Phase`、`ProgressState` | `progress.ts` | event-control.md §8.1 | 親機から受け取る値。保存するのは `sessionId` だけ（§6.2） |
| `ScreenId`、`SessionData`、`SessionSnapshot`、`MAX_MATCHES`、`SESSION_STORAGE_KEY` | `session.ts` | 本書 §6 | 保存する形 |

- 各型の項目・範囲・検証規則は、それぞれの分野の仕様が正本。本書と食い違ったら、**分野の仕様を正とし、本書と `src/model/` を直す**。
- 検証関数（`validateConfig`、`validateStage`）は、各分野の `src/fighter/`、`src/stage/` に置く。`src/model/` には置かない。
- すべての値は JSON として書き出し・読み込みができる（関数、`undefined`、循環参照、`Date`、`Map`、`Set` を持たない）。`schemaVersion` は、将来の形式の変更を判断するために持つ。

## 5. データの流れ

```text
参加者の操作 ──▶ SessionData（メモリ。ui のセッションストア）
                    │ 変更のたびに保存（§6.3）
                    ▼
            localStorage（このブラウザ・このオリジン）
                    ▲ 更新（再開）のときに読む（§6.4）

SessionData ──▶ 持ち帰り用QR（#60。1P の CharacterConfig と StageData の部分）
               ※ 保存形式とは別。QRの形式は #60 が決める
親機 ──▶ ProgressState（メモリのみ。sessionId だけを保存データに持つ）
```

| データ | メモリ | ブラウザ内の保存 | 親機へ送る | QR に入れる |
|---|---|---|---|---|
| 1P・2P の `CharacterConfig` | ○ | ○ | **送らない** | 1P のみ（#60） |
| `StageData` | ○ | ○ | 送らない | ○（#60） |
| `MatchResult[]` | ○ | ○ | 送らない | 入れない |
| 画面の位置（`ScreenId`） | ○ | ○ | 送らない | 入れない |
| `sessionId` | ○ | ○ | — （親機から受け取る） | 入れない |
| 対戦中の途中状態（`MatchState`） | ○ | **保存しない** | 送らない | 入れない |
| エディタの「もどす」履歴、S09 の編集中の下書き | ○ | 保存しない（更新で失う。許容） | 送らない | 入れない |
| `ProgressState` の他の項目 | ○ | 保存しない | — | 入れない |

## 6. セッションと保存

### 6.1 保存先の決定

**`localStorage`（ブラウザ内。1つのキー `ocbs.session`）に、JSON で保存する。**

| 候補 | 判定 | 理由 |
|---|---|---|
| メモリのみ | 不採用 | 更新（再開）で消える。user-flow.md §6.1.1 は、更新で設定・ステージ・戦の記録を保持する |
| `sessionStorage` | 不採用 | タブを閉じる・ブラウザが落ちると消える。当日の安定性（NFR-01）のため、復旧できる範囲を広くしたい |
| **`localStorage`** | **採用** | 更新・タブの閉じ直し・ブラウザの再起動でも復元できる。ブラウザの「サイトのデータの削除」で破棄できる（通信不能な台の最終手段。Issue #18 のコメントの要件(4)）。HTTP（親機の配信）でも動く。サーバーを必要としない |
| IndexedDB | 不採用 | 容量が足りるうえ、非同期で複雑になる。保存量は小さい（§6.7） |

- 保存先は**ブラウザ内のみ**。参加者のデータを、サーバーへ送らない（event-control.md §8.2、§11）。
- `localStorage` はオリジンごとに分かれる。親機の配信（当日）と GitHub Pages（持ち帰り後）のデータは、**互いに見えない**。持ち帰りのデータの受け渡しは、QR（URL のフラグメント）だけで行う。
- 永続プロフィールは作らない。次のリセット（§6.5）または保存の削除まで残るだけで、アカウントとは結び付けない。

### 6.2 保存する形

```ts
type SessionSnapshot = {
  schemaVersion: 1
  sessionId: string | null // 親機の sessionId。親機がない構成（GitHub Pages）では null
  data: SessionData
}

type SessionData = {
  p1: CharacterConfig
  p2: CharacterConfig
  stage: StageData
  stagePresetId: string | null
  matches: MatchResult[] // matchNo の昇順
  screen: ScreenId // S01〜S12
}
```

- `sessionId` を、体験のデータと**同じ1つの値**に入れて、一度に書く（Issue #18 のコメント(2)）。データと `sessionId` が食い違う状態を作らないため。
- `stagePresetId` は、S04 で選んだプリセット（`null` はエディタで一から作った場合）。「プリセットからやりなおす」（stage-editor.md）に使う。
- `matches` は、`MatchResult` を**そのまま**持つ（比較は、`MatchResult` 2つだけから作る。comparison.md §3.1）。各 `MatchResult` が、両者の設定とステージを持つため、後で設定を変えても、過去の戦の記録は変わらない。
- 親機の時刻（`turnStartedAt` など）は保存しない（端末ごとの時計のずれが、保存データに入らないように）。

### 6.3 保存のタイミング

- **画面の遷移のとき**、**設定の確定のとき**（S02・S03・S04・S06・S09 の「つぎへ」）、**対戦の終了のとき**（`MatchResult` を追加したとき）に、スナップショット全体を保存する。**対戦中（60 Hz のループの中）には保存しない**（性能のため。対戦中の途中状態は保存しない）。
- **編集中の内容も保存する。** S02・S03・S04・S09 の作業中の値（`CharacterConfig`、作業中の `StageData`）は、**1つの編集が完了するたび**（ブロックの配置のドラッグの終わり、選択肢の変更、ポイントの配分の確定など）に、**デバウンス（約 300 ms）して保存する**。更新（再開）で編集内容が残る（stage-editor.md「ブラウザの更新（再開）」）。保存しないのは、「もどす」の履歴だけ。ドラッグの途中など、1操作の途中の値は保存しない。
- 保存は、`SessionRepository`（[frontend.md](./frontend.md) §9.2）を通す。

```ts
interface SessionRepository {
  load(): SessionSnapshot | null // 保存がない・読めない・検証に通らないときは null。例外を投げない
  save(snapshot: SessionSnapshot): void // 失敗しても例外を投げない
  clear(): void // 保存を破棄する。例外を投げない
}
```

### 6.4 読み込み（更新・再開）

起動時に、次の順に処理する。

1. **`?reset` があれば `clear()` し、S01 から始める**（個別リセット。frontend.md §9.1）。`?reset` の判定は、復元より前。**破棄したら、すぐに `history.replaceState` で URL から `reset` を取り除く**（残すと、その後の通常の更新が、再びリセットになり、新しい参加者の作業が消える）。
2. `load()` で保存を読む。**検証してから使う**: `p1`・`p2` は `validateConfig`、`stage` は `validateStage`（モードは、保存の `screen` が **S02・S03・S04・S09**（編集中。途中の状態を含む）なら `'editing'`、それ以外は `'import'`）、`matches` の各要素は、構造と、上限（`MAX_MATCHES`）を調べる。1つでも失敗したら、**保存全体を捨てて S01 から始める**（一部だけ使うと、設定の整合が崩れる。参加者に、壊れたデータを見せない）。
3. 親機から取得した `ProgressState.sessionId` が、保存の `sessionId` と**違う**場合は、`clear()` して S01 から始め、新しい `sessionId` を保存する（一斉リセットを受け取り損ねた台。event-control.md §9.1.1）。親機に接続できないときは、この比較をしない（直前の状態で続ける）。
4. 復元する画面:

| 保存の `screen` | 復元後の画面 | 理由 |
|---|---|---|
| S07、S10（対戦中） | **S06**（対戦準備） | 対戦中の途中状態は復元しない（user-flow.md §6.1.1） |
| S08、S11 | そのまま（`matches` から表示を作れる） | 結果は確定済み |
| S12 | S12（見た目・能力値・ステージを保持。QR を再表示できる） | 破棄はリセットのときのみ（Issue #18 のコメント(1)） |
| そのほか | そのまま | |

- 初めて `ProgressState` を取得したとき（保存に `sessionId` がない）は、取得した `sessionId` を、そのまま保存する。
- 保存がなく、親機の `sessionId` もまだ取得できないとき（初回の起動で、親機に接続できない）は、`sessionId: null` で始める。
- **`sessionId` が `null` の保存を、のちに親機から初めて取得した `sessionId` と合わせるとき:** 前の参加者のデータを引き継がないよう、次のように区別する。
  - **そのページを開いたまま**（再読み込みなしで、同じ参加者が続けている）なら、取得した値を**そのまま採用して保存する**（作業を消さない）。メモリ上の「この起動で作ったデータか」の印で判断する。
  - **保存から復元したデータ**（再読み込み・再起動のあと）で、保存の `sessionId` が `null` のところへ、親機の値が初めて届いたら、**不一致として扱い、破棄して S01 に戻る**（親機の応答がないまま、ターンをまたいだ台の、前の参加者のデータを見せない。event-control.md §9.4）。ただし、保存の `screen` が S01 で、データがまだ何もない（標準の値のまま）ときは、破棄せず採用してよい。

### 6.4.1 実装（#35）と、実装で定めた扱い

- 実装: `src/session/`（core。`state.ts` = セッション、`flow.ts` = 画面遷移の reducer `reduceFlow`、`persist.ts` = 検証・`SessionRepository`・`?reset`・起動 `boot`）、`src/ui/session.ts`（`useSession`。localStorage との接続）、`src/ui/AppShell.tsx`（画面の選択）。
- 次は、仕様を広げた、または、仕様に書いていなかった扱い:
  - **`matches` は `MatchRecord[]`**: `MatchResult` のうち、指標（`p1`・`p2`）を省略できる形。対戦指標の記録（#37）ができるまで、設定・ステージ・勝敗・時間だけを保存する。#37 のあと、必須に戻す。
  - **S06 も、編集中の画面として読み込む（`'editing'`）**: 2P の能力値を変えている途中（合計が 20 でない）が、あるため。S02・S03・S04・S09 に加えた。
  - **S04 の作業用のステージ（エディタの途中）は、保存しない。** 保存するのは、「つぎへ」で確定したステージ（検証済み）。更新（再開）で、確定したステージから、編集を始め直す。そのため、保存したステージは、どの画面でも全規則を通る。
  - **S01 は、保存を残さない**（何も作っていないため。リセットのあとに、保存が残らない）。
  - 画面の遷移の可否は `reduceFlow` が持つ。条件を満たさない操作は、状態を変えない。S09 の「もどる」は、変更を破棄して、直前の戦の能力値へ戻す。
  - 対戦（S07・S10）の開始時に、1P・2P・ステージを固定して（`Session.current`）、終了時に、その設定で戦の記録を作る。対戦中に編集が来ても、記録は変わらない。
  - **未完成の設定は、編集しない画面へ持ち込まない**: S02・S03・S04・S06・S09 の外へ出るとき（S06 から S05 へ戻る、途中で「もちかえる」、など）、合計が 20 でないなどの設定は、直前の戦の同じ側の能力値（なければ標準 5/5/5/5）へ戻す。再開で、保存が捨てられないため。
  - **S05 から S03 へ戻っている印**（`returnToPractice`）は、S03 の間だけ、保存に書く（更新でも、S03 の「つぎへ」が S05 へ戻る）。
  - **再戦の途中で更新（再開）したとき**: S06 から始まる。戦の記録があるので、「対戦開始」は S10（再戦）になり、終了は S11 へ。S06 の「もどる」は S09 へ。
  - リセット（S12 のボタンなど）のたびに、画面の部品の状態（S04 のエディタなど）を作り直す。
  - 親機との連携（`sessionId` の比較、一斉リセット、「もちかえる」の指示）は、#67・#68。`SHARE`（どの画面からも S12 へ。対戦中は除く）の操作は、reducer に用意した。

### 6.5 リセット（破棄）

| 種類 | きっかけ | 動作 | 戻り先 |
|---|---|---|---|
| 一斉リセット | 親機の操作で `sessionId` が変わる。参加者PCが、取得した `ProgressState` で検知（対戦中でも中断） | `SessionRepository.clear()` とメモリの破棄。新しい `sessionId` を保存 | S01 |
| 個別リセット | リセット用ブックマーク `/?reset`（親機に接続できているときのみ） | 同上 | S01 |
| 更新（再開） | 通常のブラウザの更新 | **破棄しない**（§6.4） | 同じ画面（対戦中は S06） |
| 通信不能な台 | ブラウザの「サイトのデータの削除」 | `localStorage` が空になる | 次の起動で S01 |

- **破棄は、保存とメモリの両方**。メモリだけ、保存だけ、にしない。
- 破棄の対象は**体験に関するすべて**（見た目・能力値・ステージ・戦の記録・画面の位置）。`SESSION_STORAGE_KEY` のキーを削除する（ほかのキーは使わない）。
- 持ち帰り後（GitHub Pages）には、親機がない（`sessionId` は `null`）。リセットは、`/?reset` と、ブラウザのデータの削除だけ。

### 6.6 保存が使えないとき

- `localStorage` が使えない（無効化、容量超過、プライベートブラウズ）ときは、`save` が何もせず、`load` が `null` を返す。**体験は止めない。** メモリだけで続け、更新（再開）ができなくなるだけ。
- 保存の失敗は、参加者に見せない（エラーを出さない）。ただし、開発・運用の確認のため、`console` に記録するのは構わない。
- 容量超過（`QuotaExceededError`）が起きたら、`matches` の古いものから減らして1回だけ再試行する。それでも失敗なら、保存を諦める。

### 6.7 保持する戦の数と容量

| 項目 | 値 |
|---|---|
| 保持する戦の数 | **20 戦**（`MAX_MATCHES`。battle-report.md §6、comparison.md §4 の暫定値を確定する） |
| 超えたとき | 追加のとき、**古い戦から捨てる**。`matchNo` は戻さない（増え続ける）。捨てた戦は、比較で選べない（comparison.md §4、§9） |
| 1 戦の大きさの目安 | 設定2つ + ステージ（24 × 14 のセル）+ 指標。JSON で約 2〜3 KB |
| 全体の目安 | 20 戦で、約 50〜60 KB。`localStorage` の容量（通常 5 MB 以上）に、十分収まる |

- ステージの `cells` は、保存では二次元配列のままにする（検証とデバッグのしやすさを優先）。容量に問題が出たら、`matches` の中のステージを、ステージの内容が同じなら共有する形（IDでの参照）に変える。そのときは `schemaVersion` を上げる。

## 7. 型どうしの関係

```text
SessionSnapshot
 ├─ sessionId
 └─ SessionData
     ├─ p1, p2 : CharacterConfig ── stats, appearance, name
     ├─ stage  : StageData ──────── cells[14][24], spawns{p1,p2}
     ├─ stagePresetId
     ├─ screen : ScreenId
     └─ matches: MatchResult[]
         ├─ p1Config, p2Config : CharacterConfig（その戦の設定のコピー）
         ├─ stage : StageData（その戦のステージのコピー）
         ├─ outcome : MatchOutcome
         └─ p1, p2 : PlayerMetrics
```

- `MatchResult` は、`SessionData` の `p1`・`p2`・`stage` を**参照せず、コピー**を持つ。S09 で能力値を変えても、既存の戦は変わらない（user-flow.md §6.2「既存の戦を上書きしない」）。
- 外観・名前は、再戦で変えない（S09 は能力値だけを変える）。

## 8. 個人情報

| 項目 | 方針 |
|---|---|
| 保存する個人情報 | **持たない。** 氏名・学校・連絡先・メールアドレス・端末の識別子・IP アドレスは、型に項目がなく、保存しない |
| 名前（`CharacterConfig.name`、`StageData.name`） | 参加者が自由に付ける。個人情報を入れないよう、入力画面に注意書きを出す（character-config.md §4、stage-editor.md）。10 文字・30 バイトまで（検証）。**ブラウザ内にだけ保存し、サーバーへ送らない。** QR には入る（#60）ため、注意書きが必要 |
| 識別 | 参加者・端末の識別をしない（event-control.md §11）。`sessionId` は、ターンごとの値で、人や端末に結び付かない |
| 時刻 | 親機の時刻や、対戦の開始時刻を保存しない（`MatchResult` に時刻を持たない。`durationSec` は対戦の長さだけ） |
| 外部への送信 | 解析・計測のサービスへ送らない。ログに、参加者のデータを含めない |
| 破棄 | リセット（§6.5）で、すべて破棄する |

## 9. 例外・制約

| 場面 | 扱い |
|---|---|
| 保存の形式の版が違う（`schemaVersion` が新しい・古い） | 読めない版は、保存全体を捨てて S01 から始める（移行処理は、版が増えたときに追加） |
| 保存が壊れている（JSON の構文エラー、型の違い） | 同上。参加者にエラーを見せない |
| 複数のタブで同時に開く | 後から書いたものが残る（最後の保存が勝つ）。タブ間の同期は行わない。運用では、1台1タブとする |
| 対戦中にブラウザを更新 | 途中状態は失われ、S06 から再開（`matches` に、その戦の `MatchResult` は無い。§6.4） |
| `matches` の `matchNo` が昇順でない・重複 | 検証に失敗。保存全体を捨てる |
| 型の変更が、分野の仕様と食い違った | 分野の仕様を正とする。本書と `src/model/` を直し、変更履歴に記録する |

## 10. Acceptance Criteria

- [ ] 各分野仕様の型と矛盾がない（§4。`src/model/` が、character-config.md、stage-format.md、battle-report.md、battle-rules.md、event-control.md の型をそのまま持つ）
- [ ] セッション内の保存方式（localStorage、1キー）とリセット方法（一斉・個別・更新・データ削除）が決まっている（§6）
- [ ] 個人情報を保存しない（§8）
- [ ] 共通型定義ファイル（`src/model/`）が型チェックを通る

## 11. 変更履歴

| 日付 | 変更内容 | 理由 | 影響範囲 |
|---|---|---|---|
| 2026-10-05 | 初版。保存先を `localStorage`（1キー）に決定。保持する戦の数を 20 に確定。`src/model/` を追加 | #18 の対応。Issue のコメントの要件（一斉リセット、S12 での保持、sessionId の同時保存、更新と個別リセットの区別、データ削除での破棄）を満たす | frontend.md（§4.1 に `model/` を追加）、battle-report.md §6、comparison.md §4、event-control.md §8.1（型の最終定義は本書）、#60、#68 |
| 2026-10-07 | #35 の実装。§6.4.1 に、実装の場所と、実装で定めた扱い（`MatchRecord`、S06 の編集中の扱い、エディタの途中は保存しない、S01 は保存しない）を追加 | 実装で定めたため | #37、#38、#39、#61、#67、#68 |
