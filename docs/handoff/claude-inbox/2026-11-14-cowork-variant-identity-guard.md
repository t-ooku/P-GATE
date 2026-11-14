---
status: OPEN
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
未受領（11/14 Cowork 作成）。
