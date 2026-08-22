# SEO記事量産 バッチ5 完了報告 ＋ Codexとの作業衝突の報告 (2026-08-22)

担当: Claude Code / 指示書: 【HOSHILU SEO記事 量産指示書 v1.0】
ベース: `feature/ui-search-v2` @ `435b2ce`

## 最重要: 同一指示書をCodexが並行実装していた（作業衝突）

本日の定時作業でrebaseした際、**PR #61「feat(seo): 韓流・推し活・学生向けガイド5本を追加」** が本番ブランチにマージ済みであることを検知した。内容を突き合わせた結果、**私の未マージのバッチ3・4（10本）のうち4本が、PR #61 と同一の検索意図**だった。

| 指示書テーマ | 私の実装（未マージ） | PR #61（マージ済み） | 判定 |
|---|---|---|---|
| 11 韓国コスメ | `find-korean-cosmetics-and-where-to-buy`<br>韓国コスメの探し方と買える場所の見つけ方 | `find-korean-cosmetics-without-product-name`<br>名前が分からない韓国コスメを特徴から探す方法 | **重複** |
| 12 アイドル使用アイテム | `find-items-used-by-korean-artists`<br>韓国アイドルが使っていたアイテムの探し方 | `find-products-used-by-favorite-idol`<br>推しやアイドルが使っていた商品を探す方法 | **重複** |
| 16 推し活グッズ | `find-items-for-supporting-your-favorite`<br>推し活グッズ・アイテムの探し方 | `find-fan-activity-goods-by-purpose`<br>推し活グッズを用途と持ち運び条件から探す方法 | **重複** |
| 15 低予算 | `find-products-on-a-tight-budget`<br>給料日前でも買える低予算の商品の探し方 | `shopping-guide-for-students-on-a-budget`<br>学生が予算内で商品を探すための買い物ガイド | **重複** |
| 13 韓国っぽい部屋 | `find-items-for-a-korean-style-room` | （#61は「韓国っぽい**服**」＝別物） | 非重複 |

### 対応

品質ルール4「既存ページと意図が重複するテーマはスキップ」に従い、**重複する4本を破棄**し、非重複の6本のみを最新ベース上へ再ランドした。作業ブランチはマージ済みベースから作り直している（旧コミット `23e6c2c` / `07b8b89` は破棄）。

重複4本をそのままマージしていた場合、自社ページ同士が同一クエリで競合する状態を作っていた。

### 要対応（人間の判断が必要）

同じ指示書を2つのエージェントが並行実行しており、**このままだと残りテーマでも同じ衝突が起きる**。残り8テーマ（23〜30）に着手する前に、担当の分割を決めてほしい。案:

- 案A: 残りはCodexに一本化し、こちらは停止する
- 案B: テーマ番号で分割（例: 23〜26 = Claude、27〜30 = Codex）
- 案C: こちらが先に「実装予定のslug一覧」をdocs/handoffへ出し、Codexはそれを避ける

**判断が出るまで、テーマ23〜30には着手していない。** 本日の残り1バッチ分は未消化。

## 再ランドした6本

| # | テーマ | slug | cluster |
|---|---|---|---|
| 13 | 韓国っぽい部屋を作るアイテムの探し方 | `find-items-for-a-korean-style-room` | `trend-discovery` |
| 14 | プチプラで「高見え」する商品の探し方 | `find-affordable-items-that-look-expensive` | `trend-discovery` |
| 17 | バズった商品が本当に良いか確かめる方法 | `check-whether-a-viral-product-suits-you` | `reviews-and-trust` |
| 20 | 廃盤になった化粧品と似た商品の探し方 | `find-alternatives-to-discontinued-cosmetics` | `legacy-discovery` |
| 21 | 実家にあった「あの道具」の名前と入手方法 | `find-the-name-of-an-old-household-tool` | `legacy-discovery` |
| 22 | 名前の分からない調理器具の探し方 | `find-the-name-of-a-kitchen-tool` | `ai-discovery` |

