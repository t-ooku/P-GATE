import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/019fa962-54aa-7871-8055-a249d8f966a5";
await fs.mkdir(outputDir, { recursive: true });

const wb = Workbook.create();
const dashboard = wb.worksheets.add("Dashboard");
const assumptions = wb.worksheets.add("Assumptions");
const scenarios = wb.worksheets.add("Scenario Matrix");
const costModel = wb.worksheets.add("HOSHILU Cost Model");
const checks = wb.worksheets.add("Checks & Sources");

const navy = "#172554";
const violet = "#6D28D9";
const cyan = "#0EA5E9";
const pale = "#F5F3FF";
const inputFill = "#FEF3C7";
const border = "#DDD6FE";
const green = "#DCFCE7";
const red = "#FEE2E2";
const gray = "#F8FAFC";

const categoryRows = [
  ["FASHION", "ファッション", 0.0008, null, null, 8000, 0.025, 0.45, 0.15, 0.08, 200],
  ["COSMETICS", "コスメ", 0.0012, null, null, 4000, 0.030, 0.50, 0.15, 0.03, 100],
  ["GADGET", "家電・ガジェット", 0.0006, null, null, 12000, 0.020, 0.25, 0.12, 0.05, 250],
  ["LIFESTYLE", "生活雑貨", 0.0008, null, null, 6000, 0.025, 0.40, 0.15, 0.04, 150],
  ["FOOD", "食品", 0.0010, null, null, 3000, 0.040, 0.35, 0.16, 0.01, 100],
  ["HOBBY", "ホビー", 0.0008, null, null, 7000, 0.030, 0.40, 0.14, 0.02, 150],
  ["BABY", "ベビー", 0.0008, null, null, 6000, 0.030, 0.40, 0.15, 0.03, 150],
  ["PET", "ペット", 0.0008, null, null, 4500, 0.035, 0.38, 0.15, 0.02, 100],
  ["SPORTS", "スポーツ", 0.0006, null, null, 10000, 0.020, 0.35, 0.14, 0.04, 200],
  ["AUTOMOTIVE", "自動車用品", 0.0004, null, null, 15000, 0.015, 0.30, 0.13, 0.05, 300],
  ["OTHER", "その他・未分類", 0.0007, null, null, 6000, 0.025, 0.35, 0.15, 0.04, 150],
];
const planRows = [
  ["LAUNCH_PERFORMANCE", "導入1〜3か月", 0, 1.00, "契約商品として優先", "7日", "全KPI試行"],
  ["PERFORMANCE_ONLY", "成果課金のみ", 0, 1.50, "契約枠内で最下位", "7日", "月次概要"],
  ["STARTER", "STARTER", 9800, 1.00, "上位", "72時間", "カテゴリ分析"],
  ["GROWTH", "GROWTH", 29800, 0.85, "さらに上位", "24時間", "検索語群分析"],
  ["SCALE", "SCALE", 79800, 0.70, "最上位", "リアルタイム", "商品別リアルタイム"],
];

assumptions.getRange("A1:K1").merge();
assumptions.getRange("A1").values = [["料金・収益モデルの前提（黄色セルは編集可能）"]];
assumptions.getRange("A3:K3").values = [[
  "カテゴリID", "表示名", "固定料率", "最低額なし", "上限額なし", "想定客単価", "購入率",
  "粗利率", "モール・物流費率", "返品率", "その他変動費/注文",
]];
assumptions.getRange(`A4:K${3 + categoryRows.length}`).values = categoryRows;
assumptions.getRange("M3:S3").values = [[
  "プランID", "表示名", "月額", "単価倍率", "表示優先", "MAP遅延", "分析深度",
]];
assumptions.getRange(`M4:S${3 + planRows.length}`).values = planRows;
assumptions.getRange("M11:N14").values = [
  ["決済方法", "HOSHILU決済費率"],
  ["Stripeカード+Billing", 0.043],
  ["Stripe銀行振込+Billing", 0.022],
  ["手動銀行振込", 0],
];
assumptions.getRange("M16:N18").values = [
  ["共通前提", "値"],
  ["HOSHILU変動原価/送客", 2],
  ["利益情報の課金利用", "使用しない"],
];

