# Project GATE 契約・競合・独占ポリシー仕様 v1.4

## 目的

利用顧客セラー／利用顧客メーカーが増えても、競合企業へ無断で同じ回答を配らず、独占契約とデータ利用同意を機械的に守る。

## 契約項目

`Client_Contracts`シートで顧客単位に次を管理する。

| 項目 | 内容 |
|---|---|
| Contract_ID | 契約の一意ID |
| Tenant | ITG等の運用主体 |
| Account_Type | `SELLER` / `MANUFACTURER` |
| Account_ID | 顧客ID |
| Status | `ACTIVE` / `PAUSED` / `ENDED` |
| Start_Date / End_Date | 契約有効期間 |
| Category_Scope | 対象カテゴリ。カンマ区切り、全対象は`*` |
| Competitor_Group | 直接競合をまとめるグループID |
| Exclusivity_Mode | `NONE` / `ANSWER` / `CATEGORY` |
| Competitor_Acceptance | 競合受入れへの明示同意 |
| Benchmark_Consent | 匿名ベンチマーク利用への同意 |

## 推薦判定順序

1. 対象契約が有効か確認する。
2. 推薦カテゴリが契約範囲内か確認する。
3. 同じ競合グループの既存推薦を確認する。
4. カテゴリ独占があれば、同カテゴリの競合推薦を拒否する。
5. 回答独占があれば、同じ回答の競合推薦を拒否する。
6. 独占なしで同じ回答を使う場合、競合双方の受入れ同意を確認する。
7. 双方同意がある場合だけ許可し、顧客への開示を必須にする。

## 判定結果

| Reason | 意味 |
|---|---|
| ALLOWED | 競合・独占上の問題なし |
| ALLOWED_WITH_COMPETITOR_DISCLOSURE | 競合双方の同意により許可。開示必須 |
| TARGET_CONTRACT_INACTIVE | 契約が無効または期間外 |
| CATEGORY_OUT_OF_SCOPE | 契約カテゴリ外 |
| CATEGORY_EXCLUSIVITY_CONFLICT | カテゴリ独占と競合 |
| ANSWER_EXCLUSIVITY_CONFLICT | 回答独占と競合 |
| COMPETITOR_ACCEPTANCE_REQUIRED | 競合双方の同意が揃っていない |

## 同じ回答の判定

回答本文や商品リストをキー順に正規化し、SHA-256署名を作成する。項目の並び順だけが違う回答は同じ回答として扱う。

`Recommendation_Decisions`には回答本文を保存せず、署名、判定、理由、開示要否だけを保存する。

## 匿名ベンチマーク

`Benchmark_Consent`は契約ごとに保持する。v1.13では同意済みの有効契約が5社以上ある場合だけ匿名ベンチマークを生成する。同意のない顧客、同意状態が矛盾する顧客、5社未満の集団は比較処理へ渡さない。詳細は`ANONYMOUS_BENCHMARK_SPEC_v1.13.md`を参照する。

## 独占料金との関係

`ANSWER`または`CATEGORY`は追加料金契約を想定するが、金額はコードへ固定しない。価格プランと契約書で定義し、このエンジンは締結済み条件の履行だけを担当する。
