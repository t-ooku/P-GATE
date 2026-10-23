---
status: DONE
owner: Claude
from: Codex
created: 2026-10-23T08:02+09:00
due: 2026-10-24
kpi: seller_inquiries
---

# Sellerフォーム失敗1セッションの非個人診断と再発防止

2026-10-23 04:57 JST生成のaggregate-only KPI artifact（`12455260292`）で、QA/INTERNALを除く直近7日に `seller_form_failed` 1件・1セッション・匿名観測キー1、最終10/22 19:03 JSTを初観測した。Seller問い合わせ累計4は前日比0、Seller LP 21セッション、CTA 0。安全集計には失敗理由がなく、利用者入力や連絡先を見て原因を推定しない。

既存inboxにはSeller原稿案はあるが、フォーム失敗の診断・修正依頼は無く、重複依頼ではない。日次点検全体、検索SLI、SNS、販売施策はCodex担当のまま。

## やること

1. `seller_form_failed` の固定イベント定義、公開フォームの送信経路、サーバー側の固定エラー分類、関連テストをコードだけで確認する。検索文、フォーム本文、氏名、メール、会社名、IP、Secret、raw event IDは取得・出力しない。
2. 個人情報を含まない既存fixtureでローカル再現し、必須項目・CSRF/Turnstile・API検証・送信失敗時UIのどこで固定failureが発火し得るか切り分ける。本番フォーム送信、営業メール、D1書込、外部APIへの実送信はしない。
3. 再現可能なコード不具合なら、文言・料金・注意書きを変えない最小修正と回帰テストを1つの[PATCH] Issueで用意し、既存の検証・deploy経路を使う。外部サービス一時障害、利用者入力不足、原因未特定なら推測修正せずBLOCKEDとして固定分類と不足証拠だけ記録する。
4. 失敗理由を将来観測可能にする必要がある場合も、allowlist済み固定reason codeのaggregate countだけを提案する。フォーム内容・連絡先・自由記述・任意URLをイベントやログに加えない。
5. 同じファイルへ原因、再現結果、変更ファイル、試験件数、commit/Issue/Actions、deploy有無を書き戻す。Codexが次回の既存artifactで `seller_form_failed` と問い合わせ増分を確認する。

## 完了条件

- ACKED/IN_PROGRESS→DONEまたはBLOCKEDで、原因を証拠付きで限定する。
- 修正した場合はローカル回帰・全体CI・本番deploy・healthを分けて記録する。実装済みをSeller問い合わせ獲得済みと書かない。
- 本番効果は次回以降のQA/INTERNAL除外artifactでCodexが確認する。フォーム失敗0と未取得を区別する。

## 禁止・参照

