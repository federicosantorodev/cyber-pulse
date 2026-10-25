(() => {
  "use strict";

  const REFRESH_AFTER_MS = 5 * 60 * 1000;

  const state = {
    category: "all",
    items: [],
    front: null,
    hasMore: false,
    loading: false,
    sequence: 0,
    controller: null,
    lastLoadAt: 0,
    older: [],
    olderMore: true,
    olderLoading: false,
  };

  const dom = {};
  const clockFormat = new Intl.DateTimeFormat("it", { hour: "2-digit", minute: "2-digit" });

  function pageSize() {
    return window.CYBER_PULSE_CONFIG?.pageSize || 30;
  }

  function showEmpty(title, copy) {
    const titleElement = document.querySelector("#empty-state .empty-title");
    const copyElement = document.querySelector("#empty-state .empty-copy");
    if (titleElement) titleElement.textContent = title;
    if (copyElement) copyElement.textContent = copy;
  }

  function setMeta(text) {
    if (dom.meta) dom.meta.textContent = text;
  }

  function enabledSourceIds() {
    return new Set((window.CyberPulse?.getEnabledSources("all") ?? []).map((source) => source.id));
  }

  const FRONT_KEY = "cyber-pulse.front-page.";
  const FRONT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function readFront(category) {
    try {
      const saved = JSON.parse(localStorage.getItem(FRONT_KEY + category) || "null");
      if (!saved || Date.now() - saved.savedAt > FRONT_MAX_AGE_MS || !Array.isArray(saved.front?.stories)) return null;
      return saved.front;
    } catch {
      return null;
    }
  }

  function saveFront(category, front) {
    try {
      localStorage.setItem(FRONT_KEY + category, JSON.stringify({ savedAt: Date.now(), front }));
    } catch {
      // La copia salvata serve solo per l'apertura immediata.
    }
  }

  function renderOlder(front) {
    if (!dom.older) return;
    dom.older.hidden = !front || state.older.length === 0;
    if (!front) {
      for (const card of dom.older.querySelectorAll(":scope > [data-news-card]")) card.remove();
      return;
    }
    const enabled = enabledSourceIds();
    window.CyberPulseCards.renderInto(dom.older, state.older.filter((item) => enabled.has(item.sourceId)));
  }

  // L'articolo più vecchio già visibile (prima pagina e notizie precedenti): da lì si riparte.
  function oldestShown() {
    let oldest = "";
    const consider = (value) => {
      if (value && (!oldest || value < oldest)) oldest = value;
    };
    for (const item of state.items) consider(item.publishedAt);
    for (const item of state.older) consider(item.publishedAt);
    for (const item of state.front?.headlines || []) consider(item.publishedAt);
    for (const story of state.front?.stories || []) {
      for (const member of story.members || []) consider(member.publishedAt);
    }
    return oldest;
  }

  async function loadOlder() {
    if (state.olderLoading || !state.olderMore) return;
    const before = oldestShown();
    if (!before) return;
    const sequence = state.sequence;
    state.olderLoading = true;
    render();
    try {
      const result = await window.CyberPulseApi.fetchNews({ category: state.category, limit: pageSize(), before });
      if (sequence !== state.sequence) return;
      const known = new Set([...state.items, ...state.older].map((item) => item.id));
      state.older = state.older.concat(result.items.filter((item) => !known.has(item.id)));
      state.olderMore = result.items.length >= pageSize();
    } catch (error) {
      if (sequence !== state.sequence) return;
      console.error(error);
      setMeta(`Non riesco a caricare le notizie precedenti: ${error.message}`);
    } finally {
      if (sequence === state.sequence) {
        state.olderLoading = false;
        render();
      }
    }
  }

  function render() {
    const enabled = enabledSourceIds();
    const visible = state.items.filter((item) => enabled.has(item.sourceId));
    const context = state.category === "all" ? "Home: notizie generali" : `Categoria ${state.category}`;
    const front = window.CyberPulseCards.getPrefs().layout === "front" && state.front && window.CyberPulseFront;
    let shown;
    if (front) {
      shown = window.CyberPulseFront.renderFront(dom.feed, state.front, {
        anchor: dom.status,
        context,
        enabled,
        sections: state.category === "all" ? window.CyberPulseCards.homeSections() : null,
      });
    } else {
      window.CyberPulseFront?.reset(dom.feed);
      shown = window.CyberPulseCards.renderInto(dom.feed, visible, { anchor: dom.status });
    }

    if (front ? shown === 0 : state.items.length > 0 && visible.length === 0) {
      showEmpty("Nessuna notizia dalle fonti attive", "Hai disattivato tutte le fonti di questa categoria o le parole silenziate le nascondono. Controlla le impostazioni.");
    } else if (!front && visible.length > 0 && shown === 0) {
      showEmpty("Tutte le notizie sono nascoste dai tuoi filtri", "Controlla le parole silenziate e le opzioni di lettura nelle impostazioni.");
    }
    renderOlder(Boolean(front));
    if (front) {
      dom.more.hidden = !state.olderMore;
      dom.more.disabled = state.loading || state.olderLoading;
      dom.more.textContent = state.olderLoading ? "Caricamento…" : "Notizie precedenti";
    } else {
      dom.more.hidden = !(state.hasMore && visible.length > 0);
      dom.more.disabled = state.loading;
      dom.more.textContent = state.loading ? "Caricamento…" : "Carica altre notizie";
    }
    window.applyCyberPulseSourceFilters?.();
    document.dispatchEvent(new CustomEvent("cyberpulse:feedrendered", { detail: { category: state.category, items: state.items } }));
  }

  async function loadCategory(category) {
    const api = window.CyberPulseApi;
    const cache = window.CyberPulseCache;
    state.controller?.abort();
    const sequence = ++state.sequence;
    state.category = category;
    state.loading = true;
    state.older = [];
    state.olderMore = true;
    state.olderLoading = false;

    const cached = cache.load(category);
    state.items = cached ? cached.items : [];
    state.front = readFront(category);
    state.hasMore = state.items.length >= pageSize();
    if (!cached && !state.front) showEmpty("Caricamento delle notizie…", "Sto leggendo le ultime notizie dal backend.");
    render();

    if (!api.isConfigured()) {
      state.loading = false;
      showEmpty("Backend non configurato", "Manca l'indirizzo del backend in assets/js/config.js.");
      setMeta("");
      render();
      return;
    }

    setMeta("Aggiornamento in corso…");
    state.controller = new AbortController();
    // La prima pagina viaggia in parallelo: è già pronta sul backend e compare appena arriva.
    api.fetchFront({ category, signal: state.controller.signal }).then((front) => {
      if (sequence !== state.sequence) return;
      state.front = front;
      saveFront(category, front);
      render();
    }).catch((error) => {
      if (error.code !== "ABORTED") console.warn("Prima pagina non disponibile:", error.message);
    });
    try {
      const result = await api.fetchNews({ category, limit: pageSize(), signal: state.controller.signal });
      if (sequence !== state.sequence) return;
      state.items = result.items;
      state.hasMore = result.items.length >= pageSize();
      state.lastLoadAt = Date.now();
      cache.save(category, result.items);
      if (result.items.length === 0) {
        showEmpty("Nessuna notizia disponibile", "Il backend non ha ancora notizie per questa categoria.");
      }
      setMeta(`Aggiornato alle ${clockFormat.format(new Date())}`);
    } catch (error) {
      if (sequence !== state.sequence || error.code === "ABORTED") return;
      console.error(error);
      if (cached) {
        setMeta(`Non riesco ad aggiornare: mostro le notizie salvate alle ${clockFormat.format(new Date(cached.savedAt))}.`);
      } else {
        showEmpty("Notizie non disponibili", `${error.message} Controlla la connessione e riprova più tardi.`);
        setMeta("");
      }
    } finally {
      if (sequence === state.sequence) {
        state.loading = false;
        render();
      }
    }
  }

  async function loadMore() {
    if (window.CyberPulseCards.getPrefs().layout === "front" && state.front && window.CyberPulseFront) {
      loadOlder();
      return;
    }
    if (state.loading || !state.hasMore || state.items.length === 0) return;
    const sequence = state.sequence;
    state.loading = true;
    render();
    try {
      const before = state.items[state.items.length - 1].publishedAt;
      const result = await window.CyberPulseApi.fetchNews({ category: state.category, limit: pageSize(), before });
      if (sequence !== state.sequence) return;
      const known = new Set(state.items.map((item) => item.id));
      state.items = state.items.concat(result.items.filter((item) => !known.has(item.id)));
      state.hasMore = result.items.length >= pageSize();
    } catch (error) {
      if (sequence !== state.sequence) return;
      console.error(error);
      setMeta(`Non riesco a caricare altre notizie: ${error.message}`);
    } finally {
      if (sequence === state.sequence) {
        state.loading = false;
        render();
      }
    }
  }

  function start() {
    dom.feed = document.querySelector("#news-feed");
    dom.status = document.querySelector("#feed-status");
    dom.meta = document.querySelector("#feed-meta");
    dom.more = document.querySelector("#load-more");
    if (!dom.feed || !dom.status || !dom.more) return;

    dom.older = document.createElement("section");
    dom.older.className = "feed cp-older";
    dom.older.setAttribute("aria-label", "Notizie precedenti");
    dom.older.hidden = true;
    const olderTitle = document.createElement("h2");
    olderTitle.className = "cp-older-title";
    olderTitle.textContent = "Notizie precedenti";
    dom.older.append(olderTitle);
    dom.feed.after(dom.older);
    dom.more.addEventListener("click", loadMore);
    document.addEventListener("cyberpulse:categorychange", (event) => loadCategory(event.detail.category));
    document.addEventListener("cyberpulse:sourceschange", render);
    document.addEventListener("cyberpulse:onboardingcomplete", render);
    document.addEventListener("cyberpulse:aichange", render);
    document.addEventListener("cyberpulse:readingchange", render);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !state.loading && Date.now() - state.lastLoadAt > REFRESH_AFTER_MS) {
        loadCategory(state.category);
      }
    });
    loadCategory(state.category);
  }

  // Parte quando il catalogo è pronto (serve per le fonti attive) e l'utente ha effettuato l'accesso.
  let began = false;
  function tryStart() {
    if (began || !window.CyberPulse || !window.CyberPulseAuth?.getUser()) return;
    began = true;
    start();
  }
  document.addEventListener("cyberpulse:catalogready", tryStart);
  document.addEventListener("cyberpulse:signedin", tryStart);
  tryStart();
})();
