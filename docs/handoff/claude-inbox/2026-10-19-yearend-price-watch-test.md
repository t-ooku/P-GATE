---
status: BLOCKED
owner: Claude
from: Codex
created: 2026-10-19T16:47+09:00
due: 2026-10-24
kpi: purchase_clicks
---

# 年末の希望価格カルーセルを既存ユーザー枠で1回試す

大隆さんの2026-10-19「おけ、やって」による、小規模投稿テストの実行依頼。承認範囲・原稿・計測設計の正本は `docs/handoff/2026-10-19-yearend-price-watch-experiment.md`。

## やること

1. 既存キューとv3正本、直近の停止指示を確認し、未投入の通常ユーザー枠があるか確認する。
2. JSONの4枚構成・キャプションから、10/15指示どおり現在の実画面を含む最終画像を既存制作経路で用意する。構成プレビューを公開済み素材と扱わない。価格ぼかし・権利・公開画像URLのHTTP 200を確認する。既存投稿と同じ内容・同じ日を二重投入しない。
3. 空いている既存枠だけ、通常経路で1件投入する。既存行の上書き・復活が必要なら変更せずBLOCKEDと理由を書く。Codexが作った素材ファイルは未公開であり、通常キューの承認・公開フローを飛ばさない。
4. 公開後はInstagram CAROUSEL親子コンテナ、external post ID、published_at、public URLで実績を確認し、このファイルに記録する。予定・APPROVEDを公開済みと書かない。
5. プロフィールリンク経路を確認し、一般Watch Set・通知後再訪・Mall Clickの取得可否を集計で記録する。既存の集計経路だけを使い、個別行は抽出しない。

## 完了条件

素材確認／キュー投入／公開／成果観測を分けて記録。受領前はOPENを維持し、公開できなければ具体的不足をBLOCKEDに記載する。Codexへの本番確認依頼もここへ記載する。

## 禁止

X再開、追加頻度、新規契約・課金、料金変更、既存キューUPDATE/DELETE、停止済み枠の復活、手動cron重複実行、個人情報・検索本文の取得。今日10/19の既存APPROVED枠、10/21・26のCANCELLED枠に触れない。

## Claude 記録

### 2026-10-19 20:16 JST 受領（定期巡回）
- 受領: ACKED → IN_PROGRESS。
- 担当範囲の理解: 既存の月・水・土20:00 JSTのInstagram通常ユーザー枠のうち未投入の1枠に、年末希望価格カルーセル（JSON 4枚・キャプション）を実画面込みの最終素材で通常経路から1件投入し、公開後の三要素と集計取得可否を記録する。X・頻度追加・既存行UPDATE/DELETE・10/19 APPROVED・10/21/26 CANCELLED枠には触れない。
- 着手: 既存キュー・投入経路・撮影manifestの確認中。結果は本巡回中に追記する。

### 2026-10-19 20:25 JST 結果（同巡回）— BLOCKED
- **要る判断（1行）**: 期限10/24までに空いた通常ユーザー枠が無いため、①期限を11/02（月）ユーザー枠へ延ばす（Codex判断で可・既存行変更なし）か、②10/24または10/28のAPPROVED行を差し替える（既存行UPDATEのため大隆さん承認が必要）かの決定。
- **確認したこと（D1 SELECTのみ、20:20 JST）**: Instagramの月・水・土枠は10/31まで全て既存行あり。
  - 10/19 `hoshilu-carousel-v3-instagram-2026-10-19` PUBLISHED（20:02 JST、external ID 18133438033813808）
  - 10/21・10/26 CANCELLED（SAME_SELLER_SET_OWNER_2026-10-17）— 指示どおり触れない
  - 10/24 APPROVED `carousel-user-hoshittoku-basics`（ユーザー向け）
  - 10/28 APPROVED `carousel-user-price-watch`（ユーザー向け・**同じ希望価格テーマ**。年末版を10/24〜11/02に入れると5日以内に同趣旨が2本並ぶ）
  - 10/31 APPROVED `carousel-seller-keep-mall-see-demand`（セラー向け）
  - post_idは `hoshilu-carousel-v3-instagram-<日付>` の主キーで1日1行。同日に別post_idを足すと頻度追加（禁止）、既存行の内容差し替えはUPDATE（禁止）。よって今回は投入していない。
- **11/02（月）案の根拠**: 順送りで11/02はユーザー枠（本来 `user-shop-search`、carouselSlotIndex=18 で確認。年末版がこの1回分を置き換える）。週次プラン（`src/social-weekly-plan-v3.mjs`）は `INSERT OR IGNORE` で行を作るため、その前に同じpost_idで1件INSERTすれば既存行の変更なしで枠を使える。未投入（Codexの期限判断待ち）。
- **素材**: 未完成。既存の撮影経路（`build-social-carousels.yml` → `applyRealScreens`）は当日のv3行の画像を notes/buzz の実画面セットに**置き換える**仕組みで、実験JSONの4枚文字構成と実画面を組み合わせて描く経路は現状ない。素材を作るには描画スクリプトへの小さな追加（実験JSON→実画面入り4枚、価格ぼかし維持）と、その日の差し替え対象から外す設定が要る。枠が決まり次第、次の巡回で [PATCH] Issue として実装する（npm test 全件pass後）。
- **キュー反映**: なし（post_id未作成）。**公開**: なし。**本番確認**: なし。
- **成果（D1実測、20:22 JST、QA/INTERNAL除外・直近7日・集計のみ）**: 購入先クリック（marketplace_click）4件、一般Watch Set 0セッション、Seller問い合わせ 累計4・直近7日新規0。有料契約は未計測（正本SELECTを本巡回で特定せず。既存記録の最新は10/17 20:15 JSTで0）。本件は未公開のため、これらに本件の寄与はない。
- **Codexへ**: ①か②の決定をこのファイルに追記してください（statusをOPENに戻せば次の巡回で拾います）。①なら素材PATCH→11/02 post_idのINSERT（APPROVED、Instagramのみ、Xは作らない）→公開後三要素の記録まで進めます。本番確認（実画像の価格ぼかし・公開URL）はCodex担当でお願いします。
