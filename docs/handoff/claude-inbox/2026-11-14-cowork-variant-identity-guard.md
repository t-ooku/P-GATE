---
status: DONE
owner: Claude
assignee: Claude Code（実装・調査支援）
kpi: price_comparison_success | purchase_clicks
from: Cowork（統括）
created: 2026-11-14 JST
plan: docs/handoff/2026-11-14-cowork-cheapest-guide-plan.md
branch: feature/ui-search-v2（[PATCH] issue で出す）
---

# Cowork → Claude Code｜同じ商品だけを比べるための照合（純関数とテスト）

大隆さんの指示書（11/14）P3 です。**作るのは純関数とテストだけ**です。検索の流れへの組み込み・CI・本番確認は Codex が担当します（`2026-11-14-cowork-to-codex-cheapest-guide.md` C-2）。
Codex と同じファイルを同時に直さないこと。触ってよいのは次のファイルだけです：
- 新しいファイル `tools/line-worker/src/product-variant-identity.mjs`
- 新しいテスト `tools/line-worker/test/product-variant-identity.test.mjs`
- `src/product-identity-matching.mjs` で、新しい関数を呼ぶ所（tier 4 と、追記の JAN／GTIN 一致）

## やること
1. **`variantAttributes(name, attributes)`**：商品名と属性から次を取り出す。書いていないものは `null`（推測で埋めない）。
   - 色番（例 `#04`・`04`・`S04` は別物。`01・04・05` のように複数あれば「複数」＝ 1 色に決まらないので `unconfirmed`）
   - 容量・重さ（`4g`・`4.0g` は同じ、`50ml`）
   - 入り数（`3本セット`・`×2`）
   - 本体／詰替
   - 通常／ミニ（`ミニ`・`mini`・`ミニトリオ`）
   - 単品／セット（`セット`・`トリオ`・`選べる○種`）
   - 商品状態（`並行輸入`・`訳あり`・`中古`・`アウトレット`）
2. **`compareVariants(a, b)`**：結果は 3 つだけ。
   - `same`：両方に書いてある項目がすべて一致し、色番が両方で分かっている
   - `different`：どれか 1 つでも矛盾する
   - `unconfirmed`：それ以外
   - `unconfirmed` を `same` に寄せないこと。
3. `matchProductIdentity` の tier 4 で `compareVariants` が `different` または `unconfirmed` なら一致にしない（JAN／GTIN／ASIN／型番の一致はそのまま）。

## 必須テスト（実際の商品名。D1 `price_observations` 2026-11-14 から）
- 同じ（`same`）：
  - 「ロムアンド グラスティングカラーグロス 04 4g」
  - 「ロムアンド グラスティング カラー グロス 04(4g)【ロムアンド】」
- 別（`different`）：
  - 上の 04 と「rom&nd グラスティングカラーグロス S04 4g」
  - 上の 04 と「ロムアンド グラスティングカラーグロス ミニトリオ 02 ブルべ」
  - 上の 04 と「【日本語パッケージ】【並行輸入品】… グラスティングカラーグロス 04 Grapy Way 4.」
- 未確認（`unconfirmed`）：
  - 「グラスティングカラーグロス 全6色 rom&nd …」（色番なし）
  - 「【選べる4種】ROMAND ロムアンド グラスティングカラーグロス 4g (03/04/05/06)」（選択ページ）
  - 「rom&nd ロムアンド グラスティングカラーグロス 01・04・05」（色が複数。1,320 円なので選択ページの可能性が高いが、書いていないので「未確認」）
- 店の宣伝（`ポイント10倍 11月15日`・`【公式】`・`送料無料`）を色番・容量と読み違えないこと（`11月15日` の 15 は色番ではない）。

## 追記（11/14 大隆さん）有効な JAN でも属性が矛盾したら「要確認」
- 背景は plan §8。無効・共通 JAN は Cowork が `src/jan-validity.mjs`（`isUniqueJan`）で対策済みです。同じ判定を作り直さないこと。
- 追加でやること：`matchProductIdentity` の JAN／GTIN 一致でも、`compareVariants` が `different` なら `{ matched: false, tier: null, review: 'variant_conflict' }` を返す（要確認。最安の比較に入れない）。`unconfirmed` は JAN 一致を優先して同一のまま。
- 追加の必須テスト：
  - 正しい JAN が同じで、容量・入り数が矛盾（例「○○ 1個」1,200 円と「○○ 2個セット」2,400 円）→ 同一にしない（要確認）
  - 正しい JAN が同じで、属性の矛盾なし → 同一
  - 無効 JAN が同じ別商品 → 同一にしない（Cowork のテストが既にある。重複して書かない）

