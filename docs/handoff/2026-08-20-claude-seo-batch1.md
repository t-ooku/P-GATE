# SEO記事量産 バッチ1 完了報告 (2026-08-20)

担当: Claude Code / 指示書: 【HOSHILU SEO記事 量産指示書 v1.0】
対象: クラスタA（曖昧検索）テーマ 1〜5
ベース: `feature/ui-search-v2` @ `6668f96`

## 追加slug一覧（5本・すべて日本語のみ）

| # | テーマ | slug | intent | cluster |
|---|---|---|---|---|
| 1 | SNSで見た商品の探し方（総論） | `find-products-seen-on-social-media` | `find_product_seen_on_social_media` | `social-discovery` |
| 2 | TikTokで見た商品の名前が分からない時の探し方 | `find-products-seen-on-tiktok` | `find_product_seen_on_tiktok` | `social-discovery` |
| 3 | インスタで見た服・バッグを探す方法 | `find-fashion-items-seen-on-instagram` | `find_fashion_item_seen_on_instagram` | `social-discovery` |
| 4 | YouTubeで紹介されていた商品を後から探す方法 | `find-products-introduced-on-youtube` | `find_product_introduced_on_youtube` | `social-discovery` |
| 5 | うろ覚えの商品名から正しい商品名を突き止める方法 | `identify-correct-product-name-from-vague-memory` | `identify_correct_product_name` | `ai-discovery` |

公開URL: `https://hoshilu.app/ja/<slug>`

## 品質スコア

`evaluateSeoPageQuality` 実測（テスト闾値は85だが指示書要件は100）:

```
100 find-products-seen-on-social-media
100 find-products-seen-on-tiktok
100 find-fashion-items-seen-on-instagram
100 find-products-introduced-on-youtube
100 identify-correct-product-name-from-vague-memory
---
既存を含む全33パスの最小スコア: 100
```

内訳は全項目満点（intent 20 / hoshiluValue 20 / evidence 20 / readability 15 / searchCta 10 / risk 10 / technical 5）。
readability 15 を満たすため、5本とも `tips` 3件・`comparison` 3行を独自に記述（`criteria` は `jaDefaults` を継承）。
`comparison` は各ページの `profile.headings` と列の意味が一致するよう個別に書き下ろした。

## テスト結果

```
npm test (リポジトリルート)
  tests 5    pass 5    fail 0   … tests/*.test.mjs
  tests 1717 pass 1717 fail 0   … tools/line-worker/test/*.test.mjs
  tests 6    pass 6    fail 0   … tools/chrome-extension
合計 1728 PASS / 0 FAIL
npm run build → dist/Project_GATE_Complete.gs の差分なし（再現性OK）
```

更新したピン（指示書の許可範囲＝ピン数の更新のみ）:

| ファイル | ピン | 変更 |
|---|---|---|
| `test/seo-pages.test.mjs` | `seoPagePaths.length` | 28 → 33 |
| `test/seo-pages.test.mjs` | 日本語ページ数 | 23 → 28 |
| `test/seo-pages.test.mjs` | sitemap `<url>` 数 | 33 → 38 |
| `test/home-faq-seo.test.mjs` | sitemap `<url>` 数 | 33 → 38 |

テスト名の文言も実数に合わせて更新（「日本語20ページ」→「日本語28ページ」、「ハブは20記事」→「ハブは28記事」）。新規テストの追加はしていない。既存の全件ループ（canonical / hreflang / FAQ構造化データ / 図解 / 比較表 / 断定表現の不在 / 品質スコア）が新5ページも自動的に検証している。

### 環境メモ（CI影響なし）
作業開始時、ローカルで32件のテストが失敗していたが、原因は `tools/line-worker/node_modules` 未インストール（`encoding-japanese` が解決できず28ファイルが `ERR_MODULE_NOT_FOUND`）。依存は `tools/line-worker/package.json` に宣言済みで、`npm install` 実行後は0件。リポジトリ側の不具合ではなく、私の変更とも無関係。念のため変更前後で失敗テスト名を突き合わせ、**私の変更による新規失敗は0件**であることを確認済み。

