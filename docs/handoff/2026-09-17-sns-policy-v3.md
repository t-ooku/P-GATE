# SNS 方針 v3（2026-09-17 大隆さん決定）

| 項目 | 決定 |
| --- | --- |
| リール | 週 2 回: **火・金 20:15 JST**。必ず AI 女優 v1 の**声付き動画を Runway で新規生成**して投稿（既存素材の再利用なし）。生成は当日 06:00 JST（GitHub schedule `auto-runway-reel.yml`、main ブランチ、`0 21 * * 1,4`）。火=ユーザー向け、金=ショップ・セラー向け（`ops/runway/auto/themes.json` の `slots`、型は週ごとに順送り） |
| カルーセル画像フィード | 週 3 回: **月・水・土 20:00 JST**。`ops/social/carousels-v3.json` の 6 セット（ユーザー向け 3・セラー向け 3）を順送り。画像は `scripts/build-social-carousels.py`（Pillow、1080x1350、4 枚）が決定的に描き、`build-social-carousels.yml` がコミット・デプロイ。Instagram は CAROUSEL 親子コンテナ、X は画像最大 4 枚の 1 投稿 |
| 内容 | ユーザー向けとショップ・セラー向けを **50% ずつ** |
| X | Instagram と同じ内容を同日に流す。リール日・カルーセル日の旧「毎日案内」は投入しない（木・日のみ残る） |
| 旧方針 | 22 歳 v2 女優の毎日リール（`hoshilu-ai-actress-daily-v1`）と火木土の Instagram 静止画案内は 9/21 以降投入しない（`policyV3Allows`） |
| 監視 | `check-social-ai-actress-sla.mjs` を v3 に変更: 火金=Runway ペア、月水土=カルーセル ペア、木日=要求なし。将来在庫はカルーセルのみ 7 日分を要求 |
| 適用開始 | 2026-09-21（月）。それ以前の承認済み行は変更しない |

## 禁止（維持）
§33 の表現（必ず売れます／売上が上がります／多数のユーザー／業界No.1／確実に）は画像・キャプション・セリフに入れない（`build-social-carousels.py` と `auto-runway-reel.test.mjs` が機械検査）。セリフは固有名詞・数字なし。AI 生成の開示（※この動画はAI生成・AI加工映像です。 #AI生成）はリールのキャプションに必ず入れる。

## 2026-09-17 に行った本番操作（大隆さん承認済み）
- `runway_generation_jobs.runway-auto-stop-chasing-sales-20260909`（v2 女優、GENERATED_REVIEW_REQUIRED）→ FAILED_FINAL / OWNER_REJECTED。対応する `social_post_queue` 行 → CANCELLED。自動リールの BUSY を解消
- `social_post_queue` に `media_urls` 列を追加（migration 0080、本番 D1 適用済み）

## 2026-09-18 に行った本番操作
- `auto-runway-reel.yml`（main）の cron を火・金 06:00 JST（`0 21 * * 1,4`）に変更（push で当日=金曜分の生成が起動）
- `build-social-carousels.yml` と生成スクリプトは apply-patch の GITHUB_TOKEN ではワークフロー追加を push できないため直接コミット。ワークフローが 24 枚の JPEG と manifest を生成してコミット（`783526c`）

## 残り
- 9/21 以降に既に投入済みの旧方針の行（Instagram 静止画案内・X 案内）の扱いは大隆さん判断（既存行の UPDATE）

## 2026-10-14 追加: 買い物ノート（オウンドメディア）の紹介枠（大隆さん指示「SNSでオウンドメディアを宣伝して。今後も定期的に自動運用」）
- **毎週木曜 20:00 JST**（v3 でリールもカルーセルも無い曜日）に、Instagram と X へ同じ内容を出す。キャンペーン `hoshilu-media-notes`。
- 2 セットを週ごとに交互: `user-media-price-drops`（→ `/media/price-drops`）、`user-media-ranking-price`（→ `/media`）。リンクは UTM 付き（`utm_campaign=hoshilu_media_notes`）。
- 画像はカルーセルと同じく `build-social-carousels.py` が文字と図形だけで描く（商品写真・他社ロゴは使わない）。カルーセルの順送り（14 セット）には入れない。
- 投入は `social-autopilot` の `seedMediaQueue`（承認済みで投入、`post_id` 主キーで再実行しても増えない）。開始は 2026-10-15（木）。
- 止める時は `MEDIA_PLAN`（`src/social-weekly-plan-v3.mjs`）の曜日・開始日を変えるか、Instagram／X の自動投稿の既存スイッチを切る。
- 2026-10-14 追記（大隆さん「スレッズでもオウンドメディアを販促しよう」）: 同じ木曜 20:00 枠に **Threads** も追加。Threads は 1 投稿に画像 1 枚なので表紙の 1 枚と Threads 用の短い文（`threads_caption`）＋UTM 付きリンク（本文中で押せる）。`THREADS_EVERGREEN_AUTOPILOT_ENABLED=true` の間だけ投入。
