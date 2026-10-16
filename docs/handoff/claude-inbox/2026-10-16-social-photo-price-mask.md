---
status: DONE
owner: Claude
from: Codex（大隆さんの2026-10-16指示）
created: 2026-10-16T13:47:47+09:00
due: 2026-10-16（17:30 JST定期撮影前を優先）
kpi: purchase_clicks | seller_inquiries
---

# SNS実画像：商品写真内の価格・割引率のマスク漏れを修正

## やること
大隆さんが本日の優先事項③をClaudeへ依頼し、Codexが書き込み・結果確認を担当することを確認。既存の「実画像を使う／価格だけぼかす」方針の範囲で局所修正する。

Codexの朝の点検で `public/social/screens/20261015/notes/2.jpg` の商品写真右下に「10%OFF」が読めることを確認済み。DOM価格や商品名内の金額のマスクは、JPEGの商品写真内部まで届かない。既存manifestのfailuresなしだけでは全画像マスク完了を証明しない。

- `scripts/build-social-screens.mjs`、`src/social-screens.mjs`、既存の定期撮影・差し替え処理を調査する。
- 写真内の価格・割引文字も対象に含め、ぼかした後に読めないことを検証する。未検出を「漏れなし」と判定しない。
- 日付・セット・画像番号で対象と検証結果を記録。全15枚を確認していないのに全画像合格と報告しない。
- 同じ修正を他セッションが実施中／完了している場合は重複実装せず、CI・画像・検証の証拠を返す。

## 完了の条件
1. 商品写真内部の「10%OFF」を含む代表例を再現し、修正後に読めないことを画像で確認。
2. DOM価格・商品名内の金額も引き続き隠れる。商品写真全体や他の説明を一律に消さず、Seller LPの料金・注意書きは元方針どおりぼかさない。
3. 回帰試験と既存生成チェックを通し、既存の反映経路で配備。実装commit、CI/deploy、修正前後画像またはartifactを記録。
4. 17:30の通常撮影結果は当該runの実画像とmanifestで確認する。未実行・未配備・目視未確認はその旨を記載する。
5. Codexが最終マスク確認と公開後の確認を行う。素材修正・配備だけをSNS投稿完了とはしない。

## やってはいけないこと
新規課金、外部OCR等への新しい送信・接続、予算増額、D1の直接変更、既存公開投稿の削除、別枠の手動投稿・キュー重複投入、Seller文言・料金・注意書きの変更は今回の依頼から推定しない。制約内で実装できない場合は、試した方法と具体的な障害をBLOCKEDとして返す。

Xは停止維持。Reel #616は対象外で、旧素材の承認・再生成・公開をしない。既存の承認済み定期処理の範囲は維持する。

## 参照
- ../2026-10-15-claude-to-codex-real-screens.md
- ../2026-10-16-codex-selfcheck.md
- README.md

## Claude 記録
### 2026-10-16 14:20 JST 受領（ACKED → IN_PROGRESS）
- 受領: 定期巡回（14:13）で読んだ。branch head 31626ec。
- 担当範囲の理解: 商品写真（JPEG）内部の価格・割引率（例: notes/2.jpg の「10%OFF」）が social-screens のマスクで隠れない件。写真内文字の検出→ぼかし→読めないことの検証を、外部OCR・新規課金なしで実装し、[PATCH] で配備する。DOM 価格・商品名内金額のマスクは維持、Seller LP の料金・注意書きはぼかさない。SNS 公開・キュー変更・最終マスク確認は Codex。
- 着手: 対象コードの調査と、他セッションの同種修正の有無確認から。結果は本節に追記する。

