/* Cyber Pulse - Hub Traduttore (Cyber Translate).
 * Per ora contiene solo Google Traduttore. Google non consente di incorporare il suo sito in altre pagine,
 * quindi il testo scritto qui viene passato a Google Traduttore, che si apre in una nuova scheda. */
(() => {
  "use strict";

  const PREFS_KEY = "cyber-pulse.translator.hub";
  const VIEW_KEY = "cyber-pulse.view";
  const MAX_TEXT = 4000;
  const BASE = "https://translate.google.com/";
  const LANGUAGES = ["en", "it", "fr", "de", "es", "pt", "nl", "pl", "ro", "ru", "uk", "el", "tr", "ar", "he", "hi", "zh-CN", "ja", "ko", "sv", "da", "fi", "cs", "hu"];
  const ARROWS = "M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z";

  const ui = { active: false };
  let page;
  let input;
  let fromSelect;
  let toSelect;
  let counter;
  let submit;

  const names = new Intl.DisplayNames(["it"], { type: "language" });
  const languageName = (code) => {
    const name = names.of(code) || code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function readPrefs() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { /* preferenze non valide */ }
    const fallback = window.CyberPulseTranslate?.getPrefs().lang || "it";
    return {
      from: raw.from === "auto" || LANGUAGES.includes(raw.from) ? raw.from : "auto",
      to: LANGUAGES.includes(raw.to) ? raw.to : fallback,
    };
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ from: fromSelect.value, to: toSelect.value })); } catch { /* preferenza non salvata */ }
  }

  function buildUrl(text) {
    const url = new URL(BASE);
    url.searchParams.set("sl", fromSelect.value);
    url.searchParams.set("tl", toSelect.value);
    if (text) url.searchParams.set("text", text);
    url.searchParams.set("op", "translate");
    return url.toString();
  }

  function openGoogle() {
    const text = input.value.trim().slice(0, MAX_TEXT);
    window.open(buildUrl(text), "_blank", "noopener,noreferrer");
  }

  function fillSelect(select, withAuto) {
    if (withAuto) select.append(new Option("Rileva la lingua", "auto"));
    for (const code of LANGUAGES) select.append(new Option(languageName(code), code));
  }

  function labelled(text, control) {
    const wrap = el("div", "tr-field");
    const label = el("label", "tr-label", text);
    label.htmlFor = control.id;
    wrap.append(label, control);
    return wrap;
  }

  function buildPage() {
    page = el("section", "tr-page");
    page.id = "translator-page";
    page.hidden = true;
    page.setAttribute("aria-labelledby", "translator-page-title");
    const title = el("h1", "tr-title", "Cyber Translate");
    title.id = "translator-page-title";
    const description = el("p", "tr-description", "Traduci testi e documenti con Google Traduttore. Altri traduttori arriveranno in futuro.");

    const card = el("div", "tr-card");
    const head = el("div", "tr-card-head");
    head.append(el("strong", "", "Google Traduttore"), el("span", "tr-badge", "Si apre in una nuova scheda"));

    input = el("textarea", "tr-input");
    input.id = "tr-input";
    input.maxLength = MAX_TEXT;
    input.rows = 7;
    input.placeholder = "Scrivi o incolla il testo da tradurre";

    fromSelect = el("select", "tr-select");
    fromSelect.id = "tr-from";
    fillSelect(fromSelect, true);
    toSelect = el("select", "tr-select");
    toSelect.id = "tr-to";
    fillSelect(toSelect, false);
    const prefs = readPrefs();
    fromSelect.value = prefs.from;
    toSelect.value = prefs.to;

    const swap = el("button", "tr-icon-button");
    swap.type = "button";
    swap.setAttribute("aria-label", "Inverti le lingue");
    swap.title = "Inverti le lingue";
    swap.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROWS}"/></svg>`;
    swap.addEventListener("click", () => {
      const from = fromSelect.value;
      const to = toSelect.value;
      if (from === "auto") {
        fromSelect.value = to;
        toSelect.value = to === "en" ? "it" : "en";
      } else {
        fromSelect.value = to;
        toSelect.value = from;
      }
      savePrefs();
    });
    fromSelect.addEventListener("change", savePrefs);
    toSelect.addEventListener("change", savePrefs);

    const languages = el("div", "tr-languages");
    languages.append(labelled("Da", fromSelect), swap, labelled("A", toSelect));

    counter = el("span", "tr-count");
    const updateCount = () => { counter.textContent = `${input.value.length}/${MAX_TEXT}`; };
    input.addEventListener("input", updateCount);
    updateCount();

    submit = el("button", "tr-primary", "Traduci con Google");
    submit.type = "button";
    submit.addEventListener("click", openGoogle);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) openGoogle();
    });

    const docs = el("a", "tr-link", "Traduci un documento");
    docs.href = `${BASE}?op=docs&sl=${fromSelect.value}&tl=${toSelect.value}`;
    docs.target = "_blank";
    docs.rel = "noopener noreferrer";
    const refreshDocs = () => { docs.href = `${BASE}?op=docs&sl=${fromSelect.value}&tl=${toSelect.value}`; };
    fromSelect.addEventListener("change", refreshDocs);
    toSelect.addEventListener("change", refreshDocs);
    swap.addEventListener("click", refreshDocs);

    const actions = el("div", "tr-actions");
    actions.append(submit, docs, counter);

    const note = el("p", "tr-note", "Il testo che scrivi qui viene inviato a Google solo quando premi “Traduci con Google”. Ctrl+Invio per tradurre più in fretta.");
    card.append(head, input, languages, actions, note);
    page.append(title, description, card);
    document.querySelector("#home")?.append(page);
  }

  function renderTabs() {
    const strip = document.querySelector("#category-strip");
    if (!strip) return;
    const tab = el("button", "category-button", "Google Traduttore");
    tab.type = "button";
    tab.setAttribute("aria-pressed", "true");
    tab.addEventListener("click", () => input?.focus());
    strip.replaceChildren(tab);
    const dashboard = document.querySelector(".dashboard-button");
    dashboard?.removeAttribute("data-category");
    dashboard?.setAttribute("aria-label", "Traduttore");
    dashboard?.setAttribute("aria-pressed", "true");
  }

  function saveView() {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ hub: "translate", tab: "google" })); } catch { /* storage non disponibile */ }
  }

  function show() {
    if (!window.CyberPulseAuth?.getUser()) return;
    const hub = document.body.dataset.hub;
    if (hub === "arena") window.CyberPulseArena?.showHome();
    if (hub === "music") window.CyberPulseMusic?.close();
    if (hub === "games") window.CyberPulseGames?.close();
    if (hub === "library") window.CyberPulseLibrary?.close();
    ui.active = true;
    document.querySelector("#home-page").hidden = true;
    ["#arena-page", "#music-page", "#games-page", "#library-page"].forEach((selector) => document.querySelector(selector)?.setAttribute("hidden", ""));
    page.hidden = false;
    document.body.dataset.hub = "translate";
    document.querySelectorAll("[data-launcher-home], #open-arena, #open-music, #open-games, #open-library, #open-translator").forEach((node) => {
      node.classList.toggle("current", node.id === "open-translator");
    });
    document.querySelector("#launcher")?.close();
    document.querySelector(".second-row")?.setAttribute("aria-label", "Cyber Translate");
    renderTabs();
    saveView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function close() {
    if (!ui.active) return;
    ui.active = false;
    page.hidden = true;
    document.querySelector("#open-translator")?.classList.remove("current");
    if (document.body.dataset.hub === "translate") document.body.removeAttribute("data-hub");
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-translator-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-translator-styles";
    style.textContent = `
      .tr-page { padding-top: 32px; }
      .tr-page[hidden] { display: none !important; }
      body[data-hub="translate"] #source-filter-button { display: none; }
      .tr-title { margin: 0 0 8px; font-size: clamp(22px, 4vw, 28px); font-weight: 600; letter-spacing: -.3px; }
      .tr-description { margin: 0 0 20px; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .tr-card { display: grid; max-width: 760px; gap: 14px; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
      .tr-card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 16px; }
      .tr-badge { padding: 3px 10px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 600; }
      .tr-input { width: 100%; min-height: 150px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 16px; line-height: 1.5; resize: vertical; }
      .tr-input:focus-visible, .tr-select:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent); outline-offset: 1px; }
      .tr-languages { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
      .tr-field { display: grid; flex: 1 1 160px; gap: 4px; }
      .tr-label { color: var(--text-muted); font-size: 12px; font-weight: 600; }
      .tr-select { min-height: 42px; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 14px; }
      .tr-icon-button { display: inline-grid; width: 42px; height: 42px; flex: none; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--text); cursor: pointer; }
      .tr-icon-button:hover { background: var(--accent-soft); color: var(--accent); }
      .tr-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
      .tr-primary { min-height: 42px; padding: 0 22px; border: 0; border-radius: 21px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; }
      .tr-link { color: var(--accent); font-size: 14px; font-weight: 600; }
      .tr-count { margin-left: auto; color: var(--text-muted); font-size: 12px; }
      .tr-note { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
    `;
    document.head.append(style);
  }

  function init() {
    addStyles();
    if (!document.querySelector("#home")) return;
    buildPage();

    document.querySelector("#open-translator")?.addEventListener("click", show);
    const restore = () => {
      try {
        const view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");
        if (view?.hub === "translate" && !ui.active) show();
      } catch { /* vista non valida */ }
    };
    if (window.CyberPulseAuth?.getUser()) restore();
    else document.addEventListener("cyberpulse:signedin", restore, { once: true });

    document.querySelectorAll("[data-launcher-home]").forEach((node) => node.addEventListener("click", () => {
      const wasActive = ui.active;
      close();
      if (wasActive) document.dispatchEvent(new CustomEvent("cyberpulse:restorestrip"));
    }));
    // Qualsiasi altro hub che si apre chiude il Traduttore.
    new MutationObserver(() => {
      if (ui.active && document.body.dataset.hub !== "translate") close();
    }).observe(document.body, { attributes: true, attributeFilter: ["data-hub"] });
    ["#open-arena", "#open-music", "#open-games", "#open-library"].forEach((selector) => {
      document.querySelector(selector)?.addEventListener("click", close);
    });
    document.querySelector(".brand")?.addEventListener("click", (event) => {
      if (!ui.active) return;
      event.preventDefault();
      window.CyberPulseArena?.showHome();
      close();
    });
    document.querySelector(".dashboard-button")?.addEventListener("click", (event) => {
      if (!ui.active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input?.focus();
    }, true);
  }

  window.CyberPulseTranslator = Object.freeze({ open: show, close });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
