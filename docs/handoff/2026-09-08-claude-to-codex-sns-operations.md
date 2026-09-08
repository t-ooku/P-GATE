# Claude → Codex 引き継ぎ（2026-09-08）SNS・販促の自動運用を全部渡す

大隆さん決定（2026-09-08）: **SNS投稿も Codex が主幹**になる。
本ファイルは 2026-09-07 の引き継ぎ書
（`docs/handoff/2026-09-07-claude-to-codex-primary-handover.md`）の **§2 を差し替える**。
あちらは「SNS投稿の文・企画は Claude」と書いてあるが、本日から Codex に移る。

数字は 2026-09-08 10:00 JST 時点の本番実測。推測は書いていない。

---

## 0. いま起きていること（先に読む）

### 🔴 事故: 崩れた文字のリールを Instagram と X に自動投稿した（2026-09-07 20:15 JST）

Runway が生成した映像の中で、スマホ画面に崩れた日本語が並んでいた。

```
ちB日ぬ、敵ぴ痛しじ？  /  フプリとして使う  /  日本本鈎のよい【の志満の助かでかか意…】
```

大隆さんが Instagram・X 両方を削除済み。**差し替え版はまだ出していない。**

**原因**: `themes.json` の `concept_rules` は既に
「画面内の文字・UI・字幕・テロップは一切生成しない」と指示していた。
**指示は正しかったが、動画モデルが否定指示を守らなかった。**
自動QAは顔・セリフ・焼き込み・尺・音量を見ていたが、
「生成映像に文字が写っていないか」を見ていなかった。

**修正済み（#257、本番デプロイ済み）**:
後処理**前**の生成フレームを Cloud Vision `TEXT_DETECTION` にかけ、文字が出たら不合格にする。
必須QA項目に `no_generated_text` を追加。指示も「スマートフォン・タブレット・パソコン・
テレビなど画面のある機器を画面内に一切写さない」に強めた。

**この事故の教訓（他の自動生成物にも当てはまる）**:
> **AIが作ったものは、指示ではなく機械検査でしか担保できない。**
> 「プロンプトに書いたから大丈夫」は担保ではない。

### 🔴 未修正: Threads 投稿の無限リトライ（Issue #252）

`caption + link` が500字を超えると Threads API が 4xx を返すが、
**status が FAILED に落ちず5分ごとに再スケジュールし続ける**。
実害があるので Worker 側の修正をお願いしたい（#252 に詳細と再現SQL）。

暫定回避として、投入側は「caption に URL を書かない」「caption+link ≤ 480」を守ること（後述 §3）。

### 🟡 今日やってほしいこと

削除した 9/7 分の差し替えリールを出す。
GitHub → Actions → **Auto Runway reel** → Run workflow。

| 入力 | 値 |
|---|---|
| `slot` | `wed` |
| `theme` | `want_at_price` |
| `publish_at` | 空（当日 20:15 JST に自動設定） |

最大110分。生成 → 実画面合成 → 自動QA → 投稿キュー（Instagram + X）まで無人。
#257 適用済みなので、崩れた画面が出たら今度は自動で弾かれ、別シーンで1回だけ再生成される。

---

## 1. 引き継ぐ範囲

| いま動かしているもの | 誰が | 引き継ぎ後 |
|---|---|---|
| 日次販促3本（Threads 07:45 / X 12:05 / Threads 18:45 JST） | Claude の定期タスク | **Codex** |
| Seller向け2本（X・Threads 12:35 JST、平日のみ） | Claude の定期タスク | **Codex** |
| クリエイター募集（火・金の Threads 18:45 に差し替え） | Claude の定期タスク | **Codex** |
| セラー営業メールの投入（平日5社/日） | Claude の定期タスク | **Codex** |
| 日次の実数レポート | Claude の定期タスク | **Codex** |
| Runway 自動リール（月・水・土） | GitHub Actions（無人） | そのまま。監視は Codex |
| 配信基盤・投稿API・文字数ガード | Codex | そのまま |

### 切り替え手順（投稿が1日も途切れないように）

Claude 側の定期タスク（毎朝 06:30 JST、trigger `trig_01HfNzS3XKThiiv9h5p3Aeot`）は
**Codex が最初の1日を成功させるまで止めない**。

二重投稿は `post_id` で防げる。**post_id は日付で一意に決まる**ので、
先に入れた方が勝ち、後から来た方は「同じ post_id が既にある」でスキップされる。
**Codex も必ず下の post_id 規約に従うこと**（違う id を使うと二重投稿になる）。

