# HOSHILU 検索パイプライン Vol.2 設計書（2026-08-05）

## 0. 目的

現行の検索キーワード生成パイプラインは、カテゴリ判定（＝どのモール別ビルダーが処理するか）が確定した瞬間に、価格・形容詞・色などその他の条件が失われる構造になっている（本日の「1万円以下で軽いモバイルバッテリー」→価格消失バグはその実例）。Vol.2では、**カテゴリ判定より前に、原文・カテゴリ・特徴・価格・色・用途・対象・否定条件を保持する構造化クエリを作る**ことで、この種の消失をアーキテクチャレベルで起きなくする。

本書はコード変更を含まない設計書のみ。承認後、Cloudflareへは現行修正（クイックストリップ / 価格条件保持修正）のみをデプロイし、Vol.2は別途の実装フェーズとする。

---

## 1. 現状パイプライン

HOSHILUの「検索語生成」は、実は目的の異なる**3つの独立したサブシステム**が並存しており、互いに構造化データを共有していない。

### 1-A. モール別検索キーワード生成（pre-search、実際に使われている本線）
ユーザー原文 → `redactSearchPersonalData()`（PII除去のみ）→ **モールごとに個別の関数**が、それぞれ独自の正規表現でカテゴリ・属性を抜き取りながらキーワード文字列を組み立てる。

| モール | 関数 | 参照辞書 |
|---|---|---|
| Amazon | `buildAmazonSearchKeywords` ([src/index.mjs](../tools/line-worker/src/index.mjs)) | `marketplace-search-keywords-v2.mjs`（第一優先）→ `search-intelligence.mjs` RULES（英語約150カテゴリ）→ `apparel-vocabulary.mjs`（12カテゴリの日本語補完） |
| Qoo10 | `buildQoo10SearchKeywords` (同上) | 同上（`compactTerms !== cleaned` なら他ロジックを全てバイパスして即return） |
| 楽天 | `buildRakutenSearchKeywords` (同上) | `marketplace-search-keywords-v2.mjs` の戻り値をほぼそのまま採用 |
| Yahoo!/SHEIN | `buildYahooShoppingSearchDestination` 等 | `marketplace-search-keywords-v2.mjs` |
| ZOZOTOWN等5モール | `buildApparelMarketplaceDestinations` ([src/apparel-marketplaces.mjs](../tools/line-worker/src/apparel-marketplaces.mjs)) | `APPAREL_TERMS` 正規表現でゲート判定してから同上 |

中核の `marketplace-search-keywords-v2.mjs`（[tools/line-worker/public/marketplace-search-keywords-v2.mjs](../tools/line-worker/public/marketplace-search-keywords-v2.mjs)、約1,760行）は、**商品カテゴリごとに個別実装された約40個の狭いビルダー関数**（`buildPowerBankSearchKeywords`、`buildAirFryerBodySearchKeywords`等）＋約150行のGENERIC_PRODUCTS辞書からなる。各ビルダーは「自分が知っている属性（mAh容量・W数・接続端子など）」だけを見て、それ以外（価格・重さ・一般的な形容詞など）は一切参照せずに文字列を返す。

### 1-B. 候補ランキング／構造化クエリ（post-search、実装済みだが未接続）
[src/search-quality/](../tools/line-worker/src/search-quality/) 配下に、まさに今回依頼された形（原文・カテゴリ・必須属性・除外属性・用途・対象・色・材質…）を持つ `structureSearchQuery()` が**既に実装済み**で存在する。

- `query-structurer.mjs`：`structureSearchQuery(rawQuery, locale)` が `{ raw_query, product_type, required_attributes, preferred_attributes, excluded_attributes, use_case, target_user, color, material, ... }` を返す
- `canonical-attributes.json`：39属性（否定語検出込み、4言語）
- `product-types.json`：21商品タイプ
- `hard-filter.mjs`：構造化クエリで候補を合否判定
- `two-stage-ranking.mjs`：関連度→商用条件の2段階ランキング
- `gradual-rollout.mjs` / `shadow-evaluation.mjs` / `evidence-gate.mjs`：％ロールアウト・シャドウ計測・安全ゲート

ただし `HOSHILU_STRUCTURED_QUERY_ENABLED` 等のフラグは常時OFFで、かつ **`ai-product-discovery.mjs` を含むどこからもこれらの関数は呼び出されていない**（grep確認済み）。テストのみが通っている「使われていない土台」。

