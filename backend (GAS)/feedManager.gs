/**
 * Cyber Pulse - Backend (Google Apps Script)
 * File: feedManager.gs - download, lettura (RSS 2.0, Atom, RDF) e archiviazione delle notizie.
 *
 * Le notizie sono ordinate solo per data di pubblicazione ORIGINALE.
 * Gli articoli senza una data valida vengono scartati, per non falsare l'ordine.
 */

const FEED = Object.freeze({
  BATCH_SIZE: 25,
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,
  MAX_ITEMS_PER_SOURCE: 25,
  RETENTION_DAYS: 14,
  MAX_PER_CATEGORY: 250,
  TITLE_LENGTH: 300,
  SUMMARY_LENGTH: 280,
  TRIGGER_EVERY_HOURS: 1,
  USER_AGENT: "Mozilla/5.0 (compatible; CyberPulse/1.0; +feed-reader)",
});

/* ---------- Aggiornamento ---------- */

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "refreshFeeds")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("refreshFeeds").timeBased().everyHours(FEED.TRIGGER_EVERY_HOURS).create();
}

function refreshFeeds() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("Aggiornamento gia' in corso: salto questa esecuzione.");
    return { skipped: true };
  }

  const startedAt = Date.now();
  try {
    const ss = getSpreadsheet_();
    const sourcesSheet = ss.getSheetByName(CP.SHEETS.SOURCES);
    const allSources = readSources_(sourcesSheet);
    // Le fonti lette da meno tempo vanno per prime: se il tempo finisce, il giro dopo riparte da quelle rimaste indietro.
    const active = allSources
      .filter((source) => source.active)
      .sort((a, b) => (a.lastFetchAt < b.lastFetchAt ? -1 : a.lastFetchAt > b.lastFetchAt ? 1 : 0));

    const collected = [];
    const outcome = new Map();
    let processed = 0;

    for (let i = 0; i < active.length; i += FEED.BATCH_SIZE) {
      if (Date.now() - startedAt > FEED.MAX_RUNTIME_MS) {
        console.warn("Tempo massimo raggiunto: le fonti rimanenti saranno lette alla prossima esecuzione.");
        break;
      }
      const batch = active.slice(i, i + FEED.BATCH_SIZE);
      fetchBatch_(batch).forEach((result, index) => {
        const source = batch[index];
        outcome.set(source.id, result.status);
        if (result.items) result.items.forEach((item) => collected.push(item));
      });
      processed += batch.length;
    }

    const nowIso = new Date().toISOString();
    updateSourceStatus_(sourcesSheet, allSources, outcome, nowIso);
    const added = storeNews_(ss.getSheetByName(CP.SHEETS.NEWS), collected, nowIso);

    const ok = [...outcome.values()].filter((status) => status === "OK").length;
    const summary = {
      at: nowIso,
      sourcesTried: processed,
      sourcesOk: ok,
      sourcesFailed: processed - ok,
      newItems: added,
      seconds: Math.round((Date.now() - startedAt) / 1000),
    };
    PropertiesService.getScriptProperties().setProperty(CP.PROP.LAST_REFRESH, JSON.stringify(summary));
    try { warmFrontPages_(); } catch (error) { console.warn("Prima pagina non preparata: " + error.message); }
    console.log("Aggiornamento completato: " + JSON.stringify(summary));
    return summary;
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // il blocco puo' essere gia' scaduto dopo un'esecuzione lunga
    }
  }
}

function fetchBatch_(batch) {
  const requests = batch.map((source) => ({
    url: source.feedUrl,
    method: "get",
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": FEED.USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
  }));

  let responses = null;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (error) {
    // Un indirizzo non valido fa fallire l'intero blocco: riprovo una fonte alla volta.
    responses = requests.map((request) => {
      try {
        return UrlFetchApp.fetch(request.url, request);
      } catch (innerError) {
        return null;
      }
    });
  }

  const nowMs = Date.now();
  return responses.map((response, index) => {
    if (!response) return { status: "FETCH_ERROR" };
    const code = response.getResponseCode();
    if (code !== 200) return { status: "HTTP_" + code };
    try {
      const items = parseFeed_(decodeResponse_(response), batch[index], nowMs);
      return items.length > 0 ? { status: "OK", items } : { status: "EMPTY" };
    } catch (error) {
      return { status: "PARSE_ERROR" };
    }
  });
}

function decodeResponse_(response) {
  let text = response.getContentText();
  const declared = text.match(/^\s*<\?xml[^>]*encoding=["']([^"']+)["']/i);
  // Alcuni feed (es. ANSA) dichiarano ISO-8859-1 ma inviano UTF-8: si ridecodifica solo se la lettura UTF-8 è invalida.
  if (declared && !/^utf-?8$/i.test(declared[1]) && text.indexOf("\uFFFD") !== -1) {
    try {
      text = response.getContentText(declared[1]);
    } catch (error) {
      // codifica sconosciuta: resta la lettura UTF-8
    }
  }
  return text;
}

