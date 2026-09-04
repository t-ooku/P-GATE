// 2026-09-04 総合実行指示書 §13–14 / §52: ジャンル → 小ジャンル探索と「人気ジャンル」。
// 大きなジャンルから小ジャンルへ掘り下げ、最後の一押しで横断検索をそのまま走らせる
// （ファッション → バッグ → トートバッグ → 本革 → 自立する）。商品ファーストのまま、
// 「何を探せばいいか分からない」人の入口にする。検索文は日本語（モール検索に強い語）。
// 検索は app.js の #knowledgeForm をそのまま使う（別の検索経路を増やさない）。

const TREE = [
  { label: 'ファッション', en: 'Fashion', children: [
    { label: 'バッグ', q: 'バッグ', children: [
      { label: 'トートバッグ', q: 'トートバッグ', children: [
        { label: '本革', q: '本革 トートバッグ', children: [
          { label: '自立する', q: '自立する 本革 トートバッグ' }, { label: 'A4が入る', q: 'A4 本革 トートバッグ' }, { label: '軽い', q: '軽量 本革 トートバッグ' }
        ] },
        { label: 'キャンバス', q: 'キャンバス トートバッグ' }, { label: 'ナイロン', q: 'ナイロン トートバッグ' }, { label: 'ミニトート', q: 'ミニトートバッグ' }
      ] },
      { label: 'ショルダー', q: 'ショルダーバッグ', children: [{ label: '小さめ', q: 'ミニショルダーバッグ' }, { label: '本革', q: '本革 ショルダーバッグ' }, { label: '斜めがけ', q: '斜めがけ ショルダーバッグ' }] },
      { label: 'リュック', q: 'リュック', children: [{ label: '通勤・PC', q: 'PC リュック 通勤' }, { label: '軽量', q: '軽量 リュック' }, { label: 'レディース', q: 'レディース リュック' }] },
      { label: '財布', q: '財布', children: [{ label: 'ミニ財布', q: 'ミニ財布' }, { label: '長財布', q: '長財布 本革' }] }
    ] },
    { label: '靴', q: '靴', children: [
      { label: 'スニーカー', q: 'スニーカー', children: [{ label: '白', q: '白 スニーカー' }, { label: '厚底', q: '厚底 スニーカー' }, { label: '歩きやすい', q: '歩きやすい スニーカー' }] },
      { label: 'サンダル', q: 'サンダル' }, { label: 'ブーツ', q: 'ブーツ' }, { label: 'パンプス', q: 'パンプス 痛くない' }, { label: 'ローファー', q: 'ローファー' }
    ] },
    { label: 'トップス', q: 'トップス', children: [{ label: 'Tシャツ', q: 'Tシャツ' }, { label: 'ブラウス', q: 'ブラウス' }, { label: 'ニット', q: 'ニット' }, { label: 'パーカー', q: 'パーカー' }] },
    { label: 'ワンピース', q: 'ワンピース', children: [{ label: 'ロング', q: 'ロングワンピース' }, { label: 'きれいめ', q: 'きれいめ ワンピース' }, { label: 'カジュアル', q: 'カジュアル ワンピース' }] },
    { label: 'アウター', q: 'アウター', children: [{ label: 'トレンチ', q: 'トレンチコート' }, { label: 'ダウン', q: 'ダウンジャケット' }, { label: 'カーディガン', q: 'カーディガン' }] }
  ] },
  { label: 'コスメ・美容', en: 'Beauty', children: [
    { label: 'リップ', q: 'リップ', children: [{ label: 'ティント', q: 'リップティント' }, { label: '保湿', q: '保湿 リップ' }, { label: 'マット', q: 'マットリップ' }] },
    { label: 'スキンケア', q: 'スキンケア', children: [{ label: '化粧水', q: '化粧水' }, { label: '美容液', q: '美容液' }, { label: '日焼け止め', q: '日焼け止め' }, { label: 'クレンジング', q: 'クレンジング' }] },
    { label: 'ベースメイク', q: 'ファンデーション', children: [{ label: 'クッションファンデ', q: 'クッションファンデ' }, { label: '下地', q: '化粧下地' }] },
    { label: 'ヘアケア', q: 'ヘアケア', children: [{ label: 'シャンプー', q: 'シャンプー' }, { label: 'ヘアオイル', q: 'ヘアオイル' }, { label: 'ドライヤー', q: 'ドライヤー' }] },
    { label: '韓国コスメ', q: '韓国コスメ', children: [{ label: 'ティント', q: '韓国 ティント' }, { label: 'パック', q: '韓国 シートマスク' }, { label: 'クッションファンデ', q: '韓国 クッションファンデ' }] }
  ] },
  { label: '家電・ガジェット', en: 'Electronics', children: [
    { label: 'イヤホン', q: 'ワイヤレスイヤホン', children: [{ label: 'ノイキャン', q: 'ノイズキャンセリング イヤホン' }, { label: '安い', q: 'ワイヤレスイヤホン 安い' }, { label: '運動用', q: 'スポーツ イヤホン' }] },
    { label: 'モバイルバッテリー', q: 'モバイルバッテリー', children: [{ label: '軽量', q: '軽量 モバイルバッテリー' }, { label: '大容量', q: '大容量 モバイルバッテリー' }] },
    { label: 'スマホ周り', q: 'スマホ アクセサリー', children: [{ label: 'ケース', q: 'スマホケース' }, { label: '充電器', q: '急速充電器' }, { label: 'スタンド', q: 'スマホスタンド' }] },
    { label: '季節家電', q: '季節家電', children: [{ label: 'ハンディファン', q: 'ハンディファン' }, { label: '加湿器', q: '加湿器' }, { label: '電気毛布', q: '電気毛布' }] },
    { label: '美容家電', q: '美容家電', children: [{ label: 'ヘアアイロン', q: 'ヘアアイロン' }, { label: '美顔器', q: '美顔器' }] }
  ] },
  { label: 'インテリア・生活', en: 'Home', children: [
    { label: '収納', q: '収納', children: [{ label: '収納ボックス', q: '収納ボックス' }, { label: 'ハンガーラック', q: 'ハンガーラック' }] },
    { label: 'キッチン', q: 'キッチン用品', children: [{ label: '水筒', q: '水筒' }, { label: '弁当箱', q: '弁当箱' }, { label: 'フライパン', q: 'フライパン' }] },
    { label: '寝具', q: '寝具', children: [{ label: '枕', q: '枕' }, { label: 'マットレス', q: 'マットレス' }] },
    { label: '掃除', q: '掃除用品', children: [{ label: 'コードレス掃除機', q: 'コードレス掃除機' }, { label: 'ロボット掃除機', q: 'ロボット掃除機' }] }
  ] },
  { label: 'キッズ・ベビー', en: 'Kids', children: [
    { label: 'ベビー用品', q: 'ベビー用品', children: [{ label: '抱っこ紐', q: '抱っこ紐' }, { label: 'ベビーカー', q: 'ベビーカー' }] },
    { label: '子ども服', q: '子供服', children: [{ label: '女の子', q: '女の子 子供服' }, { label: '男の子', q: '男の子 子供服' }] },
    { label: 'おもちゃ', q: 'おもちゃ', children: [{ label: '知育', q: '知育玩具' }] }
  ] },
  { label: 'スポーツ・アウトドア', en: 'Sports', children: [
    { label: 'ランニング', q: 'ランニング', children: [{ label: 'シューズ', q: 'ランニングシューズ' }, { label: 'ウェア', q: 'ランニングウェア' }] },
    { label: 'キャンプ', q: 'キャンプ用品', children: [{ label: 'テント', q: 'テント' }, { label: 'チェア', q: 'アウトドアチェア' }] },
    { label: 'ヨガ', q: 'ヨガ', children: [{ label: 'ヨガマット', q: 'ヨガマット' }, { label: 'ウェア', q: 'ヨガウェア' }] }
  ] }
];