dashboard.getRange("A1:H2").merge();
dashboard.getRange("A1").values = [["HOSHILU 有効送客：セラー採算・HOSHILU収益シミュレーター"]];
dashboard.getRange("A4:B10").values = [
  ["入力", "設定値"],
  ["カテゴリ", "FASHION"],
  ["プラン", "STARTER"],
  ["月間有効送客数", 1000],
  ["決済方法", "Stripeカード+Billing"],
  ["購入率（上書き可）", null],
  ["客単価（上書き可）", null],
];
dashboard.getRange("B5:B8").format.fill = inputFill;
dashboard.getRange("B5").dataValidation = { rule: { type: "list", formula1: "Assumptions!$A$4:$A$14" } };
dashboard.getRange("B6").dataValidation = { rule: { type: "list", formula1: "Assumptions!$M$4:$M$8" } };
dashboard.getRange("B8").dataValidation = { rule: { type: "list", formula1: "Assumptions!$M$12:$M$14" } };
dashboard.getRange("B9").formulas = [["=VLOOKUP(B5,Assumptions!$A$4:$K$14,7,FALSE)"]];
dashboard.getRange("B10").formulas = [["=VLOOKUP(B5,Assumptions!$A$4:$K$14,6,FALSE)"]];

dashboard.getRange("D4:E16").values = [
  ["セラー側（月次）", "金額・率"],
  ["想定注文数", null],
  ["総売上", null],
  ["返品控除後売上", null],
  ["商品原価", null],
  ["モール・物流費", null],
  ["その他変動費", null],
  ["HOSHILU前利益", null],
  ["HOSHILU月額", null],
  ["有効送客料", null],
  ["HOSHILU後利益", null],
  ["HOSHILU負担 / 売上", null],
  ["参考：費用 / 仮定利益", null],
];
dashboard.getRange("E5:E16").formulas = [
  ["=B7*B9"],
  ["=E5*B10"],
  ["=E6*(1-VLOOKUP(B5,Assumptions!$A$4:$K$14,10,FALSE))"],
  ["=E7*(1-VLOOKUP(B5,Assumptions!$A$4:$K$14,8,FALSE))"],
  ["=E7*VLOOKUP(B5,Assumptions!$A$4:$K$14,9,FALSE)"],
  ["=E5*VLOOKUP(B5,Assumptions!$A$4:$K$14,11,FALSE)"],
  ["=E7-E8-E9-E10"],
  ["=VLOOKUP(B6,Assumptions!$M$4:$S$8,3,FALSE)"],
  ["=B7*B10*VLOOKUP(B5,Assumptions!$A$4:$K$14,3,FALSE)*VLOOKUP(B6,Assumptions!$M$4:$S$8,4,FALSE)"],
  ["=E11-E12-E13"],
  ["=IFERROR((E12+E13)/E7,0)"],
  ["=IFERROR((E12+E13)/E11,0)"],
];

dashboard.getRange("G4:H12").values = [
  ["HOSHILU側（月次）", "金額・率"],
  ["月額売上", null],
  ["送客売上", null],
  ["売上合計", null],
  ["決済手数料", null],
  ["送客変動原価", null],
  ["限界利益", null],
  ["限界利益率", null],
  ["課金基準", null],
];
dashboard.getRange("H5:H12").formulas = [
  ["=E12"],
  ["=E13"],
  ["=SUM(H5:H6)"],
  ["=H7*VLOOKUP(B8,Assumptions!$M$12:$N$14,2,FALSE)"],
  ["=B7*Assumptions!$N$17"],
  ["=H7-H8-H9"],
  ["=IFERROR(H10/H7,0)"],
  ["=\"販売価格×\"&TEXT(VLOOKUP(B5,Assumptions!$A$4:$K$14,3,FALSE),\"0.00%\")"],
];
dashboard.getRange("A18:H20").merge();
dashboard.getRange("A18").values = [[
  "重要：売上・購入率・原価・利益は内部シナリオ用の仮定であり、実際の課金判定には使用しません。課金は送客時の販売価格×ジャンル固定料率×プラン倍率だけです。",
]];

