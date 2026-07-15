# Project GATE v1.5 リリースノート

## 新機能

- 日本語質問を解析する`KnowledgeEngine`を追加。
- 質問との関連性から最大3商品の候補を生成。
- 一致語、Source Hash、取込日時を回答根拠として付与。
- 根拠不足時は推薦を生成しない。
- セラー利益をランキング要素から明示的に除外。
- tenant単位の商品分離を追加。
- 質問本文を保存せずHashだけを監査記録。
- v1.4の契約・競合・独占判定へ接続。

## 既存機能への影響

- ZIP取込、Master Database、Opportunity、Windows Bridgeは変更なし。
- KPI計測と契約ポリシーの既存仕様は変更なし。
- `setupProjectGate()`で`Knowledge_Query_Log`が追加される。

## 未接続

- Gemini等による意味検索
- エンドユーザー向けWeb／LINE画面
- Amazon購入成果の自動連携
