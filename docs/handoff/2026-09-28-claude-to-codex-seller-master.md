# Cowork → Codex：Seller 統合実行指示書（2026-09-28 版）を正本として受け取ってください

## 正本
- `docs/handoff/2026-09-28-hoshilu-seller-master-v1.md`（版 `seller-master-20260928-v1`）。大隆さんが 9/27 までの Seller 関連指示を1本に統合したもの。Cowork は同じ内容を claude.ai Project にも保存済み。
- 9/27 の Seller 関連ファイル（first-external-seller / seller-30d-* / seller-1980-approval-request / seller-marketing-30d / seller-pilot-approval-request / codex-to-cowork-seller-1980 / cowork-takeover-seller-1980）と矛盾する**新規向け**の料金・無料条件・方針は正本に従う。成立済み契約・既存の安全ルール・外部サービス条件は保護。過去の記録は消さない。
- このリポジトリは public。正本 §19-3 に従い、未承認オプションの金額案はリポジトリ版で伏せ字。テストはダミー値で。顧客連絡先・回答原文・認証情報もここに置かない。

## 受領の記録をお願いします
正本 §3「置いただけで受領・着手扱いにしない」に従い、Cowork はまだ Codex が受領したとは扱っていません。読んだらこのファイル末尾に「受領 YYYY-MM-DD HH:MM JST」と着手範囲を追記してください。

## 担当分け（同じコード・Stripe・投稿キューを二重改修しない）
- **Codex**：料金・Stripe・課金・解約、オプション管理（販売 OFF）、改善案件の追跡（§11）、HP/CMS 接続、月次ジョブ、T01〜T28 のテスト、本番反映と確認。
- **Cowork**：独立 QA、HP/記事/SNS/画像のテンプレートと品質基準、許可済み販促、外部1店舗の獲得台帳、原価評価、Codex への具体的な依頼。
- Codex 不在中（9/27〜、大隆さん「コーデックスがクレジット切れだから君が進めて」）に Cowork が入れたもの：`2026-09-27-cowork-takeover-seller-1980.md` の内容＋9/27 夜の #512（Threads セラー投稿の文面）・#513（/for-sellers 見出しと 320px 横はみ出し修正）・#514（カルーセル 14 セット）・#515（セラー向け SEO 記事）。**料金・Stripe・課金コードは触っていない。** Codex が戻ったら、料金・課金まわりは Codex の主担当に戻す。

## 現況（2026-09-28 朝、Cowork 確認分）
| 項目 | 状態 |
|---|---|
| 新条件の受付 | フラグ OFF、「準備中」表示を維持 |
| Stripe | 大隆さんがログイン不可 → 2段階認証リセット申請中（9/27 16:56 JST 受付）。Product/Price ID は未取得 |
| 特定商取引法の表記 | 未作成。大隆さんの判断待ち |
| 外部の掲載見本相談 | 0 件（本番の3件はテスト） |
| 外部店舗・無料体験・有料契約 | すべて 0 |
| D1 migration | 0087/0088/0089 は 9/27 適用済み。ローカル未追跡の旧案 `0087_seller_first_payment.sql` は未適用 |

## Codex に最初にお願いしたいこと（正本 §0・§21 P0）
1. **T09 相談導線**：`seller-business-inquiries` の保存・受付番号・担当者通知・実際の受信先を本番で確認し、保存失敗と通知失敗が分かれているかを確認。受信先アドレスが実際に読まれている受信箱かも（§18-3）。
2. **付録A [R2]**：`searching-demand.mjs` が DB 未接続・例外時に 0 を返す件。使用箇所を追い、「未計測」と「実際の0」を画面・KPI で区別。
3. **§16 オプション下準備**：オプション定義の最小スキーマ（識別子・版・月額/単発・追加枠・販売可否=OFF）と、既存コードの「items が1件」「総額1,980円」などの固定判定の洗い出し。変更はテスト環境まで。
4. **§11 P1 設計**：1商品・1課題の改善案件（根拠→改善→公開確認→希望者通知→結果）を、現行 schema に合わせた最小設計として handoff に提示。

Cowork は並行して、T01/T27 の表示の独立 QA、テンプレート・品質基準の案、外部1店舗の候補台帳（許諾・接触可否つき）を進める。

## 追記 2026-09-28 01:45 JST：Cowork が代替実装を担当（明示移管）
大隆さん「コーデックスはクレジット切れだから君が進めて」。正本 §3「代替実装の範囲は明示して移管」に当たるため、Codex が戻るまで Cowork が実装も行う。Codex が戻ったら、下の範囲を引き継いでから着手してください（同じファイルを二重に直さない）。

- **T09（相談導線）確認済み・コード変更なし**：保存 → 受付番号（画面に `受付番号：SBI_…` を表示）→ Resend 通知（`SELLER_INQUIRY_NOTIFY_EMAIL`、reply_to は相談者）→ 大隆さんの Gmail に実際に届いていることを、過去3件（9/3・9/7・9/19、いずれもテスト）の通知メールで確認。保存失敗は 503 `INQUIRY_SAVE_FAILED`、通知失敗は保存を残して `seller_inquiry_notifications` に FAILED、管理 API で再送できる。
  - 観察：3件とも source が `FOR_SELLERS_FALLBACK`（Turnstile を通らず件数制限つきの受付）。Turnstile が本番で通っていない可能性あり。フォールバックは1時間3件・1日10件まで受け付けるので、今の流入では相談が止まることはない。未調査。
- **#516（本番反映済み）[R2]**：`searchingDemandOverview` に `measurable`／`reason`／`partial` を追加。`/api/seller/demand-check` は探し中も `measurable===true` で判定、契約者画面は計測不能時「集計できていません」。
- **§16 オプション下準備（ルート未接続・本番影響なし）**：`src/seller-options.mjs`。3候補を定義し、既定はすべて販売 OFF。承認・提供確認・金額・Stripe Price ID・全体スイッチ `SELLER_OPTIONS_SALES_ENABLED` がそろった時だけ販売可。金額は公開リポジトリに書かず env で渡す。基本同意の流用は無効。
  - 設計判断：`seller-pilot-autorenew.mjs:87` と `seller-pilot-payment.mjs:57` が `items.length!==1` を基本契約の完全性チェックにしているため、**オプションは基本の subscription に明細を足さず、別 subscription（月額）／payment Checkout（単発）で扱う**。これで基本契約の検証を緩めずに済む。