scenarios.getRange("A1:Q1").merge();
scenarios.getRange("A1").values = [["カテゴリ × プラン × 送客数 シナリオ比較"]];
scenarios.getRange("A3:Q3").values = [[
  "カテゴリ", "プラン", "送客数", "購入率", "客単価", "注文数", "総売上",
  "返品後売上", "HOSHILU前利益", "月額", "送客料", "HOSHILU費用計",
  "セラー利益（仮定）", "参考負担率", "HOSHILU売上", "HOSHILU限界利益", "課金基準",
]];
const volumes = [100, 500, 1000, 3000];
const scenarioKeys = [];
for (const category of categoryRows) {
  for (const plan of planRows) {
    for (const volume of volumes) scenarioKeys.push([category[0], plan[0], volume]);
  }
}
scenarios.getRange(`A4:C${3 + scenarioKeys.length}`).values = scenarioKeys;
for (let row = 4; row <= 3 + scenarioKeys.length; row += 1) {
  scenarios.getRange(`D${row}:Q${row}`).formulas = [[
    `=VLOOKUP(A${row},Assumptions!$A$4:$K$14,7,FALSE)`,
    `=VLOOKUP(A${row},Assumptions!$A$4:$K$14,6,FALSE)`,
    `=C${row}*D${row}`,
    `=F${row}*E${row}`,
    `=G${row}*(1-VLOOKUP(A${row},Assumptions!$A$4:$K$14,10,FALSE))`,
    `=H${row}*VLOOKUP(A${row},Assumptions!$A$4:$K$14,8,FALSE)-H${row}*VLOOKUP(A${row},Assumptions!$A$4:$K$14,9,FALSE)-F${row}*VLOOKUP(A${row},Assumptions!$A$4:$K$14,11,FALSE)`,
    `=VLOOKUP(B${row},Assumptions!$M$4:$S$8,3,FALSE)`,
    `=C${row}*E${row}*VLOOKUP(A${row},Assumptions!$A$4:$K$14,3,FALSE)*VLOOKUP(B${row},Assumptions!$M$4:$S$8,4,FALSE)`,
    `=J${row}+K${row}`,
    `=I${row}-L${row}`,
    `=IFERROR(L${row}/I${row},0)`,
    `=L${row}`,
    `=O${row}*(1-Assumptions!$N$12)-C${row}*Assumptions!$N$17`,
    `="販売価格×"&TEXT(VLOOKUP(A${row},Assumptions!$A$4:$K$14,3,FALSE),"0.00%")`,
  ]];
}

// Dashboard chart helper: selected category, 1,000 referrals.
dashboard.getRange("J3:L3").values = [["プラン", "導入前利益", "導入後利益"]];
for (let i = 0; i < planRows.length; i += 1) {
  const row = 4 + i;
  dashboard.getRange(`J${row}`).values = [[planRows[i][1]]];
  dashboard.getRange(`K${row}`).formulas = [[
    `=1000*B9*B10*(1-VLOOKUP(B5,Assumptions!$A$4:$K$14,10,FALSE))*VLOOKUP(B5,Assumptions!$A$4:$K$14,8,FALSE)-1000*B9*B10*(1-VLOOKUP(B5,Assumptions!$A$4:$K$14,10,FALSE))*VLOOKUP(B5,Assumptions!$A$4:$K$14,9,FALSE)-1000*B9*VLOOKUP(B5,Assumptions!$A$4:$K$14,11,FALSE)`,
  ]];
  dashboard.getRange(`L${row}`).formulas = [[
    `=K${row}-VLOOKUP("${planRows[i][0]}",Assumptions!$M$4:$S$8,3,FALSE)-1000*B10*VLOOKUP(B5,Assumptions!$A$4:$K$14,3,FALSE)*VLOOKUP("${planRows[i][0]}",Assumptions!$M$4:$S$8,4,FALSE)`,
  ]];
}
const chart = dashboard.charts.add("bar", dashboard.getRange("J3:L8"));
chart.title = "1,000送客時のセラー利益（プラン比較）";
chart.hasLegend = true;
chart.yAxis = { numberFormatCode: "¥#,##0" };
chart.setPosition("J10", "Q26");

