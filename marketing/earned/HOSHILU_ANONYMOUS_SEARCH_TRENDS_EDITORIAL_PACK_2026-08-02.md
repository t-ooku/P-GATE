# HOSHILU 匿名検索トレンド・編集者向け素材（データ蓄積待ち・未送信）

状態: `HOLD_UNTIL_MINIMUM_SAMPLE`  
費用: 0円  
目的: 独自の匿名集計を、買い物・生活・検索UXを扱う編集者が検証可能な形で提供し、引用・参照リンクの候補にする。掲載、被リンク、順位は保証しない。

## 公開可能になる条件

次の条件をすべて満たすまで、数値、順位、傾向、急増表現を外部へ出さない。

1. 対象期間が連続4週間以上、かつ非QAの検索開始が100件以上ある。
2. 公開する各カテゴリの非QA件数が20件以上ある。20件未満のセルは統合または非公開にする。
3. `traffic_class='QA'` と `traffic_class='LEGACY_UNKNOWN'` を除外する。
4. 同一の匿名ハッシュによる反復を集計目的に応じて重複除外し、イベント件数を利用者数と表現しない。
5. 検索文、商品名、会員ID、メールアドレス、`user_hash`、`demand_hash`を出力・引用・共有しない。
6. 期間、母数、集計方法、除外条件を本文と表に併記する。
7. オオクツタカノリ本人が集計表、説明、送信先、送信文を確認する。

## 集計できる項目

既存の匿名イベントと`unmet_demand_events`から、次だけを集計候補にする。

- カテゴリ別の検索開始・検索完了件数。
- カテゴリ別の`UNMET`と`MATCHED`の構成。ただし「検索精度」と呼ばない。
- 言語別の検索開始・完了件数。
- モール別の送客イベント件数。売上、購入、在庫とは表現しない。
- 週別の構成比変化。前週比は両週とも同じ閾値を満たす場合だけ示す。

検索入力の語句ランキング、個別商品の人気順位、属性推定、地域推定、個人単位の行動接続は作成しない。

## 再現可能な集計定義

- 検索開始: `growth_events.event_type='search_started'`
- 検索完了: `growth_events.event_type='search_completed'`
- モール送客: `growth_events.event_type='marketplace_click'`
- 未充足候補: `unmet_demand_events.demand_status='UNMET'`
- 対象トラフィック: `traffic_class IN ('ATTRIBUTED','UNATTRIBUTED')`
- QA除外: 両テーブルで`traffic_class='QA'`を除外。`LEGACY_UNKNOWN`は外部公表から除外。
- 期間: 日本時間の月曜00:00から日曜23:59までを1週とし、UTC保存値を集計時に変換する。

`UNMET`は「その処理時点で契約・商品詳細条件を満たす候補を提示できなかった状態」であり、需要不存在、商品不存在、検索失敗、利用者不満を意味しない。

## 公開用表テンプレート

実数が条件を満たした後だけ埋める。未入力欄を0として公開しない。

| 期間 | カテゴリ | 非QA検索開始 | 非QA検索完了 | UNMETイベント | 構成比 | 注記 |
|---|---|---:|---:|---:|---:|---|
| `[YYYY-MM-DD–YYYY-MM-DD]` | `[category]` | `[n>=20]` | `[n]` | `[n]` | `[x.x%]` | イベント件数。利用者数・売上ではない |

## 編集者向け概要稿

### 日本語

HOSHILUは、商品名が分からないときに色・形・用途などの特徴から探し始められるWeb/PWAサービスです。十分な非QAデータが集まった期間について、個人や検索文を含まないカテゴリ単位の集計を提供できます。数値には対象期間、母数、除外条件を添え、価格・在庫・購入・検索精度の実績とは区別します。

### English

HOSHILU is a web and PWA service for starting a product search from remembered details when the product name is unknown. Once the minimum non-QA sample threshold is met, HOSHILU can provide category-level aggregates without raw queries or identifiers. Every figure will include its date range, sample size, and exclusions, and will not be presented as sales, availability, purchases, or search-accuracy claims.

## 個別送信の完成テンプレート

件名: 商品名が分からない検索の匿名カテゴリ集計（取材用・無償）

`[媒体名] [担当者名]` 様

HOSHILUを個人で運営しているオオクツタカノリです。`[記事テーマ]`の参考候補として、商品名を使わず特徴から始めた検索について、`[期間]`の匿名カテゴリ集計をご案内します。対象は非QAの`[母数]`件で、カテゴリ20件未満は非公開、検索文・個人識別子・会員情報は含みません。

ご関心があれば、集計表、定義、除外条件を無償で共有できます。掲載やリンクは条件にせず、記事上で広告・アフィリエイト関係が生じる場合は明示します。不要な場合は返信不要です。

確認URL: `https://hoshilu.app/ja/find-product-without-name?utm_source=[media_slug]&utm_medium=earned_media&utm_campaign=anonymous_search_trends_202608&utm_content=data_pitch`

外部送信は行わない。本人が実在する担当者と媒体方針を確認し、1媒体ずつ承認・操作する。追送は依頼がある場合を除き1回までとし、一斉送信、連絡先スクレイピング、リンク購入、相互リンク強要、ステルスマーケティングを禁止する。

## HOSHILU事実確認欄

- 通常検索はAmazon、楽天市場、Yahoo!ショッピング、Qoo10、SHEINの主要5モール。
- ファッション検索時のみZOZOTOWN、SHOPLIST、MUSINSA、BUYMA、SNKRDUNKを加え、最大10モール。
- 商品候補は確認済みの商品詳細URLを1モール1件、最大10件まで署名付きで提示する。未確認リンクは収益リンクとして扱わない。
- HOSHILUの所有・運営主体とアフィリエイト収益の帰属先はオオクツタカノリ個人。
- with care、Find fun、Tomorrow's smileはITGグループ株式会社のAmazon.co.jp販売店舗であり、HOSHILUの所有主体ではない。
- AmazonがITG/privateプロフィールとの整合性を回答する前に、SP-API認証情報取得、店舗認可、本番同期を行わない。

## 送信前チェック

- [ ] 4週間・検索開始100件・公開セル20件の全条件を満たした。
- [ ] QA、LEGACY_UNKNOWN、小さいセル、検索文、識別子を除外した。
- [ ] 集計値を別担当または再実行で照合した。
- [ ] 媒体と担当者、費用0円、編集方針、開示条件を確認した。
- [ ] 本人が数値、文面、宛先、UTM、素材権利を承認した。
- [ ] No.1、最安、必ず見つかる、人気、急増など未検証表現を使用していない。