## スキップしたテーマと理由

なし（テーマ1〜5すべて実装）。ただし1件、意図の重複を検討したうえで「差別化して実装」と判断した項目がある:

- **テーマ1「SNSで見た商品の探し方（総論）」 vs 既存 `find-product-without-name`**
  既存ページの description に「SNSや街で見た商品の名前を忘れても」とあり、クエリ面で重複リスクがあった。スキップせず、切り口を明確に分離して実装:
  - `find-product-without-name` = **記憶を言葉に変換する**（見た場所・使う人・用途・外観の4分割）
  - `find-products-seen-on-social-media` = **発見元のSNS側に残った手がかりを回収する**（保存・いいね・閲覧履歴からの投稿再訪、説明文・コメント欄・投稿者の他投稿の確認）を前段に置き、手がかりが取れない場合にのみ記憶ベースの検索へ渡す
  図解手順（`guide-flow`）も完全に別内容で、テストの一意性検証を通過している。
  **要観察**: Search Console でこの2ページが同一クエリで食い合っていないか、インデックス後に確認を推奨。

## 内部リンクの状況（次バッチへの申し送り）

- ハブ `/ja/guides` に新グループ **`social`（SNS・動画で見た商品を探す）** を新設し、テーマ1〜4を収容。テーマ5は既存グループ `discover` に追加。全28記事が重複なく1回ずつ掲載されている（テストで検証済み）。
- 各記事フッターの「関連記事」は `relatedLinks()` の固定 `preferred` 配列から先頭3件を出す実装。**今回この配列は意図的に変更していない**。変更すると既存テスト「既存SEO記事から今回の新規5記事へ内部リンクがある」（前バッチ5本への導線を保証）が壊れるため。
- 結果として新5ページへの内部リンクは現状 **ハブからのみ**。全記事にハブへの導線（「買い物ガイドをすべて見る」）があるため到達性は確保されているが、リンクジュースの観点では弱い。
- **提案**: `relatedLinks()` を「固定配列の先頭3件」から「同一 `cluster` 優先＋ハブ」に変更すると、`social-discovery` の4本が相互リンクし、クラスタとしての評価が上がる見込み。ただし既存テストの前提を変えるため、実施は要相談（指示書の「ピン数の更新のみ」の範囲外）。

## 事実性・断定表現の扱い

- 商品名・価格・レビュー・ランキング実数・セール日程は一切記載していない。価格/在庫/送料は全ページで「販売ページで確認」へ誘導。
- SNS各サービスの機能は、UI操作手順を書かず「保存・いいね・閲覧履歴」「説明文・コメント欄」「概要欄」など、変更に強い一般的な表現に留めた。
- テーマ3（ファッション）は、サイズ表記がブランドごとに異なる点・画面の色と実物の色が異なる点をFAQで明示。
- テーマ4（YouTube）は、動画内の評価が投稿者の見解である点、提供・案件表示の確認をFAQで明示。
- 禁止表現（最安/No.1/絶対/必ず見つかる）は不使用。テストの `doesNotMatch` で機械的に担保。

## 次バッチ予定

バッチ2 = クラスタA テーマ6〜10（画像しか手がかりがない / 友達が使っていた商品 / 店頭で見た商品 / CMで見た商品 / 「あれ何て名前？」の変換）。
本日の上限は2バッチ（10ページ）。

---

# SEO記事量産 バッチ2 完了報告 (2026-08-20)

対象: クラスタA（曖昧検索）テーマ 6〜10

## 追加slug一覧（5本・すべて日本語のみ）

