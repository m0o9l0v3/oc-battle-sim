# oc-battle-sim

中学生向けオープンキャンパス「プログラミング体験 第2回」用の2D対戦Webアプリ。
ファイターの能力値やステージを設計し、対戦結果を観察して改善する（Design → Test → Evaluate → Improve）。

仕様: [docs/00-overview/system-overview.md](docs/00-overview/system-overview.md)

## 開発手順

Node.js 22.13 以上が必要。

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
| `net`        | 親機との通信（進行状態の取得）       |
| `progress`   | 親機の進行状態（フェーズ・リセット） |
| `input`      | 入力抽象化                           |
| `ui`         | 共通UI                               |
| `assets`     | 画像などの素材                       |

## 当日の親機サーバー

会場では、親機PCのローカルサーバー（`server/`）が、アプリの配信と進行管理を行う。
手順: [docs/01-experience/event-host.md](docs/01-experience/event-host.md)

```bash
npm run build    # BASE_PATH を指定せずにビルド
npm run host     # 親機サーバー（既定のポートは 8080）
```

## デプロイ

`main` への push で GitHub Actions（`.github/workflows/deploy.yml`）が build して GitHub Pages に配置する。
PR では `.github/workflows/ci.yml` が lint / format / test / build を実行する。
公開URL: https://m0o9l0v3.github.io/oc-battle-sim/

リポジトリの Settings → Pages → Source を **GitHub Actions** にしておくこと。