### 1-C. AI理解フェーズの表示ラベル
[src/knowledge-search.mjs](../tools/line-worker/src/knowledge-search.mjs) の `CATEGORY_LABELS` は、チャット的な絞り込みUIの選択肢表示にのみ使う独立辞書。1-A・1-Bとは無関係。

```
[ユーザー原文]
   │
   ├─(1-A: 実際に使われている)→ モール別ビルダー×6 → 検索URL/キーワード文字列
   │      ↑ カテゴリ判定と属性抽出が同じ正規表現の中で不可分に混在
   │
   ├─(1-B: 未接続)→ structureSearchQuery() → hard-filter/two-stage-ranking
   │      ↑ 呼び出し元が存在しない
   │
   └─(1-C: 無関係)→ CATEGORY_LABELS → 絞り込みUIの選択肢表示
```

---

## 2. 問題点

1. **カテゴリ判定が属性抽出より先に確定し、そこで打ち切られる**：`marketplace-search-keywords-v2.mjs` の各ビルダーは「商品カテゴリにマッチしたら、そのビルダーが知っている属性だけを含めてreturn」という構造。ビルダーの語彙にない属性（今回は価格）は、判定と同時に消える。カットソー問題（8/4修正）と本日の価格問題は同じ欠陥の別症状。
2. **辞書が4つ以上に分散**：`search-intelligence.mjs` RULES（英語約150）／`apparel-marketplaces.mjs` APPAREL_TERMS／`marketplace-search-keywords-v2.mjs` GENERIC_PRODUCTS+約40ビルダー／`knowledge-search.mjs` CATEGORY_LABELS／`search-quality/canonical-attributes.json`+`product-types.json`（39+21、未使用）。カテゴリを1つ追加するのに複数箇所を横断調査する必要があり、今回の監査だけでも該当ファイル特定に相応の時間を要した。
3. **価格属性がどの辞書にも構造化フィールドとして存在しない**：`stripSearchBudget()` は価格語句を検索文字列から**削除するだけ**で、どこにも再格納しない。`structureSearchQuery()` 側にも price フィールド自体が無い。
4. **用途・対象・色・材質はスロットだけあって未実装**：`structureSearchQuery()` の戻り値には `use_case`／`target_user`／`color`／`material` が既にあるが、実装は `null` または `[]` 固定。
5. **否定条件の扱いがビルダーごとに場当たり的**：`marketplace-search-keywords-v2.mjs` は `isNegatedAttribute()` を各ビルダー内で個別呼び出し、`query-structurer.mjs` は `NEGATION_BEFORE`/`NEGATION_AFTER` で一括処理。同じ問題を2通りのやり方で別々に解いている。
6. **修正が対症療法になりやすい**：カットソー修正はAmazon/Qoo10のみ、本日の価格修正はAmazon/Qoo10/楽天のみ。「同じ根本原因を持つ別モール・別属性」が後から見つかるたびに個別パッチが増える。
7. **Vol.2相当の基盤に対する二重投資リスク**：`search-quality/` 配下は今回のニーズにほぼ合致する構造を持ちながら未接続。ここを拡張せず新規に作ると、似た構造化クエリの実装が2つ並存することになる。

---

## 3. Vol.2パイプライン設計

### 3-1. 基本方針
**新規に作らず、既存の `search-quality/query-structurer.mjs` を拡張して唯一の構造化クエリとする。** モール別ビルダー・候補ランキング・AI理解表示のすべてが、この1つのオブジェクトを「読むだけ」の関係になるようにする。

### 3-2. 構造化クエリの拡張スキーマ
現行の `structureSearchQuery()` 戻り値に対し、以下を**追加**する（既存フィールドの意味・型は変更しない＝後方互換）。

```
{
  raw_query: string,              // 既存。常に原文（PII redaction後）を保持
  locale: 'ja'|'en'|'ko'|'zh',    // 既存
  product_type: string,           // 既存。カテゴリ判定結果（最後に確定する）
  required_attributes: string[],  // 既存
  preferred_attributes: string[], // 既存
  excluded_attributes: string[],  // 既存（否定条件）
  use_case: string[],             // ★実装追加（現状 null 固定）
  target_user: string[],          // ★実装追加（現状 null 固定、メンズ/レディース/子供等）
  color: { included: string[], excluded: string[] }, // ★実装拡張（現状 [] 固定）
  material: string[],             // ★実装追加（現状 [] 固定）
  price: {                        // ★新規フィールド
    max: number|null,
    min: number|null,
    currency: 'JPY',
    raw: string|null              // 元の言い回し（例: "1万円以下"）をそのまま保持
  } | null,
  ...(既存の compatibility / shape / size / power_voltage / ambiguity 等は維持)
}
```

