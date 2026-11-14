(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.querySelector('#speechInput');
  const query = document.querySelector('#query');
  const language = document.querySelector('#languageSelect');
  if (!SpeechRecognition || !button || !query || !language) return;

  const locale = { JA: 'ja-JP', EN: 'en-US', ZH: 'zh-CN', KO: 'ko-KR' };
  const labels = {
    JA: ['音声で入力', '音声入力を停止'],
    EN: ['Voice input', 'Stop voice input'],
    ZH: ['语音输入', '停止语音输入'],
    KO: ['음성 입력', '음성 입력 중지']
  };
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let listening = false;

  function updateButton() {
    const copy = labels[language.value] || labels.JA;
    button.textContent = listening ? '■' : '🎙';
    button.setAttribute('aria-label', copy[listening ? 1 : 0]);
    button.title = copy[listening ? 1 : 0];
    button.classList.toggle('listening', listening);
    button.setAttribute('aria-pressed', String(listening));
  }

  recognition.addEventListener('start', () => {
    listening = true;
    updateButton();
  });
  recognition.addEventListener('end', () => {
    listening = false;
    updateButton();
  });
  recognition.addEventListener('result', (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join(' ')
      .trim();
    if (!transcript) return;
    query.value = [query.value.trim(), transcript].filter(Boolean).join(' ');
    query.dispatchEvent(new Event('input', { bubbles: true }));
    query.focus();
  });
  recognition.addEventListener('error', () => {
    listening = false;
    updateButton();
  });
  button.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
      return;
    }
    recognition.lang = locale[language.value] || locale.JA;
    recognition.start();
  });
  language.addEventListener('change', updateButton);
  button.classList.remove('hidden');
  updateButton();
})();