### 2026-10-16 14:45 JST 実装・本番配備（状態: IN_PROGRESS。17:30 撮影結果の確認待ち）
- 重複確認: 14:20 時点の branch に写真内マスクの修正なし。
- 原因: build-social-screens.mjs のぼかしは DOM（価格の要素・文字列）だけ。商品写真は「そのまま」で、楽天等の画像に焼き込まれた販促帯（今回は写真右下「クーポン利用で 10%OFF」）は対象外だった。
- 試したが採用しなかった方法: 端末内 OCR（tesseract.js＋npm の学習データ、外部送信なし／OS の tesseract CLI、psm 6/11/12）を notes/2.jpg の写真部分で試行 → 「10%OFF」を1文字も読めなかった。OCR の未検出で「漏れなし」とは言えないため不採用。backdrop-filter によるぼかしも撮影ブラウザでほぼ効かず文字が読めたため不採用。
- **実装（Issue #641、commit 36d356f、apply-patch run 38855744046: git am・npm test・push・deploy・health すべて success、14:27 JST）**:
  - ユーザー向け（notes/buzz、mask 対象）の撮影で、写る商品写真（.media-drop-figure / .media-tile-figure / .buzz-home-thumb）ごとに、**写真の下側 30% に「不透明の下地＋同じ写真をぼかして拡大した複製」**を重ねる。写真の上 70% はそのまま（写真全体は消さない）。順位バッジは帯の上に残す。
  - 撮影前と撮影直前（スクロール後に読み込まれた写真も含む）の2回、「写る写真の枚数」と「下帯が効いている枚数」を数え、1枚でも外れたらそのセットは出さない（PHOTO_PRICE_NOT_MASKED）。manifest の各画像に photos / photo_band_masked を残す。
  - DOM 価格・商品名内金額のぼかし（従来）は変更なし。seller セット（mask:false、HOSHILU 自身の料金・注意書き）は従来どおりぼかさない。外部 OCR・外部送信・課金なし。
- 代表例の再現と確認（素材検証、ローカル）: notes/2.jpg から切り出した同じ商品写真を、本番の owned-media.css / buzz-home.css と同じ枠（値下がり・ランキング・バズの3種）に入れ、修正後の CSS/関数で 390px・3倍で撮影。修正前は「クーポン利用で」「10」「%OFF」が読める → 修正後は3種とも下帯の文字が読めないことを目視で確認（photos 3 / masked 3）。DOM 価格（2,980円→2,580円、-12%）も引き続きぼかされる。画像は Claude 作業環境のローカルのみ（GitHub の書き込み経路が文字のみのため未保存）。
- 回帰試験: test/social-real-screens.test.mjs に2件追加（写真枠のクラスが本番の画面に存在する／帯は下 30%・不透明・ぼかし 10px 以上・拡大／seller はぼかさない／止めが2か所・manifest 記録）。npm test 3037/3037 pass（ローカル）、本番 CI も success。
- 限界（明記）: 写真の**上側・中央に焼き込まれた価格**はこの帯では隠れない。自動検出はしていないので、「未検出＝漏れなし」ではない。Codex の目視確認は引き続き必要。
- 本番の撮影結果: **未確認（未実行）**。次の定期撮影は本日 17:30 JST（build-social-carousels.yml、branch head から実行されるので本修正を含む）。20:13 の巡回で public/social/screens/20261016/ の notes・buzz 各5枚と manifest（photos / photo_band_masked、failures）を確認して追記する。
- 投稿への影響（D1 読み取り、14:40 JST）: 本日 10/16 の Instagram カルーセル行は無い。10/17 の hoshilu-carousel-v3-instagram-2026-10-17 は seller 向け（carousel-seller-wanted-now、APPROVED）で、差し替え先は seller セット（ぼかし対象外）。notes/buzz セットが実際の投稿に使われる次の行は未確認。キュー変更・公開はしていない。
- 成果指標（D1 実測、14:40 JST）: 購入先クリック（marketplace_click、10/10 10:46 JST 以降 QA/INTERNAL 除外）2件・2人（Codex 担当範囲、参考値）。Seller 問い合わせ 累計4・10/10 以降0。有料契約 0。本修正の効果は未計測（素材の安全性の修正で、成果指標への効果はまだ出ない）。

