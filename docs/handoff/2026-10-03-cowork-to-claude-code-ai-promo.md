# Cowork → Claude Code 依頼｜AI販促担当（2026-10-03）

発行: Cowork（Claude）。根拠: `2026-10-03-cowork-ai-promo-operations-instructions.md` §7。
Cowork は管理 API に届かない環境で動いているため、API・DB を触る確認はここで依頼する。
結果は `2026-10-02-claude-code-ai-promo-progress.md` に追記し、本ファイルの各項目に「済」と日時を書いてください。

## 0. 状況（Cowork 確認 2026-10-04 第5版）

- §1〜§8 はすべて **済**（Claude Code、2026-10-03 13:31〜14:15 JST）。ありがとうございます。
- 重複確認が6件とも「なし」だったので、案内メール6通は大隆さんが送信する。
- §9・§10・付録（案内6通の送信と送信記録）も **済**（2026-10-03）。第5版で §11（相談フォームのプラン欄、大隆さん OK）と §12（Seller 枠の SNS 10本の扱い、決定）を追加。
- 10/4 時点: 外部店からの返信・相談 0 件、AI販促プロファイルは QA 店舗のみ。次の節目は 10/5（月）06:00 の自動作成 → 07:07 の週次記録（Cowork が読む）。

## 1〜8. 済（記録）

- §1-1 記事の通読: 寸法・素材・色・価格は一致。「（税込）」「ポリプロピレンはお手入れしやすい」に根拠なし。FAQ で語り手が「当店」と第三者・内部の言い回しで混ざる。価格表記が「1980円」「2,980円」で揺れる。→ §9 で直す
- §1-2 原価: 1.61円/週（gemini-3.6-flash 3回）
- §1-3 QA 店舗を月曜 06:00 JST に戻した（`PROFILE_SCHEDULE_SET`）
- §2 重複確認: C1〜C6 すべて「なし」（3テーブル）
- §5 外部店のログイン: `/seller-pilot`（メールの6桁コード）。返信の型は第2版に更新済み（`2026-10-03-cowork-ai-promo-reply-templates.md`）
- §6 `/for-sellers-preview` の訴求強化、§7 QA 店舗分のメール送付、§8 返信メールを根拠に相談を作る（既定 a）

## 9. 記事の品質修正（§1-1 の所見から）— 済（2026-10-03 15:45 JST、Claude Code。内容は progress）

作り直し（W40 v2、15:30 JST）の所見:
- 直った: 「（税込）」は消え、価格は 1,980円／2,980円／880円 の3桁区切りに揃った。語りは「当店」で、「お店に確認」「商品データ」は消えて「詳しくはお問い合わせください」になった。3種類とも1回で検査を通過。
- 残った: 根拠の無い評価が別の語で出た（「ポリプロピレン素材は扱いやすく」「お求めやすい設定」）。FAQ に「製品情報に記載がございません」という内部寄りの言い回しがあった → 要確認の語と禁止表現に追加済み（月曜分から効く）。
- 日本語: 「目目的」の誤字と「詳細は詳しくは」の重複があった → 同じ漢字の重複を「誤字の疑い」の注記に、「詳細は詳しくは」を禁止表現に追加済み。

外部店の初回分までに直したい。店は公開前に必ず確認するが、「根拠の無い一文」を店が見落として公開すると、店の信用を損なう。

1. **根拠の無い性質・評価の文を書かない**: 数値照合（数字）だけでなく、「お手入れしやすい」「丈夫」「軽い」のような性質の断定も、商品データ（商品名・attrs・説明文）か店の疑問に根拠がある場合だけにする。生成プロンプトに明記し、検査は「attrs に無い性質語の一覧（例: 丈夫・軽量・お手入れ簡単・抗菌・防水・耐熱）」を拾って QA_FAILED か要確認の注記に。過検出なら注記（店に見せる）で止める。
2. **「税込／税抜」は商品データにあるときだけ書く**: 無ければ価格の後ろに付けない。楽天 CSV の `販売価格` は税込が一般的だが、断定しない。
3. **語り手の統一**: 記事・FAQ はすべて「当店」の語り。「直接お店に確認してください」「商品データ上」「データにありません」のような第三者・内部の言い回しを禁止表現の一覧に入れる（FAQ で答えられないときは「詳しくはお問い合わせください」）。
4. **価格表記の統一**: 3桁区切り（`1,980円`）に正規化（生成後の整形で）。
5. テストを足し、QA 店舗で `force:true` の作り直しを1回実行して、上の4点が直ったかを所見3行で progress に。本文はリポジトリに貼らない。

## 10. 10/5（月）06:00 の自動作成の結果を記録 — 済（2026-10-03 15:00 JST、Claude Code。既定 a。`seller-promo-weekly-record.yml` が月曜 07:07 JST に `docs/handoff/<月曜の日付>-seller-promo-weekly.md` へ追記）

