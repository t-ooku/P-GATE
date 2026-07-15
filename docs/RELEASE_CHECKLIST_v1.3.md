# Project GATE v1.3 反映チェックリスト

## 完了済み

- [x] KPIイベント正規化
- [x] 顧客セラー／顧客メーカー分離
- [x] Control／P-GATE比較
- [x] 売上・粗利連動
- [x] 同意・仮名ID検証
- [x] 全ローカル回帰テスト PASS
- [x] GAS結合版構文 PASS

## PCでの反映

- [ ] `dist/Project_GATE_Complete_v1.3.gs`をApps Scriptの`コード.gs`へ全置換して保存
- [ ] `setupProjectGate()`を1回実行し、KPI用3シートの作成を確認
- [ ] `setupProjectGate()`によりConfigの`SYSTEM_VERSION=1.3.0`へ更新されたことを確認
- [ ] ソースZIPを展開し、GitHub `t-ooku/P-GATE`へ保存
- [ ] GitHub Actions `validate`が緑色になることを確認

既存100商品取込テストの再実施は不要。通常の次回取込が`SUCCESS`なら回帰確認完了とする。