```
日次販促   hoshilu-deal-daily-v1-<YYYY-MM-DD JST>-<threads-am|x-noon|threads-pm>
Seller向け  hoshilu-seller-daily-v1-<YYYY-MM-DD JST>-<x|threads>
```

Codex が1日通して成功したら大隆さんに報告 → Claude 側のタスクを停止する。

---

## 2. 何を投稿するか

### 訴求の配分（2026-09-06 大隆さん決定「成長・SNS自動運用」指示書）

- **希望価格ウォッチ 70%（1日2本）／クーポン・セール通知 30%（1日1本）**
- 「まとめて探す」は**単独の投稿にしない**。ウォッチ投稿の導入で
  「まず相場を見て、○円なら買うと決めて、待つ」と触れるだけ
- 本命メッセージ「**欲しい価格になったら、教えます。**」
- CTA「**欲しい商品に、希望価格を入れてみて。**」

売るのは AI でも13モールでも高機能検索でもない。
**「欲しい価格を決めたら、もう価格を見に行かなくていい。」**

### 枠（JST）

| 枠 | 中身 | UTC |
|---|---|---|
| Threads 07:45 | 希望価格ウォッチ | 前日 22:45Z |
| X 12:05 | クーポン・セール | 03:05Z |
| Threads 18:45 | 希望価格ウォッチ（火・金はクリエイター募集に差し替え） | 09:45Z |
| X・Threads 12:35（平日） | Seller向け | 03:35Z |
| Instagram・X 20:15（月・水・土） | Runway 自動リール | 11:15Z |

**既存の自動枠と重ねない**: Threads 09:30／12:30／20:30／22:30、X・Instagram 20:00〜20:15。

### 商品例

主婦層の日常買い（水筒・弁当箱・おむつ・洗剤・スキンケア・子供靴・ベビーカー・加湿器・
コーヒー・ペットフード等）から日替わり。**直近10日と同じ商品例・同じ文面を使わない。**

```sql
SELECT content_id, caption FROM social_post_queue
WHERE campaign_id='hoshilu-deal-daily-v1' AND scheduled_at >= <10日前>;
```

### 文面の型

- **希望価格ウォッチ**: 「<商品>、今は買い時じゃないけど値下がりしたら欲しい」
  → 「HOSHILUで検索して『この価格になったら教えて☑』を押すだけ。
  Amazon・楽天・Qoo10 の公式価格が希望額まで下がったら通知」→ リンク
- **クーポン・セール**: 「プライムデー／楽天スーパーSALE／Qoo10メガ割…どれがいつか追えない」
  → 「SALE RADAR で受け取るモールとセールだけ選べば、始まる前に通知」→ リンク（`#saleCenterTitle`）
- **Seller向け（平日、曜日で回す）**:
  月=集客「商品登録しただけでは見つからない。」／火=需要「ユーザーが何を探しているか、
  分かっていますか？」／水=再訪「今すぐ買わない人を、捨てない。」／
  木=クーポン「10%OFFを、買う可能性がある人に届ける。」／
  金=Shop「Amazonの外にも、あなたの店の入口を。」

---

## 3. 書き方の技術ルール（守らないと投稿が失敗する）

### 🔴 caption に URL を書かない

**Worker が `link` 列を本文の末尾に自動で付ける。** caption にも URL を書くと二重になり、
文字数超過で投稿が失敗し、しかも FAILED にならず無限リトライする（2026-09-07 に実際に発生）。

| 実例 | caption | link | 合計 | 結果 |
|---|---|---|---|---|
| watch-humidifier-price | 215 | 199 | 414 | ✅ 成功 |
| watch-stroller-price | 346（URL込み） | 194 | **540** | ❌ 無限ループ |
| watch-kids-shoes-price | 350（URL込み） | 205 | **555** | ❌ 失敗するはずだった |

`link` が194〜267字と長いのは、UTMと `q=` の検索語を日本語のまま
パーセントエンコードするため（`&q=%E3%83%99%E3%83%93%E3%83%BC%E3%82%AB%E3%83%BC` = ベビーカー）。
**URLだけで本文の4〜5割を食う。**

### 文字数

- **Threads: `caption + link` の合計で500字**。→ caption は **280字以内**
- **INSERT 前に必ず「caption文字数 + link文字数 ≤ 480」を計算して確認する**
- X: URL を除いて全角120字以内（全角=2カウントで280以内）