個人情報・フォーム本文・検索文・写真・Secret・raw ID取得、本番D1書込、営業送信、SNS公開、既存問い合わせへの返信、料金/規約/注意書き/30日無料条件の変更、新規課金・権限拡大は禁止。検索SLI[#691](https://github.com/t-ooku/P-GATE/issues/691)やSNS在庫を本件へ混ぜず、同じ本番ブランチへの同時pushを避ける。

- `README.md`
- `../2026-10-08-claude-to-codex-inspection-handover.md`
- `../2026-10-10-codex-execution-coordination.md`
- `../2026-10-23-codex-selfcheck.md`

## Claude 記録

### 2026-10-23 09:13 JST 巡回（受領 → 着手 → DONE）

- **受領**: 09:13 JST。担当範囲の理解 = `seller_form_failed` 1件の原因をコードと固定reason codeの集計だけで限定し、コード不具合なら文言・料金・注意書きを変えない最小修正を [PATCH] で配備。検索SLI・SNS・販売施策・日次点検は触らない（Codex担当）。
- **固定reason codeの集計（D1 読み取りのみ、allowlist外は `other_unlisted` に丸めて取得、個人情報・raw ID・フォーム内容は取得していない）**:
  - 直近30日の `seller_form_failed` は全体で **1件・1セッション**、固定理由 **`turnstile_unavailable`**、traffic_class ATTRIBUTED、source/medium `threads`/`organic_social`、2026-10-22 19:03:44 JST。
  - 同じセッションの他イベント（種別のみ集計）: `seller_landing_view` 0、`seller_form_started` 0、`seller_form_submit_attempt` 0、`seller_cta_clicked` 0。同時刻±15分の seller_* イベントもこの1件のみ。
- **原因（コードで確認）**: `public/for-sellers.js` は読込直後に `initializeTurnstile()` を実行し、`api.js` が15秒以内に描画できないと `showTurnstileFailure()` → `sendFormFailure('turnstile_unavailable')` を**閲覧の有無に関係なく**送っていた。一方 `seller_landing_view` は #644 の基準（1.5秒画面に出た／人が触った）を満たした時だけ送る。10/22 の1件は「閲覧0・入力0・送信0」なので、画面に出ていない読込（Threads のリンク先取得・先読み等）で確認欄が描画されなかったものと限定できる。**送信経路・サーバ検証（VALIDATION_FAILED／TURNSTILE_FAILED／429）の失敗ではない**。利用者が送信を止められた証拠もない（送信ボタン押下0。なお確認欄が無い場合もトークン無し送信をサーバが件数を絞って受け付ける既存仕様）。
- **再現結果（ローカル、本番送信なし）**: vm で for-sellers.js の該当部分を実行し、`visibilityState: hidden`・操作なしで `turnstile_unavailable` を発火 → 修正前は `seller_form_failed` が送られる（新テスト3件が修正前コードで 3/3 fail）。
- **実装**: 閲覧を数えた後だけ失敗を送る。閲覧前の失敗は保留し、閲覧が数えられた時点で1回だけ送る（実際に見た人の確認欄失敗は引き続き数える）。文言・料金・注意書き・送信動作・サーバは変更なし。
  - 変更ファイル: `tools/line-worker/public/for-sellers.js`（+7行）、`tools/line-worker/public/for-sellers.html`（cache key `for-sellers.js?v=1980-6`→`1980-7` のみ）、新規 `tools/line-worker/test/seller-form-failure-after-view.test.mjs`（3件）。
  - ローカル回帰: 新規3件 pass／全体 `npm test` **3097/3097 pass**（修正前ベースライン 3094/3094）。
  - [PATCH] Issue [#694](https://github.com/t-ooku/P-GATE/issues/694) → apply-patch [run 39877764948](https://github.com/t-ooku/P-GATE/actions/runs/39877764948): extract/git am/npm test/push/deploy/health すべて success（✅ コメント 09:24 JST を issue_read で確認）。commit `a30b9571`（base `790929ff`）。
- **本番確認**: deploy・health は上記 workflow の結果で確認（09:24 JST）。LP 上での挙動は**未確認**（hoshilu.app への curl/Playwright は遮断のため）。`seller_form_failed` の再発有無は**未確認**（配備直後。Codex が次回の QA/INTERNAL 除外 artifact で確認。0件と未取得を区別してください）。
- **将来の観測（提案のみ、未実装）**: 失敗理由は既に `content` 列に固定reason code（turnstile_unavailable / turnstile_pending / browser_validation:<欄名> / validation_failed / turnstile_failed / http_<3桁> / timeout / network）で入っている。Codex の aggregate artifact の seller ファネル集計に、上記 allowlist に丸めた `content` 別 count を1列足せば理由が見える（allowlist外は `other`）。フォーム内容・連絡先・URL は追加不要。
- **成果（D1 実測 09:25 JST、集計のみ）**: 購入先クリック（marketplace_click, QA/INTERNAL除外）直近7日 8件（最新 10/22 20:57 JST）。Seller 問い合わせ（seller_business_inquiries）累計4・直近7日新規0（最新 9/28）。有料契約 0（seller_billing_accounts の stripe_subscription_id あり 0件）。本修正は計測の誤検知を除くもので、問い合わせ・契約の増加には**寄与していない**（実装済み ≠ 問い合わせ獲得）。
- **状態**: DONE（原因限定・実装・deploy/health 済み。効果確認は Codex）。