### 3-3. 生成順序の変更（最重要）
現行：カテゴリ判定（正規表現マッチ）とほぼ同時に属性抽出が行われ、マッチした瞬間に他の属性抽出コードへ到達しないパスがある。

Vol.2：**属性抽出（価格・色・材質・用途・対象・否定・特徴）を先に全て実行し、その後にカテゴリ（product_type）を確定する。** カテゴリが確定しても、既に抽出済みの属性オブジェクトからは何も削除しない。カテゴリ判定はあくまで「どの商品タイプ辞書と照合するか」を決めるだけの役割に限定し、属性の生死に関与させない。

### 3-4. モール別キーワード生成の位置づけ
`buildAmazonSearchKeywords` 等の役割を「原文から属性を抜き出す」から「**構造化クエリを、そのモールの検索ボックス文法に変換するだけの薄いアダプタ**」に変える。

- 例：Amazon/楽天/Qoo10は自由文検索なので `raw_query` を主軸にしつつ、`structuredQuery.price` があればモール構文（Amazonなら `low-price`/`high-price` の検索URLパラメータ、楽天なら該当パラメータ）へ変換。フリーテキストへ埋め込む必要自体をなくす。
- カテゴリ固有の狭いビルダー（約40個）は、「同じ商品タイプの中でも検索精度を上げたい追加属性（mAh容量など）」だけを付加する**補助**の位置づけに縮小し、属性を落とす主犯だった「カテゴリ確定＝早期return」の構造をやめる。

### 3-5. 候補ランキング・AI理解UIとの統合
- `hard-filter.mjs`／`two-stage-ranking.mjs` は元々この構造化クエリを受け取る設計なので、そのまま接続するだけでよい（今回初めて実際に呼び出されるようになる）。
- `knowledge-search.mjs` の `CATEGORY_LABELS` は、`product-types.json` の `label` フィールドと統合可能（現状は別々の日本語ラベル辞書を持っている）。

---

## 4. 移行方法

1. **`search-quality/query-structurer.mjs` にフィールドを追加**（price/color/material/use_case/target_userの実装）。既存フィールドの型・意味は変えないため、現行の `structured-query.test.mjs` は無改修で通る想定。
2. **新規アダプタ層を追加**（例：`src/search-quality/structured-marketplace-keywords.mjs`）。構造化クエリ → Amazon/Qoo10/楽天/Yahoo/SHEIN/5モール向け文字列・URLパラメータへの変換のみを行う。既存の `buildAmazonSearchKeywords` 等はこの段階では**変更しない**（並存）。
3. **フラグで新旧を切替可能にする**（例：`HOSHILU_STRUCTURED_MARKETPLACE_KEYWORDS_ENABLED`）。`gradual-rollout.mjs` の `rolloutConfiguration()`／`assignedToStructuredSearch()` をそのまま流用し、対象ユーザーの一部だけに新パイプラインを割り当てられるようにする。
4. **`shadow-evaluation.mjs` で新旧の出力を比較**（ユーザーには旧パイプラインの結果を表示したまま、新パイプラインの出力をログに記録して差分を計測）。
5. **辞書統合**：`search-intelligence.mjs` RULES／`apparel-marketplaces.mjs` APPAREL_TERMS／`marketplace-search-keywords-v2.mjs` GENERIC_PRODUCTSの内容を、`canonical-attributes.json`／`product-types.json` へ段階的に移植。優先順位は「価格・色・否定条件の消失実績があるカテゴリ（モバイルバッテリー等）」から。
6. 新パイプラインの出力品質が既存と同等以上と確認できたカテゴリから、旧ビルダーの呼び出しを新アダプタに置き換える。全カテゴリ移行が終わった時点で旧辞書・旧ビルダーを削除する。

---

## 5. 互換性

