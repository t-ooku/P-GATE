# Codex 日次点検 — 2026-11-02

## 実施・正本

最新AGENTS、起動時selfcheck、10/8引継ぎ、10/10実行管理全文、inbox README・既存14依頼を確認。毎日保存の現行指示を優先。月曜SEO監査を本書に統合、Amazon月初監査は11/1実施済みで重複しない。

- HEAD/production source **746b6cbaa72366e85395ea2bb92e3acbe9f41c8c**、tree3f8b49c9fb2bc8f7919a566659897563ec25fe2b。既存[Daily screens41323543405](https://github.com/t-ooku/P-GATE/actions/runs/41323543405)はWorker3,131/Chrome6・push/deploy/health成功、Version **f711d0e1-e5c1-441a-98a8-a4987c32a8ea**。
- 最新[monitor41357818528](https://github.com/t-ooku/P-GATE/actions/runs/41357818528)の**11/2 07:34:57 JST** health/重要契約7 PASS、検索SLI PASS（15分hard/backend0）、SNS SLA PASS、将来在庫3/3（11/3〜9）。Rakuten deep canary07:22 rate_limited FAIL、query_structurer/ai_chat/Yahoo PASS、OpenAI billing-disabled想定内。pending incidentなし、github_schedule HEARTBEAT_STALE advisoryあり。
- #369は開始間隔約3時間5分（04:29→07:34）で頻度未復旧。#691最新失敗は10/31 23:19のInstagram未公開、日付変更後PASSでその投稿の復旧とはしない。両Issue OPEN。古いIssue本文を今日の新規障害と誤読しない。
- 最新monitorのKPIはNOT_DUE。正本は既存[monitor41342008285](https://github.com/t-ooku/P-GATE/actions/runs/41342008285)、artifact **13097338973**、生成**11/2 04:30:13.930 JST**、日次取得**04:30:32.106 JST**。health成果物04:30:17 JSTもok/missing0/weak0。追加health/OAuth/SNS在庫/検索SLI取得・本番検索/有料probe/QA手動実行なし。
- 月曜Seller週次：11/2記録ファイルなし、既存workflowの最新runは10/26 **40248146702**（成功）。本週QA shop DONEは未計測（本週run/成果物未着）。欠落記録のみ、二重実行・Seller販促コード改変・Claudeへの点検転送なし。

## 前日1日：2026-11-01

**対象11/1 00:00:00以上〜11/2 00:00:00未満（Asia/Tokyo）、取得11/2 04:30:32.106 JST。** UTCでは10/31 15:00以上〜11/1 15:00未満。暦日であり、ローリング24h・7日窓差分ではない。

QA/INTERNAL、設定済み内部3会員、ITG内部店舗、本人テスト問い合わせ4件を外部成果から除外。匿名セッションを人数・注文・会社数と呼ばない。

| 指標 | 前日1日の実数 |
|---|---:|
| LP訪問 | 49回／49セッション |
| 検索開始／完了 | 各0回／0セッション |
| 購入先クリック | 0回／0セッション |
| 一般希望価格保存 | 0回／0セッション |
| Seller LP | 113回／112セッション |
| Seller CTA／入力証拠／送信試行 | 各0回／0セッション |
| 新規外部Seller問い合わせ | 0件（期間内全問い合わせ0） |
| 有料新規契約 | 未取得（初回有料成立日時未接続） |

訪問増だけを集客成功とせず、人/自動閲覧の内訳は未判定。契約総数を日次新規に代用しない。問い合わせ本人テスト4件を外部獲得としない。

## 直近7日・保持累計（前日と別）

**7日窓10/26 04:30:13〜11/2 04:30:13 JST**：LP86→検索3→完了3、購入先クリック単独**5回／3セッション**。検索完了併有は1セッション（dashboard outbound）、単独クリック3と分ける。前回14回からの減少は窓入替で、クリック取消や前日マイナス実績ではない。

検索例1→検索1→購入先1、トップ値下がり入口0。記事11→検索開始0→保存0→送客0、一般保存0人0件、設定開始0、通知再訪0（内部会員IDとの完全joinは未接続）。Seller LP124回/123セッション、CTA/入力証拠/送信0。失敗4回/4セッションは全てturnstile_unavailable、最終10/30 22:34 JST。入力・送信0なので申込API障害や4人の送信失敗と断定しない。

**保持累計290回／67セッション**。初回7/30 20:49:28 JST、最終10/31 03:54:11 JST。全事業期間の完全記録を保証せず、人数/注文/売上ではない。Amazon内訳は前日0回/0セッション、7日0回/0セッション、保持累計57回/23セッション（11/2 04:30:32 JST取得）。前回Amazon7日9回との差も窓入替であり、適格販売の取消ではない。ASP注文/適格販売/報酬は未計測（ASP正本未接続）。

候補291/現在対象229、sent230/queued1/failed0/unsubscribe1/response0、eligible_now0。sentは配達・対話ではない。delivered/bounceはResendイベント未接続、商談化は専用段階未接続、実返信は正しい受信箱未接続で未計測。response0は返信メール不存在の証明ではない。外部問い合わせ0、外部Seller登録/商品0。有料契約総数の最後の既存確認は10/31 09:20の0、現在総数・日次新規は未取得。商品起点クリック/Google商品流入も未計測。

## 日次9項目

### 1. 固定QA本命の意味一致

正本にあるのは**11/1 07:23:00〜07:24:55 JSTの25行**。自動24PASS/1FAIL、Codex本命カテゴリ意味25/25（当初9件9/9）。本日11/2の通常QAは成果物生成後なので**未計測**。昨日の25/25を今日の結果として報告しない。

| fixture群 | 正本内本命と意味の限定 |
|---|---|
| energy_saving_kotatsu | TEKNOS EKA-680AW 60×80cmこたつテーブル本体。足元パネル混入修正の本番確認済みを維持 |
| dark_ink_name_pen | 紙おむつ専用マイネーム油性ペン。自動FAILだが名前記入カテゴリ一致。濃さ性能・全素材への耐性は未確認 |
| shein_one_piece | キッズ長袖ティアードワンピース本体。インナーでない。年齢指定がないfixtureから成人意図を推定しない |
| UV/浴室洗剤/包丁研ぎ/電気カーペット/電気毛布 | UVカバー/バス泡洗剤/4連シャープナー/40cm電気ミニマット/洗える電気毛布。カテゴリ一致 |
| 除湿機/耳栓/手首血圧計/ノンフライヤー | 自動排水機能除湿機/安眠耳栓/ドリテック手首式/COSORI2L本体。一致 |
| 容器/哺乳瓶/加湿器/ペットブラシ/底開口水筒/収納 | 保存容器/広口哺乳瓶/自動オフ加湿器/グルーミンググローブ/sokomo/引出し収納。一致、容器冷凍耐性等の全属性未保証 |
| 白バッグ/リング/革トート/韓国リップ2種/マットレス2種 | 白ショルダー/複数石リング/本革自立トート/韓国リップ/コアラ認定中古/厚さ5cm三つ折り本体。一致、色・同一商品・中古条件は別 |

全属性適合/購入先成果への因果寄与とはしない。既存こたつinboxは受領/実装配備/11/1本番確認までDONE、重複依頼や並行修正なし。

### 2. 写真検索失敗

写真限定24h backend_failed/provider_degradedの固定campaign別件数は**未計測（安全内訳未接続）**。既存SLI15分hard/backend0を24h写真検索0へ代用しない。検索文・写真は扱わない。

### 3. 希望価格ウォッチ巡回

一般保存0人0件、前日保存0。内部除外済み24h NO_CANDIDATES/NO_MATCH/ABOVE_TARGET/REACHEDは**未計測（成果物未接続）**。provider CANDIDATES16件は内部ウォッチを含みうる別指標で、一般24h reasonに代用しない。偏重診断はしない。

### 4. 価格記録増加

price_observations COUNT/前日差は**未計測（正本未接続）**。別テーブルprice cache956/fresh956を価格記録数・前日増加に代用しない。

### 5. SNS無限リトライ・公開

全platform APPROVED/PUBLISHINGかつlast_errorありの件数/content_idは**未計測（安全内訳未接続）**。Threads FAILED27の最終更新10/21 20:32:55 JSTは不変で、新規401の証拠ではない。本人再認証申告/Worker処理進展と、公開三要素未確認を分ける。再認証/Secret更新・強制再送を本人へ求めない。

最新の取得済み三要素はInstagram **10/30 20:17:55 JST、ID18096751634151715、https://www.instagram.com/reel/DfHdO6_EjZ6/**。11/1投稿の三要素は正本になく未確認。10/15・17の過去確認は維持、今回の最新5行からの再確認は不可。#616旧素材レビュー待ち/再生成公開なし、X停止維持。既存SNS SLA将来在庫3/3を再利用。

### 6. モール到達

前日0回/0セッション、7日5回/3セッション、検索完了併有1/3。Amazon内訳は上記。モール別shownに対するCTR・検索後1タップ到達率は**未計測（shown/tap経路内訳未接続）**。1/3を1タップ率と呼ばない。

### 7. 最大ボトルネック1つ

**B「検索しない」**：LP86→検索3、差83セッション、開始3.5%。次の修正候補は既存検索例1箇所の第一画面内視認性/検索開始接続（検索例1→検索1→購入先1が根拠）。ただしSAMPLE_GATHERING3/20でHOLD、小標本で勝敗を断定せず並行UI改修・新ページ量産なし。前日LP49→検索0も同じ停止段階で、49人の離脱や検索API故障とは断定しない。

### 8. 定期制作停止・実行管理

10/8の旧定期販促/教師データ量産停止は想定内。新しい11/1〜2 claude-to-codex handoffはツリーにない。欠落記録だけでClaudeへ点検を回さない。既存14件はDONE13/BLOCKED1、10/16検索除外/写真マスク・こたつ本番確認を維持。Seller原稿は素材DONE・未公開。年末案は11/2既存枠を差し替えず、11/7以降未作成枠候補でBLOCKED、未予約/未公開。

Claude即時起動接続なし、README巡回連携あり・将来保証なし。依頼記録/受領/実装/本番確認を区別。本人への転送依頼なし。Codexの観測残件は写真24h/一般watch reason/price_observations差分/SNS滞留/shown内訳の安全な集計接続。既存成果物で未接続のものを0とせず、追加の本番直接照会や推測修正なし。

### 9. 14日超未更新Issue

`repo:t-ooku/P-GATE is:issue is:open updated:<2026-10-19`で**43件**（前回42、#674追加）：#1 #44 #52 #74 #123 #149 #161 #169 #219 #223 #258 #260 #270 #273 #289 #321 #325 #326 #353 #388 #422 #423 #432 #463 #464 #465 #466 #467 #473 #477 #489 #526 #529 #536 #590 #604 #609 #616 #640 #643 #659 #660 #674。過去CIログIssueが今日の新規障害とは限らず、現行成功証拠と区別。#369/#691も別途OPEN追跡。

## 月曜SEO監査

既存142日本語記事のevaluateSeoPageQuality最小100、Worker全3,131成功・GAS/release6・Chrome6成功。標準153ページの取得完了11/2 08:01:01 JST、追加29は同じ点検中に取得。リポジトリ/本番標準sitemapはともに158 URL、集合差0。標準掲載の日本語153ページは全て200、noindex0、title/description欠落0。追加のジャンル/場面29ルートも全て200、計182日本語ルートを確認。追加の /media/scene/korean はnoindexだが標準sitemapに不在で不整合ではない。標準地図以外の商品個別/店舗/認証ページ全URLは今回の全件母集団に含めておらず、インデックス状況や検索順位は別に未計測。

**title+descriptionの文字2-gram Set Dice**：空白除去・小文字化、0.40以上は全182ルートで575対、うち0.50以上325対。追加の棚ページを含むため前週の153ページ範囲と直接増減比較しない。同一の標準掲載153ページ範囲では165対/うち0.50以上29対で10/19と同数。最大はジャンル棚 toys と face-wash の0.9405（共通テンプレートの影響）。類似度だけで検索意図の重複や順位低下を断定しない。カテゴリを取り違える修正や一括タイトル変更は行わない。新ページ・新記事の制作0。

記事11セッション→検索開始0。既存CTAは希望価格訴求だが、一般保存0のため検索開始前で価値が伝わっているか未確認。次候補は既存入口1箇所の視認性/意図接続とし、本文が原因とは断定しない。母数3/20 HOLDを維持。

### 類似対全件（0.40以上、182ルート母集団）

| ページA | ページB | Dice |
|---|---|---:|
| /media/genre/toys | /media/genre/face-wash | 0.9405 |
| /media/genre/face-wash | /media/genre/shoes | 0.9355 |
| /media/genre/toys | /media/genre/shoes | 0.9305 |
| /media/genre/handheld-fan | /media/genre/face-wash | 0.9255 |
| /media/genre/food | /media/genre/skincare | 0.9247 |
| /media/genre/handheld-fan | /media/genre/toys | 0.9206 |
| /media/genre/sweets | /media/genre/face-wash | 0.9206 |
| /media/genre/handheld-fan | /media/genre/face-lotion | 0.9175 |
| /media/genre/mobile-battery | /media/genre/face-wash | 0.9158 |
| /media/genre/handheld-fan | /media/genre/shoes | 0.9158 |
| /media/genre/face-lotion | /media/genre/face-wash | 0.9158 |
| /media/genre/food | /media/genre/beauty-health-appliance | 0.9158 |
| /media/genre/sweets | /media/genre/toys | 0.9158 |
| /media/genre/beauty-cosme | /media/genre/face-wash | 0.9158 |
| /media/genre/womens-sneakers | /media/genre/face-wash | 0.9110 |
| /media/genre/mobile-battery | /media/genre/toys | 0.9110 |
| /media/genre/face-lotion | /media/genre/toys | 0.9110 |
| /media/genre/sweets | /media/genre/shoes | 0.9110 |
| /media/genre/beauty-cosme | /media/genre/toys | 0.9110 |
| /media/genre/womens-sneakers | /media/genre/toys | 0.9063 |
| /media/genre/mobile-battery | /media/genre/shoes | 0.9063 |
| /media/genre/face-lotion | /media/genre/shoes | 0.9063 |
| /media/genre/beauty-cosme | /media/genre/shoes | 0.9063 |
| /media/genre/skincare | /media/genre/beauty-health-appliance | 0.9063 |
| /media/genre/womens-fashion | /media/genre/mens-fashion | 0.9055 |
| /media/genre/food | /media/genre/pet | 0.9053 |
| /media/genre/womens-sneakers | /media/genre/mobile-battery | 0.9036 |
| /media/genre/womens-sneakers | /media/genre/handheld-fan | 0.9026 |
| /media/scene/hitorigurashi | /media/scene/korean | 0.9020 |
| /media/genre/womens-sneakers | /media/genre/shoes | 0.9016 |
| /media/genre/handheld-fan | /media/genre/sweets | 0.9016 |
| /media/genre/daily-goods | /media/genre/face-wash | 0.9016 |
| /media/genre/bags | /media/genre/face-wash | 0.9016 |
| /media/genre/mobile-battery | /media/genre/handheld-fan | 0.8969 |
| /media/genre/handheld-fan | /media/genre/beauty-cosme | 0.8969 |
| /media/genre/daily-goods | /media/genre/toys | 0.8969 |
| /media/genre/bags | /media/genre/toys | 0.8969 |
| /media/genre/skincare | /media/genre/pet | 0.8958 |
| /media/genre/mobile-battery | /media/genre/sweets | 0.8923 |
| /media/genre/face-lotion | /media/genre/sweets | 0.8923 |
| /media/genre/sweets | /media/genre/beauty-cosme | 0.8923 |
| /media/genre/daily-goods | /media/genre/shoes | 0.8923 |
| /media/genre/bags | /media/genre/shoes | 0.8923 |
| /media/genre/food | /media/genre/interior | 0.8912 |
| /media/genre/wireless-earphones | /media/genre/food | 0.8901 |
| /media/genre/wireless-earphones | /media/genre/mens-fashion | 0.8889 |
| /media/genre/food | /media/genre/supplement | 0.8889 |
| /media/genre/womens-sneakers | /media/genre/sweets | 0.8878 |
| /media/genre/mobile-battery | /media/genre/face-lotion | 0.8878 |
| /media/genre/mobile-battery | /media/genre/beauty-cosme | 0.8878 |
| /media/genre/face-lotion | /media/genre/beauty-cosme | 0.8878 |
| /media/genre/mobile-battery | /media/genre/bags | 0.8844 |
| /media/genre/wireless-earphones | /media/genre/beauty-health-appliance | 0.8832 |
| /media/genre/womens-sneakers | /media/genre/face-lotion | 0.8832 |
| /media/genre/womens-sneakers | /media/genre/beauty-cosme | 0.8832 |
| /media/genre/handheld-fan | /media/genre/daily-goods | 0.8832 |
| /media/genre/handheld-fan | /media/genre/bags | 0.8832 |
| /media/genre/interior | /media/genre/skincare | 0.8821 |
| /media/genre/wireless-earphones | /media/genre/skincare | 0.8808 |
| /media/scene/kids | /media/scene/commute | 0.8800 |
| /media/genre/food | /media/genre/mens-fashion | 0.8796 |
| /media/genre/skincare | /media/genre/supplement | 0.8796 |
| /media/scene/korean | /media/scene/gift | 0.8790 |
| /media/genre/sweets | /media/genre/daily-goods | 0.8788 |
| /media/genre/sweets | /media/genre/bags | 0.8788 |
| /media/genre/pet | /media/genre/beauty-health-appliance | 0.8776 |
| /media/genre/mens-fashion | /media/genre/supplement | 0.8776 |
| /media/scene/kids | /media/scene/travel | 0.8756 |
| /media/scene/commute | /media/scene/travel | 0.8756 |
| /media/genre/mobile-battery | /media/genre/daily-goods | 0.8744 |
| /media/genre/face-lotion | /media/genre/daily-goods | 0.8744 |
| /media/genre/face-lotion | /media/genre/bags | 0.8744 |
| /media/genre/beauty-cosme | /media/genre/daily-goods | 0.8744 |
| /media/genre/beauty-cosme | /media/genre/bags | 0.8744 |
| /media/scene/korean | /media/scene/big-size | 0.8734 |
| /media/genre/food | /media/genre/kitchen | 0.8731 |
| /media/genre/pet | /media/genre/mens-fashion | 0.8731 |
| /media/genre/pet | /media/genre/supplement | 0.8718 |
| /media/genre/daily-goods | /media/genre/bags | 0.8713 |
| /media/genre/skincare | /media/genre/mens-fashion | 0.8705 |
| /media/genre/womens-sneakers | /media/genre/daily-goods | 0.8700 |
| /media/genre/womens-sneakers | /media/genre/bags | 0.8700 |
| /media/genre/skincare | /media/genre/womens-fashion | 0.8673 |
| /media/genre/food | /media/genre/womens-fashion | 0.8660 |
| /media/genre/kids-baby | /media/genre/pet | 0.8657 |
| /media/genre/interior | /media/genre/pet | 0.8643 |
| /media/genre/interior | /media/genre/beauty-health-appliance | 0.8643 |
| /media/genre/kitchen | /media/genre/skincare | 0.8643 |
| /media/scene/hitorigurashi | /media/scene/gift | 0.8625 |
| /media/genre/kids-baby | /media/genre/food | 0.8615 |
| /media/genre/beauty-health-appliance | /media/genre/supplement | 0.8615 |
| /media/genre/interior | /media/genre/supplement | 0.8586 |
| /media/genre/wireless-earphones | /media/genre/supplement | 0.8571 |
| /media/genre/kitchen | /media/genre/pet | 0.8571 |
| /media/scene/hitorigurashi | /media/scene/big-size | 0.8571 |
| /media/genre/wireless-earphones | /media/genre/womens-fashion | 0.8557 |
| /media/genre/wireless-earphones | /media/genre/pet | 0.8528 |
| /media/genre/kids-baby | /media/genre/skincare | 0.8528 |
| /media/genre/beauty-health-appliance | /media/genre/mens-fashion | 0.8528 |
| /media/genre/kids-baby | /media/genre/mens-fashion | 0.8515 |
| /media/genre/kids-baby | /media/genre/supplement | 0.8500 |
| /media/genre/kitchen | /media/genre/beauty-health-appliance | 0.8473 |
| /media/genre/womens-fashion | /media/genre/supplement | 0.8442 |
| /media/genre/kitchen | /media/genre/supplement | 0.8416 |
| /media/genre/wireless-earphones | /media/genre/interior | 0.8400 |
| /media/genre/interior | /media/genre/mens-fashion | 0.8400 |
| /media/genre/womens-fashion | /media/genre/pet | 0.8400 |
| /media/genre/womens-fashion | /media/genre/beauty-health-appliance | 0.8400 |
| /media/genre/kids-baby | /media/genre/kitchen | 0.8365 |
| /media/scene/gift | /media/scene/big-size | 0.8364 |
| /media/genre/kids-baby | /media/genre/beauty-health-appliance | 0.8358 |
| /media/genre/interior | /media/genre/kitchen | 0.8350 |
| /media/genre/kitchen | /media/genre/mens-fashion | 0.8333 |
| /media/genre/wireless-earphones | /media/genre/kids-baby | 0.8317 |
| /media/genre/interior | /media/genre/womens-fashion | 0.8276 |
| /media/genre/food | /media/genre/face-wash | 0.8261 |
| /media/genre/wireless-earphones | /media/genre/kitchen | 0.8235 |
| /media/genre/kids-baby | /media/genre/interior | 0.8235 |
| /media/genre/food | /media/genre/toys | 0.8216 |
| /media/genre/kids-baby | /media/genre/womens-fashion | 0.8195 |
| /media/genre/food | /media/genre/shoes | 0.8172 |
| /media/genre/skincare | /media/genre/face-wash | 0.8172 |
| /media/genre/skincare | /media/genre/toys | 0.8128 |
| /media/genre/face-lotion | /media/genre/mens-fashion | 0.8122 |
| /media/genre/kitchen | /media/genre/womens-fashion | 0.8116 |
| /media/genre/handheld-fan | /media/genre/mens-fashion | 0.8103 |
| /media/genre/handheld-fan | /media/genre/food | 0.8085 |
| /media/genre/skincare | /media/genre/shoes | 0.8085 |
| /media/genre/handheld-fan | /media/genre/womens-fashion | 0.8081 |
| /media/genre/sweets | /media/genre/skincare | 0.8063 |
| /media/genre/beauty-cosme | /media/genre/beauty-health-appliance | 0.8061 |
| /media/genre/womens-sneakers | /media/genre/womens-fashion | 0.8060 |
| /media/genre/food | /media/genre/sweets | 0.8042 |
| /media/genre/supplement | /media/genre/face-wash | 0.8042 |
| /media/genre/wireless-earphones | /media/genre/handheld-fan | 0.8000 |
| /media/genre/mobile-battery | /media/genre/food | 0.8000 |
| /media/genre/handheld-fan | /media/genre/skincare | 0.8000 |
| /media/genre/face-lotion | /media/genre/food | 0.8000 |
| /media/genre/face-lotion | /media/genre/womens-fashion | 0.8000 |
| /media/genre/food | /media/genre/beauty-cosme | 0.8000 |
| /media/genre/pet | /media/genre/face-wash | 0.8000 |
| /media/genre/beauty-health-appliance | /media/genre/face-wash | 0.8000 |
| /media/genre/toys | /media/genre/supplement | 0.8000 |
| /media/genre/wireless-earphones | /media/genre/face-wash | 0.7958 |
| /media/genre/womens-sneakers | /media/genre/food | 0.7958 |
| /media/genre/pet | /media/genre/toys | 0.7958 |
| /media/genre/beauty-health-appliance | /media/genre/toys | 0.7958 |
| /media/genre/mens-fashion | /media/genre/face-wash | 0.7958 |
| /media/genre/supplement | /media/genre/shoes | 0.7958 |
| /media/scene/korean | /media/scene/travel | 0.7955 |
| /media/genre/wireless-earphones | /media/genre/face-lotion | 0.7919 |
| /media/genre/wireless-earphones | /media/genre/toys | 0.7917 |
| /media/genre/mobile-battery | /media/genre/skincare | 0.7917 |
| /media/genre/face-lotion | /media/genre/skincare | 0.7917 |
| /media/genre/beauty-cosme | /media/genre/skincare | 0.7917 |
| /media/genre/pet | /media/genre/shoes | 0.7917 |
| /media/genre/beauty-health-appliance | /media/genre/shoes | 0.7917 |
| /media/genre/toys | /media/genre/mens-fashion | 0.7917 |
| /media/scene/kids | /media/scene/korean | 0.7886 |
| /media/scene/korean | /media/scene/commute | 0.7886 |
| /media/genre/wireless-earphones | /media/genre/shoes | 0.7876 |
| /media/genre/womens-sneakers | /media/genre/skincare | 0.7876 |
| /media/genre/handheld-fan | /media/genre/supplement | 0.7876 |
| /media/genre/food | /media/genre/daily-goods | 0.7876 |
| /media/genre/food | /media/genre/bags | 0.7876 |
| /media/genre/interior | /media/genre/face-wash | 0.7876 |
| /media/genre/mens-fashion | /media/genre/shoes | 0.7876 |
| /media/scene/hitorigurashi | /media/scene/kids | 0.7865 |
| /media/scene/hitorigurashi | /media/scene/commute | 0.7865 |
| /media/genre/wireless-earphones | /media/genre/sweets | 0.7857 |
| /media/genre/handheld-fan | /media/genre/pet | 0.7835 |
| /media/genre/handheld-fan | /media/genre/beauty-health-appliance | 0.7835 |
| /media/genre/sweets | /media/genre/supplement | 0.7835 |
| /media/genre/interior | /media/genre/toys | 0.7835 |
| /media/genre/womens-fashion | /media/genre/face-wash | 0.7835 |
| /media/scene/hitorigurashi | /media/scene/travel | 0.7821 |
| /media/genre/mobile-battery | /media/genre/supplement | 0.7795 |
| /media/genre/face-lotion | /media/genre/supplement | 0.7795 |
| /media/genre/kids-baby | /media/genre/face-wash | 0.7795 |
| /media/genre/sweets | /media/genre/pet | 0.7795 |
| /media/genre/sweets | /media/genre/beauty-health-appliance | 0.7795 |
| /media/genre/interior | /media/genre/shoes | 0.7795 |
| /media/genre/beauty-cosme | /media/genre/supplement | 0.7795 |
| /media/genre/daily-goods | /media/genre/skincare | 0.7795 |
| /media/genre/skincare | /media/genre/bags | 0.7795 |
| /media/genre/womens-fashion | /media/genre/toys | 0.7795 |
| /media/genre/womens-sneakers | /media/genre/supplement | 0.7755 |
| /media/genre/mobile-battery | /media/genre/pet | 0.7755 |
| /media/genre/mobile-battery | /media/genre/beauty-health-appliance | 0.7755 |
| /media/genre/face-lotion | /media/genre/pet | 0.7755 |
| /media/genre/face-lotion | /media/genre/beauty-health-appliance | 0.7755 |
| /media/genre/kids-baby | /media/genre/toys | 0.7755 |
| /media/genre/sweets | /media/genre/mens-fashion | 0.7755 |
| /media/genre/beauty-cosme | /media/genre/pet | 0.7755 |
| /media/genre/womens-fashion | /media/genre/shoes | 0.7755 |
| /media/genre/mobile-battery | /media/genre/interior | 0.7739 |
| /media/genre/wireless-earphones | /media/genre/mobile-battery | 0.7716 |
| /media/genre/wireless-earphones | /media/genre/beauty-cosme | 0.7716 |
| /media/genre/womens-sneakers | /media/genre/pet | 0.7716 |
| /media/genre/womens-sneakers | /media/genre/beauty-health-appliance | 0.7716 |
| /media/genre/mobile-battery | /media/genre/mens-fashion | 0.7716 |
| /media/genre/handheld-fan | /media/genre/interior | 0.7716 |
| /media/genre/kids-baby | /media/genre/shoes | 0.7716 |
| /media/genre/kitchen | /media/genre/face-wash | 0.7716 |
| /media/genre/beauty-cosme | /media/genre/mens-fashion | 0.7716 |
| /media/scene/commute | /media/scene/gift | 0.7692 |
| /media/genre/wireless-earphones | /media/genre/womens-sneakers | 0.7677 |
| /media/genre/womens-sneakers | /media/genre/mens-fashion | 0.7677 |
| /media/genre/sweets | /media/genre/interior | 0.7677 |
| /media/genre/kitchen | /media/genre/toys | 0.7677 |
| /media/genre/daily-goods | /media/genre/supplement | 0.7677 |
| /media/genre/bags | /media/genre/supplement | 0.7677 |
| /media/scene/kids | /media/scene/big-size | 0.7650 |
| /media/genre/handheld-fan | /media/genre/kids-baby | 0.7638 |
| /media/genre/face-lotion | /media/genre/interior | 0.7638 |
| /media/genre/sweets | /media/genre/womens-fashion | 0.7638 |
| /media/genre/interior | /media/genre/beauty-cosme | 0.7638 |
| /media/genre/kitchen | /media/genre/shoes | 0.7638 |
| /media/genre/daily-goods | /media/genre/pet | 0.7638 |
| /media/genre/daily-goods | /media/genre/beauty-health-appliance | 0.7638 |
| /media/genre/bags | /media/genre/pet | 0.7638 |
| /media/genre/bags | /media/genre/beauty-health-appliance | 0.7638 |
| /media/genre/interior | /media/genre/daily-goods | 0.7624 |
| /media/genre/wireless-earphones | /media/genre/daily-goods | 0.7600 |
| /media/genre/wireless-earphones | /media/genre/bags | 0.7600 |
| /media/genre/womens-sneakers | /media/genre/interior | 0.7600 |
| /media/genre/mobile-battery | /media/genre/womens-fashion | 0.7600 |
| /media/genre/kids-baby | /media/genre/sweets | 0.7600 |
| /media/genre/beauty-cosme | /media/genre/womens-fashion | 0.7600 |
| /media/genre/daily-goods | /media/genre/mens-fashion | 0.7600 |
| /media/genre/bags | /media/genre/mens-fashion | 0.7600 |
| /media/scene/kids | /media/scene/gift | 0.7582 |
| /media/genre/mobile-battery | /media/genre/kids-baby | 0.7562 |
| /media/genre/handheld-fan | /media/genre/kitchen | 0.7562 |
| /media/genre/face-lotion | /media/genre/kids-baby | 0.7562 |
| /media/genre/kids-baby | /media/genre/beauty-cosme | 0.7562 |
| /media/scene/commute | /media/scene/big-size | 0.7541 |
| /media/scene/travel | /media/scene/gift | 0.7541 |
| /media/genre/womens-sneakers | /media/genre/kids-baby | 0.7525 |
| /media/genre/sweets | /media/genre/kitchen | 0.7525 |
| /media/genre/interior | /media/genre/bags | 0.7525 |
| /media/scene/travel | /media/scene/big-size | 0.7500 |
| /media/genre/mobile-battery | /media/genre/kitchen | 0.7488 |
| /media/genre/face-lotion | /media/genre/kitchen | 0.7488 |
| /media/genre/kitchen | /media/genre/beauty-cosme | 0.7488 |
| /media/genre/daily-goods | /media/genre/womens-fashion | 0.7488 |
| /media/genre/bags | /media/genre/womens-fashion | 0.7488 |
| /media/genre/kitchen | /media/genre/daily-goods | 0.7476 |
| /media/genre/womens-sneakers | /media/genre/kitchen | 0.7451 |
| /media/genre/kids-baby | /media/genre/daily-goods | 0.7451 |
| /media/genre/kids-baby | /media/genre/bags | 0.7451 |
| /media/genre/kitchen | /media/genre/bags | 0.7379 |
| /ja/search-products-from-x-post-urls | /ja/search-products-from-instagram-post-urls | 0.7211 |
| /ja/search-products-from-x-post-urls | /ja/search-products-from-tiktok-video-urls | 0.7000 |
| /ja/compare-qoo10-and-rakuten | /ja/compare-amazon-and-rakuten | 0.6917 |
| /ja/search-products-from-tiktok-video-urls | /ja/search-products-from-instagram-post-urls | 0.6887 |
| /ja/compare-multiple-shops | /ja/compare-amazon-rakuten-yahoo-shopping | 0.6711 |
| /ja/american-products-in-japan | /ja/shopping-in-japan | 0.6667 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.6667 |
| /ja/compare-amazon-and-qoo10 | /ja/compare-qoo10-and-rakuten | 0.6618 |
| /media/genre/food | /media/scene/commute | 0.6250 |
| /media/genre/beauty-health-appliance | /media/scene/travel | 0.6231 |
| /media/genre/food | /media/scene/travel | 0.6218 |
| /ja/search-products-by-budget-and-purpose | /ja/find-a-gift-by-recipient-and-occasion | 0.6190 |
| /media/genre/pet | /media/scene/kids | 0.6162 |
| /media/genre/skincare | /media/scene/travel | 0.6154 |
| /media/genre/food | /media/scene/kids | 0.6146 |
| /media/genre/kids-baby | /media/scene/kids | 0.6108 |
| /media/genre/skincare | /media/scene/kids | 0.6082 |
| /media/genre/skincare | /media/scene/commute | 0.6082 |
| /ja/compare-amazon-and-qoo10 | /ja/compare-amazon-and-rakuten | 0.6074 |
| /ja/how-to-read-shopping-reviews | /ja/read-korean-cosmetics-reviews-by-skin-type | 0.6015 |
| /media/genre/wireless-earphones | /media/scene/travel | 0.6000 |
| /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | /ja/compare-robot-vacuums-by-floor-threshold-and-maintenance | 0.5986 |
| /media/genre/pet | /media/scene/commute | 0.5960 |
| /media/genre/beauty-health-appliance | /media/scene/kids | 0.5960 |
| /media/genre/beauty-health-appliance | /media/scene/commute | 0.5960 |
| /media | /media/price-drops | 0.5957 |
| /media/genre/pet | /media/scene/travel | 0.5930 |
| /media/genre/mens-fashion | /media/scene/kids | 0.5930 |
| /media/genre/supplement | /media/scene/kids | 0.5888 |
| /media/genre/interior | /media/scene/kids | 0.5871 |
| /media/genre/interior | /media/scene/commute | 0.5871 |
| /media/genre/kitchen | /media/scene/kids | 0.5854 |
| /media/genre/interior | /media/scene/travel | 0.5842 |
| /media/genre/supplement | /media/scene/commute | 0.5787 |
| /ja/find-fan-activity-goods-by-purpose | /ja/use-fan-goods-rankings-by-purpose | 0.5781 |
| /media/genre/supplement | /media/scene/travel | 0.5758 |
| /media/genre/kitchen | /media/scene/commute | 0.5756 |
| /ja/find-products-seen-on-social-media | /ja/find-products-seen-on-tiktok | 0.5733 |
| /media/genre/wireless-earphones | /media/scene/kids | 0.5729 |
| /media/genre/wireless-earphones | /media/scene/commute | 0.5729 |
| /media/genre/mens-fashion | /media/scene/commute | 0.5729 |
| /media/genre/kitchen | /media/scene/travel | 0.5728 |
| /media/genre/mens-fashion | /media/scene/travel | 0.5700 |
| /media/genre/womens-fashion | /media/scene/kids | 0.5644 |
| /media/genre/womens-fashion | /media/scene/commute | 0.5644 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-instagram-post-urls | 0.5622 |
| /ja/choose-refrigerator-by-space-capacity-and-door | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.5621 |
| /media/genre/kids-baby | /media/scene/commute | 0.5616 |
| /media/genre/womens-fashion | /media/scene/travel | 0.5616 |
| /media/genre/kids-baby | /media/scene/travel | 0.5588 |
| /ja/prepare-for-qoo10-mega-sale | /ja/prepare-for-rakuten-sale-events | 0.5359 |
| /ja/how-to-use-shopping-rankings | /ja/use-korean-cosmetics-rankings-safely | 0.5352 |
| /ja/shopping-in-japan | /ja/shopping-guide-for-parents | 0.5313 |
| /ja/find-fashion-items-seen-on-instagram | /ja/find-products-seen-on-tiktok | 0.5290 |
| /ja/find-products-introduced-on-youtube | /ja/find-products-seen-on-tiktok | 0.5235 |
| /ja/choose-folding-umbrella-by-open-size-and-weight | /ja/choose-hair-dryer-by-weight-controls-and-storage | 0.5185 |
| /ja/find-products-seen-on-social-media | /ja/find-fashion-items-seen-on-instagram | 0.5170 |
| /ja/find-a-product-you-saw-in-a-store | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.5109 |
| /ja/search-products-from-saved-images | /ja/search-products-from-x-post-urls | 0.5109 |
| /media/genre/face-wash | /media/scene/kids | 0.5104 |
| /media/genre/face-wash | /media/scene/commute | 0.5104 |
| /media/genre/toys | /media/scene/kids | 0.5078 |
| /media/genre/toys | /media/scene/commute | 0.5078 |
| /media/genre/face-wash | /media/scene/travel | 0.5078 |
| /media/genre/toys | /media/scene/travel | 0.5052 |
| /media/scene/kids | /media/genre/shoes | 0.5052 |
| /media/genre/shoes | /media/scene/commute | 0.5052 |
| /media/genre/shoes | /media/scene/travel | 0.5026 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/plan-shopping-with-ec-sale-calendar | 0.5000 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-living-alone | 0.5000 |
| /ja/read-korean-fashion-size-reviews | /ja/compare-korean-fashion-purchase-sites | 0.5000 |
| /media/genre/handheld-fan | /media/scene/kids | 0.5000 |
| /media/genre/handheld-fan | /media/scene/commute | 0.5000 |
| /media/genre/handheld-fan | /media/scene/travel | 0.4975 |
| /media/genre/sweets | /media/scene/kids | 0.4975 |
| /media/genre/sweets | /media/scene/commute | 0.4975 |
| /ja/compare-multiple-shops | /ja/plan-shopping-with-ec-sale-calendar | 0.4969 |
| /media/genre/mobile-battery | /media/scene/kids | 0.4949 |
| /media/genre/mobile-battery | /media/scene/commute | 0.4949 |
| /media/genre/face-lotion | /media/scene/kids | 0.4949 |
| /media/genre/face-lotion | /media/scene/commute | 0.4949 |
| /media/genre/sweets | /media/scene/travel | 0.4949 |
| /media/genre/beauty-cosme | /media/scene/kids | 0.4949 |
| /media/genre/beauty-cosme | /media/scene/commute | 0.4949 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-tiktok-video-urls | 0.4944 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-x-post-urls | 0.4943 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4937 |
| /media/genre/womens-sneakers | /media/scene/kids | 0.4925 |
| /media/genre/womens-sneakers | /media/scene/commute | 0.4925 |
| /media/genre/mobile-battery | /media/scene/travel | 0.4925 |
| /media/genre/face-lotion | /media/scene/travel | 0.4925 |
| /media/genre/beauty-cosme | /media/scene/travel | 0.4925 |
| /media/genre/food | /media/scene/korean | 0.4910 |
| /media/genre/face-wash | /media/scene/korean | 0.4910 |
| /ja/find-discontinued-or-renamed-products | /ja/find-products-seen-on-tiktok | 0.4908 |
| /ja/find-fashion-items-seen-on-instagram | /ja/search-products-from-instagram-post-urls | 0.4903 |
| /ja/find-products-seen-on-tiktok | /ja/identify-a-product-someone-else-is-using | 0.4901 |
| /media/genre/womens-sneakers | /media/scene/travel | 0.4900 |
| /media/genre/toys | /media/scene/korean | 0.4881 |
| /media/genre/daily-goods | /media/scene/kids | 0.4876 |
| /media/genre/daily-goods | /media/scene/commute | 0.4876 |
| /media/genre/bags | /media/scene/kids | 0.4876 |
| /media/genre/bags | /media/scene/commute | 0.4876 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4875 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4872 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4872 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/compare-amazon-and-rakuten | 0.4853 |
| /media/genre/skincare | /media/scene/korean | 0.4852 |
| /media/genre/shoes | /media/scene/korean | 0.4852 |
| /media/genre/daily-goods | /media/scene/travel | 0.4851 |
| /media/genre/bags | /media/scene/travel | 0.4851 |
| /ja/use-fan-goods-rankings-by-purpose | /ja/use-student-commute-item-rankings | 0.4844 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4832 |
| /media/genre/food | /media/scene/hitorigurashi | 0.4824 |
| /media/genre/face-wash | /media/scene/hitorigurashi | 0.4824 |
| /ja/compare-korean-cosmetics-across-malls | /ja/compare-korean-fashion-purchase-sites | 0.4823 |
| /media/genre/face-wash | /media/scene/big-size | 0.4800 |
| /media/genre/handheld-fan | /media/scene/korean | 0.4795 |
| /media/genre/toys | /media/scene/hitorigurashi | 0.4795 |
| /ja/compare-multiple-shops | /ja/find-cheapest-across-malls | 0.4789 |
| /for-creators | /creator-terms | 0.4776 |
| /media/genre/toys | /media/scene/big-size | 0.4773 |
| /ja/american-products-in-japan | /ja/search-product-by-model-number | 0.4771 |
| /media/genre/sweets | /media/scene/korean | 0.4767 |
| /media/genre/skincare | /media/scene/hitorigurashi | 0.4767 |
| /media/genre/supplement | /media/scene/korean | 0.4767 |
| /media/scene/hitorigurashi | /media/genre/shoes | 0.4767 |
| /ja/compare-delivery-and-return-conditions | /ja/compare-korean-fashion-purchase-sites | 0.4755 |
| /ja/search-product-by-model-number | /ja/search-products-by-budget-and-purpose | 0.4754 |
| /media/genre/shoes | /media/scene/big-size | 0.4746 |
| /media/genre/mobile-battery | /media/scene/korean | 0.4740 |
| /media/genre/face-lotion | /media/scene/korean | 0.4740 |
| /media/genre/beauty-cosme | /media/scene/korean | 0.4740 |
| /media/genre/pet | /media/scene/korean | 0.4740 |
| /media/genre/beauty-health-appliance | /media/scene/korean | 0.4740 |
| /media/genre/wireless-earphones | /media/scene/korean | 0.4713 |
| /media/genre/womens-sneakers | /media/scene/korean | 0.4713 |
| /media/genre/handheld-fan | /media/scene/hitorigurashi | 0.4713 |
| /media/genre/food | /media/scene/gift | 0.4713 |
| /media/genre/mens-fashion | /media/scene/korean | 0.4713 |
| /media/genre/face-wash | /media/scene/gift | 0.4713 |
| /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | /ja/compare-air-purifiers-by-room-filter-and-maintenance | 0.4698 |
| /media/genre/handheld-fan | /media/scene/big-size | 0.4693 |
| /media/genre/supplement | /media/scene/gift | 0.4693 |
| /media/genre/food | /media/scene/big-size | 0.4686 |
| /media/genre/sweets | /media/scene/hitorigurashi | 0.4686 |
| /media/genre/toys | /media/scene/gift | 0.4686 |
| /media/genre/supplement | /media/scene/hitorigurashi | 0.4686 |
| /ja/search-products-from-saved-images | /ja/search-products-from-tiktok-video-urls | 0.4681 |
| /ja/shopping-in-japan | /ja/shopping-guide-for-living-alone | 0.4677 |
| /ja/use-korean-cosmetics-rankings-safely | /ja/use-korean-fashion-rankings-by-item | 0.4667 |
| /media/genre/sweets | /media/scene/big-size | 0.4667 |
| /media/genre/pet | /media/scene/gift | 0.4667 |
| /media/genre/mobile-battery | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/face-lotion | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/interior | /media/scene/korean | 0.4659 |
| /media/genre/beauty-cosme | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/daily-goods | /media/scene/korean | 0.4659 |
| /media/genre/skincare | /media/scene/gift | 0.4659 |
| /media/genre/bags | /media/scene/korean | 0.4659 |
| /media/genre/pet | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/beauty-health-appliance | /media/scene/hitorigurashi | 0.4659 |
| /media/genre/shoes | /media/scene/gift | 0.4659 |
| /media/genre/mobile-battery | /media/scene/big-size | 0.4641 |
| /media/genre/face-lotion | /media/scene/big-size | 0.4641 |
| /media/genre/beauty-cosme | /media/scene/big-size | 0.4641 |
| /ja/find-products-seen-on-tiktok | /ja/search-products-from-tiktok-video-urls | 0.4636 |
| /media/genre/wireless-earphones | /media/scene/hitorigurashi | 0.4633 |
| /media/genre/womens-sneakers | /media/scene/hitorigurashi | 0.4633 |
| /media/genre/skincare | /media/scene/big-size | 0.4633 |
| /media/genre/womens-fashion | /media/scene/korean | 0.4633 |
| /media/genre/mens-fashion | /media/scene/hitorigurashi | 0.4633 |
| /ja/search-product-by-model-number | /ja/find-products-seen-on-social-media | 0.4615 |
| /media/genre/womens-sneakers | /media/scene/big-size | 0.4615 |
| /media/genre/handheld-fan | /media/scene/gift | 0.4607 |
| /media/genre/kids-baby | /media/scene/korean | 0.4607 |
| /ja/search-products-from-saved-images | /ja/search-products-from-instagram-post-urls | 0.4595 |
| /media/genre/sweets | /media/scene/gift | 0.4581 |
| /media/genre/interior | /media/scene/hitorigurashi | 0.4581 |
| /media/genre/daily-goods | /media/scene/hitorigurashi | 0.4581 |
| /media/genre/bags | /media/scene/hitorigurashi | 0.4581 |
| /ja/compare-new-used-refurbished-and-outlet-products | /ja/compare-domestic-and-parallel-import-products | 0.4575 |
| /media/genre/daily-goods | /media/scene/big-size | 0.4565 |
| /media/genre/bags | /media/scene/big-size | 0.4565 |
| /media/genre/mobile-battery | /media/scene/gift | 0.4556 |
| /media/genre/face-lotion | /media/scene/gift | 0.4556 |
| /media/genre/kitchen | /media/scene/korean | 0.4556 |
| /media/genre/beauty-cosme | /media/scene/gift | 0.4556 |
| /media/genre/womens-fashion | /media/scene/hitorigurashi | 0.4556 |
| /media/genre/beauty-health-appliance | /media/scene/gift | 0.4556 |
| /media/genre/supplement | /media/scene/big-size | 0.4556 |
| /privacy | /terms | 0.4554 |
| /ja/product-requests | /ja/use-hoshilu-search-until-found | 0.4552 |
| /media/genre/wireless-earphones | /media/scene/gift | 0.4530 |
| /media/genre/womens-sneakers | /media/scene/gift | 0.4530 |
| /media/genre/kids-baby | /media/scene/hitorigurashi | 0.4530 |
| /media/genre/pet | /media/scene/big-size | 0.4530 |
| /media/genre/beauty-health-appliance | /media/scene/big-size | 0.4530 |
| /media/genre/mens-fashion | /media/scene/gift | 0.4530 |
| /ja/identify-a-product-someone-else-is-using | /ja/find-products-used-by-favorite-idol | 0.4526 |
| /ja/find-products-seen-on-tiktok | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.4521 |
| /media/genre/kids-baby | /media/scene/big-size | 0.4516 |
| /media/genre/wireless-earphones | /media/scene/big-size | 0.4505 |
| /media/genre/mens-fashion | /media/scene/big-size | 0.4505 |
| /ja/choose-commute-backpack-by-load-and-size | /ja/choose-frying-pan-by-heat-source-size-and-weight | 0.4493 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4490 |
| /media/genre/interior | /media/scene/gift | 0.4481 |
| /media/genre/kitchen | /media/scene/hitorigurashi | 0.4481 |
| /media/genre/daily-goods | /media/scene/gift | 0.4481 |
| /media/genre/bags | /media/scene/gift | 0.4481 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | 0.4476 |
| /ja/read-korean-cosmetics-reviews-by-skin-type | /ja/use-korean-cosmetics-rankings-safely | 0.4460 |
| /ja/find-fashion-items-seen-on-instagram | /ja/identify-a-product-someone-else-is-using | 0.4459 |
| /media/genre/interior | /media/scene/big-size | 0.4457 |
| /media/genre/womens-fashion | /media/scene/gift | 0.4457 |
| /ja/read-korean-fashion-size-reviews | /ja/read-korean-cosmetics-reviews-by-skin-type | 0.4444 |
| /media/genre/kids-baby | /media/scene/gift | 0.4432 |
| /media/genre/womens-fashion | /media/scene/big-size | 0.4432 |
| /ja/choose-refrigerator-by-space-capacity-and-door | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4430 |
| /ja/find-products-seen-on-social-media | /ja/find-korean-cosmetics-without-product-name | 0.4429 |
| /ja/how-to-use-shopping-rankings | /ja/use-hoshilu-buzz-for-product-discovery | 0.4414 |
| /ja/check-device-compatibility-before-buying | /ja/how-to-use-shopping-rankings | 0.4412 |
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4397 |
| /ja/product-requests | /ja/identify-a-product-someone-else-is-using | 0.4394 |
| /media/genre/kitchen | /media/scene/gift | 0.4385 |
| /ja/compare-air-purifiers-by-room-filter-and-maintenance | /ja/compare-robot-vacuums-by-floor-threshold-and-maintenance | 0.4384 |
| /ja/how-to-use-shopping-rankings | /ja/compare-qoo-and-shein-rankings-for-korean-trends | 0.4371 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4371 |
| /ja/compare-delivery-and-return-conditions | /ja/compare-ec-mall-fees-for-sellers | 0.4366 |
| /media/genre/kitchen | /media/scene/big-size | 0.4362 |
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
| /media/price-drops | /media/scene/korean | 0.4250 |
| /ja/find-products-introduced-on-youtube | /ja/find-fashion-items-seen-on-instagram | 0.4247 |
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
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4189 |
| /ja/shopping-guide-for-seniors | /ja/shopping-guide-for-living-alone | 0.4186 |
| /ja/search-products-by-budget-and-purpose | /ja/choose-ai-check-or-quick-search-in-hoshilu | 0.4186 |
| /ja/search-products-by-budget-and-purpose | /ja/find-products-seen-on-social-media | 0.4179 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4177 |
| /ja/choose-tablet-by-screen-storage-and-connectivity | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4177 |
| /ja/find-products-seen-on-social-media | /ja/search-products-from-x-post-urls | 0.4173 |
| /media/price-drops | /media/scene/hitorigurashi | 0.4172 |
| /media/price-drops | /media/scene/big-size | 0.4167 |
| /ja/use-hoshilu-camera-search | /ja/search-products-from-saved-images | 0.4167 |
| /ja/search-products-by-budget-and-purpose | /ja/find-products-for-small-spaces | 0.4154 |
| /ja/compare-total-price-with-shipping | /ja/compare-delivery-and-return-conditions | 0.4143 |
| /ja/compare-multiple-shops | /ja/compare-amazon-and-rakuten | 0.4138 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-curtains-by-window-size-hanging-and-care | 0.4138 |
| /ja/find-products-seen-on-social-media | /ja/search-products-from-instagram-post-urls | 0.4133 |
| /ja/american-products-in-japan | /ja/find-products-seen-on-social-media | 0.4132 |
| /ja/product-requests | /ja/find-products-seen-on-social-media | 0.4122 |
| /ja/find-cheapest-across-malls | /ja/compare-products-across-online-shops | 0.4122 |
| /ja/find-products-seen-on-social-media | /ja/find-a-product-you-saw-in-a-store | 0.4113 |
| /ja/compare-delivery-and-return-conditions | /ja/shopping-guide-for-students-on-a-budget | 0.4110 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-computer-monitors-by-space-ports-and-stand | 0.4110 |
| /ja/use-yahoo-shopping-point-days | /ja/prepare-for-amazon-sale-events | 0.4106 |
| /ja/compare-multiple-shops | /ja/use-yahoo-shopping-point-days | 0.4103 |
| /ja/choose-printer-by-purpose-ink-and-connectivity | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4103 |
| /ja/find-a-product-from-a-photo-or-screenshot | /ja/search-products-from-screenshots | 0.4099 |
| /ja/search-product-by-model-number | /ja/find-a-gift-by-recipient-and-occasion | 0.4098 |
| /ja/find-a-gift-by-recipient-and-occasion | /ja/find-korean-cosmetics-without-product-name | 0.4091 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4082 |
| /ja/compare-home-office-desks-by-size-and-cable-routing | /ja/compare-computer-monitors-by-space-ports-and-stand | 0.4079 |
| /media/price-drops | /media/scene/gift | 0.4072 |
| /ja/american-products-in-japan | /ja/search-products-by-budget-and-purpose | 0.4071 |
| /ja/american-products-in-japan | /ja/find-a-gift-by-recipient-and-occasion | 0.4071 |
| /ja/shopping-in-japan | /ja/find-products-used-by-favorite-idol | 0.4065 |
| /ja/product-requests | /ja/search-products-by-budget-and-purpose | 0.4065 |
| /ja/shopping-guide-for-parents | /ja/search-products-by-budget-and-purpose | 0.4060 |
| /ja/how-to-read-shopping-reviews | /ja/use-korean-cosmetics-rankings-safely | 0.4058 |
| /ja/compare-total-price-with-shipping | /ja/compare-korean-cosmetics-across-malls | 0.4058 |
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

## 実行境界・本人作業

本日は既存証拠確認、公開SEO監査、ローカル試験、文書保存のみ。D1直接照会/書込、SNS公開/強制再送、営業送信、新記事制作、本番コード/料金規約注意書き変更なし。新スケジュール/追加通知なし。大隆さんがやること：ない（11/1月初Amazon確認の再通知は行わない）。
