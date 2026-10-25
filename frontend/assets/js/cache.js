(() => {
  "use strict";

  const KEY = "cyber-pulse.news-cache";
  const VERSION = 1;
  const MAX_ITEMS = 60;
  const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

  function readAll() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "null");
      if (data && data.v === VERSION && data.entries && typeof data.entries === "object") return data;
    } catch {
      // cache assente o danneggiata: riparte vuota
    }
    return { v: VERSION, entries: {} };
  }

  function isValidItem(item) {
    return Boolean(item) && typeof item.id === "string" && typeof item.title === "string"
      && typeof item.url === "string" && typeof item.sourceId === "string"
      && typeof item.categoryId === "string" && typeof item.publishedAt === "string";
  }

  function load(category) {
    const entry = readAll().entries[category];
    if (!entry || !Array.isArray(entry.items) || typeof entry.savedAt !== "number") return null;
    if (Date.now() - entry.savedAt > MAX_AGE_MS) return null;
    return { items: entry.items.filter(isValidItem), savedAt: entry.savedAt };
  }

  // Salva solo la prima pagina (le notizie più recenti): serve per l'apertura immediata e per l'uso offline.
  function save(category, items) {
    const data = readAll();
    data.entries[category] = { savedAt: Date.now(), items: items.slice(0, MAX_ITEMS) };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      // spazio esaurito: tengo solo la categoria appena salvata
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: VERSION, entries: { [category]: data.entries[category] } }));
        return true;
      } catch {
        return false;
      }
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // niente da fare
    }
  }

  window.CyberPulseCache = Object.freeze({ load, save, clear });
})();