Cowork は管理 API に届かないので、月曜の結果はリポジトリで確認する。次のどちらかで:
- a. 月曜 07:00 JST に `seller-promo-status.yml` を自動起動（schedule）し、全店の job status・各 deliverable の status と `qa.reasons`・原価を `docs/handoff/` の週次ファイルに追記する（本文は書かない）
- b. 当面は Claude Code が月曜に手で確認し、progress に追記する

既定: a（大隆さんの作業を増やさないため）。外部店が増えても同じ仕組みで回る。

## 11. 相談フォームの「検討中のプラン」（Codex 依頼 `2026-10-04-codex-to-claude-code-seller-plan-selection.md`）— 大隆さん OK（2026-10-04）

内容はそのファイルのとおり。進めてください。優先度は「外部店からの返信が来る前」。

## 12. Seller 枠の SNS 10本（seller-aipromo-01〜10、10/5〜10/19）— 大隆さん判断（2026-10-04）

日次販促の scheduled task がインシデントとして報告した件。**(a) 10本はそのまま流し、日次タスクは該当日の Seller 枠（X/Threads 12:35）を休む**で決定。Claude Code の作業は無し（既存行に触らない）。日次タスク側の指示は Cowork が更新する。

## 13. 週次記録 workflow が 10/5 07:07 JST に動かなかった（Cowork 確認 2026-10-05 09:00 JST）

- `docs/handoff/2026-10-05-seller-promo-weekly.md` が 09:00 時点で無い。`seller-promo-weekly-record.yml` は main にもあるが、schedule run が走った形跡が無い（Codex の 10/5 selfcheck も同じ指摘）。
- Cowork は Actions の run 一覧・workflow_dispatch に届かないので、**Claude Code で (1) Actions の該当 workflow が有効か（既定ブランチでの初回 schedule は登録に時間がかかる／無効化されていないか）、(2) `workflow_dispatch` を `week_key=2026-W41` で手動実行して記録ファイルを作る、(3) 来週 10/12 07:07 に自動で動く見込みかを progress に 1 行**、をお願いします。
- 参考（Cowork が本番 D1 を直接読んだ W41 の結果。記録ファイルの代わりに残す）: `qa-shop-1` job **DONE**（06:15 JST、attempt 2、error=`IMAGE_SKIPPED_NO_R2`）。納品物: ARTICLE v1 **QA_FAILED**（`FORBIDDEN_EXPRESSION`: 「商品データ」「データに記載」「記載がござ…」= §9 で足した禁止表現が効いた）→ ARTICLE v2 QA_PASSED、SNS v1 QA_PASSED、IMPROVEMENT v1 QA_PASSED。原価 **5.47 円**（W40 は 3.24 円。作り直し 1 回分）。所見: 品質ガードは狙いどおり。v1 で落ちた語は生成プロンプト側でも避けるよう促すと原価が戻る。

## 3. 申込があったときの登録

申込が来たら `docs/handoff/YYYY-MM-DD-cowork-to-claude-code-ai-promo-store-N.md` で依頼します（ひな形は返信の型 §E）。

## 4. 気づいた点

- 別の Claude Code セッションが同じブランチで商品詳細ページを進めている。push 前に origin を取り直す運用を両セッションで。

## 付録: 案内候補の hash（記録）

| # | sha256 | 結果 |
|---|---|---|
| C1 | 4af3e2995b18a69c72db1ddf477f7318fccbb52819811ddd63ac7e561193f643 | なし |
| C2 | ea82cfdb9037fa9e62f5172d57a53c204ac20d58c7b28db64a8ed80c11d55707 | なし |
| C3 | c1073903d6cbbb44e0ce69c7e879d26f4fa1a249881846fdba73987f9ed94725 | なし |
| C4 | 292bd3e8be8ff996d2724a64c18ffd8131a185e78f38c726363b6e23b3ab33ea | なし |
| C5 | db809a042ab960dfcc8d16b18b95ce5a912e03aebcdbe12c7ec61425761718be | なし |
| C6 | 1c723ab9bcd2e94e6f21f606ff85be9f6048ff705dd3085e1bee14e7ac919ce0 | なし |

送信後、この6件を営業送信の記録表（`seller_outreach_contacts`）に「送信済み・2026-10-03・Gmail 手送信」として入れてください（「1アドレス1回」を守るため）。

→ **済（2026-10-03 18:58 JST、Claude Code）**: 大隆さんの指示で、Claude Code が Gmail から6通を送信した（18:30〜18:44 JST）。
- 送る前に宛先が C1〜C6 の hash と一致することを確かめた。
- 下書きのリンクが Google の転送用 URL（`google.com/url?q=…`）になっていたので、`https://hoshilu.app/for-sellers-preview` と `https://hoshilu.app/for-sellers` に直して送った。本文のほかの部分は変えていない。古い下書きは削除した。
- 送信後、`seller_outreach_contacts` に6行を `status=SENT`・`channel=GMAIL_MANUAL`・送信時刻・Gmail のメッセージ ID で入れた（run 37114797512）。メールアドレスと本文は入れていない（`contact_email` は空、照合は `email_hash`）。
- 自動送信（QUEUED）の対象にはなっていない。
