/**
 * Progressive speech input for HOSHILU search fields.
 *
 * Audio is not uploaded to or stored by the HOSHILU application. Browser speech
 * recognition availability and processing depend on the user's browser/vendor.
 */

const LANGUAGE_TAGS = Object.freeze({
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
  ko: "ko-KR",
});

const LABELS = Object.freeze({
  ja: {
    start: "音声で入力",
    stop: "音声入力を停止",
    listening: "聞いています…",
    unsupported: "このブラウザは音声入力に対応していません。",
    denied: "マイクの使用が許可されていません。",
    failed: "音声を認識できませんでした。もう一度お試しください。",
  },
  en: {
    start: "Type by voice",
    stop: "Stop voice input",
    listening: "Listening…",
    unsupported: "Voice input is not supported by this browser.",
    denied: "Microphone access was not allowed.",
    failed: "Speech could not be recognized. Please try again.",
  },
  zh: {
    start: "语音输入",
    stop: "停止语音输入",
    listening: "正在聆听…",
    unsupported: "此浏览器不支持语音输入。",
    denied: "未允许使用麦克风。",
    failed: "无法识别语音，请重试。",
  },
  ko: {
    start: "음성으로 입력",
    stop: "음성 입력 중지",
    listening: "듣고 있어요…",
    unsupported: "이 브라우저는 음성 입력을 지원하지 않습니다.",
    denied: "마이크 사용이 허용되지 않았습니다.",
    failed: "음성을 인식하지 못했습니다. 다시 시도해 주세요.",
  },
});

export function normalizeSpeechLocale(locale) {
  const language = String(locale || "ja").toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(LANGUAGE_TAGS, language) ? language : "ja";
}

export function speechLanguageTag(locale) {
  return LANGUAGE_TAGS[normalizeSpeechLocale(locale)];
}

export function mergeSpeechTranscript(existing, transcript) {
  const base = String(existing || "").trim();
  const addition = String(transcript || "").replace(/\s+/g, " ").trim();
  if (!addition) return base;
  if (!base) return addition;
  if (base.toLocaleLowerCase().includes(addition.toLocaleLowerCase())) return base;
  const separator = /[。！？.!?]$/.test(base) ? " " : " ";
  return `${base}${separator}${addition}`.slice(0, 1000);
}

function recognitionConstructor(scope) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null;
}

function dispatchInput(target) {
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

export function attachSpeechInput({
  button,
  target,
  locale = "ja",
  status,
  scope = globalThis,
  onTranscript,
  onStateChange,
} = {}) {
  if (!button || !target) throw new Error("button and target are required");
  const language = normalizeSpeechLocale(locale);
  const labels = LABELS[language];
  const Recognition = recognitionConstructor(scope);
  let recognition = null;
  let listening = false;

  function setStatus(message = "") {
    if (status) {
      status.textContent = message;
      status.hidden = !message;
    }
  }

  function setListening(next) {
    listening = next;
    button.dataset.listening = String(next);
    button.setAttribute("aria-pressed", String(next));
    button.setAttribute("aria-label", next ? labels.stop : labels.start);
    if (next) setStatus(labels.listening);
    else if (status?.textContent === labels.listening) setStatus("");
    onStateChange?.(next ? "listening" : "idle");
  }

  if (!Recognition) {
    button.hidden = true;
    button.setAttribute("aria-hidden", "true");
    setStatus("");
    return {
      supported: false,
      start() {
        onStateChange?.("unsupported");
        return false;
      },
      stop() {},
      destroy() {},
    };
  }

  button.hidden = false;
  button.setAttribute("aria-label", labels.start);
  button.setAttribute("aria-pressed", "false");

  function createRecognition() {
    const instance = new Recognition();
    instance.lang = speechLanguageTag(language);
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    let finalTranscript = "";

    instance.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = String(result?.[0]?.transcript || "");
        if (result.isFinal) finalTranscript += text;
        else interim += text;
      }
      if (interim) setStatus(interim);
      if (finalTranscript.trim()) {
        target.value = mergeSpeechTranscript(target.value, finalTranscript);
        dispatchInput(target);
        onTranscript?.(finalTranscript.trim(), target.value);
        finalTranscript = "";
      }
    };
    instance.onerror = (event) => {
      const denied = event?.error === "not-allowed" || event?.error === "service-not-allowed";
      setStatus(denied ? labels.denied : labels.failed);
      setListening(false);
      onStateChange?.(denied ? "denied" : "error");
    };
    instance.onend = () => setListening(false);
    return instance;
  }

  function start() {
    if (listening) return true;
    recognition = createRecognition();
    try {
      recognition.start();
      setListening(true);
      return true;
    } catch {
      setStatus(labels.failed);
      setListening(false);
      return false;
    }
  }

  function stop() {
    if (!recognition) return;
    try {
      recognition.stop();
    } finally {
      setListening(false);
    }
  }

  function onClick(event) {
    event.preventDefault();
    if (listening) stop();
    else start();
  }

  button.addEventListener("click", onClick);
  return {
    supported: true,
    start,
    stop,
    destroy() {
      stop();
      button.removeEventListener("click", onClick);
      recognition = null;
    },
  };
}

/**
 * Auto-wires elements such as:
 * <button data-hoshilu-speech data-target="search-input">
 * <textarea id="search-input">
 */
export function mountSpeechInputs(root = document, options = {}) {
  const controllers = [];
  for (const button of root.querySelectorAll("[data-hoshilu-speech]")) {
    const targetId = button.dataset.target || button.getAttribute("aria-controls");
    const target = targetId ? root.getElementById?.(targetId) : null;
    if (!target) continue;
    const statusId = button.dataset.status;
    const status = statusId ? root.getElementById?.(statusId) : null;
    controllers.push(
      attachSpeechInput({
        button,
        target,
        status,
        locale: options.locale || root.documentElement?.lang || "ja",
        scope: options.scope || globalThis,
        onTranscript: options.onTranscript,
      }),
    );
  }
  return {
    controllers,
    destroy() {
      for (const controller of controllers) controller.destroy();
    },
  };
}
