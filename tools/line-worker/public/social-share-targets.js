import { safeDiscoverySearchQuery } from './discovery-actions.mjs';

function shareUrl(destination) {
  const url = new URL('/', location.origin);
  url.search = new URLSearchParams({
    utm_source: 'user_share', utm_medium: 'social',
    utm_campaign: 'found_with_hoshilu', utm_content: `share_${destination}`
  }).toString();
  return url.toString();
}
const labels = {
  JA: { x:'Xへ投稿', instagram:'Instagram用にコピー', tiktok:'TikTok用にコピー', copied:'投稿文とリンクをコピーしました。貼り付けて投稿してください。', copyFailed:'自動コピーできませんでした。アプリを開きます。' },
  EN: { x:'Post to X', instagram:'Copy for Instagram', tiktok:'Copy for TikTok', copied:'Post text and link copied. Paste them into your post.', copyFailed:'Automatic copy failed. Opening the app.' },
  ZH: { x:'发布到 X', instagram:'复制到 Instagram', tiktok:'复制到 TikTok', copied:'已复制文字和链接，请粘贴发布。', copyFailed:'自动复制失败，正在打开应用。' },
  KO: { x:'X에 게시', instagram:'Instagram용 복사', tiktok:'TikTok용 복사', copied:'게시 문구와 링크를 복사했습니다. 붙여넣어 게시하세요.', copyFailed:'자동 복사에 실패했습니다. 앱을 엽니다.' }
};

function language() {
  return document.querySelector('#languageSelect')?.value || 'JA';
}

function payload(destination) {
  const query = safeDiscoverySearchQuery(document.querySelector('#query')?.value || '');
  const include = document.querySelector('.share-include-query input')?.checked;
  const text = include && query ? `HOSHILUで探しました：${query}\n#ホシルで見つけた` : '#ホシルで見つけた';
  return `${text}\n${shareUrl(destination)}`;
}

async function copyFor(destination, shareDestination, status) {
  const copy = labels[language()] || labels.JA;
  let copied = false;
  try {
    await navigator.clipboard.writeText(payload(shareDestination));
    copied = true;
  } catch {
    const area = document.createElement('textarea');
    area.value = payload(shareDestination);
    area.setAttribute('readonly', '');
    area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select();
    copied = document.execCommand('copy') === true; area.remove();
  }
  status.textContent = copied ? copy.copied : copy.copyFailed;
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
    x.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload('x'))}`;
  });

  const instagram = document.createElement('button');
  instagram.type = 'button';
  instagram.className = 'social-target social-target-instagram';
  instagram.textContent = copy.instagram;
  instagram.addEventListener('click', () => copyFor('https://www.instagram.com/', 'instagram', status));

  const tiktok = document.createElement('button');
  tiktok.type = 'button';
  tiktok.className = 'social-target social-target-tiktok';
  tiktok.textContent = copy.tiktok;
  tiktok.addEventListener('click', () => copyFor('https://www.tiktok.com/', 'tiktok', status));

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
