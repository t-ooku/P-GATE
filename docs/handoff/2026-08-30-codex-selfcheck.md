# 2026-08-30 Codex startup self-check

- `/health`: PASS。release `1.22.1`、`missing=[]`、`weak=[]`。
- 未解決Issue: [#100 `[AUTO][HOSHILU] Production reliability incident`](https://github.com/t-ooku/P-GATE/issues/100)。
- 安全コード: `DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:YAHOO:CANARY_PROVIDER_AUTH_FAILED`。
- 関連run: https://github.com/t-ooku/P-GATE/actions/runs/33307167408
- request ID: なし。
- 検索本文・個人情報は取得していない。
- 本件のKPI連携はD1を更新せず、既存tokenによる固定SELECTと集計限定artifactだけを追加する。
- Yahoo!認証異常は別途継続調査中のため、本変更では認証情報・Yahoo!実装を変更しない。
