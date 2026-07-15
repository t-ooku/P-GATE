# Project GATE v1.4 リリースノート

## 新機能

- `Client_Contracts`シートを追加。
- セラー／メーカーの契約期間・カテゴリ・競合グループを管理。
- 競合企業への同一回答配布を双方同意制に変更。
- 同意により配布する場合は`Disclosure_Required=true`を返す。
- 回答単位・カテゴリ単位の独占契約を自動判定。
- 推薦可否と拒否理由を`Recommendation_Decisions`へ記録。
- 回答本文を保存せずSHA-256署名だけで同一性を判定。
- 匿名ベンチマーク同意を契約単位で保持。

## 既存機能への影響

- Amazon ZIP取込、Master Database、Opportunity、Windows Bridgeは変更なし。
- v1.3 KPI計測ロジックは変更なし。
- 契約ポリシーは`evaluateProjectGateRecommendation()`を呼んだ推薦だけへ適用される。

## テスト

- 契約期間とカテゴリ範囲
- 競合同意なしの同一回答拒否
- 双方同意時の開示付き許可
- 回答独占・カテゴリ独占
- 別競合グループの分離
- 回答本文を監査ログへ保存しないこと
