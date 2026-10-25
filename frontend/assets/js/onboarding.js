(() => {
  "use strict";

  const STORAGE_KEYS = {
    completed: "cyber-pulse.onboarding-complete",
    level: "cyber-pulse.level",
    keywords: "cyber-pulse.keywords",
    geminiKey: "cyber-pulse.gemini-api-key",
  };
  const KEYWORDS = [
    "Tech", "PC", "Gaming", "Fotografia", "Video", "Anime", "Manga",
    "Musica", "Cucina", "Alimentazione", "Scienza", "Storia", "Viaggi",
  ];
  const state = { level: null, keywords: new Set(), dialog: null };

  function addStyles() {
    if (document.querySelector("#cyber-pulse-onboarding-styles")) return;

    const style = document.createElement("style");
    style.id = "cyber-pulse-onboarding-styles";
    style.textContent = `
      .cp-onboarding {
        width: min(560px, calc(100vw - 28px));
        max-width: 560px;
        max-height: min(90vh, 800px);
        padding: 0;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 24px 72px rgb(0 0 0 / 32%);
      }
      .cp-onboarding::backdrop { background: rgb(0 0 0 / 68%); backdrop-filter: blur(3px); }
      .cp-onboarding-inner { padding: clamp(22px, 6vw, 36px); }
      .cp-onboarding-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; font-weight: 600; }
      .cp-onboarding-brand-mark { display: block; width: 34px; height: 34px; overflow: hidden; border-radius: 9px; }
      .cp-onboarding-brand-mark img { display: block; width: 100%; height: 100%; }
      .cp-onboarding-step { margin: 0 0 8px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
      .cp-onboarding h1 { margin: 0 0 10px; font-size: clamp(23px, 5vw, 30px); letter-spacing: -.4px; }
      .cp-onboarding-intro { margin: 0 0 24px; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .cp-level-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .cp-level-card {
        display: grid;
        min-height: 150px;
        align-content: start;
        gap: 10px;
        padding: 18px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--surface);
        color: var(--text);
        text-align: left;
        cursor: pointer;
      }
      .cp-level-card:hover { border-color: var(--accent); background: var(--accent-soft); }
      .cp-level-card strong { font-size: 16px; }
      .cp-level-card span { color: var(--text-muted); font-size: 13px; line-height: 1.5; }
      .cp-level-icon { color: var(--accent); font-size: 24px; line-height: 1; }
      .cp-form-label { display: block; margin: 0 0 8px; font-size: 14px; font-weight: 600; }
      .cp-key-row { display: flex; gap: 8px; }
      .cp-key-input {
        width: 100%;
        min-width: 0;
        min-height: 46px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        color: var(--text);
      }
      .cp-key-input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
      .cp-secondary-button, .cp-primary-button {
        min-height: 44px;
        padding: 10px 16px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--surface);
        color: var(--text);
        font-weight: 600;
        cursor: pointer;
      }
      .cp-primary-button { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
      .cp-primary-button:disabled { cursor: not-allowed; opacity: .5; }
      .cp-secondary-button:hover:not(:disabled) { background: var(--surface-muted); }
      .cp-button-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-top: 24px; }
      .cp-button-actions { display: flex; gap: 8px; margin-left: auto; }
      .cp-security-note { margin: 14px 0 0; padding: 12px; border-radius: 10px; background: var(--surface-muted); color: var(--text-muted); font-size: 12px; line-height: 1.5; }
      .cp-security-note strong { color: var(--text); }
      .cp-keyword-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .cp-keyword {
        min-height: 38px;
        padding: 8px 14px;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
      }
      .cp-keyword[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
      .cp-onboarding-status { min-height: 1.5em; margin: 14px 0 0; color: #b3261e; font-size: 13px; line-height: 1.5; }
      .cp-onboarding-status:empty { display: none; }
      .cp-onboarding-success { display: grid; width: 64px; height: 64px; place-items: center; margin-bottom: 18px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 30px; }
      .cp-onboarding-tips { display: grid; gap: 10px; margin: 0 0 24px; padding: 0; list-style: none; }
      .cp-onboarding-tips li { padding: 10px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-muted); font-size: 13px; line-height: 1.5; }
      .cp-onboarding-tips strong { display: block; font-size: 14px; }
      body.onboarding-active { overflow: hidden; }
      @media (max-width: 480px) {
        .cp-level-grid { grid-template-columns: 1fr; }
        .cp-level-card { min-height: 112px; }
        .cp-key-row { flex-direction: column; }
        .cp-key-row .cp-secondary-button { align-self: flex-start; }
      }
    `;
    document.head.append(style);
  }

  function createDialog() {
    if (state.dialog) return state.dialog;
    addStyles();

    const dialog = document.createElement("dialog");
    dialog.className = "cp-onboarding";
    dialog.id = "onboarding-dialog";
    dialog.setAttribute("aria-labelledby", "onboarding-title");
    const inner = document.createElement("div");
    inner.className = "cp-onboarding-inner";
    dialog.append(inner);
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    dialog.addEventListener("close", () => document.body.classList.remove("onboarding-active"));
    state.dialog = dialog;
    return dialog;
  }

  function getInner() {
    return createDialog().firstElementChild;
  }

  function renderFrame(step, title, intro) {
    const inner = getInner();
    inner.replaceChildren();

    const brand = document.createElement("div");
    brand.className = "cp-onboarding-brand";
    brand.innerHTML = '<span class="cp-onboarding-brand-mark" aria-hidden="true"><img src="./assets/icons/logo.svg" alt="" width="34" height="34"></span><span>Cyber Pulse</span>';
    const stepLabel = document.createElement("p");
    stepLabel.className = "cp-onboarding-step";
    stepLabel.textContent = step;
    const heading = document.createElement("h1");
    heading.id = "onboarding-title";
    heading.textContent = title;
    const description = document.createElement("p");
    description.className = "cp-onboarding-intro";
    description.textContent = intro;
    const content = document.createElement("div");
    content.className = "cp-onboarding-content";
    const status = document.createElement("p");
    status.className = "cp-onboarding-status";
    status.id = "onboarding-status";
    status.setAttribute("role", "alert");
    inner.append(brand, stepLabel, heading, description, content, status);
    return { content, status };
  }

  function renderLevelStep() {
    const { content } = renderFrame(
      "Configurazione iniziale · 1 di 2",
      "Scegli il tuo livello",
      "Puoi usare il feed in modalità Standard oppure attivare le funzioni AI con la tua chiave Gemini personale.",
    );
    const grid = document.createElement("div");
    grid.className = "cp-level-grid";
    const standard = createLevelCard("✓", "Livello Standard", "Gratuito. Non richiede una chiave API.", () => {
      state.level = "standard";
      state.key = "";
      renderKeywordStep();
    });
    const ai = createLevelCard("✦", "Livello AI (BYOK)", "Usa la tua chiave Gemini, conservata solo in questo browser.", () => {
      state.level = "ai";
      renderKeyStep();
    });
    grid.append(standard, ai);
    content.append(grid);
  }

  function createLevelCard(icon, title, description, onSelect) {
    const button = document.createElement("button");
    button.className = "cp-level-card";
    button.type = "button";
    const symbol = document.createElement("span");
    symbol.className = "cp-level-icon";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = icon;
    const heading = document.createElement("strong");
    heading.textContent = title;
    const copy = document.createElement("span");
    copy.textContent = description;
    button.append(symbol, heading, copy);
    button.addEventListener("click", onSelect);
    return button;
  }

  function renderKeyStep() {
    const { content, status } = renderFrame(
      "Configurazione iniziale · 1 di 2",
      "Attiva il livello AI",
      "Inserisci la tua chiave API Gemini. Non viene inviata da questa pagina ad alcun servizio.",
    );
    const form = document.createElement("form");
    const label = document.createElement("label");
    label.className = "cp-form-label";
    label.htmlFor = "onboarding-gemini-key";
    label.textContent = "Chiave API Gemini";
    const row = document.createElement("div");
    row.className = "cp-key-row";
    const input = document.createElement("input");
    input.className = "cp-key-input";
    input.id = "onboarding-gemini-key";
    input.name = "gemini-key";
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.required = true;
    input.placeholder = "Incolla la tua chiave API";
    input.setAttribute("aria-describedby", "onboarding-key-security");
    const reveal = document.createElement("button");
    reveal.className = "cp-secondary-button";
    reveal.type = "button";
    reveal.textContent = "Mostra";
    reveal.setAttribute("aria-pressed", "false");
    reveal.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      reveal.textContent = showing ? "Mostra" : "Nascondi";
      reveal.setAttribute("aria-pressed", String(!showing));
      input.focus();
    });
    row.append(input, reveal);

    const note = document.createElement("p");
    note.className = "cp-security-note";
    note.id = "onboarding-key-security";
    note.innerHTML = "<strong>Conservazione locale:</strong> la chiave sarà memorizzata esclusivamente nel localStorage di questo browser. Non usare un dispositivo condiviso. Le chiamate AI dal backend non sono configurate da questa pagina.";
    const actions = document.createElement("div");
    actions.className = "cp-button-row";
    const back = createButton("Indietro", "cp-secondary-button", () => renderLevelStep());
    const continueButton = createButton("Continua", "cp-primary-button", () => {});
    continueButton.type = "submit";
    continueButton.disabled = true;
    input.addEventListener("input", () => {
      continueButton.disabled = input.value.trim().length === 0;
      status.textContent = "";
    });
    actions.append(back, continueButton);
    form.append(label, row, note, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const key = input.value.trim();
      if (!key) {
        status.textContent = "Inserisci la chiave API per continuare oppure torna indietro e scegli il livello Standard.";
        input.focus();
        return;
      }
      state.key = key;
      renderKeywordStep();
    });
    content.append(form);
    input.focus();
  }

  function renderKeywordStep() {
    const { content, status } = renderFrame(
      "Configurazione iniziale · 2 di 2",
      "Scegli i tuoi interessi",
      "Seleziona le parole chiave che vuoi usare per personalizzare il feed. Puoi cambiare scelta in seguito.",
    );
    const options = document.createElement("div");
    options.className = "cp-keyword-grid";
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", "Parole chiave di interesse");
    KEYWORDS.forEach((keyword) => {
      const button = document.createElement("button");
      button.className = "cp-keyword";
      button.type = "button";
      button.textContent = keyword;
      button.setAttribute("aria-pressed", String(state.keywords.has(keyword)));
      button.addEventListener("click", () => {
        if (state.keywords.has(keyword)) state.keywords.delete(keyword);
        else state.keywords.add(keyword);
        button.setAttribute("aria-pressed", String(state.keywords.has(keyword)));
      });
      options.append(button);
    });

    const actions = document.createElement("div");
    actions.className = "cp-button-row";
    const back = createButton("Indietro", "cp-secondary-button", () => {
      if (state.level === "ai") renderKeyStep();
      else renderLevelStep();
    });
    const actionGroup = document.createElement("div");
    actionGroup.className = "cp-button-actions";
    const finish = createButton("Completa configurazione", "cp-primary-button", () => finishOnboarding(status));
    actionGroup.append(finish);
    actions.append(back, actionGroup);
    content.append(options, actions);
    if (state.keywords.size > 0) {
      status.textContent = `${state.keywords.size} ${state.keywords.size === 1 ? "interesse selezionato" : "interessi selezionati"}.`;
      status.setAttribute("role", "status");
    }
  }

  function createButton(label, className, onClick) {
    const button = document.createElement("button");
    button.className = className;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function finishOnboarding(status) {
    if (!state.level) {
      status.textContent = "Seleziona un livello per completare la configurazione.";
      return;
    }
    if (state.keywords.size === 0) {
      status.textContent = "Seleziona almeno una parola chiave per personalizzare il feed.";
      status.setAttribute("role", "alert");
      return;
    }
    if (state.level === "ai" && !state.key?.trim()) {
      status.textContent = "La chiave AI non è presente. Torna indietro e inseriscila, oppure scegli il livello Standard.";
      status.setAttribute("role", "alert");
      return;
    }

    try {
      if (state.level === "ai") {
        localStorage.setItem(STORAGE_KEYS.geminiKey, state.key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEYS.geminiKey);
      }
      localStorage.setItem(STORAGE_KEYS.level, state.level);
      localStorage.setItem(STORAGE_KEYS.keywords, JSON.stringify([...state.keywords]));
      localStorage.setItem(STORAGE_KEYS.completed, "true");
    } catch (error) {
      console.error("Impossibile salvare la configurazione nel browser.", error);
      status.textContent = "Il browser non ha consentito il salvataggio locale. Verifica le impostazioni di archiviazione e riprova.";
      status.setAttribute("role", "alert");
      return;
    }

    document.dispatchEvent(new CustomEvent("cyberpulse:onboardingcomplete", {
      detail: { level: state.level, keywords: [...state.keywords] },
    }));
    renderSuccess();
  }

  function renderSuccess() {
    const { content } = renderFrame(
      "Configurazione completata",
      "Il tuo spazio è pronto",
      "Le preferenze e le parole chiave sono state salvate su questo dispositivo.",
    );
    const icon = document.createElement("span");
    icon.className = "cp-onboarding-success";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    const detail = document.createElement("p");
    detail.className = "cp-onboarding-intro";
    detail.textContent = `Livello ${state.level === "ai" ? "AI (BYOK)" : "Standard"} · ${state.keywords.size} ${state.keywords.size === 1 ? "parola chiave selezionata" : "parole chiave selezionate"}.`;
    const tips = document.createElement("ul");
    tips.className = "cp-onboarding-tips";
    [
      ["Menu laterale", "Dal pulsante in alto a sinistra passi tra Home, Arena, Giochi, Libreria e Musica."],
      ["Impostazioni", "Ogni sezione ha le sue opzioni, divise per argomento. Con il pin le fissi tra le Scorciatoie."],
      ["Aspetto", "Scegli tema, modalità (Giorno, Notte, Auto, OLED) e sfondi."],
      ["Sincronizzazione", "In Impostazioni → Generale tieni uguali i tuoi dispositivi."],
    ].forEach(([title, text]) => {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = title;
      item.append(strong, document.createTextNode(text));
      tips.append(item);
    });
    const actions = document.createElement("div");
    actions.className = "cp-button-row";
    const finish = createButton("Inizia", "cp-primary-button", () => {
      state.dialog.close();
      document.body.classList.remove("onboarding-active");
      document.querySelector("#open-launcher-menu")?.focus();
    });
    actions.append(finish);
    content.append(icon, detail, tips, actions);
    finish.focus();
  }

  function hasCompletedSetup() {
    try {
      return localStorage.getItem(STORAGE_KEYS.completed) === "true";
    } catch (error) {
      console.error("Impossibile verificare la configurazione iniziale salvata.", error);
      return false;
    }
  }

  function startOnboarding() {
    if (hasCompletedSetup()) return false;
    const dialog = createDialog();
    renderLevelStep();
    dialog.showModal();
    document.body.classList.add("onboarding-active");
    dialog.querySelector(".cp-level-card")?.focus();
    return true;
  }

  window.startCyberPulseOnboarding = startOnboarding;
  window.getCyberPulsePreferences = () => {
    try {
      const keywords = JSON.parse(localStorage.getItem(STORAGE_KEYS.keywords) || "[]");
      return {
        level: localStorage.getItem(STORAGE_KEYS.level),
        keywords: Array.isArray(keywords) ? keywords : [],
        completed: localStorage.getItem(STORAGE_KEYS.completed) === "true",
      };
    } catch (error) {
      console.error("Impossibile leggere le preferenze salvate.", error);
      return { level: null, keywords: [], completed: false };
    }
  };

  // Parte solo dopo l'accesso, una sola volta.
  let started = false;
  function initialize() {
    if (started) return;
    started = true;
    if (!hasCompletedSetup()) startOnboarding();
  }

  document.addEventListener("cyberpulse:signedin", initialize);
  if (window.CyberPulseAuth?.getUser()) initialize();
})();
