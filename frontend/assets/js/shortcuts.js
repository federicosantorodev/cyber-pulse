"use strict";

/*
 * Scorciatoie della barra laterale.
 * Ogni opzione delle Impostazioni e ogni modalità di Aspetto ha un pulsante "pin": le opzioni fissate compaiono nel launcher
 * e funzionano direttamente (interruttori e azioni) oppure aprono il pannello giusto (menu a tendina, cursori, pannelli).
 */
(() => {
  const STORAGE_KEY = "cyber-pulse.shortcuts";
  const MAX_ITEMS = 12;
  const NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    pin: "M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z",
    pinned: "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z",
    close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    toggle: "M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z",
    action: "M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z",
    open: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
    day: "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
    night: "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
    auto: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V4c4.41 0 8 3.59 8 8s-3.59 8-8 8z",
    oled: "M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z",
  };
  const MODE_LABELS = { day: "Giorno", night: "Notte", auto: "Auto", oled: "OLED" };
  // I controlli di liste, righe di dati e moduli con "Salva" non sono impostazioni dirette e non si possono fissare.
  const SKIP = ".cp-order-item, .cp-source-row, .cp-source-group, .cp-saved-list, li, form, .cp-sc-pin";
  // "Azzera" non è qui perché la sua azione chiede già conferma da sola.
  const DESTRUCTIVE = /rimuov|ripristin|elimin|cancell|svuot/i;

  let items = read();
  let currentPanel = "";
  let holder = null;
  let toastTimer = 0;
  let statusTimer = 0;
  let confirming = null;

  function read() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(list) ? list.filter((item) => item && item.id && ["toggle", "action", "open", "panel", "mode"].includes(item.kind)).slice(0, MAX_ITEMS) : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Impossibile salvare le scorciatoie.", error);
    }
  }

  const settings = () => window.CyberPulseSettings;
  const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();
  const has = (id) => items.some((item) => item.id === id);

  function svg(path, className = "icon") {
    const node = document.createElementNS(NS, "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("class", className);
    node.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(NS, "path");
    shape.setAttribute("d", path);
    node.append(shape);
    return node;
  }

  /* ---------- Lettura dei controlli di un pannello ---------- */

  function labelText(host) {
    const copy = host.cloneNode(true);
    copy.querySelectorAll("select, input, textarea, button, .cp-sc-pin").forEach((node) => node.remove());
    return norm(copy.textContent);
  }

  function labelFor(control) {
    if (control.tagName === "BUTTON") {
      const own = norm(control.textContent) || norm(control.getAttribute("aria-label"));
      if (own) return own;
    }
    const aria = control.getAttribute("aria-label");
    if (aria) return norm(aria);
    for (const label of control.labels || []) {
      const text = labelText(label);
      if (text) return text;
    }
    const wrapper = control.closest("label");
    if (wrapper && labelText(wrapper)) return labelText(wrapper);
    const sibling = control.parentElement?.querySelector(":scope > label");
    if (sibling && labelText(sibling)) return labelText(sibling);
    return norm(control.textContent) || control.name || control.id || "";
  }

  // I controlli sono identificati dall'etichetta, così restano validi anche se il pannello viene ricostruito.
  function scan(root) {
    const found = [];
    const seen = new Map();
    root.querySelectorAll("input[type=checkbox], input[type=range], select, button").forEach((control) => {
      if (control.closest(SKIP) || control.disabled) return;
      let kind = "open";
      if (control.tagName === "BUTTON") {
        if (control.type === "submit" || !(control.classList.contains("cp-choice") || control.closest(".cp-settings-actions"))) return;
        kind = "action";
      } else if (control.type === "checkbox") {
        kind = "toggle";
      }
      const label = labelFor(control);
      if (!label) return;
      let key = label.toLowerCase();
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count > 1) key += `#${count}`;
      found.push({ control, kind, key, label });
    });
    return found;
  }

  function hostFor(entry) {
    const { control, kind } = entry;
    if (kind === "action") return control;
    const label = control.labels?.[0];
    if (kind === "toggle") return control.closest("label") || control;
    return label && label.parentElement === control.parentElement ? label : control;
  }

  function getHolder() {
    if (!holder) {
      holder = document.createElement("div");
      holder.setAttribute("aria-hidden", "true");
      holder.style.cssText = "position:fixed;left:-9999px;top:0;width:480px;pointer-events:none;";
      document.body.append(holder);
    }
    return holder;
  }

  // Un interruttore non reagisce al clic se non è nella pagina: il pannello viene appoggiato fuori schermo per il tempo del clic.
  function perform(item, task) {
    const node = settings()?.panelNode(item.panel);
    if (!node) return false;
    const attach = !node.isConnected;
    if (attach) getHolder().append(node);
    try {
      const entry = scan(node).find((candidate) => candidate.key === item.key);
      if (!entry) return false;
      task(entry);
      return true;
    } finally {
      if (attach) node.remove();
    }
  }

  /* ---------- Fissare e togliere ---------- */

  function toast(anchor, message) {
    const parent = anchor?.closest("dialog") || document.body;
    let node = parent.querySelector(":scope > .cp-sc-toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "cp-sc-toast";
      node.setAttribute("role", "status");
      parent.append(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2400);
  }

  function syncPins() {
    document.querySelectorAll(".cp-sc-pin").forEach((pin) => {
      const def = pin._def;
      if (!def) return;
      const pinned = has(def.id);
      pin.setAttribute("aria-pressed", String(pinned));
      const text = pinned ? `Rimuovi «${def.label}» dalle scorciatoie` : `Aggiungi «${def.label}» alle scorciatoie`;
      pin.setAttribute("aria-label", text);
      pin.title = text;
      pin.replaceChildren(svg(pinned ? ICONS.pinned : ICONS.pin));
    });
  }

  function toggleItem(def, anchor) {
    if (has(def.id)) {
      items = items.filter((item) => item.id !== def.id);
      toast(anchor, `«${def.label}» tolta dalle scorciatoie.`);
    } else {
      if (items.length >= MAX_ITEMS) {
        toast(anchor, `Puoi fissare al massimo ${MAX_ITEMS} scorciatoie: toglierne una dalla barra laterale.`);
        return;
      }
      items.push(def);
      toast(anchor, `«${def.label}» aggiunta alle scorciatoie.`);
    }
    save();
    syncPins();
    render();
  }

  function makePin(def) {
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "cp-sc-pin";
    pin._def = def;
    pin.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleItem(pin._def, pin);
    });
    return pin;
  }

  function wrap(host, def, variant) {
    const row = document.createElement("div");
    row.className = `cp-sc-row ${variant}`;
    host.before(row);
    const pin = makePin(def);
    row.append(host, pin);
    return pin;
  }

  function decorate(body) {
    if (!currentPanel) return;
    for (const entry of scan(body)) {
      if (entry.control.dataset.scPinned) continue;
      entry.control.dataset.scPinned = "1";
      const def = { id: `${entry.kind}:${currentPanel}:${entry.key}`, kind: entry.kind, panel: currentPanel, key: entry.key, label: entry.label };
      wrap(hostFor(entry), def, entry.kind === "action" ? "is-action" : "is-field");
    }
    syncPins();
  }

  function decorateModes(modeList) {
    if (!modeList) return;
    modeList.querySelectorAll("button[data-mode]").forEach((button) => {
      if (button.closest(".cp-sc-row")) return;
      const mode = button.dataset.mode;
      wrap(button, { id: `mode:${mode}`, kind: "mode", mode, label: `Modalità ${MODE_LABELS[mode] || mode}` }, "is-mode");
    });
    syncPins();
  }

  function decoratePanelHeader(header, id, title) {
    if (!header) return;
    let pin = header.querySelector(":scope > .cp-sc-pin");
    if (!pin) {
      pin = makePin(null);
      pin.classList.add("is-header");
      header.append(pin);
    }
    pin._def = { id: `panel:${id}`, kind: "panel", panel: id, key: "", label: title };
    syncPins();
  }

  let observed = null;
  function watch(body) {
    if (observed === body) return;
    observed = body;
    const observer = new MutationObserver(() => {
      observer.disconnect();
      decorate(body);
      observer.observe(body, { childList: true, subtree: true });
    });
    observer.observe(body, { childList: true, subtree: true });
  }

  /* ---------- Barra laterale ---------- */

  function setStatus(message) {
    const node = document.querySelector("#shortcut-status");
    if (!node) return;
    node.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { node.textContent = ""; }, 4000);
  }

  function itemIcon(item) {
    if (item.kind === "mode") return ICONS[item.mode] || ICONS.auto;
    return ICONS[item.kind] || ICONS.open;
  }

  function readState(item) {
    if (item.kind === "mode") return document.documentElement.dataset.modePref || document.documentElement.dataset.mode;
    let state = null;
    if (item.kind === "toggle") perform(item, (entry) => { state = entry.control.checked; });
    return state;
  }

  function render() {
    const list = document.querySelector("#shortcut-list");
    if (!list) return;
    let box = list.querySelector("#shortcut-items");
    if (!box) {
      box = document.createElement("div");
      box.id = "shortcut-items";
      box.className = "cp-sc-items";
      const status = document.createElement("p");
      status.id = "shortcut-status";
      status.className = "cp-sc-status";
      status.setAttribute("role", "status");
      list.prepend(box, status);
    }
    const nodes = items.map((item) => {
      const row = document.createElement("div");
      row.className = "cp-sc-item";
      row.dataset.id = item.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "launcher-link";
      const label = document.createElement("span");
      label.textContent = item.label;
      button.append(svg(itemIcon(item)), label);
      button.title = item.kind === "mode" ? item.label : `${settings()?.panelTitle(item.panel) || "Impostazioni"} › ${item.label}`;
      button.addEventListener("click", () => run(item, button));
      const state = readState(item);
      if (item.kind === "toggle") {
        button.setAttribute("aria-pressed", String(Boolean(state)));
        button.classList.toggle("current", Boolean(state));
      } else if (item.kind === "mode") {
        button.dataset.mode = item.mode;
        button.setAttribute("aria-pressed", String(state === item.mode));
        button.classList.toggle("current", state === item.mode);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cp-sc-remove";
      remove.setAttribute("aria-label", `Rimuovi «${item.label}» dalle scorciatoie`);
      remove.title = "Rimuovi dalle scorciatoie";
      remove.append(svg(ICONS.close));
      remove.addEventListener("click", () => {
        items = items.filter((candidate) => candidate.id !== item.id);
        save();
        syncPins();
        render();
        setStatus(`«${item.label}» tolta dalle scorciatoie.`);
      });
      row.append(button, remove);
      return row;
    });
    if (!nodes.length) {
      const hint = document.createElement("p");
      hint.className = "cp-sc-hint";
      hint.textContent = "Fissa qui le impostazioni che usi di più: tocca il pin accanto a un'opzione in Impostazioni o in Aspetto.";
      box.replaceChildren(hint);
    } else {
      box.replaceChildren(...nodes);
    }
  }

  function syncModes() {
    const mode = document.documentElement.dataset.modePref || document.documentElement.dataset.mode;
    document.querySelectorAll("#shortcut-items button[data-mode]").forEach((button) => {
      const on = button.dataset.mode === mode;
      button.classList.toggle("current", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }

  function run(item, button) {
    if (item.kind === "mode") {
      window.applyTheme?.(document.documentElement.dataset.theme || "google-1", item.mode);
      setStatus(`${item.label} attivata.`);
      return;
    }
    if (item.kind === "panel") {
      if (!settings()?.openPanel(item.panel)) setStatus(`«${item.label}» non è disponibile al momento.`);
      return;
    }
    if (item.kind === "action" && DESTRUCTIVE.test(item.label) && confirming !== item.id) {
      confirming = item.id;
      const label = button.querySelector("span");
      label.textContent = "Tocca di nuovo per confermare";
      setTimeout(() => {
        if (confirming === item.id) confirming = null;
        label.textContent = item.label;
      }, 4000);
      return;
    }
    confirming = null;
    let focusKey = false;
    let message = "";
    const done = perform(item, (entry) => {
      if (item.kind === "open") {
        focusKey = true;
        return;
      }
      entry.control.click();
      message = item.kind === "toggle" ? `${item.label}: ${entry.control.checked ? "attivato" : "disattivato"}.` : `${item.label}: eseguito.`;
    });
    if (!done) {
      setStatus(`«${item.label}» non è disponibile al momento.`);
      return;
    }
    if (focusKey) {
      settings().openPanel(item.panel);
      const body = document.querySelector("#settings-dialog .cp-set-body");
      if (body) scan(body).find((entry) => entry.key === item.key)?.control.focus();
      return;
    }
    setStatus(message);
    render();
  }

  /* ---------- Stili ---------- */

  function addStyles() {
    const style = document.createElement("style");
    style.id = "cyber-pulse-shortcuts-styles";
    style.textContent = `
      .cp-sc-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
      .cp-sc-row > :first-child { flex: 1 1 auto; min-width: 0; }
      .cp-sc-row.is-action > :first-child, .cp-sc-row.is-mode > :first-child { flex: 0 1 auto; }
      .cp-sc-row.is-mode { display: inline-flex; gap: 2px; }
      .cp-sc-pin { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--text-muted); cursor: pointer; }
      .cp-sc-pin .icon { width: 20px; height: 20px; fill: currentColor; }
      .cp-sc-pin:hover { background: var(--accent-soft); color: var(--accent); }
      .cp-sc-pin[aria-pressed="true"] { color: var(--accent); }
      .cp-sc-pin.is-header { margin-left: auto; }
      .cp-sc-items { display: grid; gap: 4px; }
      .cp-sc-item { display: flex; align-items: center; gap: 2px; }
      .cp-sc-item .launcher-link { flex: 1 1 auto; min-width: 0; }
      .cp-sc-item .launcher-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cp-sc-remove { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--text-muted); cursor: pointer; opacity: 0; }
      .cp-sc-remove .icon { width: 18px; height: 18px; fill: currentColor; }
      .cp-sc-item:hover .cp-sc-remove, .cp-sc-item:focus-within .cp-sc-remove { opacity: 1; }
      .cp-sc-remove:hover { background: var(--surface-muted); color: var(--text); }
      @media (hover: none) { .cp-sc-remove { opacity: 1; } }
      .cp-sc-hint { margin: 0; padding: 4px 16px 8px; color: var(--text-muted); font-size: 12px; line-height: 1.45; }
      .cp-sc-status { margin: 0; padding: 0 16px; color: var(--accent); font-size: 12px; }
      .cp-sc-status:empty { display: none; }
      .cp-sc-toast { position: fixed; left: 50%; bottom: 24px; z-index: 20; max-width: calc(100vw - 32px); padding: 10px 18px; border-radius: 20px; background: var(--text); color: var(--surface); font-size: 13px; box-shadow: 0 6px 20px rgb(0 0 0 / 30%); transform: translateX(-50%); }
      .cp-sc-toast[hidden] { display: none; }
    `;
    document.head.append(style);
  }

  function start() {
    addStyles();
    render();
    document.addEventListener("cyberpulse:settingspanel", (event) => {
      const { id, title, body, header } = event.detail;
      currentPanel = id;
      decoratePanelHeader(header, id, title);
      decorate(body);
      watch(body);
    });
    document.addEventListener("cyberpulse:themedialog", (event) => decorateModes(event.detail.modeList));
    document.addEventListener("cyberpulse:themechange", syncModes);
    decorateModes(document.querySelector("#theme-dialog .cp-mode-list"));
    const launcher = document.querySelector("#launcher");
    if (launcher) new MutationObserver(() => { if (launcher.open) render(); }).observe(launcher, { attributes: true, attributeFilter: ["open"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
