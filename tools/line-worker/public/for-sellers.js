const form = document.querySelector('#sellerBusinessForm');
const status = document.querySelector('#formStatus');
let turnstileToken = '';
let turnstileWidget = null;

async function initializeTurnstile() {
  const response = await fetch('/api/config', { cache: 'no-store' });
  const config = response.ok ? await response.json() : {};
  const sitekey = String(config.turnstile_site_key || '');
  for (let index = 0; index < 80 && !window.turnstile; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!sitekey || !window.turnstile) throw new Error('不正送信防止機能を読み込めませんでした。再読み込みしてください。');
  turnstileWidget = window.turnstile.render('#turnstile', {
    sitekey, theme: 'light', size: 'flexible',
    callback: token => { turnstileToken = token; },
    'expired-callback': () => { turnstileToken = ''; },
    'error-callback': () => { turnstileToken = ''; }
  });
}

initializeTurnstile().catch(error => { status.textContent = error.message; });

form?.addEventListener('submit', async event => {
  event.preventDefault();
  status.className = 'status';
  if (!form.reportValidity()) return;
  if (!turnstileToken) { status.textContent = '不正送信防止の確認を完了してください。'; return; }
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const payload = {
    inquiry_type: data.get('inquiry_type'), organization_type: data.get('organization_type'),
    organization_name: data.get('organization_name'), contact_name: data.get('contact_name'),
    contact_email: data.get('contact_email'), storefront_url: data.get('storefront_url'),
    marketplaces: data.getAll('marketplaces'), monthly_order_range: data.get('monthly_order_range'),
    plan_interest: data.get('plan_interest'), payment_preference: data.get('payment_preference'),
    message: data.get('message'), company_website: data.get('company_website'),
    privacy_consent: data.get('privacy_consent') === 'on', turnstile_token: turnstileToken
  };
  button.disabled = true;
  status.textContent = '送信しています…';
  try {
    const response = await fetch('/api/seller-business/inquiries', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error('送信できませんでした。入力内容をご確認ください。');
    form.reset();
    turnstileToken = '';
    if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
    status.className = 'status success';
    status.textContent = '受付しました。内容を確認後、担当者からご連絡します。';
  } catch (error) {
    status.textContent = error.message || '送信できませんでした。時間をおいてお試しください。';
  } finally {
    button.disabled = false;
    if (!status.classList.contains('success')) {
      turnstileToken = '';
      if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
    }
  }
});
