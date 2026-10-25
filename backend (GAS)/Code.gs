/**
 * Cyber Pulse - Backend (Google Apps Script)
 * File: Code.gs - configurazione, preparazione del database e API web (doGet).
 *
 * Nessuna chiave o credenziale e' scritta nel codice: i valori riservati
 * restano nelle Proprieta' dello script (PropertiesService).
 */

const CP = Object.freeze({
  SHEETS: Object.freeze({
    USERS: "Utenti",
    NEWS: "News",
    SOURCES: "Fonti_Catalogo",
    BACKUP: "Cloud_Backup",
  }),
  HEADERS: Object.freeze({
    Utenti: ["uid", "email", "level", "keywords", "createdAt", "lastSeenAt"],
    News: ["id", "categoryId", "sourceId", "sourceName", "title", "url", "summary", "imageUrl", "publishedAt", "fetchedAt"],
    Fonti_Catalogo: ["id", "categoryId", "name", "feedUrl", "siteUrl", "lang", "region", "active", "lastFetchAt", "lastStatus", "failCount"],
    Cloud_Backup: ["uid", "key", "value", "updatedAt"],
  }),
  // Colonne (base 1) che NON vanno forzate a testo: booleani e numeri.
  NON_TEXT_COLUMNS: Object.freeze({ Fonti_Catalogo: [8, 11] }),
  PROP: Object.freeze({
    SPREADSHEET_ID: "SPREADSHEET_ID",
    LAST_REFRESH: "LAST_REFRESH",
  }),
  API: Object.freeze({
    DEFAULT_LIMIT: 60,
    MAX_LIMIT: 100,
    MAX_SOURCE_FILTERS: 200,
    CACHE_SECONDS: 120,
    CACHE_MAX_CHARS: 90000,
  }),
});

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ---------- Preparazione (da eseguire una sola volta a mano) ---------- */

function setup() {
  const ss = getOrCreateSpreadsheet_();
  ensureSheets_(ss);
  const catalog = importCatalog();
  installTrigger();
  const refresh = refreshFeeds();
  const summary = {
    spreadsheetUrl: ss.getUrl(),
    catalog,
    refresh,
  };
  console.log("Setup completato: " + JSON.stringify(summary));
  return summary;
}

function getOrCreateSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(CP.PROP.SPREADSHEET_ID);
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (error) {
      console.warn("Il foglio salvato non e' piu' accessibile, ne creo uno nuovo.");
    }
  }
  const ss = SpreadsheetApp.create("Cyber Pulse - Database");
  props.setProperty(CP.PROP.SPREADSHEET_ID, ss.getId());
  return ss;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(CP.PROP.SPREADSHEET_ID);
  if (!id) throw new ApiError("NOT_CONFIGURED", "Il backend non e' ancora configurato: esegui setup().");
  return SpreadsheetApp.openById(id);
}

function ensureSheets_(ss) {
  Object.keys(CP.HEADERS).forEach((name) => {
    const headers = CP.HEADERS[name];
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sheet.setFrozenRows(1);

    // Formato "testo semplice": evita che un titolo che inizia con "=" venga letto come formula.
    const skip = CP.NON_TEXT_COLUMNS[name] || [];
    for (let column = 1; column <= headers.length; column++) {
      if (skip.indexOf(column) === -1) {
        sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
      }
    }
  });

  ss.getSheets().forEach((sheet) => {
    if (!CP.HEADERS[sheet.getName()] && ss.getSheets().length > 1) ss.deleteSheet(sheet);
  });
}

/* ---------- Catalogo fonti ---------- */

function importCatalog() {
  const sheet = getSpreadsheet_().getSheetByName(CP.SHEETS.SOURCES);
  const previous = new Map(readSources_(sheet).map((source) => [source.id, source]));
  const rows = [];

  getCatalogData_().categories.forEach((category) => {
    category.sources.forEach((s) => {
      const old = previous.get(s[0]);
      rows.push([
        s[0], category.id, s[1], s[2], s[3], s[4], s[5],
        old ? old.active : s[6], // le scelte fatte a mano sul foglio vengono mantenute
        old ? old.lastFetchAt : "",
        old ? old.lastStatus : "",
        old ? old.failCount : 0,
      ]);
    });
  });

  writeRows_(sheet, rows, CP.HEADERS.Fonti_Catalogo.length);
  return { sources: rows.length, active: rows.filter((r) => r[7] === true).length };
}

function readSources_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, CP.HEADERS.Fonti_Catalogo.length).getValues()
    .map((r, index) => ({
      row: index + 2,
      id: String(r[0]),
      categoryId: String(r[1]),
      name: String(r[2]),
      feedUrl: String(r[3]),
      siteUrl: String(r[4]),
      lang: String(r[5]),
      region: String(r[6]),
      active: r[7] === true || String(r[7]).toUpperCase() === "TRUE",
      lastFetchAt: String(r[8] || ""),
      lastStatus: String(r[9] || ""),
      failCount: Number(r[10]) || 0,
    }))
    .filter((source) => source.id);
}

// Sostituisce tutte le righe dati di un foglio, estendendolo se serve.
function writeRows_(sheet, rows, columns) {
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, columns).clearContent();
  if (rows.length === 0) return;
  const needed = rows.length + 1;
  if (sheet.getMaxRows() < needed) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
  sheet.getRange(2, 1, rows.length, columns).setValues(rows);
}

/* ---------- Utilita' ---------- */

