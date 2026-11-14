# MYGATE Social Knowledge 仕様 v1.0

## 目的

MYGATE公式SNSで定期的に「欲しいけれど商品名を思い出せないものはある？」などの質問・アンケートを行い、回答を匿名需要シグナルとしてMYTREASUREへ取り込む。

SNSは広告チャネルであると同時に、未充足需要を発見する参加型リサーチチャネルになる。

## データフロー

```text
SNS質問・アンケート
  ↓ 投稿内で集計利用を告知
コメント／投票
  ↓
Social_Knowledge_Inbox
  ↓ 個人情報除去・重複排除・AIモデレーション
REVIEW / REVIEW_FLAGGED / AUTO_REJECTED
  ↓ 人手審査
  ↓ 承認・Need Key付与
Social_Knowledge_Aggregates
  ↓ 匿名集計のみ
MYTREASURE / TREASURE ENGINE
```

## 重要原則

- コメントを商品Masterへ直接登録しない。
- 投稿本文で、回答を匿名集計しMYGATEの需要分析・サービス改善に使うことを告知する。
- 告知のない過去投稿のコメントは取り込まない。
- SNSのユーザー名、表示名、プロフィールURLは保存しない。
- メール、電話番号、URL、ハンドル名は取り込み時に置換する。
- 回答は最初 `REVIEW` とし、人がカテゴリとNeed Keyを確認する。
- 集計画面へ出すのは `APPROVED` の回答だけ。
- 差別的内容、個人情報、宣伝スパム、無関係投稿は除外する。
- 正当な批判、商品への不満、低評価は「失言」として自動削除しない。
- 脅迫、差別、性的搾取、個人情報、悪質詐欺は高確度時に `AUTO_REJECTED` とする。
- 嫌がらせ、暴言、性的表現、自傷、無関係、一般的な宣伝は `REVIEW_FLAGGED` とし、人が最終判断する。
- AIの判定結果だけでSNS上の原コメントを削除しない。SNS上で非表示・通報・削除する操作は別の運用承認を必要とする。
- 少人数の属性を組み合わせて個人を推定できる表示をしない。

## 投稿用の告知文

### コメント募集

> 欲しいけれど、名前が分からない・思い出せないものはありますか？覚えている形、色、使いたい場面をコメントしてください。回答は個人を特定しない形で集計し、MYGATEの商品探索・需要分析・サービス改善に利用する場合があります。個人情報は書かないでください。

### アンケート

> 次のうち、今いちばん探したいものはどれですか？回答は匿名集計し、MYGATEの機能改善と需要分析に利用します。

### UGC採用時

> コメント本文を投稿で紹介する場合は、集計利用とは別に本人へ掲載許可を確認します。許可がないコメントを引用投稿しません。

## 推奨定期投稿

| 頻度 | 投稿 | 取得データ |
|---|---|---|
| 毎週月曜 | 欲しいけど名前が分からないものある？ | 自由記述Need |
| 毎週水曜 | 3つの用途から選ぶアンケート | カテゴリ需要 |
| 毎週金曜 | 海外で見た・日本で欲しいもの | 越境需要 |
| 月末 | 今月の「欲しい」投票 | 優先順位 |

## 回答ステータス

| 状態 | 意味 |
|---|---|
| REVIEW | 取り込み済み・未審査 |
| REVIEW_FLAGGED | AIまたは固定ルールが要確認と判定 |
| AUTO_REJECTED | 高危険度として集計から自動除外 |
| APPROVED | 集計に利用可能 |
| REJECTED | 集計対象外 |

## AIモデレーション入力

コメント取得コネクタまたは管理フォームは、利用するAIモデレーションサービスの結果を任意で渡せる。

```javascript
ai_moderation: {
  categories: ['HARASSMENT'],
  confidence: 0.92
}
```

AI結果がない場合も、固定ルールで明確な脅迫、個人情報、悪質スパム等を一次判定する。誤判定を避けるため、曖昧な内容は自動除外せず `REVIEW_FLAGGED` にする。

## シート

### Social_Knowledge_Inbox

匿名化した回答、投稿、キャンペーン、同意根拠、重複Hash、審査結果を保持する。

### Social_Knowledge_Aggregates

Need Key、カテゴリ、言語単位で、回答数、ユニーク回答者数、期間、ソース数、キャンペーン数を保持する。

## インポート例

```javascript
importSocialKnowledgeResponse({
  source: 'INSTAGRAM',
  post_id: 'ig_20260727_question_01',
  campaign_id: 'weekly_ambiguous_wish',
  platform_response_id: 'comment_12345',
  response_type: 'COMMENT',
  response_text: '昔見た、車の座席の間に入れる細長い収納みたいなもの',
  language: 'JA',
  consent_basis: 'POST_DISCLOSURE',
  disclosure_version: 'social-knowledge-ja-v1',
  author_platform_id: 'platform-internal-id',
  suggested_category: 'CAR_ACCESSORY',
  suggested_need_key: 'car-seat-gap-storage'
});
```

承認例:

```javascript
reviewSocialKnowledgeResponse('response-uuid', {
  status: 'APPROVED',
  category: 'CAR_ACCESSORY',
  need_key: 'car-seat-gap-storage',
  reviewer: 'operator-id'
});
```

## 自動取得について

Instagram、TikTok、X、YouTube等からの自動コメント取得は、各公式API、アプリ審査、権限、利用規約、レート制限に従う。画面スクレイピングを前提にしない。

API接続前は、CSVまたは管理フォームから同じインポート関数へ渡す。投稿やコメント取得の認証情報をSpreadsheetへ保存しない。