## 品質スコア

```
100 find-items-for-a-korean-style-room
100 find-affordable-items-that-look-expensive
100 check-whether-a-viral-product-suits-you
100 find-alternatives-to-discontinued-cosmetics
100 find-the-name-of-an-old-household-tool
100 find-the-name-of-a-kitchen-tool
---
既存(#61の5本を含む)を含む全49パスの最小スコア: 100
```

## テスト結果

```
npm test (リポジトリルート)
  tests 5 / 1730 / 6  → 合計 1741 PASS / 0 FAIL
npm run build → dist/Project_GATE_Complete.gs の差分なし（再現性OK）
```

独立検証: ハブが全44日本語記事を重複なく1回ずつ掲載 true ／ 図解手順の一意性 44/44 ／ 禁止表現なし ／ 全記事が「販売ページ」へ誘導 true ／ 破棄した重複4slugが不在であること true。

ピン更新: `seoPagePaths.length` 43→49、日本語ページ数 38→44、sitemap `<url>` 数 49→55。

## ハブ構成の変更

- 新グループ **`legacy`（昔の商品・名前が分からない道具を探す）** を新設。テーマ20・21・22を収容し、既存の `find-discontinued-or-renamed-products` を `discover` から移動（親＋カテゴリ特化の子の構造をハブ上でも見える形にした）。
- テーマ13・14は #61 が新設した `youth`（韓流・推し活・学生生活から探す）グループへ追加。
- テーマ17は `compare` グループへ追加。

## これまでのスキップ一覧（累計6本）

| テーマ | 重複相手 | 判定日 |
|---|---|---|
| 18 いま流行っている物の調べ方 | `how-to-use-shopping-rankings` | 08-21 |
| 19 昔使っていた日用品の現行品・後継品 | `find-discontinued-or-renamed-products` | 08-21 |
| 11 韓国コスメ | PR #61 `find-korean-cosmetics-without-product-name` | 08-22 |
| 12 アイドル使用アイテム | PR #61 `find-products-used-by-favorite-idol` | 08-22 |
| 15 低予算 | PR #61 `shopping-guide-for-students-on-a-budget` | 08-22 |
| 16 推し活グッズ | PR #61 `find-fan-activity-goods-by-purpose` | 08-22 |

## 残りテーマの事前重複判定（着手前の下見）

担当分割が決まった時点で使えるよう、残り8テーマを既存ページと突き合わせた結果を残す。

| テーマ | 既存の近いページ | 事前判定 |
|---|---|---|
| 23 贈り物の商品名が分からない（もらい物のリピート購入） | `find-a-gift-by-recipient-and-occasion`（贈る側の視点） | 実装可（もらう側＝リピート購入で別意図） |
| 24 説明書も型番もない家電の消耗品 | `check-device-compatibility-before-buying` | 実装可（消耗品の適合という別軸） |
| 25 テレビ通販で見た商品 | `find-a-product-you-saw-in-a-tv-commercial` | 実装可（番組限定セットの論点が固有） |
| 26 ポイント還元の考え方 | `compare-total-price-with-shipping` | 実装可だが要注意（既存に比較表の1行あり） |
| 27 並行輸入品の確認事項 | `american-products-in-japan` | 実装可（既存はtipsで1行触れるのみ） |
| 28 口コミの信頼性を見分ける方法 | `how-to-read-shopping-reviews` ＋ `check-whether-a-viral-product-suits-you` | **スキップ推奨**（2ページに挟まれ意図が残らない） |
| 29 予算から逆算して絞り込む | `search-products-by-budget-and-purpose` ＋ #61 `shopping-guide-for-students-on-a-budget` | **スキップ推奨** |
| 30 条件を保存して待つ | `product-requests`（見つからない商品を保存して探し直す方法） | **スキップ推奨**（ほぼ同一） |

この見立てが正しければ、実装可能な残りは **5本（23〜27）**、最終的な総本数は 30テーマ中 21本前後になる。
