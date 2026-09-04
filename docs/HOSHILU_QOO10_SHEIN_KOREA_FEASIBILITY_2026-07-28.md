# HOSHILU Qoo10 / SHEIN Korea 連携可否調査

- 調査日: 2026-07-28 JST
- 対象: HOSHILU（ホシル）韓国展開
- 調査段階: 事前検証（実装未着手）
- 判断原則: 公式API・公式フィード・書面許諾が確認できない商品データ取得は実装しない
- 事業必須要件（2026-07-28決定）: Qoo10・SHEIN商品の閲覧、送客、可能なAffiliate収益化、韓国SellerのHOSHILU加入受付を実現する

## 0. 市場投入の前提

初期の需要側ターゲットは **日本の若者**、商品テーマは **韓国トレンド商品** とする。Qoo10 Japan・SHEIN Japanへの送客を最初の強い導線にしつつ、HOSHILU自身は特定EC専用サービスにしない。

- SNSや街中で見た、名前の分からない韓国商品を「形状＋機能」から探せる。
- 同一または類似商品をQoo10、SHEIN、Amazon、楽天、加入Seller直販などで横断比較できる。
- 若者が共有・投票・ほしっとくし、トレンドが検索・保存データとして蓄積される。
- 購入先は関連性、価格、在庫、配送、信頼性を比較し、Affiliate報酬だけで順位を決めない。

バズの入口は韓国商品だが、長期的な競争力は「欲しいものの記憶を、複数ECを横断して解決すること」に置く。韓国市場への供給側展開と、韓国Sellerの直接加入はこの日本向け需要を実績として進める。

## 1. 結論

現時点では、Qoo10 Korea、SHEIN Koreaともに、HOSHILUが必要とする「第三者商品の検索用データ（価格、在庫、画像、カテゴリ）の継続取得」を認める公式アフィリエイトAPIまたは商品フィードを一次情報で確認できなかった。

- Qoo10 Korea: 韓国消費者向けの現行公式マーケットプレイスおよび韓国向けAffiliate制度を確認できない。`qoo10.jp`のShare Affiliate、ValueCommerce、QAPIを韓国向けに転用できる根拠はない。
- SHEIN Korea: 韓国公式ヘルプにAffiliate窓口はあるが、申込条件、報酬、法人可否、API・商品フィードは公開されていない。公開Open PlatformはSHEINへ出品するSeller向けであり、Affiliateの商品取得用途ではない。
- 両社とも、公開商品ページをスクレイピングして商品DBを構築する方式は採用しない。SHEIN Koreaは自動・手動のロボット等による索引・アクセスを明示的に禁止し、Qoo10 Japanもロボット、スクレイパー、データ収集・抽出ツールによる無断アクセスを禁止している。

事業判断により、商品閲覧・送客・可能なAffiliate・Seller加入受付は必須とする。ただし「必須」は規約違反のデータ取得を許容する意味ではない。MVPは次の複線方式で成立させる。

1. 公式Affiliate Feed/APIが得られる経路は公式連携する。
2. Feedがない場合、承認済みAffiliate deep linkまたは通常リンクへの送客に限定する。
3. HOSHILUへ加入した韓国Seller・Brandから、商品情報と画像の利用許諾を得て直接取り込む。
4. Seller提供のCSV/API/管理画面入力を、韓国商品の主要な検索カタログにする。
5. Qoo10/SHEINの商品ページはScrapingせず、許諾済みカタログと送客URLを分離管理する。

これにより、特定Platformの非公開Feedに依存せず、韓国商品を発見・保存・共有できる状態を先に作る。公式連携が取得できた時点で、同じOffer Provider層へ追加する。

## 2. Qoo10 Korea

