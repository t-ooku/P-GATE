const form = document.querySelector('#sellerLoginForm');
const button = document.querySelector('#sellerLoginButton');
const status = document.querySelector('#sellerLoginStatus');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '';
  let rateLimited = false;
  try {
    const response = await fetch('/api/seller/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: form.id.value, password: form.password.value })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'LOGIN_FAILED');
    location.replace('/seller');
  } catch (error) {
    rateLimited = error.message === 'LOGIN_RATE_LIMITED';
    status.textContent = rateLimited
      ? '試行回数が上限に達しました。15分後に再試行してください。'
      : error.message === 'SELLER_LOGIN_GUARD_UNAVAILABLE'
        ? '現在ログインを確認できません。管理担当者へ連絡してください。'
        : window.HoshiluI18n?.t('seller.loginError') || 'IDまたはパスワードを確認してください。';
  } finally {
    button.disabled = rateLimited;
  }
});
