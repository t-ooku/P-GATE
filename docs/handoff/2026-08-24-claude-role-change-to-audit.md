# 役割変更: SEO記事の執筆はCodexへ一本化、Claudeは品質監査へ (2026-08-24)

決定者: 大隆さん（2026-08-23）／担当: Claude Code

## 決定内容

SEO記事量産（指示書 v1.0 / 全30テーマ）は **Codexに一本化**。Claudeは記事を書かず、**Codexの成果を検証する品質監査**に回る。

理由: 同じ指示書を2体が並行実行した結果、08-21に書いた10本のうち4本がPR #61と重複して破棄になった。担当を1つに絞ることで、重複と判断コストの両方が減る。

## 新しい役割分担

| | Codex | Claude |
|---|---|---|
| 記事の執筆・PR・マージ | ✅ 担当 | ❌ やらない |
| カニバリ検出 | — | ✅ 毎日 |
| 本番配信の実測検証 | — | ✅ 毎日 |
| 設定フラグの回帰検知 | — | ✅ 毎日 |
| 品質スコア・テストの全件確認 | — | ✅ 毎日 |

Routine `trig_01TUydhd2NULTaDcER521dMh` を「HOSHILU SEO 品質監査（毎日9:00 JST）」へ変更済み。**問題が無ければ1〜2行で「異常なし」とだけ報告する**運用にした（定型の長文報告はしない）。SEO関連ファイルはCodex担当のため、監査で問題を見つけても勝手に直さず、原因と修正案を提示して判断を仰ぐ。

## 初回監査の結果 (2026-08-24)

ベース: `feature/ui-search-v2` @ `0f01848`

### 本番配信 — 異常なし
- リポジトリ sitemap `<url>` 数 54 = 本番 `https://hoshilu.app/sitemap.xml` の 54 で一致
- 日本語ページ 43本すべて HTTP 200（非200は0件）

### 品質スコア — 異常なし
- `evaluateSeoPageQuality` 全パスの最小値 100
- `data-seo-intent` の重複 0件

### 設定フラグ
| フラグ | 状態 |
|---|---|
| `rakuten_marketplace_configured` | true |
| `yahoo_shopping_configured` | true |
| `amazon_creators_configured` | **false（継続）** |

Amazon Creators APIの認証情報が未登録のまま。Cloudflare Worker Secret への登録はユーザー本人の作業。

### カニバリ検出 — 要注意3対

タイトル+descriptionの2-gram Dice係数で43本を総当たりし、0.40以上を19対検出。うち **Codexの新規ページが既存の汎用ページと0.50前後で重なっている3対** を要注意として挙げる。

| 係数 | 新規（Codex） | 既存（汎用） |
|---|---|---|
| 0.51 | `read-korean-cosmetics-reviews-by-skin-type` | `how-to-read-shopping-reviews` |
| 0.43 | `use-korean-cosmetics-rankings-safely` | `how-to-use-shopping-rankings` |
| 0.43 | `find-korean-cosmetics-without-product-name` | `find-product-without-name` |

これは「汎用の親ページ＋カテゴリ特化の子ページ」というhub-and-spoke構成として意図的なら問題ない。ただし親子関係が内部リンクで表現されていないと、検索側が同一意図の重複と見なす可能性がある。

**推奨**: 親ページ（`how-to-read-shopping-reviews` / `how-to-use-shopping-rankings` / `find-product-without-name`）から子ページへの明示的な内部リンクを張り、親子関係を可視化する。Search Consoleでこの3対のクエリ重複を優先的に監視するのも有効。

同一クラスタ内の高係数対（`find-products-seen-on-social-media` ↔ `find-products-seen-on-tiktok` = 0.53 など）は、プラットフォーム別の意図分割として設計どおりのため要注意には含めていない。

## 未処理の申し送り

- ブランチ `claude/hoshilu-seo-articles` に非重複6記事（韓国っぽい部屋／高見え／バズ検証／廃盤コスメ／古道具／調理器具）が未マージのまま残っている。品質は100/100・テスト全件合格の状態。Codexが同テーマを書いたら破棄してよい。
- テーマ28（口コミの信頼性）・29（予算から逆算）・30（条件を保存して待つ）は、既存ページおよびPR #68の5本と意図が重複するためスキップ推奨（判定根拠は 2026-08-23 のhandoff参照）。

---

## 監査ログ

