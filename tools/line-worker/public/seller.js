const sessionResponse = await fetch('/api/seller/session', { cache: 'no-store' });
if (!sessionResponse.ok) location.replace('/seller-login.html');

const status = document.querySelector('#sellerPriorityStatus');
const buttons = () => [...document.querySelectorAll(
  '[data-priority-action],#sellerPriorityRuleForm button,#sellerInventoryRuleForm button,#sellerAiRuleForm button'
)];

function setBusy(busy) {
  buttons().forEach((button) => { button.disabled = busy; });
}

function showStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

async function updatePriority(payload) {
  setBusy(true);
  showStatus('保存しています…');
  try {
    const response = await fetch('/api/seller/priority-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(result.error || '保存できませんでした');
    showStatus('保存しました。画面を更新します。');
    location.reload();
  } catch (error) {
    showStatus(`保存できませんでした（${String(error.message || error)}）`, true);
    setBusy(false);
  }
}

document.querySelectorAll('[data-priority-action]').forEach((button) => {
  button.addEventListener('click', () => updatePriority({
    action: button.dataset.priorityAction,
    tenant: button.dataset.tenant,
    rule_id: button.dataset.ruleId,
    active: button.dataset.active
  }));
});

document.querySelector('#sellerPriorityRuleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  updatePriority({
    action: 'UPSERT_RULE', tenant: data.get('tenant'),
    scope_type: data.get('scope_type'), scope_value: data.get('scope_value'), active: true
  });
});

document.querySelector('#sellerInventoryRuleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  updatePriority({
    action: 'UPSERT_RULE', tenant: data.get('tenant'),
    scope_type: 'INVENTORY_MIN', scope_value: data.get('scope_value'), active: true
  });
});

document.querySelector('#sellerAiRuleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const submitter = event.submitter;
  updatePriority({
    action: 'UPSERT_RULE', tenant: data.get('tenant'),
    scope_type: 'AI_RECOMMENDED', scope_value: '*', active: submitter?.value === '1'
  });
});

document.querySelector('#sellerLogout')?.addEventListener('click', async () => {
  await fetch('/api/seller/logout', { method: 'POST' });
  location.replace('/');
});
