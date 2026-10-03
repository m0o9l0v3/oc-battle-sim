# CharacterConfig 仕様（character-config.md）

- 文書ID: FTR-CONFIG
- バージョン: 0.1
- 状態: 草案
- 上位文書: [system-overview.md](../00-overview/system-overview.md)（REQ-FTR-02、REQ-RPT-02）
- 関連: [stat-system.md](./stat-system.md)、[glossary.md](../00-overview/glossary.md)、[user-flow.md](../01-experience/user-flow.md)

## 1. 概要

ファイター1体分の設定 `CharacterConfig` の構造、検証ルール、状態遷移、標準値を定義する。各戦の設定を保存して比較に使う（REQ-RPT-02）ほか、持ち帰り用QRで設定を運ぶ（REQ-SHR-01）ための、共通のデータとなる。

## 2. 目的

- 参加者が設定した内容（能力値・外観・名前）を、一つの型にまとめる。
- 対戦、Battle Report、比較、持ち帰り用QRが、同じ型を使う。
- 不正な設定を、対戦や復元に持ち込まない。

## 3. Requirements

| ID | 要求 | 本書での具体化 |
|---|---|---|
| REQ-FTR-02 | 4つの能力値を扱う | §4（`stats`） |
| REQ-FTR-05 | 外観は視覚のみ。当たり判定を変えない | §4（`appearance` は能力値・当たり判定と無関係） |
| REQ-FTR-06 | 短時間のカスタマイズ | §4（外観の選択式）、§7（デフォルト値） |
| REQ-EXP-01 | 設定内容を画面で確認できる | §4 |
| REQ-RPT-02 | 各戦の CharacterConfig を保存し、比較に使う | §6 |
| REQ-SHR-01 | 持ち帰り用QRで設定を復元する | §8 |

## 4. データモデル

```ts
type Stats = {
  attackPower: number // 2〜8 の整数
  defense: number // 2〜8 の整数
  jumpPower: number // 2〜8 の整数
  speed: number // 2〜8 の整数
}

type Appearance = {
  body: string // 選択肢のID（#9 で一覧を定義）
  face: string
  color: string
  accessory: string | null // なし = null
}

type CharacterConfig = {
  schemaVersion: 1 // 形式のバージョン。将来の変更に備える
  name: string // 表示名
  stats: Stats
  appearance: Appearance
}
```

| 項目 | 内容 |
|---|---|
| `schemaVersion` | 形式のバージョン。現在は 1。QRで運ぶとき、読み込み側が互換性を判断する |
| `name` | 参加者が付ける名前。0〜10文字（暫定）。未入力のときは、デフォルト名を使う（§7） |
| `stats` | 4つの能力値。範囲と合計は [stat-system.md](./stat-system.md) §5 に従う |
| `appearance` | 見た目の選択。選択肢の一覧は #9 で定義する。能力値と当たり判定に影響しない |

- すべての値は、JSON として書き出し・読み込みができる（関数や循環参照を持たない）。
- 外観の選択肢の数・IDは #9 で定める。本書では、IDが文字列であることだけを決める。
- 名前に個人情報を入れないよう、入力画面で注意書きを出す（名前は持ち帰り用QRのURLに入る。#60）。

## 5. 検証ルール

### 5.1 検証の種類

| 種類 | 内容 | 使う場面 |
|---|---|---|
| **編集中の検証** | 1項目ごとの範囲を調べる。合計ポイントの過不足は許す（途中の状態のため） | S02、S03、S09 の編集中 |
| **対戦開始の検証** | すべての規則を調べる。通らなければ、対戦を始められない | S06 → S07、S09 → S10 |
| **読み込みの検証** | 外部（持ち帰り用QR）から読み込んだ設定を、すべて調べる | 復元時（#60、#61） |

### 5.2 規則

| コード | 規則 | 編集中 | 対戦開始 | 読み込み |
|---|---|---|---|---|
| `STAT_NOT_INTEGER` | 能力値は整数 | ○ | ○ | ○ |
| `STAT_OUT_OF_RANGE` | 能力値は 2 以上 8 以下 | ○ | ○ | ○ |
| `POINT_TOTAL_NOT_20` | 4つの能力値の合計が 20 | — | ○ | ○ |
| `NAME_TOO_LONG` | 名前は 10 文字以内 | ○ | ○ | ○ |
| `APPEARANCE_UNKNOWN` | 外観のIDが、選択肢に存在する | ○ | ○ | ○ |
| `SCHEMA_UNSUPPORTED` | `schemaVersion` が、読み込める版 | — | — | ○ |
| `MALFORMED` | 型が合わない（項目の欠落、型の違い） | ○ | ○ | ○ |

### 5.3 検証関数

```ts
type ValidationError = { code: string; field: string }

validateConfig(config: unknown, mode: 'editing' | 'match' | 'import'):
  { ok: true; config: CharacterConfig } | { ok: false; errors: ValidationError[] }
```

