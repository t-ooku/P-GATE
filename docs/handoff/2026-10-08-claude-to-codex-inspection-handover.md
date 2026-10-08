# Codex 定期点検 引き継ぎ指示書（2026-10-06 大隆さん決定／2026-10-08 Claude→Codex）

## 0. 結論
- **各プロジェクトの定期点検は、今日から Codex が一手に担当する。** Cowork（Claude）の定期点検は全部止めた（最後の2本「HOSHILU 運用点検（毎朝・統合）」「黒谷真衣HP 本番監視（毎朝）」も 2026-10-08 に停止済み。`monitor/YYYY-MM-DD.md`（Cowork版）は今後出ない）。
- Claude（Cowork／Claude Code）は**制作と運用**（コラム・販促素材・検索精度改善・教師データ・機能開発）に専念する。点検の依頼や結果の確認を Claude に回さないこと。
- **すでに Codex または GitHub Actions がやっている点検は、二重にやらなくてよい。** 下の §1 は「もうやっているもの＝そのまま続ける、追加しない」。新しく始めてほしいのは §2 以降だけ。
- 新しい点検は、既存の点検（起動時セルフチェック・黒谷HP 10:00 巡回）に**項目を足す形を優先**し、実行の本数を増やしすぎない。

## 1. すでにやっているもの（そのまま続ける。重複して作らない）

| プロジェクト | 既存の点検 | 頻度 |
|---|---|---|
| P-GATE（HOSHILU） | Actions `production-monitor.yml`（health・配信資産・契約／検索SLI／AI女優SNSのSLA、失敗で `[AUTO][HOSHILU]` Issue） | 5分ごと＋毎時 |
| P-GATE | Actions 毎時 `read-codex-kpi-snapshot.mjs`（集計KPI） | 毎時 |
| P-GATE | Actions `seller-promo-weekly-record.yml` → `docs/handoff/<日付>-seller-promo-weekly.md` | 月曜 07:07 JST |
| P-GATE | Codex 起動時セルフチェック（health・AUTO Issue・`*-claude-to-codex-*`・月曜のseller-promo）→ `docs/handoff/<日付>-codex-selfcheck.md` | 毎セッション |
| kurotani-hp-ops | Codex 巡回 → `monitor/YYYY-MM-DD_1000-codex.md`・`STATUS.md` | 毎朝 10:00 JST |

上記で見ている項目（/health の ok・missing・weak、OAuth、SNS在庫、検索SLI、セラー販促の週次など）は、§2 以降で**もう一度取りに行かない**。

## 2. 新しく始めてほしい点検

### 2-1. P-GATE（HOSHILU）— 毎朝の selfcheck に追加（毎日 08:30 JST までに）
今は「異常がある日だけ」書いている `docs/handoff/<日付>-codex-selfcheck.md` を、**毎日必ず1本**書く形にし、次の項目を足す（旧 Cowork「日次レポート」「本番監視＋Codex報告チェック」の後継）。D1 は読み取りのみ（`17629324-b771-4348-982c-c25da48c29b2`）。QA/INTERNAL は除外。

1. **検索品質カナリア（07:22 JST の9件）の意味判定**: `search_qa_result` の PASS/FAIL 数ではなく、本命の商品名を読み、検索語のカテゴリと本当に合っているか判定する（2026-09-03 に「9/9 PASS、実際は 2/9」の前例あり）。
2. **写真検索の失敗**: `search_backend_failed`／`search_provider_degraded` を診断コード（campaign）別に件数。
3. **希望価格ウォッチ巡回**: `target_price_observations` 24h を reason 別（NO_CANDIDATES／NO_MATCH／ABOVE_TARGET／REACHED）。NO_CANDIDATES 偏重なら検索語が長すぎ、NO_MATCH 偏重なら同一判定が厳しすぎ、と所見を1行。
4. **価格記録の増加**: `SELECT COUNT(*) FROM price_observations` が前日より増えているか。
5. **SNS 無限リトライ**: `status IN ('APPROVED','PUBLISHING') AND last_error<>''` の件数と content_id（既知 Issue #252 の新規発生だけ報告。既存行の UPDATE は大隆さん承認事項なので直さない）。
6. **モール到達**: モール別 click／shown のクリック率（shown 0 のモールは「未計測」）、検索→モールの1タップ到達率。
7. **最大ボトルネックを1つ**: A流入／B検索しない／C正解が出ない／Dモールへ行かない／E登録しない／F戻らない のうち実数が最も悪いもの1つと、次に直すこと。
8. **Claude 側の自動作業の成果物チェック**: Claude が毎日出すもの（日次販促の `social_post_queue` 追加、検索精度改善・教師データのコミット）が前日分あるか。無ければ「Claude 日次作業 欠落: <名前>」と書く（直すのは Claude 側なので、Codex は記録だけ）。
9. **長期放置 Issue**: open のまま 14 日以上動きのない Issue（例 #369）を列挙。

### 2-2. P-GATE — SEO 品質監査（週1・月曜のみ）
selfcheck の月曜版に追記。
- 全日本語ページの title+description の 2-gram Dice 係数 0.40 以上の対（新規が既存と 0.50 以上なら要注意）。
- リポジトリ sitemap.xml の `<url>` 数と本番 sitemap の数の一致、全日本語ページ 200。
- `evaluateSeoPageQuality` の最小値 100、`npm test` 全件合格。
- SEO 記事はまだ増やさない方針（記事閲覧→検索開始が 0）。「読まれているのに検索に繋がらない」原因の所見を1行。

