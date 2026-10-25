/* Cyber Pulse - motore delle card (Livello Standard).
 * Usato da Home, Arena e (in futuro) Musica. Nessuna chiamata di rete e nessuna AI:
 * tutte le personalizzazioni funzionano con regole locali sul testo delle notizie. */
(() => {
  "use strict";

  const PREFS_KEY = "cyber-pulse.reading-prefs";
  const READ_KEY = "cyber-pulse.read-ids";
  const SAVED_KEY = "cyber-pulse.saved-items";
  const MAX_READ = 600;
  const MAX_SAVED = 100;
  const MAX_MUTE = 50;
  const MAX_MUTE_LENGTH = 40;

  const DEFAULTS = Object.freeze({
    layout: "front",
    textSize: "normal",
    showImages: true,
    showSummary: true,
    clickbait: "mark",
    dedupe: true,
    hideRead: false,
    sort: "date",
    mute: [],
  });

  const LAYOUTS = ["front", "grid", "list", "compact"];
  const TEXT_SIZES = ["normal", "large", "xlarge"];
  const CLICKBAIT_MODES = ["off", "mark", "clean"];
  const SORTS = ["date", "source"];

  const CLICKBAIT_PHRASES = /non (ci )?crederai|ecco (cosa|perch[eé]|come|chi)|cosa (succede|accade|è successo) (dopo|se)|ti (sveler|lascer)|sconvolgente|da non credere|you won'?t believe|will (shock|blow) you|this is (why|how)|what happens next/i;

  const timeFormat = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
  const dateFormat = new Intl.DateTimeFormat("it", { day: "numeric", month: "short", year: "numeric" });

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function pick(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function cleanMuteList(list) {
    const seen = new Set();
    const result = [];
    for (const entry of Array.isArray(list) ? list : []) {
      const word = String(entry).trim().toLocaleLowerCase("it").slice(0, MAX_MUTE_LENGTH);
      if (word && !seen.has(word)) {
        seen.add(word);
        result.push(word);
      }
      if (result.length >= MAX_MUTE) break;
    }
    return result;
  }

  function cleanIdList(list) {
    const result = [];
    for (const entry of Array.isArray(list) ? list : []) {
      const id = String(entry);
      if (/^[a-z0-9_-]{1,40}$/.test(id) && !result.includes(id)) result.push(id);
    }
    return result.slice(0, 40);
  }

  function getPrefs() {
    const stored = readJson(PREFS_KEY, {});
    const raw = stored && typeof stored === "object" ? stored : {};
    return {
      layout: pick(raw.layout, LAYOUTS, DEFAULTS.layout),
      textSize: pick(raw.textSize, TEXT_SIZES, DEFAULTS.textSize),
      showImages: raw.showImages !== false,
      showSummary: raw.showSummary !== false,
      clickbait: pick(raw.clickbait, CLICKBAIT_MODES, DEFAULTS.clickbait),
      dedupe: raw.dedupe !== false,
      hideRead: raw.hideRead === true,
      sort: pick(raw.sort, SORTS, DEFAULTS.sort),
      mute: cleanMuteList(raw.mute),
      homeOrder: cleanIdList(raw.homeOrder),
      homeHidden: cleanIdList(raw.homeHidden),
    };
  }

  function setPrefs(partial) {
    const next = { ...getPrefs(), ...partial };
    next.mute = cleanMuteList(next.mute);
    next.homeOrder = cleanIdList(next.homeOrder);
    next.homeHidden = cleanIdList(next.homeHidden);
    writeJson(PREFS_KEY, next);
    document.dispatchEvent(new CustomEvent("cyberpulse:readingchange"));
    return next;
  }

  /* ---------- Letti e salvati ---------- */

  function itemKey(item) {
    return String(item.id || item.url || item.title || "");
  }

  function readSet() {
    const list = readJson(READ_KEY, []);
    return new Set(Array.isArray(list) ? list : []);
  }

  function markRead(item) {
    const key = itemKey(item);
    if (!key) return;
    const list = readJson(READ_KEY, []);
    const next = (Array.isArray(list) ? list : []).filter((entry) => entry !== key);
    next.push(key);
    writeJson(READ_KEY, next.slice(-MAX_READ));
  }

  function getSaved() {
    const list = readJson(SAVED_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function isSaved(item) {
    const key = itemKey(item);
    return getSaved().some((entry) => entry.key === key);
  }

  function toggleSaved(item) {
    const key = itemKey(item);
    if (!key) return false;
    const list = getSaved();
    const index = list.findIndex((entry) => entry.key === key);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.unshift({
        key,
        title: String(item.title || "").slice(0, 300),
        url: safeUrl(item.url),
        sourceName: String(item.sourceName || "").slice(0, 80),
        publishedAt: item.publishedAt || "",
      });
    }
    writeJson(SAVED_KEY, list.slice(0, MAX_SAVED));
    document.dispatchEvent(new CustomEvent("cyberpulse:savedchange"));
    return index < 0;
  }

  /* ---------- Regole sui testi ---------- */

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function formatWhen(iso) {
    const date = new Date(iso);
    const diff = date.getTime() - Date.now();
    if (Number.isNaN(diff)) return "";
    const minutes = Math.round(diff / 60000);
    if (Math.abs(minutes) < 60) return timeFormat.format(Math.min(minutes, 0), "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return timeFormat.format(hours, "hour");
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 7) return timeFormat.format(days, "day");
    return dateFormat.format(date);
  }

  function isShouting(title) {
    const words = title.split(/\s+/).filter((word) => (word.match(/\p{L}/gu) || []).length >= 3);
    if (words.length < 3) return false;
    const upper = words.filter((word) => word === word.toLocaleUpperCase("it") && word !== word.toLocaleLowerCase("it"));
    return upper.length / words.length >= 0.5;
  }

  function isClickbait(title) {
    return CLICKBAIT_PHRASES.test(title) || /[!?]{2,}/.test(title) || isShouting(title) || /\p{Extended_Pictographic}/u.test(title);
  }

  function cleanTitle(title) {
    let text = title.replace(/\p{Extended_Pictographic}/gu, "").replace(/[!?]{2,}/g, (match) => (match.includes("?") ? "?" : "!"));
    if (isShouting(text)) {
      const lower = text.toLocaleLowerCase("it");
      text = lower.charAt(0).toLocaleUpperCase("it") + lower.slice(1);
    }
    return text.replace(/\s{2,}/g, " ").trim() || title;
  }

  function tokens(title) {
    return new Set(title.toLocaleLowerCase("it").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 3));
  }

  function similar(a, b) {
    if (a.size < 3 || b.size < 3) return false;
    let shared = 0;
    for (const word of a) if (b.has(word)) shared += 1;
    return shared / (a.size + b.size - shared) >= 0.6;
  }

  // Applica le preferenze di lettura: parole silenziate, già letti, duplicati, ordinamento.
  function prepare(items, overrides) {
    const prefs = { ...getPrefs(), ...overrides };
    const read = prefs.hideRead ? readSet() : null;
    const muted = prefs.mute;
    const entries = [];
    for (const item of Array.isArray(items) ? items : []) {
      const title = String(item.title || "").trim();
      if (!title) continue;
      if (muted.length > 0) {
        const haystack = `${title} ${item.summary || ""}`.toLocaleLowerCase("it");
        if (muted.some((word) => haystack.includes(word))) continue;
      }
      if (read && read.has(itemKey(item))) continue;
      const flagged = prefs.clickbait !== "off" && isClickbait(title);
      entries.push({
        item,
        title: prefs.clickbait === "clean" && flagged ? cleanTitle(title) : title,
        clickbait: prefs.clickbait === "mark" && flagged,
        alsoFrom: [],
      });
    }

    let result = entries;
    if (prefs.dedupe) {
      result = [];
      const kept = [];
      for (const entry of entries) {
        const own = tokens(entry.item.title || "");
        const original = kept.find((candidate) => similar(candidate.tokens, own));
        if (original) {
          const name = entry.item.sourceName || entry.item.sourceId;
          if (name && name !== original.entry.item.sourceName && !original.entry.alsoFrom.includes(name)) original.entry.alsoFrom.push(name);
        } else {
          kept.push({ entry, tokens: own });
          result.push(entry);
        }
      }
    }

    if (prefs.sort === "source") {
      result = result.slice().sort((a, b) => String(a.item.sourceName || "").localeCompare(String(b.item.sourceName || ""), "it")
        || String(b.item.publishedAt || "").localeCompare(String(a.item.publishedAt || "")));
    }
    return result;
  }

  /* ---------- Costruzione delle card ---------- */

  function buildCard(entry) {
    const { item } = entry;
    const card = document.createElement("article");
    card.className = "news-card";
    card.dataset.newsCard = "";
    card.dataset.category = item.categoryId || "";
    card.dataset.source = item.sourceId || "";
    if (readSet().has(itemKey(item))) card.classList.add("is-read");

    const body = document.createElement("div");
    body.className = "news-card-body";

    const meta = document.createElement("p");
    meta.className = "news-card-meta";
    meta.append(`${item.sourceName || item.sourceId || "Fonte"}`);
    if (item.publishedAt) {
      const when = document.createElement("time");
      when.dateTime = item.publishedAt;
      when.textContent = formatWhen(item.publishedAt);
      when.title = new Date(item.publishedAt).toLocaleString("it");
      meta.append(" · ", when);
    }
    if (entry.clickbait) {
      const badge = document.createElement("span");
      badge.className = "cp-badge";
      badge.textContent = "Titolo enfatico";
      badge.title = "Il titolo usa toni sensazionalistici (maiuscole, punti esclamativi o formule da clickbait).";
      meta.append(" ", badge);
    }

    const heading = document.createElement("h2");
    heading.className = "news-card-title";
    const href = safeUrl(item.url);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = entry.title;
      link.addEventListener("click", () => {
        markRead(item);
        card.classList.add("is-read");
      });
      heading.append(link);
    } else {
      heading.textContent = entry.title;
    }

    body.append(meta, heading);

    if (item.summary) {
      const summary = document.createElement("p");
      summary.className = "news-card-summary";
      summary.textContent = item.summary;
      body.append(summary);
    }

    if (entry.alsoFrom.length > 0) {
      const also = document.createElement("p");
      also.className = "cp-also";
      also.textContent = `Anche su: ${entry.alsoFrom.slice(0, 4).join(", ")}${entry.alsoFrom.length > 4 ? "…" : ""}`;
      body.append(also);
    }

    const actions = document.createElement("div");
    actions.className = "cp-card-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "cp-card-action";
    const paint = () => {
      const saved = isSaved(item);
      save.textContent = saved ? "★ Salvata" : "☆ Salva per dopo";
      save.setAttribute("aria-pressed", String(saved));
    };
    paint();
    save.addEventListener("click", () => {
      toggleSaved(item);
      paint();
    });
    actions.append(save);
    body.append(actions);

    card.append(body);
    window.CyberPulseAi?.attachSummary(card, item);

    const imageUrl = safeUrl(item.imageUrl || "");
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "news-card-thumb";
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove(), { once: true });
      card.append(image);
    }
    return card;
  }

  function applyLayout(container) {
    const prefs = getPrefs();
    container.classList.add("cp-cards");
    container.dataset.layout = prefs.layout === "front" ? "grid" : prefs.layout;
    container.dataset.textSize = prefs.textSize;
    container.dataset.images = String(prefs.showImages);
    container.dataset.summary = String(prefs.showSummary);
  }

  // Sostituisce le card nel contenitore; le nuove vengono inserite prima di "anchor" (se presente).
  function renderInto(container, items, options = {}) {
    applyLayout(container);
    for (const card of container.querySelectorAll(":scope > [data-news-card]")) card.remove();
    const entries = prepare(items);
    const fragment = document.createDocumentFragment();
    for (const entry of entries) fragment.append(buildCard(entry));
    if (options.anchor && options.anchor.parentNode === container) container.insertBefore(fragment, options.anchor);
    else container.append(fragment);
    return entries.length;
  }

  /* ---------- Stili ---------- */

  function addStyles() {
    if (document.querySelector("#cp-cards-style")) return;
    const style = document.createElement("style");
    style.id = "cp-cards-style";
    style.textContent = `
      .cp-cards[data-layout="grid"] { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); align-items: start; }
      .cp-cards[data-layout="grid"] > :not([data-news-card]) { grid-column: 1 / -1; }
      .cp-cards[data-layout="grid"] .news-card { flex-direction: column-reverse; gap: 12px; height: 100%; }
      .cp-cards[data-layout="grid"] .news-card-thumb { width: 100%; height: 170px; }
      .cp-cards[data-layout="compact"] { gap: 8px; }
      .cp-cards[data-layout="compact"] .news-card { padding: 10px 14px; }
      .cp-cards[data-layout="compact"] .news-card-thumb,
      .cp-cards[data-layout="compact"] .news-card-summary { display: none; }
      .cp-cards[data-layout="compact"] .news-card-title { margin: 0; font-size: 15px; }
      .cp-cards[data-images="false"] .news-card-thumb,
      .cp-cards[data-summary="false"] .news-card-summary { display: none; }
      .cp-cards[data-text-size="large"] .news-card-title { font-size: 19px; }
      .cp-cards[data-text-size="large"] .news-card-summary { font-size: 16px; }
      .cp-cards[data-text-size="xlarge"] .news-card-title { font-size: 22px; }
      .cp-cards[data-text-size="xlarge"] .news-card-summary { font-size: 18px; }
      .cp-cards[data-layout="compact"][data-text-size="large"] .news-card-title { font-size: 17px; }
      .cp-cards[data-layout="compact"][data-text-size="xlarge"] .news-card-title { font-size: 19px; }
      .news-card.is-read .news-card-title { opacity: .6; }
      .cp-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 600; }
      .cp-also { margin: 8px 0 0; color: var(--text-muted); font-size: 12px; }
      .cp-card-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .cp-card-action { min-height: 32px; padding: 0 12px; border: 1px solid var(--border); border-radius: 16px; background: transparent; color: var(--text-muted); font: inherit; font-size: 12px; cursor: pointer; }
      .cp-card-action:hover, .cp-card-action[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
      .cp-reading-grid { display: grid; gap: 14px; }
      .cp-reading-row { display: grid; gap: 6px; }
      .cp-reading-row select, .cp-reading-row textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
      .cp-saved-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
      .cp-saved-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; }
      .cp-saved-list a { color: var(--accent); overflow-wrap: anywhere; }
    `;
    document.head.append(style);
  }

  /* ---------- Sezione "Lettura" delle impostazioni ---------- */

  function field(labelText, control) {
    const row = document.createElement("div");
    row.className = "cp-reading-row";
    const label = document.createElement("label");
    label.className = "cp-ai-legend";
    label.textContent = labelText;
    if (control.id) label.htmlFor = control.id;
    row.append(label, control);
    return row;
  }

  function select(id, options, value, onChange) {
    const element = document.createElement("select");
    element.id = id;
    for (const [optionValue, text] of options) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = text;
      element.append(option);
    }
    element.value = value;
    element.addEventListener("change", () => onChange(element.value));
    return element;
  }

  function checkbox(labelText, checked, onChange) {
    const label = document.createElement("label");
    label.className = "cp-ai-radio";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(input, span);
    return label;
  }

  // Elenco completo delle categorie nell'ordine scelto dall'utente (le nuove in coda).
  function homeSections() {
    const catalog = window.CyberPulse?.getCategories?.() ?? [];
    const hidden = getPrefs().homeHidden;
    return catalog.map((category) => ({ id: category.id, name: category.name, hidden: hidden.includes(category.id) }));
  }

  function buildSettingsSection() {
    addStyles();
    const prefs = getPrefs();
    const section = document.createElement("section");
    section.className = "cp-settings-section";
    section.id = "reading-preferences-section";
    section.innerHTML = "<h3>Lettura delle notizie</h3>";

    const hint = document.createElement("p");
    hint.className = "cp-settings-hint";
    hint.textContent = "Valgono per Home, Arena e gli altri hub. Funzionano senza AI, direttamente sul tuo dispositivo.";

    const grid = document.createElement("div");
    grid.className = "cp-reading-grid";

    grid.append(
      field("Aspetto delle card", select("reading-layout", [["front", "Prima pagina (storie raggruppate, consigliato)"], ["grid", "Mosaico di schede"], ["list", "Elenco con anteprima"], ["compact", "Compatto (solo titoli)"]], prefs.layout, (value) => setPrefs({ layout: value }))),
      field("Dimensione del testo", select("reading-size", [["normal", "Normale"], ["large", "Grande"], ["xlarge", "Molto grande"]], prefs.textSize, (value) => setPrefs({ textSize: value }))),
      field("Ordinamento", select("reading-sort", [["date", "Dalla più recente"], ["source", "Per fonte"]], prefs.sort, (value) => setPrefs({ sort: value }))),
      field("Titoli sensazionalistici", select("reading-clickbait", [["off", "Non fare nulla"], ["mark", "Segnala con un'etichetta"], ["clean", "Ripulisci il titolo (maiuscole, !!!, emoji)"]], prefs.clickbait, (value) => setPrefs({ clickbait: value }))),
      checkbox("Mostra le immagini", prefs.showImages, (value) => setPrefs({ showImages: value })),
      checkbox("Mostra l'anteprima del testo", prefs.showSummary, (value) => setPrefs({ showSummary: value })),
      checkbox("Unisci le notizie duplicate di più fonti", prefs.dedupe, (value) => setPrefs({ dedupe: value })),
      checkbox("Nascondi le notizie già lette", prefs.hideRead, (value) => setPrefs({ hideRead: value })),
    );

    const mute = document.createElement("textarea");
    mute.id = "reading-mute";
    mute.rows = 3;
    mute.maxLength = 1500;
    mute.placeholder = "Una parola o frase per riga";
    mute.value = prefs.mute.join("\n");
    mute.addEventListener("change", () => setPrefs({ mute: mute.value.split(/[\n,]/) }));
    grid.append(field("Parole da silenziare (le notizie che le contengono vengono nascoste)", mute));

    const savedTitle = document.createElement("h4");
    savedTitle.className = "cp-ai-legend";
    savedTitle.textContent = "Salvate per dopo";
    const savedList = document.createElement("ul");
    savedList.className = "cp-saved-list";
    const paintSaved = () => {
      const saved = getSaved();
      savedList.replaceChildren();
      if (saved.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "Nessuna notizia salvata.";
        savedList.append(empty);
        return;
      }
      for (const entry of saved) {
        const row = document.createElement("li");
        const link = document.createElement(entry.url ? "a" : "span");
        link.textContent = entry.title;
        if (entry.url) {
          link.href = entry.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "cp-card-action";
        remove.textContent = "Rimuovi";
        remove.addEventListener("click", () => {
          toggleSaved({ id: entry.key });
          paintSaved();
          document.dispatchEvent(new CustomEvent("cyberpulse:readingchange"));
        });
        row.append(link, remove);
        savedList.append(row);
      }
    };
    paintSaved();
    document.addEventListener("cyberpulse:savedchange", paintSaved);

    grid.append(savedTitle, savedList);
    section.append(hint, grid);
    return section;
  }

  addStyles();
  window.CyberPulseCards = Object.freeze({ getPrefs, setPrefs, prepare, buildCard, renderInto, applyLayout, buildSettingsSection, homeSections });
})();