【対象】Qoo10 Korea
【アフィリエイトプログラム有無】不明（要問合せ。韓国向け現行制度を一次情報で確認できず）
【API・フィード提供有無】不明（Affiliate向けは確認できず。日本のQAPIはSeller向けREST/SOAP）
【利用規約上のリスク】要確認事項あり。Qoo10 Japan規約は無断のロボット、スパイダー、スクレイパー、データ収集・抽出ツールによるアクセスを禁止
【連携方式の推奨】現時点は見送り。韓国向け公式制度と書面許諾を確認後、Affiliateリンクのみ再検討
【根拠URL】

- [eBay Japan会社概要（Qoo10を「日本国内向けECサイト」と明記）](https://www.ebayjapan.co.jp/about-ebay/outline)
- [Qoo10 Japan利用規約](https://www.qoo10.jp/gmkt.inc/Company/UserAgreement.aspx)
- [Qoo10 API Help](https://api.qoo10.jp/GMKT.INC.Front.OpenApiService/APIList/default.aspx?intro=home)
- [Qoo10 QAPI Developer Guide](https://api.qoo10.jp/GMKT.INC.Front.QAPIService/Document/QAPIGuideIndex.aspx)
- [Qoo10 商品詳細説明照会API](https://api.qoo10.jp/GMKT.INC.Front.OpenApiService/APIList/GetItemDetailInfo.aspx)
- [ValueCommerce Qoo10公式通販Affiliate](https://www.valuecommerce.ne.jp/stepup/qoo10)

### 2.1 Affiliate制度

公式に確認できたのは日本向けのみ。

- ValueCommerceの「Qoo10公式通販アフィリエイトプログラム」はQoo10 Japan向け。2025年6月時点の公開値は、商品購入後の入金・出荷確認を成果条件として1.9%（税別）。
- ValueCommerceの一般案内では広告主審査がある。正確な現行条件、利用可能素材、法人審査はログイン後のプログラム詳細が正となる。
- Qoo10 Japanの商品ページにはShare Affiliateの表示があるが、これは韓国向け制度の証拠にはならない。
- eBay Japanの公式会社概要はQoo10を「日本国内向けECサイト」と説明する。今回の調査では、韓国消費者向けQoo10公式サービス、韓国向けShare Affiliate、韓国ASP、報酬、韓国外法人の申込条件を確認できなかった。

結論: Qoo10 KoreaのAffiliate制度は「なし」ではなく **不明（要問合せ）**。Qoo10 Japanの制度を韓国展開の根拠にしない。

### 2.2 API・商品フィード

Qoo10 Japanの公式API資料で確認できるものはSeller管理用。

- QSMと同様に、自店の商品登録・編集、注文、発送、クレーム等を管理する。
- API KeyはQoo10担当者から取得し、Seller Authorization Keyで販売者単位に認証する。
- REST/SOAPを案内。旧OpenAPIは2021-09-30終了、QAPIへ移行。
- 商品詳細照会はXMLレスポンスで、商品名、カテゴリ、価格、数量、画像URL等を返すが、認証された「該当販売者」の商品管理が前提。

これは全モールの商品をHOSHILUへ取得するAffiliate Product APIではない。公開のAffiliate API、JSON/XML/CSV商品フィード、更新頻度、レート制限は一次情報で確認できなかった。

### 2.3 規約・代替手段

Qoo10 Japan利用規約第18条は、サーバーへの無断アクセスとしてロボット、スパイダー、スクレイパー、データマイニング、データ収集・抽出ツール等を禁止する。したがって、商品ページや構造化データを定期収集する代替は採用しない。

公開ページにschema.org等が存在しても、公開表示されていること自体は再利用許諾ではない。RSSや構造化データの利用は、公式の機械利用許諾、利用範囲、画像利用、キャッシュ期間、価格更新義務が書面で確認できる場合に限る。

## 3. SHEIN Korea

【対象】SHEIN Korea
【アフィリエイトプログラム有無】あり（韓国公式ヘルプにAffiliate窓口あり。ただし申込・審査・報酬・法人条件は要問合せ）
【API・フィード提供有無】Affiliate向けは不明。公開Open Platform APIはSeller向け
【利用規約上のリスク】明確に禁止。韓国向け規約はロボット、スパイダーその他手動・自動手段による索引・アクセスを目的を問わず禁止
【連携方式の推奨】MVPの商品データ連携は見送り。公式承認後にAffiliateリンクのみ検討
【根拠URL】

- [SHEIN Korea Affiliate / Creatorヘルプ](https://m.shein.com/kr/help-center-a-3173.html)
- [SHEIN Korea Terms & Conditions](https://m.shein.com/kr/Terms-and-Conditions-a-399.html?language=en)
- [SHEIN Developer Platform](https://open.sheincorp.com/)
- [SHEIN Seller商品公開・編集API](https://open.sheincorp.com/documents/apidoc/detail/3001583-1000001)
- [SHEIN Seller商品一覧API](https://open.sheincorp.com/documents/apidoc/detail/3001239)
- [AccessTrade SHEIN掲載確認](https://www.accesstrade.ne.jp/reward-up)

### 3.1 Affiliate制度

SHEIN Korea公式ヘルプにはAffiliate Programに関する質問項目があり、SHEINアプリの「Me → Customer Service」から問い合わせるよう案内される。これにより韓国向け窓口の存在は確認できる。

ただし公開ページでは以下を確認できない。

- 一般公募か招待制か
- 審査基準
- 日本法人または韓国外法人の申込可否
- 法人メディア・検索サービスの登録可否
- 成果条件、コミッション率、Cookie期間
- 商品リンク、バナー、deep link以外の提供物
- Product API、CSV/XML/JSON feed
- AIによる商品属性加工・再提示の許可

Creator Centerは主に招待されたCreatorがCampaignへ参加する制度で、Affiliateの商品データ契約とは別に扱う。

日本のAccessTrade公式ページではSHEIN広告案件の存在を確認できるが、これは韓国サイト向け商品フィードの証拠ではない。A8.net、ValueCommerceについても、公開一次情報から韓国SHEINの商品データ提供を確認できなかった。

### 3.2 API

SHEIN公式Developer Platformは実在するが、公開説明は次のSeller業務向け。

- SHEINへの商品公開
- 注文・配送管理
- 在庫管理
- Seller/Supplier認可

商品一覧APIも、認証されたSeller自身が公開した商品を照会する設計である。HOSHILUがSHEIN消費者向けカタログ全体を検索する用途ではない。Affiliate向けProduct APIまたはFeedが「ない」と明記した公式文書は確認できないため、判定は **不明（公開提供は確認できず）** とする。

### 3.3 規約

SHEIN Korea利用規約（2026-07-01発効）の「Use of Our Services」は、robot、spiderその他の手動・自動のdevice/process/software/meansを用い、目的を問わずサービスをindexまたはaccessすることを禁止する。

また、コンテンツはSHEINまたはライセンサーに帰属し、明示的に許可された範囲だけ利用できる。したがって以下は、個別の書面許諾なしでは実装不可。

- 商品ページの定期取得
- 画像・説明・価格・在庫のDB保存
- 取得データのAI特徴抽出、翻訳、分類
- HOSHILU内での商品カード再表示
- schema.org Productの継続収集
- Apify等の第三者Scraping APIの利用

通常の承認済みAffiliate deep linkをHOSHILUの提案結果から開く行為は、技術的には実現可能だが、検索型AIサービスが承認媒体に含まれるかは公開規約から判断できない。媒体審査時にHOSHILUの画面、AI推薦方法、リンク配置、広告表示、対象国を開示し、承認を得る必要がある。

## 4. 汎用ASP・構造化データ

| 経路 | 確認結果 | HOSHILUでの扱い |
|---|---|---|
| ValueCommerce | Qoo10 Japan公式案件、成果1.9%を確認 | 日本送客候補。韓国連携の根拠にはしない |
| AccessTrade | SHEIN案件の公開掲載を確認 | 対象国、deep link、法人AI媒体、Feed有無を管理画面・担当者に確認 |
| A8.net | 韓国向けFeedを示す公開一次情報なし | 未確認 |
| 公開schema.org Product | ページ上の存在と再利用許諾は別 | 書面許諾なしでは収集・保存しない |
| RSS | 公式Affiliate向けRSSを確認できず | 利用しない |
| Scraping API | 公式許諾を証明しない | 採用しない |

リンク発行だけが許可された場合、HOSHILU自身の商品検索DBの供給源にはならない。別の許諾済み商品データから候補を特定し、同一商品のSHEIN/Qoo10リンクを人手または公式ツールで作る運用なら限定的に検討できるが、商品同一性、価格、在庫をHOSHILUが保証してはならない。

## 4.1 必須要件を満たす実装境界

| 必須機能 | MVP方式 | 将来拡張 |
|---|---|---|
| 商品閲覧 | 加入Sellerの許諾済み商品、公式Affiliate素材、編集部の許諾済み特集をHOSHILU内で表示 | 公式Product Feed/APIをProvider追加 |
| Qoo10送客 | Qoo10 Japanの韓国商品へ通常リンク。ValueCommerce承認後はdeep linkへ交換 | 韓国向け公式制度が確認できれば地域Provider追加 |
| SHEIN送客 | kr.shein.comへの通常リンク。媒体承認後のみAffiliate deep linkへ交換 | 韓国向けFeed契約取得時に商品同期 |
| Affiliate | Provider・国・媒体ごとに承認状態を持ち、未承認リンクをAffiliate化しない | 報酬・成果・失効をOffer単位で計測 |
| Seller加入 | 韓国Brand/SellerがHOSHILUへ直接申請し、商品CSV/API/手入力と画像利用許諾を提出 | セルフサービス管理画面、審査、在庫・価格同期 |

カタログのデータ源と購入先を分離する。Productは許諾済みの商品情報、OfferはQoo10、SHEIN、Seller直販等の遷移先、AffiliateContractは国・媒体・契約別の収益化可否を持つ。これにより、同じ韓国商品をHOSHILUで閲覧しながら、規約と契約に応じて安全な購入先へ送客できる。

Seller加入時には、法人・本人確認、ブランド権限、画像・説明文の利用許諾、偽造品対策、返品・配送条件、韓国語・日本語表示、広告表示、禁止商品を審査する。Qoo10/SHEIN Sellerであることは販売実績の証拠には使えるが、各Platformの商品データを転載する権利の証明にはしない。

若者向けの成長導線は、韓国トレンド特集、短尺動画・Creator投稿、形状＋機能検索、投票、ほしっとく、価格・入荷通知、共有カードを一つのループにする。報酬率ではなく記憶との一致と信頼性をランキングの主軸にする。

## 4.2 数百万人〜数千万人を前提にした設計

- 閲覧系はCDN・検索Index・読み取りModelを中心にし、Seller管理DBを直接検索させない。
- Provider取込は非同期Queueで冪等化し、商品・Offer・価格・在庫・権利情報を別versionで更新する。
- すべての商品属性・画像・リンクにsource、取得方法、利用許諾、対象国、失効日を保持する。
- 送客時はAffiliate Link Resolverが国、端末、承認状態、契約期限を判定し、使えない場合は通常URLへ安全にfallbackする。
- Rankingは関連性・鮮度・信頼性を主軸とし、Affiliate報酬は品質を下げない範囲の副次要素に限定する。
- Seller審査、権利侵害申告、商品停止は全体を止めずProvider・Seller・Offer単位で遮断できるようにする。
- 検索、ほしっとく、共有、送客、購入確認をevent化し、個人情報を分離した集計基盤で韓国トレンドを検出する。
- 若者向け拡散は「韓国で話題」「形は近い」「どっちが欲しい？」の共有カードと投票を入口にし、保存・再探索へ戻す。

## 5. ROI判断

### Qoo10 Korea

1. HOSHILU MVPで実装すべきか: **Yes**（許諾済み閲覧・送客・Seller直接加入。非公式商品同期はNo）
2. 実装コスト: **中〜高**（Provider分離、Seller審査、リンク管理が必要）
3. 期待利益: **中〜高**（韓国商品による集客、Seller獲得、送客収益。Affiliate承認前は収益不確実）
4. 技術リスク: **高**（対象サービス不明、AffiliateとSeller APIの混同、Scraping禁止リスク）
5. 将来Platform再利用: **高**（Product/Offer/Contract分離とSeller直接加入は他Platform・他国にも再利用可能）

### SHEIN Korea

1. HOSHILU MVPで実装すべきか: **Yes**（許諾済み閲覧・送客・Seller直接加入。ScrapingはNo）
2. 実装コスト: **中**（送客・直接Seller）／**高**（公式Feed連携）
3. 期待利益: **中〜高**（若年層集客と共有性。Affiliate承認・転換率に依存）
4. 技術リスク: **高**（自動アクセスの明示禁止、画像・商品情報の再利用権、媒体審査）
5. 将来Platform再利用: **高**（同じProvider境界を他Platform・他国へ展開可能。Scraping方式は不可）

## 6. 公式問合せで確認すべき事項

### Qoo10

1. 韓国消費者向けQoo10サービスは現在存在するか。正式URLと運営法人は何か。
2. 韓国向けAffiliate/Share Affiliateはあるか。
3. 日本法人HOSHILUが韓国向け媒体として契約できるか。
4. AI商品検索・比較・推薦サービスは承認対象媒体か。
5. 商品名、価格、在庫、画像、カテゴリ、商品URLを取得できる公式Feed/APIはあるか。
6. データ加工、翻訳、AI embedding、保存期間、画像キャッシュ、更新頻度の許諾範囲。
7. deep link、成果条件、報酬、Cookie期間、広告表示義務。

### SHEIN

1. `kr.shein.com` Affiliate Programへ日本法人が申請できるか。
2. HOSHILUのAI検索・提案結果画面を媒体として登録できるか。
3. Affiliate Product APIまたはCSV/XML/JSON Feedは提供されるか。
4. 商品画像、価格、在庫、カテゴリの表示・保存・翻訳・AI加工は許可されるか。
5. deep link生成、対象国、Cookie期間、報酬、返品取消条件。
6. APIがない場合、公式に提供された商品リンクと素材だけを使う運用が許可されるか。

SHEIN Developer PlatformのSeller API窓口は `openapi@shein.com` と公開されているが、Affiliate問い合わせは韓国公式ヘルプの案内どおりアプリ内Customer Serviceを優先する。

## 7. Go / No-Goゲート

実装全体を停止するのではなく、データ源ごとのGateを設ける。Seller直接加入、許諾済みカタログ、通常リンク送客は先行可能。公式Feed同期とAffiliate化は次の条件を満たしたProviderだけ有効化する。

- 対象国・運営法人・契約主体が確定
- HOSHILUが承認媒体として登録可能
- 商品データの取得手段が公式
- AI加工、再提示、画像利用、キャッシュが契約上許可
- 更新頻度・削除・価格表示・在庫免責に対応可能
- Affiliate表示など韓国の広告・表示ルールを確認
- 収益が取得・保守コストを上回る見込み

公式FeedがないProviderは **商品同期を見送り**、通常リンクまたは承認済みAffiliate URLへの送客だけを行う。閲覧用商品データはHOSHILU加入Sellerなど別の許諾済み供給源から取得する。Seller直接加入と許諾済みカタログは、Qoo10/SHEINとの契約待ちにせずMVP必須機能として進める。
