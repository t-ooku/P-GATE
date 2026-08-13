# HOSHILU 障害時の自動改善・完了報告ポリシー

HOSHILUで再現可能な不具合または本番障害を確認した場合、追加の「改善して」という指示を待たず、既に許可された作業範囲内で次を一続きに実施する。

1. 利用者の入力本文をログへ残さず、追跡ID・HTTP状態・失敗段階で原因を特定する。
2. 影響を限定した安全な修正を実装する。一時障害には自動再試行と、利用を継続できる縮退表示を用意する。
3. 回帰テストと関連テストを実行する。
4. 変更をコミット、push、本番デプロイする。
5. 本番URL・ヘルスチェック・配信アセットを確認する。
6. 原因、修正、テスト、本番反映、残る制約をまとめて完了報告する。

認証情報の追加、破壊的変更、課金・外部契約、権限拡大など新しい承認が必要な場合だけ停止し、必要事項を具体的に確認する。

## ユーザー報告を待たない検知

- `feature/ui-search-v2` の本番デプロイ後、GitHub Actionsは
  `tools/line-worker/scripts/check-production-health.mjs` を実行する。
- 監視対象は `/health`、Turnstile・AI・楽天・Yahoo!の設定状態、HTMLが参照する
  重要アセットの実配信、AI検索のタイムアウト／縮退実装、13モールRegistry、
  Yahoo!公式ランキングの有効状態、`/api/ai-chat` と `/api/knowledge` の追跡IDである。
- 検査は検索本文や認証情報を保存せず、外部AI・商品APIを消費しない入力検証だけで
  重要APIの到達性と追跡IDを確認する。
- 本番検査が失敗したデプロイはGitHub Actions上で失敗として残し、定期監視から
  原因調査・安全な修正・回帰テスト・再デプロイ・実配信確認へつなげる。
- 正常時は利用者へ操作や報告を要求しない。新しいSecret、課金、契約、権限拡大、
  破壊的なD1変更が必要な場合だけ具体的な操作を依頼する。

## 常時監視（2026-08-13追加）

- GitHubの既定ブランチ`main`に置いた`production-monitor.yml`を5分ごとに実行し、
  実装正本である`feature/ui-search-v2`を明示的にcheckoutして検査する。
- 定期外形監視は、本番HTMLが現在参照している`app.js`、`ai-search-ui.mjs`、
  `growth-analytics.mjs`に加え、横レコメンド、Gmail共有、SEARCH AGENT折返しを担う3つのCSSを
  取得し、検索タイムアウト・縮退・匿名監視・モバイルUIの実装markerを確認する。
  deploy直後の検査だけは、commit内の期待versionと本番を完全一致させる。
- `/api/ai-chat`は固定の無効Turnstileトークンで`siteverify`到達まで確認し、
  `/api/knowledge`は入力検証と追跡IDを確認する。この外形検査自体は課金APIを呼ばない。
- `/api/events`へ検索文・visitor ID・session IDを持たないQAイベントを1件送り、
  監視テレメトリのD1書き込み経路も確認する。QAは実利用SLIから除外する。
- D1から直近15分の匿名集計だけを取得する。
  検索文、visitor ID、session IDはSELECTも出力もしない。`search_dead_end`が1件あれば異常、縮退が3件以上かつ20%以上なら
  品質劣化として扱う。
  6時間で100検索以上ある場合は、縮退率1%超も品質SLO違反とする。
- 異常時は同名のGitHub Issueを1件だけ自動作成・更新する。3回連続成功後に復旧記録を
  追加して自動closeし、Issueを乱立させない。
- Worker Logsを10%サンプリングで明示的に有効化し、追跡IDと失敗コードで原因調査できる状態を保つ。
  ログに検索本文を出さない方針は維持する。
- `/api/ai-chat`と`/api/knowledge`のHTTP 500は、公開イベントAPIから偽造できない内部イベントとして、
  サーバー発行request IDと許可されたエラーコードだけをD1へ記録する。
  AIチャットと通常検索の失敗段階は区別するが、検索文・会話本文・例外本文は保存しない。
  1件でインシデント化する。
  このD1記録はWorkers Logsのサンプリングに依存しない。2026-08-13の元障害より前の内部コードは
  遡及取得できないが、以後の同種500はrequest ID・失敗component・安全なコードを、ログsamplingに
  依存せず全件D1記録へ送る。D1自体が失敗した場合だけは永続記録が欠測し得る。
- HTTP 200へ安全に縮退した実リクエストも、内部`search_provider_degraded`として監視する。
  公開`/api/events`のallowlistには追加せず、保存するのはAIチャット／Query Structurerを区別する
  component、GEMINI/ALLの固定provider、固定allowlistのコード、サーバー発行request ID、時刻だけとする。
  検索文、会話本文、外部応答、例外本文、visitor ID、session IDは保存しない。
  直近15分について5分監視が評価し、AIチャットの全provider縮退、またはGeminiがなく利用可能な
  Query Structurer providerも失敗したall縮退は1件で即時Issue化する。Gemini主系のtimeout・429・
  upstream 5xx・network・invalid JSONはcomponent別の異なる実request ID 2件でIssue化し、同一requestの
  重複は数えない。設定・認証・リクエスト拒否など非一時の主系障害は1件で即時Issue化する。
  記録は`ctx.waitUntil`でユーザーレスポンスを塞がず、既存のSLI失敗／単一Issue lifecycleへ接続する。
  D1書き込み自体が失敗した場合は欠測し得るため、深層canaryと外形監視を併用する。
