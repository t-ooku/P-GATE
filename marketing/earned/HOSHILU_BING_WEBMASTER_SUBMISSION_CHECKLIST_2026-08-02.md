# HOSHILU Bing Webmaster Tools提出手順（取込済み・登録確認待ち）

状態: `IMPORTED_OWNER_CONFIRMED`
確認日: 2026-08-02
費用: 0円  
本人操作: Search Consoleからの `hoshilu.app` 取込とID発行まで完了（確認値・ID値は保存しない）。インデックス登録・順位上昇は未確認。

## 事前確認済み

- `https://hoshilu.app/`: 2026-08-02にHTTP 200。
- `https://hoshilu.app/robots.txt`: 2026-08-02にHTTP 200。`/api/`のみクロール除外し、サイトマップURLを記載。
- `https://hoshilu.app/sitemap.xml`: 2026-08-02にHTTP 200。トップ、日英6テーマ（12 URL）、法的ページを収録。
- SEOページはcanonical、日英hreflang、`x-default`を持つ。
- HOSHILUの所有・運営主体はオオクツタカノリ個人。ITGグループ株式会社のAmazon.co.jp販売3店舗とは分離する。

## 推奨経路: Google Search Consoleから取り込む

Bing公式では、Google Search Consoleで確認済みのサイトを取り込むと、サイト所有権とサイトマップをBing Webmaster Toolsへ移行できる。重複するDNS変更を避けられるため、HOSHILUではこの経路を優先する。

1. HOSHILU所有者本人のアカウントで `https://www.bing.com/webmasters/` を開く。
2. Google Search Consoleの `hoshilu.app` 所有権確認が完了していることを確認する。**完了（2026-08-02）**。
3. `Import` を選び、HOSHILUのSearch Console情報を読むための権限範囲を本人が確認して許可する。**完了（2026-08-02）**。
4. 一覧から `hoshilu.app` だけを選ぶ。ITGの販売店舗や無関係なサイトは選ばない。
5. 取込後、Sitemaps画面に `https://hoshilu.app/sitemap.xml` が表示されることを確認する。**取込操作完了（2026-08-02）、処理結果・検出URL数は未確認**。
6. Site ExplorerまたはURL Inspectionでトップ、日英SEOページ各1件、`/privacy`、`/terms`を確認する。**未確認**。
7. 48時間程度は分析データ生成を待ち、即時掲載や順位上昇を実績として断定しない。

## 代替経路: 手動追加

Search Console取込を許可しない場合だけ使用する。

1. Bing Webmaster Toolsで `https://hoshilu.app/` を追加する。
2. 公式提示のXMLファイル、meta tag、DNS CNAMEから本人が確認方法を選ぶ。
3. 確認値、ファイル内容、APIキーをチャット、課題、販促資料、commitへ貼らない。
4. コードまたはDNS変更が必要なら、その値を伏せたまま別途実装承認を行う。
5. 所有権確認後に `https://hoshilu.app/sitemap.xml` を送信する。

## 初回確認URL

- `https://hoshilu.app/`
- `https://hoshilu.app/ja/find-product-without-name`
- `https://hoshilu.app/en/find-product-without-name`
- `https://hoshilu.app/privacy`
- `https://hoshilu.app/terms`

URL Submissionは重要ページの初回診断に限定し、同一URLの反復送信や大量送信を行わない。商品候補は確認済みの商品詳細URLを1モール1件、最大10件まで提示する現行仕様を維持し、未確認リンクを収益リンクとして送信・説明しない。

## 計測と記録

- Bing側: Search Performanceのクリック、表示、CTR、平均掲載順位、検索語、ページを集計する。
- 指名検索は `HOSHILU`、`ホシル` と表記揺れを別表にし、非指名検索と混ぜない。
- HOSHILU側: 自然検索LP到達、検索CTA、検索開始、検索完了、無料登録、再訪、モール送客を別イベントとして集計する。
- `traffic_class='QA'` は成果から除外し、Bingの集計値と個人単位で推定接続しない。
- 所有権確認日、サイトマップ送信日、最終読取日、検出URL数、エラーだけを記録し、確認値やAPIキーは記録しない。

## 現行仕様の公開前確認

- 通常検索はAmazon、楽天市場、Yahoo!ショッピング、Qoo10、SHEINの主要5モール。
- ファッション検索時のみZOZOTOWN、SHOPLIST、MUSINSA、BUYMA、SNKRDUNKを加え、最大10モール。
- HOSHILUのアフィリエイト収入は運営者個人に帰属する。
- with care、Find fun、Tomorrow's smileはITGグループ株式会社のAmazon.co.jp販売店舗であり、HOSHILUの所有主体ではない。
- AmazonがITG/privateプロフィールとの整合性を回答する前に、SP-API認証情報取得、店舗認可、本番同期を行わない。

## IndexNowの扱い

IndexNowはBing公式が案内する更新通知手段だが、キー生成、キー配置、通知実装はこの提出作業に含めない。サイトマップ取込後のクロール状況を確認し、公開コード変更として別途設計・検証する。キーを推測・生成・commitしない。

## 公式確認先

- Add and Verify site: https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b
- Sitemaps: https://www4.bing.com/webmasters/help/sitemaps-3b5cf6ed
- URL Submission: https://www.bing.com/webmasters/help/URL-Submission-62f2860b
- Getting Started Checklist: https://www4.bing.com/webmasters/help/getting-started-checklist-66a806de

外部操作はすべて本人承認後に本人が行う。サイトマップ送信、URL送信、IndexNow通知はいずれもクロール、インデックス登録、掲載順位を保証しない。
