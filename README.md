# MofuShelf（もふシェルフ）

iPhoneの拡大表示（幅320px〜375px）に最適化した、パステル調PWA漫画蔵書管理＆新刊チェックアプリです。

## 主な機能
- **3段階のスマート書籍登録**: バーコード連続スキャン（`978`/`979` 13桁フィルタ＆重複警告）、Gemini表紙AI認識、APIキー不要のタイトル一括検索（「1巻〜○巻まで」まとめ買い登録）
- **本棚・シリーズ管理**: 全巻所持進捗バー、抜け巻アラート、巻ごとのタグ（`特装版` / `貸出中` 等）＆一言メモ、作品削除（2段階確認付き）
- **新刊・お買い物リスト**: APIキー不要のリアルタイム新刊チェック、楽天ブックス / Amazon 購入リンク、Discord Webhook / ローカルPush通知
- **PWA＆オフライン動作**: Service Worker + IndexedDB 自動同期（＋任意でSupabaseクラウドDB連携）

---

## ローカル開発＆同じWi-FiのiPhoneから確認する手順

```bash
npm install
npm run dev:lan
```

1. 同じWi-Fiネットワークに接続されたiPhoneのブラウザで **`http://192.168.1.100:5173`**（またはPCに表示されたLAN IPアドレス）を開きます。
2. アプリ内の「設定」タブ → **「QRコードでiPhoneから開く」** を開くと、iPhoneの標準カメラで読み取れるQRコードも表示されます。

> **注意（iOS Safariのカメラ＆PWA制限について）**:
> HTTP（`http://192.168...`）接続では画面レイアウトや検索・本棚登録はそのまま試せますが、iPhone Safari で**カメラによるバーコード読取**および**オフライン対応（Service Worker）**を有効にするには、下記いずれかの無料HTTPSホスティングへの公開が必要です。

---

## 無料HTTPSデプロイ手順（iPhoneの「ホーム画面に追加」対応）

### 方法1: Vercel（推奨・最短1分）
`vercel.json` を同梱済みのため、そのままデプロイできます。

1. Vercel CLI または GitHub連携でリポジトリをインポートします。
   ```bash
   npx vercel --prod
   ```
2. ビルド設定は自動認識されます（Build Command: `npm run build` / Output Directory: `dist`）。
3. 発行された `https://〜.vercel.app` を iPhone の Safari で開き、**「共有」→「ホーム画面に追加」** をタップすると全画面PWAとしてインストールされます。

### 方法2: Cloudflare Pages（無料枠無制限）
`public/_redirects` および `public/_headers` を同梱済みです。

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create application** → **Pages** を選択（GitHub連携または `dist` フォルダを直接アップロード）。
2. Build command: `npm run build` / Build output directory: `dist`。
3. ローカルからCLIデプロイする場合:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name=mofushelf
   ```

### 方法3: GitHub Pages（GitHubにPushするだけ）
`.github/workflows/deploy-pages.yml` を同梱済みです。

1. GitHub で新規リポジトリを作成し、このフォルダを `main` ブランチへプッシュします。
2. リポジトリの **Settings → Pages → Source** を **GitHub Actions** に変更すると自動デプロイされます。

---

## 新刊自動チェック（GitHub Actions + Discord通知）

[`.github/workflows/new-release-check.yml`](.github/workflows/new-release-check.yml) により、毎日 JST 8:00 に楽天ブックスAPIで新刊をチェックし Discord Webhook へ通知できます。
リポジトリの **Settings → Secrets and variables → Actions** に以下を設定してください：
- `RAKUTEN_APP_ID`: 楽天ブックス アプリID
- `DISCORD_WEBHOOK_URL`: Discord チャンネルの Webhook URL
