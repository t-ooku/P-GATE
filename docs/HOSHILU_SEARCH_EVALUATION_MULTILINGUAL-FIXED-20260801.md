# HOSHILU ITG曖昧検索評価 — multilingual-fixed-20260801

生成日時: 2026-08-01T04:19:31.196Z

| 区分 | 件数 | Top-1 | Top-3 | Top-10 | カテゴリ一致 | MRR | nDCG@3 | nDCG@10 | 無回答率 | 誤答率 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 全体 | 15 | 20.0% | 60.0% | 100.0% | 80.0% | 0.468 | 0.435 | 0.598 | 0.0% | 0.0% |

| 言語:ja | 0 | 0.0% | 0.0% | 0.0% | 0.0% | 0.000 | 0.000 | 0.000 | 0.0% | 0.0% |
| 言語:en | 5 | 20.0% | 60.0% | 100.0% | 80.0% | 0.490 | 0.452 | 0.616 | 0.0% | 0.0% |
| 言語:zh | 5 | 20.0% | 60.0% | 100.0% | 80.0% | 0.457 | 0.426 | 0.590 | 0.0% | 0.0% |
| 言語:ko | 5 | 20.0% | 60.0% | 100.0% | 80.0% | 0.457 | 0.426 | 0.590 | 0.0% | 0.0% |


| 情報量:rich | 0 | 0.0% | 0.0% | 0.0% | 0.0% | 0.000 | 0.000 | 0.000 | 0.0% | 0.0% |
| 情報量:ambiguous | 15 | 20.0% | 60.0% | 100.0% | 80.0% | 0.468 | 0.435 | 0.598 | 0.0% | 0.0% |
| 情報量:ultra_ambiguous | 0 | 0.0% | 0.0% | 0.0% | 0.0% | 0.000 | 0.000 | 0.000 | 0.0% | 0.0% |
| タイプ:category_branch | 3 | 0.0% | 0.0% | 100.0% | 100.0% | 0.200 | 0.000 | 0.387 | 0.0% | 0.0% |
| タイプ:color_package | 6 | 50.0% | 100.0% | 100.0% | 100.0% | 0.694 | 0.772 | 0.772 | 0.0% | 0.0% |
| タイプ:compatibility | 3 | 0.0% | 100.0% | 100.0% | 100.0% | 0.500 | 0.631 | 0.631 | 0.0% | 0.0% |
| タイプ:sensory | 3 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 1.000 | 1.000 | 0.0% | 0.0% |
| タイプ:shape_function | 12 | 0.0% | 50.0% | 100.0% | 75.0% | 0.335 | 0.294 | 0.498 | 0.0% | 0.0% |
| タイプ:usage_scene | 3 | 0.0% | 0.0% | 100.0% | 0.0% | 0.250 | 0.000 | 0.431 | 0.0% | 0.0% |

## ケース別結果

### T03-en-1 ✅

- クエリ: a lavender scented soy candle in a glass jar
- 正解ASIN: B01J4PDR1A
- 順位: 1
- 上位候補: B01J4PDR1A Mrs。Meyers Clean Day mrm-64558p2 MrsマイヤーズClean Day Soy Candle & # 44 ;ラベンダー& # 44 ; 7.2 Oz & # 44 ; 2パック / B00MO2SUB8 SoybuレディースフルZipパフォーマンスPeaceジャケット XS ブルー / B0045FBQ7M Yankee Candle Large Jar Candle、ホワイトクリスマス

### T03-zh-1 ✅

- クエリ: 玻璃罐装的薰衣草香味大豆蜡烛
- 正解ASIN: B01J4PDR1A
- 順位: 1
- 上位候補: B01J4PDR1A Mrs。Meyers Clean Day mrm-64558p2 MrsマイヤーズClean Day Soy Candle & # 44 ;ラベンダー& # 44 ; 7.2 Oz & # 44 ; 2パック / B00MO2SUB8 SoybuレディースフルZipパフォーマンスPeaceジャケット XS ブルー / B0045FBQ7M Yankee Candle Large Jar Candle、ホワイトクリスマス

### T03-ko-1 ✅

- クエリ: 유리병에 담긴 라벤더 향 소이 캔들
- 正解ASIN: B01J4PDR1A
- 順位: 1
- 上位候補: B01J4PDR1A Mrs。Meyers Clean Day mrm-64558p2 MrsマイヤーズClean Day Soy Candle & # 44 ;ラベンダー& # 44 ; 7.2 Oz & # 44 ; 2パック / B00MO2SUB8 SoybuレディースフルZipパフォーマンスPeaceジャケット XS ブルー / B0045FBQ7M Yankee Candle Large Jar Candle、ホワイトクリスマス

### T04-en-1 ❌

- クエリ: small wired earbuds that fit inside the ear
- 正解ASIN: B001CLUL32
- 順位: 5
- 上位候補: B075LLWYJ7 GUMY EARBUDS BLUE / B00UWKHE7U KIDSSAFE HEADPHONES / B000GX9NVI ED1TC HEADPHONES

### T04-zh-1 ❌

