# 希望価格ウォッチ 15:00 JST巡回確認

確認時刻: 2026-09-07 15:25 JST以降。個人情報・検索文を含まない集計だけを使用。

## 本番実数

- 有効ウォッチ: 3件。`target_product_key`あり0件、なし3件。いずれも内部テスト。
- 15:00:54 JSTの巡回観測: `NO_CANDIDATES / matched=0 / 3件`。
- 価格範囲: NULL。通知: 0件。
- `NO_MATCH`、`ABOVE_TARGET`、`REACHED`: 0件。
- 設定済み内部会員3人を除く一般ユーザーWatch Set: 0件 / 0人。
- 楽天価格キャッシュ: 192件、全件期限内。最初の失効は2026-09-08 13:22:54 JST。
- 指定5検索の修正後内部本番QA: 5/5 PASS。通常画面のTurnstileを含む実機E2Eとは別。

`NO_CANDIDATES`は同一商品判定より前の段階で候補が0件だったことを示す。
したがって一致条件は緩めない。楽天・Yahoo!の設定は`/health`で有効だが、旧実装は
「APIが失敗した」と「APIは正常だが検索0件」を同じ理由にしていたため、この3件を
API障害と断定する証拠はない。

## 診断修正

`target-price-watch.mjs`でプロバイダの成功・失敗数を固定語彙へ変換し、次回から以下を区別する。

- `API_FAILURE`: 構成済みプロバイダが全て失敗。
- `NO_CANDIDATES_PARTIAL_API_FAILURE`: 一部成功・一部失敗で候補0件。
- `NO_CANDIDATES`: 応答は成功したが候補0件。
- `PROVIDER_UNCONFIGURED`: 利用可能なプロバイダが0。
- `NO_MATCH`: 候補はあるが同一商品なし。
- `ABOVE_TARGET` / `REACHED`: 同一商品価格が希望額より上 / 以下。

API失敗・部分失敗では`TARGET_PRICE_CHECK`を更新せず、次回cronで再試行する。
検索文やAPIエラー本文は観測表へ保存しない。migration追加は不要。

## Cowork確認

1. 既存3件を所有者実機で商品候補から選択し直し、商品ID付きで保存する。商品名からIDを推測補完しない。
2. 次回巡回で新しい理由を確認する。`API_FAILURE`ならプロバイダ障害、`NO_CANDIDATES`なら旧商品名検索0件、
   `NO_MATCH`なら候補取得後のidentity問題として切り分ける。
3. 一般ユーザーの自発Watch Set、通知の実受信、通知からの再訪、Mall Clickはすべて0件または未実証。
   内部3件・固定QAを成功件数へ含めない。

外部メッセージ・SNS投稿・営業メール送信は行っていない。
