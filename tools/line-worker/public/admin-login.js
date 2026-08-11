const form = document.querySelector('#adminLoginForm');
const status = document.querySelector('#adminLoginStatus');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '認証しています。';
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: document.querySelector('#adminId').value,
        password: document.querySelector('#adminPassword').value
      })
    });
    if (response.status === 429) throw new Error('LOGIN_RATE_LIMITED');
    if (response.status === 503) throw new Error('LOGIN_UNAVAILABLE');
    if (!response.ok) throw new Error('LOGIN_FAILED');
    location.replace('/admin/sp-api');
  } catch (error) {
    status.textContent = error.message === 'LOGIN_RATE_LIMITED'
      ? '試行回数が上限に達しました。15分後に再試行してください。'
      : error.message === 'LOGIN_UNAVAILABLE'
        ? '現在ログインを確認できません。管理担当者へ連絡してください。'
        : 'メールアドレスまたはパスワードを確認してください。';
    submit.disabled = error.message === 'LOGIN_RATE_LIMITED';
  }
});