costModel.getRange("A1:F1").merge();
costModel.getRange("A1").values = [["HOSHILU 初年度経費・利益モデル（人件費・外注費・広告費を除外）"]];
costModel.getRange("A3:D3").values = [["年間シナリオ", "控えめ", "基準", "成功"]];
costModel.getRange("A4:D15").values = [
  ["HOSHILU売上", 5_527_060, 22_751_269, 93_580_700],
  ["カード決済比率", 0, 0.25, 0.4],
  ["銀行振込比率", 1, 0.75, 0.6],
  ["カード+Billing料率", 0.043, 0.043, 0.043],
  ["銀行振込+Billing料率", 0.022, 0.022, 0.022],
  ["Cloudflare Workers・D1", 12_000, 12_000, 24_000],
  ["ドメイン", 6_000, 6_000, 6_000],
  ["Resendメール", 0, 36_000, 108_000],
  ["LINE", 0, 60_000, 180_000],
  ["X APIクレジット", 30_000, 100_000, 300_000],
  ["監視・追加SaaS", 0, 12_000, 24_000],
  ["会計ソフト追加分", 0, 36_000, 36_000],
];
costModel.getRange("A17:D17").values = [["計算結果", "控えめ", "基準", "成功"]];
costModel.getRange("A18:A23").values = [
  ["Stripe決済費"],
  ["固定・準固定費"],
  ["人件費以外の経費合計"],
  ["人件費・税引前利益"],
  ["経費率"],
  ["利益率"],
];
for (const col of ["B", "C", "D"]) {
  costModel.getRange(`${col}18`).formulas = [[
    `=${col}4*(${col}5*${col}7+${col}6*${col}8)`,
  ]];
  costModel.getRange(`${col}19`).formulas = [[`=SUM(${col}9:${col}15)`]];
  costModel.getRange(`${col}20`).formulas = [[`=SUM(${col}18:${col}19)`]];
  costModel.getRange(`${col}21`).formulas = [[`=${col}4-${col}20`]];
  costModel.getRange(`${col}22`).formulas = [[`=IFERROR(${col}20/${col}4,0)`]];
  costModel.getRange(`${col}23`).formulas = [[`=IFERROR(${col}21/${col}4,0)`]];
}
costModel.getRange("F3:J3").values = [[
  "費目", "分類", "根拠", "料金根拠URL", "課金開始条件",
]];
costModel.getRange("F4:J13").values = [
  ["Cloudflare Workers・D1", "必須固定", "Paid最低$5/月。大半は基本枠内", "https://developers.cloudflare.com/workers/platform/pricing/", "常時"],
  ["ドメイン", "必須固定", "hoshilu.app更新費の仮定", "契約中レジストラの請求明細", "年次更新"],
  ["Stripeカード", "売上連動", "国内カード3.6% + Billing 0.7%", "https://stripe.com/jp/pricing", "カード決済成功時"],
  ["Stripe銀行振込", "売上連動", "銀行振込1.5% + Billing 0.7%", "https://stripe.com/jp/pricing", "銀行振込処理時"],
  ["Resend", "段階課金", "月3,000通まで無料、Pro $20/月", "https://resend.com/pricing", "無料枠超過時"],
  ["LINE", "段階課金", "月200通無料、ライト5,000円/月", "https://developers.line.biz/ja/docs/messaging-api/pricing/", "プッシュ通知増加時"],
  ["X API", "任意・従量", "実際の購入クレジットだけ", "X Developer Console請求画面", "残高購入時"],
  ["監視・追加SaaS", "任意", "Cloudflare標準機能で開始可能", "各契約サービス請求明細", "追加契約時"],
  ["会計ソフト追加分", "任意", "既存契約で賄える場合は0円", "利用中サービス請求明細", "追加契約時"],
  ["生成AI API", "現在0円", "本番検索コードに外部生成AI呼出しなし", "HOSHILU実装確認 2026-07-30", "将来導入時のみ"],
];
costModel.getRange("A25:D27").merge();
costModel.getRange("A25").values = [[
  "除外：役員報酬、従業員給与、社会保険、人的外注、広告出稿、法人税。黄色セルは予算入力であり、実際の請求書・利用量へ置き換えて更新します。",
]];
costModel.getRange("A29:D29").merge();
costModel.getRange("A29").values = [["モデルチェック"]];
costModel.getRange("A30:A32").values = [["決済構成比"], ["利益計算一致"], ["経費率＋利益率"]];
costModel.getRange("B30:D32").formulas = [
  [
    "=IF(ABS(B5+B6-1)<0.0001,\"OK\",\"ERROR\")",
    "=IF(ABS(C5+C6-1)<0.0001,\"OK\",\"ERROR\")",
    "=IF(ABS(D5+D6-1)<0.0001,\"OK\",\"ERROR\")",
  ],
  [
    "=IF(ABS(B21-(B4-B20))<0.01,\"OK\",\"ERROR\")",
    "=IF(ABS(C21-(C4-C20))<0.01,\"OK\",\"ERROR\")",
    "=IF(ABS(D21-(D4-D20))<0.01,\"OK\",\"ERROR\")",
  ],
  [
    "=IF(ABS(B22+B23-1)<0.0001,\"OK\",\"ERROR\")",
    "=IF(ABS(C22+C23-1)<0.0001,\"OK\",\"ERROR\")",
    "=IF(ABS(D22+D23-1)<0.0001,\"OK\",\"ERROR\")",
  ],
];

