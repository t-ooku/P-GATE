# Codex 共有｜HOSHILU Seller「AI販促担当」（2026-10-04）

宛先: Codex
発行: Cowork（Claude）／ 承認: 大隆さん（「この機能はコーデックスにも共有しよう」）
目的: Codex が起動したときに、この機能の存在・状態・触ってよい範囲を把握し、**Claude Code と同じファイルを同時に触らない**ようにする。実装の主担当は Claude Code、運用は Cowork。Codex は監視・テスト追加・担当外の小修正。

---

## 1. ひとことで

楽天・Amazon に出店する小さな店向けの月額サービス。毎週月曜 06:00 JST に、店ごとに **記事1本・SNS投稿文2本（X/Threads/Instagram の言い換え付き）・商品ページの直し案1件** を AI で作り、機械検査 → 店の承認 → WordPress 公開／楽天GOLD 用 HTML 納品／原稿納品。月初に月次レポート。
料金: 掲載 1,980円（HOSHILU 内の掲載のみ）／Light 9,800円／Standard 19,800円（税込・月額）。初回公開から30日無料・カード登録と自動更新の同意が前提（既存の Seller pilot の仕組みを流用）。

## 2. 現在の状態（2026-10-04 時点・本番）

| 項目 | 状態 |
|---|---|
| 機能フラグ | `SELLER_PROMO_ENABLED=true`、`SELLER_PROMO_PLANS_ENABLED=true`（販売中） |
| Stripe | Light/Standard の本番 Price 作成済み（lookup_key `hoshilu_seller_light_9800_jpy_month_inclusive_v1` / `..._standard_19800_...`） |
| migration | 0090〜0092 適用済み（`seller_promo_*` 表） |
| R2 | `hoshilu-seller-promo-assets`（binding `SELLER_PROMO_ASSETS`） |
| Secret | `SELLER_PROMO_KEK`（店の接続秘密の AES-GCM 鍵。値はどこにも書かない） |
| QA 店舗 | 架空の `qa-shop-1`。毎週月曜 06:00 JST に無人実行。初回（10/3）は DONE・全種 QA_PASSED |
| 原価 | 1店・1週 約1.6円（gemini Flash 系 3回） |
| 外部店 | 0 店。10/3 に案内メール 6通送信済み（送信記録は `seller_outreach_contacts`） |
| 週次記録 | 毎週月曜 07:07 JST に `docs/handoff/<日付>-seller-promo-weekly.md` へ自動追記（状態・検査理由・原価。本文と連絡先は書かない） |
| 進行中 | `/for-sellers` のスマホ表示の崩れと文章の削減（Claude Code、1 PR）。その後に Seller 枠の SNS 10本・記事2本 |

## 3. 仕組み（読むときの地図）

- 週次ジョブ: 既存 cron `*/15 * * * *` の `scheduled()` から。月曜 06:00〜06:14 JST のサイクルで対象店のジョブを作る（冪等: `UNIQUE(seller_key, week_key)`、attempt ≤3）。cron 行は増やしていない。
- 生成 → 検査（数値照合・禁止表現・語り手・根拠の無い評価語は「要確認」・誤字の疑い・同型検査・文字数）→ 承認 → 公開。
- 主な表: `seller_promo_profiles`／`_products`／`_questions`／`_jobs`／`_deliverables`／`_connections`（秘密は暗号化）／`_usage`（原価）／`_audit`。
- 管理 API: `/api/admin/seller-promo/*`（profiles・products/import・questions・run・jobs・deliverables・connections・usage）。契約者側は `/seller-pilot` の「今週のサポート」。
- 止め方: 全体は `SELLER_PROMO_ENABLED=false`。1店は profile を `status:"PAUSED"`。予算上限 `SELLER_PROMO_MONTHLY_TOKEN_CAP_PER_SELLER`・`SELLER_PROMO_MONTHLY_COST_CAP_JPY`。
- データの出所: 店が渡す CSV／URL／SP-API（本人認可）、店の疑問の要約、HOSHILU の匿名需要（5人以上）。**楽天ウェブサービス API・Amazon PA-API は使わない**（規約上、出品者向けの利用・アフィリエイト以外の収益化が不可）。