- 例外を投げない。不正な入力でも、`ok: false` を返す。
- 参加者向けのメッセージは、`code` から、設定ファイルの日本語に変換する（画面の文言を、コードに直接書かない）。
- メッセージの例（暫定）:
  - `POINT_TOTAL_NOT_20`: 「あと ○ポイント つかおう」
  - `STAT_OUT_OF_RANGE`: 「2〜8の あいだで えらぼう」
  - `NAME_TOO_LONG`: 「なまえは 10文字までだよ」

### 5.4 読み込みに失敗したとき

- 持ち帰り用QRなど、外部から読み込んだ設定が無効なときは、**エラーを画面に出さず**、標準の設定（§7）で始める（参加者の体験を止めない）。
- 項目の一部だけが無効な場合も、全体を破棄して標準の設定で始める（一部だけ使うと、能力値の合計が崩れるため）。
- 詳細は、持ち帰りの仕様（#60）で扱う。

## 6. 状態遷移

```text
編集中（draft）
  ↓ 対戦開始の検証を通過し、対戦を始める
固定（locked）  ← 対戦中は変更されない
  ↓ 対戦が終わる
記録（snapshot）  ← MatchResult に、使った設定として紐づく
```

- **固定:** 対戦を始めた時点で、1P・2P の `CharacterConfig` の**複製**を作り、その戦の間は変更しない。
- **記録:** 戦が終わると、複製が `MatchResult` に紐づき、比較（S11）で使われる（REQ-RPT-02）。
- 再設計（S09）は、直前の戦の設定をもとに、新しい編集中の設定を作る。**既存の記録は上書きしない。**
- 再戦に進める条件は、**1P の `stats` が、直前の戦から1つ以上変わっていること**（[user-flow.md](../01-experience/user-flow.md) §5.9）。

### 6.1 変更の判定

```ts
statsDiff(before: Stats, after: Stats): { key: keyof Stats; before: number; after: number }[]
hasStatChange(before: Stats, after: Stats): boolean
```

- `statsDiff` は、値が違う能力値だけを返す。比較画面（S11）で、変更点を示すために使う。
- `hasStatChange` は、S09 から再戦に進めるかの判定に使う。外観・名前の違いは、能力値の変更に含めない。

## 7. 標準値とデフォルト

| 項目 | 値 |
|---|---|
| 標準の `stats` | `{ attackPower: 5, defense: 5, jumpPower: 5, speed: 5 }` |
| 1P のデフォルト名 | 「ファイター」（暫定。#9、#27 で最終確定） |
| 2P のデフォルト名 | 「あいて」（暫定） |
| 標準の `appearance` | #9 で定義する、デフォルトの組み合わせ |
| 2P の初期設定 | 標準の能力値で始まり、後から能力値だけ変更できる（[user-flow.md](../01-experience/user-flow.md) §5.6） |

- 標準の設定を生成する関数 `createDefaultConfig(player: 'p1' | 'p2')` を用意する。
- 「標準設定に戻す」は、`stats` だけを標準に戻し、外観と名前は変えない。

## 8. 持ち帰り用QRとの関係

- `CharacterConfig` は、持ち帰り用QR（REQ-SHR-01）に入れる設定のうち、ファイターに関する部分。
- QR に入れる形式（圧縮、順序、バージョン）は、#60 で定める。型の変更は `schemaVersion` で扱う。
- 検証は、**読み込みの検証**（§5.1）を使う。

### 8.1 データ量の見積もり

| 項目 | 文字数の目安 |
|---|---|
| `stats`（4つの数字） | 4 |
| `appearance`（IDの4つ） | 数文字〜十数文字 |
| `name`（最大10文字、UTF-8 を Base64URL にすると） | 最大 約40文字 |
| `schemaVersion` | 1 |

ステージのデータを含めた全体の上限は、#60 と #13 で、QRとして読み取れる長さから決める。名前を短くするほど、余裕ができる。

## 9. 例外・制約

| 場面 | 扱い |
|---|---|
| 名前が未入力 | デフォルト名を使う |
| 名前に絵文字や特殊文字 | 文字数は、見た目の1文字を1とする（暫定）。表示できない文字は、画面側で扱う（#9、#27） |
| 外観の選択肢が将来増減した | 古いIDは `APPEARANCE_UNKNOWN` になる。読み込み時は、標準の設定で始める（§5.4） |
| 能力値の係数を調整した（#25） | 保存済みの設定は、能力値だけを持つため影響を受けない（変換は実行時に行う） |

## 10. Acceptance Criteria

- [ ] `CharacterConfig` の型（能力値・外観・名前）が定義されている（§4）
- [ ] 検証ルールと、検証する場面ごとの違いが定義されている（§5）
- [ ] 対戦開始時に設定が固定され、戦ごとに記録される状態遷移が定義されている（§6）
- [ ] 標準設定（5/5/5/5）の生成と、標準に戻す動作が定義されている（§7）
- [ ] 能力値の変更の判定（`hasStatChange`）が定義されている（§6.1）
- [ ] 外部から読み込んだ不正な設定の扱いが定義されている（§5.4）
- [ ] 持ち帰り用QRとの関係が示されている（§8）

## 11. 変更履歴

| 日付 | 変更内容 | 理由 | 影響範囲 |
|---|---|---|---|
| 2026-10-04 | 初版 | #8 の対応 | #9、#16、#18、#26、#27、#35、#60、#61 が参照する |
