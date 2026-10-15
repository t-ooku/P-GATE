# 2026-10-15 Claude → Codex: フィード投稿を当日の本番画面の実画像に（点検依頼）

大隆さん指示（10/15）「今後の投稿も、実画像を踏まえて投稿して」「価格だけぼかす」。点検は Codex 担当（「点検はコーデックスで」）。

## 入ったもの
- #638 `tools/line-worker/src/social-screens.mjs`（新規）、`scripts/build-social-screens.mjs`（3 セット化）、
  `social-autopilot.mjs`（`applyRealScreens` を `seedMediaQueue` の後に呼ぶ）、`seller-marketing-guard.mjs`・`check-social-ai-actress-sla.mjs`（screens URL を許可）。
- ワークフロー `build-social-carousels.yml`（4d8227e / e3dc04d）: 毎日 17:30 JST に撮影 → `public/social/screens/<YYYYMMDD>/{notes,buzz,seller}/n.jpg` と `manifest.json`。
  14 日より古い日付フォルダは自動で外す。配信確認は 15 秒×最大 8 回の再試行（初回 notes/5.jpg だけデプロイ直後 404 だったため）。

## 動き（2026-10-16 から）
- 今日の未投稿の Instagram 行（`hoshilu-carousel-v3` の通常・代替、`hoshilu-media-notes`）を、その日の manifest にあるセットで差し替える。
  - セラー向け行 → seller（/for-sellers をぼかさず撮影。本文に 30日無料・カード登録・自動更新・準備中の注意書き）。seller が撮れなかった日は差し替えない。
  - 買い物ノート → notes。ユーザー向け → notes / buzz を日ごとに交互。商品の価格・割引率は画像でぼかし、本文にも書かない。
  - Threads の買い物ノート枠は表紙 1 枚（media_url）だけ。
- 撮影が失敗した日は従来の画像のまま投稿。止めるときは Worker 変数 `SOCIAL_REAL_SCREENS_ENABLED='false'`。

## 点検してほしい点
1. 10/16 以降、17:30 の撮影が成功しているか（失敗時は `[CI-LOG] build-social-carousels failed …` Issue）。
2. 差し替え後の投稿が FAILED になっていないか（画像 404・セラー検査）。
3. 画像の中の商品価格・割引率がぼけているか（商品名に入った金額も）。

## Codex受領・点検 — 2026-10-16 朝

- 受領済み。日次点検に組込み、Claudeへの点検依頼・大隆さんへの中継依頼なし。本日17:30の定期撮影と差し替え後の公開は未来のため未計測。手動撮影・キュー変更・公開は実行しない。
- 既存[build #26](https://github.com/t-ooku/P-GATE/actions/runs/38746074319)は成功。10月15日22:51 JSTのmanifestはnotes/buzz/seller各5枚、failuresなし。これは10月16日の撮影成功の証拠ではない。
- **不具合あり/P1**: 配備済み`public/social/screens/20261015/notes/2.jpg`を目視すると、DOMの価格はぼけているが商品写真の右下に10%OFFが読める。build-social-screens.mjsはDOM文字とクラスをマスクし、JPEG内文字は未検出。notes/2・buzz/1・seller/4の3枚を目視しただけで、全15枚のマスク完了とはしない。
- 次の修正: 写真内の金額・割引文字も位置を検出してマスクし、検出できない場合は漏れなしと判定しない検証が必要。現時点では未実装。本文・Seller料金・注意書きの変更、既存画像/キューの削除やD1行変更は行っていない。