### その他

- caption の末尾は改行して「※リンク先にはアフィリエイト広告を含む場合があります。」
  → `affiliate=1`。ただし Seller向け・クリエイター募集は `affiliate=0` で注記なし
- 絵文字は使わない（記号 ☑ ・ ／ は可）
- ハッシュタグ: Threads 2つまで（#ホシル ＋1つ）、X 2つまで。
  Seller向けは #EC運営 #ネットショップ、クリエイター募集は #ホシル #PR案件募集
- 文字列列は `NOT NULL DEFAULT ''` なので必ず `''` を入れる
- SQL は params を使い、caption の改行は実改行のまま渡す（`\n` エスケープ文字列を書かない）
- **Instagram には画像素材が用意できるまでテキスト投稿を流さない**

### リンク（必ず UTM 付き）

```
希望価格ウォッチ  https://hoshilu.app/?utm_source=<threads|x>&utm_medium=social
                  &utm_campaign=hoshilu-deal-daily-v1&utm_content=<content_id>&q=<検索語>
クーポン・セール  同上 + #saleCenterTitle
Seller向け        https://hoshilu.app/for-sellers?...&utm_campaign=hoshilu-seller-daily-v1
クリエイター募集  https://hoshilu.app/for-creators?...
```

### 毎朝の点検（必須）

無限リトライに入った行がないか確認する。

```sql
SELECT content_id, platform, status, LENGTH(caption) AS cap,
       LENGTH(caption)+LENGTH(link) AS total, scheduled_at, updated_at,
       SUBSTR(last_error,1,80)
FROM social_post_queue
WHERE last_error<>'' AND status IN ('APPROVED','PUBLISHING')
ORDER BY updated_at DESC LIMIT 10;
```

status が APPROVED のまま `last_error` があり `scheduled_at` が更新され続けていたら、
それは無限リトライ。**既存行の UPDATE は大隆さんの承認事項**なので勝手に直さず報告する。

---

## 4. Runway 自動リール（月・水・土）

### 動き

`.github/workflows/auto-runway-reel.yml`（**main ブランチにある**。schedule は既定ブランチでしか
動かないため。実行時に `feature/ui-search-v2` を checkout する）

```
月・水・土 06:00 JST 起動
 → D1 にジョブ投入 → Worker の15分cronが Runway に生成させる
 → R2 から生成物を取得 → Playwright で hoshilu.app の実画面を撮影
 → ffmpeg で 字幕/ブランド/AI表記/実画面/URL を合成
 → 自動QA → 合格なら social_post_queue を APPROVED（同日 20:15 JST、Instagram + X）
 → 不合格なら別シーンで1回だけ再生成。それでも駄目なら FAILED_FINAL + Issue
```

手動起動は `workflow_dispatch`（inputs: `slot` / `theme` / `publish_at`）。

### 自動QAが見ているもの

仕様（720x1280・h264 High・yuv420p・24fps・AAC 44100 stereo）／全フレームデコード／
音量／焼き込み差分／顔（Cloud Vision）／セリフ一致（Whisper）／重複／AI開示／
**生成映像に文字が写っていないか（#257 で追加）**

### 予算

Runway は**月1万円以内・上限6,000クレジット**（2026-09-06 大隆さん決定）。
1ジョブ336クレジット。**これを超える判断は大隆さんの承認事項。**

### 週の型

月・水・土 = Runway新規生成Reel ／ 金 = 既存素材編集Reel（**新規生成とは呼ばない**）／
火・木・日 = カルーセル ／ Stories 毎日

### 素材について（2026-09-08 に分かったこと）

`public/social/hoshilu-ai-actress-watch-v1.mp4` などの「AI女優」既存素材は、
**参照画像＋既存音源から ffmpeg で作った静止画ベース**（コミット `cba34be`）。
**女優は動いていないし、声も入っていない**（BGMのみ、平均-30dB）。
動いて話す女優は Runway 生成でしか作れない。差し替え時に混同しないこと。

BGM は既存アセットの音源のみ使用可（権利台帳）。音圧の目安:
`hoshilu-approved-model-reel-20260812` -12.1dB ／ `hoshilu-reel-ambiguous-pop-v1` -17.8dB ／
`hoshilu-feature-reel-13mall-v1` -21.1dB ／ `hoshilu-reel-sale-pop-v1` -27.0dB ／
`hoshilu-reel-9malls-pop-v1` -29.5dB（現在使用中）。
**新しい曲の購入・サブスク契約は費用が出るので大隆さんの承認事項。**

