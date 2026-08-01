import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEnglishChineseStressCorpus,
  buildMarketplaceQueryCorpus,
  evaluateMarketplaceQueryCorpus,
  MARKETPLACE_QUERY_NEGATIVE_CASES,
  scoreMarketplaceQueryCase,
} from "../evaluation/marketplace-query-quality.mjs";
import {
  buildMarketplaceSearchKeywords,
  buildQoo10SearchKeywords,
} from "../public/marketplace-search-keywords-v2.mjs";

const SEARCH_MARKETPLACES = [
  "AMAZON_JP", "RAKUTEN_JP", "QOO10_JP", "SHEIN_JP",
  "ZOZOTOWN_JP", "SHOPLIST_JP", "MUSINSA_JP", "BUYMA_JP", "SNKRDUNK_JP",
];

test("日英中韓640件の検索語コーパスを決定論的に生成する", () => {
  const corpus = buildMarketplaceQueryCorpus();
  assert.equal(corpus.length, 640);
  assert.deepEqual(new Set(corpus.map((item) => item.locale)), new Set(["ja", "en", "zh", "ko"]));
  assert.equal(new Set(corpus.map((item) => item.case_id)).size, corpus.length);
});

test('光るスマホケースの口語的な言い換えを4言語で商品語へ統一する', () => {
  const queries = [
    'TikTokで見たピカピカする携帯カバー',
    'viral glowing mobile cover from TikTok',
    '抖音看到的会发光的手机保护壳',
    '틱톡에서 본 불빛 나는 휴대폰 커버',
    'TikTokで見たスマホの通知で背面がピカッとするやつ',
    'the thing from TikTok where the phone back lights up for notifications',
    '抖音看到的手机来通知时背面会亮的那个',
    '틱톡에서 본 스마트폰 알림 때 뒷면에 불이 들어오는 것',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(
        buildMarketplaceSearchKeywords(query, marketplace),
        '光る スマホケース',
        `${marketplace}: ${query}`,
      );
    }
  }
});

test('SNSで見た光るケースは機種とMagSafe条件を4言語で保持する', () => {
  const queries = [
    'TikTokで見た光るiPhone 15 ProケースでMagSafe対応',
    'a glowing MagSafe iPhone 15 Pro case seen on TikTok',
    'TikTok看到的发光磁吸iPhone 15 Pro手机壳',
    '틱톡에서 본 빛나는 맥세이프 iPhone 15 Pro 케이스',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'iPhone 15 Proケース 光る MagSafe対応', `${marketplace}: ${query}`);
    }
  }
});

test('通常ケースも機種・MagSafe・透明条件を4言語で保持する', () => {
  const queries = [
    'iPhone 15 Pro用の透明なMagSafeケース',
    'a clear MagSafe case for iPhone 15 Pro',
    'iPhone 15 Pro透明磁吸手机壳',
    'iPhone 15 Pro 투명 맥세이프 케이스',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'iPhone 15 Proケース 透明 MagSafe対応', `${marketplace}: ${query}`);
    }
  }
});

test('スマホ保護フィルムは機種・強化ガラス・覗き見防止を4言語で保持する', () => {
  const devices = [
    ['iPhone 15 Pro', [
      'iPhone 15 Pro用の覗き見防止ガラスフィルム',
      'privacy tempered glass screen protector for iPhone 15 Pro',
      'iPhone 15 Pro 防窥钢化玻璃保护膜',
      'iPhone 15 Pro 사생활 보호 강화유리 필름',
    ]],
    ['Galaxy S24 Ultra', [
      'Galaxy S24 Ultra用の覗き見防止ガラスフィルム',
      'privacy tempered glass screen protector for Galaxy S24 Ultra',
      'Galaxy S24 Ultra 防窥钢化玻璃保护膜',
      'Galaxy S24 Ultra 사생활 보호 강화유리 필름',
    ]],
  ];
  for (const [device, queries] of devices) {
    for (const query of queries) {
      for (const marketplace of SEARCH_MARKETPLACES) {
        assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
          `${device} 保護フィルム 強化ガラス 覗き見防止`, `${marketplace}: ${query}`);
      }
    }
  }
});

test('単焦点レンズはマウント・焦点距離・F値を4言語で保持する', () => {
  const cases = [
    ['Sony Eマウント 35mm F1.8 単焦点レンズ', [
      'Sony Eマウント 35mm F1.8の単焦点レンズ',
      'Sony E-mount 35mm F1.8 prime lens',
      '索尼E卡口35mm F1.8定焦镜头',
      '소니 E마운트 35mm F1.8 단렌즈',
    ]],
    ['Canon RFマウント 50mm F1.8 単焦点レンズ', [
      'Canon RFマウント 50mm F1.8の単焦点レンズ',
      'Canon RF-mount 50mm F1.8 prime lens',
      '佳能RF卡口50mm F1.8定焦镜头',
      '캐논 RF마운트 50mm F1.8 단렌즈',
    ]],
  ];
  for (const [expected, queries] of cases) {
    for (const query of queries) {
      for (const marketplace of SEARCH_MARKETPLACES) {
        assert.equal(buildMarketplaceSearchKeywords(query, marketplace), expected, `${marketplace}: ${query}`);
      }
    }
  }
});

test('充電ケーブルは端子組み合わせ・長さ・W数・編み込みを4言語で保持する', () => {
  const cases = [
    ['USB-C to USB-C 2m 60W 編み込み 充電ケーブル', [
      '2m 60Wの編み込みUSB-C to USB-C充電ケーブル',
      '2m 60W braided USB-C to USB-C charging cable',
      '2米60W编织USB-C转USB-C充电线',
      '2m 60W 패브릭 USB-C to USB-C 충전 케이블',
    ]],
    ['USB-C to Lightning 1m 20W 充電ケーブル', [
      '1m 20WのUSB-C to Lightning充電ケーブル',
      '1m 20W USB-C to Lightning charging cable',
      '1米20W USB-C转Lightning充电线',
      '1m 20W USB-C to Lightning 충전 케이블',
    ]],
  ];
  for (const [expected, queries] of cases) {
    for (const query of queries) {
      for (const marketplace of SEARCH_MARKETPLACES) {
        assert.equal(buildMarketplaceSearchKeywords(query, marketplace), expected, `${marketplace}: ${query}`);
      }
    }
  }
});

test('GaN充電器は出力・ポート数・PD・PPS・USB-Cを4言語で保持する', () => {
  const queries = [
    '65W 3ポート GaN PD PPS USB-C充電器',
    '65W 3-port GaN PD PPS USB-C wall charger',
    '65W 3口 GaN PD PPS USB-C充电器',
    '65W 3포트 GaN PD PPS USB-C 충전기',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '65W 3ポート GaN PD PPS USB-C 充電器', `${marketplace}: ${query}`);
    }
  }
});

test('Qi2 3-in-1充電スタンドは出力と対応機器を4言語で保持する', () => {
  const queries = [
    'Qi2 15WでiPhone・Apple Watch・AirPodsを3台同時充電できるワイヤレス充電スタンド',
    'Qi2 15W 3-in-1 wireless charging station for iPhone Apple Watch and AirPods',
    'Qi2 15W 三合一无线充电站，支持iPhone Apple Watch和AirPods',
    'Qi2 15W iPhone Apple Watch AirPods 3개 동시 무선 충전 스탠드',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'Qi2 15W 3-in-1 iPhone Apple Watch AirPods ワイヤレス充電スタンド', `${marketplace}: ${query}`);
    }
  }
});

test('HDMIケーブルは版・長さ・解像度・Hz・認証を4言語で保持する', () => {
  const queries = [
    'HDMI 2.1 2m 8K60Hz 4K120Hz Ultra High Speed認証ケーブル',
    'certified Ultra High Speed HDMI 2.1 cable 2m for 8K60Hz and 4K120Hz',
    'HDMI 2.1 2米 8K60Hz 4K120Hz 超高速认证线',
    'HDMI 2.1 2m 8K60Hz 4K120Hz 초고속 인증 케이블',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'HDMI 2.1 2m 8K60Hz 4K120Hz Ultra High Speed 認証 ケーブル', `${marketplace}: ${query}`);
    }
  }
});

test('DisplayPortケーブルは版・長さ・解像度・Hz・伝送機能を4言語で保持する', () => {
  const queries = [
    'DisplayPort 1.4 2m 8K60Hz 4K144Hz HBR3 DSC対応ケーブル',
    'DisplayPort 1.4 cable 2m with 8K60Hz 4K144Hz HBR3 and DSC',
    'DisplayPort 1.4 2米 8K60Hz 4K144Hz HBR3 DSC连接线',
    'DisplayPort 1.4 2m 8K60Hz 4K144Hz HBR3 DSC 케이블',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'DisplayPort 1.4 2m 8K60Hz 4K144Hz HBR3 DSC ケーブル', `${marketplace}: ${query}`);
    }
  }
});

test('ポータブルSSDは容量・USB世代・速度・耐久条件を4言語で保持する', () => {
  const queries = [
    '耐衝撃のポータブルSSD 1TB USB 3.2 Gen 2 NVMe 読込1050MB/s',
    'shockproof portable SSD 1TB USB 3.2 Gen 2 NVMe read 1050MB/s',
    '耐冲击便携SSD 1TB USB 3.2 Gen 2 NVMe 读取1050MB/s',
    '충격 방지 휴대용 SSD 1TB USB 3.2 Gen 2 NVMe 읽기 1050MB/s',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ポータブルSSD 1TB USB 3.2 Gen 2 読込 1050MB/s NVMe 耐衝撃', `${marketplace}: ${query}`);
    }
  }
});

test('カメラ用SDカードは容量・UHS・速度クラス・読込速度を4言語で保持する', () => {
  const queries = [
    '4Kと8K動画撮影用 SDカード 256GB UHS-II V90 読込300MB/s',
    'SD card 256GB UHS-II V90 read 300MB/s for 4K and 8K video',
    '用于4K和8K视频的SD卡 256GB UHS-II V90 读取300MB/s',
    '4K 8K 영상용 SD 카드 256GB UHS-II V90 읽기 300MB/s',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'SDカード 256GB UHS-II V90 読込 300MB/s 4K動画 8K動画', `${marketplace}: ${query}`);
    }
  }
});

test('ゲーミングモニターは画面・解像度・Hz・パネル・端子を4言語で保持する', () => {
  const queries = [
    '27インチ 4K 144Hz IPS HDMI 2.1 HDR対応ゲーミングモニター',
    '27 inch 4K 144Hz IPS gaming monitor with HDMI 2.1 and HDR',
    '27英寸 4K 144Hz IPS 游戏显示器 支持HDMI 2.1和HDR',
    '27인치 4K 144Hz IPS 게이밍 모니터 HDMI 2.1 HDR 지원',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ゲーミングモニター 27インチ 4K 144Hz IPS HDMI 2.1 HDR', `${marketplace}: ${query}`);
    }
  }
});

test('メカニカルキーボードは配列・サイズ・軸・接続条件を4言語で保持する', () => {
  const queries = [
    '75% JIS日本語配列 赤軸 ホットスワップ Bluetooth 2.4GHz USB-C メカニカルキーボード',
    '75% JIS Japanese red switch hot-swappable mechanical keyboard Bluetooth 2.4GHz USB-C',
    '75% JIS日文配列 红轴 热插拔 机械键盘 蓝牙 2.4GHz USB-C',
    '75% JIS 일본어 배열 적축 핫스왑 기계식 키보드 블루투스 2.4GHz USB-C',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'メカニカルキーボード 75% JIS 日本語配列 赤軸 ホットスワップ Bluetooth 2.4GHz USB-C', `${marketplace}: ${query}`);
    }
  }
});