- クエリ: 小巧的有线入耳式耳机
- 正解ASIN: B001CLUL32
- 順位: 5
- 上位候補: B075LLWYJ7 GUMY EARBUDS BLUE / B00UWKHE7U KIDSSAFE HEADPHONES / B000GX9NVI ED1TC HEADPHONES

### T04-ko-1 ❌

- クエリ: 귀에 넣는 작은 유선 이어폰
- 正解ASIN: B001CLUL32
- 順位: 5
- 上位候補: B075LLWYJ7 GUMY EARBUDS BLUE / B00UWKHE7U KIDSSAFE HEADPHONES / B000GX9NVI ED1TC HEADPHONES

### T19-en-1 ✅

- クエリ: a very slim jet black wallet that fits in a pocket
- 正解ASIN: B001CZFXHM
- 順位: 2
- 上位候補: B000VBGR32 Diabetic Wallet Insulin Cooler Travel Wallet - Double Pen Pouch - Black by Poucho / B001CZFXHM Super Slim Wallet Jet Black / B07HYD338R [パックセーフ] 三つ折り財布 Z50 TRIFOLD WALLET BLACK

### T19-zh-1 ✅

- クエリ: 能放进口袋的超薄黑色钱包
- 正解ASIN: B001CZFXHM
- 順位: 3
- 上位候補: B000VBGR32 Diabetic Wallet Insulin Cooler Travel Wallet - Double Pen Pouch - Black by Poucho / B07NYBD3WH Frye Melissa Wallet Carbon / B001CZFXHM Super Slim Wallet Jet Black

### T19-ko-1 ✅

- クエリ: 주머니에 들어가는 아주 얇은 검정 지갑
- 正解ASIN: B001CZFXHM
- 順位: 3
- 上位候補: B000VBGR32 Diabetic Wallet Insulin Cooler Travel Wallet - Double Pen Pouch - Black by Poucho / B07NYBD3WH Frye Melissa Wallet Carbon / B001CZFXHM Super Slim Wallet Jet Black

### T28-en-1 ❌

- クエリ: a clear narrow organizer bin for the refrigerator
- 正解ASIN: B00CS8DT00
- 順位: 4
- 上位候補: B001KN12PI Sterilite ClearView 3 Storage Drawer Organizer by STERILITE / B005LAHBQU Quantum Storage Systems COV91000CO Cover for Dividable Grid Container DG91035 and DG91050 Black Conductive 10-Pack by Quantum Storage Systems / B0051XS4UO Quantum QUS984MOB Plastic Storage Stacking Hulk Container 30-Inch by 16-Inch by 14-Inch Yellow Case of 1 by Quantum Storage Systems

### T28-zh-1 ❌

- クエリ: 冰箱里用的透明细长收纳盒
- 正解ASIN: B00CS8DT00
- 順位: 4
- 上位候補: B001KN12PI Sterilite ClearView 3 Storage Drawer Organizer by STERILITE / B005LAHBQU Quantum Storage Systems COV91000CO Cover for Dividable Grid Container DG91035 and DG91050 Black Conductive 10-Pack by Quantum Storage Systems / B0051XS4UO Quantum QUS984MOB Plastic Storage Stacking Hulk Container 30-Inch by 16-Inch by 14-Inch Yellow Case of 1 by Quantum Storage Systems

### T28-ko-1 ❌

- クエリ: 냉장고에 쓰는 투명하고 긴 수납함
- 正解ASIN: B00CS8DT00
- 順位: 4
- 上位候補: B001KN12PI Sterilite ClearView 3 Storage Drawer Organizer by STERILITE / B005LAHBQU Quantum Storage Systems COV91000CO Cover for Dividable Grid Container DG91035 and DG91050 Black Conductive 10-Pack by Quantum Storage Systems / B0051XS4UO Quantum QUS984MOB Plastic Storage Stacking Hulk Container 30-Inch by 16-Inch by 14-Inch Yellow Case of 1 by Quantum Storage Systems

### T29-en-1 ✅

- クエリ: a compact USB-C hub with multiple ports for a laptop
- 正解ASIN: B01FI7PEH8
- 順位: 2
- 上位候補: B017N54Z64 USB 3.0 to Gigabit Adapter / B01FI7PEH8 USB Type-C Multi-Adapter JCA374 by j5create / B00007FYP6 Digi Edgeport 1 - Serial adapter - USB - RS-232

### T29-zh-1 ✅

- クエリ: 笔记本电脑用的小型多接口USB-C转接器
- 正解ASIN: B01FI7PEH8
- 順位: 2
- 上位候補: B017N54Z64 USB 3.0 to Gigabit Adapter / B01FI7PEH8 USB Type-C Multi-Adapter JCA374 by j5create / B00007FYP6 Digi Edgeport 1 - Serial adapter - USB - RS-232

### T29-ko-1 ✅

- クエリ: 노트북에 연결하는 포트가 여러 개인 소형 USB-C 어댑터
- 正解ASIN: B01FI7PEH8
- 順位: 2
- 上位候補: B017N54Z64 USB 3.0 to Gigabit Adapter / B01FI7PEH8 USB Type-C Multi-Adapter JCA374 by j5create / B00007FYP6 Digi Edgeport 1 - Serial adapter - USB - RS-232

