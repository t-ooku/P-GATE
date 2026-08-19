# Claude → Codex 引き継ぎ: 2AI並行運用の再開（2026-08-19）

Codexのクレジット復活に伴い、大隆さん承認のもとで2AI並行運用を再開する。
本書はその役割分担と、Codexへの最初の依頼。従来の運用（docs/handoff/ での
相互報告、Claudeによるレビュー`hoshilu_claude_review_*`）を踏襲する。

## 役割分担

| 領域 | 担当 | 補足 |
|---|---|---|
| アプリ機能開発（src/public/test）＋直接push | **Codex** | pushできるのはCodexだけ。Claudeの変更もCodexが取り込み可 |
| 全pushのレビュー | **Claude** | 差分レビューを従来形式で継続。重大問題は即時報告 |
| Runway動画生成・リール公開・R2/D1運用 | **Claude** | 手動ワークフロー群（submit/fetch/publish）で運用中 |
| SNS投稿・キャプション・ペルソナ管理 | **Claude** | 2ペルソナ運用（v1=30〜50代/v2=若者）。権利台帳必須 |
| SEO記事コンテンツ | **Claude** | seo-pages.mjsへ追加済みの型を使用 |
| 戦略・計測分析・優先順位 | **Claude**（大隆さん決裁） | claude/プロジェクトドキュメントに記録 |

## 絶対ルール（両AI共通・従来どおり）

- 架空の数値・レビュー・実績を作らない。断定表現（最安/No.1等）を書かない
- D1本番への書き込み・課金を伴う操作・SNS公開は大隆さんの明示承認が必要
- 検索文そのものを保存しない（同意文の約束）。需要分析は正規化後のカテゴリ・属性のみ
  （大隆さん承認済み方針 2026-08-19）
- 手動ワークフローは workflow_dispatch のみ（tests/release_config.test.mjs が固定）
- テストが赤の状態で放置しない（赤の間はデプロイが止まり、全員の作業が滞る）

## Codexへの最初の依頼（優先順）

### 1. AI Overviewスニペット品質の改善（依頼4/実装系）
`public/index.html` ほか主要ページで、本文を `<main>`/`<article>` で構造的に分離し、
ナビ・通知設定・フッターのUIテキストが検索スニペットへ混入しない構成にする。
根拠: claude/hoshilu_ai_overview_seo_findings_20260818.md（実測で全ソースに
「本文以外の混入あり」）。FAQPage構造化データは維持。

### 2. モール公式ランキングを使った「ランキングで探す」の拡充（BUZZ Phase 1の起点）
既存の `src/marketplace-ranking.mjs`（楽天ジャンル別ランキングAPI・Yahoo!高評価
トレンドランキングAPI実装済み）と適用済みテーブル 0045/0046 を土台に、
小ジャンル単位のランキング表示を拡張する。SNS指標は正規APIで取得できないため
使わない（BUZZ指示書§9の欠損値ルール）。「界隈」テーマ名の生成はGeminiに
言語処理のみをさせ、順位の根拠はモール公式APIに限定する。
詳細: claude/hoshilu_buzz_discovery_directive_v3_2026-08-19.md（プロジェクト側）。

### 3. Seller LPの現状確認（調査のみ、実装は報告後）
セラー向けLP/導線の現状（存在・内容・登録フォーム項目）を調査し、
docs/handoff/ へ報告。改善実装は大隆さんの優先判断後。

## Claudeの現在進行分（Codexは触らないで欲しいもの）

- ops/runway/ 配下一式と .github/workflows/ の runway系・publish系ワークフロー
- リール第3弾（overseas-find v2・生成中）/第4弾（name-forgotten・待機中）の
  ジョブ行とR2オブジェクト
- marketing/social/HOSHILU_REELS_RIGHTS_LEDGER_2026-08.csv（ペルソナ台帳）

## 連絡方法

- Codex → Claude: docs/handoff/2026-08-19-codex-XX.md（従来形式: やったこと/
  テスト・デプロイ/Claudeへの依頼/状態）
- Claude → Codex: docs/handoff/2026-08-19-claude-XX.md ＋ レビューは従来どおり
- 緊急（本番障害・テスト赤の常態化）: 大隆さん経由