test('ノイズキャンセリングヘッドホンは形状・Bluetooth・接続・再生時間を4言語で保持する', () => {
  const queries = [
    'オーバーイヤー ノイズキャンセリングヘッドホン Bluetooth 5.3 マルチポイント 40時間 USB-C',
    'over-ear noise-cancelling headphones Bluetooth 5.3 multipoint 40 hours USB-C',
    '头戴式主动降噪耳机 Bluetooth 5.3 多点连接 40小时 USB-C',
    '오버이어 노이즈 캔슬링 헤드폰 Bluetooth 5.3 멀티포인트 40시간 USB-C',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ノイズキャンセリングヘッドホン オーバーイヤー Bluetooth 5.3 マルチポイント 40時間再生 USB-C', `${marketplace}: ${query}`);
    }
  }
});

test('ロボット掃除機本体は測距・吸引力・集塵・水拭き条件を4言語で保持する', () => {
  const queries = [
    'LiDAR 5000Pa 自動ゴミ収集 水拭き対応ロボット掃除機',
    'robot vacuum with LiDAR 5000Pa self-emptying and mopping',
    'LiDAR 5000Pa 自动集尘拖地扫地机器人',
    'LiDAR 5000Pa 자동 먼지 비움 물걸레 로봇 청소기',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ロボット掃除機 LiDAR 5000Pa 自動ゴミ収集 水拭き', `${marketplace}: ${query}`);
    }
  }
});

test('空気清浄機本体は適用面積・HEPA等級・CADR・センサーを4言語で保持する', () => {
  const queries = [
    '50㎡ HEPA H13 CADR 400m³/h PM2.5センサー Wi-Fi対応 空気清浄機',
    'air purifier for 50m² with HEPA H13 CADR 400m³/h PM2.5 sensor and Wi-Fi',
    '50㎡ HEPA H13 CADR 400m³/h PM2.5传感器 Wi-Fi 空气净化器',
    '50㎡ HEPA H13 CADR 400m³/h PM2.5 센서 Wi-Fi 공기청정기',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '空気清浄機 50m² HEPA H13 CADR 400m³/h PM2.5センサー Wi-Fi', `${marketplace}: ${query}`);
    }
  }
});

test('コードレススティック掃除機は吸引力・稼働時間・集塵・照明を4言語で保持する', () => {
  const queries = [
    '240AW 60分 HEPA レーザー照明 コードレススティック掃除機',
    'cordless stick vacuum 240AW 60 minutes HEPA laser light',
    '无线杆式吸尘器 240AW 60分钟 HEPA 激光照明',
    '무선 스틱 청소기 240AW 60분 HEPA 레이저 조명',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'コードレススティック掃除機 240AW 60分 HEPA レーザー照明', `${marketplace}: ${query}`);
    }
  }
});

test('エアフライヤー本体は容量・温度・バスケット・洗浄条件を4言語で保持する', () => {
  const queries = [
    '6L 200℃ デュアルバスケット 食洗機対応 エアフライヤー',
    '6L dual-basket air fryer 200°C dishwasher-safe',
    '6L 200度 双篮 可放洗碗机 空气炸锅',
    '6L 200℃ 듀얼 바스켓 식기세척기 세척 가능 에어프라이어',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'エアフライヤー 6L 200℃ デュアルバスケット 食洗機対応', `${marketplace}: ${query}`);
    }
  }
});

test('全自動エスプレッソマシンは圧力・容量・内蔵機能を4言語で保持する', () => {
  const queries = [
    '15bar 1.5L 内蔵グラインダー ミルクフォーマー 全自動エスプレッソマシン',
    'fully automatic espresso machine 15bar 1.5L built-in grinder milk frother',
    '15bar 1.5L 内置磨豆机 奶泡器 全自动意式咖啡机',
    '15bar 1.5L 내장 그라인더 우유 거품기 전자동 에스프레소 머신',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '全自動エスプレッソマシン 15bar 1.5L 内蔵グラインダー ミルクフォーマー', `${marketplace}: ${query}`);
    }
  }
});

test('スチームオーブンレンジは容量・出力・庫内・センサーを4言語で保持する', () => {
  const queries = [
    '30L 1000W フラット庫内 赤外線センサー スチームオーブンレンジ',
    '30L 1000W flat-bed steam convection microwave oven infrared sensor',
    '30L 1000W 平板内腔 红外传感器 蒸汽烤箱微波炉',
    '30L 1000W 플랫 내부 적외선 센서 스팀 오븐 전자레인지',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'スチームオーブンレンジ 30L 1000W フラット庫内 赤外線センサー', `${marketplace}: ${query}`);
    }
  }
});

test('ドラム式洗濯乾燥機は洗濯乾燥容量と省力機能を4言語で保持する', () => {
  const queries = [
    '洗濯12kg 乾燥6kg ヒートポンプ 洗剤自動投入 ドラム式洗濯乾燥機',
    'front-load washer-dryer 12kg washing 6kg drying heat-pump automatic detergent dispenser',
    '洗涤12kg 烘干6kg 热泵 自动投放洗衣液 滚筒洗烘一体机',
    '세탁 12kg 건조 6kg 히트펌프 세제 자동 투입 드럼 세탁건조기',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ドラム式洗濯乾燥機 洗濯12kg 乾燥6kg ヒートポンプ 洗剤自動投入', `${marketplace}: ${query}`);
    }
  }
});

test('大型冷蔵庫は容量・扉・省電力・製氷条件を4言語で保持する', () => {
  const queries = [
    '500L 観音開き インバーター 自動製氷 冷蔵庫',
    '500L French-door refrigerator inverter automatic ice maker',
    '500L 对开门 变频 自动制冰 冰箱',
    '500L 프렌치도어 인버터 자동 제빙 냉장고',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '冷蔵庫 500L 観音開き インバーター 自動製氷', `${marketplace}: ${query}`);
    }
  }
});

test('ビルトイン食器洗い乾燥機は収納人数・幅・運転機能を4言語で保持する', () => {
  const queries = [
    '12人分 幅45cm インバーター 自動ドアオープン ビルトイン食器洗い乾燥機',
    'built-in dishwasher 12 place settings 45cm inverter auto-open door',
    '嵌入式洗碗机 12套餐具 45cm 变频 自动开门',
    '빌트인 식기세척기 12인용 45cm 인버터 자동 문열림',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ビルトイン食器洗い乾燥機 12人分 幅45cm インバーター 自動ドアオープン', `${marketplace}: ${query}`);
    }
  }
});

test('有機ELテレビは画面・解像度・Hz・端子・映像規格を4言語で保持する', () => {
  const queries = [
    '65型 4K 120Hz HDMI 2.1 Dolby Vision 有機ELテレビ',
    '65 inch 4K 120Hz HDMI 2.1 Dolby Vision OLED TV',
    '65英寸 4K 120Hz HDMI 2.1 Dolby Vision OLED电视',
    '65인치 4K 120Hz HDMI 2.1 Dolby Vision OLED 텔레비전',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '有機ELテレビ 65型 4K 120Hz HDMI 2.1 Dolby Vision', `${marketplace}: ${query}`);
    }
  }
});

test('レーザープロジェクターは解像度・明るさ・投写比・OSを4言語で保持する', () => {
  const queries = [
    '4K 3000 ANSIルーメン 投写比1.2:1 レーザー Android TV プロジェクター',
    '4K laser projector 3000 ANSI lumens throw ratio 1.2:1 Android TV',
    '4K 3000 ANSI流明 投射比1.2:1 激光 Android TV 投影仪',
    '4K 3000 ANSI 루멘 투사비 1.2:1 레이저 Android TV 프로젝터',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'レーザープロジェクター 4K 3000 ANSIルーメン 投写比1.2:1 Android TV', `${marketplace}: ${query}`);
    }
  }
});

test('Dolby Atmosサウンドバーはチャンネル・端子・低音構成を4言語で保持する', () => {
  const queries = [
    '5.1.2ch Dolby Atmos HDMI eARC ワイヤレスサブウーファー サウンドバー',
    '5.1.2ch Dolby Atmos soundbar HDMI eARC wireless subwoofer',
    '5.1.2声道 Dolby Atmos HDMI eARC 无线低音炮 回音壁',
    '5.1.2채널 Dolby Atmos HDMI eARC 무선 서브우퍼 사운드바',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'サウンドバー 5.1.2ch Dolby Atmos HDMI eARC ワイヤレスサブウーファー', `${marketplace}: ${query}`);
    }
  }
});

test('フルサイズミラーレスカメラは画素・動画・手ぶれ補正・記録構成を4言語で保持する', () => {
  const queries = [
    '2400万画素 4K60p ボディ内手ぶれ補正 デュアルカードスロット フルサイズミラーレスカメラ',
    '24MP full-frame mirrorless camera 4K60p in-body image stabilization dual card slots',
    '2400万像素 4K60p 机身防抖 双卡槽 全画幅无反相机',
    '2400만 화소 4K60p 바디 손떨림 보정 듀얼 카드 슬롯 풀프레임 미러리스 카메라',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'フルサイズミラーレスカメラ 2400万画素 4K60p ボディ内手ぶれ補正 デュアルカードスロット', `${marketplace}: ${query}`);
    }
  }
});

test('ゲーミングノートPCは画面・GPU・メモリ・SSD・Hzを4言語で保持する', () => {
  const queries = [
    '16型 RTX 4070 32GBメモリ 1TB SSD 240Hz ゲーミングノートPC',
    '16 inch RTX 4070 gaming laptop 32GB RAM 1TB SSD 240Hz',
    '16英寸 RTX 4070 32GB内存 1TB SSD 240Hz 游戏本',
    '16인치 RTX 4070 32GB 램 1TB SSD 240Hz 게이밍 노트북',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ゲーミングノートPC 16型 RTX 4070 32GB RAM 1TB SSD 240Hz', `${marketplace}: ${query}`);
    }
  }
});

test('NAS本体はベイ数・通信速度・メモリ・キャッシュ・ディスク条件を4言語で保持する', () => {
  const queries = [
    '4ベイ NAS 2.5GbE 8GBメモリ NVMeキャッシュ ディスクレス',
    '4-bay NAS 2.5GbE 8GB RAM NVMe cache diskless',
    '4盘位 NAS 2.5GbE 8GB内存 NVMe缓存 无盘',
    '4베이 NAS 2.5GbE 8GB 램 NVMe 캐시 디스크리스',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'NAS本体 4ベイ 2.5GbE 8GB RAM NVMeキャッシュ ディスクレス', `${marketplace}: ${query}`);
    }
  }
});

test('Wi-Fi 7メッシュルーターは速度・帯域・台数・有線条件を4言語で保持する', () => {
  const queries = [
    'Wi-Fi 7 メッシュルーター BE11000 トライバンド 2台セット 2.5GbE',
    'WiFi 7 mesh router BE11000 tri-band 2-pack 2.5GbE',
    'WiFi 7 Mesh路由器 BE11000 三频 2只装 2.5GbE',
    'WiFi 7 메시 와이파이 공유기 BE11000 트라이밴드 2개 세트 2.5GbE',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'Wi-Fi 7 メッシュルーター BE11000 トライバンド 2台セット 2.5GbE', `${marketplace}: ${query}`);
    }
  }
});

