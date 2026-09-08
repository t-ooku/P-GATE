# HOSHILU Unmet Demand Knowledge Spec v0.1

Date: 2026-07-23
Status: Worker/D1同期実装済み（本番Secret・migration適用待ち）

## Purpose

受注後に輸入制限や顧客都合でキャンセルされた需要を、個人を特定しない
「叶えられていない欲しい」のKnowledgeへ変換する。

## Source

受注管理のうち、少なくとも次の理由列を使用する。

- 輸入禁制品
- 顧客都合キャンセル

顧客都合キャンセルは輸入制限と同一視せず、理由を再分類する。

## Normalized reason classes

- LIQUID
- LITHIUM_BATTERY
- HAZARDOUS_AIR_CARGO
- OVERSIZE_OR_OVERWEIGHT
- FOOD_PLANT_ANIMAL
- REGULATORY_OR_CERTIFICATION
- PRICE
- DELIVERY_TIME
- CUSTOMER_CHANGED_MIND
- OUT_OF_STOCK
- UNKNOWN

## Knowledge record

- tenant
- source_order_hash
- source_product_id / ASIN
- desired_use
- desired_function
- desired_ingredient_or_material
- restriction_class
- restriction_evidence
- requested_country
- occurred_month
- anonymous_demand_count
- domestic_alternative_status
- verified_alternative_ids
- verification_level

氏名、住所、電話、メール、注文番号原文、質問本文は保存しない。

## Alternative policy

「同じ成分」「同等性能」はメーカー仕様、成分表示、法令情報などで確認できた場合のみ
表示する。確認できない場合は「同じ用途」「近い特徴」の候補として表示する。
医薬品、食品、化粧品、洗剤、電池、安全規格対象品は人手確認を必須とする。

## Product experience

1. 輸入できない理由を利用者へ簡潔に説明する。
2. 国内で購入可能な同用途候補を最大3件提示する。
3. 候補がなければ「ほしっとく」し、未充足需要として匿名集計する。
4. 国内メーカー・セラーが参加した際に、条件一致候補を再評価する。

## KPIs

- import_blocked_orders
- alternative_coverage_rate
- alternative_click_rate
- alternative_conversion_rate
- recovered_order_rate
- unresolved_demand_count

## Initial implementation

ITGの米国Amazon仕入れ対象に限定して開始する。国内セラーが増えるまでは、
提案できなかった需要もKnowledgeとして蓄積し、HOSHILU INSIGHTで匿名集計する。

## Implemented connection

- GAS: `UnmetDemandEngine.sync`
- Worker: `POST /api/internal/unmet-demand/sync`
- D1: `0011_import_restriction_knowledge.sql`
- Secret: `UNMET_DEMAND_SYNC_SECRET`（32文字以上、コード・文書・シートへ保存しない）
- 1リクエスト最大200件
- 生の注文番号、氏名、住所、電話、メール、理由全文、検索文をAPI境界で拒否
- 国内代替IDは `HUMAN_VERIFIED` の場合だけ受入
- HOSHILU INSIGHTは同一分類5件以上だけを契約プランとテナント境界内で表示
