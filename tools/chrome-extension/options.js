import { normalizePwaBase } from './shared.mjs';

const form = document.querySelector('#optionsForm');
const input = document.querySelector('#pwaBaseUrl');
const status = document.querySelector('#status');

chrome.storage.sync.get('pwaBaseUrl').then(({ pwaBaseUrl = '' }) => { input.value = pwaBaseUrl; });

form.addEventListener('submit', async (event) => {
  event.preventDefault(); status.textContent = '';
  try {
    const value = normalizePwaBase(input.value);
    await chrome.storage.sync.set({ pwaBaseUrl: value });
    input.value = value; status.textContent = '保存しました。';
  } catch {
    status.textContent = 'https://から始まるP-GATE URLを入力してください。';
  }
});
