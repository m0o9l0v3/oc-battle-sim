# oc-battle-sim

中学生向けオープンキャンパス「プログラミング体験 第2回」用の2D対戦Webアプリ。
ファイターの能力値やステージを設計し、対戦結果を観察して改善する（Design → Test → Evaluate → Improve）。

仕様: [docs/00-overview/system-overview.md](docs/00-overview/system-overview.md)

## 開発手順

Node.js 22.12 以上が必要。

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 型チェック + 本番ビルド
npm run test     # ユニットテスト (Vitest)
npm run lint     # ESLint
npm run format   # Prettier で整形
```

## ディレクトリ構成

`src/` 配下に論理モジュールを置く（[system-overview.md](docs/00-overview/system-overview.md) §9）。

| ディレクトリ | 役割                                 |
| ------------ | ------------------------------------ |
| `engine`     | ゲームループ・描画基盤               |
| `physics`    | 移動・衝突判定                       |
| `combat`     | 攻撃・ダメージ・吹き飛ばし           |
| `battle`     | 撃墜・勝敗など試合進行               |
| `stage`      | ステージデータ・検証・エディタ       |
| `fighter`    | ファイター設定・描画・アニメーション |
| `report`     | 対戦指標・Battle Report・比較        |
| `net`        | 通信・ルーム                         |
| `input`      | 入力抽象化                           |
| `ui`         | 共通UI                               |
| `assets`     | 画像などの素材                       |