checks.getRange("A1:E1").merge();
checks.getRange("A1").values = [["検算・出典"]];
checks.getRange("A3:B8").values = [
  ["検算項目", "結果"],
  ["Dashboard セラー利益整合", null],
  ["HOSHILU売上整合", null],
  ["負担率の分母", "HOSHILU導入前利益"],
  ["料金決定に注文売上を使用", "使用しない"],
  ["未分類カテゴリ", "OTHER 0.07%"],
];
checks.getRange("B4").formulas = [["=IF(ABS(Dashboard!E14-(Dashboard!E11-Dashboard!E12-Dashboard!E13))<0.01,\"OK\",\"ERROR\")"]];
checks.getRange("B5").formulas = [["=IF(ABS(Dashboard!H7-(Dashboard!H5+Dashboard!H6))<0.01,\"OK\",\"ERROR\")"]];
checks.getRange("A10:D15").values = [
  ["項目", "値", "出典", "注記"],
  ["Stripe 国内カード", "3.6%", "https://stripe.com/jp/pricing", "日本国内発行カードの標準料金"],
  ["Stripe Billing", "0.7%", "https://stripe.com/jp/billing/pricing", "Billing従量課金の標準料金"],
  ["Stripe 銀行振込", "1.5%", "https://stripe.com/jp/pricing", "上限等は最新条件を要確認"],
  ["モデル作成日", "2026-07-30", "HOSHILU内部試算", "税抜・初期仮説"],
  ["注意", "カテゴリ別AOV・CVR等は編集可能な仮説", "HOSHILU内部試算", "実績30/60/90日で更新"],
];

for (const sheet of [dashboard, assumptions, scenarios, costModel, checks]) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(sheet === scenarios ? 3 : 2);
  const used = sheet.getUsedRange();
  used.format.font = { name: "Yu Gothic", size: 10, color: "#0F172A" };
  used.format.wrapText = true;
  used.format.borders = { preset: "all", style: "thin", color: border };
  used.format.autofitRows();
}
for (const sheet of [dashboard, assumptions, scenarios, costModel, checks]) {
  sheet.getRange("A1:Q2").format.fill = navy;
  sheet.getRange("A1:Q2").format.font = { name: "Yu Gothic", size: 15, bold: true, color: "#FFFFFF" };
}
assumptions.getRange("A3:K3").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
assumptions.getRange("M3:S3").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
assumptions.getRange("C4:K14").format.fill = inputFill;
assumptions.getRange("N12:N14").format.fill = inputFill;
assumptions.getRange("N17:N18").format.fill = inputFill;
dashboard.getRange("A4:B4").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
dashboard.getRange("D4:E4").format = { fill: cyan, font: { bold: true, color: "#FFFFFF" } };
dashboard.getRange("G4:H4").format = { fill: cyan, font: { bold: true, color: "#FFFFFF" } };
dashboard.getRange("A18:H20").format = { fill: pale, font: { bold: true, color: navy }, wrapText: true };
scenarios.getRange("A3:Q3").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
costModel.getRange("A3:D3").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
costModel.getRange("A17:D17").format = { fill: cyan, font: { bold: true, color: "#FFFFFF" } };
costModel.getRange("F3:J3").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
costModel.getRange("B4:D15").format.fill = inputFill;
costModel.getRange("A25:D27").format = { fill: pale, font: { bold: true, color: navy }, wrapText: true };
costModel.getRange("A29:D29").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
costModel.getRange("B30:D32").format = { fill: "#DCFCE7", font: { color: "#166534", bold: true } };
checks.getRange("A3:B3").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };
checks.getRange("A10:D10").format = { fill: violet, font: { bold: true, color: "#FFFFFF" } };

