import { buildConsultUrl } from './shared.mjs';

const query = document.querySelector('#query');
const consent = document.querySelector('#consent');
const consult = document.querySelector('#consult');
const settings = document.querySelector('#settings');
const error = document.querySelector('#error');
const sourceStatus = document.querySelector('#sourceStatus');

async function readVisiblePageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('PAGE_NOT_SUPPORTED');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: String(document.title || '').slice(0, 200),
      selected: String(window.getSelection()?.toString() || '').trim().slice(0, 200)
    })
  });
  return result || {};
}

async function initialize() {
  try {
    const context = await readVisiblePageContext();
    query.value = context.selected || context.title || '';
    sourceStatus.textContent = context.selected ? '選択した文字を読み取りました。' : '表示中のページタイトルを読み取りました。';
  } catch {
    sourceStatus.textContent = 'このページでは情報を読み取れません。相談内容を直接入力できます。';
  }
}

consult.addEventListener('click', async () => {
  error.textContent = '';
  try {
    if (!consent.checked) throw new Error('CONSENT_REQUIRED');
    const { pwaBaseUrl = '' } = await chrome.storage.sync.get('pwaBaseUrl');
    if (!pwaBaseUrl) throw new Error('PWA_URL_REQUIRED');
    const url = buildConsultUrl(pwaBaseUrl, query.value);
    await chrome.tabs.create({ url });
  } catch (cause) {
    const messages = {
      CONSENT_REQUIRED: '文字を渡すことへの同意が必要です。',
      PWA_URL_REQUIRED: '先に「接続先を設定」からP-GATEのURLを登録してください。',
      PWA_URL_INVALID: '登録したP-GATE URLが不正です。',
      QUERY_LENGTH_INVALID: '相談内容は2〜200文字で入力してください。'
    };
    error.textContent = messages[cause.message] || '相談画面を開けませんでした。';
  }
});

settings.addEventListener('click', () => chrome.runtime.openOptionsPage());
initialize();