function updateSourceStatus_(sheet, allSources, outcome, nowIso) {
  if (allSources.length === 0) return;
  const values = allSources.map((source) => {
    if (!outcome.has(source.id)) return [source.lastFetchAt, source.lastStatus, source.failCount];
    const status = outcome.get(source.id);
    return [nowIso, status, status === "OK" ? 0 : source.failCount + 1];
  });
  sheet.getRange(allSources[0].row, 9, values.length, 3).setValues(values);
}

/* ---------- Archivio notizie ---------- */

function storeNews_(sheet, fresh, nowIso) {
  const last = sheet.getLastRow();
  const existing = last < 2 ? [] : sheet.getRange(2, 1, last - 1, CP.HEADERS.News.length).getValues().filter((row) => row[0]);

  const byId = new Map();
  existing.forEach((row) => byId.set(row[0], row));
  let added = 0;
  fresh.forEach((item) => {
    if (byId.has(item.id)) return;
    added += 1;
    byId.set(item.id, [
      item.id, item.categoryId, item.sourceId, item.sourceName, item.title,
      item.url, item.summary, item.imageUrl, item.publishedAt, nowIso,
    ]);
  });

  const cutoff = new Date(Date.now() - FEED.RETENTION_DAYS * 86400000).toISOString();
  const perCategory = new Map();
  const kept = [...byId.values()]
    .filter((row) => String(row[8]) >= cutoff)
    .sort((a, b) => (String(a[8]) < String(b[8]) ? 1 : String(a[8]) > String(b[8]) ? -1 : 0))
    .filter((row) => {
      const count = (perCategory.get(row[1]) || 0) + 1;
      perCategory.set(row[1], count);
      return count <= FEED.MAX_PER_CATEGORY;
    });

  writeRows_(sheet, kept, CP.HEADERS.News.length);
  return added;
}

/* ---------- Lettura dei feed ---------- */

function sanitizeXml_(text) {
  return String(text)
    .replace(/^\uFEFF/, "")
    .replace(/^\s+/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "")
    // "&" isolati o entita' HTML non valide in XML (es. &nbsp;) diventano testo normale.
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}

function childElements_(element, name) {
  return element.getChildren().filter((child) => child.getName() === name);
}

function firstText_(element, names) {
  for (const name of names) {
    for (const child of childElements_(element, name)) {
      const text = child.getValue().trim();
      if (text) return text;
    }
  }
  return "";
}

function attr_(element, name) {
  const attribute = element.getAttribute(name);
  return attribute ? attribute.getValue() : "";
}

function parseFeed_(xmlText, source, nowMs) {
  const root = XmlService.parse(sanitizeXml_(xmlText)).getRootElement();
  const rootName = root.getName();
  let entries = [];
  let isAtom = false;

  if (rootName === "rss") {
    const channel = childElements_(root, "channel")[0];
    entries = channel ? childElements_(channel, "item") : [];
  } else if (rootName === "feed") {
    isAtom = true;
    entries = childElements_(root, "entry");
  } else if (rootName === "RDF") {
    entries = childElements_(root, "item");
  } else {
    return [];
  }

  const items = [];
  const seen = new Set();
  for (const entry of entries) {
    const item = entryToItem_(entry, isAtom, source, nowMs);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }

  return items
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, FEED.MAX_ITEMS_PER_SOURCE);
}

function entryToItem_(entry, isAtom, source, nowMs) {
  const title = truncate_(stripHtml_(firstText_(entry, ["title"])), FEED.TITLE_LENGTH);
  const url = safeHttpUrl_(resolveUrl_(isAtom ? atomLink_(entry) : firstText_(entry, ["link"]) || guidUrl_(entry), source.siteUrl));
  const publishedMs = parseDate_(firstText_(entry, ["pubDate", "published", "date", "created", "issued", "updated"]), nowMs);
  if (!title || !url || publishedMs === null) return null;

  const summaryText = truncate_(stripHtml_(firstText_(entry, ["description", "summary", "encoded", "content"])), FEED.SUMMARY_LENGTH);
  const imageUrl = safeHttpUrl_(
    resolveUrl_(mediaImage_(entry) || firstImgSrc_(firstText_(entry, ["encoded", "content", "description", "summary"])), source.siteUrl),
    true
  );

  return {
    id: hash_(normalizeUrl_(url)),
    categoryId: source.categoryId,
    sourceId: source.id,
    sourceName: source.name,
    title,
    url,
    summary: summaryText === title ? "" : summaryText,
    imageUrl,
    publishedAt: new Date(publishedMs).toISOString(),
  };
}

function atomLink_(entry) {
  const links = childElements_(entry, "link");
  const alternate = links.filter((link) => {
    const rel = attr_(link, "rel");
    return (!rel || rel === "alternate") && attr_(link, "href");
  })[0];
  const chosen = alternate || links.filter((link) => attr_(link, "href"))[0];
  return chosen ? attr_(chosen, "href") : "";
}

function guidUrl_(entry) {
  const guid = firstText_(entry, ["guid", "id"]);
  return /^https?:\/\//i.test(guid) ? guid : "";
}

