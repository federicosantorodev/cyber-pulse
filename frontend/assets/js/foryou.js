(() => {
  "use strict";

  const KEY = "cyber-pulse.affinity";
  const HIDDEN_KEY = "cyber-pulse.foryou-hidden";
  const MIN_CLICKS = 3;
  const MAX_ITEMS = 6;
  const MAX_PER_SOURCE = 2;
  const MAX_WORDS = 300;
  const DECAY = 0.97;
  const STOP = new Set(("che con per una uno dei del della delle degli dello nel nella nelle sul sulla alle agli dalla dopo come anche sono sara molto tutti tutto ancora della cosa essere stato stata hanno questo questa nuovo nuova primo prima secondo anni anno the and for with from this that have will your are was after about").split(" "));

  let section = null;
  let list = null;
  let hint = null;
  let toggle = null;
  let lastItems = [];
  let lastCategory = "all";
  let timer = 0;

  function readAffinity() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "null");
      if (data && typeof data === "object") {
        return { n: Number(data.n) || 0, sources: data.sources || {}, cats: data.cats || {}, words: data.words || {} };
      }
    } catch {
      // dati non validi: si riparte da zero
    }
    return { n: 0, sources: {}, cats: {}, words: {} };
  }

  function writeAffinity(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // senza storage la personalizzazione resta solo in memoria
    }
  }

  function tokens(text) {
    const words = String(text || "").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/);
    return [...new Set(words.filter((word) => word.length >= 4 && !STOP.has(word) && !/^\d+$/.test(word)))];
  }

  function decayAll(map) {
    for (const key of Object.keys(map)) {
      map[key] *= DECAY;
      if (map[key] < 0.05) delete map[key];
    }
  }

  function trimWords(words) {
    const keys = Object.keys(words);
    if (keys.length <= MAX_WORDS) return;
    keys.sort((a, b) => words[b] - words[a]);
    for (const key of keys.slice(MAX_WORDS)) delete words[key];
  }

  function learn(sourceId, categoryId, title) {
    const data = readAffinity();
    decayAll(data.sources);
    decayAll(data.cats);
    decayAll(data.words);
    if (sourceId) data.sources[sourceId] = (data.sources[sourceId] || 0) + 1;
    if (categoryId) data.cats[categoryId] = (data.cats[categoryId] || 0) + 1;
    for (const word of tokens(title)) data.words[word] = (data.words[word] || 0) + 1;
    trimWords(data.words);
    data.n += 1;
    writeAffinity(data);
  }

  function onClick(event) {
    const link = event.target.closest?.("a[href]");
    if (!link || link.closest(".fy-actions")) return;
    const holder = link.closest("[data-source]");
    if (!holder) return;
    const titleNode = link.closest(".cp-story, .news-card")?.querySelector(".cp-story-title, .news-card-title");
    const title = titleNode ? titleNode.textContent : link.textContent;
    learn(holder.dataset.source, holder.dataset.category, title);
    schedule();
  }

  function score(item, data) {
    const affinity = (data.sources[item.sourceId] || 0)
      + 0.6 * (data.cats[item.categoryId] || 0)
      + 0.4 * tokens(`${item.title} ${item.summary || ""}`).reduce((sum, word) => sum + Math.min(data.words[word] || 0, 3), 0);
    const age = Date.now() - new Date(item.publishedAt).getTime();
    const fresh = Number.isFinite(age) ? Math.max(0, 1 - age / (48 * 3600 * 1000)) : 0;
    return { affinity, total: affinity + fresh };
  }

  function pick(items, data) {
    const cards = window.CyberPulseCards;
    const enabled = new Set((window.CyberPulse?.getEnabledSources("all") ?? []).map((source) => source.id));
    const entries = cards.prepare(items.filter((item) => enabled.has(item.sourceId)), { hideRead: true, dedupe: true });
    const ranked = entries
      .map((entry) => ({ entry, ...score(entry.item, data) }))
      .filter((row) => row.affinity > 0.5)
      .sort((a, b) => b.total - a.total);
    const perSource = new Map();
    const chosen = [];
    for (const row of ranked) {
      const count = perSource.get(row.entry.item.sourceId) || 0;
      if (count >= MAX_PER_SOURCE) continue;
      perSource.set(row.entry.item.sourceId, count + 1);
      chosen.push(row.entry);
      if (chosen.length === MAX_ITEMS) break;
    }
    return chosen;
  }

  function isHidden() {
    try {
      return localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  }

  function render() {
    if (!section || !window.CyberPulseCards) return;
    const visible = lastCategory === "all" && !document.body.dataset.hub;
    section.hidden = !visible;
    if (!visible) return;
    const data = readAffinity();
    const hidden = isHidden();
    toggle.textContent = hidden ? "Mostra" : "Nascondi";
    toggle.setAttribute("aria-expanded", String(!hidden));
    list.hidden = hidden;
    hint.hidden = hidden;
    list.replaceChildren();
    if (hidden) return;
    if (data.n < MIN_CLICKS) {
      hint.textContent = `Apri qualche notizia (${data.n}/${MIN_CLICKS}) e qui compariranno quelle più affini a te. Tutto resta su questo dispositivo.`;
      return;
    }
    const chosen = pick(lastItems, data);
    if (chosen.length === 0) {
      hint.textContent = "Nessuna notizia nuova affine ai tuoi interessi in questo momento.";
      return;
    }
    hint.textContent = "Scelte in base a ciò che leggi. Il calcolo avviene sul tuo dispositivo.";
    window.CyberPulseCards.applyLayout(list);
    list.dataset.layout = "grid";
    for (const entry of chosen) list.append(window.CyberPulseCards.buildCard(entry));
    window.applyCyberPulseSourceFilters?.();
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(render, 250);
  }

  function reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // niente da rimuovere
    }
    render();
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .fy-section { margin: 0 0 28px; padding: 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
      .fy-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
      .fy-title { margin: 0; font-size: 18px; font-weight: 600; }
      .fy-actions { display: flex; gap: 8px; }
      .fy-button { min-height: 32px; padding: 0 12px; border: 1px solid var(--border); border-radius: 16px; background: transparent; color: var(--text-muted); font: inherit; font-size: 12px; cursor: pointer; }
      .fy-button:hover { background: var(--surface-muted); color: var(--text); }
      .fy-hint { margin: 0 0 12px; color: var(--text-muted); font-size: 13px; line-height: 1.5; }
      .fy-list { display: grid; gap: 16px; }
      .fy-list:empty { display: none; }
    `;
    document.head.append(style);
  }

  function button(label, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "fy-button";
    element.textContent = label;
    element.addEventListener("click", handler);
    return element;
  }

  function init() {
    const home = document.querySelector("#home-page");
    const feed = document.querySelector("#news-feed");
    if (!home || !feed) return;
    addStyles();
    section = document.createElement("section");
    section.className = "fy-section";
    section.setAttribute("aria-labelledby", "fy-title");
    section.hidden = true;
    const head = document.createElement("div");
    head.className = "fy-head";
    const title = document.createElement("h2");
    title.className = "fy-title";
    title.id = "fy-title";
    title.textContent = "Per te";
    const actions = document.createElement("div");
    actions.className = "fy-actions";
    toggle = button("Nascondi", () => {
      try {
        if (isHidden()) localStorage.removeItem(HIDDEN_KEY);
        else localStorage.setItem(HIDDEN_KEY, "1");
      } catch {
        // preferenza non salvabile
      }
      render();
    });
    actions.append(toggle, button("Azzera", reset));
    head.append(title, actions);
    hint = document.createElement("p");
    hint.className = "fy-hint";
    list = document.createElement("div");
    list.className = "fy-list";
    section.append(head, hint, list);
    feed.before(section);

    document.addEventListener("click", onClick, true);
    document.addEventListener("cyberpulse:feedrendered", (event) => {
      lastCategory = event.detail.category;
      lastItems = event.detail.items || [];
      schedule();
    });
    document.addEventListener("cyberpulse:categorychange", (event) => {
      lastCategory = event.detail.category;
      schedule();
    });
  }

  window.CyberPulseForYou = Object.freeze({ reset });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