### 2026-10-16 20:45 JST 定期巡回（状態: IN_PROGRESS → **BLOCKED**。止まっている理由は末尾）
- **撮影結果の目視（素材確認、20:14〜20:20 JST）**: 対象は branch 上の public/social/screens/20261016/（manifest captured_at 2026-10-16T11:08:44Z＝20:08 JST、commit af479db。failures なし）。17:30 JST の定期 run（cron 08:30 UTC）による 20261016 のコミットは branch 履歴に無く、最初の 20261016 は 19:07 JST（6d6298e、seller-lp 系の push で起動した run）。17:30 run の実行有無は**未確認**（Actions の一覧はこの環境から読めない）。
  - manifest: notes 5枚・buzz 5枚とも photos = photo_band_masked（例 notes/2 24/24、buzz/3 116/116）。seller 5枚は photos 0（ぼかし対象外、従来どおり）。
  - 目視（notes 1〜5、buzz 1〜5 の10枚。notes/5 と buzz/5 は同一画像）: 写真下帯は全写真でぼかし済み。notes/2 のプロテイン写真下帯、notes/3 の写真下帯・商品名内「最大◯%OFF」もぼかし済み。**漏れ1件: buzz/3.jpg（靴・スニーカー）2位 crocs の写真左上に「50%OFF」「3,850円」「~10/17 9:59迄」が読める**（下帯の外＝上側に焼き込み。14:45 に書いた限界がそのまま出た）。他の9枚では価格・割引率の数字は読めなかった（目視。読めなかった＝漏れなしの証明ではない）。商品名の「半額セール」（buzz/3 2位）は金額・%ではないので現行ルールではぼかしていない（判断は Codex／方針側）。seller 5枚は目視していない（ぼかし対象外のため）。
  - 投稿への影響（D1 読み取り 20:20 JST）: 本日の hoshilu-carousel-v3-fallback-instagram-2026-10-16 は seller-screens（seller セット）で **PUBLISHED 20:17:39 JST、external_post_id 18038997128646714**（buzz/notes は使われていない）。10/17 Instagram は carousel-seller-wanted-now・APPROVED（seller 向け）。notes/buzz が実際に使われる次の行は **10/19 20:00 JST の hoshilu-carousel-v3-instagram-2026-10-19（carousel-user-usual-refill、ユーザー向け）**＝当日の撮影で差し替わる見込み。キュー変更・公開はしていない。
- **実装・本番配備: Issue #654（commit f4e649e、apply-patch: git am・npm test・push・deploy・health すべて success、20:36 JST）**
  - 撮影直前の画面（撮影範囲そのもの、3倍）を**端末内の tesseract（OS パッケージ、eng、外部送信・課金なし）**で読み、「OFF」「¥/円付きの数字」「3,850 のような3桁区切りの数字」が**写真の上に載っている写真だけ**を写真全体ぼかしに切り替える（下帯ぼかしは全写真のまま。写真を一律に消さない）。2回目の読み取りでまだ残れば、そのセットは出さない（PHOTO_PRICE_OCR_REMAINS）。順位バッジの読み違い（30位→304%）や日付・号数・容量は数えない。manifest の各画像に photo_ocr（tesseract / unavailable / skipped）と photo_full_blur（全体ぼかしにした写真の数）を残す。
  - 素材検証（ローカル、本番と同じ capture 関数）: buzz/3 の crocs・スニーカー、buzz/2 の THE NORTH FACE の写真を同じ枠に入れて撮影 → OCR が crocs の「OFF」を写真内として検出し、**crocs の写真だけ全体ぼかし、他2枚は上側そのまま**、日付「2026.10.16 号 10/17 9:59」は対象外のまま、を目視で確認（photos 3 / masked 3 / full 1）。
  - 回帰試験 1件追加（拾う語・拾わない語、写真位置との対応、全体ぼかしは読めた写真だけ、OCR 必須時の止め、外部 OCR の URL が無いこと）。npm test 3043/3043 pass（ローカル）、apply-patch でも success。
  - 先に出した Issue #652（同内容＋workflow 変更）は git am 成功・**push failure** でクローズ。workflow ファイル（.github/workflows/）を GITHUB_TOKEN で push できないためと判断（同時刻の他 push との競合の可能性も残る。run のログはこの環境から読めず未確認）。
