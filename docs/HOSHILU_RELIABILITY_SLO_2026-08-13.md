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
- `/health`の重要設定、重要アセットの取得と実装marker
- `/api/ai-chat`と`/api/knowledge`のHTTP契約・追跡ID
- 13モールRegistryとYahoo!公式ランキングAPIの有効状態
- `/api/events`からD1への匿名QAイベント書き込み経路

検索文、例外本文、visitor ID、session IDは監視SQLへ含めない。集計SLIはrequest IDも取得せず、
内部500を診断する失敗時だけ、検索文と結び付かないサーバー発行request IDを取得する。

## 検知と復旧

1. 5分ごとに外部のGitHub runnerから3回まで再検査する。
2. 1件の`search_dead_end`、または15分内で3件以上かつ20%以上の`search_degraded`を検知したら、
   単一の自動インシデントIssueを作成・更新する。
   加えて6時間で100検索以上ある場合は、縮退率1%超も品質SLO違反とする。
   30日で1000検索以上ある場合は、行き止まりとWorker 500を合わせた継続不可率0.05%超をSLO違反とする。
3. 毎時のHOSHILU統括監査は、開いている自動Issueと失敗したActionsを最優先で調査し、
   安全な範囲で修正、回帰テスト、push、デプロイ、本番確認まで行う。
4. 外形・実利用SLIが3回連続成功した後にIssueを自動closeする。
5. GitHub scheduleは開始・完了heartbeatをD1へ残す。Cloudflare cronは20分超の欠測・未完了を
   内部outboxへ永続化し、GitHub復旧後に必ずIssue化する。Cloudflare通常/deep cronもheartbeatを
   残し、GitHub側が25分超の欠測または20分超の停滞を検知する。

深層canaryは楽天・Yahoo!・AIチャット主系を15分ごと、Query Structurerを1時間ごと、
OpenAI予備系を6時間ごとに確認する。最終実行からの許容時間は順に20分、70分、390分とする。
Query Structurerの失敗は1回で検知する。全componentについて、設定・認証・モデル・価格表・予算・
usageの異常も1回で検知する。AIチャット主系を含むそれ以外の一時失敗は、異なる2回の連続失敗で
検知する。これにより一過性の5秒timeoutではIssueを開かず、継続障害は約15分で検知する。
初回配備の欠測猶予は2026-08-13 10:30 UTCまでに限定し、同時刻以降に
結果がないcomponentは`STALE`として扱う。
有料canaryはD1へ呼出し前の最大額を原子的に予約し、provider usageで実額精算する。重複slotは
再呼出しせず、UTC暦月の追加費が5米ドルを超える予約は拒否する。価格表は2026-08-13版に固定し、
2026-09-13 00:00 UTCまでに単価を再確認できなければ有料canaryを停止して即時検知する。
初回の結果が完全に空の場合だけ、欠測のまま監視を開始しないよう全componentを一度確認する。
その後は上記の固定周期を厳守する。予約後2分を超えて対応する結果がない有料probeも即時検知する。
OpenAI予備系の通常slotが一時失敗した時だけ15分後に1回確認し、2回連続ならIssue化する。
非一時エラーは確認を待たず即時検知し、すべての有料確認は同じ月5米ドル上限に含める。

## 現在の境界

- GitHubのscheduleは5分が最短だが、混雑時に遅延・取りこぼしがあり得る。D1 heartbeat/outboxで
  欠測を失わないが、GitHub自体が停止中のGitHub Issue作成は復旧後になる。
- 無効Turnstileトークンによる外形検査に加え、実AI、楽天、Yahoo!の商品検索を
  非公開Worker cronのdeep canaryで定期確認する。AI費用は月5米ドルを上限とする。
- Cloudflare内だけの監視は障害ドメインが本体と共通になるため、外部監視の代替ではない。
- Cloudflare Health Check通知、Sentry等の外部即時通知は、費用上限、通知先、
  Secretまたは権限を確認してから追加する。
- 監視cronとcanaryはCodex/ChatGPT Workを呼ばない。Codex使用量はIssue調査・実装修正時だけ発生する。
