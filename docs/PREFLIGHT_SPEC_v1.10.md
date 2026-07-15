# 公開前チェック仕様 v1.10

## 目的

GAS、PWA、LINE、商品コードを公開する前に、設定漏れや危険な競合を1画面で確認する。Secretの実値は表示・保存しない。

## 実行

スプレッドシートを再読み込みし、「Project GATE → 公開前チェック」を押す。結果は`System_Health`へ上書きする。

## 判定

| Status | 意味 |
|---|---|
| PASS | 現在のコードで確認できる要件を満たす |
| WARN | 任意チャネルが未設定、または公開目安未達。既存取込は継続可能 |
| FAIL | 正式公開または正しい処理を妨げるため修正が必要 |

WARNだけなら`ready=true`、FAILが1件でもあれば`ready=false`とする。

## 確認項目

- Config必須値
- `SYSTEM_VERSION`が実装版と一致
- 必須シート
- `runProjectGate`トリガーが0、1、複数のいずれか
- GAS Web App URL
- PWA用Script Propertiesの設定有無
- LINE用Script Propertiesの設定有無
- 承認済み多言語検索別名
- 承認済みJAN／EAN／UPCが公開目安100件へ到達したか
- `Identifier_Conflicts`が0件か
- `Client_Contracts`に契約があるか

## Secret保護

Script Propertiesは値を取得して存在だけを判定する。`System_Health`、戻り値、ログ、エラーへ実値を含めない。表示は「設定済み」「未設定」だけとする。

## 制限

- Cloudflare、Turnstile、LINE側のSecret一致まではGAS単独で確認できない。
- Web App URLが取得できてもアクセス権限が正しいことは実通信で確認する。
- PASSは外部サービスの実機受入試験を代替しない。
