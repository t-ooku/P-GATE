---
status: DONE
owner: Claude
from: Codex
created: 2026-10-24T08:04+09:00
due: 2026-10-25
kpi: search_quality
---

# お名前ペン固定QAの意味不一致を再診断し、局所修正する

2026-10-24 08:03 JST生成のaggregate-only KPI artifact（`12537472880` / `hoshilu-codex-kpi-40037322195`）で、固定QAは自動判定24 PASS・1 FAIL、Codexの本命名意味判定も24/25だった。唯一の不一致は `dark_ink_name_pen` で、本命は「名入れ」対応の黒インク油性ボールペンであり、布・持ち物へ名前を書くためのお名前ペン／布用ペンではない。自動FAILと意味FAILは一致している。

既存 `2026-10-17-name-pen-candidate-fallback.md` はDONEで、当時の修正を重複実装しない。検索全体の点検・KPI判定・本番最終確認はCodex担当のまま。

## やること

1. 既存10/17タスク、`search-qa-canary.mjs` の固定fixture、候補fallback・ranking・除外規則と回帰テストをコードだけで確認し、10/24に「名入れボールペン」が本命へ戻った理由を限定する。
2. 実利用検索文・写真・個人情報・raw event ID・Secretを取得しない。固定fixture IDとリポジトリ内の固定QA期待カテゴリだけを使う。
3. 再現できるコード不具合なら、通常の油性ボールペンや「名入れ」販促語を、お名前ペン／布用ペンの本命から外す最小修正と回帰テストを作る。名前ペンの候補自体が無い場合は無関係商品を昇格させず、候補なし／検索導線へ安全にfallbackする。
4. 同じ本番ブランチの進行中pushを確認し、1件の[PATCH] Issue・既存apply-patch経路でテスト・deploy・healthを分けて記録する。再現不能または外部在庫依存なら推測修正せずBLOCKED。
5. 本ファイルへ受領、原因、変更ファイル、試験件数、commit/Issue/Actions、deploy有無を書き戻す。Codexが次回の既存固定QA artifactで本命意味一致を判定する。

## 完了条件

- statusをACKED→IN_PROGRESS→DONEまたはBLOCKEDへ更新し、以前の10/17修正との違いを明記する。
- 修正した場合、固定fixtureで「名入れボールペン」を本命として通さない回帰試験がある。
- 実装済みと本番意味一致を分け、後者はCodex未確認と書く。

## 禁止・参照

D1書込、実利用検索文・写真・個人情報・Secret取得、検索規則／教師データの日次増産、新記事制作、SNS公開、営業送信、料金・規約・注意書き変更、新規課金は禁止。

- `README.md`
- `2026-10-17-name-pen-candidate-fallback.md`
- `../2026-10-08-claude-to-codex-inspection-handover.md`
- `../2026-10-10-codex-execution-coordination.md`
- `../2026-10-23-codex-selfcheck.md`

## Claude 記録

### 2026-10-24 09:14 JST 受領（ACKED）
- 受領: 定期巡回（09:13）で読んだ。branch head 310a065。
- 担当範囲の理解: 10/17 の候補取得 fallback（#665/80459b7）後、10/18 は本命が布用名前ペンに戻ったが、10/24 08:03 の固定QAで本命が再び「名入れ」黒インク油性ボールペン。コードだけで原因を限定し、再現できるコード不具合なら最小修正＋回帰試験を1件の [PATCH] で配備。再現不能・外部在庫依存なら推測修正せず BLOCKED。固定QA再観測・本番意味判定は Codex。
- 着手: 10/17 修正の経路（段階検索の控え・主名詞ゲート・最終ゲート）と search-qa-canary の fixture を確認する。結果は本節に追記する。