function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)
    .map((byte) => ("0" + (byte & 0xff).toString(16)).slice(-2))
    .join("");
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- API web ---------- */

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    switch (params.action || "news") {
      case "ping":
        return json_({ ok: true, data: { service: "cyber-pulse", time: new Date().toISOString() } });
      case "news":
        return json_({ ok: true, data: getNews_(params) });
      case "arena":
        return json_({ ok: true, data: getArenaData_(params) });
      case "front":
        return json_({ ok: true, data: getFrontPage_(params) });
      case "music":
        return json_({ ok: true, data: getMusicData_(params) });
      case "status":
        return json_({ ok: true, data: getStatus_() });
      default:
        throw new ApiError("UNKNOWN_ACTION", "Azione non riconosciuta.");
    }
  } catch (error) {
    return errorResponse_(error);
  }
}

// Richieste che richiedono l'accesso: corpo JSON {action, idToken}, inviato come testo semplice.
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || "";
    if (raw.length === 0 || raw.length > AUTH.MAX_BODY_CHARS) throw new ApiError("BAD_REQUEST", "Richiesta non valida.");
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch (error) {
      throw new ApiError("BAD_REQUEST", "Richiesta non valida.");
    }
    if (!body || typeof body !== "object") throw new ApiError("BAD_REQUEST", "Richiesta non valida.");

    switch (body.action) {
      case "me":
        return json_({ ok: true, data: registerUser_(body.idToken) });
      case "ai":
        return json_({ ok: true, data: runAiTask_(body) });
      default:
        throw new ApiError("UNKNOWN_ACTION", "Azione non riconosciuta.");
    }
  } catch (error) {
    return errorResponse_(error);
  }
}

function errorResponse_(error) {
  if (error instanceof ApiError) {
    return json_({ ok: false, error: { code: error.code, message: error.message } });
  }
  // Solo il tipo di errore nel log: mai il contenuto della richiesta (puo' contenere il gettone).
  console.error(error && error.stack ? error.stack : String(error));
  return json_({ ok: false, error: { code: "INTERNAL", message: "Errore interno del server." } });
}

const ID_PATTERN_ = /^[a-z0-9][a-z0-9-]{0,63}$/;

function parseId_(value, name) {
  const text = String(value);
  if (!ID_PATTERN_.test(text)) throw new ApiError("BAD_REQUEST", "Parametro non valido: " + name + ".");
  return text;
}

function parseIdList_(value) {
  if (!value) return [];
  const ids = String(value).split(",").filter(Boolean);
  if (ids.length > CP.API.MAX_SOURCE_FILTERS) throw new ApiError("BAD_REQUEST", "Troppe fonti nel filtro.");
  return ids.map((id) => parseId_(id, "sources"));
}

function parseLimit_(value) {
  const number = parseInt(value, 10);
  if (!number || number < 1) return CP.API.DEFAULT_LIMIT;
  return Math.min(number, CP.API.MAX_LIMIT);
}

function parseBefore_(value) {
  if (!value) return "";
  const ms = Date.parse(String(value));
  if (isNaN(ms)) throw new ApiError("BAD_REQUEST", "Parametro non valido: before.");
  return new Date(ms).toISOString();
}

// Parametri: category (id o "all"), sources (id separati da virgola), limit, before (ISO, per la pagina successiva).
function getNews_(params) {
  const category = params.category && params.category !== "all" ? parseId_(params.category, "category") : "all";
  const sourceIds = parseIdList_(params.sources);
  const limit = parseLimit_(params.limit);
  const before = parseBefore_(params.before);

  const cache = CacheService.getScriptCache();
  const cacheKey = "news_" + hash_([category, sourceIds.join(","), limit, before].join("|"));
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = getSpreadsheet_().getSheetByName(CP.SHEETS.NEWS);
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, CP.HEADERS.News.length).getValues();

  // Le righe sono sempre salvate in ordine di data di pubblicazione decrescente.
  const items = [];
  for (const row of rows) {
    if (!row[0]) continue;
    if (category !== "all" && row[1] !== category) continue;
    if (sourceIds.length > 0 && sourceIds.indexOf(row[2]) === -1) continue;
    if (before && String(row[8]) >= before) continue;
    items.push({
      id: row[0],
      categoryId: row[1],
      sourceId: row[2],
      sourceName: row[3],
      title: row[4],
      url: row[5],
      summary: row[6],
      imageUrl: row[7],
      publishedAt: row[8],
    });
    if (items.length >= limit) break;
  }

  const payload = {
    items,
    count: items.length,
    generatedAt: new Date().toISOString(),
    lastRefreshAt: getLastRefresh_().at || null,
  };
  const text = JSON.stringify(payload);
  if (text.length < CP.API.CACHE_MAX_CHARS) cache.put(cacheKey, text, CP.API.CACHE_SECONDS);
  return payload;
}

function getLastRefresh_() {
  const raw = PropertiesService.getScriptProperties().getProperty(CP.PROP.LAST_REFRESH);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function getStatus_() {
  const ss = getSpreadsheet_();
  const sources = readSources_(ss.getSheetByName(CP.SHEETS.SOURCES));
  const newsSheet = ss.getSheetByName(CP.SHEETS.NEWS);
  return {
    news: Math.max(newsSheet.getLastRow() - 1, 0),
    sources: sources.length,
    activeSources: sources.filter((s) => s.active).length,
    failingSources: sources.filter((s) => s.active && s.failCount >= 3).map((s) => s.id),
    lastRefresh: getLastRefresh_(),
  };
}