---

## 5. セラー営業メール（平日のみ・SNSタスクに同居）

D1 `seller_outreach_contacts` に **1日5社まで** `QUEUED` で入れるだけ。
送信・配信停止・重複防止は Worker が担当（平日09:00〜18:00 JST、1日10通、1アドレス生涯1回）。

候補は Projects の `claude/hoshilu_seller_outreach_candidates_2026-09-06.md` の表から、
まだ `seller_outreach_contacts` に無い会社を上から選ぶ。**フォームURLしかない会社はスキップ。**

列: `contact_id='seller-outreach-<YYYY-MM-DD JST>-<連番2桁>'` / `shop_name` / `contact_email` /
`email_hash`（小文字trimのSHA-256 16進） / `channel` / `category` / `source_url` /
`hook`（個別化の1文） / `subject` / `body` / `status='QUEUED'` /
`scheduled_at`=翌営業日09:05 JSTのUTC / `unsubscribe_token`（32桁hex） / `created_at` / `updated_at`

**body は型を固定し、hook の1文だけを会社ごとに変える。件名は2〜3種をローテーション**
（同じ営業文の大量送信は §49 違反）。署名・問い合わせ先・配信停止リンクは Worker が自動で付ける。

### 法的制約（特定電子メール法）

公開されている**事業者向け**連絡先にだけ送る／1アドレス生涯1回／平日09:00〜18:00 JST／
1日10通・1サイクル3通／**送信者表示と配信停止手段を必ず入れる**。

配信停止リンクは**トークンをパスに置く**こと（`?t=` は転送中に消えることを実証済み。commit `fda4cd7`）。

---

## 6. 絶対ルール

### 表現の禁止（Seller獲得指示書 §33）

必ず売れます／売上が上がります／多数のユーザーがいます／成果保証／業界No.1／確実に。
**実績がないものを言わない。ユーザー数を盛らない。**
書いてよい数字は Seller ¥9,800/月（税込）と「最初の3か月は月額0円・送客料のみ」だけ。
クリエイター募集は Instagram 1投稿1,500円／X・TikTok 1,000円（税抜）、
月末締め翌月末払い、フォロワー下限なし、まで。

### 行為の禁止（§49）

大量スパムDM／根拠のない成功保証／過剰営業／同じ営業文の大量送信／価格を隠す／
ユーザー数を盛る／PRとOrganicを混ぜる。

### 報告の禁止（成長・SNS指示書）

推測KPI／**内部テストを一般実績として出す**／投稿予定を投稿済みと書く／
**既存動画の切り貼りを「新規生成Reel」と呼ぶ**／通常投稿を承認待ちで止める／
新機能を作ったことを成果にする／SEO記事数を成果にする／再生数だけで成功判定。

### 数字の扱い

「◯%OFF」「最安」などの数字は、`marketplace_sale_events`（`status='APPROVED'` かつ
`ends_at >= 今`）に同じ内容があるときだけ、その `title` のとおりに書く。
無ければ「セールが始まったら通知」「クーポンを見逃さない」など**機能の事実だけ**。
医療・効能の断定はしない。実在の他社サービスを批判しない。

### 承認が要るもの（§54）

新規有料契約・広告費・法的契約・価格変更・不可逆操作・
**`social_post_queue` と `seller_outreach_contacts` の既存行の UPDATE / DELETE**。
→ 通常の販促準備・SEO・X投稿・LP改善は都度確認不要（事後報告でよい）。

---

## 7. 毎日の報告（大隆さん向け・短く）

数字はすべて D1 の実測。取れないものは「**未計測**」と書く。推測しない。

```
昨日: SNS→HOSHILU <n>（threads/x/instagram 内訳）／SEO→検索開始 <n>／
Watch Set <n>（流入元・訪問→Watch Set率）／新規Watchユーザー <n>／Mall Click <n>／
Seller問い合わせ <n>／Shop閲覧 <n>・フォロー <n>／
営業メール 送信<n>・累計<n>・配信停止<n>／Creator応募 未計測／
希望価格ウォッチ巡回（reason別）／「これですか？」待ち時間 平均<n>ms
今日公開: 主婦層3本（訴求と枠）＋Seller2本（テーマ）＋Reel（月・水・土）
最大の離脱1つ／今日の改善1つ／大隆さんの作業: なし（必要な時だけ書く）
```

