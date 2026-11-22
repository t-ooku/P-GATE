// 2026-11-22: LINE の手前の小さなページ（src/line-price-watch.mjs renderLineWatchPage）。
// 1 秒見せてから LINE へ進む。JS が動く時だけ進むので、JS を動かさない機械は「LINE へ進んだ」に数えない。
const open = document.getElementById('lineWatchOpen');
if (open?.href) setTimeout(() => { location.replace(open.href); }, 1000);