- **出力フォーマット不変**：モールへ渡す検索キーワード文字列／URLの形式は変更しない。移行はあくまで「文字列をどう組み立てるか」の内部実装差し替えであり、ユーザー・モール側から見える挙動（検索結果の見え方）に破壊的変更はない。
- **既存テスト資産の継続利用**：`test/search-quality-regression.test.mjs`（73件）、`test/index.test.mjs`、`test/structured-query.test.mjs`、`test/two-stage-ranking.test.mjs` は移行の各段階でそのまま回帰チェックとして使える。新パイプラインは既存テストを壊さないことを前提に進める。
- **多言語**：`canonical-attributes.json` は既に ja/en/ko/zh の4言語キーを持つ構造なので、4言語同一機能というSSoT要件と適合する。
- **AI/HOSHILU境界**：構造化クエリはあくまで「意図理解の共有フォーマット」。価格・URL・在庫をAIが生成しない原則（[hoshilu-ssot]）は維持し、`price`/`color`等はユーザー原文からの抽出結果であって、AIが値を創作するものではない。
- **後方互換フラグ**：全ての新機能はOFFがデフォルトの環境変数で保護し、既存の `HOSHILU_STRUCTURED_QUERY_ENABLED` 等と同じ命名規則・安全ゲート（`rolloutSafetyGate`：shadow計測7日以上・除外条件違反率0・承認必須）に従う。

---

## 6. 影響ファイル

### 新規追加（想定）
- `docs/HOSHILU_SEARCH_PIPELINE_VOL2_DESIGN_2026-08-05.md`（本書）
- `src/search-quality/structured-marketplace-keywords.mjs`（新アダプタ）
- 対応テストファイル一式

### 拡張（既存ファイルへの追記、破壊的変更なし）
- `src/search-quality/query-structurer.mjs`（price/color/material/use_case/target_user実装）
- `src/search-quality/canonical-attributes.json`（属性拡充）
- `src/search-quality/product-types.json`（商品タイプ拡充）

### 将来的に薄いラッパー化・縮小の対象
- `src/index.mjs`（`buildAmazonSearchKeywords`/`buildQoo10SearchKeywords`/`buildRakutenSearchKeywords`等）
- `src/apparel-marketplaces.mjs`
- `src/search-intelligence.mjs`
- `tools/line-worker/public/marketplace-search-keywords-v2.mjs`
- `src/knowledge-search.mjs`（CATEGORY_LABELS部分）

### 接続（呼び出し元を新設）
- `src/ai-product-discovery.mjs`（`hard-filter.mjs`/`two-stage-ranking.mjs`を初めて呼び出す）

---

## 7. 段階的移行案

| Stage | 内容 | ユーザー影響 | 判定基準 |
|---|---|---|---|
| 0（現状） | 検索キーワード生成と構造化クエリ基盤が完全に分断 | なし | - |
| 1 | `query-structurer.mjs` にprice/color/material/use_case/target_userを実装。どこからも呼ばれないため既存動作に影響ゼロ | なし | 新規ユニットテスト全件pass |
| 2 | 新アダプタ（構造化クエリ→モール別キーワード）を追加。`HOSHILU_STRUCTURED_MARKETPLACE_KEYWORDS_ENABLED`はOFF固定でコードのみ導入 | なし | `search-quality-regression.test.mjs`相当のケースを新パイプラインでも実行し既存出力と比較 |
| 3 | `shadow-evaluation.mjs`で新旧出力をログ上でのみ比較（表示は旧のまま） | なし（裏側計測のみ） | `exclusion_violation_rate=0`、`zero_result_honesty=1`等を`rolloutSafetyGate`基準で7日以上確認 |
| 4 | `gradual-rollout.mjs`で5%→25%→100%と段階的に新パイプラインをユーザーへ表示 | 一部ユーザー | 各段階でStage3と同じ安全ゲートを再確認、悪化時は`rollbackRolloutConfiguration()`で即時0%へ戻す |
| 5 | 全カテゴリ移行完了後、`search-intelligence.mjs` RULES等の旧辞書・旧ビルダーを削除 | なし（内部整理） | 新パイプラインが旧辞書の全カテゴリをカバーしていることをテストで確認 |

---

## 付記：今回の価格条件バグとの関係

本日Cloudflareへ反映する `extractMissingPriceConstraint()` によるパッチは、Vol.2の設計とは独立した**対症療法（Stage 0のままの応急処置）**である。Vol.2のStage 1で `structureSearchQuery()` にpriceフィールドが実装され、Stage 2以降で新アダプタに置き換われば、このパッチ自体は不要になり削除できる。