## 4. ファイルの所有（同時に触らない）

**Claude Code の所有（Codex は編集しない）**
- `src/seller-promo-*.mjs`、`public/seller-promo*.{js,css}`、`public/for-sellers-preview.html`、`public/seller-data-policy.html`
- `migrations/0090_*`〜`0092_*`（以降の seller-promo 用 migration も）
- `test/seller-promo-*.test.mjs`
- `.github/workflows/build-seller-promo-images.yml`、`seller-promo-status.yml`、週次記録の workflow
- 進行中の PR の間は `public/for-sellers.html`・`for-sellers*.css`・`for-sellers.js` も Claude Code が持つ

**共有ファイル（触る前に `docs/handoff/` で宣言）**
- `src/index.mjs`（ルート）、`src/seller-page.mjs`、`src/seller-pilot-payment.mjs`、`src/sp-api-seller-routes.mjs`、`wrangler.jsonc`、`social-autopilot` の Seller 枠

触る必要が出たら、`docs/handoff/YYYY-MM-DD-codex-to-claude-code-<件名>.md` に「対象ファイル・理由・差分の要旨」を書き、Claude Code の確認を待つ（急ぎの本番障害は §6）。

## 5. Codex にお願いしたいこと

1. **起動時セルフチェックに追加**（既存の standing self-check に3行）:
   - `/health` が ok か
   - 月曜 07:30 JST 以降なら、その週の `docs/handoff/<日付>-seller-promo-weekly.md` があり、QA 店舗の job が DONE か
   - FAILED／SKIPPED（上限）が出ていたら `docs/handoff/` に1行で報告（直さない）
2. **回帰の見張り**: `npm test` に seller-promo のテストが含まれている。Codex の変更で seller-promo のテストが落ちたら、Codex 側の変更を戻すか直す（seller-promo 側を書き換えない）。
3. **CI の見張り**: 同じブランチを Claude Code（2セッション）と Codex が使っている。`release_config` の一覧漏れで deploy が止まった前例（#547）がある。push 前に `git fetch` と取り直し。
4. 担当外の小修正・テスト追加は従来どおり。

## 6. やってはいけないこと

- 機能フラグ・料金・Stripe・vars・Secret の変更、migration の本番適用、本番 DB の書き込み（大隆さんの承認と Claude Code の手順で行う）
- 店への送信（メール・通知）、SNS 投稿キューの変更
- 店名・連絡先・CSV・記事本文を公開リポジトリに置く
- 本番障害で止める必要があるときは、**`SELLER_PROMO_ENABLED=false` の PR を作って大隆さんに知らせる**ところまで（マージは承認後）

## 7. 文書の索引（`docs/handoff/`）

| ファイル | 中身 |
|---|---|
| `2026-10-02-claude-code-ai-promo-progress.md` | 実装と本番の状態（正本） |
| `2026-10-02-claude-code-to-cowork-ai-promo-phase1.md` | runbook（API・SQL・失敗時の切り分け） |
| `2026-10-03-cowork-ai-promo-operations-instructions.md` | 運用の流れ（Cowork 向け） |
| `2026-10-03-cowork-to-claude-code-ai-promo.md` | Cowork→Claude Code の依頼と結果 |
| `2026-10-03-cowork-ai-promo-reply-templates.md` | 店からの返信への返し方 |
| `2026-10-03-cowork-seller-promo-content-pack.md` | 自社の販促（SNS 10本・記事2本） |
| `2026-10-03-cowork-to-claude-code-for-sellers-mobile-layout.md`／`...-copy-trim.md` | 進行中の LP 修正 |
| `<日付>-seller-promo-weekly.md` | 毎週月曜の自動記録 |

読んだら、`docs/handoff/` に `YYYY-MM-DD-codex-ack-ai-promo.md` を1つ置き、§5-1 をセルフチェックに入れたか・§4 の所有で問題がある点を書いてください。