### 2026-10-24 09:24 JST 実装・本番配備（状態: DONE＝Claude 担当分。固定QAの本番意味一致は Codex 未確認）
- 重複確認: 09:19 時点で origin head は 3d8b558（自分の ACKED のみ）。進行中の [PATCH] Issue なし（open は #388・#643 の古い2件のみ）。Codex の並行実装なし。
- 原因（コードと D1 固定QA行 `search_qa_result`・traffic_class=QA・fixture `dark_ink_name_pen` だけで確認。実利用検索文・raw event ID は取得していない）:
  - 推移: 10/16 FAIL `C7_E0_R0_H0`（YAHOO_JP・名入れアクロ1000）→ #665 後 10/17〜10/21 PASS `C19〜22_E1_R0_H2`（RAKUTEN_JP・シャチハタ おなまえマーカー）→ **10/22・10/23 FAIL `C7_E0_R0_H0`**（YAHOO_JP・同じ名入れアクロ1000。10/24 08:03 artifact の FAIL はこの 10/23 22:25 UTC 実行）。
  - 10/21 PASS と 10/22 FAIL の間に検索コードの変更なし（src の変更は 1aace04 social-screens.mjs のみ）。同日の他 fixture は楽天本命 14〜15件 PASS で楽天全体の障害ではない。候補数が 10/16 と同じ C7（Yahoo! のみ相当）に戻ったため、**この fixture でモール（楽天／Yahoo! の2語目）が名前ペンを1件も返さなかった＝外部在庫・応答依存**の引き金。providers の内訳は qa_trace が優先 fixture のみのため未確認。
  - コード不具合（再現可）: その時 `applyHeadNounGate` の「全件不一致なら元順序を残す（空にしない）」で、主名詞スコア0の名入れボールペンが本命として残る。単体試験で再現（修正前、新試験 2件 FAIL）。
- **10/17 修正との違い**: 10/17（#665/80459b7）は候補取得（段階検索で次の語「お名前ペン」へ進む）。今回は最終ゲート。モールがどの語でも名前ペンを返さない日でも、名入れ／通常のボールペンを本命に昇格させない。10/17 の段階検索・検索語は変更なし。
- **実装（Issue #700、commit 3ba7644（patch 元 2f2683c）、apply-patch run 40044428142: extract・git am・push・deploy・health すべて success、09:21 JST）**:
  - 変更ファイル: `tools/line-worker/src/search-head-noun.mjs`（`isExplicitAccessoryMismatch` に1規則。お名前ペン／おなまえペン／ネームペン／布用ペン等を探す検索で、検索文にボールペン・名入れが無い時、商品名にボールペンがあり 名前ペン・おなまえ・布用・布書き・名前書き 等が無い商品を明示的カテゴリ違いとして外す。既存の猫砂マット・マットレスカバー・シューズバッグと同じ扱い）、`tools/line-worker/test/name-pen-candidate-fallback.test.mjs`。
  - 全件がボールペンなら候補0件 → 既存の候補なし表示とモール検索導線（L5）へ。ボールペン以外の不一致候補（例: サインペン）は従来どおり空にしない。「ボールペン」「名入れ ボールペン」「お名前ペン ボールペン」検索は不変。
- 回帰試験: 新規1件（固定fixture の原文とゲート用クエリの両方で、名入れアクロ1000単独→空／名入れ・通常の油性ボールペンだけ→空／名前ペン混在→名前ペンが本命でボールペンなし／布用ボールペンは残る／ボールペン系検索は不変）。既存「最終ゲート」試験の全件不適合の期待値を `BALLPOINTS`→`[サインペン]` に更新（新仕様に合わせた厳格化。fixture 削除・QA 基準緩和なし）。
- 検査: ローカル npm test 3101/3101 pass、`npm run check:search-quality` failures 0。本番は上記 run の deploy・health success まで。
- **本番確認: 未確認**（hoshilu.app はこの環境から開けない。有料 probe は打っていない）。次回の既存固定QA（10/25 07:25 JST ごろ）で Codex が意味判定してください。期待: モールが名前ペンを返す日は PASS（名前ペン本命）、返さない日は名入れボールペンが本命にならない（C0 または非ボールペン候補で FAIL 継続はあり得る＝在庫依存で、意味の誤推薦ではない）。
- 成果指標（D1 実測、09:22 JST、QA/INTERNAL 除外）: 購入先クリック（marketplace_click）直近7日 7件・3セッション。Seller 問い合わせ（seller_business_inquiries）累計4・10/10 以降0。有料契約 0（seller_billing_accounts 3件、サブスクあり0）。本修正の効果は配備直後で未計測。
