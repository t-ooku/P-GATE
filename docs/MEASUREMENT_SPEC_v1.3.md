# Project GATE KPI計測仕様 v1.3

## 目的

P-GATEの価値を「便利そう」ではなく、顧客セラー／顧客メーカーごとの実績で説明できる状態にする。

顧客が商品推薦を見てから購入するまで、次の4イベントを計測する。

1. `IMPRESSION`: 推薦商品が表示された
2. `CLICK`: 推薦商品が選択された
3. `OUTBOUND`: Amazon等の購入先へ遷移した
4. `PURCHASE`: 購入成果が確認された

## KPI

| KPI | 算式 | 意味 |
|---|---|---|
| CTR | Clicks ÷ Impressions | 推薦が興味を生んだ割合 |
| Outbound Rate | Outbound ÷ Impressions | 購入先まで送客した割合 |
| CVR | Purchases ÷ Outbound | 送客後に購入へ至った割合 |
| 売上/1,000表示 | Revenue ÷ Impressions × 1,000 | 表示機会あたりの売上貢献 |
| 粗利/1,000表示 | Gross Profit ÷ Impressions × 1,000 | 表示機会あたりの利益貢献 |

## 効果の証明方法

各キャンペーンで利用者を次の2群へ分ける。

- `CONTROL`: 従来表示
- `P_GATE`: P-GATE推薦表示

同じ日、tenant、契約種別、契約ID、キャンペーンの組み合わせだけを比較する。別顧客や別キャンペーンを混ぜない。

`KPI_Uplift`は各KPIについて次を出力する。

- Control実績
- P-GATE実績
- 絶対差
- 相対改善率
- 両群のサンプル数

Controlが0の場合は、誤解を招く無限大表示を避けるため相対改善率を空欄にする。

## 顧客データの分離

集計キーは次の組み合わせとする。

`Date_JST + Tenant + Account_Type + Account_ID + Campaign_ID + Experiment_Variant`

`Account_Type`は`SELLER`または`MANUFACTURER`だけを許可する。同名キャンペーンでも契約IDが異なれば混在しない。

イベントの重複判定には次を使用する。

`Tenant + Account_Type + Account_ID + Event_ID`

## プライバシー

- `Consent=true`のイベントだけを受け付ける。
- 氏名、メールアドレス、住所は保存しない。
- Session_IDは呼出元で生成した仮名IDを使用する。
- メールアドレス形式または空白を含むSession_IDは拒否する。
- 匿名ベンチマークや顧客間比較は、この計測基盤とは別に顧客同意を得て実装する。

## 作成されるシート

- `KPI_Event_Log`: 生イベントと監査情報
- `KPI_Summary`: 日次・顧客・キャンペーン・実験群別集計
- `KPI_Uplift`: Control対P-GATEの改善幅

## 現段階の境界

v1.3は記録・集計・効果比較エンジンまでを実装する。Web画面、公開API、Amazon購入成果の自動連携は次段階で接続する。

Google Sheetsは検証用基盤とし、イベント量が継続的に増える本番展開ではBigQuery等への置換を前提とする。
