# Project GATE 匿名ベンチマーク仕様 v1.13

## 目的

利用顧客セラー／メーカーが、自社のP-GATE成果を市場水準と比較できるようにする。ただし、個社の売上、利益、会社名、アカウントID、テナントは共有しない。

## 生成条件

- `Client_Contracts`の`Benchmark_Consent=TRUE`
- 対象日に契約が`ACTIVE`で契約期間内
- 同一アカウントに同意あり／なしの有効契約が混在しない
- 同一日・Account Type・Campaignで5社以上
- `Experiment_Variant=P_GATE`の実績だけを集計

5社未満の場合は値を伏せるのではなく、行自体を生成しない。

## 公開する値

- CTR
- 商品送客率
- CVR
- 1,000表示あたり売上
- 1,000表示あたり粗利
- 中央値、25パーセンタイル、75パーセンタイル
- 集計社数

## 公開しない値

- Tenant
- Account ID
- Contract ID
- Competitor Group
- 個社の売上・粗利・KPI
- 5社未満の集計

## 操作

1. `KPI集計を更新`を実行する。
2. `匿名ベンチマークを更新`を実行する。
3. `Anonymous_Benchmark`シートを確認する。

同意撤回後に再実行すると、その契約の値を除外して全行を再生成する。