function mediaImage_(entry) {
  const found = [];
  const visit = (node) => {
    node.getChildren().forEach((child) => {
      const name = child.getName();
      const type = (attr_(child, "type") || "").toLowerCase();
      const medium = (attr_(child, "medium") || "").toLowerCase();
      if (name === "group") {
        visit(child);
      } else if (name === "thumbnail" && attr_(child, "url")) {
        found.push({ url: attr_(child, "url"), rank: 1 });
      } else if (name === "content" && attr_(child, "url") && (medium === "image" || type.indexOf("image/") === 0)) {
        found.push({ url: attr_(child, "url"), rank: 0 });
      } else if (name === "enclosure" && attr_(child, "url") && type.indexOf("image/") === 0) {
        found.push({ url: attr_(child, "url"), rank: 0 });
      } else if (name === "link" && attr_(child, "rel") === "enclosure" && attr_(child, "href") && type.indexOf("image/") === 0) {
        found.push({ url: attr_(child, "href"), rank: 0 });
      }
    });
  };
  visit(entry);
  found.sort((a, b) => a.rank - b.rank);
  return found.length > 0 ? found[0].url : "";
}

/* ---------- Funzioni di supporto (non dipendono dai servizi Google) ---------- */

const HTML_ENTITIES_ = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", euro: "€",
  agrave: "à", egrave: "è", eacute: "é", igrave: "ì", ograve: "ò", ugrave: "ù",
  Agrave: "À", Egrave: "È", Eacute: "É", Igrave: "Ì", Ograve: "Ò", Ugrave: "Ù",
  laquo: "«", raquo: "»", copy: "©", deg: "°",
};

function decodeEntities_(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.charAt(0) === "#") {
      const code = entity.charAt(1).toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      try {
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      } catch (error) {
        return "";
      }
    }
    return Object.prototype.hasOwnProperty.call(HTML_ENTITIES_, entity) ? HTML_ENTITIES_[entity] : match;
  });
}

// Restituisce solo testo semplice: nessun tag HTML arriva al frontend.
function stripHtml_(html) {
  let text = String(html || "");
  for (let pass = 0; pass < 3; pass++) {
    const before = text;
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ");
    text = decodeEntities_(text);
    // Alcuni feed codificano due volte (es. "&amp;ugrave;"): si ripete finche' il testo cambia.
    if (text === before) break;
  }
  return text.replace(/\s+/g, " ").trim();
}

function truncate_(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, "") + "…";
}

const TIMEZONE_ABBREVIATIONS_ = {
  CEST: "+0200", CET: "+0100", EEST: "+0300", EET: "+0200",
  BST: "+0100", WEST: "+0100", WET: "+0000", MSK: "+0300", JST: "+0900",
};

const ITALIAN_MONTHS_ = {
  gen: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", mag: "May", giu: "Jun",
  lug: "Jul", ago: "Aug", set: "Sep", ott: "Oct", nov: "Nov", dic: "Dec",
};

// Restituisce i millisecondi della data di pubblicazione oppure null se non valida.
function parseDate_(value, nowMs) {
  if (!value) return null;
  let text = String(value).trim().replace(/\s+/g, " ");
  text = text.replace(/^[A-Za-zÀ-ÿ]{3,10},\s*/, ""); // il giorno della settimana e' superfluo (e puo' essere in italiano)
  text = text.replace(/(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{4})/, (match, day, month, year) =>
    day + " " + (ITALIAN_MONTHS_[month.slice(0, 3).toLowerCase()] || month) + " " + year);
  text = text.replace(/\b([A-Z]{3,4})$/, (match, abbreviation) => TIMEZONE_ABBREVIATIONS_[abbreviation] || match);
  let ms = Date.parse(text);
  if (isNaN(ms)) ms = Date.parse(text.replace(" ", "T"));
  if (isNaN(ms)) return null;
  if (ms > nowMs + 86400000) return null; // date nel futuro oltre un giorno: dato non affidabile
  return Math.min(ms, nowMs);
}

function firstImgSrc_(html) {
  const match = String(html || "").match(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  return match ? decodeEntities_(match[1] || match[2]) : "";
}

// Completa gli indirizzi senza protocollo ("//sito.it/...") o relativi ("/percorso") usando il sito della fonte.
function resolveUrl_(value, baseUrl) {
  const text = String(value || "").trim();
  if (/^\/\//.test(text)) return "https:" + text;
  if (/^\/(?!\/)/.test(text)) {
    const origin = String(baseUrl || "").match(/^https?:\/\/[^\/]+/i);
    return origin ? origin[0] + text : "";
  }
  return text;
}

// Accetta solo indirizzi http/https. Per le immagini forza https, per evitare contenuto misto.
function safeHttpUrl_(value, forceHttps) {
  const text = String(value || "").trim();
  if (!/^https?:\/\/[^\s<>"']+$/i.test(text)) return "";
  return forceHttps ? text.replace(/^http:\/\//i, "https://") : text;
}

function normalizeUrl_(url) {
  const [base, query = ""] = String(url).split("#")[0].split("?");
  const kept = query.split("&").filter((part) => part && !/^(utm_[^=]*|fbclid|gclid|mc_[^=]*)=/i.test(part));
  return base + (kept.length > 0 ? "?" + kept.join("&") : "");
}
