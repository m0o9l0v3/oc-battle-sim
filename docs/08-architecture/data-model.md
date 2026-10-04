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
- 編集中の途中の値（スライダーの1つ1つの変化など）は、そのつど保存しなくてよい。更新で失うのは、**編集中の1画面分**にとどまる。
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

1. **`?reset` があれば `clear()` し、S01 から始める**（個別リセット。frontend.md §9.1）。`?reset` の判定は、復元より前。
2. `load()` で保存を読む。**検証してから使う**: `p1`・`p2` は `validateConfig(…, 'import')`、`stage` は `validateStage(…, 'import')`、`matches` の各要素は、構造と、上限（`MAX_MATCHES`）を調べる。1つでも失敗したら、**保存全体を捨てて S01 から始める**（一部だけ使うと、設定の整合が崩れる。参加者に、壊れたデータを見せない）。
3. 親機から取得した `ProgressState.sessionId` が、保存の `sessionId` と**違う**場合は、`clear()` して S01 から始め、新しい `sessionId` を保存する（一斉リセットを受け取り損ねた台。event-control.md §9.1.1）。親機に接続できないときは、この比較をしない（直前の状態で続ける）。
4. 復元する画面:

| 保存の `screen` | 復元後の画面 | 理由 |
|---|---|---|
| S07、S10（対戦中） | **S06**（対戦準備） | 対戦中の途中状態は復元しない（user-flow.md §6.1.1） |
| S08、S11 | そのまま（`matches` から表示を作れる） | 結果は確定済み |
| S12 | S12（見た目・能力値・ステージを保持。QR を再表示できる） | 破棄はリセットのときのみ（Issue #18 のコメント(1)） |
| そのほか | そのまま | |

- 初めて `ProgressState` を取得したとき（保存に `sessionId` がない）は、取得した `sessionId` を、そのまま保存する。
- 保存がなく、親機の `sessionId` もまだ取得できないとき（初回の起動で、親機に接続できない）は、`sessionId: null` で始める。後で親機に接続できたら、そのとき初めて取得した値を保存する（その時点では、比較をしない）。

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
