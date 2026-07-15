# Project GATE v1.14 リリースチェックリスト

## 自動確認

- [ ] `npm test`が全件PASS
- [ ] `npm run release`が完了
- [ ] `RELEASE_MANIFEST_v1.14.json`の3成果物が存在
- [ ] package、GAS、Workerのバージョンが`1.14.0`で一致
- [ ] GitHub ActionsがPASS

## Apps Script

- [ ] `Marketplace_Offers`シートが存在
- [ ] Amazon、楽天市場、Yahoo!ショッピングの正常URLを各1件以上登録
- [ ] HTTP、類似ドメイン、Marketplace不一致URLが承認対象にならない
- [ ] tenantが異なる購入先が回答へ混入しない
- [ ] `runProjectGatePreflight()`のFAILが0件

## LINE / PWA

- [ ] 在庫あり購入先が在庫切れより優先される
- [ ] 支払総額が同じ場合は配送日数が短い購入先が優先される
- [ ] 署名付きURLから許可ECへ遷移する
- [ ] 類似ドメインへの改ざんURLが拒否される
- [ ] 公開JSONに元URL、Seller_Name、External_Product_ID、内部SKUがない
- [ ] 表示、クリック、送客イベントが記録される

## ITGパイロット

- [ ] 対象商品と3EC購入先を担当者が承認
- [ ] 既存運用との比較条件を固定
- [ ] 14日以上計測し、CTR・送客率・CVR・売上・粗利を確認
- [ ] 数値根拠が不足する場合は効果を断定せず次の検証へ進む