assumptions.getRange("C4:C14").format.numberFormat = "0.00%";
assumptions.getRange("D4:F14").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
assumptions.getRange("G4:J14").format.numberFormat = "0.0%";
assumptions.getRange("K4:K14").format.numberFormat = "¥#,##0";
assumptions.getRange("O4:O8").format.numberFormat = "¥#,##0";
assumptions.getRange("P4:P8").format.numberFormat = "0.00x";
assumptions.getRange("N12:N14").format.numberFormat = "0.0%";
assumptions.getRange("N17").format.numberFormat = "¥#,##0";
dashboard.getRange("B9").format.numberFormat = "0.0%";
dashboard.getRange("B10").format.numberFormat = "¥#,##0";
dashboard.getRange("E5").format.numberFormat = "0.0";
dashboard.getRange("E6:E14").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
dashboard.getRange("E15:E16").format.numberFormat = "0.0%";
dashboard.getRange("H5:H10").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
dashboard.getRange("H11").format.numberFormat = "0.0%";
dashboard.getRange("K4:L8").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
scenarios.getRange(`D4:D${3 + scenarioKeys.length}`).format.numberFormat = "0.0%";
scenarios.getRange(`E4:E${3 + scenarioKeys.length}`).format.numberFormat = "¥#,##0";
scenarios.getRange(`F4:F${3 + scenarioKeys.length}`).format.numberFormat = "0.0";
scenarios.getRange(`G4:M${3 + scenarioKeys.length}`).format.numberFormat = "¥#,##0;[Red]-¥#,##0";
scenarios.getRange(`N4:N${3 + scenarioKeys.length}`).format.numberFormat = "0.0%";
scenarios.getRange(`O4:P${3 + scenarioKeys.length}`).format.numberFormat = "¥#,##0;[Red]-¥#,##0";
costModel.getRange("B4:D4").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
costModel.getRange("B5:D8").format.numberFormat = "0.0%";
costModel.getRange("B9:D15").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
costModel.getRange("B18:D21").format.numberFormat = "¥#,##0;[Red]-¥#,##0";
costModel.getRange("B22:D23").format.numberFormat = "0.0%";

dashboard.getRange("A:A").format.columnWidth = 24;
dashboard.getRange("B:B").format.columnWidth = 24;
dashboard.getRange("D:D").format.columnWidth = 27;
dashboard.getRange("E:E").format.columnWidth = 18;
dashboard.getRange("G:G").format.columnWidth = 24;
dashboard.getRange("H:H").format.columnWidth = 22;
dashboard.getRange("J:L").format.columnWidth = 18;
assumptions.getRange("A:B").format.columnWidth = 19;
assumptions.getRange("C:K").format.columnWidth = 16;
assumptions.getRange("M:S").format.columnWidth = 18;
scenarios.getRange("A:B").format.columnWidth = 22;
scenarios.getRange("C:Q").format.columnWidth = 15;
costModel.getRange("A:A").format.columnWidth = 28;
costModel.getRange("B:D").format.columnWidth = 18;
costModel.getRange("F:F").format.columnWidth = 24;
costModel.getRange("G:G").format.columnWidth = 16;
costModel.getRange("H:H").format.columnWidth = 38;
costModel.getRange("I:I").format.columnWidth = 48;
costModel.getRange("J:J").format.columnWidth = 22;
checks.getRange("A:A").format.columnWidth = 30;
checks.getRange("B:B").format.columnWidth = 32;
checks.getRange("C:C").format.columnWidth = 42;
checks.getRange("D:D").format.columnWidth = 38;

const inspection = await wb.inspect({
  kind: "sheet,formula",
  maxChars: 8000,
  tableMaxRows: 8,
  tableMaxCols: 10,
  options: { maxResults: 80 },
});
await fs.writeFile(`${outputDir}/economics-inspection.txt`, inspection.ndjson ?? String(inspection));

for (const sheetName of ["Dashboard", "Assumptions", "Scenario Matrix", "HOSHILU Cost Model", "Checks & Sources"]) {
  const preview = await wb.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const safeName = sheetName.replaceAll(" ", "-").replaceAll("&", "and");
  await fs.writeFile(`${outputDir}/${safeName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(`${outputDir}/HOSHILU_Qualified_Referral_Unit_Economics_v1.0.xlsx`);