// 人気ジャンル: 楽天公式ランキングで検証済みの小ジャンル（marketplace-ranking.mjs と同じ5つ）＋定番。
const POPULAR = [
  { label: 'ワイヤレスイヤホン', q: 'ワイヤレスイヤホン' }, { label: 'モバイルバッテリー', q: 'モバイルバッテリー' },
  { label: '化粧水', q: '化粧水' }, { label: 'レディーススニーカー', q: 'レディース スニーカー' }, { label: 'ハンディファン', q: 'ハンディファン' },
  { label: 'トートバッグ', q: 'トートバッグ' }, { label: 'リップティント', q: 'リップティント' }, { label: '水筒', q: '水筒' }
];

const $ = (selector) => document.querySelector(selector);
const isEnglish = () => ($('#language')?.value || 'JA') === 'EN';

function chip(label, { active = false, leaf = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chip genre-chip${active ? ' is-active' : ''}${leaf ? ' is-leaf' : ''}`;
  button.textContent = leaf ? `${label} で探す` : label;
  return button;
}

function runSearch(query) {
  const input = $('#query');
  const form = $('#knowledgeForm');
  if (!input || !form) return;
  input.value = query;
  $('#clearQuery')?.classList.remove('hidden');
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  $('#hoshiluSearch')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let path = [];
function render() {
  const chips = $('#genreChips');
  const crumb = $('#genreBreadcrumb');
  if (!chips || !crumb) return;
  chips.replaceChildren();
  crumb.replaceChildren();
  const root = chip(isEnglish() ? 'All genres' : 'すべてのジャンル', { active: path.length === 0 });
  root.addEventListener('click', () => { path = []; render(); });
  crumb.append(root);
  let level = TREE;
  path.forEach((node, index) => {
    const arrow = document.createElement('span'); arrow.className = 'genre-arrow'; arrow.textContent = '›';
    const item = chip(node.label, { active: index === path.length - 1 });
    item.addEventListener('click', () => { path = path.slice(0, index + 1); render(); });
    crumb.append(arrow, item);
    level = node.children || [];
  });
  const current = path[path.length - 1];
  if (current?.q) {
    const here = chip(current.label, { leaf: true });
    here.addEventListener('click', () => runSearch(current.q));
    chips.append(here);
  }
  for (const node of level) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const item = chip(isEnglish() && node.en ? node.en : node.label, { leaf: !hasChildren });
    item.addEventListener('click', () => {
      if (hasChildren) { path = [...path, node]; render(); }
      else runSearch(node.q || node.label);
    });
    chips.append(item);
  }
}

function renderPopular() {
  const target = $('#popularGenreChips');
  if (!target) return;
  target.replaceChildren();
  for (const item of POPULAR) {
    const button = chip(item.label);
    button.addEventListener('click', () => runSearch(item.q));
    target.append(button);
  }
  $('#popularRankingButton')?.addEventListener('click', () => $('#rankingSearchButton')?.click());
}

render();
renderPopular();
$('#language')?.addEventListener('change', render);