- Cloudflare Workerの非公開cronから深層canaryを実行する。楽天・Yahoo!は15分ごと、
  Query Structurer・AIチャット主系は1時間ごと、OpenAI予備系は6時間ごとに固定合成条件で確認する。
  公開APIにTurnstile回避口は作らず、外部レスポンス、固定検索語、商品情報は保存しない。
  結果行へ保存するのはcomponent、PASS/FAIL、安全なエラーコード、実行時刻だけである。
  別の予算行には最大予約額またはusageから計算した実額だけを保存し、検索語や外部応答は保存しない。
- AI呼び出しは固定promptのbyte上限、出力token上限、固定頻度を併用する。有料呼び出し直前に
  D1へ最大想定額を原子的に予約し、成功時だけproviderのusage（Geminiは候補＋思考token、
  OpenAIはreasoning込みoutput token）から計算した実額へ精算する。timeout・usage欠落・精算失敗時は
  最大予約額を保持する。重複slotは再課金せず、UTC暦月の追加費用合計が5米ドルを超える予約は
  `CANARY_MONTHLY_BUDGET_LIMIT`で停止して監視へ通知する。価格表は`2026-08-13`版だけを許可し、
  `2026-09-13 00:00 UTC`までに再確認されなければ有料canaryを自動停止する。
  楽天・Yahoo!のcatalog到達canaryは継続するが、各APIの利用条件・上限は継続監査対象とする。
  結果が完全に空の初回だけ全componentを一度確認する。通常は固定周期を守り、Query Structurer・
  AIチャット主系・OpenAI予備系の一時失敗時だけ後続の15分offsetで1回に限って回復確認probeを行う。
- 5分監視はcomponent別の欠測・古さと失敗を確認する。楽天・Yahoo!は20分、Query Structurer・
  AIチャット主系は70分、OpenAI予備系は390分を超えて結果がなければ異常とする。
  Query Structurerはすべての失敗を1回で検知する。全componentの設定・認証・モデル・価格表・
  予算・usage異常も1回で検知し、AIチャット主系を含むその他の一時失敗だけは異なる2回の連続失敗で
  同じ自動Issueへ接続する。初回配備時の欠測猶予は2026-08-13 10:30 UTCまでに限定し、
  同時刻以降の欠測は`STALE`とする。回復時は既存の3回連続成功規則で閉じる。
  有料probeの予約から2分を超えて対応する結果がない場合も、Worker中断として即時検知する。
- Query Structurer、AIチャット主系、OpenAI予備系の通常`:07` slotが一時エラーで失敗した場合だけ、
  後続の`:22`、`:37`、`:52`のうち最初に実行できたoffsetで1回だけ確認probeを行う。
  AIチャット主系とOpenAI予備系は確認も失敗した時に異なる2回の連続失敗としてIssue化する。
  Query Structurerは初回失敗を即時Issue化する。設定・認証・モデル・価格・予算などの非一時エラーは
  確認を待たず即時検知する。すべてのprobeは同じ原子予算予約と月5米ドル上限を通り、無限再試行はしない。
  AIチャット主系の一時障害は最初のcanary失敗から約15分で確認するが、障害発生が毎時slotの直後なら
  最初の失敗検知まで最大約1時間を要する。ユーザー経路はその間もOpenAIまたは通常検索へ縮退する。
- GitHubのschedule開始・完了を、既存のCloudflare D1へ固定IDの内部heartbeatとして保存する。
  Cloudflareの既存15分cronが20分超の欠測または未完了を検知し、`reliability_incident` outboxへ
  PENDINGで保持する。GitHubが回復した次の実行は、最新状態がPASSへ戻っていても未処理outboxを
  必ず同じ自動Issueへ記録し、Issue作成・更新に成功した後だけACKする。
- 逆方向にはCloudflare通常cronとdeep-canary cronも開始・完了heartbeatをD1へ保存し、GitHub監視が
  25分超の欠測または20分超の実行停滞を検知する。これによりGitHubとCloudflareは相互監視する。
  heartbeat/outbox event typeは公開`/api/events`の許可リストへ追加しない。
- 深層canaryから自動Issueへ渡す診断もcomponentと列挙済みの安全なエラーコードに限定する。
  利用者や固定canaryの検索文、外部レスポンス、商品情報、認証情報はIssueへ出力しない。
- GitHub scheduleは遅延または取りこぼし得るため、これだけを完全な保証とは扱わない。
  遅延・欠落そのものは上記のCloudflare heartbeat監視へ残し、GitHub復旧後に遡及Issue化する。
  Cloudflare Health Checksや別の外部即時通知の追加に課金・Secret・権限が必要な場合は、
  費用と操作を示して承認を得る。
- 5分GitHub監視、D1集計、Cloudflare heartbeatはCodex/ChatGPT Workを実行しないため、
  Codexクレジットを消費しない。Codexは自動Issueの調査・修正が必要な時だけ使用する。
