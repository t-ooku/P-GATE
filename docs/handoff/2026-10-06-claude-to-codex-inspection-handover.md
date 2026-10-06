# Codex 定期点検 引き継ぎ（2026-10-06 大隆さん決定）
受領日: 2026-10-06。点検はCodexが担当。Claudeは制作・運用に専念し、点検を依頼しない。既存点検は重複作成しない。
## 既存
P-GATE production-monitor.yml（5分＋毎時）、毎時read-codex-kpi-snapshot.mjs、月曜07:07 seller-promo-weekly-record.yml、起動時セルフチェック、黒谷HP10:00巡回を継続。既存health/OAuth/SNS在庫/検索SLI/週次セラー販促は再取得しない。
## P-GATE: 毎日08:30 JSTまで
docs/handoff/YYYY-MM-DD-codex-selfcheck.mdを異常なしでも毎日1本保存。D1 17629324-b771-4348-982c-c25da48c29b2はSELECTのみ、QA/INTERNAL除外。
1.07:22の9件search_qa_resultの本命商品名とカテゴリの意味一致を判定。PASS数を実績にしない。
2.search_backend_failed/search_provider_degradedをcampaign診断コード別件数。
3.target_price_observationsの24h reason別NO_CANDIDATES/NO_MATCH/ABOVE_TARGET/REACHED。前者偏重なら長すぎる検索語、後者なら厳しすぎる同一判定を仮説として1行（因果は断定しない）。
4.SELECT COUNT(*) FROM price_observationsの前日増加。
5.SNS status IN ('APPROVED','PUBLISHING') AND last_error<>''の件数/content_id。Issue#252既知行との差分のみ報告、UPDATEしない。
6.モール別click/shown CTR、shown=0は未計測。検索→モール1タップ到達率。
7.A流入/B検索しない/C正解が出ない/Dモールへ行かない/E登録しない/F戻らないの最大ボトルネック1つと次の修正。比較可能な率と母数で判断、データ不足なら未計測。
8.前日Claude成果物social_post_queue追加、検索精度改善・教師データcommitの有無。欠落は「Claude 日次作業 欠落: 名前」、記録だけ。
9.openで14日以上動きのないIssue一覧。
## 月曜selfcheck SEO
全日本語ページtitle+descriptionの2-gram Dice>=0.40の対、新規と既存>=0.50要注意。repoと本番sitemap url数一致、全日本語200。evaluateSeoPageQuality最小100、npm test全件。記事増産停止、閲覧→検索開始0の原因所見1行。
## 毎月1日selfcheck
Amazon hoshilu00-22期限2027-02-09、適格販売3件（自己購入不可）。残り日数/HOSHILU Amazon送客数。本人作業はアソシエイト・セントラルの適格販売件数確認。
## 黒谷HP: 10:00巡回へ追加
monitor/YYYY-MM-DD_1000-codex.mdとSTATUS.md。
メニューカードLINE https://line.me/R/ti/p/@zpd1355x。aboutに万件/万人/1万/2万/件以上/人以上なし、全ページに「性の経験」「1万人」なし。
introduction配下instagram/threads/youtube/@mai.kurotani/@uchu.1117なしをCloud Browser実表示で確認。
GET /api/content/statusはsource:github,last_error:null,columns_published前回以上。
queuedが本番に出ていればpublished更新（既存手順）。月曜390px/1280px実表示、robots/sitemap存在。
旧§8-3 Cowork単独公開廃止、Codexが公開主担当。
## hoiku-shift: 毎朝09:30 JST Actions
本番https://hoiku-shift.mygate-jp.workers.dev healthまたはトップ200。Cron */15配置不足/0 0 * * *資格期限の直近失敗をCloudflareログ/D1実行記録で確認可能な範囲。deploy.yml直近24h成否。週1 D1 d1d29bdf-4647-4d38-93ec-7b8db572cdac Time Travel/バックアップ利用可能性（復元実行しない）。個人情報は出さない。
## trioland: 毎朝Actions
既存site-smoke.ymlにschedule追加（新規workflow不要）。https://hoiku.triocareer.jpと放デイPages主要ページ200、問い合わせAPI GET/healthのみ（実送信禁止）、求人SEO最終commit日。
## itg: 月曜Actions
https://itg-social-publisher.mygate-jp.workers.dev生存、投稿ジョブ失敗、Instagram/X OAuth切れ。X_BILLING_ENABLED=false想定内。
## 対象外
-Project-GATEは仕様書のみ、点検不要。
## 共通
scheduleはmainに定義、失敗は重複しない[AUTO] Issue。各AGENTS.md（黒谷CODEX_INSTRUCTIONS.md）に名前/頻度/成果物追記。
D1書込/UPDATE/DELETE、SNS公開、課金、問い合わせ実送信、価格/規約変更は本人承認なし禁止。検索文/写真/個人情報/Secretを取得・記録しない（固定QA商品名のみ意味判定対象）。取れない値は未計測（理由）、0と区別。
amazon_creators_configured/sp_api_base_configured/unmet_demand_sync_configured/TIKTOK/自己参照GITHUB_SCHEDULE_HEARTBEAT_STALEは想定内。
変化なし報告1行「プロジェクト 点検 日付: 変化なし」。変化あり3行以内＋「大隆さんがやること」本人限定URL/場所/手順、なければ「ない」。
状態語: 本番確認済み/実装済み・本番未確認/一部実装/未実装/不具合あり/要確認。
完了記録docs/handoff/YYYY-MM-DD-codex-inspection-setup-done.mdに何を/頻度/出力場所と未実装を明記。