test('FDM 3Dプリンターは方式・造形サイズ・速度・調整・筐体条件を4言語で保持する', () => {
  const queries = [
    'CoreXY 3Dプリンター 256×256×256mm 600mm/s 自動レベリング 密閉型',
    'CoreXY 3D printer 256x256x256 mm 600 mm/s automatic bed leveling enclosed',
    'CoreXY 3D打印机 256×256×256mm 600mm/s 自动调平 封闭式',
    'CoreXY 3D 프린터 256×256×256mm 600mm/s 자동 레벨링 밀폐형',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'FDM 3Dプリンター CoreXY 256×256×256mm 600mm/s 自動レベリング 密閉型', `${marketplace}: ${query}`);
    }
  }
});

test('ロボット芝刈り機は測位・面積・検知・境界条件を4言語で保持する', () => {
  const queries = [
    'RTK ロボット芝刈り機 1000㎡ 障害物検知 境界ワイヤー不要',
    'RTK robotic lawn mower 1000 m2 obstacle avoidance boundary wire free',
    'RTK 割草机器人 1000平方米 障碍物检测 无需边界线',
    'RTK 로봇 잔디깎이 1000제곱미터 장애물 감지 경계선 불필요',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ロボット芝刈り機 RTK 1000㎡ 障害物検知 境界ワイヤー不要', `${marketplace}: ${query}`);
    }
  }
});

test('折りたたみ電動アシスト自転車は車輪・出力・電池・航続条件を4言語で保持する', () => {
  const queries = [
    '20インチ 折りたたみ電動アシスト自転車 500W 48V 15Ah 航続80km',
    '20 inch folding electric bike 500W 48V 15Ah 80km range',
    '20英寸 折叠电动自行车 500W 48V 15Ah 续航80km',
    '20인치 접이식 전기 자전거 500W 48V 15Ah 주행거리 80km',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '折りたたみ電動アシスト自転車 20インチ 500W 48V 15Ah 航続80km', `${marketplace}: ${query}`);
    }
  }
});

test('ポータブル電源は電池種・容量・出力・UPS・ソーラー条件を4言語で保持する', () => {
  const queries = [
    'リン酸鉄 ポータブル電源 1536Wh 定格出力2000W UPS ソーラー入力500W',
    'LiFePO4 portable power station 1536Wh rated output 2000W UPS solar input 500W',
    '磷酸铁 便携式储能电源 1536Wh 额定功率2000W UPS 太阳能输入500W',
    '리튬인산철 휴대용 파워뱅크 1536Wh 정격 출력 2000W UPS 태양광 입력 500W',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'ポータブル電源 LiFePO4 1536Wh 定格出力2000W UPS ソーラー入力500W', `${marketplace}: ${query}`);
    }
  }
});

test('除湿機は方式・能力・タンク・衣類乾燥・排水条件を4言語で保持する', () => {
  const queries = [
    'コンプレッサー式 除湿機 20L/日 タンク4L 衣類乾燥 連続排水',
    'compressor dehumidifier 20L/day tank 4L laundry drying continuous drainage',
    '压缩机式 除湿机 20L每天 水箱4L 衣物干燥 连续排水',
    '컴프레서식 제습기 20L/일 물통4L 의류 건조 연속 배수',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'コンプレッサー式除湿機 20L/日 タンク4L 衣類乾燥 連続排水', `${marketplace}: ${query}`);
    }
  }
});

test('電動昇降デスクは天板サイズ・モーター・メモリ・安全条件を4言語で保持する', () => {
  const queries = [
    '天板140×70cm デュアルモーター 電動昇降デスク 4メモリ 衝突防止',
    '140x70 cm dual-motor electric standing desk 4 memory presets anti-collision',
    '140×70cm 双电机 电动升降桌 4档记忆 防碰撞',
    '140×70cm 듀얼 모터 전동 스탠딩 데스크 4메모리 충돌 방지',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '電動昇降デスク 140×70cm デュアルモーター 4メモリ 衝突防止', `${marketplace}: ${query}`);
    }
  }
});

test('オフィスチェアは支持機能・肘掛け・素材・耐荷重を4言語で保持する', () => {
  const queries = [
    'エルゴノミクスオフィスチェア ヘッドレスト 腰サポート 4D肘掛け メッシュ 耐荷重150kg',
    'ergonomic office chair headrest lumbar support 4D armrests mesh weight capacity 150kg',
    '人体工学办公椅 头枕 腰部支撑 4D扶手 网布 承重150kg',
    '인체공학 사무용 의자 헤드레스트 요추 지지 4D 팔걸이 메쉬 하중 150kg',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'エルゴノミクスオフィスチェア ヘッドレスト 腰サポート 4D肘掛け メッシュ 耐荷重150kg', `${marketplace}: ${query}`);
    }
  }
});

test('スマートロックは認証・通信・施錠・非常解錠条件を4言語で保持する', () => {
  const queries = [
    '後付けスマートロック 指紋 暗証番号 Matter オートロック 非常用キー',
    'retrofit smart lock fingerprint keypad Matter auto-lock emergency key',
    '后装智能门锁 指纹 密码 Matter 自动上锁 应急钥匙',
    '설치형 스마트 도어락 지문 비밀번호 Matter 자동 잠금 비상 키',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '後付けスマートロック 指紋 暗証番号 Matter オートロック 非常用キー', `${marketplace}: ${query}`);
    }
  }
});

test('SNSで見たAndroid光るケースもGalaxyとPixelの機種条件を4言語で保持する', () => {
  const cases = [
    [
      [
        'TikTokで見た光るGalaxy S24 UltraケースでMagSafe対応',
        'a glowing MagSafe Galaxy S24 Ultra case seen on TikTok',
        'TikTok看到的发光磁吸Galaxy S24 Ultra手机壳',
        '틱톡에서 본 빛나는 맥세이프 Galaxy S24 Ultra 케이스',
      ],
      'Galaxy S24 Ultra ケース 光る MagSafe対応',
    ],
    [
      [
        'TikTokで見た光るPixel 9 ProケースでMagSafe対応',
        'a glowing MagSafe Pixel 9 Pro case seen on TikTok',
        'TikTok看到的发光磁吸Pixel 9 Pro手机壳',
        '틱톡에서 본 빛나는 맥세이프 Pixel 9 Pro 케이스',
      ],
      'Pixel 9 Pro ケース 光る MagSafe対応',
    ],
  ];
  for (const [queries, expected] of cases) {
    for (const query of queries) {
      for (const marketplace of SEARCH_MARKETPLACES) {
        assert.equal(buildMarketplaceSearchKeywords(query, marketplace), expected, `${marketplace}: ${query}`);
      }
    }
  }
});

test('モバイルバッテリーの容量と内蔵ケーブルを4言語で保持する', () => {
  const queries = [
    '旅行用のUSB-Cケーブル内蔵10000mAhモバイルバッテリー',
    '10000mAh power bank with built-in USB-C cable for travel',
    '旅行用自带USB-C线的10000mAh充电宝',
    '여행용 USB-C 케이블 내장 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー USB-Cケーブル内蔵', `${marketplace}: ${query}`);
    }
  }
});

test('磁気吸着モバイルバッテリーを4言語でMagSafe商品語へ統一する', () => {
  const queries = [
    'iPhone用MagSafe対応5000mAhモバイルバッテリー',
    '5000mAh magnetic MagSafe power bank for iPhone',
    '苹果手机用5000mAh磁吸充电宝',
    '아이폰용 맥세이프 자석 5000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '5000mAh モバイルバッテリー MagSafe対応', `${marketplace}: ${query}`);
    }
  }
});

test('モバイルバッテリーのPD出力を4言語で保持する', () => {
  const queries = [
    'PD20W急速充電10000mAhモバイルバッテリー',
    '10000mAh power bank with 20W USB-C PD fast charging',
    '支持20W PD快充的10000mAh充电宝',
    'PD 20W 고속충전 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W', `${marketplace}: ${query}`);
    }
  }
});

test('モバイルバッテリーの容量訂正は4言語で最終条件だけを保持する', () => {
  const queries = [
    '20000mAhじゃなく10000mAhのPD20Wモバイルバッテリー',
    'not 20000mAh, I want a 10000mAh PD20W power bank',
    '不要20000mAh，要10000mAh的PD20W充电宝',
    '20000mAh 말고 10000mAh PD20W 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W', `${marketplace}: ${query}`);
    }
  }
});

