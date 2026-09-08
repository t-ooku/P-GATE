# HOSHILU SNSジャンル別効果測定

更新日: 2026-07-30

## 目的

どのジャンルの投稿が、閲覧だけでなくHOSHILUの検索・保存・購入先遷移へ
つながったかを比較し、次の14日間の販促配分を決める。

## 比較タイミング

- 投稿後24時間: 初速確認。方針変更には使わない
- 投稿後72時間: 暫定評価
- 投稿後7日: 確定評価
- 14日ごと: 次期投稿配分を決定

投稿日時が新しいものを不利にしないため、同じ経過時間の数値だけを比較する。

## 比較ジャンル

- ALL: 全カテゴリ・サービス説明
- FASHION: ファッション・アクセサリー
- COSMETICS: コスメ・美容
- GADGET: スマホ・ガジェット・家電
- LIFESTYLE: 生活雑貨・インテリア
- FOOD: 食品・海外商品
- HOBBY: ホビー・推し活
- BABY: ベビー・キッズ
- PET: ペット
- SPORTS: スポーツ・アウトドア

## 記録する数値

### SNS内

- impressions: 表示回数
- reach: ユニーク到達
- non_follower_reach: 非フォロワー到達
- video_3s_views: 3秒視聴
- video_complete_views: 完視聴
- likes: いいね
- comments: コメント・返信
- saves: 保存
- shares: シェア・リポスト
- profile_views: プロフィール閲覧
- link_clicks: HOSHILUリンククリック

### HOSHILU内

- search_starts: 検索開始
- search_completions: 検索完了
- wish_saves: ほしっとく保存
- marketplace_clicks: モール遷移
- return_7d: 7日以内の再訪

## 正規化指標

投稿本数やリーチ量だけで勝敗を決めない。

- 非フォロワー率 = non_follower_reach / reach
- 3秒視聴率 = video_3s_views / video_starts
- 完視聴率 = video_complete_views / video_starts
- 反応率 = (likes + comments + saves + shares) / reach
- 保存率 = saves / reach
- クリック率 = link_clicks / reach
- 検索完了率 = search_completions / link_clicks
- ほしっとく率 = wish_saves / search_completions
- モール遷移率 = marketplace_clicks / search_completions
- 1,000リーチ当たり検索完了 = search_completions / reach * 1000

分母が0の場合は0ではなく「評価不能」として扱う。

## ジャンルスコア

14日間の各ジャンルを次の重みで評価する。

| 指標 | 重み |
|---|---:|
| 1,000リーチ当たり検索完了 | 30% |
| ほしっとく率 | 20% |
| モール遷移率 | 20% |
| 保存率 | 10% |
| 共有率 | 10% |
| 非フォロワー率 | 10% |

各指標を同期間・同チャネル・同形式の中央値に対して指数化する。
InstagramリールとXテキストを直接比較せず、まず同じ形式内で比較する。

## 販促配分の判断

最低3投稿、できれば5投稿に達するまでは「勝ちジャンル」と断定しない。

- スコア上位で検索完了も多い: 次期配分を5ポイント増やす
- 閲覧は多いが検索完了が弱い: フックは維持し、CTAとリンク先を改善
- 保存は多いがモール遷移が弱い: 購入先URLと商品一致精度を改善
- モール遷移は高いが閲覧が少ない: 同テーマの動画フックを再制作
- 2期間連続で全指標が低い: 配分を5ポイント減らし、別表現で1回だけ再検証

1ジャンルが全投稿の35%を超えないようにし、全カテゴリサービスとしての認知を守る。

## UTM

- utm_source: `x` または `instagram`
- utm_medium: `organic_social`
- utm_campaign: `category_discovery_YYYYMM`
- utm_content: `YYYYMMDD_category_format_content-id`

例:

`?utm_source=instagram&utm_medium=organic_social&utm_campaign=category_discovery_202607&utm_content=20260730_cosmetics_reel_kbeauty01`

## 14日レビューの出力

1. ジャンル別の投稿数と総リーチ
2. 同形式内の正規化ランキング
3. 閲覧上位と検索完了上位の差
4. ほしっとく上位とモール遷移上位の差
5. 次期14日間の投稿比率
6. 継続・改善・停止する企画
7. URL精度や検索品質側で直す課題

