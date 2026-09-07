# 2026-09-07 Codex 本番実行・残件報告

## リリース証拠

- remote HEAD / production source: `ff8d12b7a5b2445d0143457d7329ae508082746b`。
- [CI / 本番deploy](https://github.com/t-ooku/P-GATE/actions/runs/34087154850): test・deploy成功。
- Cloudflare Version ID: `db4a257b-5988-4b5b-b6ee-ca7e93357e40`。2026-09-07 14:33:17 JST。
- npm test: Worker 2,271件 PASS、release 6件・extension 6件 PASS。GAS検証・検索品質チェックもCI成功。
- `/health`: ok=true、release=1.22.1、missing=[]、weak=[]。DB機能・X/Instagram OAuth・Runway ready確認。
- 本番 `/assets-v147/app.js?v=152` とrepoのSHA-256一致：`176bd1c87a4a0df48b68cd5dc8460413d3ddb8e88e809ad3efcd6fcfd4cbab38`。
- migration 0077: 14:13:48 JST本番適用。新規`marketplace_price_cache`のみ。
  適用前のD1 time-travel復元位置は最初の[deploy artifact](https://github.com/t-ooku/P-GATE/actions/runs/34085896318)に保存。
- Teacher自動更新`3cabada`・`3c62048`も取り込み済み。同時更新を上書きせず、そのHEADを親にしてリリースした。
  生成日時だけの再コミットを防ぐため、内容が同一ならgenerated_atを保つ修正も反映。2回の再生成でファイルの完全一致を検証。

## 実装と完了境界

- `target_product_key`: 保存ペイロードの商品キー・ASIN・モールIDを正規化して保存。
  商品IDがある場合の不一致を商品名曖昧一致へ落とさない。ID無しの場合だけ型番→ブランド＋商品名を使用。楽天IDはitemCodeで直接取得する。Yahoo/ASINのID専用取得経路は未実装で、検索候補のID一致で判定する。
  既存3件のIDを推測補完してはいない。新しいID付き保存の本番実例は未確認。
- 価格保存: 通常検索で既に得た楽天公式応答をD1へ保存。追加の価格収集API呼出しはない。
  23時間TTL・期限切れ読み出し不可・定期削除・送料不明はNULL。Amazon/Yahooは対象外。
  既存`marketplace_offers`はtenant別のセラー供給用途なので別テーブルにした。
  巡回観測の価格も楽天23時間でNULLへ消去、Yahoo/Amazonは価格数値を永続記録しない。理由・一致結果は90日。既存通知本文の価格保持条件は別途確認が必要。
- 通知: `result_url`を保存。メール・LINEにHOSHILU復帰リンク。開始・通知クリックの計測を追加。
  実通知の送信・受信・再訪はまだ実証していない。
- Threads: URL・広告表記込みの文字数検証、恒久エラー打切り、一時障害は通算3回まで。
  既存の文字数エラー行は確認時既にCANCELLEDであり、今回の修正で投稿成功したとは報告しない。
- ブラウザE2E: 収納ボックスを入力・検索操作したがセキュリティ確認で停止。画面E2Eは未完了。
  固定の内部本番QAは別記する。通常利用者の保護設定は変更していない。

## 本番実数

最終取得時刻: 2026-09-07T05:38:48.987Z（UTC、14:38 JST）。[読取専用検証の第2回artifact](https://github.com/t-ooku/P-GATE/actions/runs/34087154850)。

| 項目 | 本番実数 |
|---|---|
| 希望価格ウォッチ | 3件、IDあり0、IDなし3 |
| target_price_observations | 0件。直近確認マーカーは12:00:24 JST、次回対象時刻前 |
| marketplace_offers / sp_api_listings | 0 / 0 |
| marketplace_price_cache | 楽天192件、期限内192件 |
| products | 326,483件 |
| 一般ユーザーWatch Set | 0件 / 0人（設定済み内部会員3人を除外） |
| 希望価格通知 | 0件 |
| Seller outreach | QUEUED 5 / sent 0。delivered・bounceは現行表で未計測、unsubscribe・response実績未確認 |

### 指定5検索：初回の実結果

内部本番QAで固定入力→展開規則→モールキーワード→候補→評価を記録。通常画面E2Eとは区別。

| 入力 | 展開規則 / 楽天第1キーワード | MATCHES候補数 | 初回評価と実物確認 |
|---|---|---:|---|
| 組み立てがいらない収納ボックス | no-assembly-storage-box / 組立不要 収納ボックス | 24 | 完成品収納ボックス、PASS |
| 猫砂が飛び散らない猫トイレ | litter-no-scatter-box / 飛び散り防止 猫トイレ | 28 | 自動PASSだが本命は砂取りマット。実物評価FAIL、修正対象 |
| すぐ乾く上履き | quick-dry-indoor-shoes / 速乾 上履き | 58 | 自動PASSだが本命は靴袋。実物評価FAIL、修正対象 |
| 羽根が外れて洗える扇風機 | detachable-blade-fan / 分解洗浄 扇風機 | 29 | 上位3件内に分解洗浄の扇風機、PASS。本命の機能適合は追加確認 |
| 音が静かな電動歯ブラシ | quiet-electric-toothbrush / 静音 電動歯ブラシ | 52 | 静音本体が出たが替えブラシ付を誤除外して自動FAIL。評価修正対象 |

修正: 猫トイレは「フルカバー 猫トイレ」を第1語へ。猫砂マット・靴袋・マットレス保護カバーは候補1件でも除外し、ゼロ件時の救済へ戻さない。歯ブラシは「替えブラシ付」の本体を交換品と区別する。旧QA行を消さずv2で再確認する。

### 修正後を含む最終確認：内部本番QA 5/5 PASS

PASS基準は「上位3件に特徴語一致があり、本命が除外対象でなく、必須5モールリンクが揃う」。
扇風機は3位の分解洗浄品で特徴一致しており、本命への機能適合保証や通常画面E2E成功を意味しない。

| 入力 | 確認日時 UTC | 候補数 | 結果 | 上位の実商品 |
|---|---|---:|---|---|
| 組み立てがいらない収納ボックス | 2026-09-07T05:22:54.780Z | 24 | PASS | 天馬(Tenma) 折りたたんでコンパクトになる持ち手付きの収納ボックス 完成品 折りたたみバスケット Sサイズ お部屋に馴染むデザインの折り畳みコンテナ オリ |
| 猫砂が飛び散らない猫トイレ | 2026-09-07T05:37:53.494Z | 30 | PASS | 猫トイレ 本体 フルカバー ペット用品 大きい 広い 飛び散り防止 丸洗い可 掃除しやすい スコップ ドア 砂落とし フード付き 取り外し可能 ドーム型 ハーフ |
| すぐ乾く上履き | 2026-09-07T05:38:09.007Z | 11 | PASS | 上履き 子供 キッズ 上靴 うわばき 室内履き 通気性 やわらかい マジックテープ 履きやすい 幼稚園 保育園 小学校 女の子 男の子 安心 快適 軽量 速乾  |
| 羽根が外れて洗える扇風機 | 2026-09-07T05:23:44.562Z | 29 | PASS | 【新品発売期間限定特価】サーキュレーター 卓上扇風機 自動首振り 壁掛け コードレス パワフル送風 静音 5段階風量調整 USB充電 コンパクト 分解洗浄 空気 |
| 音が静かな電動歯ブラシ | 2026-09-07T05:38:27.296Z | 52 | PASS | ミニマム DBK-5WCR シナモロールハピカ 電動付き歯ブラシ 日本製 電動歯ブラシ 替えブラシ付 3列植毛 ふつう 毛先超極細 静音設計 乾電池式 可愛い  |

猫トイレの砂取りマット、上履きの靴袋は再検証の上位候補から除外されている。
楽天返却/受理は猫30/30、上履き11/11、歯ブラシ30/30。歯ブラシのYahooは30/28。
受理数はプロバイダ段階の値で、最終候補数とは異なる。旧誤判定のQA行は削除していない。

### 過去7日ファネルの補足

| イベント | 計測結果 |
|---|---|
| landing_view | ATTRIBUTED:OTHER 39件 / ATTRIBUTED:SEO 1件 / QA:OTHER 314件 / UNATTRIBUTED:OTHER 147件 |
| target_price_watch_started | 0件（新設イベントは導入前を遡及計測しない） |
| target_price_watch_set | QA:OTHER 3件 |
| notification_opened | 0件（新設イベントは導入前を遡及計測しない） |
| marketplace_click | UNATTRIBUTED:OTHER 64件 |

Article→一般Watch Setは0件。通知送信・通知再訪も0件。UNATTRIBUTEDのMall Clickには内部利用が混在する可能性があり、一般利用者の送客成功件数とはしない。

### 当日のSNS証拠

以下は既存運用による公開実績であり、今回Codexが新規投稿した実績ではない。

| 媒体 | external post ID | published_at (UTC) | public URL |
|---|---|---|---|
| THREADS | 18103661756576642 | 2026-09-07T00:32:24.000Z | [公開URL](https://www.threads.com/@hoshilu.app/post/Dc91N4NGS8W) |
| X | 2096805078602490274 | 2026-09-07T03:37:39.000Z | [公開URL](https://x.com/i/web/status/2096805078602490274) |
| THREADS | 18417445675157913 | 2026-09-07T03:42:39.000Z | [公開URL](https://www.threads.com/@hoshilu.app/post/Dc-K_ejiLRb) |
| X | 2096810109800198599 | 2026-09-07T03:57:39.000Z | [公開URL](https://x.com/i/web/status/2096810109800198599) |
| THREADS | 18561917863078085 | 2026-09-07T03:52:39.000Z | [公開URL](https://www.threads.com/@hoshilu.app/post/Dc-MIuAjJe6) |
| THREADS | 17953084887254333 | 2026-09-07T04:17:39.000Z | [公開URL](https://www.threads.com/@hoshilu.app/post/Dc-O_4uClEQ) |

6件のID・日時・URLを確認。Xの2件のURLは本番公開監査APIが返すID形式のURLで、Xページの表示を実機確認したものではない。Instagramの本日Reelは予約段階。

## 残るP0/P1

1. **P0** 既存3ウォッチを正しい商品ID付きで保存し直す。ID対応と新規保存の実例を確認。
2. **P0** 次回巡回後の`target_price_observations`を再確認。0件のままならcron・API・記録処理を切り分ける。
   NO_MATCHの件数だけで判定を緩めない。
3. **P0** Amazonの価格追跡許諾・API条件、Yahoo!の保存可能時間を公式に確定。未確認の保存は開始しない。
4. **P1** 指定5検索の通常画面E2E（内部QAは完了）、価格決定→通知→再訪→モール送客の一連の実証。
5. **P1** 自発Watch Setを複数の独立した一般ユーザーで確認。内部3件とQAを除外。
6. **P1** 日次QAのコアラマットレスは、保護カバーを本命に出しながら旧期待条件でPASSと記録されていた。
   本体・付属品判定とQA期待値を修正し本番反映。コアラ検索の再巡回確認は未実施。過去のPASS全件を検索品質成功の根拠にしない。
7. **P1** 生活用品の商品取得は既存楽天/Yahooのライブ検索と権限のあるセラーフィードを優先。
   詳細と公式根拠は`2026-09-07-codex-life-goods-supply.md`。

既知の運用残件: [Issue #106](https://github.com/t-ooku/P-GATE/issues/106)のGitHub定期監視heartbeat遅延は未解決。CIからの本番契約チェック成功と、定期実行の継続性は区別する。

## 運用・引継ぎ

- 本日の巡回後と9/8初回営業後の実績確認を設定済み。自動実行の完了結果は別途確認する。
- 既存SNS定期確認を月水土新規Runway・火木日カルーセル・金既存編集・Stories毎日へ修正。
  Runway上限は月1万円かつ6,000 credits。未公開の予定を公開実績にしない。
- 既存SEO/KPI定期確認は記事量産よりWatch Setと通知再訪を優先する内容へ修正。
- Gemini作成の検索指示書の原文・Cowork改善後版・更新履歴は**未確認**。
  ユーザー提示のGPT再開指示書は受領済み。両者を混同しない。
- Coworkへの確認事項は生活用品調査ファイルに明記。外部メッセージ・メールは送信していない。
- 今回のコードは全てremoteへ反映。ローカルの生成物`dist/Project_GATE_Complete_v1.22.1.gs`と
  依存関係リンク`tools/line-worker/node_modules`は追跡対象外として残した。
  旧作業場所の監視メモは`2026-09-07-monitor-followups-preserved.md`へ保全。元の重複テスト2assertionは既に本番ブランチへ反映済みで、旧ファイルは削除していない。
