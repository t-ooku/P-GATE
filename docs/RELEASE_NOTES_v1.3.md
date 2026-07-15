# Project GATE v1.3 リリースノート

## 新機能

- 推薦表示、クリック、購入先遷移、購入の4イベントを記録する`MeasurementEngine`を追加。
- セラー／メーカー、tenant、契約ID、キャンペーン単位でデータを分離。
- CTR、送客率、CVR、売上、粗利を日次集計。
- Control群とP-GATE群を比較し、絶対差・相対改善率・サンプル数を`KPI_Uplift`へ出力。
- 同意必須、仮名Session ID、メールアドレス拒否のプライバシー境界を追加。
- Event Keyによる顧客単位の重複排除を追加。

## 既存MVPへの影響

- ZIP取込、Master Database、Opportunity、Windows Bridgeの処理は変更しない。
- `setupProjectGate()`実行時にKPI用3シートが追加される。
- 既存の100商品取込テストを最初からやり直す必要はない。

## 未接続

- エンドユーザー向けWeb画面
- 外部からイベントを受け取る認証付きAPI
- Amazon購入成果の自動連携

これらは計測仕様を変えずに次段階で接続する。
