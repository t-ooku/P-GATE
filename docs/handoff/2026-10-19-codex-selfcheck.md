# Codex 日次点検 — 2026-10-19（月曜SEO監査併記）

## 16時台：競合短報の対応実施前の追加点検

- 大隆さんの「おけ、やって」を受け、希望価格導線の合成検証・比較根拠の表示・年末向け小規模投稿テストの準備を実施。直接取得したhealthはok:true/missing0/weak0。Monday Seller週報10/19はQA shop DONE。
- 既存monitor run39212557337（15:53–54 JST）とIssue #369は、外形・検索SLI PASS、SNS `SOCIAL_AI_ACTRESS_FUTURE_INVENTORY_MISSING`でOPEN。10/21・26 CANCELLEDを復活させず、今日のAPPROVED枠も変更しない。今回の投稿テストを在庫障害の復旧として数えない。X停止を維持。
- 読取専用CI成果物39186649293はschema/scope一致だがprivacy.post_text_or_ids=true。厳格な全falseゲートに不合格のため、中身を新しいKPI判断に使用していない。一般実績の増加・0件・改善効果を今回の取得結果から断定しない。
- 本番D1直読・書込なし。検索本文・個別通知・個人情報取得なし。合成テストはローカルfixtureを使用。

## 結論・証拠・除外

