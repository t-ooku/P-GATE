# HOSHILU Web版Codex向け最終引継ぎ書

最終確認: 2026-07-29 JST

正式名称: **HOSHILU（ホシル）**

旧公開名: MYGATE

内部・互換名称: P-GATE / Project GATE

GitHub: `https://github.com/t-ooku/P-GATE`

本番: `https://hoshilu.app/`

リポジトリ名、フォルダ名、既存コード識別子は互換性維持のため一括変更しない。

## 1. 移管状態

- 作業branch: `agent/mygate-v5-itg-phase0`
- v66保存commit: `1381de308c48569194d0cfd1baa52ec57f071acb`
- Creators API実装commit: `ca090d0`
- PWA/SEO実装commit: `c263908`
- 最終commit ID: 本書更新commitをGitHubへpush後、同branchのHEADを正とする
- GitHub push: 実装2commitは完了。本書更新commitも最終手順でpushする
- 未コミット: 本書更新commit後に0件
- ahead/behind: 最終push後に`0/0`
- 同時編集禁止: **解除**
- Web版編集権: **移管済み**

当初「ローカル未コミット5ファイル」とされたv66相当変更は、作業開始時点ですでに
`1381de3 fix: keep portable product searches category-safe`としてcommit・push済みだった。
ユーザー変更を破棄する操作は行っていない。`git reset --hard`、`git checkout --`は未使用。

## 2. 保存・監査結果

- Service Workerはv66を経て、今回のPWA安全化に伴い`hoshilu-shell-v67`へ更新。
- Amazonと楽天は別々の検索語生成関数を使用。
  - Amazon: `buildAmazonSearchKeywords`
  - 楽天: `buildRakutenSearchKeywords`
- Amazon候補にはパティオ傘、固定式大型傘、傘用品、ゴルフ傘・ゴルフ用品の除外を適用。
- 楽天にはAmazon専用の英語変換・除外ルールを適用していない。
- Amazonの`detailPageURL`はパラメータを含め変更せず保持。
- 差分にSecret実値、認証情報、個人情報、一時ファイル、再生成物、文字化けは認められなかった。
- Service Workerは成功レスポンスだけを保存し、`/api/`、`/seller`、`/go`は引き続きキャッシュしない。

## 3. Amazon Creators API

コード実装: **完了**

Secret設定: **未設定**

実装済み:

- 日本Marketplace `www.amazon.co.jp`
- Catalog API `https://creatorsapi.amazon/catalog/v1/searchItems`
- Credential v2.3/v3.3のみ許可。不正値・未指定は設定エラー
- v2.3 token URLとscope `creatorsapi/default`
- v3.3日本token URLとscope `creatorsapi::default`
- `ja_JP`、`JPY`
- OAuth token再利用、期限切れ60秒前更新
- 401時のtoken破棄と1回限定再認証
- 429/5xxの回数制限付き指数バックオフ、`Retry-After`尊重
- HTTP 200内の`errors`検出
- `offersV2.listings.availability`と`price`取得
- 不明在庫を1として捏造しない
- Offers付き商品レスポンスを最大1時間キャッシュ
- Amazon URL保持、Amazon専用検索語、カテゴリ除外、既存フォールバック維持

Cloudflare Secret名確認では次が未設定:

- `AMAZON_CREATORS_CREDENTIAL_ID`
- `AMAZON_CREATORS_CREDENTIAL_SECRET`

認証情報は推測・生成していない。未設定時の本番`/health`は
`amazon_creators_configured: false`で、既存カタログ・モール検索リンクへ安全にフォールバックする。

## 4. API・同期状態

- 楽天Marketplace API: **設定済み・正常**
- Amazon Creators API: **コード完了、Secret未設定**
- SP-API: **未設定、接続tenant 0件**
- 未充足需要同期: **Secret未設定**
- D1: MYWATCH通知、輸入制限Knowledge、SP-API用tableを確認済み
- GAS、PWA、LINE、MYWATCH: `/health`正常

