(() => {
  "use strict";

  // Traduzione automatica delle notizie con il traduttore integrato in Chrome: gira sul dispositivo, senza AI né backend.
  const PREFS_KEY = "cyber-pulse.translate";
  const CACHE_KEY = "cyber-pulse.translate.cache";
  const CACHE_MAX = 600;
  const MIN_CHARS = 12;
  const MIN_CONFIDENCE = 0.6;
  const LANGUAGES = ["it", "en", "fr", "de", "es", "pt", "nl", "pl", "ru", "tr", "ja", "ko", "zh", "ar", "hi"];
  const COMMON = ["en", "fr", "de", "es"];
  const SELECTOR = [
    ".news-card-title > a", ".news-card-title:not(:has(a))", ".news-card-summary",
    ".cp-story-title", ".cp-story-summary", ".cp-headline-link", ".cp-story-links li > span", ".mu-title-link",
  ].join(",");

  const names = new Intl.DisplayNames(["it"], { type: "language" });
  const languageName = (code) => {
    const name = names.of(code) || code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const supported = () => "Translator" in self && "LanguageDetector" in self;

  function readPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return { on: raw.on === true, lang: LANGUAGES.includes(raw.lang) ? raw.lang : "it" };
    } catch {
      return { on: false, lang: "it" };
    }
  }

  let prefs = readPrefs();
  let status = { code: "idle", text: "" };
  let cache = null;
  let saveTimer = 0;
  let detectorPromise = null;
  const translators = new Map();
  const queue = [];
  const waiting = new Set();
  let running = false;
  let observer = null;
  let scanTimer = 0;
  const epoch = { value: 0 };

  function setStatus(code, text = "") {
    status = { code, text };
    document.dispatchEvent(new CustomEvent("cyberpulse:translatestatus"));
  }

  function loadCache() {
    if (cache) return cache;
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
      cache = new Map(Array.isArray(raw) ? raw : []);
    } catch {
      cache = new Map();
    }
    return cache;
  }

  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify([...loadCache()]));
      } catch { /* spazio esaurito: la cache resta solo in memoria */ }
    }, 800);
  }

  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36) + text.length.toString(36);
  }

  function getDetector() {
    if (!detectorPromise) {
      detectorPromise = LanguageDetector.create().catch(() => null);
    }
    return detectorPromise;
  }

  async function detect(text) {
    const detector = await getDetector();
    if (!detector) return null;
    try {
      const [best] = await detector.detect(text);
      if (!best || best.detectedLanguage === "und" || best.confidence < MIN_CONFIDENCE) return null;
      return best.detectedLanguage.split("-")[0];
    } catch {
      return null;
    }
  }

  // Restituisce il traduttore oppure null (coppia non supportata) o "gesture" (serve un tocco dell'utente per scaricare il modello).
  async function getTranslator(source, target) {
    const key = `${source}>${target}`;
    if (translators.has(key)) return translators.get(key);
    let result = null;
    try {
      const availability = await Translator.availability({ sourceLanguage: source, targetLanguage: target });
      if (availability === "unavailable") {
        translators.set(key, null);
        return null;
      }
      if (availability !== "available" && !navigator.userActivation?.isActive) return "gesture";
      result = await Translator.create({
        sourceLanguage: source,
        targetLanguage: target,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            setStatus("downloading", `Scarico la lingua ${languageName(source)}: ${Math.round(event.loaded * 100)}%`);
          });
        },
      });
      if (status.code === "downloading") setStatus("ok");
    } catch (error) {
      if (error?.name === "NotAllowedError") return "gesture";
      result = null;
    }
    translators.set(key, result);
    return result;
  }

  async function translateText(text, source) {
    const key = `${prefs.lang}|${hash(text)}`;
    const store = loadCache();
    if (store.has(key)) return store.get(key);
    const translator = await getTranslator(source, prefs.lang);
    if (translator === "gesture") return "gesture";
    if (!translator) return null;
    try {
      const out = String(await translator.translate(text)).trim();
      if (!out) return null;
      store.set(key, out);
      if (store.size > CACHE_MAX) store.delete(store.keys().next().value);
      saveCache();
      return out;
    } catch {
      return null;
    }
  }

  async function translateElement(element, token) {
    if (element.dataset.cpTr || !element.isConnected) return;
    const raw = element.textContent;
    const match = /^(\s*—\s*)?([\s\S]*)$/.exec(raw);
    const prefix = match[1] || "";
    const text = match[2].trim();
    if (text.length < MIN_CHARS) {
      element.dataset.cpTr = "skip";
      return;
    }
    const source = await detect(text);
    if (token !== epoch.value) return;
    if (!source || source === prefs.lang) {
      element.dataset.cpTr = "skip";
      return;
    }
    const out = await translateText(text, source);
    if (token !== epoch.value || !element.isConnected) return;
    if (out === "gesture") {
      waiting.add(element);
      setStatus("gesture", "Per scaricare una lingua serve un tuo tocco: tocca la pagina o usa il pulsante nelle Impostazioni.");
      return;
    }
    if (!out) {
      element.dataset.cpTr = "skip";
      return;
    }
    element.dataset.cpTrOrig = raw;
    element.dataset.cpTr = "done";
    element.textContent = prefix + out;
    element.title = `Tradotto da ${languageName(source)} · Originale: ${text.slice(0, 200)}`;
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length > 0) {
      const element = queue.shift();
      try {
        await translateElement(element, epoch.value);
      } catch { /* una voce non traducibile non blocca le altre */ }
    }
    running = false;
  }

  function enqueue(element) {
    if (!prefs.on || element.dataset.cpTr) return;
    queue.push(element);
    drain();
  }

  function scan(root = document) {
    if (!prefs.on) return;
    if (root.matches?.(SELECTOR)) enqueue(root);
    root.querySelectorAll?.(SELECTOR).forEach(enqueue);
  }

  function startObserver() {
    if (observer) return;
    const roots = new Set();
    observer = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => { if (node.nodeType === 1) roots.add(node); });
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = 0;
        const batch = [...roots];
        roots.clear();
        batch.forEach(scan);
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
  }

  function restoreAll() {
    epoch.value += 1;
    queue.length = 0;
    waiting.clear();
    document.querySelectorAll("[data-cp-tr]").forEach((element) => {
      if (element.dataset.cpTr === "done") {
        element.textContent = element.dataset.cpTrOrig || element.textContent;
        element.removeAttribute("title");
      }
      delete element.dataset.cpTr;
      delete element.dataset.cpTrOrig;
    });
  }

  function apply() {
    restoreAll();
    if (!prefs.on) {
      stopObserver();
      setStatus("idle");
      return;
    }
    if (!supported()) {
      setStatus("unsupported", "Il traduttore integrato richiede Chrome 138 o successivo (computer).");
      return;
    }
    setStatus("ok");
    startObserver();
    scan();
  }

  function setPrefs(partial) {
    prefs = { ...prefs, ...partial };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* preferenza non salvata */ }
    apply();
  }

  // Un tocco dell'utente permette di scaricare i modelli rimasti in attesa.
  document.addEventListener("pointerdown", () => {
    if (!prefs.on || waiting.size === 0) return;
    const pending = [...waiting];
    waiting.clear();
    setStatus("ok");
    pending.forEach(enqueue);
  }, true);

  async function downloadLanguages(choice) {
    if (!supported()) {
      setStatus("unsupported", "Il traduttore integrato richiede Chrome 138 o successivo (computer).");
      return;
    }
    const list = choice === "all" ? LANGUAGES : choice === "common" ? COMMON : [choice];
    let failed = 0;
    for (const source of list.filter((code) => code !== prefs.lang)) {
      translators.delete(`${source}>${prefs.lang}`);
      const result = await getTranslator(source, prefs.lang);
      if (!result || result === "gesture") failed += 1;
    }
    setStatus("ok", failed ? `Scaricate, ma ${failed} lingue non sono disponibili.` : "Download completato.");
  }

  function buildPanel() {
    const section = document.createElement("section");
    section.className = "cp-settings-section";
    const hint = document.createElement("p");
    hint.className = "cp-settings-hint";
    hint.textContent = "Traduce titoli e anteprime delle notizie nella tua lingua con il traduttore di Chrome: gratuito, senza AI e privato, perché il testo non lascia il dispositivo. Passa il mouse su un testo tradotto per vedere l'originale.";

    const grid = document.createElement("div");
    grid.className = "cp-reading-grid";

    const toggle = document.createElement("label");
    toggle.className = "cp-ai-radio";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = prefs.on;
    const label = document.createElement("span");
    label.textContent = "Traduci automaticamente le notizie";
    toggle.append(input, label);

    const row = document.createElement("div");
    row.className = "cp-reading-row";
    const legend = document.createElement("label");
    legend.className = "cp-ai-legend";
    legend.htmlFor = "translate-lang";
    legend.textContent = "Lingua predefinita";
    const select = document.createElement("select");
    select.id = "translate-lang";
    for (const code of LANGUAGES) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = languageName(code);
      select.append(option);
    }
    select.value = prefs.lang;
    row.append(legend, select);

    const dlRow = document.createElement("div");
    dlRow.className = "cp-reading-row";
    const dlLegend = document.createElement("label");
    dlLegend.className = "cp-ai-legend";
    dlLegend.htmlFor = "translate-download";
    dlLegend.textContent = "Lingua da scaricare";
    const dlSelect = document.createElement("select");
    dlSelect.id = "translate-download";
    const download = document.createElement("button");
    download.type = "button";
    download.className = "cp-choice";
    download.textContent = "Scarica";
    dlRow.append(dlLegend, dlSelect, download);

    const fillDownloads = () => {
      const current = dlSelect.value || "common";
      dlSelect.replaceChildren();
      const add = (value, text) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        dlSelect.append(option);
        return option;
      };
      add("common", "Le più comuni (inglese, francese, tedesco, spagnolo)");
      add("all", "Tutte le lingue");
      for (const code of LANGUAGES.filter((item) => item !== prefs.lang)) {
        const option = add(code, languageName(code));
        if (supported()) {
          Translator.availability({ sourceLanguage: code, targetLanguage: prefs.lang }).then((state) => {
            if (state === "available") option.textContent = `${languageName(code)} ✓ scaricata`;
            else if (state === "unavailable") option.textContent = `${languageName(code)} (non disponibile)`;
          }).catch(() => {});
        }
      }
      dlSelect.value = [...dlSelect.options].some((o) => o.value === current) ? current : "common";
    };
    fillDownloads();

    const note = document.createElement("p");
    note.className = "cp-ui-status";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    const paint = () => {
      note.textContent = status.text || (supported() ? "" : "Il traduttore integrato richiede Chrome 138 o successivo (computer).");
    };
    paint();
    document.addEventListener("cyberpulse:translatestatus", paint);

    input.addEventListener("change", () => setPrefs({ on: input.checked }));
    select.addEventListener("change", () => {
      setPrefs({ lang: select.value });
      fillDownloads();
    });
    download.addEventListener("click", async () => {
      download.disabled = true;
      await downloadLanguages(dlSelect.value);
      download.disabled = false;
      fillDownloads();
    });

    grid.append(toggle, row, dlRow, note);
    section.append(hint, grid);
    return section;
  }

  function init() {
    window.CyberPulseSettings?.register({ id: "translate", group: "news", title: "Traduzione", build: buildPanel });
    if (prefs.on) apply();
  }

  window.CyberPulseTranslate = Object.freeze({ getPrefs: () => ({ ...prefs }), setPrefs, supported });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
