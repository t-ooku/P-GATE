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
