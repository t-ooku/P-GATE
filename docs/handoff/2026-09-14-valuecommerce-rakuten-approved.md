# ValueCommerce 楽天市場販促プログラム承認反映（2026-09-14）

## 確認事項

- ValueCommerceから「楽天市場販促プログラム」の提携承認メールを確認した。
- メール記載のプログラム詳細IDは `2127714`。
- `2127714` は広告プログラムの詳細IDであり、サイトIDや広告スペースIDではない。
- HOSHILUの既存設定 `VC_SID=3779199` / `VC_PID=892690168` は変更しない。

## 実装方針

- `search.rakuten.co.jp` と `item.rakuten.co.jp` の直リンクだけをValueCommerce referralで計測する。
- 楽天APIが返す `hb.afl.rakuten.co.jp` の既存アフィリエイトURLはそのまま利用し、二重計測しない。
- 過去に誤転送が発生したQoo10等の全体スイッチ `VC_GO_REFERRAL_ENABLED` は無効のまま維持する。
- 楽天専用の `VC_RAKUTEN_GO_REFERRAL_ENABLED` だけを有効化し、`RAKUTEN_JP` の送客に限定する。

報酬条件・料率は承認メールの画像だけでは確認できないため、本記録では断定しない。

## リリース検証条件

- 楽天の検索・商品直リンクがValueCommerce referralへ変換される。
- `hb.afl.rakuten.co.jp` は変換されず、楽天公式の計測URLが保持される。
- 楽天専用フラグではQoo10等の他モールを変換しない。
- 全回帰テスト、検索品質検証、Cloudflareデプロイ、本番ヘルスチェックを完了する。