Secret実値はGitHub、ログ、本書へ記載していない。

## 5. テスト

2026-07-29の最終`npm.cmd test`:

| 区分 | 合格 |
|---|---:|
| root/GAS | 61 |
| release | 4 |
| Worker | 194 |
| Chrome拡張 | 6 |
| 合計 | **265** |

失敗0、skip 0。Workerは既存186件を維持し、Creators API必須7件とSEO確認を含む194件が合格。

確認対象:

- Credential Version必須・不正値拒否
- 日本円価格・在庫状態
- v3.3日本認証URL・Bearer
- 401後の1回限定再取得
- 429・Retry-After
- OAuth token・商品cache再利用
- HTTP 200部分エラー
- Amazon/楽天検索語分離
- パティオ傘・ゴルフ用品除外と通常候補保持
- Creators API失敗時フォールバック
- Amazon URLパラメータ保持
- Secret非公開
- v67 Service Worker、SEOメタ情報

Cloudflare dry-runも54資産、D1 binding、Worker bindingを含め成功。

## 6. 本番

- release: `1.15.0`
- Cloudflare Version ID: `eafab4fc-fe4d-4bae-bd69-4c70ca0837b0`
- PWA cache: `hoshilu-shell-v67`
- `/health`: `ok: true`
- `missing: []`
- `weak: []`
- `amazon_creators_configured: false`
- `rakuten_marketplace_configured: true`
- `sp_api_configured_tenant_count: 0`
- `unmet_demand_sync_configured: false`

本番スモーク:

- `/health` 200・正常
- Service Worker v67、成功レスポンスのみcache
- privacy/terms canonical・description反映
- login/seller-login `noindex,nofollow`反映
- 楽天/Amazon検索語分離、パティオ傘・ゴルフ用品除外、通常候補保持は本番相当コードの統合テストで確認
- Creators API Secret未設定時の安全なフォールバックを`/health`とテストで確認

## 7. Web版が編集可能な範囲

同時編集禁止は解除済み。Web版はこのbranchの全tracked fileを編集可能。
開始時に必ずremote HEADと本書を読み、最新branchから作業する。

主な継続対象:

- `tools/line-worker/src/amazon-creators-api.mjs`
- `tools/line-worker/src/index.mjs`
- `tools/line-worker/src/knowledge-search.mjs`
- `tools/line-worker/public/**`
- `tools/line-worker/test/**`
- `docs/**`

## 8. 人間操作が必要な項目

1. Amazon管理画面でCreators API契約・権限を確認する。
2. Credential Versionを2.3または3.3から選び、対応するID/SecretをCloudflare Worker Secretsへ入力する。
3. SP-APIを使う場合は3tenant分の契約・認証情報をCloudflare Secretsへ設定する。
4. 未充足需要同期を有効化する場合は専用SecretをCloudflare Secretsへ設定する。

Secret実値をチャット、GitHub、文書、ログへ貼らない。

## 9. 次の作業

Web版は最初にGitHub Actionsと本番`/health`を再確認する。その後、Amazon Creators APIの
管理画面設定が用意できた時点でSecret名だけのreadiness確認、実検索スモーク、価格・在庫・
URL保持の本番確認を行う。Secret未設定の間はフォールバック状態を維持する。

## 10. Web版開始プロンプト

```text
HOSHILU（ホシル）のWeb版作業を開始してください。
GitHub t-ooku/P-GATE の branch agent/mygate-v5-itg-phase0 を最新化し、
docs/HOSHILU_OVERNIGHT_HANDOFF_2026-07-26.md と本番 https://hoshilu.app/health
を最初に確認してください。正式名称はHOSHILU、MYGATEは旧公開名、
P-GATE/Project GATEは内部・互換名称です。既存識別子は一括変更しないでください。
デスクトップとの同時編集禁止は解除済みです。
```
