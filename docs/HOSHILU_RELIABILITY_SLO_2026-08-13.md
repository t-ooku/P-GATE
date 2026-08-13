# HOSHILU Reliability SLO 2026-08-13

## 目標

「99%」は30日で7時間12分の停止を許すため、本番継続性の目標には使わない。

| 指標 | 月間目標 | 30日あたりの許容時間・割合 |
|---|---:|---:|
| ユーザー継続可用性 | 99.95%以上 | 行き止まり21分36秒未満 |
| 完全品質率 | 99%以上 | 縮退検索1%未満 |
| 行き止まり検索 | 0件を目標 | 1件で即時インシデント |

通常の商品結果または13モール縮退へ到達すれば「継続可能」とする。AI・商品APIが正常に
動作し、縮退せず完了した検索だけを「完全品質」とする。外部API障害を隠すのではなく、
ユーザー継続性と完全品質を別々に測る。

## SLI

- `search_completed`: 完全品質で完了した匿名検索
- `search_degraded`: 13モール縮退へ到達した匿名検索
- `search_dead_end`: 検索実行開始後75秒以内に上記いずれの終端にも到達しなかった匿名検索
- `search_backend_failed`: Workerが返したHTTP 500。内部だけが作成でき、request IDと許可済みコードのみ保存
- `search_provider_degraded`: 実リクエストでAI主系から予備系へ切替、または全provider縮退したことを
  Workerだけが記録する内部イベント。component、provider、固定allowlistのコード、request ID、時刻だけを保存
- `/health`の重要設定、重要アセットの取得と実装marker
- `/api/ai-chat`と`/api/knowledge`のHTTP契約・追跡ID
- 13モールRegistryとYahoo!公式ランキングAPIの有効状態
- `/api/events`からD1への匿名QAイベント書き込み経路

`search_provider_degraded`は公開`/api/events`のallowlistへ追加しない。検索文、会話本文、外部応答、
例外本文、visitor ID、session IDは保存せず、監視SQLへも含めない。件数集計SLIはrequest IDを取得せず、
内部500の診断とprovider縮退のdistinct判定に限り、検索文と結び付かないサーバー発行request IDを取得する。

## 検知と復旧

1. 5分ごとに外部のGitHub runnerから3回まで再検査する。
2. 1件の`search_dead_end`、または15分内で3件以上かつ20%以上の`search_degraded`を検知したら、
   単一の自動インシデントIssueを作成・更新する。
   加えて6時間で100検索以上ある場合は、縮退率1%超も品質SLO違反とする。
   30日で1000検索以上ある場合は、`search_dead_end`による継続不可率0.05%超をSLO違反とする。
   直近15分の`search_provider_degraded`は5分監視ごとに評価する。AIチャットの全provider縮退、
   またはQuery Structurerで利用可能な単一providerを失ったall縮退は1件で即時検知する。
   Gemini主系の一時失敗はcomponentごとに異なる実request IDが2件で検知し、同じrequest IDの重複行は
   1件と数える。設定・認証・リクエスト拒否など非一時の主系失敗は1件で即時検知する。
3. 毎時のHOSHILU統括監査は、開いている自動Issueと失敗したActionsを最優先で調査し、
   安全な範囲で修正、回帰テスト、push、デプロイ、本番確認まで行う。
4. 外形・実利用SLIが3回連続成功した後にIssueを自動closeする。
5. GitHub scheduleは開始・完了heartbeatをD1へ残す。Cloudflare cronは20分超の欠測・未完了を
   内部outboxへ永続化し、GitHub復旧後に必ずIssue化する。Cloudflare通常/deep cronもheartbeatを
   残し、GitHub側が25分超の欠測または20分超の停滞を検知する。

深層canaryは楽天・Yahoo!を15分ごと、Query Structurer・AIチャット主系を1時間ごと、
OpenAI予備系を6時間ごとに確認する。最終実行からの許容時間は、楽天・Yahoo!が20分、
Query Structurer・AIチャット主系が70分、OpenAI予備系が390分とする。
全componentについて、設定・認証・モデル・価格表・予算・usageなどの非一時異常は1回で検知する。
Query StructurerとAIチャット主系の一時失敗は、通常slotと1回だけの確認probeという異なる2回の
連続失敗で検知する。これにより一過性のtimeoutではIssueを開かず、
最初のcanary失敗から、後続offsetが通常どおり動けば継続障害を約15分で検知する。
障害発生が毎時canaryの直後だった場合は、最初の失敗検知まで最大約1時間を要する。
初回配備の欠測猶予は2026-08-13 10:30 UTCまでに限定し、同時刻以降に
結果がないcomponentは`STALE`として扱う。
有料canaryはD1へ呼出し前の最大額を原子的に予約し、provider usageで実額精算する。重複slotは
再呼出しせず、UTC暦月の追加費が5米ドルを超える予約は拒否する。価格表は2026-08-13版に固定し、
2026-09-13 00:00 UTCまでに単価を再確認できなければ有料canaryを停止して即時検知する。
初回の結果が完全に空の場合だけ、欠測のまま監視を開始しないよう全componentを一度確認する。
その後は上記の固定周期を厳守する。予約後2分を超えて対応する結果がない有料probeも即時検知する。
Query Structurer、AIチャット主系、OpenAI予備系の通常slotが一時失敗した時だけ、後続の
`:22`、`:37`、`:52`のうち最初に実行できたoffsetで1回確認する。Query Structurer、AIチャット主系、
OpenAI予備系はその確認も失敗した時に、異なる2回の連続失敗としてIssue化する。
全componentの非一時エラーは確認を待たず即時検知する。
すべての通常probeと確認probeは同じ月5米ドル上限に含める。

## 現在の境界

- GitHubのscheduleは5分が最短だが、混雑時に遅延・取りこぼしがあり得る。D1 heartbeat/outboxで
  欠測を失わないが、GitHub自体が停止中のGitHub Issue作成は復旧後になる。
- 無効Turnstileトークンによる外形検査に加え、実AI、楽天、Yahoo!の商品検索を
  非公開Worker cronのdeep canaryで定期確認する。AI費用は月5米ドルを上限とする。
- Cloudflare内だけの監視は障害ドメインが本体と共通になるため、外部監視の代替ではない。
- 実リクエストのprovider縮退記録は`ctx.waitUntil`でレスポンスを塞がずD1へ送る。D1書き込み自体が
  失敗した場合は欠測し得るため、深層canaryと外形監視を併用する。
- Cloudflare Health Check通知、Sentry等の外部即時通知は、費用上限、通知先、
  Secretまたは権限を確認してから追加する。
- 監視cronとcanaryはCodex/ChatGPT Workを呼ばない。Codex使用量はIssue調査・実装修正時だけ発生する。
