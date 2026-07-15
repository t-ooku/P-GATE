# Project GATE MVP 実装判断

`Project_GATE_Spec_v1`に未定義の実装詳細だけを記録する。仕様の目的・MVP境界は変更しない。

## D1 実装ソース

GitHub確認時点で`.gs`本体が存在しなかったため、`Project_GATE_Spec_v1`から再実装した。

## D2 対象100商品

- `MVP_Target`シートに有効なASINがある場合、その最大100件だけを対象にする。
- `MVP_Target`が空の場合、CSV順で最初に見つかった有効100件を対象にする。
- 入力例は100,294データ行あるため、CSV全体を`Utilities.parseCsv`へ渡さない。Drive APIのRange読込で必要行だけをメモリへ保持する。

## D3 起動方式

Google Driveにはフォルダへのファイル追加を直接購読するGASトリガーがない。MVPでは5分間隔の時間主導トリガーで`01_Input_Zip`を監視する。

## D4 Master・一意キー・Hash

- 一意キー: `tenant + SKU`。SKUが空の場合は`tenant + ASIN`。
- Hash: 正規化済み業務値を固定順でSHA-256化する。
- `登録日時`と`更新日時`は出品システム側の時刻更新だけで差分が発生する可能性があるため、Hash対象外とする。
- 同一HashはMaster無更新。変更行だけ`setValues`で更新する。
- CSVから消えた商品の削除・discontinued判定は現行仕様にないためMVPでは行わない。

## D5 Opportunity・AI Cache

- `Opportunity`は直近の正常バッチで検証を通過した対象（最大100件）へ置き換える。`Master_Database`の過去バッチや他tenantを含む全件は再採点しない。
- Profit Score: 正の利益を対象100商品の中でパーセンタイル化し0〜100点にする。利益0以下は0点。
- SEO Score: 固定費ゼロで再現可能な情報充足度とする。
  - 商品名が20〜160文字: 40点
  - メーカーあり: 20点
  - 画像あり: 20点
  - 日本または米国Amazon URLあり: 20点
- ProfitとSEOは別々に出力し、仕様未定義の合成重みは追加しない。
- SEO結果は`AI_Cache`へ365日保存し、入力Hashが同じ間は再計算しない。

## D6 個人用MicrosoftアカウントのOneDrive連携

- 個人用MicrosoftアカウントはPower Automateへのサインインで`AADSTS500200`となり、クラウドフローを利用できない。
- 固定費ゼロを維持するため、Windows上のOneDrive同期フォルダからGoogle Drive for desktopの`01_Input_Zip`へ転送する`tools/windows-bridge/`を代替経路とする。
- 転送済み判定はSHA-256でローカル管理し、同一内容を再転送しない。
- Microsoft 365の職場・学校アカウントが用意できた場合は、Power AutomateのOneDriveトリガーとGoogle Drive `Create file`へ置き換えられる。
