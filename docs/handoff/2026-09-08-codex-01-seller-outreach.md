# セラー営業メール 初回送信実績

確認時刻: 2026-09-08 10:10 JST。個人情報・宛先・本文を含まない集計だけを記録する。

## 本番D1実数

GitHub Actions `read-operations`だけを再実行し、2026-09-08 10:10:02 JST生成の
`hoshilu-operations-34170119562-2`を確認した。送信・deploy・SNSジョブは再実行していない。

| status | 件数 |
|---|---:|
| QUEUED | 5 |
| SENT | 5 |
| FAILED | 0 |
| OPTED_OUT | 0 |
| REPLIED | 0 |

- 最新の`sent_at`: 2026-09-08 09:30:14 JST。
- Resend IDが保存された`SENT`であり、5通は送信API受付済み。配送到達を意味しない。
- delivered: 未取得。理由は`RESEND_DELIVERY_EVENT_NOT_CONNECTED`。
- bounce: 未取得。理由は`RESEND_BOUNCE_EVENT_NOT_CONNECTED`。
- 接続済みGmailの2026-09-08受信をHOSHILUで検索した時点では返信メール0件。

## 既定条件の確認

- 平日09:00以上18:00未満JSTだけ送信する。
- 1日上限10通、1サイクル上限3通。
- `email_hash`に対し、過去の`SENDING / SENT / REPLIED / OPTED_OUT`と抑止表を確認し、1アドレス生涯1回を守る。
- 本文末尾へHOSHILU、運営者、問い合わせ先、ワンクリック配信停止URLを必ず付加し、List-Unsubscribeヘッダーも送る。
- 公開事業者連絡先だけを登録する方針と`source_url`列はある。ただし現在の読取成果物は、各QUEUED行の`source_url`が公開事業者ページかを証明しない。この点は送信済みと推測で同一視しない。

## Cowork確認依頼

1. Resendの一次イベントで今回の5件を照合し、`delivered / bounced / deferred`を宛先非公開の集計値で報告する。`SENT`から配信到達を推測しない。
2. HOSHILU返信先メールボックスで実返信を確認し、返信がある場合だけ対象行を`REPLIED`へ更新する。自動返信・bounceを返信数へ含めない。
3. 残るQUEUED 5件は、次回送信前に各`source_url`が公開された事業者向け連絡先であること、同一アドレスの過去送信がないことを確認する。宛先やURL自体をhandoffへ転載しない。
4. 配信停止が発生した場合は`OPTED_OUT`と抑止表の両方へ反映されたことを確認する。

初回営業は送信API受付5件をもって開始済み。ただし配送到達・反応獲得は未確認であり、成果とは扱わない。