test('ロボット掃除機の交換部品を4言語で本体から分離し型番と個数を保つ', () => {
  const cases = [
    ['ルンバ j7用 交換フィルター 3個セット', 'Roomba j7 交換フィルター 3個セット'],
    ['replacement filters for Roomba j7 3 pack', 'Roomba j7 交換フィルター 3個セット'],
    ['适用于Roomba j7的替换滤网3件套', 'Roomba j7 交換フィルター 3個セット'],
    ['룸바 j7용 교체 필터 3개 세트', 'Roomba j7 交換フィルター 3個セット'],
    ['Roomba i7+ replacement side brushes 2 pack', 'Roomba i7+ 交換サイドブラシ 2個セット'],
    ['ルンバ s9+用 交換紙パック 6枚', 'Roomba s9+ 交換紙パック 6個セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('ロボット掃除機の複数交換パーツセットを4言語で単品から分離する', () => {
  const cases = [
    'ルンバ j7用 交換パーツセット フィルター サイドブラシ メインブラシ',
    'replacement parts kit for Roomba j7 with filter side brushes and roller brush',
    '适用于Roomba j7的配件套装 滤网 边刷 滚刷',
    '룸바 j7용 교체 부품 세트 필터 사이드 브러시 롤러 브러시',
    'ルンバ j7用 フィルターとサイドブラシとメインブラシ',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      assert.equal(
        buildMarketplaceSearchKeywords(input, marketplace),
        'Roomba j7 交換パーツセット フィルター サイドブラシ メインブラシ',
        `${marketplace}: ${input}`
      );
    }
  }
});

test('Dyson掃除機のフィルター・バッテリー・充電器を4言語で本体から分離する', () => {
  const cases = [
    ['Dyson V15用 交換HEPAフィルター 2個セット', 'Dyson V15 交換HEPAフィルター 2個セット'],
    ['replacement HEPA filters for Dyson V15 2 pack', 'Dyson V15 交換HEPAフィルター 2個セット'],
    ['戴森V15替换HEPA滤网2件套', 'Dyson V15 交換HEPAフィルター 2個セット'],
    ['다이슨 V15용 교체 HEPA 필터 2개 세트', 'Dyson V15 交換HEPAフィルター 2個セット'],
    ['replacement battery for Dyson V11 5000mAh', 'Dyson V11 交換バッテリー 5000mAh'],
    ['다이슨 V10용 교체 배터리 4000mAh', 'Dyson V10 交換バッテリー 4000mAh'],
    ['Dyson V12 充電器', 'Dyson V12 充電器'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('空気清浄機の交換フィルターを4ブランド・4言語で本体から分離する', () => {
  const cases = [
    ['シャープ KC-R50用 集じんフィルター FZ-D50HF', 'Sharp KC-R50 交換集じんフィルター FZ-D50HF'],
    ['replacement HEPA filter for Levoit Core 300', 'Levoit Core 300 交換HEPAフィルター'],
    ['适用于小米空气净化器4 Lite的替换滤芯', 'Xiaomi Air Purifier 4 Lite 交換フィルター'],
    ['삼성 AX60R5080WD 교체 헤파 필터', 'Samsung AX60R5080WD 交換HEPAフィルター'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('浄水器の交換カートリッジを4ブランド・4言語で本体から分離する', () => {
  const cases = [
    ['BRITA MAXTRA PRO 交換カートリッジ 3個', 'BRITA MAXTRA PRO 交換カートリッジ 3個セット'],
    ['replacement cartridge for Toray MKC.MX2J 2 pack', 'Toray MKC.MX2J 交換カートリッジ 2個セット'],
    ['三菱丽阳可菱水HGC9S替换滤芯', 'Cleansui HGC9S 交換カートリッジ'],
    ['파나소닉 TK-CJ24용 교체 카트리지 TK-CJ24C1', 'Panasonic TK-CJ24 交換カートリッジ TK-CJ24C1'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('プリンターのインクを4ブランド・4言語で本体から分離し品番と種別を保つ', () => {
  const cases = [
    ['Canon PIXUS TS8730用 純正インク BCI-331+330 6色', 'Canon PIXUS TS8730 純正インクカートリッジ BCI-331+330 6色'],
    ['compatible ink cartridges for Epson EP-881A KAM-6CL-L 6 color', 'Epson EP-881A 互換インクカートリッジ KAM-6CL-L 6色'],
    ['适用于Brother DCP-J928N的LC411-4PK原装墨盒', 'Brother DCP-J928N 純正インクカートリッジ LC411-4PK'],
    ['HP DeskJet 2720 67XL 정품 잉크 검정 컬러', 'HP DeskJet 2720 純正インクカートリッジ 67XL 黒 カラー'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('電動歯ブラシの替えブラシを4言語で本体から分離し種類と本数を保つ', () => {
  const cases = [
    ['Oral-B iO Series 6用 アルティメイトクリーン 替えブラシ 4本', 'Oral-B iO Series 6 替えブラシ Ultimate Clean 4本セット'],
    ['replacement brush heads for Philips Sonicare HX9911 C3 Premium Plaque Control 4 pack', 'Philips Sonicare HX9911 替えブラシ C3 Premium Plaque Control 4本セット'],
    ['适用于松下Doltz EW-DP57的WEW0917替换刷头2支', 'Panasonic Doltz EW-DP57 替えブラシ WEW0917 2本セット'],
    ['오랄비 Pro 3용 크로스액션 부드러운 교체 칫솔모 4개', 'Oral-B Pro 3 替えブラシ CrossAction やわらかめ 4本セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('シェーバーの替刃と洗浄液を4言語で本体から分離し品番を保つ', () => {
  const cases = [
    ['Braun Series 9 Pro用 替刃 94M', 'Braun Series 9 Pro 替刃 94M'],
    ['replacement shaving heads SH91/51 for Philips S9000', 'Philips S9000 替刃 SH91/51'],
    ['适用于松下Lamdash ES-LV9W的WES9600替换刀头 5枚刃', 'Panasonic Lamdash ES-LV9W 替刃 WES9600 5枚刃'],
    ['브라운 Clean & Renew CCR6 세정액 카트리지 6개', 'Braun Clean & Renew 洗浄液カートリッジ CCR6 6個セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('コーヒーカプセルを4言語で本体から分離し規格と個数を保つ', () => {
  const cases = [
    ['ネスプレッソ オリジナル コーヒーカプセル 50個', 'Nespresso Original コーヒーカプセル 50個セット'],
    ['Nespresso Vertuo coffee capsules 30 pods', 'Nespresso Vertuo コーヒーカプセル 30個セット'],
    ['雀巢 Dolce Gusto 咖啡胶囊 16粒', 'Nescafe Dolce Gusto コーヒーカプセル 16個セット'],
    ['네스프레소 오리지널 커피 캡슐 50개', 'Nespresso Original コーヒーカプセル 50個セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('カメラ交換バッテリーを4言語で本体と充電器から分離し型番を保つ', () => {
  const cases = [
    ['Sony α7 IV用 純正カメラバッテリー NP-FZ100 2個', 'Sony NP-FZ100 カメラバッテリー 純正 2個セット'],
    ['replacement camera battery NP-FW50 for Sony a6400 2 pack', 'Sony NP-FW50 カメラバッテリー 2個セット'],
    ['佳能 EOS R6 Mark II 原装相机电池 LP-E6NH 1块', 'Canon LP-E6NH カメラバッテリー 純正 1個セット'],
    ['니콘 Z6 II 정품 카메라 배터리 EN-EL15c 2개', 'Nikon EN-EL15C カメラバッテリー 純正 2個セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('電動工具バッテリーを4言語で本体と充電器から分離し電圧容量を保つ', () => {
  const cases = [
    ['マキタ 純正 18V 6.0Ah 電動工具バッテリー BL1860B 2個', 'Makita BL1860B 電動工具バッテリー 18V 6Ah 純正 2個セット'],
    ['DeWalt DCB184 18V 5Ah replacement power tool battery 2 pack', 'DeWalt DCB184 電動工具バッテリー 18V 5Ah 2個セット'],
    ['博世 GBA 18V 5.0Ah 原装电动工具电池 1块', 'Bosch GBA 電動工具バッテリー 18V 5Ah 純正 1個セット'],
    ['밀워키 M18 B5 18V 5.0Ah 정품 공구 배터리 2개', 'Milwaukee M18 B5 電動工具バッテリー 18V 5Ah 純正 2個セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('ラベルライターテープを4言語で本体から分離し品番幅色を保つ', () => {
  const cases = [
    ['ブラザー P-touch 純正ラベルテープ TZe-231 12mm 黒文字 白 2個', 'Brother P-touch TZE-231 ラベルテープ 12mm 黒文字 白 純正 2個セット'],
    ['DYMO D1 45013 12mm black on white genuine label tape 2 pack', 'DYMO D1 45013 ラベルテープ 12mm 黒文字 白 純正 2個セット'],
    ['卡西欧 XR-12WE 12毫米 黑字白底 原装标签带 2盒', 'CASIO XR-12WE ラベルテープ 12mm 黒文字 白 純正 2個セット'],
    ['킹짐 Tepra SS12K 12mm 검정 글씨 흰색 정품 라벨 테이프 2개', 'King Jim Tepra SS12K ラベルテープ 12mm 黒文字 白 純正 2個セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('エアフライヤーライナーを4言語で本体から分離し容量素材形状枚数を保つ', () => {
  const cases = [
    ['Philips NA230用 6.2L 紙 エアフライヤーライナー 丸型 100枚', 'Philips NA230 エアフライヤーライナー 6.2L 紙 丸型 100枚セット'],
    ['Ninja AF400 9.5L dual basket paper air fryer liners 100 pack', 'Ninja AF400 エアフライヤーライナー 9.5L 紙 デュアルバスケット 100枚セット'],
    ['科西 Cosori CP158 5.5L 方形空气炸锅纸垫 100张', 'Cosori CP158 エアフライヤーライナー 5.5L 紙 角型 100枚セット'],
    ['인스턴트 볼텍스 5.7L 원형 실리콘 에어프라이어 라이너 2개', 'Instant Vortex エアフライヤーライナー 5.7L シリコン 丸型 2枚セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('掃除機紙パックを4言語で本体とフィルターから分離し規格品番枚数を保つ', () => {
  const cases = [
    ['ミーレ HyClean Pure FJM 純正 掃除機紙パック 4枚', 'Miele HyClean Pure FJM 掃除機紙パック 純正 4枚セット'],
    ['Miele HyClean Pure GN vacuum dust bags 4 pack', 'Miele HyClean Pure GN 掃除機紙パック 4枚セット'],
    ['飞利浦 s-bag FC8021/03 原装吸尘器集尘袋 4个', 'Philips s-bag FC8021/03 掃除機紙パック 純正 4枚セット'],
    ['보쉬 Type G ALL BBZ41FGALL 정품 진공청소기 먼지봉투 4개', 'Bosch Type G ALL BBZ41FGALL 掃除機紙パック 純正 4枚セット'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test("英語200件・中国語400件の重点コーパスを追加する", () => {
  const corpus = buildEnglishChineseStressCorpus();
  assert.equal(corpus.length, 600);
  assert.equal(corpus.filter((item) => item.locale === "en").length, 200);
  assert.equal(corpus.filter((item) => item.locale === "zh").length, 400);
  assert.equal(new Set(corpus.map((item) => item.case_id)).size, corpus.length);
});

test("検索語評価は必須条件の欠落・禁止条件・空・長すぎる語を分ける", () => {
  const score = scoreMarketplaceQueryCase(
    {
      case_id: "sample",
      locale: "ja",
      category: "earphones",
      required_tokens: ["透明", "イヤホン"],
      forbidden_tokens: ["有線"],
      max_length: 20,
    },
    "透明 有線 イヤホン",
  );
  assert.equal(score.passed, false);
  assert.deepEqual(score.missing_required, []);
  assert.deepEqual(score.leaked_forbidden, ["有線"]);
});

test("Qoo10向け検索語は640件と重要な負例で必須条件を保持する", () => {
  const cases = [
    ...buildMarketplaceQueryCorpus(),
    ...buildEnglishChineseStressCorpus(),
    ...MARKETPLACE_QUERY_NEGATIVE_CASES,
  ];
  const report = evaluateMarketplaceQueryCorpus(
    cases,
    (input) => buildQoo10SearchKeywords(input),
  );
  assert.equal(report.overall.cases, 1256);
  assert.equal(report.overall.pass_rate, 1, JSON.stringify(report.failures.slice(0, 10), null, 2));
  assert.equal(report.overall.empty_rate, 0);
  assert.equal(report.overall.required_token_violation_rate, 0);
  assert.equal(report.overall.forbidden_token_leak_rate, 0);
  for (const locale of ["ja", "en", "zh", "ko"]) {
    assert.equal(report.by_locale[locale].pass_rate, 1);
  }
});

test("4言語の検索条件を全検索対応モール向けに欠落なく変換する", () => {
  const baseCases = [
    ...buildMarketplaceQueryCorpus(),
    ...buildEnglishChineseStressCorpus(),
    ...MARKETPLACE_QUERY_NEGATIVE_CASES,
  ];
  const cases = SEARCH_MARKETPLACES.flatMap((marketplace) =>
    baseCases.map((item) => ({ ...item, marketplace })),
  );
  const report = evaluateMarketplaceQueryCorpus(
    cases,
    (input, testCase) => buildMarketplaceSearchKeywords(input, testCase.marketplace),
  );
  assert.equal(report.overall.cases, 11304);
  assert.equal(report.overall.pass_rate, 1, JSON.stringify(report.failures.slice(0, 10), null, 2));
  for (const marketplace of SEARCH_MARKETPLACES) {
    assert.equal(report.by_marketplace[marketplace].cases, 1256);
    assert.equal(report.by_marketplace[marketplace].pass_rate, 1);
  }
});

test("商品名を省いた4言語の説明検索を9モール向け商品語へ変換する", () => {
  const cases = [
    ['a black charging dock that holds two devices at once', 'デュアル充電器'],
    ['可以同时放两台设备的黑色双充电座', 'デュアル充電器'],
    ['기기 두 대를 동시에 올리는 검은색 듀얼 충전 거치대', 'デュアル充電器'],
    ['a white dome network camera that can pan and tilt', 'PTZ ネットワークカメラ'],
    ['可以云台转动的白色球形网络摄像头', 'PTZ ネットワークカメラ'],
    ['회전할 수 있는 흰색 돔형 네트워크 카메라', 'PTZ ネットワークカメラ'],
    ['the warm metal bars mounted on a bathroom wall', 'タオルウォーマー'],
    ['浴室墙上会发热的金属杆', 'タオルウォーマー'],
    ['욕실 벽에 달린 따뜻해지는 금속 막대', 'タオルウォーマー'],
    ['the nice-smelling powder my mother used', '香り付きボディパウダー'],
    ['妈妈以前用的有香味的粉', '香り付きボディパウダー'],
    ['엄마가 쓰던 향기 좋은 파우더', '香り付きボディパウダー'],
    ['a small silver instrument you play by blowing with your mouth', 'ハーモニカ'],
    ['用嘴吹奏的银色小乐器', 'ハーモニカ'],
    ['입으로 불어서 연주하는 은색 작은 악기', 'ハーモニカ'],
    ['something soft and wintry to put on a sofa', '冬 クッション'],
    ['放在沙发上的冬季柔软装饰', '冬 クッション'],
    ['소파에 놓는 겨울 느낌의 푹신한 것', '冬 クッション'],
    ['a silver horizontal six-light fixture above a bathroom mirror', '浴室 6灯 照明'],
    ['浴室镜子上方的银色横向六灯照明', '浴室 6灯 照明'],
    ['욕실 거울 위의 은색 가로형 6등 조명', '浴室 6灯 照明'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.match(keywords, new RegExp(required), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.length <= 48, `${marketplace}: ${keywords}`);
    }
  }
});

test("否定した商品種別と色を9モール検索語から除外する", () => {
  const cases = [
    ['充電器ではなくiPhone 15用の透明ケース', ['iPhone 15ケース'], ['充電器']],
    ['an iPhone 15 clear case, not a charger', ['iPhone 15ケース'], ['充電器']],
    ['不要充电器，想要iPhone 15透明手机壳', ['iPhone 15ケース'], ['充電器']],
    ['충전기 말고 iPhone 15용 투명 케이스', ['iPhone 15ケース'], ['充電器']],
    ['赤ではなく黒い財布', ['黒', '財布'], ['赤']],
    ['a black wallet, not red', ['黒', '財布'], ['赤']],
    ['不要红色，要黑色钱包', ['黒', '財布'], ['赤']],
    ['빨간색 말고 검은색 지갑', ['黒', '財布'], ['赤', 'シルバー']],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.match(keywords, new RegExp(token), `${marketplace}: ${input}`);
      for (const token of forbidden) assert.doesNotMatch(keywords, new RegExp(token), `${marketplace}: ${input}`);
    }
  }
  assert.match(buildMarketplaceSearchKeywords('은색 지갑', 'QOO10_JP'), /シルバー 財布/);
});

test("4言語の素材・互換機種・容量寸法を9モールの検索語に保持する", () => {
  const cases = [
    ['黒い20Lのナイロン製自転車バックパック、革ではない', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['a black 20 L nylon cycling backpack, not leather', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['黑色20升尼龙骑行背包，不要皮革', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['검은색 20리터 나일론 자전거 백팩, 가죽 말고', ['20L', 'ナイロン', 'バックパック'], ['革']],
    ['iPhone 15用の透明シリコンケース、革ではない', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['a clear silicone case for iPhone 15, not leather', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['iPhone 15透明硅胶手机壳，不要皮革', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['가죽 말고 iPhone 15용 투명 실리콘 케이스', ['シリコン', '透明', 'iPhone 15ケース'], ['革']],
    ['52mmのガラス製カメラフィルター', ['52mm', 'ガラス', 'カメラフィルター'], []],
    ['10×5×6インチの木製収納ボックス', ['10x5x6インチ', '木製', '収納ボックス'], []],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の予算を除外し対象者・利用場面を9モールの商品語へ保持する", () => {
  const cases = [
    ['5000円以下の男性用防水バックパック', ['メンズ', '防水', 'バックパック'], ['5000', '円']],
    ["a waterproof men's backpack under $50", ['メンズ', '防水', 'バックパック'], ['50', '$']],
    ['预算300元以内的男士用防水背包', ['メンズ', '防水', 'バックパック'], ['300', '元']],
    ['예산 5만원 이하 남성용 방수 백팩', ['メンズ', '防水', 'バックパック'], ['5', '만원']],
    ['通勤用の軽量バックパック', ['通勤', '軽量', 'バックパック'], []],
    ['a lightweight backpack for commuting', ['通勤', '軽量', 'バックパック'], []],
    ['通勤用轻量背包', ['通勤', '軽量', 'バックパック'], []],
    ['출퇴근용 경량 백팩', ['通勤', '軽量', 'バックパック'], []],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の年齢はキッズ用途へ変換しレビュー件数は9モール検索語から除外する", () => {
  const cases = [
    ['12歳の子供用防水バックパック', ['キッズ', '防水', 'バックパック'], ['12']],
    ['a waterproof backpack for a 12-year-old', ['キッズ', '防水', 'バックパック'], ['12']],
    ['适合12岁儿童的防水背包', ['キッズ', '防水', 'バックパック'], ['12']],
    ['12세 아이용 방수 백팩', ['キッズ', '防水', 'バックパック'], ['12']],
    ['口コミ1000件以上の黒い財布', ['黒', '財布'], ['1000']],
    ['a black wallet with over 1000 reviews', ['黒', '財布'], ['1000']],
    ['有1000条以上评价的黑色钱包', ['黒', '財布'], ['1000']],
    ['리뷰 1000개 이상인 검은색 지갑', ['黒', '財布'], ['1000']],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語のセット数量を9モール向けに統一し否定数量を除外する", () => {
  const cases = [
    ['12個入りセットの香り付きキャンドル', ['12個セット', 'キャンドル'], []],
    ['a 12-pack of scented candles', ['12個セット', 'キャンドル'], []],
    ['12件套香薰蜡烛', ['12個セット', 'キャンドル'], []],
    ['12개 세트 향초 캔들', ['12個セット', 'キャンドル'], []],
    ['12個セットではなく6個セットのキャンドル', ['6個セット', 'キャンドル'], ['12個セット']],
    ['not a 12-pack, but a 6-pack of candles', ['6個セット', 'キャンドル'], ['12個セット']],
    ['不要12件套，要6件套蜡烛', ['6個セット', 'キャンドル'], ['12個セット']],
    ['12개 세트 말고 6개 세트 캔들', ['6個セット', 'キャンドル'], ['12個セット']],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, required, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const token of required) assert.ok(keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
      for (const token of forbidden) assert.ok(!keywords.includes(token), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の空白付き容量でも希望容量だけを9モール検索語へ保持する", () => {
  const cases = [
    '64 GBではなく128 GBのiPhone 15ケース',
    'not 64 GB but 128 GB iPhone 15 case',
    '不要64 GB，要128 GB的iPhone 15手机壳',
    '64 GB 말고 128 GB iPhone 15 케이스',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('iPhone 15ケース'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('128GB'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('64GB'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の自己訂正では否定後に言い直した属性を9モール検索語へ保持する", () => {
  const cases = [
    '最初は黒を避けたかったが、やっぱり黒い財布',
    'not black at first, but actually a black wallet',
    '一开始不要黑色，后来决定要黑色钱包',
    '처음에는 검정 말고 생각했지만 결국 검정 지갑',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('黒'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('財布'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の比較寸法を予算と誤認せず9モール向け共通単位へ変換する", () => {
  const cases = [
    '幅50センチ以下の収納ボックス',
    'a storage box under 50 cm wide',
    '宽度不超过50厘米的收纳盒',
    '너비 50센티미터 이하 수납함',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('50cm'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('収納ボックス'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の否定寸法は除外し訂正寸法だけを9モール検索語へ保持する", () => {
  const cases = [
    '50センチではなく40センチの収納ボックス',
    'not 50 cm but a 40 cm storage box',
    '不要50厘米，要40厘米的收纳盒',
    '50센티미터 말고 40센티미터 수납함',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('40cm'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('50cm'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の重量条件を9モール向け共通単位へ変換する", () => {
  const cases = [
    '2キロ以下のバックパック',
    'a backpack under 2 kilograms',
    '不超过2公斤的背包',
    '2킬로그램 이하 백팩',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('2kg'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('バックパック'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の訂正重量は旧条件を除外し最終重量だけを9モール検索語へ保持する", () => {
  const cases = [
    '3キロではなく2キロ以下のバックパック',
    'not 3 kg but a backpack under 2 kilograms',
    '不要3公斤，要2公斤的背包',
    '3킬로그램 말고 2킬로그램 이하 백팩',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('2kg'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('3kg'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の小数重量は9モール検索語でも完全な値だけを保持する", () => {
  const cases = [
    '2.5kgではなく1.5kgのバックパック',
    'not 2.5kg but a 1.5kg backpack',
    '不要2.5kg，要1.5kg的背包',
    '2.5kg 말고 1.5kg 백팩',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('1.5kg'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('2.5kg'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!/(?:^|\s)5kg(?:\s|$)/u.test(keywords), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("iPhoneとGalaxyの現地語端末名を9モール向け互換型番へ統一する", () => {
  const cases = [
    ['アイフォン15 Proの透明ケース', 'iPhone 15 Proケース'],
    ['iPhone 15 Pro clear case', 'iPhone 15 Proケース'],
    ['苹果手机15 Pro透明手机壳', 'iPhone 15 Proケース'],
    ['아이폰15 Pro 투명 케이스', 'iPhone 15 Proケース'],
    ['ギャラクシーS24 Ultraのケース', 'Galaxy S24 Ultra ケース'],
    ['Galaxy S24 Ultra case', 'Galaxy S24 Ultra ケース'],
    ['三星S24 Ultra手机壳', 'Galaxy S24 Ultra ケース'],
    ['갤럭시S24 Ultra 케이스', 'Galaxy S24 Ultra ケース'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes(expected), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("XperiaとAQUOSの4言語表記を9モール向け互換型番へ統一する", () => {
  const cases = [
    ['エクスペリア 1 VIの透明ケース', 'Xperia 1 VI ケース'],
    ['clear case for Xperia 1 VI', 'Xperia 1 VI ケース'],
    ['Xperia 1 VI透明手机壳', 'Xperia 1 VI ケース'],
    ['엑스페리아 1 VI 투명 케이스', 'Xperia 1 VI ケース'],
    ['アクオス sense8のケース', 'AQUOS sense8 ケース'],
    ['AQUOS sense8 case', 'AQUOS sense8 ケース'],
    ['AQUOS sense8手机壳', 'AQUOS sense8 ケース'],
    ['아쿠오스 sense8 케이스', 'AQUOS sense8 ケース'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes(expected), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の衣類サイズは訂正後のサイズだけを9モール検索語へ保持する", () => {
  const cases = [
    'MではなくLサイズの黒いワンピース',
    'a black dress in size L, not size M',
    '不要M码，要L码黑色连衣裙',
    'M사이즈 말고 L사이즈 검정 원피스',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('サイズL'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!keywords.includes('サイズM'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('ワンピース'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語のフリーサイズを9モール向け共通表記へ統一する", () => {
  const cases = [
    'フリーサイズの黒い帽子',
    'a black hat in free size',
    '均码黑色帽子',
    '프리사이즈 검정 모자',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(keywords.includes('FREEサイズ'), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(keywords.includes('帽子'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語とUS・EU・UKの靴サイズは訂正後の条件だけを9モールへ保持する", () => {
  const cases = [
    ['24cmではなく24.5cmの白いスニーカー', '24.5cm', '24cm'],
    ['white sneakers in US size 9, not US size 8', 'US9', 'US8'],
    ['不要38码，要39码白色运动鞋', 'EU39', 'EU38'],
    ['255mm 말고 260mm 흰색 운동화', '260mm', '255mm'],
    ['EU 38ではなくEU 39の黒いスニーカー', 'EU39', 'EU38'],
    ['black trainers in UK size 6', 'UK6', 'UK5'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, expected, forbidden] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      const tokens = keywords.split(/\s+/u);
      assert.ok(tokens.includes(expected), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(!tokens.includes(forbidden), `${marketplace}: ${input} -> ${keywords}`);
      assert.ok(tokens.includes('スニーカー'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語の靴用品をスニーカー本体の検索語へ誤変換しない", () => {
  const cases = ['靴箱', 'shoe lace', '鞋盒', '신발장'];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.ok(!keywords.split(/\s+/u).includes('スニーカー'), `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("パンツ・スカート・Tシャツを4言語から9モール向け共通商品語へ変換する", () => {
  const cases = [
    ['黒のデニムパンツ', 'パンツ', '黒'], ['blue jeans', 'パンツ', '青'],
    ['黑色牛仔裤', 'パンツ', '黒'], ['검정 청바지', 'パンツ', '黒'],
    ['黒いスカート', 'スカート', '黒'], ['black skirt', 'スカート', '黒'],
    ['黑色半身裙', 'スカート', '黒'], ['검정 치마', 'スカート', '黒'],
    ['白いTシャツ', 'Tシャツ', '白'], ['white t-shirt', 'Tシャツ', '白'],
    ['白色T恤', 'Tシャツ', '白'], ['흰색 티셔츠', 'Tシャツ', '白'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, product, color] of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes(product), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes(color), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("4言語のカテゴリ訂正は否定したパンツを除きスカートだけを9モールへ渡す", () => {
  const cases = [
    'パンツではなく黒いスカート', 'not pants but a black skirt',
    '不要裤子，要黑色半身裙', '바지 말고 검정 치마',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes('スカート'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('パンツ'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("ジャケット・コート・パーカーを4言語から属性付き9モール検索語へ変換する", () => {
  const cases = [
    ['黒い防水ジャケット', 'ジャケット', '黒', '防水'],
    ['black waterproof jacket', 'ジャケット', '黒', '防水'],
    ['黑色防水夹克', 'ジャケット', '黒', '防水'],
    ['검정 방수 재킷', 'ジャケット', '黒', '防水'],
    ['ベージュのトレンチコート', 'コート', 'ベージュ'],
    ['beige trench coat', 'コート', 'ベージュ'],
    ['米色风衣', 'コート', 'ベージュ'],
    ['베이지 트렌치코트', 'コート', 'ベージュ'],
    ['グレーのパーカー', 'パーカー', 'グレー'],
    ['gray hoodie', 'パーカー', 'グレー'],
    ['灰色连帽衫', 'パーカー', 'グレー'],
    ['회색 후드티', 'パーカー', 'グレー'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, ...expected] of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      for (const token of expected) assert.ok(tokens.includes(token), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("4言語のアウター訂正は否定したジャケットを除きコートだけを9モールへ渡す", () => {
  const cases = [
    'ジャケットではなく黒いコート', 'not a jacket but a black coat',
    '不要夹克，要黑色外套', '재킷 말고 검정 코트',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes('コート'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('ジャケット'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("ライフジャケットをファッション用ジャケットと分離して4言語変換する", () => {
  const cases = [
    ['オレンジのライフジャケット', 'オレンジ'], ['orange life jacket', 'オレンジ'],
    ['黄色救生衣', '黄'], ['노란색 구명조끼', '黄'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, color] of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes('ライフジャケット'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes(color), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('ジャケット'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("4言語のノートPC本体はRAM・SSDを保持しトップスへ誤変換しない", () => {
  const cases = [
    '16GB RAM 512GB SSDの軽いノートPC',
    'lightweight laptop with 16GB RAM and 512GB SSD',
    '16GB内存512GB固态硬盘的轻薄笔记本电脑',
    '16GB RAM 512GB SSD 가벼운 노트북',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes('ノートパソコン'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes('16GB'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes('512GB'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('トップス'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("ノートPCケース・スタンド・充電器を4言語で本体から分離して9モール変換する", () => {
  const cases = [
    ['13インチのノートPCケース', 'ノートPCケース', '13インチ'],
    ['13-inch laptop sleeve', 'ノートPCケース', '13インチ'],
    ['13英寸笔记本电脑包', 'ノートPCケース', '13インチ'],
    ['13인치 노트북 파우치', 'ノートPCケース', '13インチ'],
    ['折りたたみノートPCスタンド', 'ノートPCスタンド', '折りたたみ'],
    ['foldable laptop stand', 'ノートPCスタンド', '折りたたみ'],
    ['可折叠笔记本电脑支架', 'ノートPCスタンド', '折りたたみ'],
    ['접이식 노트북 거치대', 'ノートPCスタンド', '折りたたみ'],
    ['USB-CノートPC充電器', 'ノートPC充電器', 'USB-C'],
    ['USB-C laptop charger', 'ノートPC充電器', 'USB-C'],
    ['USB-C笔记本电脑充电器', 'ノートPC充電器', 'USB-C'],
    ['USB-C 노트북 충전기', 'ノートPC充電器', 'USB-C'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, product, condition] of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes(product), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes(condition), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('ノートパソコン'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("USB-Cハブを4言語でPC本体から分離し接続条件を9モールへ保持する", () => {
  const cases = [
    'ノートPCの端子を増やすUSB-Cハブ HDMI 有線LAN SDカード付き',
    'USB-C hub with HDMI Ethernet and SD card ports for a laptop',
    '带HDMI、以太网和SD卡接口的笔记本电脑USB-C扩展坞',
    'HDMI 유선 랜 SD 카드 포트가 있는 노트북용 USB-C 허브',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes('USB-Cハブ'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes('USB-C'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes('HDMI'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('ノートパソコン'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('変換アダプター'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      if (marketplace !== 'QOO10_JP') {
        assert.ok(tokens.includes('有線LAN'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
        assert.ok(tokens.includes('SDカード'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      }
    }
  }
});

test("Thunderbolt 4ドックの世代・給電・端子条件を4言語から9モールへ保持する", () => {
  const cases = [
    'PD 100W対応 Thunderbolt 4 ドック HDMI 2.1 有線LAN SDカード',
    'Thunderbolt 4 dock with 100W PD HDMI 2.1 Ethernet and SD card',
    '支持100W PD、HDMI 2.1、以太网和SD卡的雷电4扩展坞',
    '100W PD HDMI 2.1 이더넷 SD 카드 지원 썬더볼트 4 도킹 스테이션',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.match(tokens.join(' '), /^Thunderbolt 4 ドック/iu, `${marketplace}: ${input}`);
      assert.ok(tokens.includes('100W'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.match(tokens.join(' '), /HDMI 2\.1/iu, `${marketplace}: ${input}`);
      assert.ok(!tokens.includes('USB-Cハブ'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('ノートパソコン'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      if (marketplace !== 'QOO10_JP') {
        assert.ok(tokens.includes('有線LAN'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
        assert.ok(tokens.includes('SDカード'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      }
    }
  }
});

test("USB-Aハブを4言語でUSB-CハブやPC本体へ誤変換しない", () => {
  const cases = [
    'ノートPC用の4ポートUSB-Aハブ',
    'USB-A hub with four ports for a laptop',
    '笔记本电脑用四口USB-A集线器',
    '노트북용 4포트 USB-A 허브',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.match(keywords, /^USB-Aハブ/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.match(keywords, /4ポート/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.doesNotMatch(keywords, /USB-Cハブ|ノートパソコン/u, `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("USB4ドックのDisplayPort・2画面・OS・給電条件を4言語から9モールへ保持する", () => {
  const cases = [
    ['MacBook用 USB4 ドック DisplayPort 1.4 デュアルモニター対応 100W', 'Mac対応'],
    ['USB4 dock with DisplayPort 1.4 dual monitors and 100W PD for Windows laptop', 'Windows対応'],
    ['支持双显示器和DisplayPort 1.4的Windows笔记本USB4扩展坞 100W', 'Windows対応'],
    ['맥북용 USB4 도킹 스테이션 DisplayPort 1.4 듀얼 모니터 100W', 'Mac対応'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, platform] of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.match(keywords, /^USB4 ドック/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.match(keywords, /DisplayPort 1\.4/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.match(keywords, /デュアルモニター/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.match(keywords, /100W/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.match(keywords, new RegExp(platform, 'u'), `${marketplace}: ${input} -> ${keywords}`);
      assert.doesNotMatch(keywords, /ノートパソコン|Thunderbolt/u, `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("USB4ドックの4K・Hz・DisplayLink条件を4言語から9モールへ保持する", () => {
  const cases = [
    'MacBook用 DisplayLink対応 USB4 ドック 4K 60Hz 2画面',
    'USB4 dock with DisplayLink dual 4K 60Hz monitors for MacBook',
    '支持DisplayLink双4K 60Hz显示器的MacBook USB4扩展坞',
    '맥북용 DisplayLink USB4 도킹 스테이션 듀얼 4K 60Hz',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.match(keywords, /^USB4 ドック/u, `${marketplace}: ${input} -> ${keywords}`);
      for (const condition of ['4K', '60Hz', 'DisplayLink', 'デュアルモニター', 'Mac対応']) {
        assert.match(keywords, new RegExp(condition, 'u'), `${marketplace}: ${input} -> ${keywords}`);
      }
    }
  }
});

test("USB4ドックのApple Silicon世代・HDR・MST条件を4言語から9モールへ保持する", () => {
  const displayLinkCases = [
    'MacBook M2用 DisplayLink HDR対応 USB4 ドック 4K 60Hz 2画面',
    'USB4 DisplayLink dock with dual 4K 60Hz HDR monitors for MacBook M2',
    '支持MacBook M2双4K 60Hz HDR显示器的DisplayLink USB4扩展坞',
    '맥북 M2용 DisplayLink USB4 도킹 스테이션 듀얼 4K 60Hz HDR',
  ];
  const mstCases = [
    'Windows用 MST対応 USB4 ドック 4K 60Hz 2画面',
    'USB4 dock with MST dual 4K 60Hz monitors for Windows',
    '支持Windows双4K 60Hz显示器的MST USB4扩展坞',
    '윈도우용 MST USB4 도킹 스테이션 듀얼 4K 60Hz',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of displayLinkCases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      for (const condition of ['M2対応', 'HDR', 'DisplayLink', 'Mac対応']) {
        assert.match(keywords, new RegExp(condition, 'u'), `${marketplace}: ${input} -> ${keywords}`);
      }
      assert.doesNotMatch(keywords, /MST/u, `${marketplace}: ${input} -> ${keywords}`);
    }
    for (const input of mstCases) {
      const keywords = buildMarketplaceSearchKeywords(input, marketplace);
      assert.match(keywords, /MST/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.match(keywords, /Windows対応/u, `${marketplace}: ${input} -> ${keywords}`);
      assert.doesNotMatch(keywords, /DisplayLink/u, `${marketplace}: ${input} -> ${keywords}`);
    }
  }
});

test("4言語のタブレット本体は小数インチ・容量を保持して9モール変換する", () => {
  const cases = [
    '10.9インチ256GBのタブレット',
    '10.9-inch tablet with 256GB storage',
    '10.9英寸256GB平板电脑',
    '10.9인치 256GB 태블릿',
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const input of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes('タブレット'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes('10.9インチ'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes('256GB'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("タブレットケース・スタンド・ペンを4言語で本体から分離して9モール変換する", () => {
  const cases = [
    ['10.9インチのタブレットケース', 'タブレットケース', '10.9インチ'],
    ['10.9-inch tablet case', 'タブレットケース', '10.9インチ'],
    ['10.9英寸平板电脑保护套', 'タブレットケース', '10.9インチ'],
    ['10.9인치 태블릿 케이스', 'タブレットケース', '10.9インチ'],
    ['折りたたみタブレットスタンド', 'タブレットスタンド', '折りたたみ'],
    ['foldable tablet stand', 'タブレットスタンド', '折りたたみ'],
    ['可折叠平板电脑支架', 'タブレットスタンド', '折りたたみ'],
    ['접이식 태블릿 거치대', 'タブレットスタンド', '折りたたみ'],
    ['タブレット用スタイラスペン', 'タブレット用ペン', null],
    ['stylus pen for tablet', 'タブレット用ペン', null],
    ['平板电脑触控笔', 'タブレット用ペン', null],
    ['태블릿 스타일러스 펜', 'タブレット用ペン', null],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, product, condition] of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes(product), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      if (condition) assert.ok(tokens.includes(condition), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('タブレット'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test("タブレット用キーボード・保護フィルム・充電器を4言語で専用商品語へ変換する", () => {
  const cases = [
    ['タブレット用Bluetoothキーボード', 'タブレット用キーボード', 'ワイヤレス'],
    ['Bluetooth keyboard for tablet', 'タブレット用キーボード', 'ワイヤレス'],
    ['平板电脑蓝牙键盘', 'タブレット用キーボード', 'ワイヤレス'],
    ['태블릿용 블루투스 키보드', 'タブレット用キーボード', 'ワイヤレス'],
    ['10.9インチタブレット保護フィルム', 'タブレット保護フィルム', '10.9インチ'],
    ['10.9-inch tablet screen protector', 'タブレット保護フィルム', '10.9インチ'],
    ['10.9英寸平板电脑钢化膜', 'タブレット保護フィルム', '10.9インチ'],
    ['10.9인치 태블릿 액정보호필름', 'タブレット保護フィルム', '10.9インチ'],
    ['USB-Cタブレット充電器', 'タブレット充電器', 'USB-C'],
    ['USB-C charger for tablet', 'タブレット充電器', 'USB-C'],
    ['USB-C平板电脑充电器', 'タブレット充電器', 'USB-C'],
    ['USB-C 태블릿 충전기', 'タブレット充電器', 'USB-C'],
  ];
  for (const marketplace of SEARCH_MARKETPLACES) {
    for (const [input, product, condition] of cases) {
      const tokens = buildMarketplaceSearchKeywords(input, marketplace).split(/\s+/u);
      assert.ok(tokens.includes(product), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(tokens.includes(condition), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('タブレット'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
      assert.ok(!tokens.includes('青'), `${marketplace}: ${input} -> ${tokens.join(' ')}`);
    }
  }
});

test('iPad Air・Proのモデルと画面サイズを4言語のモール検索語に保持する', () => {
  const cases = [
    ['iPad Air 11インチ用キーボードケース', /iPad Air キーボードケース 11インチ/],
    ['keyboard case for iPad Pro 13-inch', /iPad Pro キーボードケース 13インチ/],
    ['iPad Air 11英寸键盘保护套', /iPad Air キーボードケース 11インチ/],
    ['아이패드 프로 13인치 키보드 케이스', /iPad Pro キーボードケース 13インチ/],
    ['iPad Air 11インチ用保護フィルム', /iPad Air 保護フィルム 11インチ/],
    ['USB-C charger for iPad Pro', /iPad Pro 充電器 USB-C/],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.match(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('Apple Pencilの世代・交換ペン先・充電用品を全モール向けに分離する', () => {
  const cases = [
    ['Apple Pencil 第2世代 iPad Pro用', 'iPad Pro Apple Pencil 第2世代'],
    ['2nd generation Apple Pencil for iPad Pro', 'iPad Pro Apple Pencil 第2世代'],
    ['iPad Pro用Apple Pencil交換ペン先', 'iPad Pro Apple Pencil 交換ペン先'],
    ['iPad Pro Apple Pencil替换笔尖', 'iPad Pro Apple Pencil 交換ペン先'],
    ['아이패드 프로 애플펜슬 교체 펜촉', 'iPad Pro Apple Pencil 交換ペン先'],
    ['USB-C Apple Pencil charging adapter', 'Apple Pencil 充電アダプター USB-C'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('power-bank PD output corrections keep only the final requirement in four languages', () => {
  const queries = [
    'PD30WじゃなくPD20Wの10000mAhモバイルバッテリー',
    'not PD30W, I want a PD20W 10000mAh power bank',
    '不要PD30W，要PD20W的10000mAh充电宝',
    'PD30W 말고 PD20W 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W', `${marketplace}: ${query}`);
    }
  }
});

test('power-bank built-in connector corrections keep only the final connector in four languages', () => {
  const queries = [
    'USB-CじゃなくLightningケーブル内蔵10000mAhモバイルバッテリー',
    'not USB-C, I want a 10000mAh power bank with a built-in Lightning cable',
    '不要USB-C，要自带Lightning线的10000mAh充电宝',
    'USB-C 말고 Lightning 케이블 내장 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー Lightningケーブル内蔵', `${marketplace}: ${query}`);
    }
  }
});

test('negated MagSafe requirements are removed from power-bank keywords in four languages', () => {
  const queries = [
    'MagSafeじゃなく普通の10000mAhモバイルバッテリー',
    'not MagSafe, I want a regular 10000mAh power bank',
    '不要MagSafe，要普通的10000mAh充电宝',
    'MagSafe 말고 일반 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('negated built-in cable requirements are removed from power-bank keywords in four languages', () => {
  const queries = [
    'ケーブル内蔵じゃない10000mAhモバイルバッテリー',
    'a 10000mAh power bank without a built-in cable',
    '不要自带线的10000mAh充电宝',
    '케이블 내장 말고 일반 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('negated PD output requirements are removed from power-bank keywords in four languages', () => {
  const queries = [
    'PD20Wじゃない10000mAhモバイルバッテリー',
    'a 10000mAh power bank without PD20W',
    '不要PD20W的10000mAh充电宝',
    'PD20W 아닌 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('negated capacity requirements are removed from power-bank keywords in four languages', () => {
  const queries = [
    '10000mAhじゃないモバイルバッテリー',
    'a power bank that is not 10000mAh',
    '不要10000mAh的充电宝',
    '10000mAh 아닌 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        'モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('minimum power-bank capacity is preserved as a lower bound in four languages', () => {
  const queries = [
    '10000mAh以上のモバイルバッテリー',
    'a power bank with at least 10000mAh',
    '至少10000mAh的充电宝',
    '10000mAh 이상 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh以上 モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('maximum power-bank capacity is preserved as an upper bound in four languages', () => {
  const queries = [
    '10000mAh以下のモバイルバッテリー',
    'a power bank with at most 10000mAh',
    '不超过10000mAh的充电宝',
    '10000mAh 이하 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh以下 モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('power-bank capacity ranges preserve both inclusive bounds in four languages', () => {
  const queries = [
    '5000mAhから10000mAhのモバイルバッテリー',
    'a power bank between 5000mAh and 10000mAh',
    '5000mAh到10000mAh的充电宝',
    '5000mAh에서 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '5000mAh-10000mAh モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('冷蔵庫給水フィルターは4言語の型番・純正・個数を全モール向けに保持する', () => {
  const cases = [
    ['Samsung HAF-QIN DA97-17376B 純正 冷蔵庫給水フィルター 2個', 'Samsung HAF-QIN DA97-17376B 冷蔵庫給水フィルター 純正 2個セット'],
    ['LG LT1000P ADQ74793501 genuine refrigerator water filter 2 pack', 'LG LT1000P ADQ74793501 冷蔵庫給水フィルター 純正 2個セット'],
    ['GE RPWFE 原装冰箱净水滤芯 2个', 'GE RPWFE 冷蔵庫給水フィルター 純正 2個セット'],
    ['월풀 EveryDrop Filter 1 EDR1RXD1 정품 냉장고 정수 필터 2개', 'Whirlpool EveryDrop Filter 1 EDR1RXD1 冷蔵庫給水フィルター 純正 2個セット'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('食洗機タブレットと洗濯ジェルボールを4言語で分離して個数を保持する', () => {
  const cases = [
    ['フィニッシュ オールインワン 食洗機用洗剤 タブレット 60個', 'Finish 食洗機用洗剤タブレット 60個入り'],
    ['Cascade Platinum Plus dishwasher detergent pods 52 count', 'Cascade Platinum Plus 食洗機用洗剤タブレット 52個入り'],
    ['汰渍 Tide PODS 洗衣凝珠 42颗', 'Tide PODS 洗濯用洗剤ジェルボール 42個入り'],
    ['아리엘 젤볼 세탁세제 92개', 'Ariel 洗濯用洗剤ジェルボール 92個入り'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('洗剤ポッドの香り・無香料・詰め替え条件を4言語で保持する', () => {
  const cases = [
    ['フィニッシュ レモン 食洗機用洗剤タブレット 詰め替え 60個', 'Finish 食洗機用洗剤タブレット レモン 詰め替え 60個入り'],
    ['Cascade Platinum Plus fragrance-free dishwasher detergent pods 52 count', 'Cascade Platinum Plus 食洗機用洗剤タブレット 無香料 52個入り'],
    ['汰渍 Tide PODS 薰衣草洗衣凝珠补充装42颗', 'Tide PODS 洗濯用洗剤ジェルボール ラベンダー 詰め替え 42個入り'],
    ['아리엘 무향 젤볼 세탁세제 92개', 'Ariel 洗濯用洗剤ジェルボール 無香料 92個入り'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('洗剤ポッドの敏感肌・抗菌・すすぎ条件を4言語で保持する', () => {
  const cases = [
    ['アリエール 敏感肌向け すすぎ1回 洗濯ジェルボール 40個', 'Ariel 洗濯用洗剤ジェルボール 敏感肌向け すすぎ1回 40個入り'],
    ['Finish antibacterial dishwasher detergent tablets 60 count', 'Finish 食洗機用洗剤タブレット 抗菌 60個入り'],
    ['汰渍 Tide PODS 温和洗衣凝珠 漂洗1次 42颗', 'Tide PODS 洗濯用洗剤ジェルボール 敏感肌向け すすぎ1回 42個入り'],
    ['아리엘 항균 세탁 젤볼 헹굼 1회 92개', 'Ariel 洗濯用洗剤ジェルボール 抗菌 すすぎ1回 92個入り'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('洗剤ポッドの赤ちゃん衣類・部屋干し・防臭・増白剤条件を4言語で保持する', () => {
  const cases = [
    ['アリエール 赤ちゃん衣類対応 蛍光増白剤不使用 洗濯ジェルボール 40個', 'Ariel 洗濯用洗剤ジェルボール 赤ちゃん衣類対応 蛍光増白剤不使用 40個入り'],
    ['Tide PODS indoor drying odor control laundry detergent 42 count', 'Tide PODS 洗濯用洗剤ジェルボール 部屋干し 防臭 42個入り'],
    ['汰渍 Tide PODS 婴儿衣物无荧光增白剂洗衣凝珠42颗', 'Tide PODS 洗濯用洗剤ジェルボール 赤ちゃん衣類対応 蛍光増白剤不使用 42個入り'],
    ['아리엘 실내 건조 냄새 제거 세탁 젤볼 92개', 'Ariel 洗濯用洗剤ジェルボール 部屋干し 防臭 92個入り'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('洗剤ポッドの洗濯機タイプ・素材・柔軟剤条件を4言語で保持する', () => {
  const cases = [
    ['アリエール ドラム式対応 柔軟剤不使用 洗濯ジェルボール 40個', 'Ariel 洗濯用洗剤ジェルボール ドラム式対応 柔軟剤不使用 40個入り'],
    ['Tide PODS top-load with fabric softener laundry detergent 42 count', 'Tide PODS 洗濯用洗剤ジェルボール 縦型対応 柔軟剤入り 42個入り'],
    ['汰渍 Tide PODS 滚筒洗衣机适用不含柔顺剂洗衣凝珠42颗', 'Tide PODS 洗濯用洗剤ジェルボール ドラム式対応 柔軟剤不使用 42個入り'],
    ['아리엘 울 의류용 유연제 무첨가 세탁 젤볼 92개', 'Ariel 洗濯用洗剤ジェルボール ウール対応 柔軟剤不使用 92個入り'],
  ];
  for (const [input, expected] of cases) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace), expected, `${marketplace}: ${input}`);
    }
  }
});

test('power-bank ranges retain output, connector, and exclusions together in four languages', () => {
  const queries = [
    '5000mAhから10000mAhでPD20W、Lightningケーブル内蔵、MagSafeじゃないモバイルバッテリー',
    'a power bank between 5000mAh and 10000mAh with PD20W and a built-in Lightning cable, not MagSafe',
    '5000mAh到10000mAh、PD20W、自带Lightning线、不要MagSafe的充电宝',
    '5000mAh에서 10000mAh, PD20W, Lightning 케이블 내장, MagSafe 아닌 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '5000mAh-10000mAh モバイルバッテリー Lightningケーブル内蔵 PD20W', `${marketplace}: ${query}`);
    }
  }
});

test('spoken power-bank ranges infer the omitted first capacity unit in four languages', () => {
  const queries = [
    '5000から10000mAhのモバイルバッテリー',
    'a power bank between 5000 and 10000mAh',
    '5000到10000mAh的充电宝',
    '5000에서 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '5000mAh-10000mAh モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('separate power-bank lower and upper bounds become one range in four languages', () => {
  const queries = [
    '5000mAh以上、10000mAh以下のモバイルバッテリー',
    'a power bank with at least 5000mAh and at most 10000mAh',
    '至少5000mAh且不超过10000mAh的充电宝',
    '5000mAh 이상 10000mAh 이하 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '5000mAh-10000mAh モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('contradictory power-bank bounds are not silently reordered in four languages', () => {
  const queries = [
    '10000mAh以上、5000mAh以下のモバイルバッテリー',
    'a power bank with at least 10000mAh and at most 5000mAh',
    '至少10000mAh且不超过5000mAh的充电宝',
    '10000mAh 이상 5000mAh 이하 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh以上 5000mAh以下 モバイルバッテリー', `${marketplace}: ${query}`);
    }
  }
});

test('minimum power-bank PD output remains a lower bound in four languages', () => {
  const queries = [
    'PD20W以上の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at least 20W PD',
    '至少PD20W的10000mAh充电宝',
    'PD20W 이상 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W以上', `${marketplace}: ${query}`);
    }
  }
});

test('maximum power-bank PD output remains an upper bound in four languages', () => {
  const queries = [
    'PD20W以下の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at most 20W PD',
    '不超过PD20W的10000mAh充电宝',
    'PD20W 이하 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W以下', `${marketplace}: ${query}`);
    }
  }
});

test('power-bank PD output ranges preserve both inclusive bounds in four languages', () => {
  const queries = [
    'PD20Wから30Wの10000mAhモバイルバッテリー',
    'a 10000mAh power bank between 20W and 30W PD',
    'PD20W到30W的10000mAh充电宝',
    'PD20W에서 30W 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W-PD30W', `${marketplace}: ${query}`);
    }
  }
});

test('separate power-bank PD output bounds become one range in four languages', () => {
  const queries = [
    'PD20W以上、PD30W以下の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at least 20W PD and at most 30W PD',
    '至少PD20W且不超过PD30W的10000mAh充电宝',
    'PD20W 이상 PD30W 이하 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD20W-PD30W', `${marketplace}: ${query}`);
    }
  }
});

test('contradictory power-bank PD output bounds are not silently reordered in four languages', () => {
  const queries = [
    'PD30W以上、PD20W以下の10000mAhモバイルバッテリー',
    'a 10000mAh power bank with at least 30W PD and at most 20W PD',
    '至少PD30W且不超过PD20W的10000mAh充电宝',
    'PD30W 이상 PD20W 이하 10000mAh 보조배터리',
  ];
  for (const query of queries) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(query, marketplace),
        '10000mAh モバイルバッテリー PD30W以上 PD20W以下', `${marketplace}: ${query}`);
    }
  }
});

test('smartwatch replacement bands retain model, case size, and material in four languages', () => {
  const cases = [
    {
      expected: 'Apple Watch Ultra 2 49mm バンド チタン',
      queries: [
        'Apple Watch Ultra 2用49mmのチタンバンド',
        'a 49mm titanium band for Apple Watch Ultra 2',
        'Apple Watch Ultra 2 49mm 钛金属表带',
        'Apple Watch Ultra 2 49mm 티타늄 스트랩',
      ],
    },
    {
      expected: 'Galaxy Watch6 Classic 47mm バンド ステンレス',
      queries: [
        'Galaxy Watch6 Classic用47mmのステンレスベルト',
        'a 47mm stainless steel strap for Galaxy Watch6 Classic',
        'Galaxy Watch6 Classic 47mm 不锈钢表带',
        'Galaxy Watch6 Classic 47mm 스테인리스 스트랩',
      ],
    },
  ];
  for (const { expected, queries } of cases) {
    for (const query of queries) {
      for (const marketplace of SEARCH_MARKETPLACES) {
        assert.equal(buildMarketplaceSearchKeywords(query, marketplace), expected, `${marketplace}: ${query}`);
      }
    }
  }
});
test('圧力IH炊飯器は容量・蒸気カット・保温時間を4言語で保持する', () => {
  const inputs = [
    '圧力IH炊飯器 5.5合 蒸気カット 保温40時間',
    'pressure IH rice cooker 5.5 go steam reduction keep warm 40 hours',
    '压力IH电饭煲 5.5合 蒸汽减少 保温40小时',
    '압력 IH 밥솥 5.5合 증기 절감 보온 40시간'
  ];
  for (const input of inputs) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace),
        '圧力IH炊飯器 5.5合 蒸気カット 保温40時間', `${marketplace}: ${input}`);
    }
  }
});
test('ドライブレコーダーは前後構成・解像度・駐車監視・通信条件を4言語で保持する', () => {
  const inputs = [
    '前後2カメラ 4K 駐車監視 GPS Wi-Fi ドライブレコーダー',
    '4K front and rear dash cam with parking monitoring GPS Wi-Fi',
    '4K 前后双摄 停车监控 GPS Wi-Fi 行车记录仪',
    '4K 전후방 2채널 주차 감시 GPS Wi-Fi 블랙박스',
    'あおり運転対策で前も後ろも録画できる 4K 駐車中も監視 GPS Wi-Fi',
    'records both front and rear for road incidents 4K parking monitoring GPS Wi-Fi',
    '防碰瓷前后都能录像 4K 停车监控 GPS Wi-Fi',
    '사고 대비 전후방을 모두 녹화하는 4K 주차 감시 GPS Wi-Fi'
  ];
  for (const input of inputs) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace),
        'ドライブレコーダー 前後2カメラ 4K 駐車監視 GPS Wi-Fi', `${marketplace}: ${input}`);
    }
  }
});
test('カメラ付き自動給餌器は容量・画質・通信・音声条件を4言語で保持する', () => {
  const inputs = [
    '5L 1080pカメラ Wi-Fi 双方向音声 ペット自動給餌器',
    '5L automatic pet feeder with 1080p camera Wi-Fi two-way audio',
    '5L 1080p摄像头 Wi-Fi 双向语音 自动喂食器',
    '5L 1080p 카메라 Wi-Fi 양방향 음성 자동 급식기',
    '留守中に猫へ自動でご飯を出す 5L 1080pカメラ Wi-Fi 双方向音声',
    'feeds my cat automatically while I am away 5L 1080p camera Wi-Fi two-way audio',
    '出门时自动给猫喂食 5L 1080p摄像头 Wi-Fi 双向语音',
    '집을 비울 때 고양이에게 자동으로 밥 주는 5L 1080p 카메라 Wi-Fi 양방향 음성'
  ];
  for (const input of inputs) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace),
        'ペット自動給餌器 5L 1080pカメラ Wi-Fi 双方向音声', `${marketplace}: ${input}`);
    }
  }
});
test('IPL光美容器は照射回数・冷却・出力段階・肌色検知を4言語で保持する', () => {
  const inputs = [
    'IPL光美容器 50万回 冷却機能 5段階 肌色センサー',
    'IPL hair removal device 500000 flashes cooling 5 levels skin tone sensor',
    'IPL脱毛仪 50万发 冰感冷却 5档 肤色传感器',
    'IPL 제모기 50만회 냉각 5단계 피부톤 센서',
    '家でムダ毛ケアしたい 50万回 冷却機能 5段階 肌色センサー',
    'remove body hair at home with 500000 flashes cooling 5 levels skin tone sensor',
    '在家脱毛 50万发 冰感冷却 5档 肤色传感器',
    '집에서 제모하는 50만회 냉각 5단계 피부톤 센서'
  ];
  for (const input of inputs) {
    for (const marketplace of SEARCH_MARKETPLACES) {
      assert.equal(buildMarketplaceSearchKeywords(input, marketplace),
        'IPL光美容器 50万回 冷却機能 5段階 肌色センサー', `${marketplace}: ${input}`);
    }
  }
});