### 実数SQL（D1 `hoshilu-products` = `17629324-b771-4348-982c-c25da48c29b2`）

```sql
-- SNS→HOSHILU
SELECT source, COUNT(*) FROM growth_events
WHERE event_type='landing_view' AND traffic_class<>'QA'
  AND occurred_at BETWEEN <昨日00:00 JST のUTC> AND <今日00:00 JST のUTC>
  AND source IN ('threads','x','instagram') GROUP BY source;

-- SEO→検索開始
-- event_type='seo_article_view' の件数と 'search_started' AND medium='seo' の件数

-- Watch Set
SELECT COUNT(*) FROM member_wishes WHERE created_at BETWEEN ...
  AND json_extract(condition_snapshot,'$.price_condition.target_price_jpy') IS NOT NULL;
-- 新規Watchユーザー = member_id が内部3会員以外のもの:
-- 6vw0RVMxRXk89RKCpmkhSDhUPzNAhbKf77VLzXvKYfs
-- IEpqu7DILaYNEAh9-Nsmqow9eILwTW0jFQAdpi520Tk
-- VzrpNlfUCarsQdh_M3fn6LevsGBQNAjitlZ5bh4Hr0U

-- Watch Set の流入元
SELECT source, medium, COUNT(*) FROM growth_events
WHERE event_type='target_price_watch_set' AND traffic_class<>'QA'
  AND occurred_at BETWEEN ... GROUP BY source, medium;

-- Mall Click: event_type='marketplace_click' AND traffic_class<>'QA'
-- 営業メール: SELECT status, COUNT(*) FROM seller_outreach_contacts GROUP BY status;
-- 希望価格ウォッチ巡回:
SELECT reason, COUNT(*) n, MIN(price_jpy), MAX(price_jpy)
FROM target_price_observations WHERE observed_at BETWEEN ... GROUP BY reason;
```

**未計測のまま**: Seller LP PV／無料Seller登録／¥9,800申込／Shop公開／Coupon発行／Creator応募。

---

## 8. 今週の最優先（大隆さんマスター指示書 2026-09-06）

**新機能追加は止める。** 目的は「自分の意思で希望価格を設定して待つ**一般ユーザー**を
発生させる」。現在の希望価格ウォッチ3件は内部/テスト。

成功の段階: 第1 内部以外の自発的 Watch Set → 第2 複数の独立ユーザーで再現 →
第3 通知で戻る → 第4 Mall Click/購入送客。**1件で成功と言わない。**

### 2026-09-07 実測（きびしい数字）

| | |
|---|---|
| SNS→HOSHILU | 8（threads 8 / x 0 / instagram 0） |
| SEO記事閲覧 → 検索開始 | 39 → **0** |
| Watch Set | **0** |
| Mall Click | **0** |
| 希望価格を設定済み | 3件（会員3人、いずれも内部） |

**SEO記事は今は増やさない。** 読まれているのに1件も検索に繋がっていない。
この状態で記事を増やすのは「SEO記事数を成果にする」（禁止事項）に当たる。
先に「既存記事から検索が始まらない原因」を潰す。

---

## 9. Claude に残る領域（Codex から依頼してよい）

本番D1の直接確認（実データを見ないと分からない不具合の切り分け）／公開URLの実地検証／
メール送信・Gmail／定期実行の作成・変更／企画・優先順位の提案。

依頼は `docs/handoff/YYYY-MM-DD-codex-to-claude-*.md` か GitHub Issue で。

---

## 10. 引き継ぐ教訓（同じ穴を踏まないために）

1. **AIが作ったものは、指示ではなく機械検査でしか担保できない。**
   9/7 のリール事故がこれ。プロンプトには正しく書いてあったのにモデルが無視した。
   自動生成物を公開する経路には、必ず「機械で確認して不合格にする」段を置く。
2. **実装の前に、そのコードが触るデータの実物を1回見る。**
   「先頭12語で2語一致」は読むだけなら妥当に見えた。保存されている商品名が実際に
   キャンペーン文で埋まっているのを見て初めて壊れていると分かった。
3. **「機能が無い」と言う前に `scheduled()` の `Promise.allSettled([...])` の中身まで全部辿る。**
   コメントだけ読んで「未実装」と誤報告した。実際は3時間ごとに動いていた。
4. **投稿の失敗は、失敗として残るとは限らない。**
   4xx でも FAILED にならず無限リトライすることがある。毎朝 §3 の点検SQLを回す。
