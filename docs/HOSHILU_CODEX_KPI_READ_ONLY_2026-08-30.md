# HOSHILU Codex用・読み取り専用KPI連携

## 目的

Codexが本番KPIの実数を確認し、個人情報や検索本文へアクセスせずに改善優先順位を判断できるようにする。

## 取得経路

- `ci.yml` は `feature/ui-search-v2` の本番deploy後にKPI snapshotを作成する。
- `production-monitor.yml` は毎時1回、同じsnapshotを更新する。
- GitHub Actions artifact名は `hoshilu-codex-kpi-<run_id>`、保存期間は7日。
- artifact内のファイルは `hoshilu-codex-kpi-snapshot.json` または `codex-kpi-snapshot.json`。
- 新しい公開API、管理画面共通secret、D1書き込み権限は追加しない。

ローカルまたはGitHub Actions内での実行方法:

```bash
cd tools/line-worker
npm run read:codex-kpi -- --output codex-kpi-snapshot.json
```

このコマンドは既存の `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を利用する。SQL adapterは`SELECT`/`WITH`以外、複文、更新系キーワードを拒否する。

## Privacy contract

snapshotは `hoshilu.codex-kpi.aggregate.v1` 固定で、次だけを含む。

- 7日・30日の訪問、検索、検索成功、商品発見、比較、モール送客、継続検索、登録の集計値と率
- 固定区分ごとの検索入力形式の集計
- X・Instagram・TikTok別のキュー状態件数と7日ファネル集計
- 年間匿名ユニーク訪問者100万人目標の実数・残数・進捗
- 固定コードによる改善優先順位と、その根拠となる集計値

次はartifact・ログへ出力しない。

- visitor ID、session ID、member ID、メールアドレス
- 検索本文、AI入力・出力、履歴
- 投稿本文、投稿ID、公開URL、エラー本文
- 任意のsource、medium、campaign、content、UTM値
- 認証token、secret、request header

## 改善サイクル

1. 最新の成功した `production-monitor.yml` を確認し、最新artifactを読む。
2. `privacy.scope=AGGREGATE_ONLY` とschema versionを検証する。
3. `improvement_priority` を確認する。
   - `HOLD/MEASUREMENT_COVERAGE`: 匿名計測率90%以上になるまで率による判断をしない。
   - `HOLD/SAMPLE_GATHERING`: 7日検索セッション20件以上になるまで大幅変更をしない。
   - `ACTION/*`: 最大離脱地点を1つだけ改善対象にする。
4. 安全な再現テストを先に追加し、必要最小限の変更だけを実装する。
5. 全回帰、CI、本番health、重要asset、実動線を確認する。
6. 十分な新規サンプルが蓄積した後、直前期間と再比較する。悪化した場合は原因を確認し、推測で変更を重ねない。

KPI snapshotが欠落・`UNAVAILABLE`・古い場合は実数を推測しない。CI deploy時または毎時snapshotの復旧を先に行う。