## 完了条件と報告
- `npm test` が通り、[PATCH] の bot が ✅。
- この受信箱ファイルの status を書き換える：`ACKED` → `IN_PROGRESS` → `DONE` または `BLOCKED`。
- 下の「Claude Code 記録」に、コミット・テスト件数・まだ分からないことを書く。

## 既存の依頼（そのまま継続）
- `2026-11-14-mobile-purchase-cta-qa.md`（390px の購入 CTA の実画面 QA。Codex 起票・調査のみ）も担当は Claude Code。
- 優先は「この照合 → 390px QA」の順。どちらも未受領のまま「済」と書かないこと。

## やってはいけないこと
- AI の推測で同一と確定しない。D1 に書き込まない。本番の検索・購入先リンクを押さない。課金・SNS 公開・営業メールをしない。

## Claude Code 記録
- 受領: 2026-11-14 14:10 JST（定期巡回 14:13 枠）。ACKED → IN_PROGRESS → **DONE（実装・配備まで。検索の流れへの組み込みと本番での効果確認は Codex C-2）**。
- **実装（本体）**: [PATCH] #761 ✅（bot 2026-11-14 14:21 JST、head `21e6984`、apply→test→deploy→health すべて success）。#760 は本文の patch を入れ忘れて起票したため取り下げ（何も適用されていない）。
  - `src/product-variant-identity.mjs`（新規）: `variantAttributes(name, attributes)` / `compareVariants(a, b)`（same / different / unconfirmed のみ）。宣伝語（ポイント○倍・○月○日・【公式】・送料無料・○円・○%OFF 等）を先に除去してから読む。
  - `src/product-identity-matching.mjs` tier 4: `compareVariants === 'same'` のときだけ一致。
- **実装（追記: JAN/GTIN の要確認）**: [PATCH] #765 ✅（bot 2026-11-14 14:33 JST、head `dcc73f2`、success）。#763 は同内容で git am 成功・push 失敗（同時刻の docs コミットと競合と推定）→ 重複として閉じ、#765 で再送。
  - JAN／GTIN が同じでも `different` なら `{ tier: null, matched: false, review: 'variant_conflict' }`。`unconfirmed` は JAN/GTIN 一致を優先。
  - 入り数に単独の「1個」「2袋」等を追加（「3個口」は除外）。
- テスト: 新規テスト 25 件（必須の実商品名 8 種・宣伝語・#04/04/S04・4g=4.0g・入り数・詰替・ミニ・状態・tier 4 組込み・JAN/GTIN 要確認 3 件）。全体 `npm test` 3184/3184 pass（ローカル、#765 適用後と同じ内容）＋ bot の test success。無効 JAN のテストは Cowork 既存分があるため重複して書いていない。
- 判断した点（Cowork・Codex 確認用）:
  - 「same は色番が両方で分かっている」について、**両方とも色番の記載が一切ない商品（家電・雑貨など）は色番を比較項目にしない**（既存テスト「ハンディファン ホワイト」の tier 4 一致を壊さないため。テストの緩和はしていない）。片方だけ色番がある・複数色は unconfirmed。
  - `#04` と `04` は # の有無だけの違いなので unconfirmed（同一にしない）。`04` と `S04` は different。
  - 詰替・ミニ・並行輸入/訳あり/中古/アウトレットは「書いていない側は通常品」とみなし、片方だけにあれば different（必須テスト「04 と 並行輸入品の 04 → different」に合わせた）。入り数・セットが片方だけなら unconfirmed。容量が片方だけなら判断材料にしない（指示どおり「両方に書いてある項目」で比較）。
  - 既存の normalizeTitle は「.」を消すため「4.0g」と「40g」が同じ正式名になる → 照合で別と判定（テストあり）。
- 本番確認: 未確認（hoshilu.app はこの環境から遮断。bot の health success のみ）。検索結果・最安比較での効果は Codex C-2 の組み込み後に確認が必要。
- まだ分からないこと: 実データ（price_observations 全体）で unconfirmed がどれだけ増え、tier 4 の同一判定が何件減るか（未計測。D1 の読み取りで測れるが、本巡回では未実施）。色名（「ホワイト」「ブルべ」）は色番として扱っていない。
- 成果（D1 実測 14:23 JST、7 日、QA 除く）: 購入先クリック 30 件／18 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。本変更による KPI 変化は未計測（配備直後）。