### 2-3. P-GATE — Amazon アソシエイト 180 日期限（毎月1日）
- ID `hoshilu00-22`、期限 **2027-02-09** までに適格販売3件（自己購入不可）。残り日数と、HOSHILU 内の Amazon 送客数を書き、「大隆さんがやること」に「アソシエイト・セントラルで現在の適格販売件数を確認」を入れる。

### 2-4. kurotani-hp-ops（黒谷真衣HP）— 10:00 巡回に追加
Cowork の 09:00 監視を止めたので、その項目のうち Codex 巡回に無いものを足す。結果は今と同じ `monitor/YYYY-MM-DD_1000-codex.md`。
1. メニューカードのボタンのリンク先に `https://line.me/R/ti/p/@zpd1355x` がある。
2. `/about` に実績数字（万件・万人・1万・2万・件以上・人以上）が無い。全ページに「性の経験」「1万人」が無い。
3. `/introduction` 配下に instagram／threads／youtube／@mai.kurotani／@uchu.1117 が無い（Cowork は WebFetch で取れなかった。Cloud Browser で確認する）。
4. `GET /api/content/status` が `source: github`、`last_error: null`、`columns_published` が前回以上。
5. `content/column/` の queued が本番に出ていれば published に更新（今の運用どおり）。
6. 週1（月曜）: 390px／1280px の実表示確認、robots.txt・sitemap.xml の有無。
- 指示書 §8-3 の「Codex 停止時の Cowork 単独公開」は**廃止**。Codex が公開の主担当。

### 2-5. hoiku-shift（HoikuPilot）— 新規・毎朝 09:30 JST（Actions cron で可）
今は運用監視が無い。個人情報はログ・報告に出さない。
1. 本番 `https://hoiku-shift.mygate-jp.workers.dev` の health（またはトップ）が 200。
2. Worker Cron（`*/15` 配置不足検知、`0 0 * * *` 資格期限確認）が直近で失敗していないか（Cloudflare のログ／D1 の実行記録で確認できる範囲）。
3. 直近 24h の `deploy.yml` の成否。
4. 週1: D1 `hoiku-shift`（`d1d29bdf-4647-4d38-93ec-7b8db572cdac`）の Time Travel／バックアップが取れる状態か。

### 2-6. trioland-social-publisher — 新規・毎朝（Actions cron で可）
1. `https://hoiku.triocareer.jp` と放デイサイト（Pages）の主要ページが 200。既存 `site-smoke.yml` を **schedule でも動かす**だけでよい（新しく作らない）。
2. 問い合わせ API の生存確認（**GET か health のみ。実送信しない**）。
3. 求人 SEO 記事の自動追加が止まっていないか（最終コミット日）。

### 2-7. itg-social-publisher — 新規・週1（月曜）
- Worker `https://itg-social-publisher.mygate-jp.workers.dev` の生存、投稿ジョブ失敗の有無、Instagram/X の OAuth 切れ。`X_BILLING_ENABLED=false` は既知・想定内。

### 2-8. -Project-GATE
- 仕様書のみで運用対象外。点検不要。

## 3. 実施方法
- 機械的な HTTP／件数チェック（hoiku-shift・trioland・itg の生存確認）は **GitHub Actions の schedule** で。schedule は default ブランチ（main）の定義だけ発火する点に注意。失敗時は既存と同じく `[AUTO]` Issue を作る。
- 意味判定が要るもの（カナリア判定・ボトルネック・SEO 所見・黒谷HPの文言確認）は **Codex の定期実行**で。
- 実装した点検は各リポジトリの `AGENTS.md`（黒谷は `CODEX_INSTRUCTIONS.md`）の「定期点検」節に、名前・頻度・成果物の場所を1行ずつ追記して一覧化する。

## 4. 共通ルール
- **読み取りが基本。** D1 書き込み、既存行の UPDATE/DELETE、SNS 公開、課金、問い合わせの実送信、価格・規約の文言変更は大隆さんの承認なしにしない。
- 推測を実績として書かない。取れない値は「未計測（理由）」。0 と未計測を区別する。検索文・写真・個人情報・Secret の値は扱わない。
- 既知・想定内の false（`amazon_creators_configured`、`sp_api_base_configured`、`unmet_demand_sync_configured`、TIKTOK、自己参照の `GITHUB_SCHEDULE_HEARTBEAT_STALE`）は異常扱いしない。

## 5. 報告のしかた
- **変化が無い日は1行**: 「<プロジェクト> 点検 <日付>: 変化なし」。毎日同じ長文を書かない。
- 変化がある日は3行以内（数字の変化／新しく壊れたもの／待ちの増減）＋最後に必ず「**大隆さんがやること**」（本人にしかできない作業だけを URL・場所・手順つきで。無ければ「ない」）。
- 実装状態の言葉は「本番確認済み／実装済み・本番未確認／一部実装／未実装／不具合あり／要確認」のみ。

## 6. 最初にやること（今日〜明日）
1. この指示書（P-GATE `docs/handoff/2026-10-08-claude-to-codex-inspection-handover.md`）を受け取ったことを selfcheck に記録。黒谷HPは `queue/2026-10-08_inspection-handover.md`（P0）から本書を参照。
2. §2-1〜2-3 を selfcheck に組み込み、明朝分から出す。
3. §2-4 を黒谷HP 10:00 巡回に追加。
4. §2-5〜2-7 の Actions／定期実行を作り、各 `AGENTS.md` に一覧を追記。
5. 完了したら `docs/handoff/<日付>-codex-inspection-setup-done.md` に「何を・どの頻度で・どこに出すか」の一覧を書く。