- 購入先クリックは直近7日 **1セッション**、一般希望価格設定完了0人0件、Seller新規問い合わせ0。契約の最新確認は10/17 20:15 JSTの0件で、今日の契約数・アフィリエイト注文/報酬は未計測。技術点検・原稿依頼・投稿数を売上成果としない。途中報告の「2セッション」は前回値の持越しだったため訂正する。7日窓が動く前日値との単純な差を、本日の減少・故障と断定しない。
- 最新AGENTS、10/8 inspection handover、10/10 execution coordination、inbox README/既存4件、最新Cowork/Claude Code売上記録を読了。日報は異常の有無によらず毎日1本保存する最新指示を優先。
- 対象HEAD `9aa873f3ca9c1c459f39e63a37e210e952558620`。[CI #2476](https://github.com/t-ooku/P-GATE/actions/runs/39123161276) test/deploy成功、build #47成功。deployログの生成物込みsourceも同SHA、Version ID `2f7f4e8e-95ee-40b4-953b-f5dcfde4978e`。本点検で本番コード/画像の変更・デプロイはしない。
- 最新既存[monitor #1207](https://github.com/t-ooku/P-GATE/actions/runs/39174530742)、10/19 07:58–07:59 JST、source同SHA。外形/health/検索SLIはPASS、SNS将来在庫はFAIL。[#369](https://github.com/t-ooku/P-GATE/issues/369) OPEN。Actionsのmain SHAは監視定義であり、実際に検査されたfeatureのsource SHAとは区別。
- 読取専用成果物 `hoshilu-codex-kpi-39174530742` / artifact `12154086054`、生成 **10/19 07:59:10 JST**。7日窓 **10/12 07:59:10〜10/19 07:59:10 JST**。health07:59:15はok:true/release1.22.1/missing0/weak0。health/OAuth/SNS在庫/検索SLIの手動二重取得・Actions再実行なし。
- 一般集計はQA/INTERNAL除外、一般ウォッチは設定済み内部会員3人除外。旧撮影UA・自動取得疑いの履歴を含むため、匿名visitorを人の人数にしない。通知再訪と内部会員の結合は未計測。D1直読/書込、検索文/利用者写真/個人情報/Secret取得なし。

## 日次9項目

### 1. 固定QA：PASS数と本命名の意味を分ける

本日07:22:49〜07:24:48 JST、25件自動PASS/0FAIL。全本命名を読み、カテゴリ意味一致は25/25（当初9件9/9）。下表は固定QAだけの短い本命要約で、一般検索文ではない。色・性能・販売モール・同一商品の全属性適合を保証しない。

| 固定fixture | 本命商品の要約 | 意味判定・限界 |
|---|---|---|
| ig_mattress | 厚さ5cm三つ折りシングルマットレス | 本体、トッパーでない |
| koala_mattress | Koala認定中古オリジナル・マットレスのみ | ブランド/本体一致、中古 |
| qoo10_korean_lip | PHリップ/韓国コスメ | リップ一致、Qoo10同一品の確認ではない |
| korean_pink_lip | マットリップティント4色/韓国 | リップ一致、ピンク色は未確認 |
| standing_leather_tote | 本革トート/自立 | 用途・材質・自立の記載あり |
| smoky_quartz_ring | スモーキークォーツ等天然石リング | 指輪一致、複数石の選択肢あり |
| ig_white_bag | ミニショルダーレザーバッグ白 | バッグ/白の記載あり |
| shein_one_piece | レディース・マキシワンピース | 衣服一致、SHEIN同一品とは未確認 |
| amazon_storage | 小物収納引き出し整理ケース | 収納一致、Amazon同一品とは未確認 |
| bottom_removable_bottle | sokomoそこまで洗えるボトル | 底が外せる代表カテゴリ一致 |
| pet_shedding_brush | 抜け毛取りグルーミンググローブ | 猫の毛の手入れ用途一致、通常の柄付きブラシではない |
| auto_off_humidifier | 卓上加湿器/空焚き防止/自動オフ | 本体・機能記載あり |
| easy_clean_baby_bottle | chuchu広口哺乳瓶 | 哺乳瓶本体/広口一致 |
| energy_saving_kotatsu | TEKNOS省エネこたつ本体 | 毛布だけでなく本体 |
| freezer_safe_food_container | フレッシュキーパー食品保存容器 | 容器一致、耐冷凍・耐破損性能は本命名だけでは未確認 |
| oil_free_air_fryer | ノンフライヤー/エアフライヤー2L | 調理本体一致 |
| easy_wrist_blood_pressure_monitor | タニタBPA11手首式血圧計 | 本体・方式一致 |
| sleep_comfortable_earplugs | 安眠/睡眠用耳栓 | イヤホンでなく耳栓 |
| auto_drain_dehumidifier | YUENZEE除湿機/全自動排水 | 本体・機能記載あり。商品名の10/17期限クーポンは現行価格の根拠にしない |
| washable_electric_blanket | 丸洗い電気ブランケット | 本体・丸洗い記載あり |
| energy_saving_electric_carpet | 省エネ/節電ホットカーペットミニ | 本体・用途一致 |
| dull_knife_sharpener | 2段階包丁研ぎ器 | 付属替刃でなく本体 |
| pink_slime_bathroom_cleaner | 緑の魔女バス泡浴室用洗剤 | 洗剤一致、ぬめり除去の実効性は未確認 |
| uv_shade_stroller_canopy | ベビーカーUVカバー/サンシェード | 日よけ用途一致 |
| dark_ink_name_pen | シャチハタおなまえマーカー黒/布用 | 名前用マーカー、名入れボールペン誤りは再発なし |

名前ペンは既存inbox DONE・10/18 Codex本番確認済みを維持。本日も再観測一致。重複依頼・並行修正なし。

### 2. 写真検索・provider診断

- 最新SEARCH_SLI_OK。15分started/completed/degraded/hard/backendは各0、6h finished0/degraded0、30d finished178/unavailable0。母数0の窓を成功率100%と呼ばない。
- query_structurer/ai_chat_primaryは07:07:45 JST、楽天/Yahooは07:52:45にCANARY_OK。OpenAI backupのBILLING_DISABLEDは意図した停止。regular heartbeat07:46、deep07:52完了、pending incident/advisoryなし。
- 写真限定の24h `search_backend_failed` / `search_provider_degraded` のcampaign別内訳は未計測（既存成果物に分類なし）。7日CAMERA attempts1/completed1を写真全体の24h成功率に代用しない。写真の追加取得や外部API probeなし。

### 3. 希望価格巡回の24h reason

- QA/INTERNAL除外の24h reasonは未計測。成果物は内部を含む累積診断で、ABOVE_TARGET1002（前日日報986から+16）、API_FAILURE118、NO_CANDIDATES3、部分API失敗97、NO_MATCH1。REACHED行なしを一般利用者の到達0の照会結果としない。
- 内部watch2/商品キー2、最終06:15:45 JST、楽天24h CANDIDATES16。一般利用者にNO_CANDIDATES/NO_MATCHが偏っている証拠なし。一般ウォッチ0人0件とは分離。

### 4. 価格記録の増加

`price_observations` 総件数・前日差は未計測（成果物に項目なし）。price_cache1016/fresh1016を価格観測総件数に代用しない。products326483件も同様。必要な集計の欠落として継続記録し、二重D1照会をしない。

### 5. SNS無限リトライ・在庫・公開証拠

- active APPROVED/PUBLISHINGのlast_errorあり行は現成果物に0。Threads FAILED累計19（前日16から+3、最終10/18 22:32:50 JST）。新3行の秘匿エラーはOTHER_REDACTEDなので全て401と断定しない。既存記録で期限切れ401を確認済み、再認証の復旧証拠なし。
- 07:59在庫 **1/3**（10/20〜26）。**10/21・10/26 Instagram各1行CANCELLED**。昨日配備したdrops認識/不足枠診断は本番監視で作動確認済みだが、取消枠の在庫復旧ではない。取消原因の詳細は未計測、取消をAPPROVED/公開扱いにせず、解除・再送・同じSeller画像再投稿をしない。本日20:00の1枠APPROVEDは未来、公開三要素未取得が正常。
- 新たな具体的制作は [Seller初回相談・原稿案2本](claude-inbox/2026-10-19-seller-consultation-draft-alternatives.md) に1件OPENで保存する。原稿案のみで、画像生成/再撮影/予約反映/公開/D1書込/営業送信なし。保存後も未受領で、巡回予定を実行保証にしない。
- Instagram累積PUBLISHED88（前日87から+1）。10/18 **21:02:50 JST**、ID `17960307249247594`、[公式permalink](https://www.instagram.com/p/Deoo7-MCA0c/) の三要素を既存成果物で確認。投稿の存在と集客/購入成果は別。
- 10/17は20:02:50 ID `18196557208390365` / https://www.instagram.com/p/Del9RlSCKWz/ 、20:12:50 ID `17865999933680248` / https://www.instagram.com/p/Del-ae0iOMp/ の記録あり。本人の重複投稿削除指示があるため、現在も両方公開中とは断定しない。10/15の未取得ID/URLは前々日日報で解消済み、再取得なし。
- X approved0/publishing0、停止維持。#616 OPEN・GENERATED_REVIEW_REQUIREDを維持、旧素材レビュー/再生成/公開なし。Threads期限切れ後の旧失敗投稿は、認証回復後も強制再送しないという最新Cowork記録を優先。
- 実画面撮影は別の既存実装でmainの15:07/18:07二重機会・当日撮影済みskipへ変更済み。10/18の旧定刻欠落を手動build成功で復旧済みにしない。今日の定刻成功は未来で未確認、写真の取得・再撮影なし。

### 6. モール到達

- 7日全体検索42/完了38/購入先クリック1セッション、検索→送客2.4%（1/42）。完了→送客2.6%（1/38）、時系列経路は検索41で2.4%（1/41）。分母を混ぜない。marketplace_clickはATTRIBUTED1イベント/匿名識別子1、訪問者1人や購入1件を意味しない。
- モール別click/shown CTR・厳密1タップ率は未計測（同じ定義の分母なし）。7日記事7セッション→記事CTA0→検索開始1→希望価格設定0→送客0。
- 統合カード計測のブラウザJS/HTTP試験は昨日確認済み。最新Cowork記録でも楽天カードclickとai_result_clicked各1・endpoint202を確認。これを一般利用者の新規クリックとして加算しない。一般イベント最終10/18 21:03:46、Seller最終20:47:39 JST、今日新規成果はまだ観測なし。

### 7. 最大ボトルネックはB（検索しない）を1つ選ぶ

- 最新成果物の比較可能な経路はLP264→検索42（15.9%、差222）で、集計された段階間の最大差。よって本日は **B** を選ぶ。昨日のE（一般保存0）も未解消だが、最大を複数並記しない。自動取得疑いを含むので「222人が離脱した」とは言わない。
- 次の修正候補は、既存LP/記事の検索CTAが何を始めるか分かる入口への絞り込み。まず撮影除外後の新しいlanding→CTA→検索の匿名段階で対象箇所を特定し、修正対象を1箇所に限定する。全記事の一括書換え・新記事増産・未観測の原因の断定はしない。本点検でLP文言/料金/注意書きは変更せず、観測と最終判断はCodexが継続。
- 時系列の希望価格開始0だが単純イベント開始1（10/15 18:48）を区別。一般設定完了0人0件、通知再訪0。新しい保存押下/認証/送信失敗の行なし。API故障・人の離脱と断定する証拠はない。

### 8. 制作停止・実行管理・収益KPI

- 10/8の定期制作/教師データ増産停止は正本どおり。Claudeの全スケジュール設定を直接検証する接続・即時起動接続はない。READMEの09:13/14:13/20:13巡回連携と旧依頼のACKED/DONE実績はあるが、新依頼の将来受領を保証しない。点検をClaudeへ差し戻さない。
- 既存inbox4件はDONE。新しいSeller原稿案1件は **依頼記録済み（GitHub保存後）/受領未確認/制作未完了/公開未実行** と分ける。新依頼は同じ7枚再投稿ではない相談切り口案で、旧DONEの検索/写真マスク/調査と重複しない。受領・完成証拠は次回既存実行で追跡。
- Seller LP36イベント31セッション30匿名識別子、CTA0、旧focus2（入力ではない）、新input/submit/fail0。累積問い合わせ4、10/10以降新規0、外部Seller登録0/商品0、申請0/qualified0。累積4を外部事業者4社としない。有料契約の最新既存SELECTは10/17 20:15 JSTで0、今日の値は未計測。
- 営業候補252/現対象190/sent累積191/optout1/response記録0/failed0/queued1/eligible_now0。対象190と過去sent191は別母数。next_scheduled_at9/23の古い値を本日の予定としない。delivered/bounceはWebhook未接続、正しい返信受信箱/商談化は未計測。Gmail新規10/フォロー6は既存別担当の下書き・予定であり実送信実績に加算しない。D1への営業記録の追加は未承認で実行しない。
- 監視台帳SETTLED **US$0.390974**、RESERVED0、既存月上限5の残枠US$4.609026。Googleの請求残高・全Gemini消費ではない。実請求/アフィリエイト報酬は未取得、総売上0円を新しい確認結果として断定しない。
- 月曜07:30以降だが `2026-10-19-seller-promo-weekly.md` は現HEADに未着、QA shop job DONEは未確認（未計測）。最新Actions一覧にも当該週次runなし。main/featureの既存cron定義は存在する。遅延/未実行は原因未確定、欠落だけ記録し、手動起動・Seller販促コード修理・D1照会はしない。
- 本日は文書のみ。ローカルnpm testはworker3073件/GAS・release6件/Chrome6件すべて成功。技術検証は売上成果ではない。SNS/営業送信・新記事・D1書込・新規課金・権限拡大・料金/規約変更なし。

### 9. 14日以上動きのないOPEN Issue

updated:<2026-10-05の34件、前日同数：#1,#44,#52,#74,#123,#149,#161,#169,#219,#223,#258,#260,#270,#273,#289,#321,#325,#326,#353,#388,#422,#423,#432,#463,#464,#465,#466,#467,#473,#477,#489,#526,#529,#536。

#369は本日更新のためこの34件に含めないがOPEN・未復旧。監視#1206→1207は約90分で、5分頻度の復旧証拠はない。検索/health PASSとSNS在庫FAIL、実行間隔を分け、復旧基準を緩めない。

## 月曜SEO監査

- HEAD9aa873f3の既存記事142＋/ja hub1＋日本語サービス10＝**153ページ**（/en/5ページは日本語範囲外）。全153がHTTP200、title/description欠落0。記事/ハブのメタは正確なsource renderer、サービス10ページは本番HTML。HTTP監査は識別可能なSEO監査crawler UA、GETのみ、JS/検索/クリック/イベント送信なし。
- repo sitemap158 URL、本番158、重複0/0、URL集合一致。`evaluateSeoPageQuality` は適用対象142記事の最小100。非記事11ページに未適用のスコアを補わない。全npm test合格。
- title＋descriptionを連結、Unicode NFKC・小文字化・空白除去し、文字2-gramの重複を除いた集合でDice `2|A∩B|/(|A|+|B|)`。153ページでは **0.40以上165対、0.50以上29対**、最大0.7211（Instagram URL記事とX URL記事）。/ja内143のみなら162対/28対。全対は末尾。
- 10/12の98対/20対とは範囲・正規化条件が揃っていないので悪化比較しない。今週の同方式基準として固定。既存記事数142不変、新記事0なので「新記事と既存0.50以上」の新規違反0。類似スコアはGoogle評価低下やペナルティの証拠ではない。
- 所見：記事7閲覧→CTA0→検索1で、記事から行動が継続している実績がない。重複テーマをさらに増やすより、既存記事の検索開始への入口と計測を1箇所ずつ検証する。SEO記事増産は停止継続、今回は本文/メタの大量変更なし。
- 月初でないためAmazon180日期限の月次監査は対象外。

## 本人だけに必要な既存操作

Threads再認証がまだなら、[Metaアプリ一覧](https://developers.facebook.com/apps/)でHOSHILU接続を再認証し、[Cloudflare](https://dash.cloudflare.com/) → Workers & Pages → project-gate-line-bridge → Settings → Variables and Secrets の既存 `THREADS_ACCESS_TOKEN` を更新・Deploy。値はチャット/文書に貼らない。既存失敗投稿の再送・X再開は含めない。Codexは更新後の既存処理の401解消と公開証拠を確認する。Claudeへの転送・中継は不要。

## SEO類似対（全165対、0.40以上）

| ページA | ページB | Dice |
|---|---|---:|
| /ja/search-products-from-instagram-post-urls | /ja/search-products-from-x-post-urls | 0.7211 |
| /ja/search-products-from-tiktok-video-urls | /ja/search-products-from-x-post-urls | 0.7000 |
| /ja/compare-amazon-and-rakuten | /ja/compare-qoo10-and-rakuten | 0.6917 |
| /ja/search-products-from-instagram-post-urls | /ja/search-products-from-tiktok-video-urls | 0.6887 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/compare-multiple-shops | 0.6711 |
| /ja/american-products-in-japan | /ja/shopping-in-japan | 0.6667 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.6667 |
| /ja/compare-amazon-and-qoo10 | /ja/compare-qoo10-and-rakuten | 0.6618 |
| /ja/search-products-by-budget-and-purpose | /ja/find-a-gift-by-recipient-and-occasion | 0.6190 |
| /ja/compare-amazon-and-rakuten | /ja/compare-amazon-and-qoo10 | 0.6074 |
| /ja/how-to-read-shopping-reviews | /ja/read-korean-cosmetics-reviews-by-skin-type | 0.6015 |
| /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | /ja/compare-robot-vacuums-by-floor-threshold-and-maintenance | 0.5986 |
| /media | /media/price-drops | 0.5957 |
| /ja/find-fan-activity-goods-by-purpose | /ja/use-fan-goods-rankings-by-purpose | 0.5781 |
| /ja/find-products-seen-on-social-media | /ja/find-products-seen-on-tiktok | 0.5733 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-instagram-post-urls | 0.5622 |
| /ja/choose-refrigerator-by-space-capacity-and-door | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.5621 |
| /ja/prepare-for-qoo10-mega-sale | /ja/prepare-for-rakuten-sale-events | 0.5359 |
| /ja/how-to-use-shopping-rankings | /ja/use-korean-cosmetics-rankings-safely | 0.5352 |
| /ja/shopping-in-japan | /ja/shopping-guide-for-parents | 0.5313 |
| /ja/find-products-seen-on-tiktok | /ja/find-fashion-items-seen-on-instagram | 0.5290 |
| /ja/find-products-seen-on-tiktok | /ja/find-products-introduced-on-youtube | 0.5235 |
| /ja/choose-folding-umbrella-by-open-size-and-weight | /ja/choose-hair-dryer-by-weight-controls-and-storage | 0.5185 |
| /ja/find-products-seen-on-social-media | /ja/find-fashion-items-seen-on-instagram | 0.5170 |
| /ja/find-a-product-you-saw-in-a-store | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.5109 |
| /ja/search-products-from-saved-images | /ja/search-products-from-x-post-urls | 0.5109 |
| /ja/compare-amazon-rakuten-yahoo-shopping | /ja/plan-shopping-with-ec-sale-calendar | 0.5000 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-living-alone | 0.5000 |
| /ja/read-korean-fashion-size-reviews | /ja/compare-korean-fashion-purchase-sites | 0.5000 |
| /ja/compare-multiple-shops | /ja/plan-shopping-with-ec-sale-calendar | 0.4969 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-tiktok-video-urls | 0.4944 |
| /ja/search-products-from-public-social-post-urls | /ja/search-products-from-x-post-urls | 0.4943 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4937 |
| /ja/find-discontinued-or-renamed-products | /ja/find-products-seen-on-tiktok | 0.4908 |
| /ja/find-fashion-items-seen-on-instagram | /ja/search-products-from-instagram-post-urls | 0.4903 |
| /ja/find-products-seen-on-tiktok | /ja/identify-a-product-someone-else-is-using | 0.4901 |
| /ja/choose-microwave-oven-by-space-capacity-and-cleaning | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4875 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-microwave-oven-by-space-capacity-and-cleaning | 0.4872 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4872 |
| /ja/compare-amazon-and-rakuten | /ja/compare-amazon-rakuten-yahoo-shopping | 0.4853 |
| /ja/use-fan-goods-rankings-by-purpose | /ja/use-student-commute-item-rankings | 0.4844 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4832 |
| /ja/compare-korean-cosmetics-across-malls | /ja/compare-korean-fashion-purchase-sites | 0.4823 |
| /ja/compare-multiple-shops | /ja/find-cheapest-across-malls | 0.4789 |
| /for-creators | /creator-terms | 0.4776 |
| /ja/american-products-in-japan | /ja/search-product-by-model-number | 0.4771 |
| /ja/compare-delivery-and-return-conditions | /ja/compare-korean-fashion-purchase-sites | 0.4755 |
| /ja/search-product-by-model-number | /ja/search-products-by-budget-and-purpose | 0.4754 |
| /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | /ja/compare-air-purifiers-by-room-filter-and-maintenance | 0.4698 |
| /ja/search-products-from-saved-images | /ja/search-products-from-tiktok-video-urls | 0.4681 |
| /ja/shopping-in-japan | /ja/shopping-guide-for-living-alone | 0.4677 |
| /ja/use-korean-cosmetics-rankings-safely | /ja/use-korean-fashion-rankings-by-item | 0.4667 |
| /ja/find-products-seen-on-tiktok | /ja/search-products-from-tiktok-video-urls | 0.4636 |
| /ja/search-product-by-model-number | /ja/find-products-seen-on-social-media | 0.4615 |
| /ja/search-products-from-saved-images | /ja/search-products-from-instagram-post-urls | 0.4595 |
| /ja/compare-new-used-refurbished-and-outlet-products | /ja/compare-domestic-and-parallel-import-products | 0.4575 |
| /privacy | /terms | 0.4554 |
| /ja/product-requests | /ja/use-hoshilu-search-until-found | 0.4552 |
| /ja/identify-a-product-someone-else-is-using | /ja/find-products-used-by-favorite-idol | 0.4526 |
| /ja/find-products-seen-on-tiktok | /ja/find-a-product-you-saw-in-a-tv-commercial | 0.4521 |
| /ja/choose-commute-backpack-by-load-and-size | /ja/choose-frying-pan-by-heat-source-size-and-weight | 0.4493 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4490 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | 0.4476 |
| /ja/read-korean-cosmetics-reviews-by-skin-type | /ja/use-korean-cosmetics-rankings-safely | 0.4460 |
| /ja/find-fashion-items-seen-on-instagram | /ja/identify-a-product-someone-else-is-using | 0.4459 |
| /ja/read-korean-cosmetics-reviews-by-skin-type | /ja/read-korean-fashion-size-reviews | 0.4444 |
| /ja/choose-refrigerator-by-space-capacity-and-door | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4430 |
| /ja/find-products-seen-on-social-media | /ja/find-korean-cosmetics-without-product-name | 0.4429 |
| /ja/how-to-use-shopping-rankings | /ja/use-hoshilu-buzz-for-product-discovery | 0.4414 |
| /ja/how-to-use-shopping-rankings | /ja/check-device-compatibility-before-buying | 0.4412 |
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4397 |
| /ja/product-requests | /ja/identify-a-product-someone-else-is-using | 0.4394 |
| /ja/compare-air-purifiers-by-room-filter-and-maintenance | /ja/compare-robot-vacuums-by-floor-threshold-and-maintenance | 0.4384 |
| /ja/how-to-use-shopping-rankings | /ja/compare-qoo-and-shein-rankings-for-korean-trends | 0.4371 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4371 |
| /ja/compare-ec-mall-fees-for-sellers | /ja/compare-delivery-and-return-conditions | 0.4366 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-seniors | 0.4361 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4336 |
| /ja/american-products-in-japan | /ja/find-products-introduced-on-youtube | 0.4333 |
| /ja/compare-amazon-and-rakuten | /ja/compare-products-across-online-shops | 0.4328 |
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
| /ja/choose-storage-box-by-space-and-opening | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4189 |
| /ja/shopping-guide-for-seniors | /ja/shopping-guide-for-living-alone | 0.4186 |
| /ja/search-products-by-budget-and-purpose | /ja/choose-ai-check-or-quick-search-in-hoshilu | 0.4186 |
| /ja/search-products-by-budget-and-purpose | /ja/find-products-seen-on-social-media | 0.4179 |
| /ja/choose-curtains-by-window-size-hanging-and-care | /ja/choose-washing-machine-by-space-load-and-maintenance | 0.4177 |
| /ja/choose-tablet-by-screen-storage-and-connectivity | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4177 |
| /ja/find-products-seen-on-social-media | /ja/search-products-from-x-post-urls | 0.4173 |
| /ja/use-hoshilu-camera-search | /ja/search-products-from-saved-images | 0.4167 |
| /ja/search-products-by-budget-and-purpose | /ja/find-products-for-small-spaces | 0.4154 |
| /ja/compare-total-price-with-shipping | /ja/compare-delivery-and-return-conditions | 0.4143 |
| /ja/compare-amazon-and-rakuten | /ja/compare-multiple-shops | 0.4138 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-curtains-by-window-size-hanging-and-care | 0.4138 |
| /ja/find-products-seen-on-social-media | /ja/search-products-from-instagram-post-urls | 0.4133 |
| /ja/american-products-in-japan | /ja/find-products-seen-on-social-media | 0.4132 |
| /ja/compare-products-across-online-shops | /ja/find-cheapest-across-malls | 0.4122 |
| /ja/product-requests | /ja/find-products-seen-on-social-media | 0.4122 |
| /ja/find-products-seen-on-social-media | /ja/find-a-product-you-saw-in-a-store | 0.4113 |
| /ja/compare-delivery-and-return-conditions | /ja/shopping-guide-for-students-on-a-budget | 0.4110 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-computer-monitors-by-space-ports-and-stand | 0.4110 |
| /ja/use-yahoo-shopping-point-days | /ja/prepare-for-amazon-sale-events | 0.4106 |
| /ja/compare-multiple-shops | /ja/use-yahoo-shopping-point-days | 0.4103 |
| /ja/choose-washing-machine-by-space-load-and-maintenance | /ja/choose-printer-by-purpose-ink-and-connectivity | 0.4103 |
| /ja/find-a-product-from-a-photo-or-screenshot | /ja/search-products-from-screenshots | 0.4099 |
| /ja/search-product-by-model-number | /ja/find-a-gift-by-recipient-and-occasion | 0.4098 |
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
| /ja/compare-amazon-and-qoo10 | /ja/compare-amazon-rakuten-yahoo-shopping | 0.4029 |
| /ja/search-products-across-multiple-shopping-sites | /ja/compare-multiple-shops | 0.4029 |
| /ja/choose-commute-backpack-by-load-and-size | /ja/choose-storage-box-by-space-and-opening | 0.4029 |
| /ja/choose-reusable-water-bottle-by-capacity-and-cleaning | /ja/choose-rice-cooker-by-servings-size-and-cleaning | 0.4029 |
| /ja/find-fashion-items-seen-on-instagram | /ja/search-products-from-x-post-urls | 0.4028 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/compare-cordless-vacuums-by-floor-weight-and-maintenance | 0.4028 |
| /ja/choose-frying-pan-by-heat-source-size-and-weight | /ja/choose-tablet-by-screen-storage-and-connectivity | 0.4027 |
| /ja/find-discontinued-or-renamed-products | /ja/find-products-introduced-on-youtube | 0.4026 |
| /ja/choose-electric-kettle-by-capacity-pouring-and-cleaning | /ja/choose-curtains-by-window-size-hanging-and-care | 0.4026 |
| /ja/use-korean-fashion-rankings-by-item | /ja/compare-qoo-and-shein-rankings-for-korean-trends | 0.4025 |
| /ja/compare-qoo10-and-rakuten | /ja/find-cheapest-across-malls | 0.4000 |
| /ja/search-products-across-multiple-shopping-sites | /ja/product-requests | 0.4000 |
| /ja/american-products-in-japan | /ja/find-products-used-by-favorite-idol | 0.4000 |
| /ja/how-to-search-by-description | /ja/find-korean-cosmetics-without-product-name | 0.4000 |
| /ja/product-requests | /ja/compare-amazon-rakuten-yahoo-shopping | 0.4000 |
| /ja/shopping-guide-for-parents | /ja/shopping-guide-for-students-on-a-budget | 0.4000 |
| /ja/compare-mobile-batteries-by-capacity-weight-and-ports | /ja/choose-hair-dryer-by-weight-controls-and-storage | 0.4000 |
| /ja/choose-rice-cooker-by-servings-size-and-cleaning | /ja/choose-refrigerator-by-space-capacity-and-door | 0.4000 |
| /ja/compare-air-purifiers-by-room-filter-and-maintenance | /ja/compare-wireless-headphones-by-fit-controls-and-charging | 0.4000 |
| /ja/choose-ai-check-or-quick-search-in-hoshilu | /ja/use-hoshilu-mall-coverage-to-continue-searching | 0.4000 |