| 日付 | ベース | 日本語ページ | 本番sitemap一致 | 非200 | 品質最小 | テスト | 所見 |
|---|---|---|---|---|---|---|---|
| 2026-08-24 | `0f01848` | 43 | 54 = 54 | 0 | 100 | 1761 PASS | カニバリ要注意3対（親子リンク未表現）を報告 |
| 2026-08-25 | `ac930dc` | 53 | 64 = 64 | 0 | 100 | 1763 PASS | 異常なし。Codexが10本追加。新規分に新たなカニバリ懸念なし（Dice0.50以上5対はすべて既知） |
| 2026-08-26 | `5ef202c` | 58 | 69 = 69 | 0 | 100 | 1764 PASS | 異常なし |
| 2026-08-27 | `7c2be8b` | 63 | 74 = 74 | 0 | 100 | 1769 PASS | 異常なし |
| 2026-08-28 | `9cbb3a5` | 68 | 79 = 79 | 0 | 100 | 1779 PASS | 掃除機比較2本がDice0.51（**判定に誤りあり・下記訂正**） |
| 2026-08-29 | `086494f` | 73 | 84 = 84 | 0 | 100 | 1896 PASS | 異常なし |
| 2026-08-30 | `eab95ac` | 83 | 94 = 94 | 0 | 100 | 2018 PASS | 投稿URL検索4本に内部リンク欠落を検出 |
| 2026-08-31 | `6c67d37` | 88 | 99 = 99 | 0 | 100 | 2022 PASS | 家電3本にも同じ欠落を検出 |
| 2026-09-01 | `d5fd384` | 93 | 104 = 104 | 0 | 100 | 1 FAIL | 月替わりでテスト破綻（同日中にベース側で解消） |
| 2026-09-02 | `88bccaf` | 100 | 111 = 111 | 0 | 100 | 2072 PASS | 異常なし。リンク無は9対で前日から増減なし。/api/events は202へ復旧 |

`amazon_creators_configured` は全日 false のまま（ユーザー本人の登録作業が必要）。

## 訂正: 2026-08-28 の掃除機2本「相互リンクあり」は誤判定だった

当時の検査式 `h.includes('compare-robot-vacuums') || h.includes('compare-cordless-vacuums')` は、ページ自身のcanonical URLに自分のslugが含まれるため常に真になっていた。相手のslugを `/ja/` 付きで検査すると双方向ともリンク無。この2本も欠落対象。以降は `a.html.includes('/ja/' + b.slug)` の形に統一している。

## 内部リンク欠落（継続・要対応）

2026-09-02 時点で Dice 0.50以上の **12対中9対がリンク無**。前日から増減なし。

| 状態 | 対 |
|---|---|
| LINKED | compare-amazon-rakuten-yahoo-shopping ↔ compare-multiple-shops (0.63) / american-products-in-japan ↔ shopping-in-japan (0.61) / find-products-seen-on-social-media ↔ find-products-seen-on-tiktok (0.53) |
| リンク無 | 投稿URL検索 4本の4対 (0.71 / 0.68 / 0.68 / 0.55) |
| リンク無 | 大型家電 2対 (0.58 / 0.50) |
| リンク無 | search-products-by-budget-and-purpose ↔ find-a-gift-by-recipient-and-occasion (0.56) |
| リンク無 | how-to-read-shopping-reviews ↔ read-korean-cosmetics-reviews-by-skin-type (0.51) |
| リンク無 | 掃除機 2本 (0.51) |

**恒久対策の提案**: `relatedLinks()` を「固定 `preferred` 配列の先頭3件」から「同一 `cluster` を優先して選ぶ」へ変更する。シリーズは同じ `cluster` を共有するため、これだけで上記のシリーズ内の対がまとめて解消し、今後の再発も止まる。既存テスト「既存SEO記事から今回の新規5記事へ内部リンクがある」の前提を変えるため、実施可否はCodex/ユーザー判断。

## 2026-09-01 のインシデント: /api/events 500 → 復旧

`/api/events` が本番で500を返しデプロイ検証が失敗していた件は、ユーザー提供のパッチ（`3394ea6`、500→503+原因コードへ縮退）を適用してプッシュ済み。CI run 1884 の「Verify production health」で原因コードが判明した。

```
/api/events:EXPECTED_202_GOT_503:{"ok":false,"error":"EVENT_STORE_WRITE_FAILED",
"code":"D1_ERROR: Your account has exceeded D1's free tier daily row read limit."}
```

**コードのバグではなくD1無料枠の日次行読み取り上限への到達**が原因。書き込みAPIが読み取り上限で落ちていたため、`/api/events` 以外の大量読み取りが原因。2026-09-02 時点で `/api/events` は **HTTP 202 / `{"ok":true,"identity_recorded":true}`** に復旧（日次枠のリセットによるもの）。読み取り量が同じペースなら再発するため、有料プランへの移行か読み取り量の削減が必要。

## 判定基準のメモ

- カニバリ判定は**タイトル+descriptionのDice**で行う。本文Diceは `jaDefaults` と共通シェルが大半を占め全ページで高い床を持つため使えない（新規シリーズ0.66〜0.74に対し既存の長期稼働ペアは0.88）。
- 内部リンク検査は必ず `/ja/<相手のslug>` で行う。slug断片の `includes` は自己参照に誤マッチする。
- Dice 0.50以上の対数が増えること自体は問題ではない。判断基準は**その対に相互リンクがあるか**。
