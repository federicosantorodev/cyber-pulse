"use strict";

/*
 * Sincronizzazione tra dispositivi.
 * Le preferenze e i dati personali (non i file pesanti) vengono salvati in Firestore, in un solo documento per utente:
 * users/{uid}/sync/data. Si usa l'API REST con il token di accesso, senza caricare altri script.
 * Per ogni chiave vince la modifica più recente; quando arrivano dati nuovi dal cloud la pagina si ricarica.
 */
(() => {
  const META_KEY = "cyber-pulse.sync.meta";
  const GROUPS = [
    { title: "Aspetto e sfondi", keys: ["cyber-pulse.theme", "cyber-pulse.mode", "cyber-pulse.backdrop"] },
    { title: "Notizie, categorie e fonti", keys: ["cyber-pulse.reading-prefs", "cyber-pulse.category-order", "cyber-pulse.source-overrides", "cyber-pulse.saved-items", "cyber-pulse.read-ids", "cyber-pulse.affinity", "cyber-pulse.foryou-hidden", "cyber-pulse.keywords"] },
    { title: "Traduzione e scorciatoie", keys: ["cyber-pulse.translate", "cyber-pulse.shortcuts"] },
    { title: "Arena e Musica", keys: ["cyber-pulse.arena-preferences", "cyber-pulse.music-preferences"] },
    { title: "Libreria: cronologia, segnalibri, preferenze", keys: ["cyber-pulse.library.state", "cyber-pulse.library.prefs"] },
    { title: "Giochi: statistiche e record", keys: ["cyber-pulse.games.klondike-stats", "cyber-pulse.games.memory", "cyber-pulse.games.g2048", "cyber-pulse.games.minesweeper", "cyber-pulse.games.motion"] },
  ];
  const KEYS = GROUPS.flatMap((group) => group.keys);
  const MAX_VALUE = 300000;
  const AUTO_DELAY = 20000;

  const nativeSet = Storage.prototype.setItem;
  let meta = readMeta();
  let running = false;
  let timer = 0;
  let lastMessage = "";

  function readMeta() {
    try {
      const raw = JSON.parse(localStorage.getItem(META_KEY) || "{}") || {};
      return { uid: raw.uid || "", last: Number(raw.last) || 0, auto: Boolean(raw.auto), base: raw.base || {}, mod: raw.mod || {} };
    } catch {
      return { uid: "", last: 0, auto: false, base: {}, mod: {} };
    }
  }

  function saveMeta() {
    try { nativeSet.call(localStorage, META_KEY, JSON.stringify(meta)); } catch { /* storage non disponibile */ }
  }

  // Ogni scrittura delle chiavi sincronizzate registra l'ora della modifica: serve a decidere quale versione è più recente.
  Storage.prototype.setItem = function setItem(key, value) {
    nativeSet.call(this, key, value);
    if (this === localStorage && KEYS.includes(key)) {
      meta.mod[key] = Date.now();
      saveMeta();
      scheduleAuto();
    }
  };

  const auth = () => window.CyberPulseAuth;
  const config = () => window.CYBER_PULSE_CONFIG;

  function endpoint(uid) {
    return `https://firestore.googleapis.com/v1/projects/${config().firebase.projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}/sync/data`;
  }

  function explain(status) {
    if (status === 401) return "Accesso scaduto: esci e rientra, poi riprova.";
    if (status === 403) return "Il cloud rifiuta l'accesso: nel progetto Firebase vanno attivate Firestore e le regole (vedi firestore.rules).";
    if (status === 404) return "Database Firestore non trovato: va creato nel progetto Firebase.";
    return `Il cloud ha risposto con un errore (${status}).`;
  }

  async function request(uid, method, body) {
    const token = await auth().getIdToken();
    const response = await fetch(endpoint(uid), {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404 && method === "GET") {
      // Senza database il 404 porta un messaggio diverso dal semplice "documento non ancora creato".
      const info = await response.json().catch(() => ({}));
      if (/database/i.test(info?.error?.message || "") && !/document/i.test(info?.error?.message || "")) throw new Error(explain(404));
      return null;
    }
    if (!response.ok) throw new Error(explain(response.status));
    return response.json();
  }

  function decode(doc) {
    const out = {};
    const fields = doc?.fields?.items?.mapValue?.fields || {};
    for (const [key, entry] of Object.entries(fields)) {
      const inner = entry.mapValue?.fields;
      if (!inner?.v || !KEYS.includes(key)) continue;
      out[key] = { v: String(inner.v.stringValue ?? ""), at: Number(inner.at?.integerValue) || 0 };
    }
    return out;
  }

  function encode(items) {
    const fields = {};
    for (const [key, entry] of Object.entries(items)) {
      fields[key] = { mapValue: { fields: { v: { stringValue: entry.v }, at: { integerValue: String(entry.at) } } } };
    }
    return { fields: { items: { mapValue: { fields } }, updatedAt: { integerValue: String(Date.now()) } } };
  }

  function local(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  // Decide per ogni chiave se caricare, scaricare o lasciare com'è.
  function plan(remote, allowPull) {
    const push = {};
    const pull = {};
    for (const key of KEYS) {
      const value = local(key);
      const far = remote[key];
      const base = meta.base[key] || 0;
      const modified = meta.mod[key] || 0;
      if (value !== null && value.length > MAX_VALUE) continue;
      if (value === null && !far) continue;
      if (far && value === far.v) {
        meta.base[key] = far.at;
        continue;
      }
      if (!far) {
        push[key] = { v: value, at: modified || Date.now() };
        continue;
      }
      if (value === null) {
        if (allowPull) pull[key] = far;
        continue;
      }
      const localChanged = modified > base;
      const remoteChanged = far.at > base;
      if (localChanged && !remoteChanged) push[key] = { v: value, at: modified };
      else if (remoteChanged && !localChanged) {
        if (allowPull) pull[key] = far;
      } else if (localChanged && remoteChanged) {
        if (modified >= far.at) push[key] = { v: value, at: modified };
        else if (allowPull) pull[key] = far;
      } else if (allowPull) {
        pull[key] = far;
      }
    }
    return { push, pull };
  }

  async function sync({ pull = true, silent = false } = {}) {
    if (running) return { ok: false, message: "Sincronizzazione già in corso." };
    const user = auth()?.getUser();
    if (!user) return report("Accedi per sincronizzare i tuoi dati.", false);
    if (!navigator.onLine) return report("Sei offline: riprova quando c'è connessione.", false);
    running = true;
    clearTimeout(timer);
    if (!silent) report("Sincronizzazione in corso…", true, true);
    try {
      if (meta.uid !== user.uid) meta = { uid: user.uid, last: 0, auto: meta.auto, base: {}, mod: meta.mod };
      const doc = await request(user.uid, "GET");
      const remote = decode(doc);
      const { push, pull: incoming } = plan(remote, pull);
      const pushed = Object.keys(push).length;
      const pulled = Object.keys(incoming).length;
      if (pushed) {
        const merged = { ...remote };
        for (const [key, entry] of Object.entries(push)) merged[key] = entry;
        await request(user.uid, "PATCH", encode(merged));
        for (const [key, entry] of Object.entries(push)) {
          meta.base[key] = entry.at;
          meta.mod[key] = entry.at;
        }
      }
      for (const [key, entry] of Object.entries(incoming)) {
        nativeSet.call(localStorage, key, entry.v);
        meta.base[key] = entry.at;
        meta.mod[key] = entry.at;
      }
      meta.last = Date.now();
      saveMeta();
      if (pulled) {
        report(`Dati aggiornati da un altro dispositivo (${pulled}). Ricarico la pagina…`, true);
        setTimeout(() => location.reload(), 1200);
      } else {
        report(pushed ? `Sincronizzato: ${pushed} ${pushed === 1 ? "voce inviata" : "voci inviate"} al cloud.` : "Tutto già aggiornato.", true);
      }
      return { ok: true, pushed, pulled };
    } catch (error) {
      console.warn("Sincronizzazione non riuscita:", error);
      return report(error instanceof TypeError ? "Non riesco a raggiungere il cloud: controlla la connessione." : error.message, false);
    } finally {
      running = false;
      refreshStatus();
    }
  }

  function scheduleAuto() {
    clearTimeout(timer);
    if (!meta.auto || !auth()?.getUser()) return;
    timer = setTimeout(() => sync({ pull: false, silent: true }), AUTO_DELAY);
  }

  /* ---------- Stato mostrato all'utente ---------- */

  function lastText() {
    if (!meta.last) return "Mai sincronizzato su questo dispositivo.";
    return `Ultima sincronizzazione: ${new Date(meta.last).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`;
  }

  function report(message, ok, transient) {
    lastMessage = message;
    document.querySelectorAll(".cp-sync-status").forEach((node) => { node.textContent = message; });
    const side = document.querySelector("#shortcut-status");
    if (side) side.textContent = message;
    if (!transient) setTimeout(refreshStatus, 6000);
    return { ok, message };
  }

  function refreshStatus() {
    if (running) return;
    document.querySelectorAll(".cp-sync-status").forEach((node) => {
      node.textContent = node.dataset.keep === lastMessage ? lastMessage : lastText();
    });
  }

  /* ---------- Pannello Impostazioni ---------- */

  function buildPanel() {
    const section = document.createElement("section");
    section.className = "cp-settings-section cp-sync-panel";
    const hint = document.createElement("p");
    hint.className = "cp-settings-hint";
    hint.textContent = "Tieni uguali su tutti i tuoi dispositivi aspetto, preferenze, segnalibri e record. Per ogni dato vince la modifica più recente.";

    const actions = document.createElement("div");
    actions.className = "cp-settings-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cp-choice";
    button.textContent = "Sincronizza ora";
    button.addEventListener("click", () => sync());
    const status = document.createElement("p");
    status.className = "cp-ui-status cp-sync-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = lastText();
    actions.append(button, status);

    const grid = document.createElement("div");
    grid.className = "cp-reading-grid";
    const toggle = document.createElement("label");
    toggle.className = "cp-ai-radio";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = meta.auto;
    box.addEventListener("change", () => {
      meta.auto = box.checked;
      saveMeta();
      if (meta.auto) sync({ pull: true });
    });
    const text = document.createElement("span");
    text.textContent = "Sincronizza automaticamente";
    toggle.append(box, text);
    grid.append(toggle);

    const title = document.createElement("p");
    title.className = "cp-ai-legend";
    title.textContent = "Cosa viene sincronizzato";
    const list = document.createElement("ul");
    list.className = "cp-sync-list";
    for (const group of GROUPS) {
      const item = document.createElement("li");
      item.textContent = group.title;
      list.append(item);
    }
    const note = document.createElement("p");
    note.className = "cp-settings-hint";
    note.textContent = "Restano solo su questo dispositivo: i file dei libri, l'immagine di sfondo caricata e la chiave AI. Con la sincronizzazione automatica i dati vengono inviati dopo ogni modifica e scaricati all'apertura dell'app.";

    section.append(hint, actions, grid, title, list, note);
    return section;
  }

  function addStyles() {
    const style = document.createElement("style");
    style.id = "cyber-pulse-sync-styles";
    style.textContent = `
      .cp-sync-panel .cp-settings-actions { display: grid; justify-items: start; gap: 10px; margin: 0 0 24px; }
      .cp-sync-panel .cp-sync-status { margin: 0; }
      .cp-sync-panel .cp-reading-grid { margin-bottom: 24px; }
      .cp-sync-panel .cp-ai-legend { margin: 0; }
      .cp-sync-list { display: grid; gap: 6px; margin: 8px 0 14px; padding: 0; list-style: none; }
      .cp-sync-list li { padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-muted); font-size: 13px; }
    `;
    document.head.append(style);
  }

  function start() {
    addStyles();
    window.CyberPulseSettings?.register({ id: "sync", group: "general", title: "Sincronizzazione", build: buildPanel });
    const launcherButton = document.querySelector("#launcher-sync");
    if (launcherButton) {
      launcherButton.disabled = false;
      launcherButton.removeAttribute("aria-label");
      launcherButton.querySelector(".availability")?.remove();
      launcherButton.addEventListener("click", () => sync());
    }
    document.addEventListener("cyberpulse:signedin", () => {
      if (meta.auto) setTimeout(() => sync({ pull: true, silent: true }), 1500);
    });
    window.addEventListener("online", scheduleAuto);
  }

  window.CyberPulseSync = Object.freeze({ sync, keys: KEYS });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
