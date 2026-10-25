(() => {
  "use strict";

  const CATALOG_URL = "./assets/data/sources-catalog.json";
  const OVERRIDES_KEY = "cyber-pulse.source-overrides";
  const ORDER_KEY = "cyber-pulse.category-order";

  const state = {
    catalog: null,
    categories: [],
    activeCategory: "all",
  };

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("Registrazione del service worker non riuscita:", error);
      });
    });
  }

  function isValidCatalog(data) {
    return Boolean(data)
      && Array.isArray(data.categories)
      && data.categories.length > 0
      && data.categories.every((category) =>
        typeof category.id === "string"
        && typeof category.name === "string"
        && Array.isArray(category.sources)
        && category.sources.every((source) =>
          typeof source.id === "string"
          && typeof source.name === "string"
          && typeof source.feedUrl === "string"));
  }

  async function loadCatalog() {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) throw new Error(`Catalogo non raggiungibile (HTTP ${response.status}).`);
    const data = await response.json();
    if (!isValidCatalog(data)) throw new Error("Il catalogo delle fonti non ha il formato previsto.");
    return data;
  }

  // Ordine scelto dall'utente; le categorie nuove o non presenti nell'elenco salvato vanno in fondo.
  function orderCategories(categories) {
    const saved = readStorage(ORDER_KEY, []);
    if (!Array.isArray(saved)) return categories.slice();
    const position = new Map(saved.map((id, index) => [id, index]));
    return categories
      .map((category, index) => ({ category, index }))
      .sort((a, b) => {
        const pa = position.has(a.category.id) ? position.get(a.category.id) : saved.length + a.index;
        const pb = position.has(b.category.id) ? position.get(b.category.id) : saved.length + b.index;
        return pa - pb;
      })
      .map((entry) => entry.category);
  }

  function getOverrides() {
    const overrides = readStorage(OVERRIDES_KEY, {});
    return overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
  }

  function isSourceEnabled(source, overrides = getOverrides()) {
    return typeof overrides[source.id] === "boolean" ? overrides[source.id] : Boolean(source.active);
  }

  function getEnabledSources(categoryId = "all") {
    const overrides = getOverrides();
    const result = [];
    for (const category of state.categories) {
      if (categoryId !== "all" && category.id !== categoryId) continue;
      for (const source of category.sources) {
        if (isSourceEnabled(source, overrides)) result.push({ ...source, category: category.id });
      }
    }
    return result;
  }

  function setSourceEnabled(sourceId, enabled) {
    const overrides = getOverrides();
    overrides[sourceId] = Boolean(enabled);
    writeStorage(OVERRIDES_KEY, overrides);
    refreshSourceFilter();
    document.dispatchEvent(new CustomEvent("cyberpulse:sourceschange"));
  }

  function setCategoryOrder(ids) {
    if (!Array.isArray(ids)) throw new TypeError("L'ordine delle categorie deve essere un array di id.");
    writeStorage(ORDER_KEY, ids);
    if (!state.catalog) return;
    state.categories = orderCategories(state.catalog.categories);
    renderCategories();
    document.dispatchEvent(new CustomEvent("cyberpulse:categoriesreordered"));
  }

  function resetPreferences() {
    try {
      localStorage.removeItem(OVERRIDES_KEY);
      localStorage.removeItem(ORDER_KEY);
    } catch {
      // storage non disponibile: resta la configurazione in memoria
    }
    if (!state.catalog) return;
    state.categories = orderCategories(state.catalog.categories);
    renderCategories();
    refreshSourceFilter();
    document.dispatchEvent(new CustomEvent("cyberpulse:categoriesreordered"));
    document.dispatchEvent(new CustomEvent("cyberpulse:sourceschange"));
  }

  function renderCategories() {
    const strip = document.querySelector("#category-strip");
    if (!strip) return;
    const buttons = state.categories.map((category) => {
      const button = document.createElement("button");
      button.className = "category-button";
      button.type = "button";
      button.dataset.category = category.id;
      button.title = category.name;
      button.textContent = category.short || category.name;
      button.setAttribute("aria-pressed", String(category.id === state.activeCategory));
      return button;
    });
    strip.replaceChildren(...buttons);
    document.querySelector(".dashboard-button")
      ?.setAttribute("aria-pressed", String(state.activeCategory === "all"));
  }

  function refreshSourceFilter() {
    if (typeof window.setCyberPulseSources !== "function") return;
    const showCategory = state.activeCategory === "all";
    const categoryShort = new Map(state.categories.map((c) => [c.id, c.short || c.name]));
    const sources = getEnabledSources(state.activeCategory).map((source) => ({
      id: source.id,
      name: showCategory ? `${source.name} (${categoryShort.get(source.category)})` : source.name,
      siteUrl: source.siteUrl || "",
    }));
    window.setCyberPulseSources(sources);
  }

  function describeCatalog() {
    const enabled = getEnabledSources().length;
    const total = state.categories.reduce((sum, category) => sum + category.sources.length, 0);
    return `Catalogo caricato: ${enabled} fonti attive su ${total}, in ${state.categories.length} categorie.`;
  }

  function showFeedMessage(title, copy) {
    const titleElement = document.querySelector("#empty-state .empty-title");
    const copyElement = document.querySelector("#empty-state .empty-copy");
    if (titleElement) titleElement.textContent = title;
    if (copyElement) copyElement.textContent = copy;
  }

  async function initialize() {
    registerServiceWorker();
    try {
      state.catalog = await loadCatalog();
    } catch (error) {
      console.error(error);
      showFeedMessage(
        "Catalogo delle fonti non disponibile",
        `Non è stato possibile caricare l'elenco delle fonti (${error.message}). Apri l'app da un indirizzo http://localhost:PORTA servendo la cartella frontend, non dal file locale, poi ricarica con Ctrl+F5.`
      );
      return;
    }

    state.categories = orderCategories(state.catalog.categories);
    renderCategories();
    refreshSourceFilter();
    console.info(describeCatalog());

    document.addEventListener("cyberpulse:categorychange", (event) => {
      state.activeCategory = event.detail.category;
      refreshSourceFilter();
    });
    document.addEventListener("cyberpulse:restorestrip", () => {
      state.activeCategory = "all";
      renderCategories();
      refreshSourceFilter();
    });

    window.CyberPulse = Object.freeze({
      getCategories: () => state.categories.map(({ id, name, short }) => ({ id, name, short })),
      getCategorySources: (categoryId) => state.categories.find((c) => c.id === categoryId)?.sources.slice() ?? [],
      getEnabledSources,
      isSourceEnabled: (source) => isSourceEnabled(source),
      setSourceEnabled,
      setCategoryOrder,
      resetPreferences,
    });
    document.dispatchEvent(new CustomEvent("cyberpulse:catalogready", {
      detail: { categories: state.categories.length },
    }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
