(() => {
  "use strict";

  const CLOSE_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const UP_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
  const DOWN_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';

  let dialog = null;
  let categoryList = null;
  let sourceContainer = null;
  const announcers = [];
  let nav = null;
  let detail = null;
  let detailTitle = null;
  let detailBody = null;
  let builtin = [];
  let currentId = "";
  const collapsed = new Set();
  const registered = [];

  const ICON_BACK = "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z";
  const ICON_CHEVRON = "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z";
  // Ogni gruppo del menu corrisponde a una parte dell'app; "hub" collega il gruppo alla sezione aperta.
  const GROUPS = [
    { id: "general", title: "Generale", path: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" },
    { id: "news", title: "Home e notizie", hub: "", path: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" },
    { id: "arena", title: "Cyber Arena", hub: "arena", path: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" },
    { id: "music", title: "Cyber Music", hub: "music", path: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" },
    { id: "games", title: "Cyber Games", hub: "games", path: "M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" },
    { id: "library", title: "Cyber Library", hub: "library", path: "M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" },
  ];

  function api() {
    return window.CyberPulse;
  }

  function svgIcon(path, className = "icon") {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  }

  // Gli hub registrano qui i loro pannelli: build() restituisce il contenuto aggiornato ogni volta che il pannello si apre.
  function register(definition) {
    if (!definition?.id || !definition.group || typeof definition.build !== "function") return;
    const index = registered.findIndex((item) => item.id === definition.id);
    if (index >= 0) registered[index] = definition;
    else registered.push(definition);
    if (dialog && nav) renderNav();
  }

  function allPanels() {
    return [...builtin, ...registered];
  }

  function withReset(section) {
    const actions = document.createElement("div");
    actions.className = "cp-settings-actions";
    const reset = document.createElement("button");
    reset.className = "cp-choice";
    reset.type = "button";
    reset.textContent = "Ripristina ordine e fonti predefiniti";
    const status = document.createElement("p");
    status.className = "cp-ui-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    announcers.push(status);
    reset.addEventListener("click", () => {
      api().resetPreferences();
      renderAll();
      announce("Ordine delle categorie e fonti ripristinati.");
    });
    actions.append(reset, status);
    section.append(actions);
    return section;
  }

  function renderNav() {
    const panels = allPanels();
    const groups = GROUPS.map((group) => {
      const items = panels.filter((panel) => panel.group === group.id);
      if (!items.length) return null;
      const details = document.createElement("details");
      details.className = "cp-set-group";
      details.open = !collapsed.has(group.id);
      details.addEventListener("toggle", () => {
        if (details.open) collapsed.delete(group.id);
        else collapsed.add(group.id);
      });
      const summary = document.createElement("summary");
      summary.innerHTML = `${svgIcon(group.path, "icon cp-set-group-icon")}<span>${group.title}</span>${svgIcon(ICON_CHEVRON, "icon cp-set-chevron")}`;
      const list = document.createElement("div");
      list.className = "cp-set-items";
      items.forEach((panel) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "cp-set-item";
        item.dataset.id = panel.id;
        item.textContent = panel.title;
        if (panel.id === currentId) item.setAttribute("aria-current", "page");
        item.addEventListener("click", () => selectPanel(panel.id, true));
        list.append(item);
      });
      details.append(summary, list);
      return details;
    }).filter(Boolean);
    nav.replaceChildren(...groups);
  }

  function selectPanel(id, focusTitle) {
    const panel = allPanels().find((item) => item.id === id);
    if (!panel) return;
    currentId = id;
    nav.querySelectorAll(".cp-set-item").forEach((item) => {
      if (item.dataset.id === id) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    const group = GROUPS.find((item) => item.id === panel.group);
    detailTitle.textContent = group ? `${group.title} · ${panel.title}` : panel.title;
    detailBody.replaceChildren(panel.node || panel.build());
    detail.scrollTop = 0;
    dialog.querySelector(".cp-panel-content").dataset.view = "panel";
    if (focusTitle) detailTitle.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("cyberpulse:settingspanel", {
      detail: { id, title: panel.title, body: detailBody, header: detail.querySelector(".cp-set-detail-header") },
    }));
  }

  function ensureBuilt() {
    if (!api()) return false;
    if (!dialog) build();
    return true;
  }

  // Contenuto di un pannello senza aprire la finestra: serve alle scorciatoie.
  function panelNode(id) {
    if (!ensureBuilt()) return null;
    const panel = allPanels().find((item) => item.id === id);
    return panel ? (panel.node || panel.build()) : null;
  }

  function panelTitle(id) {
    const panel = allPanels().find((item) => item.id === id);
    return panel ? panel.title : "";
  }

  function openPanel(id) {
    if (!ensureBuilt() || !allPanels().some((item) => item.id === id)) return false;
    currentId = id;
    open();
    selectPanel(id, false);
    return true;
  }

  function announce(message) {
    announcers.forEach((node) => { node.textContent = message; });
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-settings-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-settings-styles";
    style.textContent = `
      .cp-settings-section { margin: 0 0 28px; }
      .cp-settings-section h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
      .cp-settings-hint { margin: 0 0 14px; color: var(--text-muted); font-size: 13px; line-height: 1.5; }
      .cp-order-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .cp-order-item {
        display: flex;
        min-height: 48px;
        align-items: center;
        gap: 10px;
        padding: 4px 8px 4px 14px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface-muted);
      }
      .cp-order-visible { width: 18px; height: 18px; flex: 0 0 auto; margin: 0; accent-color: var(--accent); }
      .cp-order-position { width: 22px; color: var(--text-muted); font-size: 13px; text-align: right; }
      .cp-order-name { flex: 1; font-size: 14px; }
      .cp-order-button {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--text);
        cursor: pointer;
      }
      .cp-order-button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
      .cp-order-button:disabled { cursor: default; opacity: .3; }
      .cp-source-group { border: 1px solid var(--border); border-radius: 14px; }
      .cp-source-group + .cp-source-group { margin-top: 6px; }
      .cp-source-group summary { display: flex; min-height: 48px; align-items: center; gap: 10px; padding: 0 14px; cursor: pointer; font-size: 14px; font-weight: 600; }
      .cp-source-count { margin-left: auto; color: var(--text-muted); font-size: 12px; font-weight: 400; }
      .cp-source-items { display: grid; gap: 2px; padding: 4px 8px 10px; }
      .cp-source-row { display: flex; min-height: 40px; align-items: center; gap: 10px; padding: 4px 8px; border-radius: 8px; font-size: 14px; }
      .cp-source-row:hover { background: var(--surface-muted); }
      .cp-source-row input { width: 18px; height: 18px; flex: 0 0 auto; accent-color: var(--accent); }
      .cp-source-row.unavailable { color: var(--text-muted); }
      .cp-source-lang { margin-left: auto; color: var(--text-muted); font-size: 11px; white-space: nowrap; }
      .cp-settings-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .cp-ai-form { display: grid; gap: 12px; }
      .cp-ai-levels { display: grid; gap: 6px; margin: 0; padding: 0; border: 0; }
      .cp-ai-legend { padding: 0; font-size: 13px; font-weight: 600; }
      .cp-ai-radio { display: flex; min-height: 44px; align-items: center; gap: 10px; padding: 0 14px; border: 1px solid var(--border); border-radius: 14px; font-size: 14px; cursor: pointer; }
      .cp-ai-radio input { width: 18px; height: 18px; accent-color: var(--accent); }
      .cp-ai-keyfield { display: grid; gap: 8px; justify-items: start; }
      .cp-ai-keyfield[hidden] { display: none; }
      .cp-ai-input { width: 100%; min-height: 44px; padding: 0 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 15px; }
      .cp-ai-input:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent); outline-offset: 1px; }

      #settings-dialog { width: min(940px, calc(100vw - 32px)); max-width: none; height: min(700px, calc(100dvh - 48px)); max-height: none; }
      #settings-dialog .cp-panel { display: flex; height: 100%; max-height: none; flex-direction: column; overflow: hidden; }
      #settings-dialog .cp-panel-header { position: static; flex: 0 0 auto; }
      #settings-dialog .cp-panel-content { display: grid; flex: 1 1 auto; min-height: 0; grid-template-columns: 270px minmax(0, 1fr); padding: 0; }
      .cp-set-nav { overflow-y: auto; padding: 12px; border-right: 1px solid var(--border); background: var(--surface-muted); }
      .cp-set-group + .cp-set-group { margin-top: 4px; }
      .cp-set-group summary { display: flex; min-height: 44px; align-items: center; gap: 10px; padding: 0 10px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; list-style: none; }
      .cp-set-group summary::-webkit-details-marker { display: none; }
      .cp-set-group summary:hover { background: var(--accent-soft); }
      .cp-set-group-icon { color: var(--accent); }
      .cp-set-chevron { margin-left: auto; color: var(--text-muted); transition: transform 160ms ease; }
      .cp-set-group:not([open]) .cp-set-chevron { transform: rotate(-90deg); }
      .cp-set-items { display: grid; gap: 2px; margin: 2px 0 6px 18px; padding-left: 12px; border-left: 1px solid var(--border); }
      .cp-set-item { min-height: 40px; padding: 0 12px; border: 0; border-radius: 10px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-size: 14px; text-align: left; }
      .cp-set-item:hover { background: var(--accent-soft); }
      .cp-set-item[aria-current] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
      .cp-set-detail { min-width: 0; overflow-y: auto; padding: 0 28px 28px; }
      .cp-set-detail-header { position: sticky; z-index: 1; top: 0; display: flex; align-items: center; gap: 8px; margin: 0 -28px 16px; padding: 14px 28px; border-bottom: 1px solid var(--border); background: var(--surface); }
      .cp-set-title { margin: 0; font-size: 18px; font-weight: 600; outline: none; }
      .cp-set-back { display: none; width: 40px; height: 40px; flex: 0 0 auto; place-items: center; margin-left: -8px; border: 0; border-radius: 50%; background: transparent; color: var(--text); cursor: pointer; }
      .cp-set-back:hover { background: var(--surface-muted); }
      .cp-set-body > .cp-settings-section { margin: 0; }
      .cp-set-body > .cp-settings-section > h3 { display: none; }
      .cp-set-body .cp-settings-actions { margin-top: 20px; }
      .cp-set-body .cp-saved-list li { align-items: center; padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; }
      .cp-set-body .cp-saved-list .cp-settings-hint { margin: 0; text-align: right; }
      .cp-set-body .cp-choice { font: inherit; font-size: 14px; }
      .cp-set-body .cp-saved-list + .cp-choice { margin-top: 16px; }
      .cp-set-body .cp-reading-grid { max-width: 520px; }
      @media (max-width: 720px) {
        #settings-dialog { width: 100vw; height: 100dvh; border: 0; border-radius: 0; }
        #settings-dialog .cp-panel-content { grid-template-columns: minmax(0, 1fr); }
        #settings-dialog .cp-panel-content[data-view="list"] .cp-set-detail,
        #settings-dialog .cp-panel-content[data-view="panel"] .cp-set-nav { display: none; }
        .cp-set-nav { border-right: 0; background: var(--surface); }
        .cp-set-detail { padding: 0 16px 24px; }
        .cp-set-detail-header { margin: 0 -16px 16px; padding: 10px 16px; }
        .cp-set-back { display: grid; }
      }
      @media (prefers-reduced-motion: reduce) { .cp-set-chevron { transition: none; } }
    `;
    document.head.append(style);
  }


  function moveCategory(index, delta) {
    const ids = api().getCategories().map((category) => category.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    api().setCategoryOrder(ids);
    renderCategoryOrder();
    const moved = api().getCategories()[target];
    announce(`${moved.name} spostata in posizione ${target + 1} di ${ids.length}.`);
    const direction = delta < 0 ? "up" : "down";
    const sameDirection = categoryList.querySelector(`[data-move="${direction}"][data-index="${target}"]`);
    // Ai bordi dell'elenco il pulsante e' disattivato: il focus passa all'altro.
    (sameDirection && !sameDirection.disabled
      ? sameDirection
      : categoryList.querySelector(`[data-index="${target}"]:not(:disabled)`))?.focus();
  }

  function renderCategoryOrder() {
    const categories = api().getCategories();
    const hiddenIds = window.CyberPulseCards?.getPrefs().homeHidden ?? [];
    const items = categories.map((category, index) => {
      const item = document.createElement("li");
      item.className = "cp-order-item";

      const position = document.createElement("span");
      position.className = "cp-order-position";
      position.textContent = String(index + 1);

      const name = document.createElement("span");
      name.className = "cp-order-name";
      name.textContent = category.name;

      const up = document.createElement("button");
      up.className = "cp-order-button";
      up.type = "button";
      up.dataset.move = "up";
      up.dataset.index = String(index);
      up.disabled = index === 0;
      up.setAttribute("aria-label", `Sposta ${category.name} più in alto`);
      up.innerHTML = UP_ICON;
      up.addEventListener("click", () => moveCategory(index, -1));

      const down = document.createElement("button");
      down.className = "cp-order-button";
      down.type = "button";
      down.dataset.move = "down";
      down.dataset.index = String(index);
      down.disabled = index === categories.length - 1;
      down.setAttribute("aria-label", `Sposta ${category.name} più in basso`);
      down.innerHTML = DOWN_ICON;
      down.addEventListener("click", () => moveCategory(index, 1));

      const visible = document.createElement("input");
      visible.type = "checkbox";
      visible.className = "cp-order-visible";
      visible.checked = !hiddenIds.includes(category.id);
      visible.setAttribute("aria-label", `Mostra ${category.name} nella Home`);
      visible.addEventListener("change", () => {
        const cards = window.CyberPulseCards;
        const current = cards.getPrefs().homeHidden.filter((id) => id !== category.id);
        if (!visible.checked) current.push(category.id);
        cards.setPrefs({ homeHidden: current });
        announce(`${category.name} ${visible.checked ? "visibile" : "nascosta"} nella Home.`);
      });

      item.append(visible, position, name, up, down);
      return item;
    });
    categoryList.replaceChildren(...items);
  }

  function countEnabled(category) {
    const sources = api().getCategorySources(category.id);
    return { enabled: sources.filter((source) => source.active && api().isSourceEnabled(source)).length, total: sources.length };
  }

  function updateGroupCount(group, category) {
    const { enabled, total } = countEnabled(category);
    group.querySelector(".cp-source-count").textContent = `${enabled} attive su ${total}`;
  }

  function fillSources(group, category) {
    const rows = api().getCategorySources(category.id).map((source) => {
      const row = document.createElement("label");
      row.className = "cp-source-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      // Il backend aggiorna solo le fonti attive nel catalogo: le altre non avrebbero notizie.
      checkbox.disabled = !source.active;
      checkbox.checked = source.active && api().isSourceEnabled(source);
      checkbox.addEventListener("change", () => {
        api().setSourceEnabled(source.id, checkbox.checked);
        updateGroupCount(group, category);
      });

      const name = document.createElement("span");
      name.textContent = source.name;

      const note = document.createElement("span");
      note.className = "cp-source-lang";
      note.textContent = source.active
        ? (source.lang || "").toUpperCase()
        : "Non ancora disponibile";

      if (!source.active) row.classList.add("unavailable");
      row.append(checkbox, name, note);
      return row;
    });
    const items = document.createElement("div");
    items.className = "cp-source-items";
    items.append(...rows);
    group.append(items);
  }

  function renderSources() {
    const groups = api().getCategories().map((category) => {
      const group = document.createElement("details");
      group.className = "cp-source-group";

      const summary = document.createElement("summary");
      const title = document.createElement("span");
      title.textContent = category.name;
      const count = document.createElement("span");
      count.className = "cp-source-count";
      summary.append(title, count);
      group.append(summary);
      updateGroupCount(group, category);

      // L'elenco completo (600 fonti) viene creato solo all'apertura del gruppo.
      group.addEventListener("toggle", () => {
        if (group.open && !group.querySelector(".cp-source-items")) fillSources(group, category);
      });
      return group;
    });
    sourceContainer.replaceChildren(...groups);
  }

  function renderAll() {
    renderCategoryOrder();
    renderSources();
    syncAiForm();
  }

  const LEVEL_KEY = "cyber-pulse.level";
  const GEMINI_KEY = "cyber-pulse.gemini-api-key";
  const KEY_PATTERN = /^[\w.-]{20,200}$/;
  const ai = {};

  function readStored(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function syncAiForm() {
    if (!ai.form) return;
    const level = readStored(LEVEL_KEY) === "ai" ? "ai" : "standard";
    ai.form.elements.level.value = level;
    ai.key.value = "";
    ai.status.textContent = "";
    updateAiFields();
  }

  function updateAiFields() {
    const wantsAi = ai.form.elements.level.value === "ai";
    const hasKey = readStored(GEMINI_KEY) !== "";
    ai.keyField.hidden = !wantsAi;
    ai.key.placeholder = hasKey ? "Chiave salvata: scrivi per sostituirla" : "Incolla qui la tua chiave";
    ai.current.textContent = wantsAi && hasKey ? "Una chiave è già salvata in questo browser." : "";
  }

  function saveAi(event) {
    event.preventDefault();
    const wantsAi = ai.form.elements.level.value === "ai";
    const typed = ai.key.value.trim();
    try {
      if (wantsAi) {
        if (typed) {
          if (!KEY_PATTERN.test(typed)) {
            ai.status.textContent = "La chiave non sembra valida: controlla di averla copiata per intero.";
            return;
          }
          localStorage.setItem(GEMINI_KEY, typed);
        } else if (!readStored(GEMINI_KEY)) {
          ai.status.textContent = "Per il Livello AI serve una chiave Gemini.";
          return;
        }
        localStorage.setItem(LEVEL_KEY, "ai");
      } else {
        // Passando a Standard la chiave viene rimossa da questo browser.
        localStorage.setItem(LEVEL_KEY, "standard");
        localStorage.removeItem(GEMINI_KEY);
      }
    } catch {
      ai.status.textContent = "Il browser non ha consentito il salvataggio. Verifica le impostazioni di archiviazione.";
      return;
    }
    ai.key.value = "";
    updateAiFields();
    ai.status.textContent = wantsAi ? "Livello AI attivo." : "Livello Standard attivo: la chiave è stata rimossa.";
    document.dispatchEvent(new CustomEvent("cyberpulse:aichange"));
  }

  function removeKey() {
    try {
      localStorage.removeItem(GEMINI_KEY);
      localStorage.setItem(LEVEL_KEY, "standard");
    } catch {
      ai.status.textContent = "Il browser non ha consentito la modifica.";
      return;
    }
    syncAiForm();
    ai.status.textContent = "Chiave rimossa: ora usi il Livello Standard.";
    document.dispatchEvent(new CustomEvent("cyberpulse:aichange"));
  }

  function buildAiSection() {
    const section = document.createElement("section");
    section.className = "cp-settings-section";
    section.innerHTML = "<h3>Intelligenza artificiale</h3>";

    const hint = document.createElement("p");
    hint.className = "cp-settings-hint";
    hint.textContent = "Il Livello AI abilita i riassunti e il Traduttore con la tua chiave Gemini personale. La chiave resta solo in questo browser e viene inviata al servizio di Google solo quando usi una funzione AI.";

    ai.form = document.createElement("form");
    ai.form.className = "cp-ai-form";
    ai.form.noValidate = true;

    const radios = document.createElement("fieldset");
    radios.className = "cp-ai-levels";
    radios.innerHTML = "<legend class=\"cp-ai-legend\">Livello</legend>"
      + "<label class=\"cp-ai-radio\"><input type=\"radio\" name=\"level\" value=\"standard\"> <span>Standard (gratuito, senza chiave)</span></label>"
      + "<label class=\"cp-ai-radio\"><input type=\"radio\" name=\"level\" value=\"ai\"> <span>AI (con la tua chiave Gemini)</span></label>";

    ai.keyField = document.createElement("div");
    ai.keyField.className = "cp-ai-keyfield";
    const label = document.createElement("label");
    label.htmlFor = "settings-gemini-key";
    label.className = "cp-ai-legend";
    label.textContent = "Chiave API Gemini";
    ai.key = document.createElement("input");
    ai.key.id = "settings-gemini-key";
    ai.key.type = "password";
    ai.key.className = "cp-ai-input";
    ai.key.autocomplete = "off";
    ai.key.spellcheck = false;
    ai.key.maxLength = 200;
    ai.current = document.createElement("p");
    ai.current.className = "cp-settings-hint";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cp-choice";
    remove.textContent = "Rimuovi la chiave";
    remove.addEventListener("click", removeKey);
    ai.keyField.append(label, ai.key, ai.current, remove);

    const save = document.createElement("button");
    save.type = "submit";
    save.className = "cp-choice";
    save.textContent = "Salva";
    ai.status = document.createElement("p");
    ai.status.className = "cp-ui-status";
    ai.status.setAttribute("role", "status");
    ai.status.setAttribute("aria-live", "polite");

    ai.form.append(radios, ai.keyField, save, ai.status);
    ai.form.addEventListener("change", updateAiFields);
    ai.form.addEventListener("submit", saveAi);
    section.append(hint, ai.form);
    return section;
  }

  function build() {
    addStyles();
    dialog = document.createElement("dialog");
    dialog.className = "cp-dialog";
    dialog.id = "settings-dialog";
    dialog.setAttribute("aria-labelledby", "settings-dialog-title");

    const panel = document.createElement("div");
    panel.className = "cp-panel";

    const header = document.createElement("header");
    header.className = "cp-panel-header";
    const title = document.createElement("h2");
    title.id = "settings-dialog-title";
    title.textContent = "Impostazioni";
    const closeButton = document.createElement("button");
    closeButton.className = "cp-panel-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Chiudi le impostazioni");
    closeButton.innerHTML = CLOSE_ICON;
    header.append(title, closeButton);

    const content = document.createElement("div");
    content.className = "cp-panel-content";

    const orderSection = document.createElement("section");
    orderSection.className = "cp-settings-section";
    orderSection.innerHTML = "<h3>Ordine delle categorie</h3>";
    const orderHint = document.createElement("p");
    orderHint.className = "cp-settings-hint";
    orderHint.textContent = "Scegli quali categorie mostrare nella Home e in che ordine: lo stesso ordine vale per la barra sotto l'intestazione.";
    categoryList = document.createElement("ol");
    categoryList.className = "cp-order-list";
    orderSection.append(orderHint, categoryList);

    const sourceSection = document.createElement("section");
    sourceSection.className = "cp-settings-section";
    sourceSection.innerHTML = "<h3>Fonti</h3>";
    const sourceHint = document.createElement("p");
    sourceHint.className = "cp-settings-hint";
    sourceHint.textContent = "Disattiva le fonti che non vuoi vedere. Le fonti segnate come non ancora disponibili non sono ancora aggiornate dal server.";
    sourceContainer = document.createElement("div");
    sourceSection.append(sourceHint, sourceContainer);

    const readingSection = window.CyberPulseCards?.buildSettingsSection();
    builtin = [
      { id: "ai", group: "general", title: "Intelligenza artificiale", node: buildAiSection() },
      ...(readingSection ? [{ id: "reading", group: "news", title: "Lettura delle notizie", node: readingSection }] : []),
      { id: "categories", group: "news", title: "Categorie", node: withReset(orderSection) },
      { id: "sources", group: "news", title: "Fonti", node: withReset(sourceSection) },
    ];

    nav = document.createElement("nav");
    nav.className = "cp-set-nav";
    nav.setAttribute("aria-label", "Sezioni delle impostazioni");
    detail = document.createElement("div");
    detail.className = "cp-set-detail";
    const detailHeader = document.createElement("div");
    detailHeader.className = "cp-set-detail-header";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "cp-set-back";
    back.setAttribute("aria-label", "Torna all'elenco delle impostazioni");
    back.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_BACK}"/></svg>`;
    back.addEventListener("click", () => { content.dataset.view = "list"; nav.querySelector("[aria-current]")?.focus(); });
    detailTitle = document.createElement("h3");
    detailTitle.className = "cp-set-title";
    detailTitle.tabIndex = -1;
    detailBody = document.createElement("div");
    detailBody.className = "cp-set-body";
    detailHeader.append(back, detailTitle);
    detail.append(detailHeader, detailBody);
    content.dataset.view = "list";
    content.append(nav, detail);
    panel.append(header, content);
    dialog.append(panel);
    document.body.append(dialog);

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => document.body.classList.remove("modal-open"));
    dialog.addEventListener("cancel", () => document.body.classList.remove("modal-open"));
  }

  function open() {
    if (!api()) return;
    if (!dialog) build();
    renderAll();
    announce("");
    const narrow = window.matchMedia("(max-width: 720px)").matches;
    // Sullo schermo largo si apre direttamente il pannello dell'hub in uso; sul telefono si parte dall'elenco.
    const hub = document.body.dataset.hub || "";
    const panels = allPanels();
    const group = GROUPS.find((item) => item.hub === hub && panels.some((panel) => panel.group === item.id));
    const target = (group && panels.find((panel) => panel.group === group.id))
      || panels.find((panel) => panel.id === currentId)
      || panels[0];
    currentId = target?.id || "";
    renderNav();
    if (target && !narrow) {
      selectPanel(target.id, false);
      nav.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest" });
    } else {
      nav.querySelectorAll("[aria-current]").forEach((item) => item.removeAttribute("aria-current"));
      detailBody.replaceChildren();
      detailTitle.textContent = "";
      dialog.querySelector(".cp-panel-content").dataset.view = "list";
    }
    document.querySelector("#launcher")?.close();
    dialog.showModal();
    document.body.classList.add("modal-open");
    dialog.querySelector(".cp-panel-close").focus();
  }

  window.CyberPulseSettings = Object.freeze({ register, open, ensureBuilt, panelNode, panelTitle, openPanel });

  function start() {
    const button = document.querySelector("#open-settings");
    button?.addEventListener("click", open);
  }

  // Il bottone resta inerte finché app.js non ha caricato il catalogo.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
