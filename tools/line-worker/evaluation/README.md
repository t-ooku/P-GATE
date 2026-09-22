# HOSHILU曖昧検索・回帰評価

## ゴールドデータ

ITG実商品から30ターゲットを選び、各ターゲットについて次の3段階を作る。

1. `rich`: 情報量が多い
2. `ambiguous`: 曖昧
3. `ultra_ambiguous`: 超曖昧

合計90件以上とする。同一ターゲットの3ケースは`target_id`を共通にする。
正解商品IDまたはASIN、許容カテゴリ、同義語を事前にラベル付けする。

架空商品、存在未確認の商品ID、個人名、住所、注文者情報を含めない。

## クエリタイプ

- `shape_function`: 形状＋機能
- `category_branch`: 複数カテゴリへの分岐
- `color_package`: 色・パッケージ
- `social_context`: SNS文脈
- `usage_scene`: 利用場面
- `compatibility`: 互換性・電圧・型番
- `place_memory`: 見た場所
- `sensory_memory`: 香り・音・感触
- `era_memory`: 昔の記憶
- `price_fragment`: 価格の断片

## 指標

- Top-1
- Top-3
- カテゴリ一致
- MRR
- nDCG@10
- 無回答率
- 誤答率
- 聞き返し率
- MYWISH提案率

`ambiguous-search-evaluator.mjs`へ公開検索APIを呼ぶ関数を渡し、ベースラインと
改善後を同じデータで評価する。低確信度や上位候補が別カテゴリへ分岐するケースでは
断定回答ではなく最小1問の聞き返しを正解挙動とする。色・場所・SNS文脈だけで特定不能な
ケースではMYWISH保存提案を正解挙動とする。
