(() => {
  "use strict";

  const TIMEOUT_MS = 30000;
  const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

  class ApiError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ApiError";
      this.code = code;
    }
  }

  function getBackendUrl() {
    const url = window.CYBER_PULSE_CONFIG?.backendUrl;
    return typeof url === "string" && /^https:\/\//.test(url) ? url : "";
  }

  function isConfigured() {
    return getBackendUrl() !== "";
  }

  function isValidItem(item) {
    return Boolean(item)
      && typeof item.id === "string"
      && typeof item.categoryId === "string"
      && typeof item.sourceId === "string"
      && typeof item.title === "string"
      && typeof item.url === "string"
      && typeof item.publishedAt === "string";
  }

  // GET semplice, oppure POST con corpo JSON inviato come testo: entrambi evitano il preflight CORS, che Apps Script non gestisce.
  async function request(params, signal, postBody, timeoutMs = TIMEOUT_MS) {
    const base = getBackendUrl();
    if (!base) throw new ApiError("NOT_CONFIGURED", "L'indirizzo del backend non è configurato.");

    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const init = { signal: controller.signal, credentials: "omit", redirect: "follow" };
      if (postBody !== undefined) {
        init.method = "POST";
        init.body = JSON.stringify(postBody);
      }
      const response = await fetch(url, init);
      if (!response.ok) throw new ApiError("HTTP_" + response.status, "Il backend ha risposto con errore " + response.status + ".");
      let body;
      try {
        body = await response.json();
      } catch {
        throw new ApiError("BAD_RESPONSE", "Risposta del backend non leggibile.");
      }
      if (!body || body.ok !== true || typeof body.data !== "object" || body.data === null) {
        throw new ApiError(body?.error?.code || "BAD_RESPONSE", body?.error?.message || "Risposta del backend non valida.");
      }
      return body.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError("ABORTED", "Richiesta annullata.");
      if (error.name === "AbortError") throw new ApiError("TIMEOUT", "Il backend non ha risposto in tempo.");
      throw new ApiError("NETWORK", "Backend non raggiungibile.");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  // before: data ISO dell'ultima notizia già mostrata, per caricare la pagina successiva.
  async function fetchNews({ category = "all", limit, before, signal } = {}) {
    if (category !== "all" && !CATEGORY_PATTERN.test(category)) {
      throw new ApiError("BAD_REQUEST", "Categoria non valida.");
    }
    const data = await request({
      action: "news",
      category,
      limit: limit || window.CYBER_PULSE_CONFIG?.pageSize || 30,
      before,
    }, signal);
    if (!Array.isArray(data.items)) throw new ApiError("BAD_RESPONSE", "Risposta del backend non valida.");
    return {
      items: data.items.filter(isValidItem),
      generatedAt: data.generatedAt || null,
      lastRefreshAt: data.lastRefreshAt || null,
    };
  }

  // Prima pagina precalcolata dal backend (storie raggruppate e titoli minori), uguale per tutti e in cache.
  async function fetchFront({ category = "all", signal } = {}) {
    if (category !== "all" && !CATEGORY_PATTERN.test(category)) {
      throw new ApiError("BAD_REQUEST", "Categoria non valida.");
    }
    const data = await request({ action: "front", category }, signal);
    if (!Array.isArray(data.stories) || !Array.isArray(data.headlines)) {
      throw new ApiError("BAD_RESPONSE", "Risposta del backend non valida.");
    }
    return data;
  }

  async function fetchMusic({ kind = "dashboard", value = "", genres = [], artists = [], signal } = {}) {
    const data = await request({
      action: "music",
      kind,
      value,
      genres: genres.join(","),
      artists: artists.join(","),
    }, signal);
    if (!data.front || !Array.isArray(data.front.stories) || !Array.isArray(data.front.headlines)) {
      throw new ApiError("BAD_RESPONSE", "Il backend ha restituito un pacchetto Musica non valido.");
    }
    return data;
  }

  // Pacchetto Arena aggregato dal backend Cyber Pulse, senza chiamate dal browser a provider sportivi.
  async function fetchArenaData({
    categoryType,
    category,
    sports,
    country,
    competitionIds,
    teamIds,
    signal,
  } = {}) {
    const listParam = (values) => Array.isArray(values)
      ? values.filter((value) => typeof value === "string" && value.length > 0).join(",")
      : "";
    const data = await request({
      action: "arena",
      categoryType,
      category,
      sports: listParam(sports),
      country,
      competitions: listParam(competitionIds),
      teams: listParam(teamIds),
    }, signal);
    if (!Array.isArray(data.news) || !Array.isArray(data.statistics) || !Array.isArray(data.curiosities)
      || !Array.isArray(data.standings) || !Array.isArray(data.results)) {
      throw new ApiError("BAD_RESPONSE", "Il backend ha restituito un pacchetto Arena non valido.");
    }
    return data;
  }

  // Registra (o riconosce) l'utente sul backend. Il gettone viaggia nel corpo della richiesta, mai nell'indirizzo.
  async function registerUser(idToken, signal) {
    return request({}, signal, { action: "me", idToken });
  }

  // Compiti AI: chiave Gemini e gettone viaggiano solo nel corpo della richiesta HTTPS.
  async function runAi({ task, text, title, context, targetLanguage, apiKey, idToken, signal }) {
    const timeout = task === "frontpage" ? 150000 : TIMEOUT_MS;
    return request({}, signal, { action: "ai", task, text, title, context, targetLanguage, apiKey, idToken }, timeout);
  }

  window.CyberPulseApi = Object.freeze({ isConfigured, fetchNews, fetchFront, fetchMusic, fetchArenaData, registerUser, runAi, ApiError });
})();
