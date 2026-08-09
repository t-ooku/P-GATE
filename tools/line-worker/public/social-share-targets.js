const SHARE_URL = `${location.origin}/x-card-v3?utm_source=user_share&utm_medium=social&utm_campaign=found_with_hoshilu&utm_content=x_card_v3`;
const labels = {
  JA: { x:'Xへ投稿', instagram:'Instagram用にコピー', tiktok:'TikTok用にコピー', copied:'投稿文とリンクをコピーしました。貼り付けて投稿してください。' },
  EN: { x:'Post to X', instagram:'Copy for Instagram', tiktok:'Copy for TikTok', copied:'Post text and link copied. Paste them into your post.' },
  ZH: { x:'发布到 X', instagram:'复制到 Instagram', tiktok:'复制到 TikTok', copied:'已复制文字和链接，请粘贴发布。' },
  KO: { x:'X에 게시', instagram:'Instagram용 복사', tiktok:'TikTok용 복사', copied:'게시 문구와 링크를 복사했습니다. 붙여넣어 게시하세요.' }
};

function language() {
  return document.querySelector('#languageSelect')?.value || 'JA';
}

function payload() {
  const query = String(document.querySelector('#query')?.value || '').trim().slice(0, 80);
  const include = document.querySelector('.share-include-query input')?.checked;
  const text = include && query ? `HOSHILUで探しました：${query}\n#ホシルで見つけた` : '#ホシルで見つけた';
  return `${text}\n${SHARE_URL}`;
}

async function copyFor(destination, status) {
  await navigator.clipboard.writeText(payload());
  status.textContent = (labels[language()] || labels.JA).copied;
  window.open(destination, '_blank', 'noopener,noreferrer');
}

function enhance(card) {
  if (card.querySelector('.direct-social-targets')) return;
  const copy = labels[language()] || labels.JA;
  const status = card.querySelector('.share-discovery-status');
  const targets = document.createElement('div');
  targets.className = 'direct-social-targets';

  const x = document.createElement('a');
  x.className = 'social-target social-target-x';
  x.target = '_blank';
  x.rel = 'noopener noreferrer';
  x.textContent = copy.x;
  x.addEventListener('click', () => {
    x.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload())}`;
  });

  const instagram = document.createElement('button');
  instagram.type = 'button';
  instagram.className = 'social-target social-target-instagram';
  instagram.textContent = copy.instagram;
  instagram.addEventListener('click', () => copyFor('https://www.instagram.com/', status));

  const tiktok = document.createElement('button');
  tiktok.type = 'button';
  tiktok.className = 'social-target social-target-tiktok';
  tiktok.textContent = copy.tiktok;
  tiktok.addEventListener('click', () => copyFor('https://www.tiktok.com/', status));

  targets.append(x, instagram, tiktok);
  // 「HOSHILUで探した」の共有6導線を同じ1行に収めるため、既存3ボタンの
  // actions内へ追加する。別コンテナでcard直下へ足すとPCでも2段に分かれる。
  (card.querySelector('.share-discovery-actions') || card).append(targets);
}

const observer = new MutationObserver(() => {
  document.querySelectorAll('.share-discovery').forEach(enhance);
});
observer.observe(document.documentElement, { childList:true, subtree:true });
document.querySelectorAll('.share-discovery').forEach(enhance);
