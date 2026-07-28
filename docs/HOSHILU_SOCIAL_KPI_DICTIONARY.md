# HOSHILU SNS・LINE KPI辞書

| 指標 | 定義 | 主キー |
|---|---|---|
| profile_view | SNSプロフィール表示 | channel/date |
| social_click | 計測付きHOSHILUリンクのクリック | campaign/content |
| query_prefilled | 投稿テーマが検索窓へ引き継がれた回数 | campaign/content |
| query_started | 利用者が検索を送信した回数 | anonymous session |
| search_completed | 候補または安全な再質問が表示された回数 | query_id |
| product_outbound | EC商品ページへ移動した回数 | query_id/marketplace |
| amazon_fallback | 最適化検索語でAmazon検索へ移動した回数 | query_id |
| keyword_copy | 生成検索語をコピーした回数 | query_id |
| wish_saved | ほしっトク保存 | anonymous/member |
| watch_saved | 通知条件保存 | member/wish |
| social_response_approved | 人手承認済みコメント・投票 | response_id |
| hashtag_demand | 承認済み回答内ハッシュタグ集計 | hashtag |

プロフィール閲覧など媒体内指標は媒体管理画面から日次取得する。HOSHILU側では
生のSNSユーザー名を保存せず、キャンペーン・コンテンツ・匿名セッション単位で比較する。