## 付記2：候補ランキング側でより重大な欠陥を確認（2026-08-05 追記）

本設計書提出後、「カットソー」を含む検索でカテゴリ無関係の商品（船用品）が1位表示される不具合が実機で報告され、実コードでの再現調査により以下を確認した。**この欠陥はVol.2が解決しようとしている問題そのものであり、本設計の緊急度を裏付ける実例である。**

- `src/knowledge-search.mjs` の `filterCategoryMismatches()` は、`inferCandidateCategory()`（`search-intelligence.mjs` RULES、約150カテゴリ）がどのカテゴリにも分類できない候補を `'other'` として**無条件に合格**させる設計だった。RULES に「船用品」のようなカテゴリが存在しないため、無関係な商品が素通りしていた。
- `rankMerchantCandidates()` には**関連度スコアが一切存在せず**、`hasMerchantOffer`（オファーの有無）と到着順のみでランキングしていた。カテゴリ・色・用途・対象者のどれも比較していないため、フィルタを素通りした無関係な商品が先頭に来ればそのまま1位になる。
- `src/search-quality/query-structurer.mjs` 以下（本書1-Bで述べた「未接続の構造化クエリ基盤」）は、まさにこの関連度スコアリングのために作られていながら未使用のままだった。

**今回の即時対応**（Vol.2本体とは別の最小パッチ、詳細は最終報告を参照）：
- `filterCategoryMismatches()`：クエリがファッション系カテゴリ（トップス・ボトムス・ワンピース・バッグ・靴・帽子・靴下）を要求している場合に限り、`'other'` 判定でも衣類/ファッション関連語を含まない候補を除外するよう変更。
- `rankMerchantCandidates()`：`hasMerchantOffer` の次点として、クエリが要求する色（`requestedColorPatterns()`）に一致する候補を優先するタイブレークを追加。

**今回あえて対応しなかった範囲**（Vol.2で本格対応すべき箇所）：
- 「旅行で荷物を小さくしたい」「一人暮らし用の炊飯器」のようにRULESがカテゴリを一切検出できないクエリでは、フィルタ・ランキングのどちらにもカテゴリ由来の防御がかからず、無関係な候補が1位になり得ることを実データで確認した（`一人暮らし用の炊飯器` はRULESに「炊飯器」の直接パターンがなく無検出）。
- 用途一致・対象者一致・特徴一致のスコアリングは、その情報を抽出する仕組みが現行ライブパイプラインに存在しないため、今回は実装していない。これはまさに本設計書 §3-2 の `use_case`/`target_user` 実装（Stage 1）が必要な理由そのもの。

この2点は、Vol.2 Stage 1〜2（構造化クエリへのprice/color/use_case/target_user実装 → 新ランキングアダプタ接続）で解消することを想定する。

## 付記3：v3.0実装指示書（2026-08-05）による追加対応（Stage 0の応急処置の拡張）

付記2の指摘を受け、同日中に以下を追加実装した（いずれもVol.2本体の構造化クエリ実装ではなく、既存パイプラインへの局所パッチ）。

- `filterCategoryMismatches`の`'other'`許容ドメインを、ファッション系に加え`rice-cooker`（炊飯器）・`travel-packing`（旅行の荷物圧縮）へ拡張。`search-intelligence.mjs` RULESにも両カテゴリを新規追加（従来ゼロ検出だった）。
- `rankMerchantCandidates`にアパレル領域限定の100点満点スコア（カテゴリ40・対象者10・色10・袖丈5・特徴5・原文語一致5、商品種別20と用途・季節5は未実装）を追加。
- Amazon/楽天/Qoo10/Yahoo宛て検索語の第1候補を句読点整形し、「条件整理検索」（対象者＋カテゴリ＋袖丈＋色＋特徴）を第2候補として追加する多段フォールバックを実装。カテゴリ不一致のみで0件でない場合も次候補へフォールバックするよう変更。

これらは全てフラグなしの常時有効なコード変更であり、Vol.2のような段階的ロールアウト機構は使っていない（対応範囲が今回明確に再現・特定された不具合に限定されているため）。Vol.2本体（構造化クエリを唯一の入力源にする設計）は引き続き未着手。
