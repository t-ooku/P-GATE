# HOSHILU Search Console申請手順（未申請）

## 事前確認済み

- `https://hoshilu.app/robots.txt`: 2026-08-01にHTTP 200。`/api/`のみクロール除外し、サイトマップURLを記載。
- `https://hoshilu.app/sitemap.xml`: 2026-08-01にHTTP 200。トップ、日英SEOページ、法的ページを収録。
- SEOページはcanonicalと日英hreflangを持つ。

## 本人操作

1. Search Consoleでドメインプロパティ `hoshilu.app` を追加。
2. 指示されたDNS TXT値をCloudflareへ設定。値をリポジトリやチャットへ貼らない。
3. 所有権確認後、サイトマップに `https://hoshilu.app/sitemap.xml` を送信。
4. URL検査でトップと日英SEOページ各1件をライブテスト。
5. Page indexing、HTTPS、Core Web Vitals、構造化データのエラーを記録。
6. 週次で検索パフォーマンスをエクスポートし、指名クエリと非指名クエリを分離。

Google公式では、サイトマップ送信にはプロパティの所有者権限が必要で、送信後もクロール・インデックス登録は保証されない。申請後に順位や掲載を断定しない。

公式手順: https://support.google.com/webmasters/answer/7451001
