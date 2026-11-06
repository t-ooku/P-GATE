# HOSHILU Seller outreach pipeline

Node.js 22.13+の独立パッケージ。既存WorkerにPlaywrightを組み込まず、別のNode実行環境で動かす。1実行1店舗。既存のRIZAP/ITG除外は `../line-worker/src/seller-outreach.mjs` を再利用するため、P-GATEリポジトリ内で使う。

## インストールと実行

```bash
cd tools/seller-outreach-pipeline
npm ci
npm run browser:install
npm run check
npm test
npm run build
# 確認済み店舗・実測需要・送信者・接触履歴をjob.jsonへ設定してから実行
node --env-file=.env --import tsx src/cli.ts job.json
# 実送信を指定する場合（上と同じく文面生成のGemini利用料が生じる）
node --env-file=.env --import tsx src/cli.ts job.json --send
```

上記は実行方法。今回の開発では実在店舗への送信・有料AI呼び出しは行わない。モデル名・APIキーをコードへ固定しない。.envと下書き/画像/SQLiteはgit管理対象外。Chromium sandboxを有効にできる隔離実行環境を使う。

## 入力と計測の正本

`job.example.json` は入力形の見本で、実績値は入っていない。`demands`には認可済みの匿名集計だけを渡す。

- keyword: 正規化済みの商品需要キーワード。個人の検索履歴や個人情報を入れない。
- monthlySearchVolume / unmetSearchCount: 完了した同じJST暦月の実測検索回数と、そのうち候補が少なかった実測回数。正の整数、未充足数≦全検索数。0・推計・未来・未完了月は不可。
- periodStart / periodEnd: JST月初の半開区間をISO日時で表す。例: 10月なら開始`2026-09-30T15:00:00Z`、終了`2026-10-31T15:00:00Z`。62日を超える古い月は使わない。
- timezone: Asia/Tokyo、complete:true、qaInternalExcluded:true、source:監査できる集計元。
- suppressionSnapshot: 24時間以内に確認した、既存メール/フォーム営業の接触済み店舗と配信停止の統合エクスポート。sourceに集計元を残す。SQLite台帳だけでは別経路の過去送信は分からない。
- successSelector: 対象フォームの送信完了時だけ現れる要素。AJAX送信先がform.actionと違う場合はsubmissionUrlも設定する。

既存`unmet_demand_events`はdemand_hash/user_hash/category等を保持し、平文検索語・候補商品数を保持しない。現行のそのテーブルだけから「このキーワードの月間検索数・候補不足回数」を復元することはできない。既存growth_eventsも匿名イベント中心。**本パッケージへの実数連携は未接続**。ハッシュを検索語へ推測復元しない。新規の生検索文収集や本番DB移行も行わない。

## 料金・訴求

2026-11-06確認: `public/for-sellers.html`、`src/seller-promo-public-pages.mjs`の現在の入口は**商品3点の無料見本掲載30日、カード登録・課金なし、終了時に継続を相談**。掲載プラン月額1,980円（税込）。初期費用・クリック追加料金0円。販売先の手数料は別。

PR表示は条件にすべて合う検索で最大2件。表示回数・順位・売上を保証しない。有料掲載プランの別の30日無料/カード/自動更新条件を見本掲載と混ぜない。将来の条件変更時は文面・テスト・offerVersionを同時に見直す。既存LPや規約は変更しない。

AIは店舗のこだわりを原文から選ぶ。選択結果の原文一致を検証し、検索実績と料金・CTAはコードで固定して400〜600文字に組み立てる。AIに実数や特典を書き換えさせない。文字数超過や根拠なしは生成失敗で止める。

## フォーム動作

- previewは公開フォームの検査だけ。入力も送信もしない。文面生成を使うCLIではGemini利用料は発生し得る。
- sendは平日09:00〜18:00 JST、台帳により1日最大10店舗。接触済み・配信停止・既存除外組織を止める。
- 名前/メール/会社/件名/本文をラベル・name・idから照合。メール確認欄も入力。
- 複数フォーム、複数の氏名欄、必須の未対応項目・同意チェック、確認ページ経由、iframe内フォームは推測で送らずSKIPPED。
- CAPTCHA/Turnstileは回避せず、マスク付きスクリーンショットを保存してSKIPPED。営業禁止表示もSKIPPED。
- HTTPS・public DNS限定。HTTP取得は解決した公開IPへ固定し、ブラウザも対象hostの解決を固定する。他origin通信・WebSocket・Service Workerを止める。別origin送信先や追加ホストが必要なフォームは個別adapterの対象。
- 最終クリック前にSQLiteへ状態を永続化。送信先HTTP成功と、新たな完了表示を確認してSUBMITTED。タイムアウト/不明/異常はUNKNOWNのまま、次回は自動再送しない。
- SUBMITTEDはフォーム受付表示の確認。メール到達・返信・Seller登録・契約とは別成果。

## テスト

`test/core.test.ts`は匿名集計・月境界・実績捏造防止・料金・原文引用・公開ページパース・SSRF入口・永続重複防止を検査。`test/form.test.ts`は全ネットワークを模擬応答に置き換え、プレビュー、CAPTCHA、未対応フォーム、営業禁止、送信確認、HTTP失敗、二重送信をChromiumで検査する。実在店舗・Gemini APIは呼ばない。

## 未接続

キーワード別実測需要の認可済み集計、別経路を含む接触/配信停止エクスポート、実送信者設定、各フォームの完了表示adapter、既存スケジュールとの運用連携は未接続。自動営業を稼働済みとはしない。新しい送信スケジュールは作成しない。
