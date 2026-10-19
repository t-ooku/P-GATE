---
status: OPEN
owner: Claude
from: Codex
created: 2026-10-20T08:09+09:00
due: 2026-10-20（既存巡回で検索品質を優先。将来実行の保証ではない）
kpi: purchase_clicks
---

# マットレス本体の固定QAにベッドフレームが混入する再発を局所修正

## 証拠と担当

- Codexは本日の既存CI #2488/run39339284217、artifact12228576335（08:06:54 JST）を読み、07:23〜25の25本命を意味判定した。自動25PASSに対してカテゴリ一致24/25、最初9件8/9。
- repository fixture `ig_mattress` の07:23:00 JST本命（AMAZON_JP）は **Best Price Mattress Twin Bed Frame 12 Soild Wood Platform Bed Frame w/CLASSIC Wo**。ブランドにMattressを含むが、商品はBed Frameでマットレス本体ではない。これは利用者の検索文ではなく、既存worker QAの固定例。
- `koala_mattress` はコアラマットレス本体、名前ペンは布用おなまえマーカーで一致。前の検索除外・名前ペン依頼はいずれもDONEであり、同じ修正を並行実装していない。本件は英語フレーム名/ブランド名による別の再発として1件だけ登録。Codexは同修正を実装しない。

## やること

1. 現行のマットレス本体候補判定・主名詞判定と固定QAの自動判定を確認し、ブランド内のMattressでBed Frame商品が通る経路を特定する。既存の本体/トッパー修正を維持する。
2. 実際の主商品が英語Bed Frame/Platform Bed Frameなら本体候補として扱わない局所修正を用意する。単にframeという語を全部禁止せず、正しいマットレス本体・日本語本体・ブランドを含む正しい本体・セット表現を区別する。
3. 今回の固定名を負例、正しい本体とブランド名を含む本体を正例にしたローカル回帰を行い、空集合回避/次候補への探索を壊さない。ユーザー検索・写真・個人情報を取得しない。有料の検索probeや固定QAの手動再実行をしない。
4. 原因・修正commit/[PATCH] Issue・既存CI結果を同じファイルへ書き戻す。既存承認範囲のコード反映を使い、料金/注意書き/SNS/営業/D1書込は行わない。CodexのKPI集計修正35f89f4とはファイルの重複を避ける。

## 完了条件

- ACKED/IN_PROGRESS→DONEまたはBLOCKEDで、修正範囲・ローカル回帰とCI/配備の証拠がある。
- 実装/配備と、次回の既存固定QAで本命が本体へ変わったかを分ける。本番の意味再判定・#369復旧判定・KPIはCodexが担当。自動25PASSだけで本番改善完了としない。
- 検索の本体候補修正は年末描画patch案より優先する。点検全体をClaudeへ戻す依頼ではない。

## 禁止・参照

SNS公開/予約/取消解除、営業送信、新記事、D1書込/移行、新課金/権限拡大、料金/規約/注意書き変更、利用者検索文/写真/個人情報/Secret取得は禁止。X停止・#616旧素材レビュー待ちを維持。大隆さんへの転送依頼なし。

- README.md
- ../2026-10-20-codex-selfcheck.md
- ../2026-10-10-codex-execution-coordination.md
- 2026-10-16-search-category-exclusions.md（DONE。重複実装せず今回の新負例を扱う）

## Claude 記録

未受領。GitHub保存だけをACKED/着手として扱わない。
