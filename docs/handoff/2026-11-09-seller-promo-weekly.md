# AI販促担当 週次の結果（自動記録）

`seller-promo-weekly-record.yml`（月曜 07:00 JST）が本番 D1 を読んで追記する。状態・検査理由・原価だけで、本文と連絡先は書かない。

## 2026-W46（記録 2026-11-09 10:40 JST、自動）

投稿の反応（直近7日・hoshilu-seller-daily-v1）: 公開 0 本・表示 —・LP 閲覧 0・LP のボタン 0・相談 0（相談は経路を問わない全件）

### job

| 店 | 状態 | 試行 | error | 開始 | 終了 |
|---|---|---|---|---|---|
| qa-shop-1 | DONE | 1 | IMAGE_SKIPPED_NO_R2 | 2026-11-08T21:00:31.900Z | 2026-11-08T21:01:04.914Z |

### 納品物（最新の版だけでなく全版。本文は書かない）

| 店 | 種類 | 版 | 状態 | 検査理由 | 要確認 |
|---|---|---|---|---|---|
| qa-shop-1 | ARTICLE | 1 | QA_FAILED | ARTICLE_LENGTH:1318 | — |
| qa-shop-1 | ARTICLE | 2 | QA_FAILED | FORBIDDEN_EXPRESSION:商品データ | PROPERTY_CLAIM_UNVERIFIED:洗える |
| qa-shop-1 | ARTICLE | 3 | QA_FAILED | FORBIDDEN_EXPRESSION:記載がございません / ARTICLE_LENGTH:1170 | — |
| qa-shop-1 | IMPROVEMENT | 1 | QA_PASSED | — | — |
| qa-shop-1 | SNS | 1 | QA_PASSED | — | — |

### 原価

| 店 | 呼び出し | 入力トークン | 出力トークン | 円（推定） |
|---|---|---|---|---|
| qa-shop-1 | 5 | 5900 | 4321 | 3.09 |

まとめ: job 1 件（DONE 以外 0）・納品物 5 版（QA_FAILED 3・要確認 1）。

