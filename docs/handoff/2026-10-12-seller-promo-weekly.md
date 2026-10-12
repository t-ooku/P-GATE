# AI販促担当 週次の結果（自動記録）

`seller-promo-weekly-record.yml`（月曜 07:00 JST）が本番 D1 を読んで追記する。状態・検査理由・原価だけで、本文と連絡先は書かない。

## 2026-W42（記録 2026-10-12 10:14 JST、自動）

投稿の反応（直近7日・hoshilu-seller-daily-v1）: 公開 5 本・表示 9・LP 閲覧 0・LP のボタン 0・相談 0（相談は経路を問わない全件）

### job

| 店 | 状態 | 試行 | error | 開始 | 終了 |
|---|---|---|---|---|---|
| qa-shop-1 | DONE | 1 | IMAGE_SKIPPED_NO_R2 | 2026-10-11T21:00:54.000Z | 2026-10-11T21:01:38.829Z |

### 納品物（最新の版だけでなく全版。本文は書かない）

| 店 | 種類 | 版 | 状態 | 検査理由 | 要確認 |
|---|---|---|---|---|---|
| qa-shop-1 | ARTICLE | 1 | QA_FAILED | NUMBER_NOT_IN_PRODUCT_DATA:2024 / FORBIDDEN_EXPRESSION:商品データ,データに記載,記載がございません | PROPERTY_CLAIM_UNVERIFIED:お手頃,丸洗い |
| qa-shop-1 | ARTICLE | 2 | QA_PASSED | — | TYPO_SUSPECT:目目 |
| qa-shop-1 | IMPROVEMENT | 1 | QA_PASSED | — | — |
| qa-shop-1 | SNS | 1 | QA_PASSED | — | — |

### 原価

| 店 | 呼び出し | 入力トークン | 出力トークン | 円（推定） |
|---|---|---|---|---|
| qa-shop-1 | 4 | 4637 | 3894 | 2.71 |

まとめ: job 1 件（DONE 以外 0）・納品物 4 版（QA_FAILED 1・要確認 2）。

