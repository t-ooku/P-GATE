# Cowork → Claude Code 依頼｜AI販促担当（2026-10-03）

発行: Cowork（Claude）。根拠: `2026-10-03-cowork-ai-promo-operations-instructions.md` §7。
Cowork は管理 API に届かない環境で動いているため、API・DB を触る確認はここで依頼する。
結果は `2026-10-02-claude-code-ai-promo-progress.md` に追記し、本ファイルの各項目に「済」と日時を書いてください。

## 1. 外部店へ案内する前に必要な確認（優先・今日中）

1. **QA 店舗 `qa-shop-1` の初回無人実行（土 04:00 JST）の結果**
   - `seller_promo_jobs` の status・error・attempt
   - `seller_promo_deliverables` の種類別件数と status（QA_PASSED／QA_FAILED と `qa.reasons`）
   - 記事1本の本文を通読し、事実と違う記述・禁止表現・不自然な日本語が無いか（所見を3行で）
2. **原価の実測**: `seller_promo_usage` から 1 回分の入力／出力トークン・円。週1回×4週の月額見込み。
3. **QA 店舗の起動時刻を月曜 06:00 JST に戻す**（progress に「確認後に戻す」とあるため）。
4. 1〜2 のどれかが失敗していたら、外部店への案内は止めます。原因と直す見込みを progress に。

判定（Cowork 側）: job DONE・4種そろって QA_PASSED・記事に事実誤りなし・原価 ≤800円/店・月 → 案内を始める。

## 2. 案内候補の重複確認（「1アドレス1回」の約束）

公開リポジトリなので店名・アドレスは書かない。以下の sha256（小文字化した email の sha256、改行なし）が
営業送信の記録（`email_hash` を持つ表）に **既にあるか** だけ返してください。正規化の方法が違う場合はその方法も書いてください。

| # | sha256 |
|---|---|
| C1 | 4af3e2995b18a69c72db1ddf477f7318fccbb52819811ddd63ac7e561193f643 |
| C2 | ea82cfdb9037fa9e62f5172d57a53c204ac20d58c7b28db64a8ed80c11d55707 |
| C3 | c1073903d6cbbb44e0ce69c7e879d26f4fa1a249881846fdba73987f9ed94725 |
| C4 | 292bd3e8be8ff996d2724a64c18ffd8131a185e78f38c726363b6e23b3ab33ea |
| C5 | db809a042ab960dfcc8d16b18b95ce5a912e03aebcdbe12c7ec61425761718be |
| C6 | 1c723ab9bcd2e94e6f21f606ff85be9f6048ff705dd3085e1bee14e7ac919ce0 |

返答の形: `C1: なし` のように6行。

## 3. 申込があったときの登録（その都度、Cowork が別ファイルで依頼）

運用指示書 §4-2 の 1〜6（掲載契約 CREATE・プロファイル・商品・疑問・WordPress 接続・初回 run）は API が要るので、
申込が来たら `docs/handoff/YYYY-MM-DD-cowork-to-claude-code-ai-promo-store-N.md` で依頼します。
店の連絡先・CSV・パスワードはリポジトリに置かず、大隆さん経由で渡します。

## 4. 気づいた点（対応は任意・判断は大隆さん）

- 別の Claude Code セッションが同じブランチで商品詳細ページ（/product・migration 0093）を進めている。触るファイルは別だが、release_config の一覧漏れで deploy が止まった件（#547）のように、片方の変更がもう片方の CI を止めることがある。push 前に origin を取り直す運用を両セッションで。
