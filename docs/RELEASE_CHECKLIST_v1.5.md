# Project GATE v1.5 反映チェックリスト

## 完了済み

- [x] 日本語質問解析
- [x] 最大3候補と根拠出力
- [x] 根拠不足時の回答拒否
- [x] 利益非優先
- [x] tenant分離
- [x] 質問本文の非保存
- [x] 契約ポリシー接続
- [x] 全ローカルテスト PASS

## PCでの反映

- [ ] `dist/Project_GATE_Complete_v1.5.gs`をApps Scriptへ全置換
- [ ] `setupProjectGate()`を1回実行
- [ ] `Knowledge_Query_Log`の作成を確認
- [ ] Configの`SYSTEM_VERSION=1.5.0`を確認
- [ ] GitHubへv1.5ソースを保存
- [ ] GitHub Actions `validate`が緑色になることを確認

既存100商品取込テストの再実施は不要。