| # | テーマ | slug | intent | cluster |
|---|---|---|---|---|
| 6 | 商品の画像しか手がかりがない時の探し方 | `find-a-product-from-a-photo-or-screenshot` | `find_product_from_photo` | `ai-discovery` |
| 7 | 友達が使っていた商品をさりげなく特定する方法 | `identify-a-product-someone-else-is-using` | `identify_product_someone_uses` | `offline-discovery` |
| 8 | 店頭で見た商品を家に帰ってから探す方法 | `find-a-product-you-saw-in-a-store` | `find_product_seen_in_store` | `offline-discovery` |
| 9 | CMで見た商品の探し方 | `find-a-product-you-saw-in-a-tv-commercial` | `find_product_seen_in_tv_commercial` | `offline-discovery` |
| 10 | 「あれ何て名前？」を検索語に変換するコツ | `turn-vague-words-into-search-terms` | `turn_vague_words_into_search_terms` | `ai-discovery` |

## 品質スコア

```
100 find-a-product-from-a-photo-or-screenshot
100 identify-a-product-someone-else-is-using
100 find-a-product-you-saw-in-a-store
100 find-a-product-you-saw-in-a-tv-commercial
100 turn-vague-words-into-search-terms
---
既存を含む全38パスの最小スコア: 100
```

## テスト結果

```
npm test (リポジトリルート)
  tests 5 / 1717 / 6  → 合計 1728 PASS / 0 FAIL
npm run build → dist/Project_GATE_Complete.gs の差分なし（再現性OK）
```

ピン更新: `seoPagePaths.length` 33→38、日本語ページ数 28→33、sitemap `<url>` 数 38→43（`seo-pages.test.mjs` / `home-faq-seo.test.mjs`）。

## ハブ構成の変更

- 新グループ **`offline`（お店・テレビ・人づてで見た商品を探す）** を新設し、テーマ7・8・9を収容。
- テーマ6・10は既存グループ `discover` に追加。
- 全33記事が重複なく1回ずつ掲載（テストで検証済み）。

## スキップしたテーマと理由

なし（テーマ6〜10すべて実装）。ただし意図の重複を検討した項目が2件ある:

- **テーマ6・10 vs 既存 `how-to-search-by-description`（特徴から商品を探す方法）**
  既存ページは「条件の設計」＝何を含めるか（種類・使う人・場面・予算・除外）を扱う。対して:
  - テーマ6 = **画像という媒体の読み解き手順**（写り込んだ文字→大きさの比較対象→形の分解、の順序）
  - テーマ10 = **語彙そのものの変換**（指示語→種類、擬音語→動作・仕組み、感覚語→比較対象・数値）
  3本とも手順が別物で、図解手順の一意性検証も通過。
  **要観察**: 「商品 特徴 探し方」系のクエリでこの3本が食い合わないか、インデックス後にSearch Consoleで確認を推奨。バッチ1のテーマ1と合わせ、計4本が要観察。

## 事実性・安全性で特に配慮した点

- **テーマ7（人の持ち物）**: 無断撮影や持ち物を調べる行為を明確に非推奨とし、「聞ける関係なら本人に聞くのが最も確実」を結論の第一文に置いた。FAQでも撮影について明示的に注意喚起。
- **テーマ9（CM）**: 実在のCM・企業・出演者は一切記載していない。放送時期からの特定は「HOSHILUでは扱っていない」と正直に記載し、できないことをできると書かないようにした。CM表現は特徴の一部の強調である旨をFAQで明示。
- **テーマ8（店頭）**: 「販売終了」と断定させず、取り扱いは販売先ごとに異なる旨へ誘導。リニューアルでパッケージが変わる可能性にも言及。
- **テーマ6（画像）**: 画像検索機能があるかのような誤解を避けるため、「HOSHILUは文章で入力した条件から候補を探す」とFAQで明記。

## 本日の進捗と次バッチ

本日は上限どおり2バッチ・10ページを実装（テーマ1〜10、クラスタA完了）。
残り20本: クラスタB（韓流・若者、テーマ11〜18／8本）、クラスタC（中年層、テーマ19〜25／7本）、クラスタD（比較・実務、テーマ26〜30／5本）。
次回はバッチ3 = テーマ11〜15から着手。