- **本番の撮影結果: 未確認**。#654 の push は build-social-screens.mjs の変更なので撮影 run が起動する見込みだが、20:44 JST 時点で新しい 20261016 manifest のコミットは未着。しかも CI に tesseract が入っていないため、その run の photo_ocr は unavailable になり、**OCR の層は本番の撮影ではまだ効かない**（下帯ぼかしだけの従来状態）。
- **止まっている理由（BLOCKED、大隆さんの承認事項ではない）**: CI の撮影で OCR を効かせるには `.github/workflows/build-social-carousels.yml` の2行変更が必要で、Claude の経路（[PATCH] Issue の GITHUB_TOKEN）では workflow ファイルを push できない。push 権限のある Codex（または workflows 権限のあるセッション）に次の2行をお願いしたい:
  1. `sudo apt-get install -y -qq fonts-noto-cjk python3-pil` → 末尾に ` tesseract-ocr` を追加
  2. `node scripts/build-social-screens.mjs "$out" --base https://hoshilu.app` → 先頭に `SOCIAL_SCREENS_REQUIRE_OCR=1 ` を付ける（OCR が無ければ notes/buzz を出さず、従来画像のまま投稿＝漏れ側に倒さない）
  - 期限の目安: 10/19 20:00 JST のユーザー向け Instagram（notes/buzz に差し替わる行）より前。間に合わない場合、10/19 の差し替え画像は Codex の目視確認で判断してください（Claude はキューを変えない）。
  - 反映後の確認は Claude が次の巡回で manifest の photo_ocr=tesseract・photo_full_blur と画像の目視で行う。
- 成果指標（D1 実測、20:20 JST、10/10 10:46 JST 以降・QA 除外）: 購入先クリック（marketplace_click）2件（Codex 担当範囲、参考値。最新 10/16 11:56 JST）。Seller 問い合わせ 累計4・10/10 以降0。有料契約 0（seller_billing_accounts 3件、Stripe サブスクあり0）。本件は素材の安全性の修正で、成果指標への効果は未計測。

## Codex 確認
2026-10-17朝: ACKED/IN_PROGRESS→BLOCKED、#641/#654の実装配備を確認。最新20261017 manifestでもphoto_ocr=unavailableで、BLOCKEDは実態と一致。Codexが不足していたworkflowのtesseract導入・SOCIAL_SCREENS_REQUIRE_OCR=1を準備し、既存反映経路で進める。画像の最終確認はCodexが担当し、Claudeへ点検を丸投げしない。受信箱statusは確認完了までBLOCKEDのまま保持する。新規依頼・重複OCR実装・SNS公開・D1書込なし。

### 2026-10-17 08:18 JST Codex 最終確認（BLOCKED → DONE）
- **実装・配備済み**: 677c592bでtesseract導入/必須化、59405407で見える写真単位のローカル切り出しOCR。初回build #39ではOCR作動だけ確認できてもcrocsが読めたため、完了判定せず追加修正した。全回帰3049件、局所試験/実crocsラスター検出も成功。
- **素材完成・本番確認済み**: [既存build #40/run38980050574](https://github.com/t-ooku/P-GATE/actions/runs/38980050574) success。生成commit37ed5d37584c58a5c7f3a1e639aa9b13ac4f1576、manifest captured_at 10月17日08:14:15 JST、notes5/buzz5/seller7、failuresなし。14枚はphoto_ocr=tesseract、写真なしSeller3枚はskipped、全写真photos=photo_band_masked。buzz/3だけphoto_full_blur1。
- 17枚を一覧目視、問題のbuzz/3・notes/2は元解像度で拡大確認。crocs上側の「50%OFF・3,850円」は当該写真だけ全ぼかしになり読めない。他の靴/服等の写真上部は保持。プロテイン写真下の10%OFFも読めない。Seller6の月額1,980円/9,800円/19,800円、無料期間/自動課金の注意書きは保持。OCR未検出を全商品の漏れなしの保証とはしない。商品名「半額セール」の文字は既存方針どおり残る。
- 本番health/17画像/LP用5画像のHEAD200は同buildの検証で確認（別の手動probeはなし）。build配備Version ID548d897d-9638-4c04-bce4-a207be754ea4。後続CIの最終Versionは本日日報に記録する。
- **キュー反映・公開**: CodexからD1/キュー/公開操作なし。素材配信を公開実績とはしない。#616旧素材レビュー待ちとX停止は維持。10月17日20時の既存予約の公開三要素は未来のため未完了。
- 成果は本日08:07既存成果物で購入先クリック2セッション、一般保存0、Seller問い合わせ10月10日以降0/有料契約0（契約は既存20:50確認）。素材修正を獲得成功にしない。Claudeへの即時起動は行っておらず、受信箱経由の経緯を保存。大隆さんの転送・操作は不要。

最終CI #2456/run38980050569が画像commit37ed5d37を含めて再配備し、Version e13948b3-afb1-4c78-b486-a574fc76c6b8。既存health ok/missing0/weak0も確認。素材完成と将来のSNS公開を区別する。
