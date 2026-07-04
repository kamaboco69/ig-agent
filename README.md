# IG Agent

Instagram 自動運用ツール。第一弾は **ストーリーズの自動作成＋投稿**。
構成は X Agent (x-step) を踏襲: Next.js 16 + Prisma 7 (Neon Postgres) + NextAuth v5 + Firebase App Hosting。

## できること（v1）

- Instagram プロアカウント連携（Instagram API with Instagram Login。Facebookページ不要）
- ストーリーズのAI自動作成
  - Claude が構成（メインコピー・サブコピー・背景プロンプト）を企画
  - gpt-image-1 が縦長背景を生成（未設定/失敗時はグラデーション背景にフォールバック）
  - satori + Noto Sans JP で 1080x1920 JPEG に文字を焼き込み（実行環境のフォント非依存）
- 今すぐ投稿 / 予約投稿（cron が自動公開）
- オートパイロット: アカウントごとに投稿時刻（JST）とテーマを設定 → 毎日自動生成して自動投稿
- 長期トークン（60日）の自動リフレッシュ

## セットアップ

```bash
npm install
cp .env.example .env   # 値を設定
npx prisma db push     # スキーマ反映（migrate dev は使わない）
npm run dev
```

### Meta 開発者アプリの作成（IG_APP_ID / IG_APP_SECRET）

1. https://developers.facebook.com/apps/ →「アプリを作成」→ ユースケースは「その他」→ 種類「ビジネス」
2. プロダクト「Instagram」を追加 → **API setup with Instagram business login** を選択
3. 「ビジネスログイン設定」で OAuth リダイレクトURIを登録:
   - `https://<本番ドメイン>/api/ig/callback`
4. 「InstagramアプリID」と「Instagramアプリシークレット」を `IG_APP_ID` / `IG_APP_SECRET` に設定
5. 開発モード中はアプリの「Instagramテスター」に対象IGアカウントを追加（IGアプリ側の設定 → アプリとウェブサイト で承認）
6. 一般公開するには `instagram_business_basic` / `instagram_business_content_publish` の App Review が必要

対象の Instagram アカウントは **プロアカウント（ビジネス or クリエイター）** であること。

### 注意（ストーリーズAPI仕様）

- 公開時、IG サーバーがこのアプリの `/api/story-image/[id]` へ画像を取りに来る。
  **localhost では実投稿できない**（生成・プレビュー・予約まではローカルで動作確認可能）。
- ストーリーズの API 投稿上限は 24 時間あたり 25 件（アカウント毎）。

## cron（Cloud Scheduler）

デプロイ後、以下を数分おき（推奨5〜10分）に叩く:

```
GET https://<本番ドメイン>/api/cron?task=all
Authorization: Bearer <CRON_SECRET>
```

- `task=publish` … 予約ストーリーズの公開
- `task=auto` … オートパイロット（自動生成→即投稿。時刻窓は45分）
- `task=maintain` … 長期トークンのリフレッシュ（1日1回で十分）

## Googleログイン

x-step と同じ Google OAuth クライアントを流用している。本番デプロイ時は
Google Cloud Console のそのクライアントに、承認済みリダイレクトURIとして
`https://<本番ドメイン>/api/auth/callback/google` を追加すること（localhost:3000 は登録済み）。

## デプロイ（Firebase App Hosting）

x-step と同じ手順。GitHub リポジトリを接続してバックエンド `ig-agent` を作成し、
`apphosting.yaml` の secret を Secret Manager に登録後:

```bash
firebase apphosting:rollouts:create ig-agent --project <project> --git-branch main
```

## ディレクトリ

- `src/lib/ig-api.ts` … Instagram Graph API ラッパー（OAuth・ストーリーズ公開2段階）
- `src/lib/story-generator.ts` … 企画(Claude) → 背景(gpt-image-1) → 合成
- `src/lib/story-image.tsx` … 1080x1920 JPEG 合成（satori + 同梱 Noto Sans JP）
- `src/lib/story-publisher.ts` … 実投稿（コンテナ作成→取り込み待ち→公開）
- `src/app/api/cron/route.ts` … 予約公開・オートパイロット・トークン保守
