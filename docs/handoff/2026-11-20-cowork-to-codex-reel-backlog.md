---
status: OPEN
owner: Cowork（統括）
created: 2026-11-20 JST
to: Codex（リールの組み立て・QA・承認の担当）
---

# リールの再開：11/10 の動画を投稿・過去日付の確認待ちで止めない（大隆さん承認「そうして」11/20）

## 事実
- 11/11 から止まっていた原因は使用量 API の期間（90 日超）。#822 で修正し、11/20 12:45Z に復旧。
  - `runway-auto-stop-chasing-sales-20261117` が PROCESSING（TASK_CREATED・COST_RESERVED）。
  - `runway-auto-seller-shop-entrance-20261120` は APPROVED で、その次に生成される。
- `runway-auto-want-at-price-20261110` は DRAFT（OWNER_DEFERRED）で止めてある。生成済みの動画 `runway/runway-auto-want-at-price-20261110/output.mp4` が R2 に残っている。
- `runway-auto-seller-demand-visible-20261113` は DRAFT（未生成）。今回は作らない（336 credits。大隆さんの別判断）。

## お願い
1. **11/10 の動画を投稿する**（大隆さん承認済み）。いつもの組み立て（声・画面・字幕）と自動 QA（顔・文字・音量）を通し、合格したら**次の空いている 20:15 枠**に APPROVED で入れる。
   - 投稿日を過ぎているため、`slotFromApprovedJobId` が AUTO_REEL_APPROVE_TOO_LATE で止める。過去の job を新しい枠へ付け替えられるようにしてほしい（job_id は変えない／付け替え先の枠と理由を audit に残す）。
   - QA に落ちたら投稿しない（FAILED_FINAL）。Cowork に理由を 1 行。
2. **Worker 側で、投稿日を過ぎた確認待ちが次の生成を止めないようにする**（10/20 にスクリプト側だけ直した `activePipelineBlockers` と同じ考え方を `runRunwayGenerationCycle` にも）。11/17 の動画ができて確認待ちのまま残ると、11/20 の生成が止まるため。
3. 11/17・11/20 の動画は、できたらいつもどおり組み立て → QA → 枠に入れる。

## 守ること
- 新しい有料呼び出しは 11/20 の 1 本（承認済みの APPROVED）まで。DRAFT は動かさない。
- AI 生成の明示・権利確認のフラグはそのまま。
- 結果は「Codex 記録」に、投稿した枠と external id を 1 行で。
