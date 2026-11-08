# Codex 日次点検 — 2026-11-09

## 正本・実施範囲

最新AGENTS.md、8/25起動時ルール、10/8点検引継ぎ、10/10実行管理、Claude受信箱READMEと既存18依頼、11/6 PDCA、11/7 revenue-korea-loopと設計、11/8実行結果を確認。日次9項目と月曜SEO監査を本書に統合。毎日保存の現行指示を優先。Amazon月初監査は本日対象外。

- 読取時HEAD/production source: `adedd1669d0a58d7ea582fc02b3dbeb8c1d6b287`、tree `e060661fc85bffbd35ee82716c20e27c92e7d8c6`。監視workflowのmain SHA `f20babeb`と本番sourceを混同しない。
- [Daily screens 42496987950](https://github.com/t-ooku/P-GATE/actions/runs/42496987950)、job128781338495はWorker3,148/Chrome6すべて成功、push/deploy/health成功。11/9 **00:57:47 JST** Version `00cd4e7a-b7df-4379-95f7-b476e7d1c0fe`、health/重要契約の確認00:57:52。
- 最新既存[monitor42520283544](https://github.com/t-ooku/P-GATE/actions/runs/42520283544)、job128852080627: **11/9 05:28:43〜46 JST** health/重要契約7・検索SLI・SNS SLA PASS。15分started/completed/backend/hard/degraded各0。query_structurer/Rakuten/Yahoo/ai_chat主要deep PASS、OpenAI backup billing-disabledは想定内。pending incident/advisoryなし、将来在庫3/3（11/10〜16）。08時台の直接health確認ではない。
- 開始間隔は01:08→04:31→05:28 JSTと不定、#369頻度復旧は未確認。#691の10/31未公開は日付変更後のPASSで解消扱いしない。両Issue OPEN。#739 auto-reel依存導入timeout/生成未着手/report.json欠落もOPENのまま、強制再実行・生成なし。
- KPI正本: [monitor42515427757](https://github.com/t-ooku/P-GATE/actions/runs/42515427757)、artifact **13630882735**。全体生成 **11/9 04:31:22.953 JST**、日次取得 **04:31:48.007 JST**、health成果物04:31:26 ok/missing0/weak0。最新monitorはKPI NOT_DUEなので直近の取得済み正本を再利用。
- 本週Seller記録`2026-11-09-seller-promo-weekly.md`は未着。既存weekly workflow最新runは11/2 **41372618452** success、本週QA shop DONEは未計測（本週実行/成果物なし）。二重実行・Seller販促コード改変・Claudeへの点検依頼なし。

## 前日1日：2026-11-08

**11/8 00:00:00以上〜11/9 00:00:00未満、Asia/Tokyo。集計取得11/9 04:31:48.007 JST。** UTC境界11/7 15:00以上〜11/8 15:00未満。暦日実数であり24時間ローリングでも7日差分でもない。

QA/INTERNAL、設定済み内部3会員、ITG内部店舗、本人問い合わせテスト4件を既存定義で外部成果から除外。匿名セッションを人数・注文・会社数と呼ばない。

| 指標 | 前日1日 |
|---|---:|
| LP訪問 | 7回／7セッション |
| 検索開始 | 1回／1セッション |
| 検索完了 | 1回／1セッション |
| 購入先クリック | **7回／3セッション** |
| 一般希望価格保存（既存会員ウォッチ経路） | 0回／0セッション |
| Seller LP | 0回／0セッション |
| Seller CTA／入力証拠／送信試行 | 各0回／0セッション |
| 新規外部Seller問い合わせ | 0件 |
| 有料新規契約 | 未取得（初回有料成立日時未接続） |

クリック7回は購入先リンクの計測イベントで、7人・7注文・売上ではない。同じ匿名セッションの複数回を含む。契約現在総数を日次新規へ代用しない。11/8に別承認のLINE見張り経路が配備されたが、同経路の一般利用開始/通知/再訪は今回集計に未接続。既存保存0をLINE見張りを含めた全経路0とはしない。

## 直近7日・保持データ累計

**7日窓11/2 04:31:22.953〜11/9 04:31:22.953 JST**: LP26→検索開始7→完了6セッション。独立購入先クリック **9回／5セッション**（non-QA `funnel`イベント合計9、`site_watch_journey_7d.mall_click_sessions`5）。検索完了併有のdashboard outboundは1セッションで別定義。前日の7回/3と累計を混ぜない。

検索例押下0→検索0→送客0、トップ値下がり入口0。記事12→検索開始1→希望価格保存0→購入先0セッション。一般ウォッチ0人0件、開始/通知再訪0だが匿名再訪と内部会員IDの完全joinは未接続。Seller LP1回/1セッション（最後11/6 09:51:09 JST）、CTA/入力/送信/固定失敗各0。前回7日Seller5→1は窓入替を含むため実在の4人減とはしない。

**保持累計299回／72セッション**（前回292/69から+7/+3）。保持イベント初回7/30 20:49:28.461 JST、最終11/8 22:54:52.366 JST。全事業期間の完全記録を保証せず、注文・人数・収益ではない。

Amazonのみは前日5回/1セッション、7日5回/1、保持累計62回/24（取得11/9 04:31:48.710 JST）。ASP注文・報酬・適格販売は未計測（ASP正本未接続）。11/7 handoffの11/8追記にはVCクリック/注文/報酬0という本人画像の報告があるが、本点検で画像/管理画面を再読した独立確認ではなく、現在ASP値に代用しない。

Worker候補291/現在送信対象229、sent230/queued1/failed0/unsubscribe1/response0、eligible_now0。delivered/bounceは配信イベント未接続、商談化は専用段階未接続、実返信は正しい受信箱未接続。response0は受信箱に返信なしの証明ではない。外部Seller登録/商品登録0、4問い合わせは本人テストで外部0。有料総数の最後の既存確認11/7 09:18は0、現在総数/前日新規は未取得。別Gmail11/6送信30・累計76店舗という既存記録はWorker230と対象重複未照合のため合算しない。

## 日次9項目

### 1. 固定QA：本命商品名の意味一致

成果物の通常QAは **11/8 07:23:00.789〜07:25:05.827 JST**。自動25PASS、本命名を読んだカテゴリ意味判定25/25（当初9件9/9）。11/9通常QAは04:31成果物に未収録のため本日値は未計測。昨日の結果を本日25/25としない。

| fixture群 | 本命の確認と限定 |
|---|---|
| マットレス2種 | 厚さ5cm三つ折り本体／コアラ本体。フレームでなくカテゴリ一致、同一実物保証は別 |
| 韓国リップ2種・白バッグ・リング・本革トート | PH韓国リップ／バニラコ06マキシピンク／白ショルダー／スモーキークォーツ含有リング／自立本革トート。カテゴリ一致、効能保証なし |
| shein_one_piece／amazon_storage | 綿100%タックワンピース本体／仕切り引き出し整理ケース。カテゴリ一致、当該モールの同一商品とは断定しない |
| 電気カーペット／毛布／こたつ | 40×40cm電気ミニ本体／洗える電気毛布／TEKNOS60×80本体。電源不要パッド・付属品でない、#735完了維持 |
| お名前ペン／UV／浴室洗剤／包丁研ぎ | 三菱パワフルネーム黒／ベビーカーUVカバー／緑の魔女バス泡450ml／2段階シャープナー。用途カテゴリ一致、薄れにくさ/ピンクぬめり効能の保証は別 |
| 除湿機／耳栓／血圧計／ノンフライヤー | 自動排水YUENZEE／睡眠耳栓／タニタ手首式／2L本体。カテゴリ一致 |
| 保存容器／哺乳瓶／加湿器／ペットブラシ／水筒 | フレッシュキーパー／チュチュ広口／600ml自動オフ／グルーミンググローブ／sokomo。カテゴリ一致、容器冷凍耐性等の全属性未保証 |

### 2. 写真検索失敗

写真限定24h backend_failed/provider_degradedの固定campaign別は**未計測（安全内訳未接続）**。15分SLIの0を24h写真0としない。T0はPR741/1527f8f3/CI42427388432で11/8 08:56:58配備、Version f01c82a7-0c00-4359-a284-7c1b47208241、health成功という既存証拠を確認。弱いmouseラベルが先頭3entityのみからComputerへ落ちる固定モックに対する具体カテゴリ/ブランド保持の局所修復は配備済み。元実機Gemini失敗原因・7日provider/fallback率・同写真上位3件は未取得、T0全体は一部実装。追加写真/検索文・有料probeなし。

### 3. 希望価格ウォッチ巡回

一般会員ウォッチ0人0件。内部除外済み24h NO_CANDIDATES/NO_MATCH/ABOVE_TARGET/REACHEDは**未計測（成果物未接続）**、偏重診断不可。LINE新経路は別表・別イベントで未集計、0に埋めない。

### 4. 価格記録増加

price_observations COUNT/前日差は**未計測（正本未接続）**。price cache903/fresh903は別テーブルであり件数増加の代用不可。

### 5. SNS滞留・公開

全platform APPROVED/PUBLISHINGかつlast_errorありの全期間件数/content_idは**未計測（安全内訳未接続）**。本日予定分Instagram APPROVED1/Threads APPROVED2/error NONEは全期間滞留の代用でない。Threads FAILED27最終10/21 20:32:55 JSTは不変。PDCAに11/6 20:32:55 PUBLISHED1の記録があるが公開ID/URL未取得で完全復旧未確認。本人再認証申告を否定せず、新規401証拠なしに再ログイン/Secret更新を求めない。

取得済み最新Instagram三要素は11/7 20:02:55.950 JST、ID17989196049093879、https://www.instagram.com/p/DfcB7CZm0JK/ 。11/8分のID/URLは本成果物になく未確認。10/15・17の過去確認を取り消さず、本日証拠としては再確認不能。X停止、#616旧素材レビュー待ち・再生成/公開なし。

### 6. モール到達

前日7回/3セッション、7日9回/5、完了併有1/6。モール別click/shown CTR・検索後1タップ率は**未計測（shown/tap内訳未接続）**。1/6を1タップ率としない。

### 7. 最大ボトルネック：B「検索しない」1つ

LP26→検索7、差19セッション、開始26.9%。前日7→1も同段階。検索例押下0のため、次の既存入口修正前にENTRYのスマホ44px/横はみ出し/例ハンドラ/主CTA到達のガードレールを確認する。因果効果は未判定。LP構成・少標本の影響があり26.9%を改善成功とはしない。

ENTRY-20261106-01は16efa842/8b1069f5/CI42231687448、11/6 23:13配備・PC44px確認済み、スマホ実測は未完了。11/7〜13観測・11/14評価を維持。ただし11/8の#742 LINE見張り配備は同期間の別介入として記録し、単純前後差をENTRYの効果に帰属させない。旧HOLD7/20は因果判断保留としてのみ使用、再現不具合修復の全面停止は解除済み。

### 8. 制作停止・実行管理

10/8旧定期制作/教師量産停止は想定内。新記事/SNS/営業の実行は本点検でなし。18受信箱はDONE16/BLOCKED2。seller-form-recoveryは11/7 ACKED→DONEだがローカル/モック確認のみ、実装/配備なし。400 VALIDATION_FAILED後の該当欄focusとTurnstile実経路の未確認を既存日次改善責任者へ継続引継ぎ、重複依頼/並行修正なし。

seller-live-connectionは11/7 ACKED→BLOCKEDのまま。初回指定店舗の送信0/下書き1/送信IDなしと、既存営業全体sent230を分ける。14:16の実タスク再読は火〜金09:07・次11/10、土日設定完了の新証拠なし。送信/タスク編集拒否を別アカウント/API/フォームで迂回しない。既に作成した本人指示文面をここへ貼ったことをClaude受領・実行と呼ばない。Claude即時起動不可/README巡回連携あり、時刻は将来保証でない。

11/8別承認で#742 LINE見張り（2b5840e4、apply42434784139）、#743商品名宣伝除去（1dc54043、apply42435636411）の実装/CI/配備/health成功を確認。新規表0096は既存成果物に適用記録11/8 10:31:58 JSTあり、本点検で書込/再適用なし。実利用開始・通知・再訪・外部成果の確認は未取得であり稼働成功と呼ばない。`/line/watch` GETは書込を起こすため本点検で開かない。

T1 handoff追記ではVC referral停止継続を指摘。URL別監査成果物は未着。次の既存改善責任者へ、モールごとに正しい着地を確認する読み取り監査と、VCフラグ有効化は本人承認後という境界を渡す。自動的な有効化/送客先変更なし。

### 9. 14日超未更新Issue

`repo:t-ooku/P-GATE is:issue is:open updated:<2026-10-26`で46件。前回同数、更新日基準であり全件同一優先度とはしない。

687, 682, 674, 660, 659, 643, 640, 616, 609, 604, 590, 536, 529, 526, 489, 477, 473, 467, 466, 465, 464, 463, 432, 423, 422, 388, 369, 353, 326, 325, 321, 289, 273, 270, 260, 258, 223, 219, 169, 161, 149, 123, 74, 52, 44, 1。

## 月曜SEO監査：新しいP1あり

**11/9 08:26:10 JST取得完了**。リポジトリと本番標準sitemapは各158 URL、集合差0。標準掲載の日本語153ページと追加ジャンル/場面29、計182ルートすべてHTTP200、title/description欠落0。既存142日本語記事のevaluateSeoPageQuality最小100。npm testは上記既存CIのWorker3,148/Chrome6全件成功を再利用。商品個別/店舗/認証ページ全URLは今回の母集団外。

title+descriptionの空白除去・小文字化・文字2-gram Set Diceは全182で0.40以上576対、うち0.50以上312対。同じ標準153範囲は165対/29対で前週同数。棚ページは動的な数字/記録が変わるため全体575→576/325→312をコピー改善と断定しない。最大face-wash/toys0.9379。全該当対は下表へ保存。新記事制作0、記事12→検索1→保存0で継続獲得は未実証。既存入口の視認性/意図接続を観測し、本文原因と断定しない。

### P1再現・既存日次改善責任者への具体的引継ぎ

標準sitemapは正常だが、**動的 `/sitemap-genres.xml` 26 URLのうち、10ジャンルが公開ページnoindexと不整合**。08:26の全件robotsと08:27の動的mapを照合。該当はsweets/kitchen/bags/pet/mens-fashion/supplement/face-wash/shoes/toys/beauty-health-appliance。非掲載のnoindex場面3件は不整合扱いしない。

**08:27:12 JSTに通常GETで再確認**: sitemap200・sweets/kitchen/face-wash/toysを掲載、同4ページ200だがrobots=`noindex,follow`。全て公開cache HIT、max-age14400、ageはmap983秒、sweets1018/kitchen927/face-wash63/toys62。キャッシュ無効化/パラメータ回避/変更はしていない。観測上の不整合は再現済みだが、origin判定のバグと断定せず、独立キャッシュ時点/データ入力差を切り分ける。

次の具体作業: `src/owned-media.mjs` の `loadIndexableGenres→loadAllGenreRankings` と `handleOwnedMediaRoutes→loadGenreRanking/withShelfHistories` が同じ履歴入力で同判定になるか固定fixtureで比較し、ページとmapのキャッシュ時点差を検証。掲載26を前提にindexフラグを強制しない。#708 DONEを今日の正常証拠にせず、既存日次改善責任者の次の修正候補として本書/実行管理に渡す。本点検は新たな並行修正/Claude重複依頼を開始しない。

## 大隆さんがやること

新たな認証/課金承認依頼なし。以前からの本人だけの操作は、[Claude](https://claude.ai/)の定期タスク→「HOSHILU セラー案内 毎日30通（火〜金・Gmail）」を開き、同じタスクの曜日・題名・本文を火〜日09:07 JSTへ整合させること。月曜既存週次は維持。送信許可も本人操作待ちだが、正確な許可画面/選択肢は未確認のため推測手順を示さない。既存拒否の反復・別経路迂回なし。Threads再ログインやClaudeへの点検転送は不要。

本点検は観測/再現条件/文書保存のみ。本番D1直読書込、SNS公開、営業送信、新記事、有料probe、料金規約注意書き変更、追加スケジュールなし。

### 類似対全件（Dice 0.40以上）

| ページA | ページB | Dice |
|---|---|---:|
| /media/genre/face-wash | /media/genre/toys | 0.9379 |
| /media/genre/face-wash | /media/genre/shoes | 0.9326 |
| /media/genre/supplement | /media/genre/face-wash | 0.9274 |
| /media/genre/shoes | /media/genre/toys | 0.9274 |
| /media/genre/face-lotion | /media/genre/food | 0.9255 |
| /media/genre/supplement | /media/genre/toys | 0.9222 |
| /media/genre/face-wash | /media/genre/beauty-health-appliance | 0.9222 |
| /media/genre/food | /media/genre/face-wash | 0.9213 |
| /media/genre/womens-sneakers | /media/genre/food | 0.9206 |
| /media/genre/sweets | /media/genre/face-wash | 0.9171 |
| /media/genre/pet | /media/genre/face-wash | 0.9171 |
| /media/genre/supplement | /media/genre/shoes | 0.9171 |
| /media/genre/beauty-health-appliance | /media/genre/toys | 0.9171 |
| /media/genre/food | /media/genre/toys | 0.9162 |
| /media/genre/sweets | /media/genre/toys | 0.9121 |
| /media/genre/pet | /media/genre/toys | 0.9121 |
| /media/genre/mens-fashion | /media/genre/face-wash | 0.9121 |
| /media/genre/beauty-health-appliance | /media/genre/shoes | 0.9121 |
| /media/genre/food | /media/genre/shoes | 0.9111 |
| /media/genre/mens-fashion | /media/genre/supplement | 0.9081 |
| /media/scene/hitorigurashi | /media/scene/korean | 0.9079 |
| /media/genre/sweets | /media/genre/shoes | 0.9071 |
| /media/genre/pet | /media/genre/shoes | 0.9071 |
| /media/genre/mens-fashion | /media/genre/toys | 0.9071 |
| /media/genre/supplement | /media/genre/beauty-health-appliance | 0.9071 |
| /media/genre/food | /media/genre/supplement | 0.9061 |
| /media/genre/sweets | /media/genre/supplement | 0.9022 |
| /media/genre/pet | /media/genre/supplement | 0.9022 |
| /media/genre/mens-fashion | /media/genre/shoes | 0.9022 |
| /media/genre/food | /media/genre/kitchen | 0.9016 |
| /media/genre/food | /media/genre/beauty-health-appliance | 0.9011 |
| /media/genre/sweets | /media/genre/beauty-health-appliance | 0.8973 |
| /media/genre/bags | /media/genre/face-wash | 0.8973 |
| /media/genre/pet | /media/genre/beauty-health-appliance | 0.8973 |
| /media/genre/food | /media/genre/sweets | 0.8962 |
| /media/genre/food | /media/genre/pet | 0.8962 |
| /media/genre/face-lotion | /media/genre/mens-fashion | 0.8958 |
| /media/scene/commute | /media/scene/travel | 0.8944 |
| /media/genre/sweets | /media/genre/pet | 0.8925 |
| /media/genre/bags | /media/genre/toys | 0.8925 |
| /media/genre/mens-fashion | /media/genre/beauty-health-appliance | 0.8925 |
| /media/genre/food | /media/genre/mens-fashion | 0.8913 |
| /media/genre/handheld-fan | /media/genre/skincare | 0.8912 |
| /media/scene/travel | /media/scene/korean | 0.8903 |
| /media/genre/handheld-fan | /media/genre/wireless-earphones | 0.8878 |
| /media/genre/sweets | /media/genre/mens-fashion | 0.8877 |
| /media/genre/bags | /media/genre/shoes | 0.8877 |
| /media/genre/pet | /media/genre/mens-fashion | 0.8877 |
| /media/scene/commute | /media/scene/korean | 0.8846 |
| /media/genre/womens-sneakers | /media/genre/face-lotion | 0.8832 |
| /media/genre/bags | /media/genre/supplement | 0.8830 |
| /media/genre/face-lotion | /media/genre/face-wash | 0.8817 |
| /media/genre/handheld-fan | /media/genre/womens-fashion | 0.8800 |
| /media/scene/hitorigurashi | /media/scene/travel | 0.8790 |
| /media/genre/bags | /media/genre/beauty-health-appliance | 0.8783 |
| /media/genre/womens-sneakers | /media/genre/face-wash | 0.8770 |
| /media/genre/face-lotion | /media/genre/toys | 0.8770 |
| /media/genre/food | /media/genre/bags | 0.8770 |
| /media/genre/sweets | /media/genre/bags | 0.8737 |
| /media/genre/bags | /media/genre/pet | 0.8737 |
| /media/scene/hitorigurashi | /media/scene/commute | 0.8734 |
| /media/scene/korean | /media/scene/big-size | 0.8734 |
| /media/genre/wireless-earphones | /media/genre/mobile-battery | 0.8731 |
| /media/genre/womens-sneakers | /media/genre/toys | 0.8723 |
| /media/genre/face-lotion | /media/genre/shoes | 0.8723 |
| /media/genre/wireless-earphones | /media/genre/skincare | 0.8705 |
| /media/genre/bags | /media/genre/mens-fashion | 0.8691 |
| /media/genre/womens-sneakers | /media/genre/shoes | 0.8677 |
| /media/genre/face-lotion | /media/genre/supplement | 0.8677 |
| /media/genre/mobile-battery | /media/genre/skincare | 0.8660 |
| /media/genre/face-lotion | /media/genre/kitchen | 0.8657 |
| /media/genre/womens-sneakers | /media/genre/supplement | 0.8632 |
| /media/genre/face-lotion | /media/genre/beauty-health-appliance | 0.8632 |
| /media/genre/interior | /media/genre/skincare | 0.8629 |
| /media/genre/skincare | /media/genre/womens-fashion | 0.8629 |
| /media/scene/hitorigurashi | /media/scene/big-size | 0.8625 |
| /media/genre/beauty-cosme | /media/genre/skincare | 0.8615 |
| /media/genre/wireless-earphones | /media/genre/kids-baby | 0.8614 |
| /media/genre/womens-sneakers | /media/genre/kitchen | 0.8614 |
| /media/genre/wireless-earphones | /media/genre/womens-fashion | 0.8600 |
| /media/scene/travel | /media/scene/big-size | 0.8589 |
| /media/genre/womens-sneakers | /media/genre/beauty-health-appliance | 0.8586 |
| /media/genre/face-lotion | /media/genre/sweets | 0.8586 |
| /media/genre/face-lotion | /media/genre/pet | 0.8586 |
| /media/genre/kitchen | /media/genre/face-wash | 0.8586 |
| /media/genre/mobile-battery | /media/genre/kids-baby | 0.8571 |
| /media/genre/wireless-earphones | /media/genre/daily-goods | 0.8557 |
| /media/genre/mobile-battery | /media/genre/beauty-cosme | 0.8543 |
| /media/genre/womens-sneakers | /media/genre/sweets | 0.8542 |
| /media/genre/womens-sneakers | /media/genre/pet | 0.8542 |
| /media/genre/kitchen | /media/genre/toys | 0.8542 |
| /media/scene/commute | /media/scene/big-size | 0.8537 |
| /media/genre/handheld-fan | /media/genre/mobile-battery | 0.8528 |
| /media/genre/mobile-battery | /media/genre/daily-goods | 0.8515 |
| /media/scene/kids | /media/scene/gift | 0.8515 |
| /media/genre/handheld-fan | /media/genre/interior | 0.8500 |
| /media/genre/wireless-earphones | /media/genre/interior | 0.8500 |
| /media/genre/womens-sneakers | /media/genre/mens-fashion | 0.8497 |
| /media/genre/kitchen | /media/genre/shoes | 0.8497 |
| /media/genre/handheld-fan | /media/genre/beauty-cosme | 0.8485 |
| /media/genre/wireless-earphones | /media/genre/beauty-cosme | 0.8485 |
| /media/genre/daily-goods | /media/genre/skincare | 0.8485 |
| /media/genre/mobile-battery | /media/genre/interior | 0.8458 |
| /media/genre/mobile-battery | /media/genre/womens-fashion | 0.8458 |
| /media/genre/kitchen | /media/genre/supplement | 0.8454 |
| /media/genre/kids-baby | /media/genre/skincare | 0.8442 |
| /media/genre/handheld-fan | /media/genre/kids-baby | 0.8416 |
| /media/genre/beauty-cosme | /media/genre/womens-fashion | 0.8416 |
| /media/genre/face-lotion | /media/genre/bags | 0.8410 |
| /media/genre/kitchen | /media/genre/beauty-health-appliance | 0.8410 |
| /media/genre/daily-goods | /media/genre/beauty-cosme | 0.8374 |
| /media/genre/womens-sneakers | /media/genre/bags | 0.8367 |
| /media/genre/sweets | /media/genre/kitchen | 0.8367 |
| /media/genre/kitchen | /media/genre/pet | 0.8367 |
| /media/genre/handheld-fan | /media/genre/daily-goods | 0.8358 |
| /media/genre/kids-baby | /media/genre/beauty-cosme | 0.8333 |
| /media/genre/kitchen | /media/genre/mens-fashion | 0.8325 |
| /media/genre/interior | /media/genre/beauty-cosme | 0.8317 |
| /media/genre/kids-baby | /media/genre/daily-goods | 0.8309 |
| /media/genre/daily-goods | /media/genre/interior | 0.8293 |
| /media/genre/kids-baby | /media/genre/interior | 0.8252 |
| /media/genre/kids-baby | /media/genre/womens-fashion | 0.8252 |
| /media/genre/interior | /media/genre/womens-fashion | 0.8235 |
| /media/genre/food | /media/genre/skincare | 0.8216 |
| /media/genre/kitchen | /media/genre/bags | 0.8200 |
| /media/genre/daily-goods | /media/genre/womens-fashion | 0.8195 |
| /media/genre/handheld-fan | /media/genre/food | 0.8085 |
| /media/genre/wireless-earphones | /media/genre/food | 0.8085 |
| /media/genre/womens-sneakers | /media/genre/womens-fashion | 0.8060 |
| /media/genre/mobile-battery | /media/genre/food | 0.8042 |
| /media/genre/face-lotion | /media/genre/womens-fashion | 0.8000 |
| /media/genre/food | /media/genre/beauty-cosme | 0.8000 |
| /media/genre/handheld-fan | /media/genre/face-lotion | 0.7959 |
| /media/genre/wireless-earphones | /media/genre/face-lotion | 0.7959 |
| /media/genre/womens-fashion | /media/genre/mens-fashion | 0.7959 |
| /media/scene/kids | /media/scene/korean | 0.7931 |
| /media/genre/food | /media/genre/interior | 0.7917 |
| /media/genre/food | /media/genre/womens-fashion | 0.7917 |
| /media/genre/womens-sneakers | /media/genre/mobile-battery | 0.7879 |
| /media/genre/face-lotion | /media/genre/skincare | 0.7876 |
| /media/genre/food | /media/genre/daily-goods | 0.7876 |
| /media/scene/gift | /media/scene/korean | 0.7865 |
| /media/scene/hitorigurashi | /media/scene/kids | 0.7841 |
| /media/genre/womens-sneakers | /media/genre/skincare | 0.7835 |
| /media/genre/kids-baby | /media/genre/food | 0.7835 |
| /media/scene/kids | /media/scene/travel | 0.7821 |
| /media/genre/handheld-fan | /media/genre/womens-sneakers | 0.7817 |
| /media/scene/kids | /media/scene/commute | 0.7778 |
| /media/genre/skincare | /media/genre/face-wash | 0.7760 |
| /media/genre/skincare | /media/genre/toys | 0.7717 |
| /media/genre/wireless-earphones | /media/genre/womens-sneakers | 0.7716 |
| /media/genre/mobile-battery | /media/genre/face-lotion | 0.7716 |
| /media/genre/handheld-fan | /media/genre/mens-fashion | 0.7708 |
| /media/genre/beauty-cosme | /media/genre/beauty-health-appliance | 0.7708 |
| /media/genre/face-lotion | /media/genre/beauty-cosme | 0.7677 |
| /media/genre/kitchen | /media/genre/skincare | 0.7677 |
| /media/genre/skincare | /media/genre/shoes | 0.7676 |
| /media/scene/hitorigurashi | /media/scene/gift | 0.7667 |
| /media/genre/sweets | /media/genre/skincare | 0.7660 |
| /media/genre/womens-sneakers | /media/genre/beauty-cosme | 0.7638 |
| /media/genre/handheld-fan | /media/genre/face-wash | 0.7634 |
| /media/genre/wireless-earphones | /media/genre/face-wash | 0.7634 |
| /media/genre/skincare | /media/genre/supplement | 0.7634 |
| /media/genre/wireless-earphones | /media/genre/mens-fashion | 0.7604 |
| /media/genre/face-lotion | /media/genre/interior | 0.7600 |
| /media/genre/handheld-fan | /media/genre/toys | 0.7594 |
| /media/genre/wireless-earphones | /media/genre/toys | 0.7594 |
| /media/genre/mobile-battery | /media/genre/face-wash | 0.7594 |
| /media/genre/skincare | /media/genre/beauty-health-appliance | 0.7594 |
| /media/scene/kids | /media/scene/big-size | 0.7582 |
| /media/genre/handheld-fan | /media/genre/kitchen | 0.7562 |
| /media/genre/wireless-earphones | /media/genre/kitchen | 0.7562 |
| /media/genre/womens-sneakers | /media/genre/interior | 0.7562 |
| /media/genre/face-lotion | /media/genre/daily-goods | 0.7562 |
| /media/genre/handheld-fan | /media/genre/shoes | 0.7553 |
| /media/genre/wireless-earphones | /media/genre/shoes | 0.7553 |
| /media/genre/mobile-battery | /media/genre/toys | 0.7553 |
| /media/genre/beauty-cosme | /media/genre/face-wash | 0.7553 |
| /media/genre/skincare | /media/genre/pet | 0.7553 |
| /media/scene/gift | /media/scene/travel | 0.7541 |
| /media/genre/wireless-earphones | /media/genre/sweets | 0.7539 |
| /media/genre/kids-baby | /media/genre/kitchen | 0.7536 |
| /media/genre/womens-sneakers | /media/genre/daily-goods | 0.7525 |
| /media/genre/mobile-battery | /media/genre/kitchen | 0.7525 |
| /media/genre/face-lotion | /media/genre/kids-baby | 0.7525 |
| /media/genre/handheld-fan | /media/genre/supplement | 0.7513 |
| /media/genre/wireless-earphones | /media/genre/supplement | 0.7513 |
| /media/genre/mobile-battery | /media/genre/shoes | 0.7513 |
| /media/genre/beauty-cosme | /media/genre/toys | 0.7513 |
| /media/genre/skincare | /media/genre/mens-fashion | 0.7513 |
| /media/scene/gift | /media/scene/commute | 0.7500 |
| /media/genre/womens-sneakers | /media/genre/kids-baby | 0.7488 |
| /media/genre/kitchen | /media/genre/beauty-cosme | 0.7488 |
| /media/genre/daily-goods | /media/genre/kitchen | 0.7476 |
| /media/genre/handheld-fan | /media/genre/beauty-health-appliance | 0.7474 |
| /media/genre/wireless-earphones | /media/genre/beauty-health-appliance | 0.7474 |
| /media/genre/mobile-battery | /media/genre/supplement | 0.7474 |
| /media/genre/interior | /media/genre/face-wash | 0.7474 |
| /media/genre/beauty-cosme | /media/genre/shoes | 0.7474 |
| /media/genre/womens-fashion | /media/genre/face-wash | 0.7474 |
| /media/genre/handheld-fan | /media/genre/sweets | 0.7435 |
| /media/genre/handheld-fan | /media/genre/pet | 0.7435 |
| /media/genre/wireless-earphones | /media/genre/pet | 0.7435 |
| /media/genre/mobile-battery | /media/genre/beauty-health-appliance | 0.7435 |
| /media/genre/daily-goods | /media/genre/face-wash | 0.7435 |
| /media/genre/interior | /media/genre/toys | 0.7435 |
| /media/genre/beauty-cosme | /media/genre/supplement | 0.7435 |
| /media/genre/womens-fashion | /media/genre/toys | 0.7435 |
| /media/scene/gift | /media/scene/big-size | 0.7419 |
| /media/genre/kitchen | /media/genre/interior | 0.7415 |
| /media/genre/kitchen | /media/genre/womens-fashion | 0.7415 |
| /media/genre/mobile-battery | /media/genre/sweets | 0.7396 |
| /media/genre/mobile-battery | /media/genre/pet | 0.7396 |
| /media/genre/kids-baby | /media/genre/face-wash | 0.7396 |
| /media/genre/daily-goods | /media/genre/toys | 0.7396 |
| /media/genre/interior | /media/genre/shoes | 0.7396 |
| /media/genre/skincare | /media/genre/bags | 0.7396 |
| /media/genre/womens-fashion | /media/genre/shoes | 0.7396 |
| /media/genre/mobile-battery | /media/genre/mens-fashion | 0.7358 |
| /media/genre/kids-baby | /media/genre/toys | 0.7358 |
| /media/genre/sweets | /media/genre/beauty-cosme | 0.7358 |
| /media/genre/daily-goods | /media/genre/shoes | 0.7358 |
| /media/genre/interior | /media/genre/supplement | 0.7358 |
| /media/genre/beauty-cosme | /media/genre/pet | 0.7358 |
| /media/genre/womens-fashion | /media/genre/supplement | 0.7358 |
| /media/genre/mobile-battery | /media/genre/bags | 0.7347 |
| /media/genre/kids-baby | /media/genre/shoes | 0.7320 |
| /media/genre/daily-goods | /media/genre/supplement | 0.7320 |
| /media/genre/interior | /media/genre/beauty-health-appliance | 0.7320 |
| /media/genre/beauty-cosme | /media/genre/mens-fashion | 0.7320 |
| /media/genre/womens-fashion | /media/genre/beauty-health-appliance | 0.7320 |
| /media/genre/kids-baby | /media/genre/pet | 0.7310 |
| /media/genre/handheld-fan | /media/genre/bags | 0.7282 |
| /media/genre/wireless-earphones | /media/genre/bags | 0.7282 |
| /media/genre/kids-baby | /media/genre/supplement | 0.7282 |
| /media/genre/sweets | /media/genre/interior | 0.7282 |
| /media/genre/sweets | /media/genre/womens-fashion | 0.7282 |
| /media/genre/daily-goods | /media/genre/beauty-health-appliance | 0.7282 |
| /media/genre/interior | /media/genre/pet | 0.7282 |
| /media/genre/womens-fashion | /media/genre/pet | 0.7282 |
| /media/genre/kids-baby | /media/genre/beauty-health-appliance | 0.7245 |
| /media/genre/sweets | /media/genre/daily-goods | 0.7245 |
| /media/genre/daily-goods | /media/genre/pet | 0.7245 |
| /media/genre/interior | /media/genre/mens-fashion | 0.7245 |
| /ja/search-products-from-instagram-post-urls | /ja/search-products-from-x-post-urls | 0.7211 |
| /media/genre/kids-baby | /media/genre/sweets | 0.7208 |
| /media/genre/daily-goods | /media/genre/mens-fashion | 0.7208 |
| /media/genre/beauty-cosme | /media/genre/bags | 0.7208 |
| /media/genre/daily-goods | /media/genre/bags | 0.7200 |
| /media/genre/kids-baby | /media/genre/mens-fashion | 0.7172 |
| /media/genre/interior | /media/genre/bags | 0.7136 |
| /media/genre/womens-fashion | /media/genre/bags | 0.7136 |
| /media/genre/kids-baby | /media/genre/bags | 0.7065 |
| /ja/search-products-from-tiktok-video-urls | /ja/search-products-from-x-post-urls | 0.7000 |
| /ja/compare-amazon-and-rakuten | /ja/compare-qoo10-and-rakuten | 0.6917 |
| /ja/search-products-from-instagram-post-urls | /ja/search-products-from-tiktok-video-urls | 0.6887 |
| /ja/compare-multiple-shops | /ja/compare-amazon-rakuten-yahoo-shopping | 0.6711 |
| /ja/american-products-in-japan | /ja/shopping-in-japan | 0.6667 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.6667 |
| /ja/compare-amazon-and-qoo10 | /ja/compare-qoo10-and-rakuten | 0.6618 |
| /ja/search-products-by-budget-and-purpose | /ja/find-a-gift-by-recipient-and-occasion | 0.6190 |
| /media/genre/skincare | /media/scene/kids | 0.6082 |
| /ja/compare-amazon-and-rakuten | /ja/compare-amazon-and-qoo10 | 0.6074 |
| /ja/how-to-read-shopping-reviews | /ja/read-korean-cosmetics-reviews-by-skin-type | 0.6015 |
| /media/genre/handheld-fan | /media/scene/kids | 0.5990 |
| /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | /ja/compare-robot-vacuums-by-floor-threshold-and-maintenance | 0.5986 |
| /media | /media/price-drops | 0.5957 |
| /media/genre/kids-baby | /media/scene/kids | 0.5911 |
| /media/genre/wireless-earphones | /media/scene/kids | 0.5787 |
| /ja/find-fan-activity-goods-by-purpose | /ja/use-fan-goods-rankings-by-purpose | 0.5781 |
| /media/genre/mobile-battery | /media/scene/kids | 0.5758 |
| /media/genre/skincare | /media/scene/gift | 0.5758 |
| /media/genre/womens-fashion | /media/scene/gift | 0.5756 |
| /media/genre/mobile-battery | /media/scene/gift | 0.5743 |
| /ja/find-products-seen-on-social-media | /ja/find-products-seen-on-tiktok | 0.5733 |
| /media/genre/beauty-cosme | /media/scene/kids | 0.5729 |
| /media/genre/handheld-fan | /media/scene/gift | 0.5672 |
| /media/genre/wireless-earphones | /media/scene/gift | 0.5672 |
| /media/genre/interior | /media/scene/kids | 0.5672 |
| /media/genre/womens-fashion | /media/scene/kids | 0.5672 |
| /media/genre/daily-goods | /media/scene/kids | 0.5644 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-instagram-post-urls | 0.5622 |
| /ja/choose-refrigerator-by-space-capacity-and-door | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.5621 |
| /media/genre/beauty-cosme | /media/scene/gift | 0.5616 |
| /media/genre/interior | /media/scene/gift | 0.5561 |
| /media/genre/daily-goods | /media/scene/gift | 0.5534 |
| /media/genre/kids-baby | /media/scene/gift | 0.5507 |
| /ja/prepare-for-qoo10-mega-sale | /ja/prepare-for-rakuten-sale-events | 0.5359 |
| /ja/how-to-use-shopping-rankings | /ja/use-korean-cosmetics-rankings-safely | 0.5352 |
| /ja/shopping-in-japan | /ja/shopping-guide-for-parents | 0.5313 |
| /ja/find-products-seen-on-tiktok | /ja/find-fashion-items-seen-on-instagram | 0.5290 |
| /ja/find-products-seen-on-tiktok | /ja/find-products-introduced-on-youtube | 0.5235 |
| /ja/choose-folding-umbrella-by-open-size-and-weight | /ja/choose-hair-dryer-by-weight-controls-and-storage | 0.5185 |
| /media/genre/food | /media/scene/kids | 0.5185 |
| /ja/find-products-seen-on-social-media | /ja/find-fashion-items-seen-on-instagram | 0.5170 |
| /media/scene/kids | /media/genre/face-wash | 0.5134 |
| /ja/find-a-product-you-saw-in-a-store | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.5109 |
| /ja/search-products-from-saved-images | /ja/search-products-from-x-post-urls | 0.5109 |
| /media/scene/kids | /media/genre/toys | 0.5106 |
| /media/scene/kids | /media/genre/shoes | 0.5079 |
| /media/genre/food | /media/scene/gift | 0.5078 |
| /media/scene/kids | /media/genre/supplement | 0.5053 |
| /media/scene/gift | /media/genre/supplement | 0.5052 |
| /media/scene/kids | /media/genre/beauty-health-appliance | 0.5026 |
| /media/scene/gift | /media/genre/face-wash | 0.5026 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/plan-shopping-with-ec-sale-calendar | 0.5000 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-living-alone | 0.5000 |
| /ja/read-korean-fashion-size-reviews | /ja/compare-korean-fashion-purchase-sites | 0.5000 |
| /media/genre/sweets | /media/scene/kids | 0.5000 |
| /media/genre/pet | /media/scene/kids | 0.5000 |
| /media/genre/pet | /media/scene/gift | 0.5000 |
| /media/scene/gift | /media/genre/toys | 0.5000 |
| /media/genre/face-lotion | /media/scene/kids | 0.4975 |
| /media/scene/kids | /media/genre/mens-fashion | 0.4974 |
| /media/scene/gift | /media/genre/shoes | 0.4974 |
| /media/genre/food | /media/scene/korean | 0.4970 |
| /ja/compare-multiple-shops | /ja/plan-shopping-with-ec-sale-calendar | 0.4969 |
| /media/genre/womens-sneakers | /media/scene/kids | 0.4949 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-tiktok-video-urls | 0.4944 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-x-post-urls | 0.4943 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4937 |
| /media/scene/gift | /media/genre/beauty-health-appliance | 0.4923 |
| /media/genre/food | /media/scene/hitorigurashi | 0.4910 |
| /ja/find-discontinued-or-renamed-products | /ja/find-products-seen-on-tiktok | 0.4908 |
| /media/scene/korean | /media/genre/face-wash | 0.4908 |
| /ja/find-fashion-items-seen-on-instagram | /ja/search-products-from-instagram-post-urls | 0.4903 |
| /ja/find-products-seen-on-tiktok | /ja/identify-a-product-someone-else-is-using | 0.4901 |
| /media/genre/sweets | /media/scene/gift | 0.4898 |
| /media/genre/bags | /media/scene/kids | 0.4898 |
| /media/scene/korean | /media/genre/toys | 0.4878 |
| /media/genre/face-lotion | /media/scene/gift | 0.4876 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4875 |
| /media/scene/gift | /media/genre/mens-fashion | 0.4873 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4872 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4872 |
| /media/genre/food | /media/scene/big-size | 0.4855 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/compare-amazon-and-rakuten | 0.4853 |
| /media/genre/womens-sneakers | /media/scene/gift | 0.4851 |
| /media/genre/kitchen | /media/scene/kids | 0.4851 |
| /media/scene/hitorigurashi | /media/genre/face-wash | 0.4848 |
| /media/scene/korean | /media/genre/shoes | 0.4848 |
| /ja/use-fan-goods-rankings-by-purpose | /ja/use-student-commute-item-rankings | 0.4844 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4832 |
| /media/genre/food | /media/scene/travel | 0.4824 |
| /media/genre/skincare | /media/scene/korean | 0.4824 |
| /ja/compare-korean-cosmetics-across-malls | /ja/compare-korean-fashion-purchase-sites | 0.4823 |
| /media/scene/hitorigurashi | /media/genre/toys | 0.4819 |
| /media/scene/korean | /media/genre/supplement | 0.4819 |
| /media/genre/bags | /media/scene/gift | 0.4800 |
| /media/genre/food | /media/scene/commute | 0.4795 |
| /media/scene/big-size | /media/genre/face-wash | 0.4795 |
| /media/scene/hitorigurashi | /media/genre/shoes | 0.4790 |
| /media/scene/korean | /media/genre/beauty-health-appliance | 0.4790 |
| /ja/compare-multiple-shops | /ja/find-cheapest-across-malls | 0.4789 |
| /creator-terms | /for-creators | 0.4776 |
| /ja/american-products-in-japan | /ja/search-product-by-model-number | 0.4771 |
| /media/genre/skincare | /media/scene/hitorigurashi | 0.4767 |
| /media/scene/big-size | /media/genre/toys | 0.4767 |
| /media/genre/sweets | /media/scene/korean | 0.4762 |
| /media/genre/pet | /media/scene/korean | 0.4762 |
| /media/scene/hitorigurashi | /media/genre/supplement | 0.4762 |
| /media/scene/travel | /media/genre/face-wash | 0.4762 |
| /media/genre/kitchen | /media/scene/gift | 0.4757 |
| /ja/compare-delivery-and-return-conditions | /ja/compare-korean-fashion-purchase-sites | 0.4755 |
| /ja/search-product-by-model-number | /ja/search-products-by-budget-and-purpose | 0.4754 |
| /media/genre/handheld-fan | /media/scene/korean | 0.4740 |
| /media/genre/wireless-earphones | /media/scene/korean | 0.4740 |
| /media/genre/face-lotion | /media/scene/korean | 0.4740 |
| /media/scene/big-size | /media/genre/shoes | 0.4740 |
| /media/scene/hitorigurashi | /media/genre/beauty-health-appliance | 0.4734 |
| /media/scene/commute | /media/genre/face-wash | 0.4734 |
| /media/scene/travel | /media/genre/toys | 0.4734 |
| /media/scene/korean | /media/genre/mens-fashion | 0.4734 |
| /media/genre/womens-sneakers | /media/scene/korean | 0.4713 |
| /media/genre/mobile-battery | /media/scene/korean | 0.4713 |
| /media/scene/big-size | /media/genre/supplement | 0.4713 |
| /media/genre/sweets | /media/scene/hitorigurashi | 0.4706 |
| /media/genre/pet | /media/scene/hitorigurashi | 0.4706 |
| /media/scene/commute | /media/genre/toys | 0.4706 |
| /media/scene/travel | /media/genre/shoes | 0.4706 |
| /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | /ja/compare-air-purifiers-by-room-filter-and-maintenance | 0.4698 |
| /media/genre/handheld-fan | /media/scene/hitorigurashi | 0.4686 |
| /media/genre/wireless-earphones | /media/scene/hitorigurashi | 0.4686 |
| /media/genre/face-lotion | /media/scene/hitorigurashi | 0.4686 |
| /media/genre/beauty-cosme | /media/scene/korean | 0.4686 |
| /media/genre/skincare | /media/scene/travel | 0.4686 |
| /media/scene/big-size | /media/genre/beauty-health-appliance | 0.4686 |
| /ja/search-products-from-saved-images | /ja/search-products-from-tiktok-video-urls | 0.4681 |
| /media/scene/hitorigurashi | /media/genre/mens-fashion | 0.4678 |
| /media/scene/commute | /media/genre/shoes | 0.4678 |
| /media/scene/travel | /media/genre/supplement | 0.4678 |
| /ja/shopping-in-japan | /ja/shopping-guide-for-living-alone | 0.4677 |
| /ja/use-korean-cosmetics-rankings-safely | /ja/use-korean-fashion-rankings-by-item | 0.4667 |
| /media/genre/womens-sneakers | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/mobile-battery | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/sweets | /media/scene/big-size | 0.4659 |
| /media/genre/skincare | /media/scene/commute | 0.4659 |
| /media/genre/pet | /media/scene/big-size | 0.4659 |
| /media/genre/bags | /media/scene/korean | 0.4651 |
| /media/scene/commute | /media/genre/supplement | 0.4651 |
| /media/scene/travel | /media/genre/beauty-health-appliance | 0.4651 |
| /media/genre/face-lotion | /media/scene/big-size | 0.4641 |
| /ja/find-products-seen-on-tiktok | /ja/search-products-from-tiktok-video-urls | 0.4636 |
| /media/genre/interior | /media/scene/korean | 0.4633 |
| /media/genre/beauty-cosme | /media/scene/hitorigurashi | 0.4633 |
| /media/genre/womens-fashion | /media/scene/korean | 0.4633 |
| /media/scene/big-size | /media/genre/mens-fashion | 0.4633 |
| /media/genre/sweets | /media/scene/travel | 0.4624 |
| /media/genre/pet | /media/scene/travel | 0.4624 |
| /media/scene/commute | /media/genre/beauty-health-appliance | 0.4624 |
| /ja/search-product-by-model-number | /ja/find-products-seen-on-social-media | 0.4615 |
| /media/genre/womens-sneakers | /media/scene/big-size | 0.4615 |
| /media/genre/handheld-fan | /media/scene/travel | 0.4607 |
| /media/genre/wireless-earphones | /media/scene/travel | 0.4607 |
| /media/genre/face-lotion | /media/scene/travel | 0.4607 |
| /media/genre/daily-goods | /media/scene/korean | 0.4607 |
| /media/genre/kitchen | /media/scene/korean | 0.4607 |
| /media/genre/skincare | /media/scene/big-size | 0.4607 |
| /media/genre/sweets | /media/scene/commute | 0.4598 |
| /media/genre/bags | /media/scene/hitorigurashi | 0.4598 |
| /media/genre/pet | /media/scene/commute | 0.4598 |
| /media/scene/travel | /media/genre/mens-fashion | 0.4598 |
| /ja/search-products-from-saved-images | /ja/search-products-from-instagram-post-urls | 0.4595 |
| /media/genre/handheld-fan | /media/scene/commute | 0.4581 |
| /media/genre/wireless-earphones | /media/scene/commute | 0.4581 |
| /media/genre/womens-sneakers | /media/scene/travel | 0.4581 |
| /media/genre/mobile-battery | /media/scene/travel | 0.4581 |
| /media/genre/face-lotion | /media/scene/commute | 0.4581 |
| /media/genre/kids-baby | /media/scene/korean | 0.4581 |
| /media/genre/interior | /media/scene/hitorigurashi | 0.4581 |
| /media/genre/womens-fashion | /media/scene/hitorigurashi | 0.4581 |
| /ja/compare-new-used-refurbished-and-outlet-products | /ja/compare-domestic-and-parallel-import-products | 0.4575 |
| /media/scene/commute | /media/genre/mens-fashion | 0.4571 |
| /media/genre/womens-sneakers | /media/scene/commute | 0.4556 |
| /media/genre/mobile-battery | /media/scene/commute | 0.4556 |
| /media/genre/daily-goods | /media/scene/hitorigurashi | 0.4556 |
| /media/genre/kitchen | /media/scene/hitorigurashi | 0.4556 |
| /media/genre/beauty-cosme | /media/scene/travel | 0.4556 |
| /media/genre/bags | /media/scene/big-size | 0.4556 |
| /privacy | /terms | 0.4554 |
| /ja/product-requests | /ja/use-hoshilu-search-until-found | 0.4552 |
| /media/genre/handheld-fan | /media/scene/big-size | 0.4530 |
| /media/genre/wireless-earphones | /media/scene/big-size | 0.4530 |
| /media/genre/kids-baby | /media/scene/hitorigurashi | 0.4530 |
| /media/genre/beauty-cosme | /media/scene/commute | 0.4530 |
| /ja/identify-a-product-someone-else-is-using | /ja/find-products-used-by-favorite-idol | 0.4526 |
| /ja/find-products-seen-on-tiktok | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.4521 |
| /media/genre/bags | /media/scene/travel | 0.4520 |
| /media/genre/kitchen | /media/scene/big-size | 0.4516 |
| /media/genre/mobile-battery | /media/scene/big-size | 0.4505 |
| /media/genre/interior | /media/scene/travel | 0.4505 |
| /media/genre/womens-fashion | /media/scene/travel | 0.4505 |
| /media/genre/bags | /media/scene/commute | 0.4494 |
| /ja/choose-commute-backpack-by-load-and-size | /ja/choose-frying-pan-by-heat-source-size-and-weight | 0.4493 |
| /media/genre/kids-baby | /media/scene/big-size | 0.4492 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4490 |
| /media/genre/daily-goods | /media/scene/travel | 0.4481 |
| /media/genre/kitchen | /media/scene/travel | 0.4481 |
| /media/genre/interior | /media/scene/commute | 0.4481 |
| /media/genre/beauty-cosme | /media/scene/big-size | 0.4481 |
| /media/genre/womens-fashion | /media/scene/commute | 0.4481 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | 0.4476 |
| /ja/read-korean-cosmetics-reviews-by-skin-type | /ja/use-korean-cosmetics-rankings-safely | 0.4460 |
| /ja/find-fashion-items-seen-on-instagram | /ja/identify-a-product-someone-else-is-using | 0.4459 |
| /media/genre/kids-baby | /media/scene/travel | 0.4457 |
| /media/genre/daily-goods | /media/scene/commute | 0.4457 |
| /media/genre/kitchen | /media/scene/commute | 0.4457 |
| /ja/read-korean-cosmetics-reviews-by-skin-type | /ja/read-korean-fashion-size-reviews | 0.4444 |
| /media/genre/kids-baby | /media/scene/commute | 0.4432 |
| /media/genre/interior | /media/scene/big-size | 0.4432 |
| /media/genre/womens-fashion | /media/scene/big-size | 0.4432 |
| /ja/choose-refrigerator-by-space-capacity-and-door | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4430 |
| /ja/find-products-seen-on-social-media | /ja/find-korean-cosmetics-without-product-name | 0.4429 |
| /ja/how-to-use-shopping-rankings | /ja/use-hoshilu-buzz-for-product-discovery | 0.4414 |
| /ja/how-to-use-shopping-rankings | /ja/check-device-compatibility-before-buying | 0.4412 |
| /media/genre/daily-goods | /media/scene/big-size | 0.4409 |
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4397 |
| /ja/product-requests | /ja/identify-a-product-someone-else-is-using | 0.4394 |
| /ja/compare-air-purifiers-by-room-filter-and-maintenance | /ja/compare-robot-vacuums-by-floor-threshold-and-maintenance | 0.4384 |
| /ja/how-to-use-shopping-rankings | /ja/compare-qoo-and-shein-rankings-for-korean-trends | 0.4371 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4371 |
| /ja/compare-delivery-and-return-conditions | /ja/compare-ec-mall-fees-for-sellers | 0.4366 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-seniors | 0.4361 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4336 |
| /ja/american-products-in-japan | /ja/find-products-introduced-on-youtube | 0.4333 |
| /ja/compare-products-across-online-shops | /ja/compare-amazon-and-rakuten | 0.4328 |
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4324 |
| /ja/search-products-from-screenshots | /ja/search-one-product-from-photo-with-multiple-items | 0.4324 |
| /ja/use-korean-cosmetics-rankings-safely | /ja/compare-qoo-and-shein-rankings-for-korean-trends | 0.4314 |
| /ja/prepare-for-amazon-sale-events | /ja/prepare-for-year-end-sale-season | 0.4314 |
| /ja/shopping-guide-for-seniors | /ja/find-products-for-small-spaces | 0.4308 |
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | 0.4306 |
| /ja/shopping-guide-for-seniors | /ja/search-products-by-budget-and-purpose | 0.4286 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4286 |
| /ja/compare-total-price-with-shipping | /ja/check-if-sale-price-is-really-cheaper | 0.4276 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-wireless-headphones-by-fit-controls-and-charging | 0.4276 |
| /ja/shopping-in-japan | /ja/search-product-by-model-number | 0.4274 |
| /ja/compare-total-price-with-shipping | /ja/compare-korean-fashion-purchase-sites | 0.4255 |
| /ja/choose-desk-light-by-space-and-adjustment | /ja/choose-office-chair-by-desk-body-and-adjustments | 0.4255 |
| /ja/shopping-in-japan | /ja/find-korean-cosmetics-without-product-name | 0.4252 |
| /media/scene/korean | /media/price-drops | 0.4250 |
| /ja/find-fashion-items-seen-on-instagram | /ja/find-products-introduced-on-youtube | 0.4247 |
| /ja/read-korean-fashion-size-reviews | /ja/use-korean-fashion-rankings-by-item | 0.4247 |
| /ja/compare-korean-cosmetics-across-malls | /ja/search-same-product-by-code-across-malls | 0.4247 |
| /ja/find-products-introduced-on-youtube | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.4234 |
| /ja/find-discontinued-or-renamed-products | /ja/identify-a-product-someone-else-is-using | 0.4231 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4231 |
| /ja/use-korean-cosmetics-rankings-safely | /ja/use-hoshilu-buzz-for-product-discovery | 0.4218 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-carry-on-suitcases-by-size-weight-and-wheels | 0.4218 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/choose-folding-umbrella-by-open-size-and-weight | 0.4211 |
| /ja/choose-rice-cooker-by-servings-size-and-cleaning | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4211 |
| /ja/choose-laptop-stand-by-desk-device-and-adjustment | /ja/choose-tablet-by-screen-storage-and-connectivity | 0.4204 |
| /ja/find-products-seen-on-social-media | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.4203 |
| /ja/use-fan-goods-rankings-by-purpose | /ja/use-korean-fashion-rankings-by-item | 0.4203 |
| /media/scene/hitorigurashi | /media/price-drops | 0.4198 |
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4189 |
| /ja/shopping-guide-for-seniors | /ja/shopping-guide-for-living-alone | 0.4186 |
| /ja/search-products-by-budget-and-purpose | /ja/choose-ai-check-or-quick-search-in-hoshilu | 0.4186 |
| /ja/search-products-by-budget-and-purpose | /ja/find-products-seen-on-social-media | 0.4179 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4177 |
| /ja/choose-tablet-by-screen-storage-and-connectivity | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4177 |
| /ja/find-products-seen-on-social-media | /ja/search-products-from-x-post-urls | 0.4173 |
| /ja/use-hoshilu-camera-search | /ja/search-products-from-saved-images | 0.4167 |
| /media/scene/big-size | /media/price-drops | 0.4167 |
| /ja/search-products-by-budget-and-purpose | /ja/find-products-for-small-spaces | 0.4154 |
| /ja/compare-total-price-with-shipping | /ja/compare-delivery-and-return-conditions | 0.4143 |
| /ja/compare-multiple-shops | /ja/compare-amazon-and-rakuten | 0.4138 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-curtains-by-window-size-hanging-and-care | 0.4138 |
| /ja/find-products-seen-on-social-media | /ja/search-products-from-instagram-post-urls | 0.4133 |
| /ja/american-products-in-japan | /ja/find-products-seen-on-social-media | 0.4132 |
| /ja/product-requests | /ja/find-products-seen-on-social-media | 0.4122 |
| /ja/find-cheapest-across-malls | /ja/compare-products-across-online-shops | 0.4122 |
| /media/scene/travel | /media/price-drops | 0.4121 |
| /ja/find-products-seen-on-social-media | /ja/find-a-product-you-saw-in-a-store | 0.4113 |
| /ja/compare-delivery-and-return-conditions | /ja/shopping-guide-for-students-on-a-budget | 0.4110 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-computer-monitors-by-space-ports-and-stand | 0.4110 |
| /ja/use-yahoo-shopping-point-days | /ja/prepare-for-amazon-sale-events | 0.4106 |
| /ja/compare-multiple-shops | /ja/use-yahoo-shopping-point-days | 0.4103 |
| /ja/choose-washing-machine-by-space-load-and-maintenance | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4103 |
| /ja/find-a-product-from-a-photo-or-screenshot | /ja/search-products-from-screenshots | 0.4099 |
| /ja/search-product-by-model-number | /ja/find-a-gift-by-recipient-and-occasion | 0.4098 |
| /media/scene/commute | /media/price-drops | 0.4096 |
| /ja/find-a-gift-by-recipient-and-occasion | /ja/find-korean-cosmetics-without-product-name | 0.4091 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4082 |
| /ja/compare-home-office-desks-by-size-and-cable-routing | /ja/compare-computer-monitors-by-space-ports-and-stand | 0.4079 |
| /ja/american-products-in-japan | /ja/search-products-by-budget-and-purpose | 0.4071 |
| /ja/american-products-in-japan | /ja/find-a-gift-by-recipient-and-occasion | 0.4071 |
| /ja/shopping-in-japan | /ja/find-products-used-by-favorite-idol | 0.4065 |
| /ja/product-requests | /ja/search-products-by-budget-and-purpose | 0.4065 |
| /ja/shopping-guide-for-parents | /ja/search-products-by-budget-and-purpose | 0.4060 |
| /ja/compare-total-price-with-shipping | /ja/compare-korean-cosmetics-across-malls | 0.4058 |
| /ja/how-to-read-shopping-reviews | /ja/use-korean-cosmetics-rankings-safely | 0.4058 |
| /ja/find-fashion-items-seen-on-instagram | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.4056 |
| /ja/american-products-in-japan | /ja/find-korean-style-fashion-by-features | 0.4032 |
| /ja/shopping-in-japan | /ja/find-products-seen-on-social-media | 0.4031 |
| /ja/find-a-gift-by-recipient-and-occasion | /ja/choose-ai-check-or-quick-search-in-hoshilu | 0.4031 |
| /ja/compare-multiple-shops | /ja/search-products-across-multiple-shopping-sites | 0.4029 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/compare-amazon-and-qoo10 | 0.4029 |
| /ja/choose-commute-backpack-by-load-and-size | /ja/choose-storage-box-by-space-and-opening | 0.4029 |
| /ja/choose-reusable-water-bottle-by-capacity-and-cleaning | /ja/choose-rice-cooker-by-servings-size-and-cleaning | 0.4029 |
| /ja/find-fashion-items-seen-on-instagram | /ja/search-products-from-x-post-urls | 0.4028 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | 0.4028 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-tablet-by-screen-storage-and-connectivity | 0.4027 |
| /ja/find-discontinued-or-renamed-products | /ja/find-products-introduced-on-youtube | 0.4026 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-curtains-by-window-size-hanging-and-care | 0.4026 |
| /ja/use-korean-fashion-rankings-by-item | /ja/compare-qoo-and-shein-rankings-for-korean-trends | 0.4025 |
| /ja/american-products-in-japan | /ja/find-products-used-by-favorite-idol | 0.4000 |
| /ja/how-to-search-by-description | /ja/find-korean-cosmetics-without-product-name | 0.4000 |
| /ja/product-requests | /ja/compare-amazon-rakuten-yahoo-shopping | 0.4000 |
| /ja/product-requests | /ja/search-products-across-multiple-shopping-sites | 0.4000 |
| /ja/find-cheapest-across-malls | /ja/compare-qoo10-and-rakuten | 0.4000 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-students-on-a-budget | 0.4000 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/choose-hair-dryer-by-weight-controls-and-storage | 0.4000 |
| /ja/choose-ai-check-or-quick-search-in-hoshilu | /ja/use-hoshilu-mall-coverage-to-continue-searching | 0.4000 |
| /ja/choose-rice-cooker-by-servings-size-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4000 |
| /ja/compare-air-purifiers-by-room-filter-and-maintenance | /ja/compare-wireless-headphones-by-fit-controls-and-charging | 0.4000 |

