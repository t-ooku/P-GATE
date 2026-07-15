# Project GATE v1.2 反映チェックリスト

## 反映前

- [x] ローカル回帰テスト15件 PASS
- [x] GAS結合版の構文確認 PASS
- [x] manifest JSON確認 PASS
- [x] 配布ZIPを別フォルダへ展開し、再テスト PASS

## PCで行う反映

- [ ] `dist/Project_GATE_Complete_v1.2.gs`をApps Scriptの`コード.gs`へ全置換して保存
- [ ] Configシートの`SYSTEM_VERSION`を`1.2.0`へ変更
- [ ] `runProjectGate`を1回実行し、実行完了を確認
- [ ] 展開した`Project_GATE_MVP_Source_v1.2.zip`の内容をGitHub `t-ooku/P-GATE`へ保存
- [ ] GitHub Actions `validate`が緑色になることを確認

## 次の通常取込で確認

- [ ] Import_Logの最新行が`SUCCESS`
- [ ] 100件が正常処理される
- [ ] 同じ業務値なら`Inserted=0 / Updated=0 / Unchanged=100`

## v1.2後に残す実環境試験

- [ ] `itg`と`mc2`の実ZIPを各1件処理
- [ ] 1商品の業務値だけを変更し`Updated=1`を確認
- [ ] CSVなし、または破損ZIPが`04_Error`へ移動することを確認

この3件は本番データ・Google Drive操作が必要なため、PC利用時に実施する。
