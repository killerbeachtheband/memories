# Killer Beach MEMORIES — バンド版メモ

個人版 Memories（Notion連携）を、Killer Beach のメンバー記録サイトに転用したフォーク。
記録の置き場は **Google Sheets**（Notion のシート代を避けるため）。

## 記録シート
- 「Killer Beach MEMORIES — 記録シート」
  https://docs.google.com/spreadsheets/d/16N2fcTJAG94xfBznAptM3xrO0alUxDWsOGZnt_-vp3c/edit
- `entries` タブに1行 = 1記録。列:
  member / category / title / originalTitle / creator / rating（0–10）/ tags（カンマ区切り）/
  experiencedDate / releaseDate / hallOfFame（TRUE で殿堂入り）/ formative（TRUE で最も影響を受けた作品）/ note（一言）/ body（長文・任意）
- member: Yamashita / 鈴木智仁 / のむらりょうた / 江井龍世
- category: 映画 / 音楽 / アート / 舞台・ライブ / ゲーム / 建築 / 本
- シート内の「使い方」タブにも同じ説明あり。

## 同期の仕組み
- `scripts/sync_sheets.py` がシートを読み、`data.js` を再生成する（元の `sync_notion.py` と同じ出力形式 + `member` フィールド）。
- ローカル確認: シートを CSV で書き出して `python3 scripts/sync_sheets.py --csv entries.csv`
- 本番: `.github/workflows/publish-sheets.yml`（元の publish.yml と併置。使うのはこちら）
  - 毎時チェック + 手動実行 + `repository_dispatch: sheet_changed` で即時反映。
  - リポジトリ変数 `SHEET_ID` にシートIDを設定する。
  - **シートはファンに見せない（非公開のまま）**（2026-11-08 Yamashita 判断）。ファンが見るのはサイトだけ。
    そのため本番同期は gviz（リンク閲覧可が前提）ではなく、シート側 Apps Script から
    GitHub へ送る方式（repository_dispatch / data.js の push）に切り替える。

## シート→サイト同期（Apps Script・準備済み）
シートは非公開のまま使うので、同期はシート側から GitHub へ data.js を送る方式。
スクリプト本体は `integrations/sheet-sync.gs`（このフォーク内に用意済み）。

導入手順（バンドの GitHub アカウントとリポジトリができてから）:
1. シートの「拡張機能 > Apps Script」に `sheet-sync.gs` の内容を貼る。
2. Script Properties に `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_TOKEN` を登録
   （トークンは対象リポジトリの Contents: write のみの fine-grained PAT。コード直書き禁止）。
3. `setupTrigger()` を1回実行すると毎時自動反映。シート上の「MEMORIES」メニューから手動反映も可。
4. data.js が push されると `publish-sheets.yml` がサイトを再公開する。

## デザイン
- 元の voltage lime（#e2ff70）を Signal Orange（#FF4D00）に置換。フォントは Jost（Google Fonts）。
- メンバー絞り込み: メニュー内に All members / 各メンバーのフィルター。カードと詳細にもメンバー名を表示。
- 本体カラーは元のライトなギャラリー基調のまま。ダーク基調にするなら floating.css の plate/ink を反転させる追加作業が必要。

## デプロイ手順（未実施）
1. バンド用 GitHub リポジトリを作成し、このフォークを push。
2. リポジトリ変数 `SHEET_ID` を設定。シートを「リンク閲覧可」に変更。
3. Settings → Pages を GitHub Actions に設定し、`publish-sheets.yml` を手動実行。
4. 公開 URL を Instagram プロフィール等にリンク。
