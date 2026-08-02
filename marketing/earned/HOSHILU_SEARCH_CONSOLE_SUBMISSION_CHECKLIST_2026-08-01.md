# HOSHILU Search Console申請手順（提出済み・登録確認待ち）

状態: `SUBMITTED_OWNER_CONFIRMED`
確認日: 2026-08-02
本人操作: `hoshilu.app` 所有権確認と `sitemap.xml` 送信を完了（確認値・ID値は保存しない）

## 事前確認済み

- `https://hoshilu.app/robots.txt`: 2026-08-02にHTTP 200。`/api/`のみクロール除外し、サイトマップURLを記載。
- `https://hoshilu.app/sitemap.xml`: 2026-08-02にHTTP 200。トップ、日英6テーマ（12 URL）、法的ページを収録。
- SEOページはcanonical、日英hreflang、`x-default`を持つ。
- 法的ページのcanonicalはリダイレクト後の `https://hoshilu.app/privacy` と `https://hoshilu.app/terms`。

## 本人操作

1. HOSHILU所有者本人のGoogleアカウントで、Search Consoleにドメインプロパティ `hoshilu.app` を追加。ITGの3販売店舗やSP-API認可とは分離する。**完了（2026-08-02）**。
2. 指示されたDNS TXT値をCloudflareへ設定。値をリポジトリやチャットへ貼らない。
3. 所有権確認後、サイトマップに `https://hoshilu.app/sitemap.xml` を送信。**完了（2026-08-02）**。
4. URL検査でトップ、日英SEOページ各1件、`/privacy`、`/terms`をライブテスト。**未確認**。
5. Page indexing、HTTPS、Core Web Vitals、構造化データのエラーを記録。
6. 週次で検索パフォーマンスをエクスポートし、指名クエリ（`HOSHILU`、`ホシル`）と非指名クエリを分離。HOSHILU内の匿名イベントと利用者単位で推定接続しない。

## 送信後の記録

- 所有権確認日、サイトマップ送信日、最終読み取り日時、検出URL数を記録する。DNS TXT値そのものは記録しない。
- インデックス登録済み、クロール済み未登録、検出済み未登録、エラーを分ける。
- 自然検索クリック、指名検索クリック、LP到達、CTA、実検索開始・完了、無料登録、再訪、モール送客を別指標として扱う。
- HOSHILU内イベントは `traffic_class <> 'QA'` だけを実績にし、QAは検証表へ分離する。

Google公式では、サイトマップ送信にはプロパティの所有者権限が必要で、送信後もクロール・インデックス登録は保証されない。申請後に順位や掲載を断定しない。

公式手順: https://support.google.com/webmasters/answer/7451001
