/* Cyber Pulse - Hub Libreria (Cyber Library).
 * E-reader offline: importa libri (EPUB, PDF, TXT, HTML, Markdown, FB2, DOCX, ODT, RTF, CBZ) dal dispositivo
 * o da una cartella collegata, li conserva nel browser (IndexedDB),
 * ricorda l'ultima pagina letta, gestisce i segnalibri e permette di regolare carattere, tema e interlinea.
 * Il contenuto dei libri viene mostrato in un riquadro isolato (iframe sandbox senza script, CSP restrittiva):
 * nessun file lascia il dispositivo e nessuna risorsa esterna viene caricata. */
(() => {
  "use strict";

  const DB_NAME = "cyber-pulse-library";
  const STORE = "books";
  const FOLDERS = "folders";
  const HISTORY = "history";
  const MAX_FOLDER_FILES = 3000;
  const FLAT_CHUNK = 60000;
  const FORMATS = {
    epub: "epub", txt: "txt", text: "txt", pdf: "pdf", html: "html", htm: "html", xhtml: "html", md: "md", markdown: "md",
    fb2: "fb2", docx: "docx", odt: "odt", rtf: "rtf", cbz: "cbz",
  };
  // Formati convertiti in capitoli HTML (nessun rendering dedicato).
  const FLAT = new Set(["html", "md", "fb2", "docx", "odt", "rtf"]);
  const UNSUPPORTED = {
    mobi: "MOBI/AZW non è supportato (formato proprietario): convertilo in EPUB, ad esempio con Calibre",
    azw: "MOBI/AZW non è supportato: convertilo in EPUB, ad esempio con Calibre",
    azw3: "MOBI/AZW non è supportato: convertilo in EPUB, ad esempio con Calibre",
    cbr: "CBR (archivio RAR) non è supportato: convertilo in CBZ",
    doc: "il vecchio formato DOC non è supportato: salvalo come DOCX",
    djvu: "DJVU non è supportato",
  };
  const ACCEPT = ".epub,.txt,.pdf,.html,.htm,.xhtml,.md,.markdown,.fb2,.docx,.odt,.rtf,.cbz";
  const STATE_KEY = "cyber-pulse.library.state";
  const PREFS_KEY = "cyber-pulse.library.prefs";
  const DEFAULT_RENAME_TEMPLATE = "{titolo} - {autore} - {anno} - {mese} - Vol {volume} - Cap {capitolo}";
  const DEFAULT_PREFS = { size: 19, font: "serif", theme: "auto", line: 1.6, width: 720, navigation: "pages", fit: "page", zoom: 1, renameTemplate: DEFAULT_RENAME_TEMPLATE };
  const RENAME_PROFILES = {
    book: { label: "Libro", template: DEFAULT_RENAME_TEMPLATE },
    magazine: { label: "Rivista", template: "{titolo} - {anno} - {mese} - Vol {volume}" },
    comic: { label: "Fumetto", template: "{titolo} - Vol {volume} - Cap {capitolo}" },
  };
  const COVER_SIZES = [["small", "Piccole"], ["medium", "Medie"], ["large", "Grandi"]];
  const FOLDER_COVER_WIDTHS = { small: "32px", medium: "40px", large: "64px" };
  const ISBN_PROVIDERS = { google: "Google Books", sbn: "SBN", openlibrary: "Open Library" };
  const NAME_FIELDS = [
    { key: "title", token: "titolo", label: "Titolo" },
    { key: "author", token: "autore", label: "Autore" },
    { key: "publisher", token: "editore", label: "Casa editrice" },
    { key: "year", token: "anno", label: "Anno" },
    { key: "month", token: "mese", label: "Mese" },
    { key: "series", token: "serie", label: "Serie / collana" },
    { key: "volume", token: "volume", label: "Volume", prefix: "Vol " },
    { key: "chapter", token: "capitolo", label: "Capitolo", prefix: "Cap " },
  ];
  const VIEW_KEY = "cyber-pulse.view";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const TXT_CHUNK = 40000;
  const SCRIPT_URL = document.currentScript?.src || location.href;
  const PDFJS_WASM_URL = new URL("../vendor/pdfjs/wasm/", SCRIPT_URL).href;
  const PDFJS_WORKER_URL = new URL("../vendor/pdfjs/pdf.worker.mjs", SCRIPT_URL).href;
  const OCR_URL = new URL("../vendor/tesseract/", SCRIPT_URL);
  const MIME = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", css: "text/css",
  };

  const ICONS = {
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    search: "M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79L20 22l2-2-6.5-6zM10.5 14a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
    back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    prev: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    next: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    zoomOut: "M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79L20 22l2-2-6.5-6zM10.5 14a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM8 10h5v2H8z",
    zoomIn: "M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79L20 22l2-2-6.5-6zM10.5 14a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM10 7h2v2h2v2h-2v2h-2v-2H8V9h2z",
    list: "M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16 0h2v-2h-2v2zm0-10v2h2V7h-2zm0 6h2v-2h-2v2z",
    thumbs: "M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-6h4v6zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-6h4v6z",
    ocr: "M3 5V3h6v2H5v4H3V5zm16 0h-4V3h6v6h-2V5zM5 19h4v2H3v-6h2v4zm14 0v-4h2v6h-6v-2h4zM7 8h10v2H7V8zm0 4h10v2H7v-2zm0 4h7v2H7v-2z",
    bookmark: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z",
    text: "M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z",
    full: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    book: "M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 18H6V4h12v16zM8 6h8v2H8zm0 4h8v2H8zm0 4h5v2H8z",
    preview: "M12 4.5c-5 0-9.27 3.11-11 7.5 1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    play: "M8 5v14l11-7z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    tools: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
    settings: "M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58-2-3.46-2.39.96a7.1 7.1 0 0 0-1.63-.94L14.79 3h-4l-.36 3.04c-.59.23-1.13.55-1.63.94l-2.39-.96-2 3.46 2.03 1.58a7.5 7.5 0 0 0 0 1.88L4.41 14.52l2 3.46 2.39-.96c.5.39 1.04.71 1.63.94l.36 3.04h4l.36-3.04c.59-.23 1.13-.55 1.63-.94l2.39.96 2-3.46-2.03-1.58zM12.79 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
    folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
    refresh: "M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  };

  const ui = { active: false, tab: "shelf" };
  let page;
  let titleElement;
  let descriptionElement;
  let metaElement;
  let shelfPanel;
  let bookmarksPanel;
  let readerPanel;
  let fileInput;
  let folderInput;
  let indexDialog;
  let toolsDialog;
  let librarySettingsDialog;
  let librarySettingsDirty = false;
  let frame;
  let pdfViewer;
  let pdfObserver;
  let pdfPan = null;
  const pdfPageTasks = new WeakMap();
  const visiblePdfPages = new Set();
  let readerTouchStart = 0;
  let wheelTurnAt = 0;
  let popover;
  let progressLabel;
  let readerTitle;
  let prevButton;
  let nextButton;
  let navigationSelect;
  let fitSelect;
  let fontSizeValue;
  let pdfZoomValue;
  let fontSizeControls;
  let pdfZoomControls;
  let bookmarkButton;
  let settingsButton;
  let ocrButton;
  let ocrStatus;
  let ocrDialog;
  let ocrText;
  let ocrSelection = null;
  let ocrMode = false;
  let ocrJob = null;
  let ocrScriptPromise;
  let reader = null;
  let readerStage;
  let pageControls;
  let coverUrls = [];
  let coverObserver = null;
  let coverGeneration = 0;
  const coverCallbacks = new WeakMap();
  const pdfCoverCache = new Map();
  const pdfCoverQueue = [];
  let pdfCoverBusy = false;
  let filterText = "";
  let scrollTimer = 0;
  let controlsTimer = 0;
  let pdfResizeTimer = 0;
  const CONTROLS_DELAY = 3200;
  let toolsNotice = "";
  let toolsTab = "names";

  /* ---------- Utilita' ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(path, size = 18) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    const shape = document.createElementNS(SVG_NS, "path");
    shape.setAttribute("d", path);
    shape.setAttribute("fill", "currentColor");
    svg.append(shape);
    return svg;
  }

  function button(label, path, handler, ghost = true) {
    const node = el("button", `lb-button${ghost ? " ghost" : ""}`);
    node.type = "button";
    if (path) node.append(icon(path));
    if (label) node.append(document.createTextNode(label));
    if (handler) node.addEventListener("click", handler);
    return node;
  }

  function iconButton(label, path, handler) {
    const node = el("button", "lb-icon-button");
    node.type = "button";
    node.setAttribute("aria-label", label);
    node.title = label;
    node.append(icon(path, 20));
    node.addEventListener("click", handler);
    return node;
  }

  function say(text) {
    metaElement.textContent = text;
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatSize(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function newId() {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `b${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  function decodeText(bytes) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
    return text.replace(/^\uFEFF/, "");
  }

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- Archivio locale (IndexedDB) ---------- */

  let dbPromise;

  function openDb() {
    dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 3);
      request.onupgradeneeded = () => {
        [STORE, FOLDERS].forEach((name) => {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        });
        if (!request.result.objectStoreNames.contains(HISTORY)) request.result.createObjectStore(HISTORY, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function dbRun(mode, operation, storeName = STORE) {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  const dbAll = () => dbRun("readonly", (store) => store.getAll());
  const dbGet = (id) => dbRun("readonly", (store) => store.get(id));
  const dbPut = (record) => dbRun("readwrite", (store) => store.put(record));
  const dbDelete = (id) => dbRun("readwrite", (store) => store.delete(id));
  const folderAll = () => dbRun("readonly", (store) => store.getAll(), FOLDERS);
  const folderPut = (record) => dbRun("readwrite", (store) => store.put(record), FOLDERS);
  const folderDelete = (id) => dbRun("readwrite", (store) => store.delete(id), FOLDERS);
  const historyAll = () => dbRun("readonly", (store) => store.getAll(), HISTORY);
  const historyPut = (record) => dbRun("readwrite", (store) => store.put(record), HISTORY);
  const historyDelete = (id) => dbRun("readwrite", (store) => store.delete(id), HISTORY);

  /* ---------- Stato di lettura e preferenze ---------- */

  let stateCache = null;
  let prefsCache = null;

  function readState() {
    if (!stateCache) {
      try { stateCache = JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {}; } catch { stateCache = {}; }
    }
    return stateCache;
  }

  function writeState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(readState())); } catch { /* storage non disponibile */ }
  }

  function bookState(id) {
    const all = readState();
    all[id] ||= { ch: 0, frac: 0, pct: 0, updated: 0, bookmarks: [] };
    if (!Array.isArray(all[id].bookmarks)) all[id].bookmarks = [];
    return all[id];
  }

  function migrateMonthFormat(saved) {
    if (saved.monthNumberDefaultApplied === true) return saved;
    const numericTemplate = (value) => typeof value === "string" ? value.replace(/\{meseNome\}/g, "{mese}") : value;
    const migrated = { ...saved, monthNumberDefaultApplied: true };
    if (typeof saved.renameTemplate === "string") migrated.renameTemplate = numericTemplate(saved.renameTemplate);
    if (saved.renameProfiles && typeof saved.renameProfiles === "object" && !Array.isArray(saved.renameProfiles)) {
      migrated.renameProfiles = { ...saved.renameProfiles };
      for (const key of Object.keys(RENAME_PROFILES)) {
        const profile = saved.renameProfiles[key];
        if (profile && typeof profile === "object" && !Array.isArray(profile)) {
          migrated.renameProfiles[key] = { ...profile, monthFormat: "number" };
          if (typeof profile.template === "string") migrated.renameProfiles[key].template = numericTemplate(profile.template);
        }
      }
    }
    return migrated;
  }

  function prefs() {
    if (!prefsCache) {
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
        const migrated = migrateMonthFormat(saved);
        if (migrated !== saved) {
          try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(migrated));
          } catch (error) {
            console.error("Impossibile salvare il formato numerico del mese nelle preferenze della Libreria.", error);
          }
          saved = migrated;
        }
      } catch (error) {
        console.error("Impossibile leggere le preferenze della Libreria.", error);
      }
      prefsCache = { ...DEFAULT_PREFS, ...saved };
    }
    return prefsCache;
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache)); } catch { /* storage non disponibile */ }
  }

  /* ---------- Lettura degli archivi ZIP (EPUB) ---------- */

  async function openZip(blob) {
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let end = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error("archivio non valido");
    const count = view.getUint16(end + 10, true);
    let pointer = view.getUint32(end + 16, true);
    const entries = new Map();
    const decoder = new TextDecoder();
    for (let n = 0; n < count; n += 1) {
      if (view.getUint32(pointer, true) !== 0x02014b50) break;
      const method = view.getUint16(pointer + 10, true);
      const size = view.getUint32(pointer + 20, true);
      const nameLength = view.getUint16(pointer + 28, true);
      const extraLength = view.getUint16(pointer + 30, true);
      const commentLength = view.getUint16(pointer + 32, true);
      const offset = view.getUint32(pointer + 42, true);
      entries.set(decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength)), { method, size, offset });
      pointer += 46 + nameLength + extraLength + commentLength;
    }
    const lowerNames = new Map([...entries.keys()].map((name) => [name.toLowerCase(), name]));

    function lookup(name) {
      if (entries.has(name)) return name;
      return lowerNames.get(String(name).toLowerCase()) || null;
    }

    async function read(name) {
      const real = lookup(name);
      if (!real) return null;
      const entry = entries.get(real);
      const nameLength = view.getUint16(entry.offset + 26, true);
      const extraLength = view.getUint16(entry.offset + 28, true);
      const start = entry.offset + 30 + nameLength + extraLength;
      const data = bytes.subarray(start, start + entry.size);
      if (entry.method === 0) return data;
      if (entry.method !== 8) throw new Error("compressione non supportata");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    return { lookup, read, names: [...entries.keys()] };
  }

  function resolvePath(base, href) {
    const clean = String(href).split("#")[0].split("?")[0];
    let decoded = clean;
    try { decoded = decodeURIComponent(clean); } catch { /* percentuale non valida */ }
    if (!decoded) return base;
    const parts = decoded.startsWith("/") ? [] : base.split("/").slice(0, -1);
    decoded.split("/").forEach((segment) => {
      if (!segment || segment === ".") return;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    });
    return parts.join("/");
  }

  function parseXml(text) {
    return new DOMParser().parseFromString(text.replace(/^\uFEFF/, ""), "application/xml");
  }

  async function parseEpub(blob) {
    const zip = await openZip(blob);
    const readText = async (name) => {
      const bytes = await zip.read(name);
      return bytes ? decodeText(bytes) : null;
    };
    const container = await readText("META-INF/container.xml");
    if (!container) throw new Error("non è un EPUB valido");
    const rootPath = parseXml(container).getElementsByTagNameNS("*", "rootfile")[0]?.getAttribute("full-path");
    const opfText = rootPath ? await readText(rootPath) : null;
    if (!opfText) throw new Error("indice del libro mancante");
    const opf = parseXml(opfText);
    const meta = (tag) => opf.getElementsByTagNameNS("*", tag)[0]?.textContent.trim() || "";

    const manifest = new Map();
    [...opf.getElementsByTagNameNS("*", "item")].forEach((item) => {
      manifest.set(item.getAttribute("id"), {
        path: resolvePath(rootPath, item.getAttribute("href") || ""),
        type: item.getAttribute("media-type") || "",
        props: item.getAttribute("properties") || "",
      });
    });
    const spine = [...opf.getElementsByTagNameNS("*", "itemref")]
      .map((ref) => manifest.get(ref.getAttribute("idref")))
      .filter((item) => item && /html|xml/i.test(item.type) && !/ncx/i.test(item.type))
      .map((item) => zip.lookup(item.path) || item.path);
    if (!spine.length) throw new Error("il libro non contiene capitoli");

    let coverPath = "";
    const coverMeta = [...opf.getElementsByTagNameNS("*", "meta")].find((node) => node.getAttribute("name") === "cover");
    if (coverMeta && manifest.has(coverMeta.getAttribute("content"))) coverPath = manifest.get(coverMeta.getAttribute("content")).path;
    if (!coverPath) {
      const found = [...manifest.values()].find((item) => /cover-image/.test(item.props));
      if (found) coverPath = found.path;
    }
    if (!coverPath) {
      const found = [...manifest.values()].find((item) => /^image\/(?!svg\+xml)/i.test(item.type));
      if (found) coverPath = found.path;
    }

    const toc = [];
    const indexOfPath = (path) => spine.indexOf(zip.lookup(path) || path);
    const navItem = [...manifest.values()].find((item) => /(^|\s)nav(\s|$)/.test(item.props));
    if (navItem) {
      const text = await readText(navItem.path);
      if (text) {
        const doc = new DOMParser().parseFromString(text, "text/html");
        const navs = [...doc.querySelectorAll("nav")];
        const nav = navs.find((node) => (node.getAttribute("epub:type") || "").includes("toc")) || navs[0];
        nav?.querySelectorAll("a[href]").forEach((link) => {
          const href = link.getAttribute("href");
          const index = indexOfPath(resolvePath(navItem.path, href));
          const label = link.textContent.replace(/\s+/g, " ").trim();
          if (index >= 0 && label) toc.push({ label, index, hash: href.includes("#") ? href.slice(href.indexOf("#") + 1) : "" });
        });
      }
    }
    if (!toc.length) {
      const ncx = [...manifest.values()].find((item) => /ncx/i.test(item.type));
      const text = ncx ? await readText(ncx.path) : null;
      if (text) {
        [...parseXml(text).getElementsByTagNameNS("*", "navPoint")].forEach((point) => {
          const label = point.getElementsByTagNameNS("*", "text")[0]?.textContent.replace(/\s+/g, " ").trim();
          const src = point.getElementsByTagNameNS("*", "content")[0]?.getAttribute("src");
          if (!label || !src) return;
          const index = indexOfPath(resolvePath(ncx.path, src));
          if (index >= 0) toc.push({ label, index, hash: src.includes("#") ? src.slice(src.indexOf("#") + 1) : "" });
        });
      }
    }

    let coverBlob = null;
    if (coverPath) {
      const bytes = await zip.read(coverPath);
      if (bytes) coverBlob = new Blob([bytes], { type: MIME[coverPath.split(".").pop().toLowerCase()] || "image/jpeg" });
    }
    const dates = [...opf.getElementsByTagNameNS("*", "date")];
    const published = dates.find((node) => /publi/i.test(node.getAttribute("opf:event") || "")) || dates[0];
    const year = yearOf(published?.textContent);
    return { zip, spine, toc, title: meta("title"), author: meta("creator"), publisher: meta("publisher"), year, coverBlob };
  }

  async function makeThumb(blob) {
    try {
      const bitmap = await createImageBitmap(blob);
      const width = 240;
      const height = Math.round((bitmap.height * width) / bitmap.width);
      if (!height || height > width * 2.2) return null;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    } catch {
      return null;
    }
  }

  /* ---------- Altri formati: conversione in capitoli HTML ---------- */

  const BLOCKED_TAGS = "script, iframe, object, embed, form, base, link, meta, audio, video, input, button, textarea, select, noscript, style, svg, canvas";
  const INLINE_TAGS = new Set(["P", "SPAN", "EM", "STRONG", "A", "CODE", "I", "B", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "S", "SUB", "SUP"]);

  function formatOf(name) {
    return FORMATS[(String(name).match(/\.([^.]+)$/) || [])[1]?.toLowerCase()] || null;
  }

  function newDoc() {
    return document.implementation.createHTMLDocument("");
  }

  function decodeXml(bytes) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
    const label = (head.match(/encoding=["']([\w-]+)["']/i) || [])[1];
    if (label && !/^utf-?8$/i.test(label)) {
      try { return new TextDecoder(label).decode(bytes).replace(/^\uFEFF/, ""); } catch { /* codifica sconosciuta */ }
    }
    return decodeText(bytes);
  }

  function toDataUrl(bytes, type) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(new Blob([bytes], { type }));
    });
  }

  // Rimuove tutto cio' che non e' contenuto: script, moduli, stili, risorse esterne e gestori di eventi.
  function sanitizeTree(root) {
    root.querySelectorAll(BLOCKED_TAGS).forEach((node) => node.remove());
    root.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name) || attribute.name === "style" || attribute.name === "srcset") node.removeAttribute(attribute.name);
      });
    });
    root.querySelectorAll("img").forEach((node) => {
      if (!/^data:image\//i.test(node.getAttribute("src") || "")) node.remove();
    });
    root.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      link.removeAttribute("href");
      if (/^(https?:|mailto:)/i.test(href)) link.setAttribute("data-ext", href);
      else if (href.startsWith("#") && href.length > 1) link.setAttribute("data-local", href.slice(1));
      link.setAttribute("href", "#");
    });
  }

  // Divide un albero in capitoli di dimensione ragionevole, usando i titoli per l'indice.
  function paginate(root) {
    let container = root;
    while (container.children.length === 1 && /^(DIV|SECTION|MAIN|ARTICLE|BODY)$/.test(container.children[0].tagName)
      && !(container.textContent.length - container.children[0].textContent.length > 20)) {
      container = container.children[0];
    }
    const chapters = [];
    const toc = [];
    let buffer = [];
    let length = 0;
    let counter = 0;
    const flush = () => {
      if (buffer.length) chapters.push(buffer.join(""));
      buffer = [];
      length = 0;
    };
    container.childNodes.forEach((node) => {
      const text = node.textContent || "";
      const isElement = node.nodeType === 1;
      const heading = isElement && /^H[1-3]$/.test(node.tagName) && text.trim();
      if (((heading || (isElement && node.tagName === "SECTION")) && length > 3000) || length > FLAT_CHUNK) flush();
      const headings = isElement ? [...(heading ? [node] : []), ...node.querySelectorAll("h1, h2, h3")] : [];
      headings.forEach((item) => {
        if (!item.textContent.trim()) return;
        counter += 1;
        item.id = `cp-h${counter}`;
        toc.push({ label: item.textContent.trim().replace(/\s+/g, " ").slice(0, 90), index: chapters.length, hash: item.id });
      });
      if (isElement) buffer.push(node.outerHTML);
      else if (text.trim()) buffer.push(`<p>${escapeHtml(text.trim())}</p>`);
      length += text.length;
    });
    flush();
    if (!chapters.length) chapters.push("<p></p>");
    if (!toc.length && chapters.length > 1) chapters.forEach((_, i) => toc.push({ label: `Parte ${i + 1}`, index: i, hash: "" }));
    return { chapters, toc };
  }

  function markdownToHtml(source) {
    const inline = (raw) => escapeHtml(raw)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2">$1</a>')
      .replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>")
      .replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>")
      .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>");
    const out = [];
    let paragraph = [];
    let list = null;
    let quote = [];
    let fence = null;
    const flushParagraph = () => { if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`); paragraph = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`); list = null; };
    const flushQuote = () => { if (quote.length) out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`); quote = []; };
    const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };
    source.replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
      if (fence) {
        if (/^\s*```/.test(line)) { out.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`); fence = null; } else fence.push(line);
        return;
      }
      if (/^\s*```/.test(line)) { flushAll(); fence = []; return; }
      const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      const item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
      const quoted = line.match(/^\s*>\s?(.*)$/);
      if (!line.trim()) flushAll();
      else if (heading) { flushAll(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); }
      else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); out.push("<hr>"); }
      else if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); }
      else if (item) {
        flushParagraph();
        flushQuote();
        const tag = /\d/.test(item[1]) ? "ol" : "ul";
        if (list && list.tag !== tag) flushList();
        list ||= { tag, items: [] };
        list.items.push(item[2]);
      } else { flushList(); flushQuote(); paragraph.push(line.trim()); }
    });
    if (fence) out.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
    flushAll();
    return out.join("\n");
  }

  async function parseHtmlBook(blob, markdown) {
    const text = decodeText(new Uint8Array(await blob.arrayBuffer()));
    const doc = new DOMParser().parseFromString(markdown ? `<body>${markdownToHtml(text)}</body>` : text, "text/html");
    const title = markdown ? (text.match(/^\s*#\s+(.+)$/m) || [])[1]?.trim() : doc.title?.trim();
    const author = markdown ? "" : doc.querySelector("meta[name=author]")?.getAttribute("content") || "";
    sanitizeTree(doc.body);
    if (!doc.body.textContent.trim() && !doc.body.querySelector("img")) throw new Error("il documento è vuoto");
    return { ...paginate(doc.body), title: title || "", author };
  }

  async function parseFb2(blob) {
    const xml = parseXml(decodeXml(new Uint8Array(await blob.arrayBuffer())));
    if (xml.getElementsByTagName("parsererror").length || !xml.getElementsByTagName("FictionBook").length) throw new Error("non è un FB2 valido");
    const info = xml.getElementsByTagName("title-info")[0];
    const textOf = (parent, name) => parent?.getElementsByTagName(name)[0]?.textContent.trim() || "";
    const author = info?.getElementsByTagName("author")[0];
    const binaries = new Map();
    [...xml.getElementsByTagName("binary")].forEach((node) => {
      const type = node.getAttribute("content-type") || "image/jpeg";
      if (/^image\/(png|jpe?g|gif|webp)$/i.test(type)) binaries.set(node.getAttribute("id"), `data:${type};base64,${node.textContent.replace(/\s+/g, "")}`);
    });
    const hrefOf = (node) => (([...node.attributes].find((a) => a.name.endsWith("href")) || {}).value || "").replace(/^#/, "");
    const doc = newDoc();
    const render = (node, parent, depth, inline) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) {
          if (inline || child.nodeValue.trim()) parent.append(child.nodeValue);
          return;
        }
        if (child.nodeType !== 1) return;
        const name = child.localName;
        const wrap = (tag, isInline = true, target = parent) => {
          const created = doc.createElement(tag);
          render(child, created, depth, isInline);
          target.append(created);
        };
        if (name === "section") {
          const created = doc.createElement("section");
          render(child, created, depth + 1, false);
          parent.append(created);
        }
        else if (name === "title") {
          const heading = doc.createElement(`h${Math.min(depth + 1, 4)}`);
          heading.textContent = child.textContent.trim().replace(/\s+/g, " ");
          parent.append(heading);
        } else if (name === "subtitle") {
          const heading = doc.createElement("h4");
          heading.textContent = child.textContent.trim();
          parent.append(heading);
        } else if (name === "p" || name === "v") wrap("p");
        else if (name === "epigraph" || name === "cite") wrap("blockquote", false);
        else if (name === "poem" || name === "stanza") wrap("div", false);
        else if (name === "text-author") wrap("p");
        else if (name === "emphasis") wrap("em");
        else if (name === "strong") wrap("strong");
        else if (name === "strikethrough") wrap("s");
        else if (name === "sub" || name === "sup" || name === "code") wrap(name);
        else if (name === "empty-line") parent.append(doc.createElement("br"));
        else if (name === "image") {
          const url = binaries.get(hrefOf(child));
          if (url) {
            const img = doc.createElement("img");
            img.setAttribute("src", url);
            parent.append(img);
          }
        } else if (name === "table") wrap("table", false);
        else if (name === "tr") wrap("tr", false);
        else if (name === "td" || name === "th") wrap(name);
        else render(child, parent, depth, inline);
      });
    };
    const container = doc.createElement("div");
    [...xml.getElementsByTagName("body")].forEach((body) => {
      if (body.getAttribute("name") === "notes") {
        const heading = doc.createElement("h1");
        heading.textContent = "Note";
        container.append(heading);
      }
      const holder = doc.createElement("div");
      render(body, holder, 1, false);
      container.append(holder);
    });
    sanitizeTree(container);
    const coverId = hrefOf(info?.getElementsByTagName("coverpage")[0]?.getElementsByTagName("image")[0] || doc.createElement("i"));
    let coverBlob = null;
    const coverBinary = [...xml.getElementsByTagName("binary")].find((node) => node.getAttribute("id") === coverId);
    if (coverBinary) {
      const bytes = Uint8Array.from(atob(coverBinary.textContent.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      coverBlob = new Blob([bytes], { type: coverBinary.getAttribute("content-type") || "image/jpeg" });
    }
    return {
      ...paginate(container),
      title: textOf(info, "book-title"),
      year: yearOf(xml.getElementsByTagName("publish-info")[0]?.getElementsByTagName("year")[0]?.textContent
        || info?.getElementsByTagName("date")[0]?.getAttribute("value") || textOf(info, "date")),
      author: author ? ["first-name", "middle-name", "last-name"].map((tag) => textOf(author, tag)).filter(Boolean).join(" ") : "",
      coverBlob,
    };
  }

  function yearOf(value) {
    const match = String(value || "").match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    return match ? match[1] : "";
  }

  // Titolo e autore dal dizionario Info del PDF, quando sono in chiaro (ricerca sommaria sul primo e ultimo tratto del file).
  async function parsePdfMeta(blob) {
    const size = blob.size;
    const slices = [blob.slice(0, 262144), size > 524288 ? blob.slice(size - 262144) : null].filter(Boolean);
    const text = (await Promise.all(slices.map((part) => part.arrayBuffer()))).map((buffer) => new TextDecoder("latin1").decode(buffer)).join("\n");
    // Con /Encrypt anche titolo e autore sono cifrati: non sono leggibili senza password.
    if (/\/Encrypt\s/.test(text)) return { title: "", author: "", year: "" };
    const field = (name) => {
      const match = new RegExp(`/${name}\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]+>)`).exec(text);
      if (!match) return "";
      let raw = match[1];
      let bytes;
      if (raw[0] === "<") {
        const hex = raw.slice(1, -1).replace(/\s+/g, "");
        bytes = Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16));
      } else {
        raw = raw.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, code) => {
          if (/^[0-7]+$/.test(code)) return String.fromCharCode(parseInt(code, 8));
          return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[code] || code;
        });
        bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0) & 255);
      }
      const value = bytes[0] === 0xfe && bytes[1] === 0xff ? new TextDecoder("utf-16be").decode(bytes.subarray(2)) : new TextDecoder("windows-1252").decode(bytes);
      return value.replace(/\s+/g, " ").trim();
    };
    const title = field("Title");
    const author = field("Author");
    const useless = /^(untitled|microsoft word|document\d*|\w*\.(docx?|pdf|indd|qxd)|)$/i;
    return {
      title: useless.test(title) || isGarbled(title) ? "" : title,
      author: /^(unknown|admin|user|)$/i.test(author) || isGarbled(author) ? "" : author,
      year: "",
    };
  }

  async function parseDocx(blob) {
    const zip = await openZip(blob);
    const bytes = await zip.read("word/document.xml");
    if (!bytes) throw new Error("non è un DOCX valido");
    const xml = parseXml(decodeText(bytes));
    const relsBytes = await zip.read("word/_rels/document.xml.rels");
    const rels = new Map();
    if (relsBytes) [...parseXml(decodeText(relsBytes)).getElementsByTagName("Relationship")].forEach((rel) => rels.set(rel.getAttribute("Id"), rel.getAttribute("Target")));
    const doc = newDoc();
    const flag = (props, tag) => {
      const node = props?.getElementsByTagName(tag)[0];
      return Boolean(node) && !/^(0|false|none)$/i.test(node.getAttribute("w:val") || "");
    };
    const image = async (run) => {
      const blip = run.getElementsByTagName("a:blip")[0];
      const target = blip && rels.get(blip.getAttribute("r:embed"));
      const mime = target && MIME[target.split(".").pop().toLowerCase()];
      if (!mime || !mime.startsWith("image/") || mime === "image/svg+xml") return null;
      const data = await zip.read(resolvePath("word/document.xml", target));
      const url = data && await toDataUrl(data, mime);
      if (!url) return null;
      const img = doc.createElement("img");
      img.setAttribute("src", url);
      return img;
    };
    const paragraph = async (node) => {
      const style = node.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") || "";
      const level = style.match(/^(?:heading|titolo)\s?(\d)$/i);
      const tag = level ? `h${Math.min(Number(level[1]), 4)}` : /^(title|titolo)$/i.test(style) ? "h1" : "p";
      const element = doc.createElement(tag);
      if (tag === "p" && node.getElementsByTagName("w:numPr")[0]) element.append("• ");
      for (const run of node.getElementsByTagName("w:r")) {
        const props = run.getElementsByTagName("w:rPr")[0];
        const holder = doc.createElement("span");
        for (const part of run.childNodes) {
          if (part.nodeName === "w:t") holder.append(part.textContent);
          else if (part.nodeName === "w:tab") holder.append("\t");
          else if (part.nodeName === "w:br" || part.nodeName === "w:cr") holder.append(doc.createElement("br"));
          else if (part.nodeName === "w:drawing" || part.nodeName === "w:pict") {
            const img = await image(part);
            if (img) holder.append(img);
          }
        }
        let outer = holder;
        if (flag(props, "w:b")) { const wrap = doc.createElement("strong"); wrap.append(outer); outer = wrap; }
        if (flag(props, "w:i")) { const wrap = doc.createElement("em"); wrap.append(outer); outer = wrap; }
        element.append(outer);
      }
      return element.textContent.trim() || element.querySelector("img") ? element : null;
    };
    const blocks = async (parent, target) => {
      for (const child of parent.children) {
        if (child.nodeName === "w:p") {
          const created = await paragraph(child);
          if (created) target.append(created);
        } else if (child.nodeName === "w:tbl") {
          const table = doc.createElement("table");
          for (const row of child.children) {
            if (row.nodeName !== "w:tr") continue;
            const tr = doc.createElement("tr");
            for (const cell of row.children) {
              if (cell.nodeName !== "w:tc") continue;
              const td = doc.createElement("td");
              await blocks(cell, td);
              tr.append(td);
            }
            table.append(tr);
          }
          target.append(table);
        } else if (child.nodeName === "w:sdt") {
          const content = child.getElementsByTagName("w:sdtContent")[0];
          if (content) await blocks(content, target);
        }
      }
    };
    const container = doc.createElement("div");
    await blocks(xml.getElementsByTagName("w:body")[0], container);
    sanitizeTree(container);
    if (!container.textContent.trim() && !container.querySelector("img")) throw new Error("il documento è vuoto");
    const coreBytes = await zip.read("docProps/core.xml");
    const core = coreBytes ? parseXml(decodeText(coreBytes)) : null;
    return {
      ...paginate(container),
      title: core?.getElementsByTagName("dc:title")[0]?.textContent.trim() || "",
      author: core?.getElementsByTagName("dc:creator")[0]?.textContent.trim() || "",
    };
  }

  async function parseOdt(blob) {
    const zip = await openZip(blob);
    const bytes = await zip.read("content.xml");
    if (!bytes) throw new Error("non è un ODT valido");
    const xml = parseXml(decodeText(bytes));
    const doc = newDoc();
    const styles = new Map();
    [...xml.getElementsByTagName("style:style")].forEach((style) => {
      const props = style.getElementsByTagName("style:text-properties")[0];
      if (props) styles.set(style.getAttribute("style:name"), { b: props.getAttribute("fo:font-weight") === "bold", i: props.getAttribute("fo:font-style") === "italic" });
    });
    const render = async (node, parent, inline) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (inline || child.nodeValue.trim()) parent.append(child.nodeValue);
          continue;
        }
        if (child.nodeType !== 1) continue;
        const name = child.nodeName;
        const wrap = async (tag, isInline, source = child) => {
          const created = doc.createElement(tag);
          await render(source, created, isInline);
          parent.append(created);
        };
        if (name === "text:h") await wrap(`h${Math.min(Number(child.getAttribute("text:outline-level")) || 1, 4)}`, true);
        else if (name === "text:p") await wrap("p", true);
        else if (name === "text:list") await wrap("ul", false);
        else if (name === "text:list-item") await wrap("li", false);
        else if (name === "text:span") {
          const look = styles.get(child.getAttribute("text:style-name"));
          const created = doc.createElement(look?.b ? "strong" : look?.i ? "em" : "span");
          await render(child, created, true);
          parent.append(created);
        } else if (name === "text:s") parent.append(" ".repeat(Number(child.getAttribute("text:c")) || 1));
        else if (name === "text:tab") parent.append("\t");
        else if (name === "text:line-break") parent.append(doc.createElement("br"));
        else if (name === "table:table") await wrap("table", false);
        else if (name === "table:table-row") await wrap("tr", false);
        else if (name === "table:table-cell") await wrap("td", false);
        else if (name === "draw:image") {
          const href = child.getAttribute("xlink:href") || "";
          const mime = MIME[href.split(".").pop().toLowerCase()];
          const data = mime && mime.startsWith("image/") && mime !== "image/svg+xml" ? await zip.read(href) : null;
          const url = data && await toDataUrl(data, mime);
          if (url) {
            const img = doc.createElement("img");
            img.setAttribute("src", url);
            parent.append(img);
          }
        } else if (name === "text:a") await render(child, parent, true);
        else await render(child, parent, inline);
      }
    };
    const container = doc.createElement("div");
    await render(xml.getElementsByTagName("office:text")[0] || xml.documentElement, container, false);
    sanitizeTree(container);
    if (!container.textContent.trim() && !container.querySelector("img")) throw new Error("il documento è vuoto");
    const metaBytes = await zip.read("meta.xml");
    const meta = metaBytes ? parseXml(decodeText(metaBytes)) : null;
    return {
      ...paginate(container),
      title: meta?.getElementsByTagName("dc:title")[0]?.textContent.trim() || "",
      author: meta?.getElementsByTagName("dc:creator")[0]?.textContent.trim() || "",
    };
  }

  function rtfToText(source) {
    if (!/^\s*\{\\rtf/.test(source)) throw new Error("non è un RTF valido");
    const skipWords = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr", "footnote", "fldinst", "themedata", "colorschememapping", "datastore", "latentstyles", "listtable", "listoverridetable", "generator", "object", "xmlnstbl", "rsidtbl", "private"]);
    const symbols = { emdash: "—", endash: "–", lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”", bullet: "•", tab: "\t", line: "\n", par: "\n\n", sect: "\n\n", page: "\n\n" };
    const stack = [];
    let text = "";
    let depth = 0;
    let skipFrom = 0;
    let unicodeSkip = 1;
    let i = 0;
    while (i < source.length) {
      const char = source[i];
      if (char === "{") {
        depth += 1;
        stack.push(unicodeSkip);
        i += 1;
        if (!skipFrom && source.startsWith("\\*", i)) skipFrom = depth;
      } else if (char === "}") {
        if (skipFrom && depth === skipFrom) skipFrom = 0;
        depth = Math.max(0, depth - 1);
        unicodeSkip = stack.pop() ?? 1;
        i += 1;
      } else if (char === "\\") {
        const next = source[i + 1];
        if (next === "'") {
          if (!skipFrom) text += String.fromCharCode(parseInt(source.substr(i + 2, 2), 16) || 63);
          i += 4;
        } else if (/[a-zA-Z]/.test(next)) {
          const match = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i, i + 40));
          const word = match[1];
          const param = match[2] === undefined ? null : Number(match[2]);
          i += match[0].length;
          if (word === "uc" && param !== null) unicodeSkip = param;
          else if (skipFrom) continue;
          else if (skipWords.has(word)) skipFrom = depth;
          else if (word === "u" && param !== null) {
            text += String.fromCharCode(param < 0 ? param + 65536 : param);
            for (let k = 0; k < unicodeSkip; k += 1) i += source.startsWith("\\'", i) ? 4 : 1;
          } else if (symbols[word]) text += symbols[word];
        } else {
          if (!skipFrom) {
            if ("\\{}".includes(next)) text += next;
            else if (next === "~") text += "\u00a0";
          }
          i += 2;
        }
      } else {
        if (!skipFrom && char !== "\n" && char !== "\r") text += char;
        i += 1;
      }
    }
    return text;
  }

  async function parseRtf(blob) {
    const text = rtfToText(new TextDecoder("latin1").decode(await blob.arrayBuffer())).trim();
    if (!text) throw new Error("il documento è vuoto");
    const doc = newDoc();
    const container = doc.createElement("div");
    text.split(/\n{2,}/).filter((block) => block.trim()).forEach((block) => {
      const p = doc.createElement("p");
      block.split("\n").forEach((line, index) => {
        if (index) p.append(doc.createElement("br"));
        p.append(line);
      });
      container.append(p);
    });
    return { ...paginate(container), title: "", author: "" };
  }

  async function parseCbz(blob) {
    const zip = await openZip(blob);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const pages = zip.names
      .filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name) && !/(^|\/)(__MACOSX|\.)/.test(name))
      .sort((a, b) => collator.compare(a, b));
    if (!pages.length) throw new Error("nessuna immagine trovata nell'archivio");
    const first = await zip.read(pages[0]);
    return { zip, pages, coverBlob: new Blob([first], { type: mimeFor(pages[0]) }), title: "", author: "" };
  }

  // Interpreta un file nei formati "piatti" (HTML, Markdown, FB2, DOCX, ODT, RTF) o CBZ.
  async function parseOther(type, blob) {
    if (type === "html") return parseHtmlBook(blob, false);
    if (type === "md") return parseHtmlBook(blob, true);
    if (type === "fb2") return parseFb2(blob);
    if (type === "docx") return parseDocx(blob);
    if (type === "odt") return parseOdt(blob);
    if (type === "rtf") return parseRtf(blob);
    return parseCbz(blob);
  }

  /* ---------- Importazione ---------- */

  async function buildRecord(file, extension) {
    const base = file.name.replace(/\.[^.]+$/, "");
    const record = { id: newId(), type: extension, name: file.name, size: file.size, added: Date.now(), title: base, author: "", year: "", cover: null, file };
    if (extension === "epub") {
      const book = await parseEpub(file);
      record.title = book.title || base;
      record.author = book.author;
      record.publisher = book.publisher || "";
      record.year = book.year || "";
      if (book.coverBlob) record.cover = await makeThumb(book.coverBlob);
    } else if (extension === "pdf") {
      record.file = new Blob([file], { type: "application/pdf" });
      try {
        const book = await parsePdfMeta(file);
        record.title = book.title || base;
        record.author = book.author;
      } catch { /* metadati non leggibili */ }
    } else if (FLAT.has(extension) || extension === "cbz") {
      const book = await parseOther(extension, file);
      record.title = book.title || base;
      record.author = book.author || "";
      record.year = book.year || "";
      if (book.coverBlob) record.cover = await makeThumb(book.coverBlob);
    }
    if (isGarbled(record.title)) record.title = base;
    if (isGarbled(record.author)) record.author = "";
    return record;
  }

  async function importFiles(files, options = {}) {
    const list = [...files];
    if (!list.length) return;
    const existing = await dbAll();
    const problems = [];
    let added = 0;
    for (const file of list) {
      const extension = formatOf(file.name);
      if (!extension) {
        if (options.quiet) continue;
        const raw = (file.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
        problems.push(`${file.name}: ${UNSUPPORTED[raw] || "formato non supportato"}`);
        continue;
      }
      if (existing.some((book) => (book.name === file.name || book.origName === file.name) && book.size === file.size)) {
        if (!options.quiet) problems.push(`${file.name}: già presente nella libreria`);
        continue;
      }
      say(`Importo «${file.name}»…`);
      try {
        const record = await buildRecord(file, extension);
        await dbPut(record);
        existing.push(record);
        added += 1;
      } catch (error) {
        const full = error?.name === "QuotaExceededError";
        problems.push(`${file.name}: ${full ? "spazio insufficiente sul dispositivo" : error.message || "file non leggibile"}`);
      }
    }
    if (added) navigator.storage?.persist?.().catch(() => {});
    say([added ? `${added} ${added === 1 ? "libro aggiunto" : "libri aggiunti"}.` : "", ...problems.slice(0, 4), problems.length > 4 ? `…e altri ${problems.length - 4} avvisi.` : ""].filter(Boolean).join(" "));
    if (ui.tab === "shelf") renderShelf();
  }

  /* ---------- Cartelle collegate ---------- */

  async function ensurePermission(handle, ask, mode = "read") {
    const options = { mode };
    try {
      if ((await handle.queryPermission(options)) === "granted") return true;
      if (!ask) return false;
      return (await handle.requestPermission(options)) === "granted";
    } catch {
      return false;
    }
  }

  async function requireWritePermission(handle) {
    try {
      if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return;
      if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") return;
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        throw new Error("il browser ha negato la scrittura: autorizza prima la rinomina dalla riga della cartella collegata");
      }
      if (error?.name === "SecurityError") {
        throw new Error("il browser non consente la scrittura in questa cartella; ricollegala da un contesto sicuro (HTTPS o localhost)");
      }
      throw new Error(`permesso di scrittura non disponibile: ${error.message || error.name || "errore del browser"}`);
    }
    throw new Error("permesso di scrittura negato: premi «Permetti rinomina» nella cartella collegata e riprova");
  }

  async function walkFolder(directory, prefix, found, depth) {
    for await (const [name, handle] of directory.entries()) {
      if (found.length >= MAX_FOLDER_FILES) return;
      if (name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        if (depth < 8) await walkFolder(handle, `${prefix}${name}/`, found, depth + 1);
      } else if (formatOf(name)) {
        found.push({ handle, path: `${prefix}${name}`, name });
      }
    }
  }

  // Allinea i libri alla cartella: aggiunge i nuovi file, aggiorna quelli cambiati e toglie quelli spariti.
  async function syncFolder(folder, ask) {
    if (!(await ensurePermission(folder.handle, ask))) return { denied: true };
    const found = [];
    await walkFolder(folder.handle, "", found, 0);
    const known = new Map((await dbAll()).filter((book) => book.folderId === folder.id).map((book) => [book.path, book]));
    const seen = new Set();
    const result = { added: 0, updated: 0, removed: 0, missing: 0, problems: [], truncated: found.length >= MAX_FOLDER_FILES };
    for (const item of found) {
      if (folder.ignore?.includes(item.path)) continue;
      seen.add(item.path);
      let file;
      try { file = await item.handle.getFile(); } catch { continue; }
      const old = known.get(item.path);
      if (old && old.size === file.size && old.mtime === file.lastModified) continue;
      say(`Leggo «${item.path}»…`);
      try {
        const record = await buildRecord(file, formatOf(item.name));
        Object.assign(record, { file: null, handle: item.handle, folderId: folder.id, path: item.path, mtime: file.lastModified });
        if (old) {
          record.id = old.id;
          record.added = old.added;
          if (old.edited) Object.assign(record, { title: old.title, author: old.author, year: old.year, edited: true });
          result.updated += 1;
        } else result.added += 1;
        await dbPut(record);
      } catch (error) {
        result.problems.push(`${item.path}: ${error.message || "file non leggibile"}`);
      }
    }
    if (!result.truncated) result.missing = [...known.keys()].filter((path) => !seen.has(path) && !folder.ignore?.includes(path)).length;
    folder.count = found.length;
    folder.synced = Date.now();
    await folderPut(folder);
    return result;
  }

  function describeSync(folder, result) {
    if (result.denied) return `Serve il permesso di lettura per «${folder.name}».`;
    const parts = [];
    if (result.added) parts.push(`${result.added} ${result.added === 1 ? "nuovo libro" : "nuovi libri"}`);
    if (result.updated) parts.push(`${result.updated} aggiornati`);
    if (result.removed) parts.push(`${result.removed} rimossi`);
    if (result.missing) parts.push(`${result.missing} file non trovati (conservati in libreria)`);
    const summary = parts.length ? parts.join(", ") : "nessuna novità";
    const notes = [result.truncated ? `Letti solo i primi ${MAX_FOLDER_FILES} file.` : "", ...result.problems.slice(0, 3)];
    return [`«${folder.name}»: ${summary}.`, ...notes].filter(Boolean).join(" ");
  }

  async function syncAndReport(folder, ask) {
    try {
      const result = await syncFolder(folder, ask);
      say(describeSync(folder, result));
      return result;
    } catch (error) {
      say(`Impossibile leggere «${folder.name}»: ${error.message || "errore"}`);
      return { denied: true };
    } finally {
      if (ui.tab === "shelf") renderShelf();
    }
  }

  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      folderInput.click();
      return;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: "cyber-library", mode: "read" });
    } catch (error) {
      if (error?.name !== "AbortError") say("Non posso accedere alla cartella scelta.");
      return;
    }
    const folders = await folderAll();
    for (const existing of folders) {
      if (await existing.handle.isSameEntry(handle).catch(() => false)) {
        say("Questa cartella è già collegata: la aggiorno.");
        await syncAndReport(existing, true);
        return;
      }
    }
    const folder = { id: newId(), name: handle.name, handle, added: Date.now(), count: 0, synced: 0 };
    await folderPut(folder);
    navigator.storage?.persist?.().catch(() => {});
    say(`Leggo la cartella «${folder.name}»…`);
    await syncAndReport(folder, true);
  }

  async function unlinkFolder(folder) {
    if (!window.confirm(`Scollegare «${folder.name}»? I suoi libri escono dalla libreria; i file sul dispositivo non vengono toccati.`)) return;
    const books = (await dbAll()).filter((book) => book.folderId === folder.id);
    for (const book of books) {
      await dbDelete(book.id);
      delete readState()[book.id];
    }
    writeState();
    await folderDelete(folder.id);
    say(`Cartella «${folder.name}» scollegata.`);
    renderShelf();
  }

  let autoSynced = false;

  // All'apertura dello scaffale aggiorna le cartelle per cui il permesso e' gia' valido, senza chiedere nulla.
  async function autoSync() {
    if (autoSynced) return;
    autoSynced = true;
    let changed = false;
    for (const folder of await folderAll()) {
      try {
        if (!(await ensurePermission(folder.handle, false))) continue;
        const result = await syncFolder(folder, false);
        if (result.added || result.updated) {
          changed = true;
          say(describeSync(folder, result));
        }
      } catch { /* cartella non piu' raggiungibile */ }
    }
    if (changed && ui.active && ui.tab === "shelf") renderShelf();
  }

  async function renderFolders() {
    const folders = await folderAll();
    if (!folders.length) return null;
    const box = el("section", "lb-folders");
    box.append(el("h2", "lb-folders-title", "Cartelle collegate"));
    for (const folder of folders) {
      const granted = await ensurePermission(folder.handle, false);
      const writable = granted && await ensurePermission(folder.handle, false, "readwrite");
      const row = el("div", "lb-folder");
      row.append(icon(ICONS.folder, 22));
      const text = el("div", "lb-folder-text");
      text.append(el("strong", "", folder.name));
      const when = folder.synced ? new Date(folder.synced).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }) : "mai";
      text.append(el("small", "", `${folder.count || 0} file · ${granted ? `aggiornata ${when}` : "serve il permesso di lettura"}${folder.ignore?.length ? ` · ${folder.ignore.length} esclusi` : ""}`));
      row.append(text);
      if (folder.ignore?.length) {
        row.append(button("Ripristina esclusi", null, async () => {
          folder.ignore = [];
          await folderPut(folder);
          syncAndReport(folder, true);
        }));
      }
      row.append(button(granted ? "Aggiorna" : "Autorizza", ICONS.refresh, () => syncAndReport(folder, true)));
      if (writable) {
        row.append(el("small", "lb-write-status", "Rinomina autorizzata"));
      } else {
        row.append(button("Permetti rinomina", ICONS.edit, async () => {
          try {
            await requireWritePermission(folder.handle);
            say(`Scrittura autorizzata per «${folder.name}». Ora puoi rinominare i file sul dispositivo.`);
          } catch (error) {
            say(`Non posso autorizzare la rinomina di «${folder.name}»: ${error.message || "errore"}`);
          }
          renderShelf();
        }));
      }
      row.append(iconButton(`Scollega ${folder.name}`, ICONS.del, () => unlinkFolder(folder)));
      box.append(row);
    }
    return box;
  }

  async function bookBlob(record) {
    if (record.file) return record.file;
    if (!record.handle) throw new Error("file non disponibile");
    if (!(await ensurePermission(record.handle, true))) throw new Error("serve il permesso di lettura: premi «Autorizza» sulla cartella nello scaffale");
    const file = await record.handle.getFile();
    return record.type === "pdf" ? new Blob([file], { type: "application/pdf" }) : file;
  }

  const LIBRARY_AI_MAX_CHARS = 8000;

  async function prepareLibraryAiImage(blob) {
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      const maxSide = 1100;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas non disponibile per preparare la copertina.");
      let width = Math.max(1, Math.round(bitmap.width * scale));
      let height = Math.max(1, Math.round(bitmap.height * scale));
      let compressed = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        compressed = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", [0.78, 0.68, 0.58, 0.5][attempt]));
        if (compressed && compressed.size <= 900_000) break;
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
      }
      if (!compressed) throw new Error("Non riesco a preparare l'immagine della copertina.");
      if (compressed.size > 900_000) throw new Error("La copertina è troppo grande per l'invio sicuro a Gemini.");
      const bytes = new Uint8Array(await compressed.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const data = btoa(binary);
      return { mimeType: "image/jpeg", data, previewUrl: `data:image/jpeg;base64,${data}` };
    } finally {
      bitmap.close();
    }
  }

  async function extractLibraryAiText(record) {
    const blob = await bookBlob(record);
    if (record.type === "epub") {
      const book = await parseEpub(blob);
      const excerpts = [];
      let total = 0;
      for (const path of book.spine.slice(0, 8)) {
        const bytes = await book.zip.read(path);
        if (!bytes) continue;
        const document = new DOMParser().parseFromString(decodeText(bytes), "text/html");
        document.querySelectorAll("script, style, svg, nav, header, footer").forEach((node) => node.remove());
        const chapter = (document.body?.textContent || "").replace(/\s+/g, " ").trim();
        if (!chapter) continue;
        const excerpt = chapter.slice(0, LIBRARY_AI_MAX_CHARS - total);
        excerpts.push(excerpt);
        total += excerpt.length;
        if (total >= LIBRARY_AI_MAX_CHARS) break;
      }
      const text = excerpts.join("\n\n").slice(0, LIBRARY_AI_MAX_CHARS).trim();
      let image = null;
      let imageError = "";
      if (book.coverBlob) {
        try { image = await prepareLibraryAiImage(book.coverBlob); } catch (error) { imageError = error.message || "copertina non leggibile"; }
      }
      if (!text && !image) throw new Error(imageError || "Non ho trovato testo leggibile né una copertina nel file EPUB.");
      return { text, image, imageError, source: "prime sezioni dell'EPUB" };
    }

    if (record.type === "pdf") {
      const pdfjs = await loadPdfJs();
      const task = pdfjs.getDocument({ data: await blob.arrayBuffer(), wasmUrl: PDFJS_WASM_URL });
      try {
        const pdf = await task.promise;
        const excerpts = [];
        let total = 0;
        let image = null;
        let imageError = "";
        const pageCount = Math.min(pdf.numPages, 5);
        for (let pageNumber = 1; pageNumber <= pageCount && total < LIBRARY_AI_MAX_CHARS; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (pageNumber === 1) {
            let canvas;
            try {
              const baseViewport = page.getViewport({ scale: 1 });
              const viewport = page.getViewport({ scale: Math.min(1, 1100 / Math.max(baseViewport.width, baseViewport.height)) });
              canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.ceil(viewport.width));
              canvas.height = Math.max(1, Math.ceil(viewport.height));
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) throw new Error("Canvas non disponibile per preparare la prima pagina PDF.");
              context.fillStyle = "#fff";
              context.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: context, viewport }).promise;
              image = await prepareLibraryAiImage(await new Promise((resolve) => canvas.toBlob(resolve, "image/png")));
            } catch (error) {
              imageError = error.message || "prima pagina non leggibile";
            } finally {
              if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
              }
            }
          }
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
          if (!pageText) continue;
          const excerpt = `Pagina ${pageNumber}: ${pageText}`.slice(0, LIBRARY_AI_MAX_CHARS - total);
          excerpts.push(excerpt);
          total += excerpt.length;
        }
        const text = excerpts.join("\n\n").slice(0, LIBRARY_AI_MAX_CHARS).trim();
        if (!text && !image) throw new Error(imageError || "Non riesco a leggere il testo né a preparare la prima pagina PDF.");
        return { text, image, imageError, source: `prime ${pageCount} pagine del PDF` };
      } finally {
        await task.destroy();
      }
    }

    throw new Error("L'analisi Gemini è disponibile solo per EPUB e PDF.");
  }

  /* ---------- Nomi, metadati, doppioni e ordinamento ---------- */

  const SORTS = { recent: "ultimi letti", title: "titolo", author: "autore", yearAsc: "anno (dal più vecchio)", yearDesc: "anno (dal più recente)" };
  const FORMAT_RANK = { epub: 6, fb2: 5, docx: 4, odt: 4, pdf: 3, cbz: 3, html: 2, md: 2, rtf: 2, txt: 1 };
  const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

  function sortBooks(books, state, mode) {
    const byTitle = (a, b) => collator.compare(a.title, b.title);
    const emptyLast = (get, compare) => (a, b) => {
      const x = get(a);
      const y = get(b);
      if (!x && !y) return 0;
      if (!x) return 1;
      if (!y) return -1;
      return compare(x, y);
    };
    const recent = (a, b) => (state[b.id]?.updated || 0) - (state[a.id]?.updated || 0) || b.added - a.added;
    const orders = {
      title: byTitle,
      author: (a, b) => emptyLast((r) => r.author, (x, y) => collator.compare(x, y))(a, b) || byTitle(a, b),
      yearAsc: (a, b) => emptyLast((r) => Number(r.year), (x, y) => x - y)(a, b) || byTitle(a, b),
      yearDesc: (a, b) => emptyLast((r) => Number(r.year), (x, y) => y - x)(a, b) || byTitle(a, b),
    };
    return books.sort(orders[mode] || recent);
  }

  function cleanField(text) {
    return String(text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  }

  // Titoli cifrati o in codifica sbagliata (tipici dei PDF protetti): pochi caratteri leggibili o simboli fuori posto.
  function isGarbled(text) {
    const value = String(text || "");
    if (!value.trim()) return false;
    if (/[\u0000-\u0008\u000e-\u001f\u007f-\u009f\ufffd]/.test(value)) return true;
    // Simboli che non compaiono nei titoli ma abbondano nel testo cifrato o decodificato male.
    if ((value.match(/[\u00a1-\u00a9\u00ac-\u00b1\u00b3-\u00b7\u00b9\u00bc-\u00bf\u00d7\u00f7`^~|<>={}[\]\\]/g) || []).length >= 2) return true;
    const nonAscii = (value.match(/[\u0080-\u00ff]/g) || []).length;
    if (value.length >= 12 && nonAscii / value.length > 0.3) return true;
    const letters = (value.match(/[\p{L}\p{N}]/gu) || []).length;
    const odd = (value.match(/[^\p{L}\p{N}\s.,;:!?'’"“”«»()\-–—&/+_#@%°]/gu) || []).length;
    return letters / value.length < 0.6 || odd / value.length > 0.15;
  }

  // Ripara i libri già salvati con un titolo illeggibile: torna il nome del file, salvo correzioni fatte a mano.
  async function repairGarbled(records) {
    for (const record of records) {
      if (record.edited || !(isGarbled(record.title) || isGarbled(record.author))) continue;
      if (isGarbled(record.title)) record.title = record.name.replace(/\.[^.]+$/, "");
      if (isGarbled(record.author)) record.author = "";
      await dbPut(record).catch(() => {});
    }
  }

  // Un campo del nome file: niente caratteri vietati, e il separatore " - " resta riservato ai tre campi.
  function nameField(text) {
    return cleanField(text)
      .replace(/\s*:\s*/g, " – ")
      .replace(/\s[-–—]\s/g, " – ")
      .replace(/[\\/*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/, "")
      .trim();
  }

  function extOf(name) {
    return (String(name).match(/(\.[^.]+)$/) || [])[1] || "";
  }

  function profileFor(record) {
    if (record?.type === "cbz") return "comic";
    return /\b(rivista|magazine|periodico)\b/i.test(record?.name || "") ? "magazine" : "book";
  }

  function renameProfile(key = "book") {
    const saved = prefs().renameProfiles?.[key] || {};
    return {
      template: key === "book" ? prefs().renameTemplate || DEFAULT_RENAME_TEMPLATE : RENAME_PROFILES[key].template,
      order: key === "book" ? prefs().renameFieldOrder : undefined,
      separator: " - ", monthFormat: "number", yearFormat: "full", numberFormat: "plain",
      ...saved,
    };
  }

  function renameFields(profile = "book") {
    const config = renameProfile(profile);
    const template = config.template;
    const positions = NAME_FIELDS.map((field) => {
      const match = template.match(new RegExp(`\\{(?:${field.token}${field.key === "month" ? "|meseNome" : ""})\\}`));
      return { ...field, position: match ? match.index : Infinity, enabled: Boolean(match) };
    });
    const order = config.order;
    if (Array.isArray(order)) {
      return positions.sort((a, b) => {
        const ai = order.indexOf(a.key);
        const bi = order.indexOf(b.key);
        return (ai < 0 ? NAME_FIELDS.length : ai) - (bi < 0 ? NAME_FIELDS.length : bi);
      });
    }
    return positions.sort((a, b) => a.position - b.position);
  }

  function standardName(meta, record, selected, profile = profileFor(record)) {
    const config = renameProfile(profile);
    const number = (value) => {
      const clean = nameField(value).slice(0, 20);
      return config.numberFormat === "padded" && /^\d+$/.test(clean) ? clean.padStart(2, "0") : clean;
    };
    const values = {
      titolo: nameField(meta.title).slice(0, 120),
      autore: nameField(meta.author).slice(0, 60),
      editore: nameField(meta.publisher).slice(0, 100),
      anno: config.yearFormat === "short" ? yearOf(meta.year).slice(-2) : yearOf(meta.year),
      mese: config.monthFormat === "name" ? monthName(meta.month) : monthOf(meta.month),
      meseNome: monthName(meta.month),
      serie: nameField(meta.series).slice(0, 100),
      volume: number(meta.volume),
      capitolo: number(meta.chapter),
    };
    if (selected) {
      NAME_FIELDS.forEach((field) => {
        if (!selected.includes(field.key)) {
          values[field.token] = "";
          if (field.key === "month") values.meseNome = "";
        }
      });
    }
    let template = config.template;
    if (selected) {
      if (Array.isArray(config.order)) {
        template = renameFields(profile).filter((field) => selected.includes(field.key))
          .map((field) => `${field.prefix || ""}{${field.token}}`).join(" - ");
      } else {
        NAME_FIELDS.forEach((field) => {
          const pattern = new RegExp(`\\{(?:${field.token}${field.key === "month" ? "|meseNome" : ""})\\}`);
          if (selected.includes(field.key) && !pattern.test(template)) template += ` - ${field.prefix || ""}{${field.token}}`;
        });
      }
    }
    const base = template.split(/\s*[-–—]\s*/)
      .map((part) => {
        const tokens = [...part.matchAll(/\{([a-zA-Z]+)\}/g)];
        if (tokens.length && !tokens.some((match) => values[match[1]])) return "";
        return nameField(part.replace(/\{([a-zA-Z]+)\}/g, (_, key) => values[key] || "").replace(/\(\s*\)|\[\s*\]/g, ""));
      })
      .filter(Boolean)
      .join(config.separator);
    return `${base || "Senza titolo"}${extOf(record.name).toLowerCase()}`;
  }

  const MONTHS = [
    ["gennaio", "gen", "january", "jan"], ["febbraio", "feb", "february"], ["marzo", "mar", "march"],
    ["aprile", "apr", "april"], ["maggio", "mag", "may"], ["giugno", "giu", "jun", "june"],
    ["luglio", "lug", "jul", "july"], ["agosto", "ago", "aug", "august"], ["settembre", "set", "sep", "sept", "september"],
    ["ottobre", "ott", "oct", "october"], ["novembre", "nov", "november"], ["dicembre", "dic", "dec", "december"],
  ];

  function monthOf(value) {
    const text = cleanField(value).toLowerCase();
    if (/^(0?[1-9]|1[0-2])$/.test(text)) return String(Number(text)).padStart(2, "0");
    const index = MONTHS.findIndex((names) => names.includes(text));
    return index >= 0 ? String(index + 1).padStart(2, "0") : "";
  }

  function monthName(value) {
    const month = Number(monthOf(value));
    return month ? MONTHS[month - 1][0].charAt(0).toUpperCase() + MONTHS[month - 1][0].slice(1) : "";
  }

  function trimNameSeparators(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/^(?:\s*[-–—]\s*)+|(?:\s*[-–—]\s*)+$/g, "").trim();
  }

  function parseIssueDate(text) {
    let value = text;
    let year = "";
    let month = "";
    const numeric = value.match(/\b((?:19|20)\d{2})\s*[-–._ ]\s*(0?[1-9]|1[0-2])\b|\b(0?[1-9]|1[0-2])\s*[-–._ ]\s*((?:19|20)\d{2})\b/);
    if (numeric) {
      year = numeric[1] || numeric[4];
      month = monthOf(numeric[2] || numeric[3]);
      value = value.replace(numeric[0], " ");
    } else {
      const monthPattern = MONTHS.flat().sort((a, b) => b.length - a.length).join("|");
      const named = value.match(new RegExp(`\\b(${monthPattern})\\s*[-._ ]?\\s*((?:19|20)\\d{2})\\b|\\b((?:19|20)\\d{2})\\s*[-._ ]?\\s*(${monthPattern})\\b`, "i"));
      if (named) {
        const monthText = named[1] || named[4];
        year = named[2] || named[3];
        month = monthOf(monthText);
        value = value.replace(named[0], " ");
      }
    }
    return {
      value: trimNameSeparators(value),
      year,
      month,
    };
  }

  const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t" };
  const LEET_PREP = new Set(["di", "del", "dello", "della", "dei", "degli", "delle", "da", "in"]);
  const isLeetWord = (word) => /[a-z]/i.test(word) && /\d/.test(word) && /^[a-z0-9'’]+$/i.test(word) && /^[a-z0-9'’]*[a-z][a-z0-9'’]*$/i.test(word) && !/^\d+[a-z]{1,2}$/i.test(word);

  // Riporta in italiano i testi scritti in "leet" (V4l3r10 -> Valerio); i numeri normali restano.
  function deLeet(text) {
    const value = String(text || "");
    const words = value.split(/(\s+)/);
    const real = words.filter((word) => /[a-z]/i.test(word));
    const leet = real.filter(isLeetWord);
    if (leet.length < 2 || leet.length < real.length / 2) return value;
    let startOfPhrase = true;
    let previous = "";
    return words.map((word) => {
      if (!/[a-z0-9]/i.test(word)) {
        if (/[-–—]/.test(word)) startOfPhrase = true;
        return word;
      }
      let out = word;
      if (isLeetWord(word)) {
        const startsWithDigit = /^\d/.test(word);
        out = word.replace(/\d/g, (digit) => LEET[digit] || digit);
        if (startsWithDigit && (startOfPhrase || LEET_PREP.has(previous))) out = out[0].toUpperCase() + out.slice(1);
      }
      startOfPhrase = false;
      previous = out.toLowerCase();
      return out;
    }).join("");
  }

  // Ricava titolo, autore e anno da un nome file del tipo «Titolo - Autore - 1999».
  function guessFromName(name) {
    const raw = deLeet(name.replace(/\.[^.]+$/, ""))
      .replace(/\((?:z-?lib|libgen|www)[^)]*\)|\[(?:www|ebook|z-?lib)[^\]]*\]/gi, " ")
      .replace(/_+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const archiveParts = raw.split(/\s+--+\s+/).map((part) => part.trim());
    const archiveName = archiveParts[archiveParts.length - 1];
    if (archiveParts.length >= 3 && /^anna['’]s archive$/i.test(archiveName)
      && /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(archiveParts[archiveParts.length - 2])) {
      const first = parseIssueDate(archiveParts[0]);
      const title = first.value.replace(/[, ]+$/, "");
      if (title) {
        let year = first.year;
        let month = first.month;
        const remaining = archiveParts.slice(1, -2).filter((part) => {
          const parsed = parseIssueDate(part);
          const candidate = parsed.value.replace(/[, ]+$/, "");
          if (candidate.normalize("NFC").toLocaleLowerCase() !== title.normalize("NFC").toLocaleLowerCase()
            || (year && parsed.year && year !== parsed.year) || (month && parsed.month && month !== parsed.month)) return true;
          year ||= parsed.year;
          month ||= parsed.month;
          return false;
        });
        return { title: [title, ...remaining].join(" -- "), author: "", year, month, series: "", volume: "", chapter: "" };
      }
    }
    const issue = parseIssueDate(raw);
    const base = issue.value;
    let volume = "";
    let chapter = "";
    const volumeMatch = base.match(/\b(?:vol(?:ume)?|tomo|v)\.?\s*0*(\d{1,4})\b/i);
    if (volumeMatch) {
      volume = String(Number(volumeMatch[1]));
    }
    const chapterMatch = base.match(/\b(?:cap(?:itolo)?|chapter|chap|ch)\.?\s*0*(\d{1,5})\b/i);
    if (chapterMatch) chapter = String(Number(chapterMatch[1]));
    const withoutEdition = trimNameSeparators(base.replace(/\b(?:vol(?:ume)?|tomo|v)\.?\s*0*\d{1,4}\b|\b(?:cap(?:itolo)?|chapter|chap|ch)\.?\s*0*\d{1,5}\b/gi, " "));
    const parts = withoutEdition.split(/\s+[-–—]+\s+/).map((part) => part.trim()).filter(Boolean)
      .filter((part, index) => index === 0 || !/^[\d\s–—-]+$/.test(part) || /^(1[0-9]{3}|20[0-9]{2})$/.test(part));
    let year = issue.year;
    if (parts.length > 1 && /^(1[0-9]{3}|20[0-9]{2})$/.test(parts[parts.length - 1])) year = parts.pop();
    else if (parts.length) {
      const match = parts[parts.length - 1].match(/\s*\((1[0-9]{3}|20[0-9]{2})\)\s*$/);
      if (match) {
        year = match[1];
        parts[parts.length - 1] = parts[parts.length - 1].slice(0, match.index);
      }
    }
    if (/\s+--+\s+/.test(raw) && parts.length > 1) {
      const title = parts.join(" -- ");
      return { title, author: "", year, month: issue.month, series: volume || chapter ? title : "", volume, chapter };
    }
    // «Autore - Titolo»: un nome breve di persona seguito da un testo lungo e' quasi sempre l'ordine inverso.
    const looksLikePerson = (text) => { const w = text.split(" "); return w.length >= 2 && w.length <= 3 && w.every((x) => /^\p{Lu}[\p{L}'’.]*$/u.test(x)); };
    if (parts.length === 2 && looksLikePerson(parts[0]) && parts[1].split(" ").length >= 4) parts.reverse();
    const title = parts[0] || base;
    return { title, author: parts.slice(1).join(" – "), year, month: issue.month, series: volume || chapter ? title : "", volume, chapter };
  }

  // Valori proposti: i metadati del libro se esistono, altrimenti quelli intuiti dal nome del file.
  function proposal(record) {
    if (record.edited) {
      return {
        title: cleanField(record.title), author: cleanField(record.author), publisher: cleanField(record.publisher),
        year: record.year || "", month: record.month || "", series: record.series || "",
        volume: record.volume || "", chapter: record.chapter || "",
      };
    }
    const base = record.name.replace(/\.[^.]+$/, "");
    const guess = guessFromName(record.name);
    const trusted = record.title && record.title !== base;
    return {
      title: cleanField(deLeet(trusted ? record.title : guess.title)),
      author: /^[\d\s–—-]+$/.test(record.author || "") ? cleanField(guess.author) : cleanField(deLeet(record.author) || guess.author),
      publisher: cleanField(record.publisher),
      year: record.year || guess.year || "",
      month: record.month || guess.month || "",
      series: record.series || guess.series || "",
      volume: record.volume || guess.volume || "",
      chapter: record.chapter || guess.chapter || "",
    };
  }

  function normKey(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function duplicateGroups(records) {
    const groups = new Map();
    records.forEach((record) => {
      const meta = proposal(record);
      const title = normKey(meta.title);
      if (!title) return;
      const key = `${title}|${normKey(meta.author)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    // Una copia senza autore si unisce all'unico gruppo con lo stesso titolo, se ce n'e' uno solo.
    [...groups.keys()].filter((key) => key.endsWith("|")).forEach((key) => {
      const title = key.slice(0, -1);
      const others = [...groups.keys()].filter((other) => other !== key && other.startsWith(`${title}|`));
      if (others.length === 1) {
        groups.get(others[0]).push(...groups.get(key));
        groups.delete(key);
      }
    });
    return [...groups.values()].filter((group) => group.length > 1);
  }

  function keepScore(record, state) {
    return (state[record.id]?.updated ? 1000 : 0) + (record.year ? 20 : 0) + (record.author ? 10 : 0) + (FORMAT_RANK[record.type] || 0) + record.size / 1e12;
  }

  async function parentDir(folder, record) {
    const path = await folder.handle.resolve(record.handle);
    if (!path?.length) throw new Error("il file non si trova più nella cartella collegata");
    let directory = folder.handle;
    for (const part of path.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    return directory;
  }

  async function freeName(directory, desired, current, conflict = "number") {
    if (desired === current || desired.toLowerCase() === current.toLowerCase()) return desired;
    const extension = extOf(desired);
    const stem = desired.slice(0, desired.length - extension.length);
    for (let n = 1; n < 100; n += 1) {
      const candidate = n === 1 ? desired : `${stem} (${n})${extension}`;
      try {
        await directory.getFileHandle(candidate);
        if (conflict === "stop") throw new Error(`nome già in uso: ${desired}`);
      } catch (error) {
        if (error?.name === "NotFoundError") return candidate;
        throw error;
      }
    }
    throw new Error("nome già in uso");
  }

  async function renameOnDisk(folder, record, desired, conflict = "number") {
    await requireWritePermission(folder.handle);
    const directory = await parentDir(folder, record);
    const current = record.handle.name;
    const target = await freeName(directory, desired, current, conflict);
    if (target === current) return target;
    if (typeof record.handle.move === "function") {
      try {
        await record.handle.move(target);
      } catch (error) {
        // Su file di cartelle locali Chrome può rifiutare move(): si ripiega su copia verificata + eliminazione.
        if (!["NotSupportedError", "NotAllowedError", "InvalidStateError", "TypeError"].includes(error?.name)) throw error;
        await copyRenameOnDisk(directory, record, target, current);
      }
    } else {
      await copyRenameOnDisk(directory, record, target, current);
    }
    const file = await record.handle.getFile();
    Object.assign(record, { size: file.size, mtime: file.lastModified, path: record.path.replace(/[^/]*$/, "") + target });
    return target;
  }

  async function copyRenameOnDisk(directory, record, target, current) {
    let copy;
    try {
      const source = await record.handle.getFile();
      copy = await directory.getFileHandle(target, { create: true });
      await source.stream().pipeTo(await copy.createWritable());
      const copied = await copy.getFile();
      if (copied.size !== source.size) throw new Error("verifica della copia non riuscita");
      await directory.removeEntry(current);
      record.handle = copy;
    } catch (error) {
      if (copy) await directory.removeEntry(target).catch(() => {});
      throw error;
    }
  }

  function uniqueDbName(records, desired, self, conflict = "number") {
    const taken = new Set(records.filter((book) => book !== self && !book.folderId).map((book) => book.name.toLowerCase()));
    const extension = extOf(desired);
    const stem = desired.slice(0, desired.length - extension.length);
    let candidate = desired;
    if (conflict === "stop" && taken.has(candidate.toLowerCase())) throw new Error(`nome già in uso: ${desired}`);
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${stem} (${n})${extension}`;
    return candidate;
  }

  async function applyEdit(record, values, options) {
    const title = cleanField(values.title);
    const author = cleanField(values.author);
    const publisher = cleanField(values.publisher);
    const year = String(values.year || "").trim();
    const month = monthOf(values.month);
    const series = cleanField(values.series);
    const volume = cleanField(values.volume);
    const chapter = cleanField(values.chapter);
    if (!title) throw new Error("il titolo non può essere vuoto");
    if (year && !/^(1[0-9]{3}|20[0-9]{2})$/.test(year)) throw new Error("anno non valido (usa quattro cifre)");
    if (values.month && !month) throw new Error("mese non valido (usa 01–12 oppure il nome del mese)");
    const before = {
      name: record.name, origName: record.origName, path: record.path,
      title: record.title, author: record.author, publisher: record.publisher, year: record.year, month: record.month,
      series: record.series, volume: record.volume, chapter: record.chapter, edited: record.edited,
    };
    const metadata = { title, author, publisher, year, month, series, volume, chapter };
    const missing = (values.nameFields || []).filter((key) => !metadata[key]);
    if ((!record.folderId || options.renameDisk) && prefs().missingFields !== "omit" && missing.length) {
      throw new Error(`campi selezionati mancanti: ${missing.map((key) => NAME_FIELDS.find((field) => field.key === key)?.label || key).join(", ")}`);
    }
    const desired = standardName(metadata, record, values.nameFields, values.profile);
    if ((!record.folderId || options.renameDisk) && values.nameFields && !values.nameFields.some((key) => metadata[key])) {
      throw new Error("seleziona almeno un campo con un valore per il nome file");
    }
    let renamedOnDisk = false;
    if (desired !== record.name) {
      if (record.folderId) {
        if (options.renameDisk) {
          const folder = options.folders.find((item) => item.id === record.folderId);
          if (!folder) throw new Error("cartella non più collegata");
          const target = await renameOnDisk(folder, record, desired, prefs().nameConflict || "stop");
          record.origName ||= record.name;
          record.name = target;
          renamedOnDisk = target !== before.name;
        }
      } else {
        record.origName ||= record.name;
        record.name = uniqueDbName(options.records, desired, record, prefs().nameConflict || "stop");
      }
    }
    if (title !== record.title || author !== (record.author || "") || publisher !== (record.publisher || "") || year !== (record.year || "")
      || month !== (record.month || "") || series !== (record.series || "")
      || volume !== (record.volume || "") || chapter !== (record.chapter || "")) record.edited = true;
    Object.assign(record, { title, author, publisher, year, month, series, volume, chapter });
    try {
      await dbPut(record);
    } catch (error) {
      if (renamedOnDisk) {
        try {
          const folder = options.folders.find((item) => item.id === record.folderId);
          await renameOnDisk(folder, record, before.name);
        } catch (rollbackError) {
          throw new Error(`il file è stato rinominato sul dispositivo, ma non ho salvato i dati in libreria e non sono riuscito a ripristinare il nome: ${rollbackError.message || "errore"}`);
        }
      }
      Object.entries(before).forEach(([key, value]) => {
        if (value === undefined) delete record[key];
        else record[key] = value;
      });
      throw new Error(`rinomina non salvata in libreria: ${error.message || "errore"}`);
    }
    return {
      recordId: record.id,
      folderId: record.folderId || "",
      disk: renamedOnDisk,
      before,
      after: { name: record.name, path: record.path },
    };
  }

  async function removeRecord(record, options = {}) {
    if (record.folderId) {
      const folder = (await folderAll()).find((item) => item.id === record.folderId);
      if (folder) {
        if (options.deleteFile) {
          if (!(await ensurePermission(folder.handle, true, "readwrite"))) throw new Error("serve il permesso di scrittura sulla cartella");
          const directory = await parentDir(folder, record);
          await directory.removeEntry(record.handle.name);
        } else {
          folder.ignore = [...new Set([...(folder.ignore || []), record.path])];
          await folderPut(folder);
        }
      }
    }
    await dbDelete(record.id);
    delete readState()[record.id];
  }

  async function resolveGroup(group, keepId, deleteFiles) {
    const keep = group.find((record) => record.id === keepId);
    const others = group.filter((record) => record !== keep);
    const state = readState();
    if (!state[keep.id]?.updated) {
      const donor = others.filter((record) => record.type === keep.type && state[record.id]?.updated).sort((a, b) => state[b.id].updated - state[a.id].updated)[0];
      if (donor) state[keep.id] = JSON.parse(JSON.stringify(state[donor.id]));
    }
    ["author", "publisher", "year"].forEach((fieldName) => {
      if (!keep[fieldName]) keep[fieldName] = others.map((record) => record[fieldName]).find(Boolean) || "";
    });
    await dbPut(keep);
    for (const record of others) await removeRecord(record, { deleteFile: deleteFiles });
    writeState();
    return others.length;
  }

  // Legge l'anno (e, per i PDF, titolo e autore) dei libri importati prima che questi dati venissero registrati.
  async function enrichRecords(records) {
    for (const record of records) {
      if (record.year !== undefined) continue;
      try {
        let blob = record.file;
        if (!blob && record.handle) {
          if (!(await ensurePermission(record.handle, false))) continue;
          blob = await record.handle.getFile();
        }
        if (!blob) continue;
        let meta = null;
        if (record.type === "epub") meta = await parseEpub(blob);
        else if (record.type === "fb2") meta = await parseFb2(blob);
        else if (record.type === "pdf" && !record.edited && record.title === record.name.replace(/\.[^.]+$/, "")) {
          meta = await parsePdfMeta(blob);
          if (meta.title) record.title = meta.title;
          if (meta.author && !record.author) record.author = meta.author;
        }
        record.year = meta?.year || "";
      } catch {
        record.year = "";
      }
      await dbPut(record).catch(() => {});
    }
  }

  function checkbox(label, checked) {
    const wrap = el("label", "lb-check");
    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    wrap.append(input, el("span", "", label));
    return { wrap, input };
  }

  function textField(label, value, narrow) {
    const wrap = el("label", `lb-field${narrow ? " narrow" : ""}`);
    const input = el("input");
    input.type = "text";
    input.value = value || "";
    if (narrow) {
      input.inputMode = narrow === "month" ? "text" : "numeric";
      input.maxLength = narrow === "month" ? 12 : 4;
    }
    wrap.append(el("span", "", label), input);
    return { wrap, input };
  }

  async function contentDuplicateGroups(records, progress) {
    if (!window.crypto?.subtle) throw new Error("il browser non supporta SHA-256");
    const maxBytes = 256 * 1024 * 1024;
    const sizes = new Map();
    records.forEach((record) => {
      if (record.size > 0) sizes.set(record.size, [...(sizes.get(record.size) || []), record]);
    });
    const sameSize = [...sizes.values()].filter((group) => group.length > 1).flat();
    const candidates = sameSize.filter((record) => record.size <= maxBytes);
    let skipped = sameSize.length - candidates.length;
    const hashes = new Map();
    for (let i = 0; i < candidates.length; i += 1) {
      const record = candidates[i];
      progress(i + 1, candidates.length);
      const blob = await bookBlob(record);
      if (blob.size > maxBytes) {
        skipped += 1;
        continue;
      }
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
      const key = `${blob.size}:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      hashes.set(key, [...(hashes.get(key) || []), record]);
    }
    return { groups: [...hashes.values()].filter((group) => group.length > 1), skipped };
  }

  async function auditLinkedFolders(records) {
    const folders = await folderAll();
    if (!folders.length) return "Non ci sono cartelle collegate.";
    let moved = 0;
    let missing = 0;
    let modified = 0;
    let newFiles = 0;
    const inaccessible = [];
    for (const folder of folders) {
      try {
        if (!(await ensurePermission(folder.handle, true))) {
          inaccessible.push(folder.name);
          continue;
        }
        const found = [];
        await walkFolder(folder.handle, "", found, 0);
        const indexed = records.filter((record) => record.folderId === folder.id);
        const fresh = new Map();
        for (const item of found) {
          try {
            const file = await item.handle.getFile();
            fresh.set(item.path, { ...item, size: file.size, mtime: file.lastModified });
          } catch { /* Il riepilogo segnala il percorso come non disponibile. */ }
        }
        const knownPaths = new Set(indexed.map((record) => record.path));
        const matched = new Set();
        const unmatched = [];
        for (const record of indexed) {
          const current = fresh.get(record.path);
          if (current) {
            matched.add(record.path);
            if (current.size !== record.size || (record.mtime && current.mtime !== record.mtime)) modified += 1;
            continue;
          }
          const sameName = [...fresh.values()].filter((item) => !matched.has(item.path)
            && item.name === (record.handle?.name || record.name) && item.size === record.size);
          if (sameName.length === 1) {
            const item = sameName[0];
            Object.assign(record, { handle: item.handle, path: item.path, mtime: item.mtime, size: item.size });
            await dbPut(record);
            matched.add(item.path);
            moved += 1;
          } else {
            unmatched.push(record);
          }
        }
        missing += unmatched.length;
        newFiles += [...fresh.keys()].filter((path) => !knownPaths.has(path) && !matched.has(path)).length;
        folder.count = found.length;
        folder.synced = Date.now();
        await folderPut(folder);
        if (found.length >= MAX_FOLDER_FILES) inaccessible.push(`${folder.name} (limite di scansione raggiunto)`);
      } catch {
        inaccessible.push(folder.name);
      }
    }
    return [
      `${moved} file spostati aggiornati, ${modified} file modificati da aggiornare, ${missing} mancanti conservati in libreria, ${newFiles} file nuovi non ancora importati.`,
      inaccessible.length ? `Da autorizzare o non leggibili: ${inaccessible.join(", ")}.` : "",
      "Nessun file è stato eliminato.",
    ].filter(Boolean).join(" ");
  }

  async function undoRenameAction(action) {
    const folders = await folderAll();
    const problems = [];
    let restored = 0;
    for (const change of [...action.changes].reverse()) {
      try {
        const record = await dbGet(change.recordId);
        if (!record) throw new Error("libro non più presente");
        if (change.disk && record.name !== change.before.name) {
          if (record.name !== change.after.name) throw new Error("il file è stato rinominato anche fuori da Cyber Pulse");
          const folder = folders.find((item) => item.id === change.folderId);
          if (!folder) throw new Error("cartella non più collegata");
          if (!(await ensurePermission(folder.handle, true, "readwrite"))) throw new Error("permesso di scrittura negato");
          const directory = await parentDir(folder, record);
          const available = await freeName(directory, change.before.name, record.handle.name);
          if (available !== change.before.name) throw new Error(`il nome originale è già occupato: ${change.before.name}`);
          await renameOnDisk(folder, record, change.before.name);
        } else if (!change.disk && record.name !== change.after.name) {
          throw new Error("il nome è cambiato dopo l'operazione");
        }
        for (const [key, value] of Object.entries(change.before)) {
          if (value === undefined) delete record[key];
          else record[key] = value;
        }
        await dbPut(record);
        restored += 1;
      } catch (error) {
        problems.push(`${change.before.name}: ${error.message || "errore"}`);
      }
    }
    if (!problems.length) await historyDelete(action.id);
    return [
      `${restored} elementi ripristinati.`,
      ...problems.slice(0, 3),
      problems.length > 3 ? `Altri ${problems.length - 3} errori.` : "",
    ].filter(Boolean).join(" ");
  }

  function isbnIsValid(code) {
    if (code.length === 13) {
      let sum = 0;
      for (let i = 0; i < 12; i += 1) sum += Number(code[i]) * (i % 2 ? 3 : 1);
      return (10 - (sum % 10)) % 10 === Number(code[12]);
    }
    if (code.length === 10) {
      let sum = 0;
      for (let i = 0; i < 9; i += 1) sum += Number(code[i]) * (10 - i);
      sum += code[9].toUpperCase() === "X" ? 10 : Number(code[9]);
      return sum % 11 === 0;
    }
    return false;
  }

  function findIsbn(text) {
    const source = String(text || "");
    const found = source.match(/97[89](?:[\s-]?\d){10}|\b\d{9}[\dXx]\b/g) || [];
    for (const raw of found) {
      const code = raw.replace(/[\s-]/g, "");
      if (isbnIsValid(code)) return code.toUpperCase();
    }
    return "";
  }

  async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function lookupIsbn(isbn, fileName) {
    const yearOf = (value) => (String(value || "").match(/(?:1[5-9]|20)\d{2}/) || [""])[0];
    const hay = ` ${normKey(fileName)} `;
    const words = (title) => normKey(title).split(" ").filter((word) => word.length > 2);
    // Se il titolo trovato non ha parole in comune con il nome file è probabile un'altra lingua/edizione.
    const similar = (title) => !fileName || !words(fileName).length || words(title).some((word) => hay.includes(` ${word} `));
    const result = (title, author, publisher, date, source) => ({ title, author, publisher, year: yearOf(date), source, mismatch: !similar(title) });
    const failures = [];
    const providers = Array.isArray(prefs().isbnProviders) ? prefs().isbnProviders : Object.keys(ISBN_PROVIDERS);
    for (const provider of providers) {
      if (provider === "google") {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=${prefs().isbnPreferItalian ? 10 : 1}`);
            const items = data?.items || [];
            const info = (prefs().isbnPreferItalian && items.find((item) => item.volumeInfo?.language === "it"
              && item.volumeInfo?.industryIdentifiers?.some((id) => typeof id.identifier === "string" && id.identifier.replace(/[\s-]/g, "").toUpperCase() === isbn)) || items[0])?.volumeInfo;
            if (info?.title) return result(info.title, (info.authors || []).join(", "), info.publisher || "", info.publishedDate, "Google Books");
            break;
          } catch (error) {
            if (!/429/.test(error.message) || attempt) {
              failures.push(`Google Books: ${error.message || "servizio non disponibile"}`);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      } else if (provider === "sbn") {
        try {
          if (!window.CyberPulseApi?.fetchSbnIsbn) throw new Error("backend non disponibile o da aggiornare");
          const editions = await window.CyberPulseApi.fetchSbnIsbn(isbn);
          if (editions.length === 1) {
            const info = editions[0];
            return result(info.title, info.author, info.publisher, info.year, "SBN");
          }
          if (editions.length > 1) failures.push("SBN: più edizioni associate al codice; verifica il catalogo SBN");
        } catch (error) {
          failures.push(`SBN: ${error.message || "servizio non disponibile"}`);
        }
      } else if (provider === "openlibrary") {
        try {
          const data = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`);
          const info = data?.[`ISBN:${isbn}`];
          if (info?.title) return result(info.title, (info.authors || []).map((item) => item.name).join(", "), (info.publishers || []).map((item) => item.name).filter(Boolean).join(", "), info.publish_date, "Open Library");
        } catch (error) {
          failures.push(`Open Library: ${error.message || "servizio non disponibile"}`);
        }
      }
    }
    if (!providers.length) throw new Error("Nessun servizio ISBN attivato nelle impostazioni della Libreria");
    if (failures.length) throw new Error(`Nessun risultato trovato nei servizi raggiungibili. ${failures.join("; ")}.`);
    return null;
  }

  function fillFields(fields, values, onlyEmpty = false) {
    Object.entries(fields).forEach(([name, input]) => {
      const value = typeof values[name] === "string" ? values[name].trim() : "";
      if (value && (!onlyEmpty || !input.value.trim())) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  function addLibraryAiAssist(record, fields, container, refresh) {
    const isbnSection = el("section", "lb-tool-section lb-isbn");
    isbnSection.append(el("h3", "lb-section", "Cerca per codice ISBN/EAN"));
    isbnSection.append(el("p", "lb-note", "Per ISBN-10 o EAN librari 978/979. Invia solo il codice ai servizi attivati nelle impostazioni. Non salva nulla: controlla i campi e premi Salva."));
    const isbnField = textField("ISBN / EAN", findIsbn(record.name));
    const isbnStatus = el("p", "lb-note");
    isbnStatus.setAttribute("role", "status");
    isbnStatus.setAttribute("aria-live", "polite");
    const isbnButton = button("Cerca per ISBN", null, async () => {
      const code = findIsbn(isbnField.input.value);
      if (!code) {
        isbnStatus.textContent = "Codice non valido: servono 10 o 13 cifre con cifra di controllo corretta.";
        return;
      }
      isbnButton.disabled = true;
      isbnStatus.textContent = "Cerco il libro…";
      try {
        const found = await lookupIsbn(code, record.name);
        if (!found) {
          isbnStatus.textContent = "Nessun risultato per questo codice. Prova con Gemini.";
        } else if (found.mismatch && !window.confirm(`${found.source} propone «${found.title}», che non somiglia al nome del file «${record.name}». Potrebbe essere un'altra edizione o lingua. Compilare comunque i campi?`)) {
          isbnStatus.textContent = `Risultato scartato (${found.source}: «${found.title}»): non corrisponde al nome del file.`;
        } else {
          fillFields(fields, found, prefs().isbnFillEmpty === true);
          refresh();
          isbnStatus.textContent = `Trovato su ${found.source}: «${found.title}»${found.author ? ` di ${found.author}` : ""}. Controlla i campi e premi Salva.`;
        }
      } catch (error) {
        isbnStatus.textContent = `Ricerca non riuscita: ${error.message || "errore di rete"}`;
      } finally {
        isbnButton.disabled = false;
      }
    }, false);
    const isbnFromFile = button("Cerca nel file", null, async () => {
      isbnFromFile.disabled = true;
      isbnStatus.textContent = "Cerco il codice nelle prime pagine…";
      try {
        const extracted = await extractLibraryAiText(record);
        const code = findIsbn(extracted.text);
        if (code) {
          isbnField.input.value = code;
          isbnStatus.textContent = `Codice trovato: ${code}. Premi «Cerca per ISBN».`;
        } else {
          isbnStatus.textContent = "Nessun ISBN valido nelle prime pagine. Scrivilo a mano dal retro della copertina.";
        }
      } catch (error) {
        isbnStatus.textContent = `Lettura non riuscita: ${error.message || "errore"}`;
      } finally {
        isbnFromFile.disabled = false;
      }
    }, true);
    const amazon = button("Cerca su Amazon.it", ICONS.open, () => {
      const code = findIsbn(isbnField.input.value);
      if (!code) {
        isbnStatus.textContent = "Inserisci un ISBN valido prima di cercare su Amazon.";
        return;
      }
      window.open(`https://www.amazon.it/s?k=${encodeURIComponent(code)}`, "_blank", "noopener,noreferrer");
    });
    if (prefs().isbnAmazon !== false) isbnSection.append(isbnField.wrap, isbnButton, isbnFromFile, amazon, isbnStatus);
    else isbnSection.append(isbnField.wrap, isbnButton, isbnFromFile, isbnStatus);
    container.append(isbnSection);

    const section = el("section", "lb-tool-section lb-ai-metadata");
    section.append(el("h3", "lb-section", "Proposta metadati con Gemini"));
    section.append(el("p", "lb-note", "Estrae sul dispositivo fino a 8.000 caratteri dai primi capitoli dell'EPUB o dalle prime 5 pagine del PDF e prepara una miniatura della copertina (o della prima pagina PDF) per il riconoscimento visivo. Controlla l'anteprima: estratto, immagine e nome del file saranno inviati a Gemini solo dopo la tua conferma. Non salva né rinomina automaticamente."));

    const status = el("p", "lb-note");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    let preparedImage = null;
    const coverPreview = el("img", "lb-ai-cover-preview");
    coverPreview.alt = "Anteprima della copertina che può essere inviata a Gemini";
    coverPreview.hidden = true;
    coverPreview.tabIndex = 0;
    coverPreview.title = "Clicca per ingrandire";
    coverPreview.style.cursor = "zoom-in";
    const zoomCover = () => {
      if (!coverPreview.src) return;
      const zoom = document.createElement("dialog");
      zoom.className = "lb-cover-zoom";
      zoom.setAttribute("aria-label", "Copertina ingrandita. Clicca per chiudere.");
      const big = el("img");
      big.src = coverPreview.src;
      big.alt = "Copertina ingrandita";
      zoom.append(big);
      zoom.addEventListener("click", () => zoom.close());
      zoom.addEventListener("close", () => zoom.remove());
      document.body.append(zoom);
      zoom.showModal();
    };
    coverPreview.addEventListener("click", zoomCover);
    coverPreview.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        zoomCover();
      }
    });
    const extractButton = button("Estrai anteprima", null, async () => {
      extractButton.disabled = true;
      sendButton.hidden = true;
      coverButton.hidden = true;
      preview.hidden = true;
      previewDetails.hidden = true;
      coverPreview.hidden = true;
      preparedImage = null;
      status.textContent = "Estraggo il testo sul dispositivo…";
      try {
        const extracted = await extractLibraryAiText(record);
        preview.value = extracted.text;
        preparedImage = extracted.image;
        previewDetails.hidden = !extracted.text;
        previewDetails.open = Boolean(extracted.text);
        preview.hidden = !extracted.text;
        if (preparedImage) {
          coverPreview.src = preparedImage.previewUrl;
          coverPreview.hidden = false;
        }
        sendButton.hidden = false;
        sendButton.disabled = !window.CyberPulseAi?.isEnabled();
        coverButton.hidden = !preparedImage;
        coverButton.disabled = !window.CyberPulseAi?.isEnabled();
        status.textContent = `Anteprima pronta: ${extracted.text.length} caratteri dalle ${extracted.source}${preparedImage ? "; copertina/1ª pagina preparata per il riconoscimento visivo" : `; immagine non disponibile${extracted.imageError ? ` (${extracted.imageError})` : ""}`}.`;
        if (!window.CyberPulseAi?.isEnabled()) status.textContent += " Per inviarla, attiva Livello AI e configura la chiave Gemini nelle Impostazioni.";
      } catch (error) {
        status.textContent = `Estrazione non riuscita: ${error.message || "errore"}`;
      } finally {
        extractButton.disabled = false;
      }
    });

    const previewDetails = el("details", "lb-ai-preview");
    previewDetails.hidden = true;
    const summary = el("summary", "", "Mostra il testo estratto");
    const preview = el("textarea", "lb-ai-preview-text");
    preview.readOnly = true;
    preview.maxLength = LIBRARY_AI_MAX_CHARS;
    preview.setAttribute("aria-label", "Anteprima del testo che sarà inviato a Gemini");
    preview.rows = 8;
    previewDetails.append(summary, preview);

    const analyze = async (coverOnly) => {
      const source = coverOnly ? "" : preview.value;
      if ((!source && !preparedImage) || !window.CyberPulseAi?.isEnabled()) {
        status.textContent = "Attiva Livello AI e configura la chiave Gemini nelle Impostazioni.";
        return;
      }
      if (!window.confirm(`Inviare a Gemini ${source ? `l'estratto di ${source.length} caratteri` : "nessun testo estratto"}${preparedImage ? " e la miniatura della copertina/prima pagina" : ""}, oltre al nome del file «${record.name}»? Il resto del libro non verrà inviato.`)) return;
      extractButton.disabled = true;
      sendButton.disabled = true;
      coverButton.disabled = true;
      status.textContent = `Gemini sta analizzando ${source && preparedImage ? "il testo e la copertina" : preparedImage ? "la copertina" : "il testo"}…`;
      try {
        const result = await window.CyberPulseAi.run("library-metadata", {
          text: `Nome file: ${record.name}\n\n${source || "Usa la copertina allegata per leggere titolo, autore e gli eventuali dati editoriali visibili."}`,
          image: preparedImage ? { mimeType: preparedImage.mimeType, data: preparedImage.data } : undefined,
        });
        const metadata = result?.metadata;
        if (!metadata || typeof metadata.title !== "string" || !metadata.title.trim()) {
          throw new Error("Gemini non ha restituito una proposta valida.");
        }
        const values = {
          title: metadata.title,
          author: metadata.author,
          publisher: metadata.publisher,
          year: metadata.year,
          month: metadata.month,
          series: metadata.series,
          volume: metadata.volume,
          chapter: metadata.chapter,
        };
        Object.entries(fields).forEach(([name, input]) => {
          const value = typeof values[name] === "string" ? values[name].trim() : "";
          if (value) {
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
        refresh();
        status.textContent = record.folderId
          ? "Proposta inserita nei campi. Verificala, lascia attiva «Rinomina anche i file nelle cartelle collegate» e premi Salva; conferma la rinomina. La cartella deve avere il permesso di scrittura."
          : "Proposta inserita nei campi. Verificala e premi Salva. Per i file aggiunti singolarmente il browser aggiorna solo il nome nella Libreria, non l'originale sul dispositivo.";
      } catch (error) {
        if (preparedImage && error?.code === "BAD_REQUEST" && error.message === "Richiesta non valida.") {
          status.textContent = "Il backend GAS collegato usa ancora il limite precedente e rifiuta la copertina. Aggiorna Code.gs, authService.gs e geminiService.gs nel progetto Apps Script collegato e pubblica una nuova versione della distribuzione.";
        } else {
          status.textContent = error?.code
            ? window.CyberPulseAi?.describe(error) || `Analisi non riuscita: ${error.message || "errore"}`
            : `Analisi non riuscita: ${error.message || "errore"}`;
        }
      } finally {
        extractButton.disabled = false;
        sendButton.disabled = !window.CyberPulseAi?.isEnabled();
        coverButton.disabled = !window.CyberPulseAi?.isEnabled();
      }
    };
    const sendButton = button("Analizza con Gemini", null, () => analyze(false), false);
    const coverButton = button("Solo copertina (più veloce)", null, () => analyze(true), false);
    sendButton.hidden = true;
    coverButton.hidden = true;
    if (!window.CyberPulseAi?.isEnabled()) {
      sendButton.disabled = true;
      coverButton.disabled = true;
    }
    section.append(extractButton, coverPreview, previewDetails, coverButton, sendButton, status);
    container.append(section);
  }

  // Analisi in coda con Gemini: una richiesta alla volta e con pause, per restare nei limiti di quota della chiave.
  const LIBRARY_AI_BULK_DELAY_MS = 7000;
  const LIBRARY_AI_BULK_MAX = 40;

  function addLibraryAiBulk(section, entries) {
    section.append(el("h3", "lb-section", "Proposte Gemini per più libri"));
    section.append(el("p", "lb-note", `Per ogni libro selezionato (EPUB e PDF, massimo ${LIBRARY_AI_BULK_MAX} per volta) cerca prima un ISBN valido e consulta i servizi attivati. Gli altri vengono inviati a Gemini con la copertina o la prima pagina e il nome del file (una richiesta ogni ${LIBRARY_AI_BULK_DELAY_MS / 1000} secondi). Controlla le proposte prima di applicarle.`));
    const status = el("p", "lb-note");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    let cancelled = false;
    let running = false;
    const stop = button("Interrompi", null, () => { cancelled = true; stop.disabled = true; }, true);
    stop.hidden = true;
    const run = button("Analizza i selezionati (ISBN, poi Gemini)", null, async () => {
      if (running) return;
      const queue = entries
        .filter((entry) => entry.pick.checked && (entry.record.type === "epub" || entry.record.type === "pdf"))
        .slice(0, LIBRARY_AI_BULK_MAX);
      if (!queue.length) {
        status.textContent = "Nessun EPUB o PDF selezionato.";
        return;
      }
      if (!window.confirm(`Cercare i dati di ${queue.length} libri per ISBN tramite i servizi attivati e, per quelli senza un risultato utilizzabile, inviare a Gemini la copertina (o il testo iniziale) e il nome file, uno alla volta? Il resto dei libri non verrà inviato e non verrà rinominato nulla senza la tua conferma finale.`)) return;
      running = true;
      cancelled = false;
      run.disabled = true;
      stop.disabled = false;
      stop.hidden = false;
      let done = 0;
      let failed = 0;
      let stopReason = "";
      for (let index = 0; index < queue.length; index += 1) {
        if (cancelled) { stopReason = "Interrotto."; break; }
        const entry = queue[index];
        status.textContent = `Analizzo ${index + 1} di ${queue.length}: ${entry.record.name}…`;
        entry.rowStatus.textContent = "Analisi in corso…";
        let isbnProblem = "";
        try {
          const extracted = await extractLibraryAiText(entry.record);
          const code = findIsbn(entry.record.name) || findIsbn(extracted.text);
          if (code) {
            let found = null;
            try { found = await lookupIsbn(code, entry.record.name); } catch (error) { isbnProblem = error.message || "Ricerca ISBN non riuscita"; }
            if (found && !found.mismatch) {
              fillFields(entry.fields, found, prefs().isbnFillEmpty === true);
              entry.refresh();
              entry.rowStatus.textContent = `Trovato per ISBN ${code} su ${found.source}: controllalo.`;
              done += 1;
              continue;
            }
          }
          if (!window.CyberPulseAi?.isEnabled()) throw new Error(`${isbnProblem || "Nessun risultato ISBN"}; Livello AI non attivo`);
          const useImage = Boolean(extracted.image);
          const result = await window.CyberPulseAi.run("library-metadata", {
            text: `Nome file: ${entry.record.name}\n\n${useImage ? "Usa la copertina allegata per leggere titolo, autore e gli eventuali dati editoriali visibili." : extracted.text}`,
            image: useImage ? { mimeType: extracted.image.mimeType, data: extracted.image.data } : undefined,
          });
          const metadata = result?.metadata;
          if (!metadata || typeof metadata.title !== "string" || !metadata.title.trim()) throw new Error("proposta non valida");
          Object.entries(entry.fields).forEach(([name, input]) => {
            const value = typeof metadata[name] === "string" ? metadata[name].trim() : "";
            if (value) {
              input.value = value;
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          });
          entry.refresh();
          entry.rowStatus.textContent = `${isbnProblem ? `${isbnProblem} ` : ""}Proposta di Gemini inserita: controllala.`;
          done += 1;
        } catch (error) {
          failed += 1;
          const message = error?.code ? window.CyberPulseAi?.describe(error) || error.message : error?.message || "errore";
          entry.rowStatus.textContent = `Analisi non riuscita: ${message}`;
          if (error?.code === "AI_QUOTA" || error?.code === "AI_KEY_INVALID" || error?.code === "AI_KEY_MISSING") {
            stopReason = `${message} Coda fermata.`;
            break;
          }
        }
        if (index < queue.length - 1 && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, LIBRARY_AI_BULK_DELAY_MS));
        }
      }
      status.textContent = [`${done} proposte inserite`, failed ? `${failed} non riuscite` : "", stopReason].filter(Boolean).join(" · ") + ". Controlla le righe e premi «Applica alle righe selezionate».";
      running = false;
      stop.hidden = true;
      run.disabled = false;
    }, false);
    section.append(run, stop, status);
  }

  async function openTools(onlyId, skipScan) {
    const loading = el("div", "lb-dialog-body");
    loading.append(el("p", "lb-note", "Leggo i dati della libreria…"));
    toolsDialog.replaceChildren(loading);
    if (!toolsDialog.open) toolsDialog.showModal();
    const all = await dbAll();
    if (!skipScan) await enrichRecords(all);
    renderTools(all, onlyId, await historyAll());
  }

  function validImportedLibrarySettings(data, keys) {
    const enums = {
      missingFields: ["stop", "omit"], nameConflict: ["stop", "number"], shelfView: ["flat", "folders"],
      sort: Object.keys(SORTS), coverSize: ["small", "medium", "large"], navigation: ["pages", "scroll"],
      fit: ["page", "width", "original"], font: ["serif", "sans", "book"], theme: ["auto", "light", "sepia", "dark"],
      line: [1.35, 1.6, 1.9], width: [560, 720, 920],
    };
    const booleans = ["renameDiskByDefault", "isbnPreferItalian", "isbnFillEmpty", "isbnAmazon", "showFileName", "showDetails", "confirmBulk"];
    const validOrder = (order, permitted) => Array.isArray(order) && order.every((key) => permitted.includes(key)) && new Set(order).size === order.length;
    const validTemplate = (value) => typeof value === "string" && value.length > 0 && value.length <= 240
      && NAME_FIELDS.some((field) => new RegExp(`\\{(?:${field.token}${field.key === "month" ? "|meseNome" : ""})\\}`).test(value));
    for (const [key, value] of Object.entries(data)) {
      if (!keys.includes(key)) return false;
      if (enums[key] && !enums[key].includes(value)) return false;
      if (booleans.includes(key) && typeof value !== "boolean") return false;
      if (key === "renameTemplate" && !validTemplate(value)) return false;
      if (key === "renameFieldOrder" && !validOrder(value, NAME_FIELDS.map((field) => field.key))) return false;
      if (key === "isbnProviders" && !validOrder(value, Object.keys(ISBN_PROVIDERS))) return false;
      if (key === "zoom" && (typeof value !== "number" || value < 0.5 || value > 3)) return false;
      if (key === "size" && (!Number.isInteger(value) || value < 13 || value > 34)) return false;
      if (key === "renameProfiles") {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        for (const [profile, config] of Object.entries(value)) {
          if (!Object.hasOwn(RENAME_PROFILES, profile) || !config || typeof config !== "object" || Array.isArray(config)
            || Object.keys(config).some((item) => !["template", "order", "separator", "monthFormat", "yearFormat", "numberFormat"].includes(item))
            || !validTemplate(config.template)
            || (config.order !== null && !validOrder(config.order, NAME_FIELDS.map((field) => field.key)))
            || typeof config.separator !== "string" || !config.separator.length || config.separator.length > 12 || /[\\/*?"<>|\u0000-\u001f]/.test(config.separator)
            || !["number", "name"].includes(config.monthFormat)
            || (config.yearFormat !== undefined && !["full", "short"].includes(config.yearFormat))
            || !["plain", "padded"].includes(config.numberFormat)) return false;
        }
      }
    }
    return true;
  }

  function openLibrarySettings(section = "home", selectedProfile = "book") {
    const sections = {
      names: { title: "Nomi e metadati", description: "Profili, campi e regole di rinomina", icon: ICONS.edit },
      isbn: { title: "Ricerca ISBN", description: "Servizi e dati bibliografici", icon: ICONS.search },
      shelf: { title: "Scaffale", description: "Vista, copertine e ordinamento", icon: ICONS.book },
      reader: { title: "Lettore", description: "Pagina, testo e navigazione", icon: ICONS.text },
      data: { title: "Sicurezza e dati", description: "Conferme, importazione e ripristino", icon: ICONS.settings },
    };
    if (section !== "home" && !sections[section]) section = "home";
    librarySettingsDirty = false;
    const body = el("div", "lb-settings-body");
    const header = el("header", "lb-settings-header");
    const navigate = (next, profile = selectedProfile) => {
      if (librarySettingsDirty && !window.confirm("Ci sono modifiche non salvate. Vuoi abbandonarle?")) return;
      openLibrarySettings(next, profile);
      librarySettingsDialog.querySelector(".lb-settings-back, .lb-settings-item, .lb-settings-close")?.focus();
    };
    const closeSettings = () => {
      if (librarySettingsDirty && !window.confirm("Ci sono modifiche non salvate. Vuoi abbandonarle?")) return;
      librarySettingsDirty = false;
      librarySettingsDialog.close();
    };
    if (section !== "home") {
      const back = iconButton("Torna alle impostazioni della Libreria", ICONS.back, () => navigate("home"));
      back.classList.add("lb-settings-back");
      header.append(back);
    }
    const heading = el("div", "lb-settings-heading");
    heading.append(el("span", "lb-settings-eyebrow", section === "home" ? "CYBER LIBRARY" : "IMPOSTAZIONI LIBRERIA"));
    heading.append(el("h2", "lb-settings-title", section === "home" ? "Impostazioni" : sections[section].title));
    header.append(heading);
    const close = iconButton("Chiudi impostazioni", ICONS.close, closeSettings);
    close.classList.add("lb-settings-close");
    header.append(close);
    body.append(header);
    if (section === "home") {
      const intro = el("p", "lb-settings-intro", "Personalizza la tua libreria, dalla lettura alla gestione dei file.");
      const list = el("nav", "lb-settings-menu");
      list.setAttribute("aria-label", "Categorie delle impostazioni");
      Object.entries(sections).forEach(([key, info]) => {
        const item = el("button", "lb-settings-item");
        item.type = "button";
        const badge = el("span", "lb-settings-item-icon");
        badge.append(icon(info.icon, 22));
        const text = el("span", "lb-settings-item-text");
        text.append(el("strong", "", info.title), el("span", "", info.description));
        item.append(badge, text, icon(ICONS.next, 20));
        item.addEventListener("click", () => navigate(key));
        list.append(item);
      });
      body.append(intro, list);
      librarySettingsDialog.replaceChildren(body);
      if (!librarySettingsDialog.open) librarySettingsDialog.showModal();
      librarySettingsDialog.scrollTop = 0;
      return;
    }
    const status = el("p", "lb-tools-notice");
    status.setAttribute("role", "status");
    const persist = (updated) => {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      } catch (error) {
        status.textContent = `Impossibile salvare le impostazioni: ${error.message || "archiviazione non disponibile"}.`;
        return false;
      }
      prefsCache = { ...DEFAULT_PREFS, ...updated };
      status.textContent = "Impostazioni salvate.";
      return true;
    };
    const save = (patch) => persist({ ...prefs(), ...patch });
    const refreshSettings = (message) => {
      const scroll = librarySettingsDialog.scrollTop;
      openLibrarySettings(section, selectedProfile);
      librarySettingsDialog.scrollTop = scroll;
      const notice = librarySettingsDialog.querySelector('[role="status"]');
      if (notice) notice.textContent = message;
    };
    const panel = el("section", "lb-tool-panel lb-settings-panel");
    panel.id = "lb-settings-panel";
    panel.setAttribute("aria-label", sections[section].title);
    const select = (label, options, value, change) => {
      panel.append(settingsRow(label, settingsSelect(label, options, value, change)));
    };
    const toggle = (label, value, change) => {
      const control = checkbox(label, value);
      control.input.addEventListener("change", () => change(control.input.checked));
      panel.append(control.wrap);
    };
    const resetKeys = (keys) => {
      if (!window.confirm("Ripristinare solo le impostazioni di questa sezione? Libri e metadati non saranno cancellati.")) return;
      const updated = { ...prefs() };
      keys.forEach((key) => delete updated[key]);
      if (persist(updated)) {
        if (section === "shelf") renderShelf();
        openLibrarySettings(section, selectedProfile);
      }
    };
    if (section === "names") {
      panel.append(el("p", "lb-note", "Il profilo è suggerito in base al tipo o al nome del file e può essere cambiato per ogni libro. I metadati rimangono salvati anche se esclusi dal nome."));
      const profileSelect = settingsSelect("Profilo", Object.entries(RENAME_PROFILES).map(([key, value]) => [key, value.label]), selectedProfile, (value) => {
        if (librarySettingsDirty && !window.confirm("Ci sono modifiche non salvate. Vuoi cambiare profilo senza salvarle?")) {
          profileSelect.value = selectedProfile;
          return;
        }
        openLibrarySettings(section, value);
        librarySettingsDialog.querySelector('select[aria-label="Profilo"]')?.focus();
      });
      panel.append(settingsRow("Profilo", profileSelect));
      const config = renameProfile(selectedProfile);
      const fields = renameFields(selectedProfile);
      const list = el("div", "lb-name-order");
      const preview = el("p", "lb-fix-new");
      const separatorField = textField("Separatore tra i campi", config.separator);
      const separator = separatorField.input;
      separator.maxLength = 12;
      separator.addEventListener("input", () => { librarySettingsDirty = true; updatePreview(); });
      const monthFormat = settingsSelect("Formato mese", [["number", "Numero (01)"], ["name", "Nome (gennaio)"]], config.monthFormat, () => { librarySettingsDirty = true; updatePreview(); });
      const yearFormat = settingsSelect("Formato anno", [["full", "Quattro cifre (2025)"], ["short", "Due cifre (25)"]], config.yearFormat, () => { librarySettingsDirty = true; updatePreview(); });
      const numberFormat = settingsSelect("Formato numeri", [["plain", "Naturale (1)"], ["padded", "Due cifre (01)"]], config.numberFormat, () => { librarySettingsDirty = true; updatePreview(); });
      const updatePreview = () => {
        const sample = { title: "Titolo", author: "Autore", publisher: "Editore", year: "2025", month: "01", series: "Serie", volume: "1", chapter: "2" };
        const values = { titolo: sample.title, autore: sample.author, editore: sample.publisher, anno: yearFormat.value === "short" ? "25" : sample.year, mese: monthFormat.value === "name" ? "Gennaio" : "01", serie: sample.series, volume: numberFormat.value === "padded" ? "01" : "1", capitolo: numberFormat.value === "padded" ? "02" : "2" };
        preview.textContent = `Esempio dei campi selezionati: ${fields.filter((field) => field.enabled).map((field) => `${field.prefix || ""}${values[field.token]}`).join(separator.value)}.pdf`;
      };
      const draw = () => {
        list.replaceChildren();
        fields.forEach((field, index) => {
          const row = el("div", "lb-name-order-row");
          const check = checkbox(field.label, field.enabled);
          check.input.addEventListener("change", () => { field.enabled = check.input.checked; librarySettingsDirty = true; updatePreview(); });
          const move = (delta) => {
            librarySettingsDirty = true;
            [fields[index], fields[index + delta]] = [fields[index + delta], fields[index]];
            draw();
            list.querySelector(`[data-field="${field.key}"] .lb-name-${delta < 0 ? "up" : "down"}`)?.focus();
          };
          const up = button("↑", null, () => move(-1));
          const down = button("↓", null, () => move(1));
          up.classList.add("lb-name-up"); down.classList.add("lb-name-down");
          up.disabled = index === 0; down.disabled = index === fields.length - 1;
          up.setAttribute("aria-label", `Sposta ${field.label} in alto`);
          down.setAttribute("aria-label", `Sposta ${field.label} in basso`);
          row.dataset.field = field.key;
          row.append(check.wrap, up, down);
          list.append(row);
        });
        updatePreview();
      };
      draw();
      panel.append(list, separatorField.wrap, settingsRow("Formato mese", monthFormat), settingsRow("Formato anno", yearFormat), settingsRow("Formato numeri", numberFormat), preview);
      const disk = checkbox("Seleziona inizialmente la rinomina dei file nelle cartelle collegate", prefs().renameDiskByDefault !== false);
      disk.input.addEventListener("change", () => { librarySettingsDirty = true; });
      panel.append(disk.wrap);
      select("Campi mancanti", [["stop", "Ferma e segnala"], ["omit", "Ometti dal nome"]], prefs().missingFields || "stop", (value) => save({ missingFields: value }));
      select("Nome già esistente", [["stop", "Ferma e segnala"], ["number", "Aggiungi numero progressivo"]], prefs().nameConflict || "stop", (value) => save({ nameConflict: value }));
      const persistProfile = (template, order) => {
        if (!separator.value.length || /[\\/*?"<>|\u0000-\u001f]/.test(separator.value)) {
          status.textContent = "Il separatore non può essere vuoto o contenere caratteri vietati nei nomi file."; return false;
        }
        const profiles = { ...prefs().renameProfiles, [selectedProfile]: { template, order, separator: separator.value, monthFormat: monthFormat.value, yearFormat: yearFormat.value, numberFormat: numberFormat.value } };
        return save({ renameProfiles: profiles, renameDiskByDefault: disk.input.checked });
      };
      panel.append(button("Salva campi e ordine", null, () => {
        const enabled = fields.filter((field) => field.enabled);
        if (!enabled.length) { status.textContent = "Seleziona almeno un campo."; return; }
        if (persistProfile(enabled.map((field) => `${field.prefix || ""}{${field.token}}`).join(" - "), fields.map((field) => field.key))) refreshSettings("Profilo salvato.");
      }, false));
      const details = el("details");
      details.append(el("summary", "", "Modello personalizzato avanzato"));
      const advanced = textField("Modello del nome file", config.template);
      advanced.input.maxLength = 240;
      advanced.input.addEventListener("input", () => { librarySettingsDirty = true; });
      details.append(advanced.wrap, el("p", "lb-note", "Campi: {titolo}, {autore}, {editore}, {anno}, {mese}, {meseNome}, {serie}, {volume}, {capitolo}. L'anteprima sopra mostra i campi ordinati, non il modello avanzato."));
      details.append(button("Salva modello personalizzato", null, () => {
        const value = advanced.input.value.trim();
        if (!value || !NAME_FIELDS.some((field) => new RegExp(`\\{(?:${field.token}${field.key === "month" ? "|meseNome" : ""})\\}`).test(value))) {
          status.textContent = "Il modello deve contenere almeno un campo riconosciuto."; return;
        }
        if (persistProfile(value, null)) refreshSettings("Modello personalizzato salvato.");
      }));
      panel.append(details, button("Ripristina questa sezione", null, () => resetKeys(["renameProfiles", "renameTemplate", "renameFieldOrder", "renameDiskByDefault", "missingFields", "nameConflict"])));
    } else if (section === "isbn") {
      panel.append(el("p", "lb-note", "Attiva e ordina i servizi. La preferenza italiana si applica ai risultati Google Books quando indicano la lingua; non garantisce l'edizione corretta."));
      const selected = Array.isArray(prefs().isbnProviders) ? [...prefs().isbnProviders] : Object.keys(ISBN_PROVIDERS);
      const order = [...selected, ...Object.keys(ISBN_PROVIDERS).filter((key) => !selected.includes(key))];
      const list = el("div", "lb-name-order");
      const draw = () => {
        list.replaceChildren();
        order.forEach((key, index) => {
          const row = el("div", "lb-name-order-row");
          const check = checkbox(ISBN_PROVIDERS[key], selected.includes(key));
          check.input.addEventListener("change", () => {
            if (check.input.checked) selected.push(key); else selected.splice(selected.indexOf(key), 1);
            librarySettingsDirty = true;
          });
          const up = button("↑", null, () => { [order[index - 1], order[index]] = [order[index], order[index - 1]]; librarySettingsDirty = true; draw(); });
          const down = button("↓", null, () => { [order[index + 1], order[index]] = [order[index], order[index + 1]]; librarySettingsDirty = true; draw(); });
          up.disabled = index === 0; down.disabled = index === order.length - 1;
          up.setAttribute("aria-label", `Sposta ${ISBN_PROVIDERS[key]} in alto`);
          down.setAttribute("aria-label", `Sposta ${ISBN_PROVIDERS[key]} in basso`);
          row.append(check.wrap, up, down); list.append(row);
        });
      };
      draw();
      panel.append(list, button("Salva servizi e ordine", null, () => {
        if (save({ isbnProviders: order.filter((key) => selected.includes(key)) })) librarySettingsDirty = false;
      }, false));
      toggle("Preferisci risultati in italiano quando disponibili", prefs().isbnPreferItalian === true, (value) => save({ isbnPreferItalian: value }));
      toggle("Compila solo i campi vuoti con i risultati ISBN", prefs().isbnFillEmpty === true, (value) => save({ isbnFillEmpty: value }));
      toggle("Mostra il pulsante di ricerca su Amazon.it", prefs().isbnAmazon !== false, (value) => save({ isbnAmazon: value }));
      panel.append(button("Ripristina questa sezione", null, () => resetKeys(["isbnProviders", "isbnPreferItalian", "isbnFillEmpty", "isbnAmazon"])));
    } else if (section === "shelf") {
      select("Vista dello scaffale", [["flat", "Copertine"], ["folders", "Cartelle"]], prefs().shelfView || "flat", (value) => { if (save({ shelfView: value })) renderShelf(); });
      select("Ordinamento", Object.entries(SORTS), prefs().sort || "recent", (value) => { if (save({ sort: value })) renderShelf(); });
      select("Dimensione copertine", COVER_SIZES, prefs().coverSize || "medium", (value) => { if (save({ coverSize: value })) renderShelf(); });
      toggle("Mostra il nome completo del file", prefs().showFileName !== false, (value) => { if (save({ showFileName: value })) renderShelf(); });
      toggle("Mostra informazioni aggiuntive", prefs().showDetails !== false, (value) => { if (save({ showDetails: value })) renderShelf(); });
      panel.append(button("Ripristina questa sezione", null, () => resetKeys(["shelfView", "sort", "coverSize", "showFileName", "showDetails"])));
    } else if (section === "reader") {
      panel.append(el("p", "lb-note", "Preferenze condivise con i controlli rapidi del lettore."));
      const controls = [
        ["navigation", "Navigazione", [["pages", "Una pagina"], ["scroll", "Scorrimento"]], "pages", String],
        ["fit", "Adattamento PDF", [["page", "Pagina intera"], ["width", "Larghezza"], ["original", "Originale"]], "page", String],
        ["zoom", "Zoom PDF", [[0.5, "50%"], [1, "100%"], [1.5, "150%"], [2, "200%"], [3, "300%"]], 1, Number],
        ["font", "Carattere", [["serif", "Serif"], ["sans", "Senza grazie"], ["book", "Originale"]], "serif", String],
        ["size", "Dimensione testo", [13, 15, 17, 19, 22, 26, 30, 34].map((n) => [n, `${n} px`]), 19, Number],
        ["theme", "Tema", [["auto", "Come l'app"], ["light", "Chiaro"], ["sepia", "Seppia"], ["dark", "Scuro"]], "auto", String],
        ["line", "Interlinea", [[1.35, "Stretta"], [1.6, "Normale"], [1.9, "Ampia"]], 1.6, Number],
        ["width", "Larghezza testo", [[560, "Stretta"], [720, "Media"], [920, "Larga"]], 720, Number],
      ];
      controls.forEach(([key, label, options, fallback, cast]) => {
        const current = prefs()[key] ?? fallback;
        const choices = options.some(([value]) => value === current) ? options : [...options, [current, String(current)]];
        select(label, choices, current, (value) => save({ [key]: cast(value) }));
      });
      panel.append(button("Ripristina questa sezione", null, () => resetKeys(controls.map(([key]) => key))));
    } else {
      panel.append(el("p", "lb-note", "I libri e i metadati restano nel browser. La ricerca ISBN invia il codice ai servizi selezionati; Gemini invia estratti o immagini solo dopo conferma. Amazon si apre separatamente nel browser."));
      toggle("Richiedi conferma per modifiche multiple nella libreria", prefs().confirmBulk !== false, (value) => save({ confirmBulk: value }));
      panel.append(el("p", "lb-note", "La conferma per modificare file sul dispositivo e quella per inviare dati a Gemini sono sempre obbligatorie."));
      const keys = ["renameTemplate", "renameFieldOrder", "renameProfiles", "renameDiskByDefault", "missingFields", "nameConflict", "isbnProviders", "isbnPreferItalian", "isbnFillEmpty", "isbnAmazon", "shelfView", "sort", "coverSize", "showFileName", "showDetails", "navigation", "fit", "zoom", "font", "size", "theme", "line", "width", "confirmBulk"];
      panel.append(button("Esporta impostazioni", null, () => {
        const data = Object.fromEntries(keys.filter((key) => prefs()[key] !== undefined).map((key) => [key, prefs()[key]]));
        const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, settings: data }, null, 2)], { type: "application/json" }));
        const link = el("a");
        link.href = url; link.download = "cyber-library-impostazioni.json"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
      const input = el("input");
      input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
      input.addEventListener("change", async () => {
        try {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 100000) throw new Error("file troppo grande");
          const imported = JSON.parse(await file.text());
          if (imported?.version !== 1 || !imported.settings || typeof imported.settings !== "object" || Array.isArray(imported.settings)) throw new Error("formato non riconosciuto");
          const data = imported.settings;
          if (!validImportedLibrarySettings(data, keys)) throw new Error("impostazioni non valide");
          if (!window.confirm("Sostituire le impostazioni della Libreria con quelle importate? Libri e metadati non saranno modificati.")) return;
          const updated = { ...prefs() };
          keys.forEach((key) => delete updated[key]);
          Object.assign(updated, data);
          if (persist(updated)) { renderShelf(); openLibrarySettings(section); }
        } catch (error) {
          status.textContent = `Importazione non riuscita: ${error.message || "file non valido"}.`;
        } finally { input.value = ""; }
      });
      panel.append(input, button("Importa impostazioni", null, () => input.click()), button("Ripristina sicurezza e dati", null, () => resetKeys(["confirmBulk"])));
    }
    body.append(panel, status);
    librarySettingsDialog.replaceChildren(body);
    if (!librarySettingsDialog.open) librarySettingsDialog.showModal();
    librarySettingsDialog.scrollTop = 0;
  }

  function renderTools(all, onlyId, history) {
    const state = readState();
    const body = el("div", "lb-dialog-body");
    body.append(el("h2", "lb-dialog-title", onlyId ? "Modifica nome e dati" : "Sistema la libreria"));
    body.append(el("p", "lb-note", "Modifica titolo, autore, casa editrice, anno, mese, serie, volume e capitolo. Le spunte scelgono solo i campi nel nome file: tutti i metadati vengono salvati. Le modifiche ai file nelle cartelle collegate richiedono conferma."));
    if (toolsNotice) {
      const notice = el("p", "lb-tools-notice", toolsNotice);
      notice.setAttribute("role", "status");
      body.append(notice);
      toolsNotice = "";
    }

    // Sezioni separate in schede; per il singolo libro (onlyId) tutto resta in un solo pannello.
    const TOOL_TABS = [
      ["names", "Nomi e dati"],
      ["dups", "Doppioni"],
      ["folders", "Cartelle"],
      ["history", "Cronologia"],
    ];
    const panels = {};
    if (!onlyId) {
      if (!TOOL_TABS.some(([key]) => key === toolsTab)) toolsTab = "names";
      const tabBar = el("div", "lb-tool-tabs");
      tabBar.setAttribute("role", "tablist");
      tabBar.setAttribute("aria-label", "Strumenti della libreria");
      const tabButtons = {};
      const select = (key, focus) => {
        toolsTab = key;
        TOOL_TABS.forEach(([name]) => {
          const active = name === key;
          tabButtons[name].setAttribute("aria-selected", String(active));
          tabButtons[name].tabIndex = active ? 0 : -1;
          panels[name].hidden = !active;
        });
        if (focus) tabButtons[key].focus();
      };
      TOOL_TABS.forEach(([key, label], index) => {
        const tab = el("button", "lb-tool-tab", label);
        tab.type = "button";
        tab.id = `lb-tool-tab-${key}`;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `lb-tool-panel-${key}`);
        tab.addEventListener("click", () => select(key, false));
        tab.addEventListener("keydown", (event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          select(TOOL_TABS[(index + step + TOOL_TABS.length) % TOOL_TABS.length][0], true);
        });
        tabButtons[key] = tab;
        tabBar.append(tab);
        const panel = el("div", "lb-tool-panel");
        panel.id = `lb-tool-panel-${key}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panels[key] = panel;
      });
      body.append(tabBar, ...TOOL_TABS.map(([key]) => panels[key]));
      tabBar.append(button("Chiudi", null, () => toolsDialog.close()));
      select(toolsTab, false);
    }
    const panelFor = (key) => (onlyId ? body : panels[key]);

    if (!onlyId) {
      const undoSection = el("section", "lb-tool-section");
      undoSection.append(el("h3", "lb-section", "Annulla rinomina"));
      if (history.length) {
        const latest = history.sort((a, b) => b.createdAt - a.createdAt)[0];
        undoSection.append(el("p", "lb-note", `${latest.changes.length} elementi nell'ultima modifica · ${new Date(latest.createdAt).toLocaleString("it-IT")}`));
        undoSection.append(button("Annulla ultima operazione", ICONS.back, async () => {
          const diskChanges = latest.changes.filter((change) => change.disk).length;
          if (!window.confirm(`Ripristinare nomi e metadati degli ultimi ${latest.changes.length} elementi${diskChanges ? `, rinominando anche ${diskChanges} file sul dispositivo` : ""}?`)) return;
          const result = await undoRenameAction(latest);
          toolsNotice = result;
          await openTools(undefined, true);
        }, false));
      } else {
        undoSection.append(el("p", "lb-note", "Non ci sono rinomine recenti da annullare."));
      }
      panelFor("history").append(undoSection);

      const analysis = el("section", "lb-tool-section");
      analysis.append(el("h3", "lb-section", "Copie identiche"));
      analysis.append(el("p", "lb-note", "Confronta il contenuto dei file con SHA-256, anche quando i nomi sono diversi. La scansione legge i file locali; non carica nulla online."));
      const hashStatus = el("p", "lb-note");
      hashStatus.setAttribute("role", "status");
      const hashResults = el("div");
      analysis.append(button("Cerca copie identiche", ICONS.tools, async () => {
        hashResults.replaceChildren();
        try {
          const result = await contentDuplicateGroups(all, (done, total) => {
            hashStatus.textContent = `Analizzo ${done} di ${total} file…`;
          });
          const groups = result.groups;
          hashStatus.textContent = groups.length ? `Trovati ${groups.length} gruppi di file identici.` : "Nessuna copia identica trovata.";
          if (result.skipped) hashStatus.textContent += ` ${result.skipped} file oltre 256 MB esclusi per proteggere la memoria del dispositivo.`;
          groups.forEach((group, index) => {
            const box = el("fieldset", "lb-dup");
            box.append(el("legend", "", `Gruppo ${index + 1} · ${group.length} copie identiche`));
            const best = [...group].sort((a, b) => keepScore(b, state) - keepScore(a, state))[0];
            group.forEach((record) => {
              const row = el("label", "lb-dup-row");
              const radio = el("input");
              radio.type = "radio";
              radio.name = `hash-dup-${index}`;
              radio.value = record.id;
              radio.checked = record.id === best.id;
              row.append(radio, el("span", "", `${record.title} · ${record.folderId ? record.path : record.name} · ${record.type.toUpperCase()} · ${formatSize(record.size)}`));
              box.append(row);
            });
            const wipe = group.some((record) => record.folderId)
              ? checkbox("Elimina dal dispositivo anche le copie scartate delle cartelle collegate (irreversibile)", false)
              : null;
            if (wipe) box.append(wipe.wrap);
            box.append(button("Rimuovi le altre", null, async () => {
              const keepId = box.querySelector("input:checked")?.value;
              try {
                const doomed = group.filter((record) => record.id !== keepId);
                const deleteFiles = Boolean(wipe?.input.checked);
                const diskCount = deleteFiles ? doomed.filter((record) => record.folderId).length : 0;
                if (diskCount && !window.confirm(`Eliminare anche ${diskCount} file dal dispositivo? Non si può annullare.`)) return;
                const removed = await resolveGroup(group, keepId, deleteFiles);
                toolsNotice = `${removed} copie rimosse dalla libreria${diskCount ? `; ${diskCount} file eliminati dal dispositivo` : "; i file sul dispositivo sono rimasti intatti"}.`;
                await openTools(undefined, true);
              } catch (error) {
                hashStatus.textContent = `Non sono riuscito a completare: ${error.message || "errore"}`;
              }
            }));
            hashResults.append(box);
          });
        } catch (error) {
          hashStatus.textContent = `Analisi non riuscita: ${error.message || "errore"}`;
        }
      }));
      analysis.append(hashStatus, hashResults);
      panelFor("dups").append(analysis);

      const foldersPanel = el("section", "lb-tool-section");
      foldersPanel.append(el("h3", "lb-section", "Cartelle collegate"));
      foldersPanel.append(el("p", "lb-note", "Controlla file spostati o mancanti. I file non trovati restano nella libreria finché non decidi tu cosa fare."));
      const folderStatus = el("p", "lb-note");
      folderStatus.setAttribute("role", "status");
      foldersPanel.append(button("Controlla cartelle", ICONS.refresh, async () => {
        folderStatus.textContent = "Controllo le cartelle collegate…";
        try {
          folderStatus.textContent = await auditLinkedFolders(all);
        } catch (error) {
          folderStatus.textContent = `Controllo non riuscito: ${error.message || "errore"}`;
        }
      }));
      foldersPanel.append(folderStatus);
      panelFor("folders").append(foldersPanel);
    }

    const finish = async (message) => {
      toolsNotice = message;
      say(message);
      if (onlyId) toolsDialog.close();
      else await openTools(undefined, true);
      if (ui.tab === "shelf") renderShelf();
    };

    const groups = onlyId ? [] : duplicateGroups(all);
    if (groups.length) {
      panelFor("dups").append(el("h3", "lb-section", `Doppioni (${groups.length})`));
      panelFor("dups").append(el("p", "lb-note",  "Libri con lo stesso titolo e autore. Per ogni gruppo scegli la copia da tenere: le altre escono dalla libreria. Se ne tieni una con meno dati (anno, autore) o senza progresso di lettura, li prende dalle copie scartate."));
      const hasFolder = groups.some((group) => group.some((record) => record.folderId));
      const wipe = checkbox("Elimina dal dispositivo anche le copie scartate delle cartelle collegate (irreversibile)", false);
      groups.forEach((group, index) => {
        const best = [...group].sort((a, b) => keepScore(b, state) - keepScore(a, state))[0];
        const meta = proposal(best);
        const box = el("fieldset", "lb-dup");
        box.append(el("legend", "", `${meta.title}${meta.author ? ` — ${meta.author}` : ""}`));
        group.forEach((record) => {
          const row = el("label", "lb-dup-row");
          const radio = el("input");
          radio.type = "radio";
          radio.name = `dup-${index}`;
          radio.value = record.id;
          radio.checked = record === best;
          const identical = group.some((other) => other !== record && other.type === record.type && other.size === record.size);
          const pct = state[record.id]?.pct;
          row.append(radio, el("span", "", [record.type.toUpperCase(), formatSize(record.size), record.year, record.folderId ? record.path : record.name, identical ? "identico a un'altra copia" : "", pct ? `letto ${pct}%` : ""].filter(Boolean).join(" · ")));
          box.append(row);
        });
        box.append(button("Tieni la selezionata", null, async () => {
          const keepId = box.querySelector("input:checked")?.value;
          const doomed = group.filter((record) => record.id !== keepId);
          const wipeFiles = wipe.input.checked && doomed.some((record) => record.folderId);
          if (wipeFiles && !window.confirm(`Eliminare dal dispositivo ${doomed.filter((record) => record.folderId).length} file? Non si può annullare.`)) return;
          try {
            const removed = await resolveGroup(group, keepId, wipeFiles);
            await finish(`${removed} ${removed === 1 ? "copia rimossa" : "copie rimosse"} dalla libreria.`);
          } catch (error) {
            say(`Non sono riuscito a completare: ${error.message || "errore"}`);
          }
        }));
        panelFor("dups").append(box);
      });
      const bulk = el("div", "lb-tools-bar");
      if (hasFolder) bulk.append(wipe.wrap);
      bulk.append(button("Risolvi tutti (tieni la copia migliore)", null, async () => {
        const wipeFiles = wipe.input.checked;
        if (!window.confirm(`Tenere la copia migliore per ${groups.length} gruppi e rimuovere le altre${wipeFiles ? ", eliminando dal dispositivo i file delle cartelle collegate (irreversibile)" : " dalla libreria"}?`)) return;
        let removed = 0;
        const problems = [];
        for (const group of groups) {
          const best = [...group].sort((a, b) => keepScore(b, state) - keepScore(a, state))[0];
          try { removed += await resolveGroup(group, best.id, wipeFiles); } catch (error) { problems.push(error.message || "errore"); }
        }
        await finish([`${removed} copie rimosse.`, ...problems.slice(0, 2)].join(" "));
      }, false));
      panelFor("dups").append(bulk);
    }

    const candidates = (onlyId ? all.filter((record) => record.id === onlyId) : all)
      .map((record) => ({ record, meta: proposal(record) }))
      .filter(({ record, meta }) => onlyId || standardName(meta, record) !== record.name
        || meta.title !== record.title || meta.author !== (record.author || "") || meta.year !== (record.year || "")
        || meta.month !== (record.month || "") || meta.series !== (record.series || "")
        || meta.volume !== (record.volume || "") || meta.chapter !== (record.chapter || ""))
      .sort((a, b) => collator.compare(a.meta.title, b.meta.title));
    const entries = [];
    const aiBulk = el("section", "lb-tool-section lb-ai-bulk");
    if (!onlyId) {
      panelFor("names").append(el("h3", "lb-section", `Nomi e dati da correggere (${candidates.length})`));
      panelFor("names").append(el("p", "lb-note", candidates.length
        ? `${all.length - candidates.length} libri sono già a posto. Controlla le proposte e deseleziona quelle che non vuoi cambiare. La rinomina del file originale è disponibile solo per cartelle collegate. Il comportamento per nomi già esistenti si sceglie nelle impostazioni.`
        : "Tutti i libri rispettano già lo standard."));
      panelFor("names").append(aiBulk);
    }
    candidates.forEach(({ record, meta }) => {
      const row = el("div", "lb-fix");
      const pick = checkbox("", true);
      pick.input.setAttribute("aria-label", `Applica la correzione a ${record.name}`);
      const main = el("div", "lb-fix-main");
      main.append(el("small", "lb-fix-old", record.folderId ? record.path : record.name));
      const title = textField("Titolo", meta.title);
      const author = textField("Autore", meta.author);
      const publisher = textField("Casa editrice", meta.publisher);
      const year = textField("Anno", meta.year, true);
      const month = textField("Mese (01–12)", meta.month, "month");
      const series = textField("Serie / collana (facoltativo)", meta.series);
      series.input.title = "Solo se il libro fa parte di una collana o di una saga (es. «Harry Potter»). Per un libro singolo o una rivista lascia vuoto.";
      const volume = textField("Volume", meta.volume, true);
      const chapter = textField("Capitolo", meta.chapter, true);
      const grid = el("div", "lb-fix-grid");
      grid.append(title.wrap, author.wrap, publisher.wrap, year.wrap, month.wrap, series.wrap, volume.wrap, chapter.wrap);
      const nameFields = el("fieldset", "lb-name-fields");
      nameFields.append(el("legend", "", "Includi nel nome del file"));
      let choices = [];
      const profile = settingsSelect("Profilo di rinomina", Object.entries(RENAME_PROFILES).map(([key, value]) => [key, value.label]), profileFor(record), () => updateChoices());
      const updateChoices = () => {
        nameFields.replaceChildren(el("legend", "", "Includi nel nome del file"));
        choices = renameFields(profile.value).map((field) => {
          const choice = checkbox(field.label, field.enabled);
          choice.input.addEventListener("change", () => refresh());
          nameFields.append(choice.wrap);
          return { key: field.key, input: choice.input };
        });
        refresh();
      };
      const preview = el("div", "lb-fix-new");
      const read = () => ({
        title: title.input.value, author: author.input.value, publisher: publisher.input.value, year: year.input.value,
        month: month.input.value, series: series.input.value, volume: volume.input.value, chapter: chapter.input.value,
        nameFields: choices.filter((choice) => choice.input.checked).map((choice) => choice.key), profile: profile.value,
      });
      const refresh = () => {
        const values = read();
        const missing = [!cleanField(values.author) ? "autore" : "", !values.year.trim() ? "anno" : "", !monthOf(values.month) ? "mese" : ""].filter(Boolean);
        preview.textContent = `→ ${standardName(values, record, values.nameFields, values.profile)}${missing.length ? `  (manca: ${missing.join(", ")})` : ""}`;
      };
      [title, author, publisher, year, month, series, volume, chapter].forEach((item) => item.input.addEventListener("input", refresh));
      updateChoices();
      main.append(grid, settingsRow("Profilo di rinomina", profile), nameFields, preview);
      main.append(button("Inverti titolo e autore", null, () => {
        const swapped = title.input.value;
        title.input.value = author.input.value;
        author.input.value = swapped;
        refresh();
      }));
      if (onlyId && (record.type === "epub" || record.type === "pdf")) {
        addLibraryAiAssist(record, {
          title: title.input, author: author.input, publisher: publisher.input, year: year.input, month: month.input,
          series: series.input, volume: volume.input, chapter: chapter.input,
        }, main, refresh);
      }
      row.append(previewButton(record), pick.wrap, main);
      panelFor("names").append(row);
      const rowStatus = el("small", "lb-note");
      main.append(rowStatus);
      entries.push({
        record, pick: pick.input, read, refresh, rowStatus,
        fields: { title: title.input, author: author.input, publisher: publisher.input, year: year.input, month: month.input, series: series.input, volume: volume.input, chapter: chapter.input },
      });
    });

    if (!onlyId && entries.some((entry) => entry.record.type === "epub" || entry.record.type === "pdf")) {
      addLibraryAiBulk(aiBulk, entries);
    }

    const footer = el("div", "lb-tools-bar");
    const saveStatus = el("p", "lb-tools-notice");
    saveStatus.setAttribute("role", "alert");
    saveStatus.hidden = true;
    let disk = null;
    if (entries.some((entry) => entry.record.folderId)) {
      disk = checkbox("Rinomina anche i file nelle cartelle collegate (non vale per i file aggiunti singolarmente)", prefs().renameDiskByDefault !== false);
      footer.append(disk.wrap);
    }
    if (entries.length) {
      footer.append(button(onlyId ? "Salva" : "Applica alle righe selezionate", null, async function apply() {
        const report = (message, isError) => {
          saveStatus.textContent = message;
          saveStatus.hidden = !message;
          saveStatus.style.color = isError ? "#d93025" : "";
        };
        const chosen = entries.filter((entry) => entry.pick.checked);
        if (!chosen.length) { report("Nessun libro selezionato.", true); return; }
        if (!onlyId && prefs().confirmBulk !== false && !window.confirm(`Applicare le modifiche a ${chosen.length} elementi selezionati?`)) return;
        const renameDisk = Boolean(disk?.input.checked);
        const onDisk = chosen.filter((entry) => entry.record.folderId).length;
        const folders = await folderAll();
        // Il permesso di scrittura si ottiene solo subito dopo un clic: va chiesto prima della conferma.
        if (renameDisk && onDisk) {
          const involved = new Set(chosen.filter((entry) => entry.record.folderId).map((entry) => entry.record.folderId));
          for (const folder of folders.filter((item) => involved.has(item.id))) {
            try {
              await requireWritePermission(folder.handle);
            } catch (error) {
              report(`Non posso rinominare i file di «${folder.name}»: ${error.message || "errore"}. Premi «Permetti rinomina» sulla cartella nello scaffale e riprova.`, true);
              return;
            }
          }
          if (!window.confirm(`Verranno rinominati ${onDisk} file sul dispositivo. Continuare?`)) return;
        }
        report("Salvataggio in corso…", false);
        let done = 0;
        const problems = [];
        const changes = [];
        for (const entry of chosen) {
          try {
            const change = await applyEdit(entry.record, entry.read(), { renameDisk, folders, records: all });
            if (change) changes.push(change);
            done += 1;
          } catch (error) {
            problems.push(`${entry.record.name}: ${error.message || "errore"}`);
          }
        }
        if (changes.length) {
          try {
            await historyPut({ id: newId(), createdAt: Date.now(), changes });
            const history = (await historyAll()).sort((a, b) => b.createdAt - a.createdAt);
            for (const old of history.slice(20)) await historyDelete(old.id);
          } catch (error) {
            problems.push(`Cronologia annullamenti non salvata: ${error.message || "errore"}`);
          }
        }
        const summary = [
          `${done} ${done === 1 ? "libro aggiornato" : "libri aggiornati"}.`,
          ...problems.slice(0, 3),
          problems.length > 3 ? `Altri ${problems.length - 3} errori.` : "",
        ].filter(Boolean).join(" ");
        if (problems.length && onlyId) {
          report(`Salvataggio non completato: ${problems.slice(0, 3).join(" · ")}`, true);
          return;
        }
        await finish(summary);
      }, false));
    }
    footer.append(button("Chiudi", null, () => toolsDialog.close()));
    panelFor("names").append(saveStatus, footer);
    toolsDialog.replaceChildren(body);
  }

  /* ---------- Scaffale ---------- */

  function hueOf(text) {
    let hash = 0;
    for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return hash;
  }

  function clearCoverUrls() {
    coverGeneration += 1;
    coverObserver?.disconnect();
    coverObserver = null;
    pdfCoverQueue.length = 0;
    coverUrls.forEach((url) => URL.revokeObjectURL(url));
    coverUrls = [];
  }

  async function renderPdfCover(record) {
    let blob = record.file;
    if (!blob) {
      if (!record.handle) throw new Error("file non disponibile");
      if (!(await ensurePermission(record.handle, false))) throw new Error("autorizza la cartella per mostrare la copertina");
      blob = await record.handle.getFile();
    }
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: await blob.arrayBuffer(), wasmUrl: PDFJS_WASM_URL });
    try {
      const pdf = await task.promise;
      const first = await pdf.getPage(1);
      const base = first.getViewport({ scale: 1 });
      const viewport = first.getViewport({ scale: Math.min(1, 320 / Math.max(base.width, base.height)) });
      const canvas = el("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("visualizzazione PDF non disponibile");
      await first.render({ canvasContext: context, viewport }).promise;
      const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!image) throw new Error("impossibile creare la miniatura");
      return image;
    } finally {
      await task.destroy();
    }
  }

  async function processPdfCovers() {
    if (pdfCoverBusy) return;
    pdfCoverBusy = true;
    try {
      while (pdfCoverQueue.length) {
        const { record, target, generation } = pdfCoverQueue.shift();
        if (generation !== coverGeneration || !target.isConnected) continue;
        const key = `${record.id}:${record.size}:${record.added}:${record.mtime || 0}`;
        try {
          let cover = pdfCoverCache.get(key);
          if (!cover) {
            cover = await renderPdfCover(record);
            if (pdfCoverCache.size >= 40) pdfCoverCache.delete(pdfCoverCache.keys().next().value);
            pdfCoverCache.set(key, cover);
          }
          if (generation !== coverGeneration || !target.isConnected) continue;
          const url = URL.createObjectURL(cover);
          coverUrls.push(url);
          const image = el("img");
          image.src = url;
          image.alt = "";
          const progress = target.querySelector(".lb-cover-bar");
          target.classList.remove("plain");
          target.replaceChildren(image);
          if (progress) target.append(progress);
        } catch (error) {
          if (generation !== coverGeneration || !target.isConnected) continue;
          console.error(`Impossibile creare la copertina PDF di «${record.title}».`, error);
          target.title = `Copertina PDF non disponibile: ${error.message || "file non leggibile"}.`;
        }
      }
    } finally {
      pdfCoverBusy = false;
    }
  }

  function observePdfCover(record, target) {
    if (record.type !== "pdf" || record.cover) return;
    const generation = coverGeneration;
    const enqueue = () => {
      pdfCoverQueue.push({ record, target, generation });
      processPdfCovers();
    };
    if (!("IntersectionObserver" in window)) {
      requestAnimationFrame(enqueue);
      return;
    }
    if (!coverObserver) {
      coverObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          coverCallbacks.get(entry.target)?.();
          coverCallbacks.delete(entry.target);
        });
      }, { rootMargin: "200px" });
    }
    coverCallbacks.set(target, enqueue);
    coverObserver.observe(target);
  }

  /* ---------- Libro dalle immagini (CBZ e PDF) ---------- */

  const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
  const NATURAL = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  let crcTable = null;
  let imagesDialog = null;
  let imageInput = null;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // CBZ = archivio ZIP senza compressione (le immagini sono gia' compresse) con le pagine numerate.
  async function buildCbz(items, progress) {
    const parts = [];
    const central = [];
    const encoder = new TextEncoder();
    let offset = 0;
    for (let i = 0; i < items.length; i += 1) {
      progress?.(i + 1, items.length);
      const data = new Uint8Array(await (await items[i].getFile()).arrayBuffer());
      const extension = (items[i].name.match(/\.[^.]+$/) || [".jpg"])[0].toLowerCase();
      const name = encoder.encode(`${String(i + 1).padStart(4, "0")}${extension}`);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(10, 0, true);
      local.setUint16(12, 33, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      const head = new DataView(new ArrayBuffer(46));
      head.setUint32(0, 0x02014b50, true);
      head.setUint16(4, 20, true);
      head.setUint16(6, 20, true);
      head.setUint16(8, 0x0800, true);
      head.setUint16(14, 33, true);
      head.setUint32(16, crc, true);
      head.setUint32(20, data.length, true);
      head.setUint32(24, data.length, true);
      head.setUint16(28, name.length, true);
      head.setUint32(42, offset, true);
      parts.push(local.buffer, name, data);
      central.push(head.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((total, part) => total + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, items.length, true);
    end.setUint16(10, items.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: "application/vnd.comicbook+zip" });
  }

  function jpegInfo(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return null;
  }

  // I JPEG validi finiscono nel PDF cosi' come sono; PNG, WebP e GIF vengono convertiti in JPEG.
  async function pageJpeg(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = jpegInfo(bytes);
    if (info && (info.components === 1 || info.components === 3) && info.width && info.height) return { bytes, ...info };
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("immagine non convertibile");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: bitmap.width, height: bitmap.height, components: 3 };
  }

  async function buildPdf(items, progress) {
    const parts = [];
    const offsets = [];
    const encoder = new TextEncoder();
    let length = 0;
    const put = (data) => {
      const chunk = typeof data === "string" ? encoder.encode(data) : data;
      parts.push(chunk);
      length += chunk.length;
    };
    put("%PDF-1.4\n");
    const pageIds = [];
    let next = 3;
    for (let i = 0; i < items.length; i += 1) {
      progress?.(i + 1, items.length);
      const page = await pageJpeg(await items[i].getFile());
      const imageId = next++;
      const contentId = next++;
      const pageId = next++;
      pageIds.push(pageId);
      const space = page.components === 1 ? "/DeviceGray" : "/DeviceRGB";
      offsets[imageId] = length;
      put(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
      put(page.bytes);
      put("\nendstream\nendobj\n");
      const draw = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`;
      offsets[contentId] = length;
      put(`${contentId} 0 obj\n<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`);
      offsets[pageId] = length;
      put(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    }
    offsets[1] = length;
    put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offsets[2] = length;
    put(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`);
    const xref = length;
    put(`xref\n0 ${next}\n0000000000 65535 f \n`);
    for (let id = 1; id < next; id += 1) put(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    put(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: "application/pdf" });
  }

  function groupImages(entries, rootName) {
    const groups = new Map();
    entries.forEach((entry) => {
      const dir = entry.dir || "";
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(entry);
    });
    return [...groups.entries()]
      .map(([dir, items]) => ({
        name: dir ? dir.replace(/\//g, " – ") : rootName,
        items: items.sort((a, b) => NATURAL.compare(a.name, b.name)),
      }))
      .sort((a, b) => NATURAL.compare(a.name, b.name));
  }

  async function walkImages(directory, prefix, found, depth) {
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        if (depth < 8) await walkImages(handle, `${prefix}${name}/`, found, depth + 1);
      } else if (IMAGE_RE.test(name)) {
        found.push({ name, dir: prefix.replace(/\/$/, ""), getFile: () => handle.getFile() });
      }
    }
  }

  async function pickImageFolder() {
    if (!window.showDirectoryPicker) {
      if (!imageInput) {
        imageInput = el("input");
        imageInput.type = "file";
        imageInput.multiple = true;
        imageInput.setAttribute("webkitdirectory", "");
        imageInput.hidden = true;
        imageInput.addEventListener("change", () => {
          const files = [...imageInput.files].filter((file) => IMAGE_RE.test(file.name));
          imageInput.value = "";
          if (!files.length) { say("Nessuna immagine nella cartella scelta."); return; }
          const rootName = (files[0].webkitRelativePath || "").split("/")[0] || "Immagini";
          const entries = files.map((file) => {
            const parts = (file.webkitRelativePath || file.name).split("/");
            return { name: file.name, dir: parts.slice(1, -1).join("/"), getFile: async () => file };
          });
          openImageDialog(groupImages(entries, rootName));
        });
        page.append(imageInput);
      }
      imageInput.click();
      return;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: "cyber-images", mode: "read" });
    } catch (error) {
      if (error?.name !== "AbortError") say("Non posso accedere alla cartella scelta.");
      return;
    }
    say(`Cerco le immagini in «${handle.name}»…`);
    const found = [];
    try { await walkImages(handle, "", found, 0); } catch { /* cartella non leggibile */ }
    if (!found.length) { say(`Nessuna immagine (JPG, PNG, WebP, GIF) in «${handle.name}».`); return; }
    openImageDialog(groupImages(found, handle.name));
  }

  function safeFileName(text) {
    return text.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "libro";
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = el("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function openImageDialog(groups) {
    if (!imagesDialog) {
      imagesDialog = el("dialog", "lb-dialog lb-tools");
      imagesDialog.setAttribute("aria-label", "Crea un libro dalle immagini");
      imagesDialog.addEventListener("click", (event) => { if (event.target === imagesDialog) imagesDialog.close(); });
      page.append(imagesDialog);
    }
    const body = el("div", "lb-dialog-body");
    body.append(el("h2", "lb-dialog-title", "Libro dalle immagini"));
    body.append(el("p", "lb-note", "Ogni cartella con delle immagini diventa un libro: le pagine seguono l'ordine dei nomi (1, 2, … 10). Aggiungilo alla libreria per leggerlo, oppure scaricalo come CBZ o PDF."));
    const status = el("p", "lb-note");
    status.setAttribute("role", "status");
    const rows = [];
    const busy = (value) => rows.forEach((node) => node.querySelectorAll("button").forEach((b) => { b.disabled = value; }));
    const progress = (label) => (n, total) => { status.textContent = `${label}: pagina ${n} di ${total}…`; };
    const safe = async (job) => {
      busy(true);
      try { await job(); } catch (error) { status.textContent = `Operazione non riuscita: ${error.message || "errore"}`; } finally { busy(false); }
    };
    const addToLibrary = async (group) => {
      const blob = await buildCbz(group.items, progress("Preparo il libro"));
      const file = new File([blob], `${safeFileName(group.name)}.cbz`, { type: blob.type });
      const existing = await dbAll();
      if (existing.some((book) => book.name === file.name && book.size === file.size)) return "già presente";
      const record = await buildRecord(file, "cbz");
      record.title = group.name;
      await dbPut(record);
      return "aggiunto";
    };
    groups.forEach((group) => {
      const row = el("div", "lb-fix");
      const main = el("div", "lb-fix-main");
      main.append(el("strong", "", group.name), el("span", "lb-fix-old", `${group.items.length} ${group.items.length === 1 ? "immagine" : "immagini"}`));
      const actions = el("div", "lb-actions");
      actions.append(
        button("Aggiungi alla libreria", ICONS.add, () => safe(async () => {
          const result = await addToLibrary(group);
          status.textContent = `«${group.name}»: ${result}.`;
          if (ui.tab === "shelf") renderShelf();
        }), false),
        button("CBZ", null, () => safe(async () => {
          downloadBlob(await buildCbz(group.items, progress("Creo il CBZ")), `${safeFileName(group.name)}.cbz`);
          status.textContent = `«${group.name}»: CBZ pronto.`;
        })),
        button("PDF", null, () => safe(async () => {
          downloadBlob(await buildPdf(group.items, progress("Creo il PDF")), `${safeFileName(group.name)}.pdf`);
          status.textContent = `«${group.name}»: PDF pronto.`;
        })),
      );
      main.append(actions);
      row.append(main);
      rows.push(row);
      body.append(row);
    });
    if (groups.length > 1) {
      const all = button(`Aggiungi tutti (${groups.length}) alla libreria`, ICONS.add, () => safe(async () => {
        let added = 0;
        for (const group of groups) if ((await addToLibrary(group)) === "aggiunto") added += 1;
        status.textContent = `${added} libri aggiunti alla libreria.`;
        if (ui.tab === "shelf") renderShelf();
      }), false);
      const wrap = el("div", "lb-actions");
      wrap.append(all);
      rows.push(wrap);
      body.append(wrap);
    }
    body.append(status, button("Chiudi", null, () => imagesDialog.close()));
    imagesDialog.replaceChildren(body);
    imagesDialog.showModal();
  }

  async function renderShelf() {
    const books = await dbAll();
    await repairGarbled(books);
    clearCoverUrls();
    const state = readState();
    sortBooks(books, state, prefs().sort);

    const bar = el("div", "lb-bar");
    bar.append(button("Aggiungi libri", ICONS.add, () => fileInput.click(), false));
    bar.append(button("Collega cartella", ICONS.folder, pickFolder));
    bar.append(button("Libro da immagini", ICONS.book, pickImageFolder));
    if (books.length) bar.append(button("Sistema libreria", ICONS.tools, () => openTools()));
    bar.append(iconButton("Impostazioni della Libreria", ICONS.settings, () => openLibrarySettings()));
    if (books.length > 1) {
      const sort = el("select", "lb-select");
      sort.setAttribute("aria-label", "Ordina i libri");
      Object.entries(SORTS).forEach(([value, label]) => {
        const option = el("option", "", `Ordina: ${label}`);
        option.value = value;
        sort.append(option);
      });
      sort.value = SORTS[prefs().sort] ? prefs().sort : "recent";
      sort.addEventListener("change", () => {
        prefs().sort = sort.value;
        savePrefs();
        renderShelf();
      });
      bar.append(sort);
    }
    if (books.length && prefs().shelfView === "folders") {
      const size = settingsSelect("Dimensione copertine", COVER_SIZES.map(([value, label]) => [value, `Copertine: ${label.toLowerCase()}`]),
        FOLDER_COVER_WIDTHS[prefs().coverSize] ? prefs().coverSize : "medium", async (value) => {
          const updated = { ...prefs(), coverSize: value };
          try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
          } catch (error) {
            console.error("Impossibile salvare la dimensione delle copertine.", error);
            say("Impossibile salvare la dimensione delle copertine.");
            size.value = prefs().coverSize || "medium";
            return;
          }
          prefsCache = updated;
          await renderShelf();
          shelfPanel.querySelector('select[aria-label="Dimensione copertine"]')?.focus();
        });
      size.classList.add("lb-select");
      bar.append(size);
    }
    if (books.length > 3) {
      const search = el("input", "lb-search");
      search.type = "search";
      search.placeholder = "Cerca titolo o autore";
      search.setAttribute("aria-label", "Cerca nella libreria");
      search.value = filterText;
      search.addEventListener("input", () => {
        filterText = search.value;
        applyFilter();
      });
      bar.append(search);
    }

    const foldersBox = await renderFolders();

    if (!books.length) {
      const empty = el("div", "lb-empty");
      empty.append(icon(ICONS.book, 48), el("h2", "", "La tua libreria è vuota"));
      empty.append(el("p", "", "Aggiungi libri (EPUB, PDF, TXT, HTML, Markdown, FB2, DOCX, ODT, RTF, CBZ) oppure collega una cartella del dispositivo: i libri che contiene compaiono da soli. Restano solo nel tuo browser e si leggono anche senza connessione."));
      empty.append(button("Scegli i file", ICONS.add, () => fileInput.click(), false));
      shelfPanel.replaceChildren(...[bar, empty, foldersBox].filter(Boolean));
      return;
    }

    const makeCard = (book) => {
      const info = state[book.id];
      const pct = info?.pct || 0;
      const card = el("article", "lb-book");
      card.dataset.search = `${book.title} ${book.author} ${book.name}`.toLowerCase();
      const cover = el("button", "lb-cover");
      cover.type = "button";
      cover.setAttribute("aria-label", `Apri ${book.title}`);
      if (book.cover) {
        const url = URL.createObjectURL(book.cover);
        coverUrls.push(url);
        const image = el("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        cover.append(image);
      } else {
        cover.style.setProperty("--hue", String(hueOf(book.title)));
        cover.classList.add("plain");
        cover.append(el("span", "lb-cover-title", book.title), el("span", "lb-cover-type", book.type.toUpperCase()));
      }
      if (pct > 0) cover.append(Object.assign(el("span", "lb-cover-bar"), { style: `--p:${pct}%` }));
      cover.addEventListener("click", () => selectTab(`read:${book.id}`));
      observePdfCover(book, cover);
      const body = el("div", "lb-info");
      const heading = el("div", "lb-book-heading");
      heading.append(previewButton(book), el("strong", "lb-name", book.title));
      body.append(heading);
      if (book.author) body.append(el("span", "lb-author", book.author));
      const fileLine = el("span", "lb-file", book.name);
      fileLine.title = book.folderId && book.path ? book.path : book.name;
      if (prefs().showFileName !== false) body.append(fileLine);
      if (prefs().showDetails !== false) body.append(el("span", "lb-detail", `${book.type.toUpperCase()}${book.year ? ` · ${book.year}` : ""} · ${formatSize(book.size)}${book.type === "pdf" ? "" : ` · letto ${pct}%`}`));
      const actions = el("div", "lb-actions");
      actions.append(button(info?.updated ? "Continua" : "Leggi", ICONS.play, () => selectTab(`read:${book.id}`), false));
      actions.append(iconButton(`Modifica nome e dati di ${book.title}`, ICONS.edit, () => openTools(book.id)));
      const remove = iconButton(`Rimuovi ${book.title}`, ICONS.del, async () => {
        if (!window.confirm(`Rimuovere «${book.title}» dalla libreria? Il file sul tuo dispositivo non viene toccato${book.folderId ? " e la cartella collegata non lo riproporrà (puoi usare «Ripristina esclusi»)" : ""}.`)) return;
        await removeRecord(book);
        writeState();
        renderShelf();
      });
      actions.append(remove);
      body.append(actions);
      card.append(cover, body);
      return card;
    };
    let content;
    if (prefs().shelfView === "folders") {
      content = await buildExplorer(books, state);
    } else {
      const grid = el("div", "lb-grid");
      grid.style.setProperty("--lb-cover-min", ({ small: "120px", medium: "160px", large: "220px" })[prefs().coverSize] || "160px");
      books.forEach((book) => grid.append(makeCard(book)));
      content = [grid];
    }
    const note = el("p", "lb-note", "");
    shelfPanel.replaceChildren(...[bar, ...content, foldersBox, note].filter(Boolean));
    applyFilter();
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage) note.textContent = `Spazio usato dalla libreria in questo browser: ${formatSize(estimate.usage)}. I file completi restano sul dispositivo; le ricerche ISBN e Gemini possono inviare dati come indicato nelle rispettive schermate.`;
      }).catch(() => {});
    }
  }

  function applyFilter() {
    const query = filterText.trim().toLowerCase();
    shelfPanel.querySelectorAll(".lb-book, .lb-row").forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.search.includes(query);
    });
  }

  /* ---------- Vista a cartelle (stile Esplora file) ---------- */

  const MANUAL_ROOT = "__manual";
  let explorerPath = { root: null, dir: [] };

  async function buildExplorer(books, state) {
    const folders = await folderAll();
    const names = new Map(folders.map((folder) => [folder.id, folder.name]));
    const manualBooks = books.filter((book) => !book.folderId || !names.has(book.folderId));
    const { root, dir } = explorerPath;
    if (root && root !== MANUAL_ROOT && !names.has(root)) explorerPath = { root: null, dir: [] };
    if (root === MANUAL_ROOT && !manualBooks.length) explorerPath = { root: null, dir: [] };
    const here = explorerPath;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    const rows = [];
    const folderRow = (name, count, onOpen) => {
      const row = el("button", "lb-row lb-row-folder");
      row.type = "button";
      row.dataset.search = name.toLowerCase();
      row.append(icon(ICONS.folder, 40));
      const text = el("span", "lb-row-text");
      text.append(el("strong", "", name), el("small", "", `${count} ${count === 1 ? "libro" : "libri"}`));
      row.append(text, el("span", "lb-row-go", "›"));
      row.addEventListener("click", onOpen);
      return row;
    };

    let inside;
    if (!here.root) {
      folders.slice().sort((a, b) => collator.compare(a.name, b.name)).forEach((folder) => {
        const count = books.filter((book) => book.folderId === folder.id).length;
        rows.push(folderRow(folder.name, count, () => { explorerPath = { root: folder.id, dir: [] }; renderShelf(); }));
      });
      if (manualBooks.length) rows.push(folderRow("Aggiunti a mano", manualBooks.length, () => { explorerPath = { root: MANUAL_ROOT, dir: [] }; renderShelf(); }));
    } else {
      inside = here.root === MANUAL_ROOT ? manualBooks : books.filter((book) => book.folderId === here.root);
      const depth = here.dir.length;
      const subs = new Map();
      const files = [];
      inside.forEach((book) => {
        const parts = here.root === MANUAL_ROOT ? [] : (book.path || "").split("/").slice(0, -1);
        if (parts.length < depth || here.dir.some((segment, i) => parts[i] !== segment)) return;
        if (parts.length === depth) files.push(book);
        else subs.set(parts[depth], (subs.get(parts[depth]) || 0) + 1);
      });
      [...subs.keys()].sort(collator.compare).forEach((name) => {
        rows.push(folderRow(name, subs.get(name), () => { explorerPath = { root: here.root, dir: [...here.dir, name] }; renderShelf(); }));
      });
      files.forEach((book) => rows.push(bookRow(book, state)));
    }

    const crumbs = el("nav", "lb-crumbs");
    crumbs.setAttribute("aria-label", "Percorso");
    const go = (path) => () => { explorerPath = path; renderShelf(); };
    if (here.root) {
      crumbs.append(iconButton("Cartella superiore", ICONS.back, go(here.dir.length ? { root: here.root, dir: here.dir.slice(0, -1) } : { root: null, dir: [] })));
    }
    const trail = [["Libreria", { root: null, dir: [] }]];
    if (here.root) trail.push([here.root === MANUAL_ROOT ? "Aggiunti a mano" : names.get(here.root), { root: here.root, dir: [] }]);
    here.dir.forEach((name, i) => trail.push([name, { root: here.root, dir: here.dir.slice(0, i + 1) }]));
    trail.forEach(([label, path], i) => {
      if (i) crumbs.append(el("span", "lb-crumb-sep", "›"));
      const last = i === trail.length - 1;
      const crumb = el(last ? "strong" : "button", "lb-crumb", label);
      if (!last) { crumb.type = "button"; crumb.addEventListener("click", go(path)); }
      crumbs.append(crumb);
    });

    const list = el("div", "lb-rows");
    list.style.setProperty("--lb-row-cover-width", FOLDER_COVER_WIDTHS[prefs().coverSize] || FOLDER_COVER_WIDTHS.medium);
    if (rows.length) list.append(...rows);
    else list.append(el("p", "lb-note", "Questa cartella è vuota."));
    return [crumbs, list];
  }

  function bookRow(book, state) {
    const info = state[book.id];
    const pct = info?.pct || 0;
    const row = el("div", "lb-row");
    row.dataset.search = `${book.title} ${book.author} ${book.name}`.toLowerCase();
    const open = el("button", "lb-row-open");
    open.type = "button";
    open.setAttribute("aria-label", `Apri ${book.title}`);
    const thumb = el("span", "lb-row-thumb");
    if (book.cover) {
      const url = URL.createObjectURL(book.cover);
      coverUrls.push(url);
      const image = el("img");
      image.src = url;
      image.alt = "";
      image.loading = "lazy";
      thumb.append(image);
    } else {
      thumb.style.setProperty("--hue", String(hueOf(book.title)));
      thumb.classList.add("plain");
      thumb.textContent = book.type.toUpperCase();
    }
    observePdfCover(book, thumb);
    const text = el("span", "lb-row-text");
    text.append(el("strong", "", book.title));
    if (prefs().showFileName !== false) text.append(el("small", "lb-file", book.name));
    if (prefs().showDetails !== false) text.append(el("small", "", `${book.type.toUpperCase()} · ${formatSize(book.size)}${book.type === "pdf" ? "" : ` · letto ${pct}%`}${book.author ? ` · ${book.author}` : ""}`));
    open.append(thumb, text);
    open.addEventListener("click", () => selectTab(`read:${book.id}`));
    row.append(previewButton(book), open);
    row.append(iconButton(`Modifica nome e dati di ${book.title}`, ICONS.edit, () => openTools(book.id)));
    row.append(iconButton(`Rimuovi ${book.title}`, ICONS.del, async () => {
      if (!window.confirm(`Rimuovere «${book.title}» dalla libreria? Il file sul tuo dispositivo non viene toccato${book.folderId ? " e la cartella collegata non lo riproporrà (puoi usare «Ripristina esclusi»)" : ""}.`)) return;
      await removeRecord(book);
      writeState();
      renderShelf();
    }));
    return row;
  }

  function previewButton(book) {
    const control = iconButton(`Anteprima prima pagina di ${book.title}`, ICONS.preview, () => openFirstPagePreview(book));
    control.classList.add("lb-preview-button");
    return control;
  }

  async function openFirstPagePreview(record) {
    const dialog = el("dialog", "lb-dialog lb-first-preview");
    dialog.setAttribute("aria-label", `Anteprima prima pagina di ${record.title}`);
    const body = el("div", "lb-first-preview-body");
    const header = el("div", "lb-first-preview-header");
    const title = el("h2", "lb-dialog-title", `Prima pagina · ${record.title}`);
    const close = iconButton("Chiudi anteprima", ICONS.close, () => dialog.close());
    header.append(title, close);
    const status = el("p", "lb-note", "Caricamento anteprima…");
    status.setAttribute("role", "status");
    const content = el("div", "lb-first-preview-content");
    body.append(header, status, content);
    dialog.append(body);
    page.append(dialog);
    const current = { type: record.type, urls: new Map() };
    let closed = false;
    let pdfTask = null;
    let pdfCleanup = null;
    const destroyPdf = () => {
      if (pdfTask && !pdfCleanup) {
        pdfCleanup = pdfTask.destroy().catch((error) => console.error("Errore chiudendo l'anteprima PDF.", error));
      }
      return pdfCleanup;
    };
    const releaseUrls = () => {
      current.urls.forEach((url) => URL.revokeObjectURL(url));
      current.urls.clear();
    };
    dialog.addEventListener("close", () => {
      closed = true;
      destroyPdf();
      releaseUrls();
      dialog.remove();
    }, { once: true });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.showModal();
    close.focus();
    try {
      const blob = await bookBlob(record);
      if (closed) return;
      if (record.type === "pdf") {
        const pdfjs = await loadPdfJs();
        if (closed) return;
        pdfTask = pdfjs.getDocument({ data: await blob.arrayBuffer(), wasmUrl: PDFJS_WASM_URL });
        if (closed) return;
        const pdf = await pdfTask.promise;
        const first = await pdf.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const viewport = first.getViewport({ scale: Math.min(2, 1400 / Math.max(base.width, base.height)) });
        const canvas = el("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.setAttribute("aria-label", "Prima pagina del PDF");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("visualizzazione PDF non disponibile");
        await first.render({ canvasContext: context, viewport }).promise;
        if (closed) return;
        content.append(canvas);
      } else {
        if (record.type === "epub") {
          const parsed = await parseEpub(blob);
          Object.assign(current, { zip: parsed.zip, spine: parsed.spine });
        } else if (record.type === "txt") {
          current.chunks = chunkText(decodeText(new Uint8Array(await blob.arrayBuffer())));
        } else if (record.type === "cbz") {
          const parsed = await parseCbz(blob);
          Object.assign(current, { zip: parsed.zip, pages: parsed.pages });
        } else if (FLAT.has(record.type)) {
          const parsed = await parseOther(record.type, blob);
          current.chapters = parsed.chapters;
        } else {
          throw new Error("formato non supportato");
        }
        if (closed) return;
        const displayCss = `
          html { height: 100% !important; overflow: hidden !important; background: #fff !important; }
          body { box-sizing: border-box !important; height: 100% !important; margin: 0 !important; padding: 20px !important; overflow: hidden !important; column-width: calc(100vw - 40px) !important; column-gap: 40px !important; column-fill: auto !important; background-color: #fff !important; color: #202124 !important; font: 16px/1.5 Georgia, serif; overflow-wrap: break-word; }
          img, svg { max-width: 100% !important; max-height: calc(100vh - 40px) !important; object-fit: contain; }
          body[data-reader-page="image"] { display: flex !important; align-items: center; justify-content: center; }
        `;
        const html = await chapterHtml(current, 0, displayCss);
        if (closed) return;
        const previewFrame = el("iframe", "lb-first-preview-frame");
        previewFrame.setAttribute("sandbox", "allow-same-origin");
        previewFrame.title = "Prima pagina del documento";
        previewFrame.srcdoc = html;
        content.append(previewFrame);
      }
      status.textContent = "";
    } catch (error) {
      if (!closed) {
        console.error("Impossibile mostrare l'anteprima.", error);
        status.textContent = `Impossibile mostrare la prima pagina: ${error.message || "file non leggibile"}.`;
      }
    } finally {
      if (pdfTask) await destroyPdf();
      if (closed) releaseUrls();
    }
  }

  /* ---------- Segnalibri ---------- */

  async function renderBookmarks() {
    const books = await dbAll();
    const state = readState();
    const rows = [];
    books.forEach((book) => {
      (state[book.id]?.bookmarks || []).forEach((mark, index) => rows.push({ book, mark, index }));
    });
    rows.sort((a, b) => b.mark.t - a.mark.t);
    if (!rows.length) {
      const empty = el("div", "lb-empty");
      empty.append(icon(ICONS.bookmark, 48), el("h2", "", "Nessun segnalibro"));
      empty.append(el("p", "", "Mentre leggi, tocca «Segnalibro» per salvare il punto in cui sei. Li ritrovi tutti qui."));
      bookmarksPanel.replaceChildren(empty);
      return;
    }
    const list = el("ul", "lb-list");
    rows.forEach(({ book, mark }) => {
      const item = el("li", "lb-row");
      const open = el("button", "lb-row-main");
      open.type = "button";
      open.append(el("strong", "", book.title), el("span", "", mark.label), el("small", "", new Date(mark.t).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })));
      open.addEventListener("click", () => selectTab(`read:${book.id}`, { ch: mark.ch, frac: mark.frac }));
      const remove = iconButton("Elimina segnalibro", ICONS.del, () => {
        const marks = bookState(book.id).bookmarks;
        const at = marks.findIndex((entry) => entry.t === mark.t);
        if (at >= 0) marks.splice(at, 1);
        writeState();
        renderBookmarks();
      });
      item.append(open, remove);
      list.append(item);
    });
    bookmarksPanel.replaceChildren(list);
  }

  /* ---------- Capitoli ---------- */

  function mimeFor(path) {
    return MIME[path.split(".").pop().toLowerCase()] || "application/octet-stream";
  }

  async function resourceUrl(book, path) {
    const real = book.zip.lookup(path);
    if (!real) return null;
    if (book.urls.has(real)) return book.urls.get(real);
    const bytes = await book.zip.read(real);
    if (!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(real) }));
    book.urls.set(real, url);
    return url;
  }

  async function processCss(book, css, cssPath) {
    const withoutImports = css.replace(/@import[^;]+;/g, "");
    const pattern = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g;
    const map = new Map();
    await Promise.all([...withoutImports.matchAll(pattern)].map(async (match) => {
      const href = match[2].trim();
      if (/^(data:|blob:|#)/i.test(href) || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
        map.set(href, /^(data:|blob:)/i.test(href) ? href : "");
        return;
      }
      map.set(href, (await resourceUrl(book, resolvePath(cssPath, href))) || "");
    }));
    return withoutImports.replace(pattern, (_, __, href) => `url("${map.get(href.trim()) || ""}")`);
  }

  function newTarget() {
    return new DOMParser().parseFromString('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', "text/html");
  }

  function themeColors() {
    const theme = prefs().theme;
    if (theme === "light") return { bg: "#ffffff", fg: "#1b1b1f", link: "#1a5fd1", sel: "rgba(26,95,209,.25)" };
    if (theme === "sepia") return { bg: "#f4ecd8", fg: "#4b3b2a", link: "#8a4b0f", sel: "rgba(138,75,15,.25)" };
    if (theme === "dark") return { bg: "#16181d", fg: "#d7d9de", link: "#8ab4f8", sel: "rgba(138,180,248,.3)" };
    const style = getComputedStyle(page);
    const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return { bg: read("--surface", "#ffffff"), fg: read("--text", "#1b1b1f"), link: read("--accent", "#1a5fd1"), sel: "rgba(128,160,255,.35)" };
  }

  function readerCss() {
    const p = prefs();
    const c = themeColors();
    const family = p.font === "serif" ? 'Georgia, "Times New Roman", serif' : p.font === "sans" ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : "";
    const paged = p.navigation === "pages";
    const imageFit = p.fit === "page"
      ? `max-width: 100% !important; max-height: calc(100dvh - ${paged ? "48px" : "190px"}) !important; width: auto !important; object-fit: contain;`
      : p.fit === "width"
        ? "max-width: 100% !important; max-height: none !important;"
        : "max-width: none !important; max-height: none !important;";
    return `
      html { height: ${paged ? "100%" : "auto"} !important; overflow-x: ${paged ? "auto" : "hidden"} !important; overflow-y: ${paged ? "hidden" : "auto"} !important; scrollbar-width: none; scroll-snap-type: ${paged ? "x mandatory" : "none"}; background: ${c.bg} !important; font-size: ${p.size}px !important; touch-action: ${paged ? "pan-x" : "auto"}; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
      body { box-sizing: border-box; height: ${paged ? "100%" : "auto"} !important; margin: ${paged ? "0" : "0 auto"} !important; max-width: ${paged ? "none" : `${p.width}px`} !important; padding: ${paged ? "24px 48px" : "28px 22px 90px"} !important; background: ${c.bg} !important; color: ${c.fg} !important; ${family ? `font-family: ${family} !important;` : ""} font-size: 1rem !important; line-height: ${p.line} !important; overflow-wrap: break-word; -webkit-hyphens: auto; hyphens: auto; overflow-y: ${paged ? "hidden" : "visible"} !important; touch-action: ${paged ? "pan-x" : "auto"}; ${paged ? `column-width: calc(100vw - 96px) !important; column-gap: 96px !important; column-fill: auto !important;` : ""} }
      body * { color: inherit !important; background: transparent !important; ${family ? "font-family: inherit !important;" : ""} max-width: 100%; box-sizing: border-box; }
      ${paged ? `body > * { max-width: min(${p.width}px, calc(100vw - 96px)); margin-inline: auto; }` : ""}
      a { color: ${c.link} !important; text-decoration: underline; cursor: pointer; }
      img { ${imageFit} height: auto !important; }
      body[data-reader-page="image"] { display: flex; align-items: center; justify-content: center; }
      body[data-reader-page="image"] img { max-height: calc(100% - 24px) !important; max-width: 100% !important; }
      svg { max-width: 100% !important; height: auto !important; }
      h1, h2, h3, h4 { line-height: 1.25; }
      ${paged ? `body > * { scroll-snap-align: start; }` : ""}
      ::selection { background: ${c.sel}; }
    `;
  }

  function serialize(target, css, displayCss = readerCss()) {
    target.head.insertAdjacentHTML("afterbegin", "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; font-src blob: data:\">");
    const bookStyle = target.createElement("style");
    bookStyle.id = "cp-book";
    bookStyle.textContent = css;
    const readerStyle = target.createElement("style");
    readerStyle.id = "cp-reader";
    readerStyle.textContent = displayCss;
    target.head.append(bookStyle, readerStyle);
    return `<!doctype html>${target.documentElement.outerHTML}`;
  }

  async function epubChapterHtml(book, index, displayCss) {
    const path = book.spine[index];
    const bytes = await book.zip.read(path);
    if (!bytes) throw new Error("capitolo mancante");
    const text = decodeText(bytes);
    let source = new DOMParser().parseFromString(text, "application/xhtml+xml");
    if (source.getElementsByTagName("parsererror").length || !source.body) source = new DOMParser().parseFromString(text, "text/html");

    let css = "";
    for (const node of source.querySelectorAll("link[rel~='stylesheet'], style")) {
      if (node.tagName.toLowerCase() === "style") {
        css += `${await processCss(book, node.textContent, path)}\n`;
        continue;
      }
      const href = node.getAttribute("href");
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const cssPath = resolvePath(path, href);
      const cssBytes = await book.zip.read(cssPath);
      if (cssBytes) css += `${await processCss(book, decodeText(cssBytes), cssPath)}\n`;
    }

    const target = newTarget();
    [...source.body.childNodes].forEach((node) => target.body.append(target.importNode(node, true)));
    target.body.querySelectorAll("script, iframe, object, embed, form, base, link, meta, audio, video, input, button, textarea, select, noscript").forEach((node) => node.remove());
    target.body.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      });
    });

    await Promise.all([...target.body.querySelectorAll("img, image")].map(async (node) => {
      const isImg = node.tagName.toLowerCase() === "img";
      const name = isImg ? "src" : (node.hasAttribute("xlink:href") ? "xlink:href" : "href");
      const value = node.getAttribute(name);
      node.removeAttribute("srcset");
      if (!value || /^(data:|blob:)/i.test(value)) return;
      const url = /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value) ? null : await resourceUrl(book, resolvePath(path, value));
      if (url) node.setAttribute(name, url);
      else node.removeAttribute(name);
    }));

    target.body.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (/^(https?:|mailto:)/i.test(href)) link.setAttribute("data-ext", href);
      else if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        link.setAttribute("data-path", resolvePath(path, href));
        link.setAttribute("data-hash", href.includes("#") ? href.slice(href.indexOf("#") + 1) : "");
      }
      link.setAttribute("href", "#");
    });
    return serialize(target, css, displayCss);
  }

  function txtChapterHtml(book, index, displayCss) {
    const target = newTarget();
    const chunk = book.chunks[index];
    target.body.innerHTML = chunk
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p style="white-space: pre-wrap">${escapeHtml(block)}</p>`)
      .join("");
    return serialize(target, "p { margin: 0 0 1em; }", displayCss);
  }

  function chunkText(text) {
    const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
    const chunks = [];
    let current = "";
    paragraphs.forEach((paragraph) => {
      if (current && current.length + paragraph.length > TXT_CHUNK) {
        chunks.push(current);
        current = "";
      }
      current += `${current ? "\n\n" : ""}${paragraph}`;
    });
    if (current) chunks.push(current);
    return chunks.length ? chunks : [""];
  }

  /* ---------- Lettore ---------- */

  function tocLabel(book, index) {
    let label = "";
    book.toc.forEach((entry) => {
      if (entry.index <= index) label = entry.label;
    });
    return label || (book.count > 1 ? `Capitolo ${index + 1}` : "Testo");
  }

  function percent() {
    if (!reader || reader.type === "pdf") return 0;
    return clamp(Math.round(((reader.index + reader.frac) / reader.count) * 100), 0, 100);
  }

  function scroller() {
    return frame.contentDocument?.scrollingElement || null;
  }

  function currentFrac() {
    const node = scroller();
    if (!node) return reader?.frac || 0;
    const horizontal = prefs().navigation === "pages";
    const max = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
    const position = horizontal ? node.scrollLeft : node.scrollTop;
    return max > 0 ? clamp(position / max, 0, 1) : 0;
  }

  function readerPagePosition(node = scroller()) {
    if (!node) return { page: 1, count: 1 };
    const pageSize = Math.max(1, node.clientWidth);
    return {
      page: Math.floor(node.scrollLeft / pageSize) + 1,
      count: Math.max(1, Math.ceil(node.scrollWidth / pageSize)),
    };
  }

  function persistProgress() {
    if (!reader || reader.type === "pdf") return;
    const info = bookState(reader.id);
    info.ch = reader.index;
    info.frac = reader.frac;
    info.pct = percent();
    info.updated = Date.now();
    writeState();
  }

  function updateBar() {
    if (!reader || reader.type === "pdf") return;
    if (prefs().navigation === "pages") {
      const position = readerPagePosition();
      progressLabel.textContent = `${tocLabel(reader, reader.index)} · Pagina ${position.page} di ${position.count}`;
      prevButton.disabled = reader.index === 0 && position.page <= 1;
      nextButton.disabled = reader.index === reader.count - 1 && position.page >= position.count;
      reader.page = position.page;
      return;
    }
    progressLabel.textContent = `${tocLabel(reader, reader.index)} · ${percent()}%`;
    prevButton.disabled = reader.index === 0 && reader.frac < 0.01;
    nextButton.disabled = false;
  }

  async function chapterHtml(book, index, displayCss) {
    if (book.type === "txt") return txtChapterHtml(book, index, displayCss);
    if (book.type === "cbz") return cbzChapterHtml(book, index, displayCss);
    if (FLAT.has(book.type)) {
      const target = newTarget();
      target.body.innerHTML = book.chapters[index];
      return serialize(target, "p { margin: 0 0 1em; } table { border-collapse: collapse; } td, th { border: 1px solid currentColor; padding: 4px 8px; } pre { overflow-x: auto; white-space: pre-wrap; } blockquote { margin: 1em 0 1em 1em; padding-left: 1em; border-left: 3px solid currentColor; opacity: .85; }", displayCss);
    }
    return epubChapterHtml(book, index, displayCss);
  }

  async function cbzChapterHtml(book, index, displayCss) {
    const url = await resourceUrl(book, book.pages[index]);
    while (book.urls.size > 6) {
      const oldest = book.urls.keys().next().value;
      URL.revokeObjectURL(book.urls.get(oldest));
      book.urls.delete(oldest);
    }
    const target = newTarget();
    target.body.dataset.readerPage = "image";
    const img = target.createElement("img");
    img.setAttribute("src", url);
    img.setAttribute("alt", `Pagina ${index + 1}`);
    target.body.append(img);
    return serialize(target, "img { display: block; margin: 0 auto; }", displayCss);
  }

  async function loadChapter(index, options = {}) {
    const current = reader;
    if (!current || current.type === "pdf") return;
    const target = clamp(index, 0, current.count - 1);
    const token = ++current.token;
    let html;
    try {
      html = await chapterHtml(current, target);
    } catch (error) {
      say(`Impossibile aprire il capitolo: ${error.message}`);
      return;
    }
    if (reader !== current || token !== current.token) return;
    current.index = target;
    current.frac = options.frac || 0;
    current.pending = { frac: options.frac || 0, hash: options.hash || "", end: Boolean(options.end) };
    frame.classList.add("loading");
    frame.srcdoc = html;
    updateBar();
    showPageControls();
  }

  function onFrameLoad() {
    if (!reader || reader.type === "pdf" || !reader.pending) return;
    const { frac, hash, end } = reader.pending;
    reader.pending = null;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener("click", onFrameClick);
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("scroll", onFrameScroll, { passive: true });
    doc.addEventListener("pointermove", schedulePageControlsHide, { passive: true });
    doc.addEventListener("touchstart", showPageControls, { passive: true });
    doc.addEventListener("touchstart", onReaderTouchStart, { passive: true });
    doc.addEventListener("touchend", onReaderTouchEnd, { passive: false });
    doc.addEventListener("wheel", onReaderWheel, { passive: false });
    window.requestAnimationFrame(() => {
      const node = scroller();
      if (node) {
        const horizontal = prefs().navigation === "pages";
        const max = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
        let anchor = null;
        if (hash) {
          try { anchor = doc.getElementById(decodeURIComponent(hash)); } catch { anchor = doc.getElementById(hash); }
        }
        if (anchor) anchor.scrollIntoView();
        else if (horizontal) node.scrollLeft = (end ? 1 : frac) * Math.max(0, max);
        else node.scrollTop = (end ? 1 : frac) * Math.max(0, max);
      }
      reader.frac = currentFrac();
      frame.classList.remove("loading");
      persistProgress();
      updateBar();
      showPageControls();
      frame.contentWindow?.focus();
    });
  }

  function onFrameScroll() {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      if (!reader || reader.type === "pdf") return;
      reader.frac = currentFrac();
      if (prefs().navigation === "pages") reader.page = readerPagePosition().page;
      persistProgress();
      updateBar();
    }, 200);
  }

  function onReaderWheel(event) {
    showPageControls();
    if (ocrMode && reader?.type === "pdf") return;
    if (reader?.type === "pdf" && pdfViewer.classList.contains("pannable")) return;
    if (prefs().navigation !== "pages" || Math.abs(event.deltaY) < 20) return;
    event.preventDefault();
    const now = Date.now();
    if (now - wheelTurnAt < 280) return;
    wheelTurnAt = now;
    turn(Math.sign(event.deltaY));
  }

  function onReaderTouchStart(event) {
    if (ocrMode && reader?.type === "pdf") return;
    if (reader?.type === "pdf" && pdfViewer.classList.contains("pannable")) return;
    readerTouchStart = event.touches[0]?.clientY || 0;
  }

  function onReaderTouchEnd(event) {
    if (ocrMode && reader?.type === "pdf") return;
    if (reader?.type === "pdf" && pdfViewer.classList.contains("pannable")) return;
    if (prefs().navigation !== "pages" || !readerTouchStart) return;
    const delta = readerTouchStart - (event.changedTouches[0]?.clientY || readerTouchStart);
    readerTouchStart = 0;
    if (Math.abs(delta) < 55) return;
    event.preventDefault();
    turn(Math.sign(delta));
  }

  function onFrameClick(event) {
    showPageControls();
    const link = event.target.closest?.("a");
    if (link) {
      event.preventDefault();
      if (link.dataset.ext) {
        window.open(link.dataset.ext, "_blank", "noopener,noreferrer");
      } else if (link.dataset.local) {
        const anchor = frame.contentDocument.getElementById(link.dataset.local);
        if (anchor) anchor.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
        else say("Collegamento non disponibile in questo libro.");
      } else if (link.dataset.path !== undefined) {
        const index = reader.spine ? reader.spine.indexOf(reader.zip.lookup(link.dataset.path) || link.dataset.path) : -1;
        if (index === reader.index && link.dataset.hash) {
          frame.contentDocument.getElementById(link.dataset.hash)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
        } else if (index >= 0) {
          loadChapter(index, { hash: link.dataset.hash });
        } else {
          say("Collegamento non disponibile in questo libro.");
        }
      }
      return;
    }
    if (String(frame.contentWindow.getSelection()) !== "") return;
    const ratio = event.clientX / frame.contentWindow.innerWidth;
    if (ratio < 0.2) turn(-1);
    else if (ratio > 0.8) turn(1);
  }

  let pdfJsPromise;

  function loadPdfJs() {
    pdfJsPromise ||= import("../vendor/pdfjs/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    }).catch((error) => {
      pdfJsPromise = null;
      throw error;
    });
    return pdfJsPromise;
  }

  function pdfScale(viewport, availableWidth, availableHeight) {
    if (prefs().fit === "page") return Math.min(availableWidth / viewport.width, availableHeight / viewport.height);
    if (prefs().fit === "original") return 1;
    return availableWidth / viewport.width;
  }

  function onPdfPointerDown(event) {
    if (ocrMode) {
      startOcrSelection(event);
      return;
    }
    if (reader?.type !== "pdf" || !pdfViewer.classList.contains("pannable") || event.button !== 0) return;
    if (pdfViewer.scrollWidth <= pdfViewer.clientWidth && pdfViewer.scrollHeight <= pdfViewer.clientHeight) return;
    pdfPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: pdfViewer.scrollLeft, top: pdfViewer.scrollTop };
    pdfViewer.setPointerCapture(event.pointerId);
    pdfViewer.classList.add("panning");
    readerTouchStart = 0;
    event.preventDefault();
  }

  function onPdfPointerMove(event) {
    if (ocrSelection) {
      moveOcrSelection(event);
      return;
    }
    if (!pdfPan || pdfPan.pointerId !== event.pointerId) return;
    pdfViewer.scrollLeft = pdfPan.left - (event.clientX - pdfPan.x);
    pdfViewer.scrollTop = pdfPan.top - (event.clientY - pdfPan.y);
  }

  function onPdfPointerEnd(event) {
    if (ocrSelection) {
      endOcrSelection(event);
      return;
    }
    if (!pdfPan || (event.pointerId !== undefined && pdfPan.pointerId !== event.pointerId)) return;
    pdfPan = null;
    pdfViewer.classList.remove("panning");
  }

  function setOcrMode(active) {
    ocrMode = active;
    ocrButton.setAttribute("aria-pressed", String(active));
    pdfViewer.classList.toggle("ocr-selecting", active);
    readerStage.classList.toggle("ocr-selecting", active);
    if (!active && ocrSelection) {
      ocrSelection.box.remove();
      ocrSelection = null;
    }
    ocrStatus.textContent = active ? "Trascina un riquadro sul testo della pagina. Esc annulla." : "";
  }

  function startOcrSelection(event) {
    if (event.button !== 0 || !event.isPrimary || ocrJob) return;
    const canvas = event.target.closest?.(".lb-pdf-canvas");
    const host = canvas?.closest(".lb-pdf-page");
    if (!canvas || !host?.classList.contains("rendered")) {
      ocrStatus.textContent = "Attendi il caricamento della pagina e seleziona un'area sulla pagina.";
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const box = el("div", "lb-ocr-selection");
    readerStage.append(box);
    ocrSelection = {
      pointerId: event.pointerId, bounds, box, page: Number(host.dataset.page),
      x: clamp(event.clientX, bounds.left, bounds.right),
      y: clamp(event.clientY, bounds.top, bounds.bottom),
    };
    pdfViewer.setPointerCapture(event.pointerId);
    moveOcrSelection(event);
    event.preventDefault();
  }

  function moveOcrSelection(event) {
    const selection = ocrSelection;
    if (!selection || selection.pointerId !== event.pointerId) return;
    const x = clamp(event.clientX, selection.bounds.left, selection.bounds.right);
    const y = clamp(event.clientY, selection.bounds.top, selection.bounds.bottom);
    selection.box.style.left = `${Math.min(selection.x, x)}px`;
    selection.box.style.top = `${Math.min(selection.y, y)}px`;
    selection.box.style.width = `${Math.abs(x - selection.x)}px`;
    selection.box.style.height = `${Math.abs(y - selection.y)}px`;
  }

  function endOcrSelection(event) {
    const selection = ocrSelection;
    if (!selection || selection.pointerId !== event.pointerId) return;
    ocrSelection = null;
    selection.box.remove();
    if (event.type !== "pointerup") {
      ocrStatus.textContent = "Selezione annullata. Trascina un nuovo riquadro.";
      return;
    }
    const x = clamp(event.clientX, selection.bounds.left, selection.bounds.right);
    const y = clamp(event.clientY, selection.bounds.top, selection.bounds.bottom);
    const left = Math.min(selection.x, x);
    const top = Math.min(selection.y, y);
    const width = Math.abs(x - selection.x);
    const height = Math.abs(y - selection.y);
    if (width < 8 || height < 8) {
      ocrStatus.textContent = "Il riquadro è troppo piccolo. Trascina un'area più grande.";
      return;
    }
    const area = {
      x: (left - selection.bounds.left) / selection.bounds.width,
      y: (top - selection.bounds.top) / selection.bounds.height,
      width: width / selection.bounds.width,
      height: height / selection.bounds.height,
    };
    setOcrMode(false);
    recognizePdfArea(reader, selection.page, area);
  }

  function loadOcr() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!ocrScriptPromise) {
      ocrScriptPromise = new Promise((resolve, reject) => {
        const script = el("script");
        script.src = new URL("tesseract.min.js", OCR_URL).href;
        script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Motore OCR non disponibile."));
        script.onerror = () => {
          script.remove();
          reject(new Error("Impossibile caricare il motore OCR locale."));
        };
        document.head.append(script);
      }).catch((error) => {
        ocrScriptPromise = null;
        throw error;
      });
    }
    return ocrScriptPromise;
  }

  async function recognizePdfArea(current, pageNumber, area) {
    if (!current?.pdf || ocrJob) return;
    const job = { current, cancelled: false };
    ocrJob = job;
    ocrButton.disabled = true;
    ocrStatus.textContent = "Preparo l'area selezionata…";
    let worker;
    let canvas;
    try {
      const pageData = await current.pdf.getPage(pageNumber);
      if (job.cancelled) return;
      const base = pageData.getViewport({ scale: 1 });
      const scale = Math.min(3, Math.sqrt(12000000 / (base.width * base.height * area.width * area.height)));
      const viewport = pageData.getViewport({ scale });
      const left = Math.floor(viewport.width * area.x);
      const top = Math.floor(viewport.height * area.y);
      canvas = el("canvas");
      canvas.width = Math.ceil(viewport.width * (area.x + area.width)) - left;
      canvas.height = Math.ceil(viewport.height * (area.y + area.height)) - top;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas non disponibile.");
      await pageData.render({ canvasContext: context, viewport, transform: [1, 0, 0, 1, -left, -top] }).promise;
      if (job.cancelled) return;
      ocrStatus.textContent = "Avvio il riconoscimento locale italiano e inglese…";
      const engine = await loadOcr();
      if (job.cancelled) return;
      worker = await engine.createWorker("ita+eng", 1, {
        workerPath: new URL("worker.min.js", OCR_URL).href,
        corePath: new URL("core/", OCR_URL).href,
        langPath: new URL("lang/", OCR_URL).href,
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (progress) => {
          if (!job.cancelled && progress.status === "recognizing text") {
            ocrStatus.textContent = `Riconoscimento testo: ${Math.round(progress.progress * 100)}%`;
          }
        },
      });
      if (job.cancelled) return;
      const result = await worker.recognize(canvas);
      if (job.cancelled || reader !== current) return;
      ocrText.value = result.data.text.trim();
      ocrStatus.textContent = ocrText.value ? "Testo riconosciuto: controllalo prima di copiarlo." : "Nessun testo riconosciuto nell'area selezionata.";
      if (ocrText.value) {
        ocrDialog.showModal();
        ocrText.focus();
      }
    } catch (error) {
      if (!job.cancelled) ocrStatus.textContent = `Riconoscimento non riuscito: ${error.message || "errore"}`;
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (worker) {
        try { await worker.terminate(); } catch (error) { console.error("Errore nella chiusura dell'OCR:", error); }
      }
      if (ocrJob === job) {
        ocrJob = null;
        ocrButton.disabled = false;
      }
    }
  }

  function adjustReaderScale(delta) {
    if (!reader) return;
    const frac = reader.type === "pdf" ? 0 : currentFrac();
    if (reader.type === "pdf") {
      prefs().zoom = clamp(Math.round(((prefs().zoom || 1) + delta) * 10) / 10, 0.5, 3);
      if (pdfZoomValue) pdfZoomValue.textContent = `${Math.round(prefs().zoom * 100)}%`;
    } else {
      prefs().size = clamp(prefs().size + Math.sign(delta), 13, 34);
      if (fontSizeValue) fontSizeValue.textContent = `${prefs().size}`;
    }
    savePrefs();
    restyleReader(frac);
  }

  async function renderPdfCanvas(current, pageNumber, host) {
    if (reader !== current || !current.pdf) return;
    const canvas = host.querySelector("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas non disponibile in questo browser.");
    const pageData = await current.pdf.getPage(pageNumber);
    if (reader !== current || !host.isConnected) return;
    const baseViewport = pageData.getViewport({ scale: 1 });
    const style = getComputedStyle(pdfViewer);
    const availableWidth = Math.max(240, pdfViewer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 32);
    const availableHeight = Math.max(240, pdfViewer.clientHeight - 32);
    const scale = pdfScale(baseViewport, availableWidth, availableHeight) * (prefs().zoom || 1);
    const viewport = pageData.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${Math.ceil(viewport.width)}px`;
    canvas.style.height = `${Math.ceil(viewport.height)}px`;
    host.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    pdfPageTasks.get(host)?.cancel();
    const task = pageData.render({ canvasContext: context, viewport });
    pdfPageTasks.set(host, task);
    await task.promise;
    if (reader !== current || !host.isConnected) return;
    host.classList.add("rendered");
  }

  function updatePdfProgress(current) {
    if (reader !== current || !current.pdf) return;
    progressLabel.textContent = `Pagina ${current.page} di ${current.pdf.numPages}`;
    prevButton.disabled = current.page <= 1;
    nextButton.disabled = current.page >= current.pdf.numPages;
    markPdfThumb(current);
  }

  let thumbPanel;
  let thumbButton;
  let thumbObserver;
  let thumbChain = Promise.resolve();
  let thumbsOpen = false;
  let thumbsFor = null;

  function markPdfThumb(current) {
    if (!thumbPanel || thumbPanel.hidden || thumbsFor !== current) return;
    thumbPanel.querySelectorAll(".lb-thumb[aria-current]").forEach((node) => node.removeAttribute("aria-current"));
    const active = thumbPanel.querySelector(`.lb-thumb[data-page="${current.page}"]`);
    if (!active) return;
    active.setAttribute("aria-current", "page");
    active.scrollIntoView({ block: "nearest" });
  }

  function renderPdfThumb(current, pageNumber, node) {
    thumbChain = thumbChain.then(async () => {
      if (reader !== current || !node.isConnected) return;
      const page = await current.pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 96 / base.width });
      const canvas = node.querySelector("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
    }).catch(() => {});
  }

  function buildPdfThumbs(current) {
    thumbObserver?.disconnect();
    thumbsFor = current;
    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= current.pdf.numPages; pageNumber += 1) {
      const node = el("button", "lb-thumb");
      node.type = "button";
      node.dataset.page = String(pageNumber);
      node.setAttribute("aria-label", `Vai a pagina ${pageNumber}`);
      node.append(el("canvas"), el("span", "", String(pageNumber)));
      node.addEventListener("click", () => goToPdfPage(pageNumber));
      fragment.append(node);
    }
    thumbPanel.replaceChildren(fragment);
    thumbObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        thumbObserver.unobserve(entry.target);
        renderPdfThumb(current, Number(entry.target.dataset.page), entry.target);
      });
    }, { root: thumbPanel, rootMargin: "300px 0px" });
    thumbPanel.querySelectorAll(".lb-thumb").forEach((node) => thumbObserver.observe(node));
  }

  function setPdfThumbs(open) {
    thumbsOpen = open;
    thumbButton?.setAttribute("aria-pressed", String(open));
    const current = reader;
    const show = open && current?.type === "pdf" && current.pdf;
    thumbPanel.hidden = !show;
    if (!show) return;
    if (thumbsFor !== current) buildPdfThumbs(current);
    markPdfThumb(current);
    restyleReader();
  }

  function goToPdfPage(pageNumber) {
    const current = reader;
    if (!current || current.type !== "pdf" || !current.pdf) return;
    const nextPage = clamp(pageNumber, 1, current.pdf.numPages);
    if (nextPage === current.page) return;
    current.page = nextPage;
    if (prefs().navigation === "pages") {
      configurePdfReader().catch((error) => say(`Impossibile mostrare la pagina PDF: ${error.message}`));
    } else {
      const target = pdfViewer.querySelector(`[data-page="${nextPage}"]`);
      if (target) pdfViewer.scrollTo({ top: pdfPageTop(target), behavior: reducedMotion() ? "auto" : "smooth" });
      updatePdfProgress(current);
    }
    const info = bookState(current.id);
    info.page = nextPage;
    info.updated = Date.now();
    writeState();
    showPageControls();
  }

  function pdfPageTop(host) {
    return pdfViewer.scrollTop + host.getBoundingClientRect().top - pdfViewer.getBoundingClientRect().top;
  }

  function visiblePdfPage(current) {
    const center = pdfViewer.getBoundingClientRect().top + pdfViewer.clientHeight / 2;
    let closest = current.page;
    let distance = Number.POSITIVE_INFINITY;
    visiblePdfPages.forEach((host) => {
      const midpoint = host.getBoundingClientRect().top + host.offsetHeight / 2;
      if (Math.abs(midpoint - center) < distance) {
        distance = Math.abs(midpoint - center);
        closest = Number(host.dataset.page);
      }
    });
    if (!Number.isFinite(distance)) return;
    current.page = closest;
    updatePdfProgress(current);
  }

  function onPdfScroll() {
    if (!reader || reader.type !== "pdf" || prefs().navigation !== "scroll") return;
    visiblePdfPage(reader);
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      if (reader?.type !== "pdf") return;
      const info = bookState(reader.id);
      info.page = reader.page;
      info.updated = Date.now();
      writeState();
    }, 180);
  }

  async function configurePdfReader() {
    const current = reader;
    if (!current || current.type !== "pdf" || !current.pdf) return;
    if (ocrSelection) setOcrMode(false);
    pdfPan = null;
    pdfViewer.classList.remove("panning");
    pdfObserver?.disconnect();
    pdfObserver = null;
    visiblePdfPages.clear();
    pdfViewer.replaceChildren();
    pdfViewer.classList.toggle("continuous", prefs().navigation === "scroll");
    pdfViewer.classList.toggle("original", prefs().fit === "original");
    pdfViewer.classList.toggle("pannable", (prefs().zoom || 1) > 1 || prefs().fit === "original");
    if (prefs().navigation === "pages") {
      const host = el("div", "lb-pdf-page");
      host.dataset.page = String(current.page);
      host.append(el("canvas", "lb-pdf-canvas"));
      pdfViewer.append(host);
      try {
        await renderPdfCanvas(current, current.page, host);
      } catch (error) {
        if (error?.name !== "RenderingCancelledException") throw error;
      }
      updatePdfProgress(current);
      return;
    }

    const firstPage = await current.pdf.getPage(1);
    if (reader !== current) return;
    const firstViewport = firstPage.getViewport({ scale: 1 });
    const pages = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= current.pdf.numPages; pageNumber += 1) {
      const host = el("div", "lb-pdf-page");
      host.dataset.page = String(pageNumber);
      host.style.aspectRatio = `${firstViewport.width} / ${firstViewport.height}`;
      host.append(el("canvas", "lb-pdf-canvas"));
      pages.append(host);
    }
    pdfViewer.append(pages);
    pdfObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const host = entry.target;
        const pageNumber = Number(entry.target.dataset.page);
        if (!entry.isIntersecting) {
          visiblePdfPages.delete(host);
          if (Math.abs(pageNumber - current.page) > 3 && host.classList.contains("rendered")) {
            pdfPageTasks.get(host)?.cancel();
            const canvas = host.querySelector("canvas");
            canvas.width = 0;
            canvas.height = 0;
            host.classList.remove("rendered");
          }
          return;
        }
        visiblePdfPages.add(host);
        if (host.classList.contains("rendered")) return;
        renderPdfCanvas(current, pageNumber, entry.target).catch((error) => {
          if (error?.name !== "RenderingCancelledException") say(`Impossibile mostrare la pagina ${pageNumber}: ${error.message}`);
        });
      });
    }, { root: pdfViewer, rootMargin: "100% 0px" });
    pdfViewer.querySelectorAll(".lb-pdf-page").forEach((host) => pdfObserver.observe(host));
    const target = pdfViewer.querySelector(`[data-page="${current.page}"]`);
    if (target) pdfViewer.scrollTop = pdfPageTop(target);
    updatePdfProgress(current);
  }

  async function openPdf(current, savedPage = 1) {
    const pdfjs = await loadPdfJs();
    if (reader !== current) return;
    const loadingTask = pdfjs.getDocument({ data: await current.blob.arrayBuffer(), wasmUrl: PDFJS_WASM_URL });
    current.pdfLoadingTask = loadingTask;
    const documentData = await loadingTask.promise;
    if (reader !== current) {
      await documentData.destroy();
      return;
    }
    current.pdf = documentData;
    current.page = clamp(savedPage, 1, documentData.numPages);
    await configurePdfReader();
    updatePdfProgress(current);
    const info = bookState(current.id);
    info.page = current.page;
    info.updated = Date.now();
    writeState();
  }

  function turn(direction) {
    if (!reader) return;
    if (reader.type === "pdf") {
      goToPdfPage(reader.page + direction);
      return;
    }
    const node = scroller();
    if (!node) return;
    const smooth = reducedMotion() ? "auto" : "smooth";
    if (prefs().navigation === "pages") {
      const pageStep = node.clientWidth;
      const max = Math.max(0, node.scrollWidth - node.clientWidth);
      if (direction > 0) {
        if (node.scrollLeft >= max - 4) {
          if (reader.index < reader.count - 1) loadChapter(reader.index + 1);
          else say("Sei arrivato alla fine del libro.");
          return;
        }
        node.scrollTo({ left: Math.min(max, node.scrollLeft + pageStep), behavior: smooth });
      } else {
        if (node.scrollLeft <= 4) {
          if (reader.index > 0) loadChapter(reader.index - 1, { end: true });
          return;
        }
        node.scrollTo({ left: Math.max(0, node.scrollLeft - pageStep), behavior: smooth });
      }
      return;
    }
    if (direction > 0) {
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 4) {
        if (reader.index < reader.count - 1) loadChapter(reader.index + 1);
        else say("Sei arrivato alla fine del libro.");
        return;
      }
      node.scrollTo({ top: Math.min(node.scrollHeight - node.clientHeight, node.scrollTop + node.clientHeight), behavior: smooth });
    } else {
      if (node.scrollTop <= 4) {
        if (reader.index > 0) loadChapter(reader.index - 1, { end: true });
        return;
      }
      node.scrollTo({ top: Math.max(0, node.scrollTop - node.clientHeight), behavior: smooth });
    }
  }

  function showPageControls() {
    if (!pageControls || !reader) return;
    window.clearTimeout(controlsTimer);
    readerStage.classList.add("controls-visible");
    controlsTimer = window.setTimeout(() => {
      const keyboardFocus = [prevButton, nextButton].some((buttonNode) => buttonNode.matches(":focus-visible"));
      if (readerStage && !keyboardFocus) readerStage.classList.remove("controls-visible");
    }, CONTROLS_DELAY);
  }

  function schedulePageControlsHide() {
    showPageControls();
  }

  function onKey(event) {
    if (ocrMode && event.key === "Escape") {
      event.preventDefault();
      setOcrMode(false);
      return;
    }
    if (!ui.active || ui.tab !== "read" || !reader || reader.type === "pdf" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (indexDialog.open || event.target.closest?.("button, a, select, input, textarea")) return;
    showPageControls();
    if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
      event.preventDefault();
      turn(1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
      event.preventDefault();
      turn(-1);
    }
  }

  function restyleReader(frac = currentFrac()) {
    const c = themeColors();
    readerPanel.style.setProperty("--lb-bg", c.bg);
    readerPanel.style.setProperty("--lb-fg", c.fg);
    if (navigationSelect) navigationSelect.value = prefs().navigation;
    if (fitSelect) fitSelect.value = prefs().fit;
    if (fontSizeValue) fontSizeValue.textContent = String(prefs().size);
    if (pdfZoomValue) pdfZoomValue.textContent = `${Math.round((prefs().zoom || 1) * 100)}%`;
    if (reader?.type === "pdf") {
      configurePdfReader().catch((error) => say(`Impossibile aggiornare il PDF: ${error.message}`));
      return;
    }
    const style = frame.contentDocument?.getElementById("cp-reader");
    if (!style) return;
    style.textContent = readerCss();
    window.requestAnimationFrame(() => {
      const node = scroller();
      if (!node) return;
      if (prefs().navigation === "pages") node.scrollLeft = frac * Math.max(0, node.scrollWidth - node.clientWidth);
      else node.scrollTop = frac * Math.max(0, node.scrollHeight - node.clientHeight);
      updateBar();
    });
  }

  async function openBook(id, position) {
    const record = await dbGet(id);
    if (!record) {
      say("Libro non trovato nella libreria.");
      selectTab("shelf");
      return;
    }
    closeReader();
    const info = bookState(id);
    const current = { id, type: record.type, title: record.title, author: record.author, token: 0, index: 0, frac: 0, page: 1, count: 1, toc: [], urls: new Map(), pending: null };
    try {
      const blob = await bookBlob(record);
      if (record.type === "epub") {
        const parsed = await parseEpub(blob);
        Object.assign(current, { zip: parsed.zip, spine: parsed.spine, toc: parsed.toc, count: parsed.spine.length });
      } else if (record.type === "txt") {
        current.chunks = chunkText(decodeText(new Uint8Array(await blob.arrayBuffer())));
        current.count = current.chunks.length;
        current.toc = current.count > 1 ? current.chunks.map((_, i) => ({ label: `Parte ${i + 1}`, index: i, hash: "" })) : [];
      } else if (record.type === "cbz") {
        const parsed = await parseCbz(blob);
        Object.assign(current, { zip: parsed.zip, pages: parsed.pages, count: parsed.pages.length });
        current.toc = parsed.pages.map((_, i) => ({ label: `Pagina ${i + 1}`, index: i, hash: "" }));
      } else if (FLAT.has(record.type)) {
        const parsed = await parseOther(record.type, blob);
        Object.assign(current, { chapters: parsed.chapters, toc: parsed.toc, count: parsed.chapters.length });
      } else if (record.type === "pdf") {
        current.blob = blob;
      }
    } catch (error) {
      say(`Impossibile aprire «${record.title}»: ${error.message || "file non leggibile"}`);
      selectTab("shelf");
      return;
    }
    reader = current;
    ui.tab = "read";
    saveView(`read:${id}`);
    titleElement.textContent = record.title;
    descriptionElement.textContent = record.author || (record.type === "pdf" ? "Documento PDF" : "");
    metaElement.textContent = "";
    shelfPanel.hidden = true;
    bookmarksPanel.hidden = true;
    readerPanel.hidden = false;
    document.documentElement.classList.add("library-reader-open");
    document.body.classList.add("library-reader-open");
    readerTitle.textContent = record.title;
    const isPdf = record.type === "pdf";
    frame.hidden = isPdf;
    pdfViewer.hidden = !isPdf;
    readerStage.classList.toggle("pdf-stage", isPdf);
    popover.hidden = true;
    bookmarkButton.hidden = isPdf;
    thumbButton.hidden = !isPdf;
    ocrButton.hidden = !isPdf;
    thumbPanel.hidden = true;
    thumbsFor = null;
    settingsButton.hidden = false;
    fontSizeControls.hidden = isPdf || record.type === "cbz";
    pdfZoomControls.hidden = !isPdf;
    navigationSelect.value = prefs().navigation;
    fitSelect.value = prefs().fit;
    fontSizeValue.textContent = String(prefs().size);
    pdfZoomValue.textContent = `${Math.round((prefs().zoom || 1) * 100)}%`;
    progressLabel.hidden = false;
    renderTabs();
    restyleReader();
    if (isPdf) {
      current.url = URL.createObjectURL(current.blob);
      try {
        await openPdf(current, info.page || 1);
        if (reader === current && thumbsOpen) setPdfThumbs(true);
        showPageControls();
      } catch (error) {
        if (reader !== current) return;
        say(`Impossibile aprire il PDF: ${error.message || "file non leggibile"}`);
      }
      return;
    }
    const start = position || { ch: info.ch, frac: info.frac };
    await loadChapter(clamp(start.ch || 0, 0, current.count - 1), { frac: start.frac || 0 });
    if (!position && info.updated) say(`Riprendi da: ${tocLabel(current, current.index)}.`);
  }

  function closeReader() {
    if (!reader) {
      document.documentElement.classList.remove("library-reader-open");
      document.body.classList.remove("library-reader-open");
      return;
    }
    window.clearTimeout(scrollTimer);
    window.clearTimeout(controlsTimer);
    if (ocrJob) {
      ocrJob.cancelled = true;
      ocrJob = null;
    }
    setOcrMode(false);
    ocrButton.disabled = false;
    if (ocrDialog.open) ocrDialog.close();
    ocrText.value = "";
    readerStage?.classList.remove("controls-visible");
    if (reader.type !== "pdf") {
      reader.frac = currentFrac();
      persistProgress();
    }
    reader.urls?.forEach((url) => URL.revokeObjectURL(url));
    pdfObserver?.disconnect();
    pdfObserver = null;
    thumbObserver?.disconnect();
    thumbsFor = null;
    thumbPanel.replaceChildren();
    thumbPanel.hidden = true;
    const pdfCleanup = reader.pdfLoadingTask?.destroy();
    pdfCleanup?.catch((error) => say(`Errore chiudendo il PDF: ${error.message}`));
    if (reader.url) URL.revokeObjectURL(reader.url);
    reader = null;
    frame.removeAttribute("srcdoc");
    pdfViewer.replaceChildren();
    readerPanel.hidden = true;
    document.documentElement.classList.remove("library-reader-open");
    document.body.classList.remove("library-reader-open");
    popover.hidden = true;
    if (document.fullscreenElement === readerPanel) document.exitFullscreen?.();
  }

  function addBookmark() {
    if (!reader || reader.type === "pdf") return;
    reader.frac = currentFrac();
    const marks = bookState(reader.id).bookmarks;
    if (marks.some((mark) => mark.ch === reader.index && Math.abs(mark.frac - reader.frac) < 0.02)) {
      say("Hai già un segnalibro in questo punto.");
      return;
    }
    marks.push({ ch: reader.index, frac: reader.frac, label: `${tocLabel(reader, reader.index)} · ${percent()}%`, t: Date.now() });
    writeState();
    say("Segnalibro aggiunto.");
  }

  function openIndex() {
    if (!reader || reader.type === "pdf") return;
    const body = el("div", "lb-dialog-body");
    body.append(el("h2", "lb-dialog-title", "Indice"));
    const toc = el("ul", "lb-list");
    const entries = reader.toc.length ? reader.toc : Array.from({ length: reader.count }, (_, i) => ({ label: `Capitolo ${i + 1}`, index: i, hash: "" }));
    entries.forEach((entry) => {
      const item = el("li", "lb-row");
      const open = el("button", "lb-row-main", entry.label);
      open.type = "button";
      if (entry.index === reader.index) open.setAttribute("aria-current", "true");
      open.addEventListener("click", () => {
        indexDialog.close();
        loadChapter(entry.index, { hash: entry.hash });
      });
      item.append(open);
      toc.append(item);
    });
    body.append(toc);
    const marks = bookState(reader.id).bookmarks;
    body.append(el("h2", "lb-dialog-title", "Segnalibri di questo libro"));
    if (!marks.length) body.append(el("p", "lb-note", "Nessun segnalibro."));
    else {
      const list = el("ul", "lb-list");
      marks.forEach((mark) => {
        const item = el("li", "lb-row");
        const open = el("button", "lb-row-main");
        open.type = "button";
        open.append(el("span", "", mark.label), el("small", "", new Date(mark.t).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })));
        open.addEventListener("click", () => {
          indexDialog.close();
          loadChapter(mark.ch, { frac: mark.frac });
        });
        const remove = iconButton("Elimina segnalibro", ICONS.del, () => {
          marks.splice(marks.indexOf(mark), 1);
          writeState();
          openIndex();
        });
        item.append(open, remove);
        list.append(item);
      });
      body.append(list);
    }
    const close = button("Chiudi", null, () => indexDialog.close());
    body.append(close);
    indexDialog.replaceChildren(body);
    if (!indexDialog.open) indexDialog.showModal();
    indexDialog.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
  }

  function buildSettings() {
    const box = el("div", "lb-pop");
    box.hidden = true;
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Impostazioni di lettura");

    const field = (label, control) => {
      const row = el("label", "lb-field");
      row.append(el("span", "", label), control);
      return row;
    };
    const makeSelect = (name, options, key, cast) => {
      const select = el("select", "lb-select");
      select.setAttribute("aria-label", name);
      options.forEach(([value, text]) => {
        const option = el("option", "", text);
        option.value = String(value);
        select.append(option);
      });
      select.value = String(prefs()[key]);
      select.addEventListener("change", () => {
        const frac = reader && reader.type !== "pdf" ? currentFrac() : 0;
        prefs()[key] = cast(select.value);
        savePrefs();
        restyleReader(frac);
      });
      return select;
    };

    const sizeRow = el("div", "lb-field");
    sizeRow.append(el("span", "", "Dimensione"));
    const sizeValue = el("strong", "lb-size", `${prefs().size}`);
    const step = (delta) => () => {
      const frac = reader && reader.type !== "pdf" ? currentFrac() : 0;
      prefs().size = clamp(prefs().size + delta, 13, 34);
      sizeValue.textContent = String(prefs().size);
      savePrefs();
      restyleReader(frac);
    };
    const smaller = el("button", "lb-step", "A−");
    const larger = el("button", "lb-step", "A+");
    smaller.type = "button";
    larger.type = "button";
    smaller.setAttribute("aria-label", "Riduci il testo");
    larger.setAttribute("aria-label", "Ingrandisci il testo");
    smaller.addEventListener("click", step(-1));
    larger.addEventListener("click", step(1));
    const stepper = el("span", "lb-stepper");
    stepper.append(smaller, sizeValue, larger);
    sizeRow.append(stepper);

    box.append(
      field("Navigazione", makeSelect("Modalità di navigazione", [["scroll", "Scorrimento verticale"], ["pages", "Una pagina alla volta"]], "navigation", String)),
      field("Adattamento", makeSelect("Adattamento della pagina", [["page", "Pagina intera"], ["width", "Adatta alla larghezza"], ["original", "Dimensioni originali"]], "fit", String)),
    );
    if (reader?.type !== "pdf" && reader?.type !== "cbz") {
      box.append(
        sizeRow,
        field("Carattere", makeSelect("Carattere", [["serif", "Con grazie (serif)"], ["sans", "Senza grazie"], ["book", "Originale del libro"]], "font", String)),
        field("Tema", makeSelect("Tema", [["auto", "Come l'app"], ["light", "Chiaro"], ["sepia", "Seppia"], ["dark", "Scuro"]], "theme", String)),
        field("Interlinea", makeSelect("Interlinea", [[1.35, "Stretta"], [1.6, "Normale"], [1.9, "Ampia"]], "line", Number)),
        field("Larghezza", makeSelect("Larghezza", [[560, "Stretta"], [720, "Media"], [920, "Larga"]], "width", Number)),
      );
    }
    return box;
  }

  function buildReader() {
    const panel = el("div", "lb-reader");
    panel.hidden = true;
    readerTitle = el("span", "lb-reader-title");
    bookmarkButton = iconButton("Aggiungi segnalibro", ICONS.bookmark, addBookmark);
    settingsButton = iconButton("Impostazioni di lettura", ICONS.text, () => {
      if (popover.hidden) {
        const fresh = buildSettings();
        popover.replaceWith(fresh);
        popover = fresh;
      }
      popover.hidden = !popover.hidden;
    });
    const toolbar = el("div", "lb-toolbar");
    const makeToolbarSelect = (label, className, options, key) => {
      const select = el("select", className);
      select.setAttribute("aria-label", label);
      select.title = label;
      options.forEach(([value, text]) => {
        const option = el("option", "", text);
        option.value = value;
        select.append(option);
      });
      select.value = prefs()[key];
      select.addEventListener("change", () => {
        const frac = reader && reader.type !== "pdf" ? currentFrac() : 0;
        prefs()[key] = select.value;
        savePrefs();
        restyleReader(frac);
      });
      return select;
    };
    navigationSelect = makeToolbarSelect("Navigazione pagine", "lb-toolbar-select lb-navigation-select", [
      ["pages", "Pagine"], ["scroll", "Scorrimento"],
    ], "navigation");
    fitSelect = makeToolbarSelect("Adattamento alla finestra", "lb-toolbar-select lb-fit-select", [
      ["page", "Pagina intera"], ["width", "Adatta larghezza"], ["original", "Dimensioni originali"],
    ], "fit");
    fontSizeControls = el("span", "lb-toolbar-scale");
    const fontDecrease = button("A−", null, () => adjustReaderScale(-1), true);
    const fontIncrease = button("A+", null, () => adjustReaderScale(1), true);
    fontDecrease.setAttribute("aria-label", "Riduci dimensione carattere");
    fontIncrease.setAttribute("aria-label", "Aumenta dimensione carattere");
    fontSizeValue = el("span", "lb-toolbar-scale-value", String(prefs().size));
    fontSizeControls.append(fontDecrease, fontSizeValue, fontIncrease);
    pdfZoomControls = el("span", "lb-toolbar-scale");
    const zoomDecrease = iconButton("Riduci zoom PDF", ICONS.zoomOut, () => adjustReaderScale(-0.1));
    const zoomIncrease = iconButton("Aumenta zoom PDF", ICONS.zoomIn, () => adjustReaderScale(0.1));
    pdfZoomValue = el("span", "lb-toolbar-scale-value", `${Math.round((prefs().zoom || 1) * 100)}%`);
    pdfZoomControls.append(zoomDecrease, pdfZoomValue, zoomIncrease);
    thumbButton = iconButton("Anteprima delle pagine", ICONS.thumbs, () => setPdfThumbs(!thumbsOpen));
    thumbButton.setAttribute("aria-pressed", String(thumbsOpen));
    thumbButton.hidden = true;
    thumbPanel = el("div", "lb-thumbs");
    thumbPanel.setAttribute("role", "region");
    thumbPanel.setAttribute("aria-label", "Anteprima delle pagine");
    thumbPanel.hidden = true;
    ocrButton = iconButton("Riconosci testo selezionato (OCR)", ICONS.ocr, () => {
      if (!reader?.pdf) {
        ocrStatus.textContent = "Attendi il caricamento del PDF.";
        return;
      }
      setOcrMode(!ocrMode);
    });
    ocrButton.setAttribute("aria-pressed", "false");
    ocrButton.hidden = true;
    toolbar.append(
      button("Scaffale", ICONS.back, () => selectTab("shelf")),
      readerTitle,
      navigationSelect,
      fitSelect,
      fontSizeControls,
      pdfZoomControls,
      iconButton("Indice e segnalibri", ICONS.list, openIndex),
      thumbButton,
      ocrButton,
      bookmarkButton,
      settingsButton,
      iconButton("Schermo intero", ICONS.full, () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else readerPanel.requestFullscreen?.().catch(() => {});
      }),
    );
    const open = button("Apri in una scheda", ICONS.open, () => {
      if (reader?.url) window.open(reader.url, "_blank", "noopener");
    });
    open.classList.add("lb-pdf-open");
    toolbar.append(open);
    popover = buildSettings();

    frame = el("iframe", "lb-frame");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.title = "Testo del libro";
    frame.addEventListener("load", onFrameLoad);
    pdfViewer = el("div", "lb-pdf");
    pdfViewer.setAttribute("role", "region");
    pdfViewer.setAttribute("aria-label", "Pagine del documento PDF");
    pdfViewer.hidden = true;
    pdfViewer.addEventListener("scroll", onPdfScroll, { passive: true });
    pdfViewer.addEventListener("wheel", onReaderWheel, { passive: false });
    pdfViewer.addEventListener("pointerdown", onPdfPointerDown);
    pdfViewer.addEventListener("pointermove", onPdfPointerMove);
    pdfViewer.addEventListener("pointerup", onPdfPointerEnd);
    pdfViewer.addEventListener("pointercancel", onPdfPointerEnd);
    pdfViewer.addEventListener("lostpointercapture", onPdfPointerEnd);
    pdfViewer.addEventListener("touchstart", showPageControls, { passive: true });
    pdfViewer.addEventListener("touchstart", onReaderTouchStart, { passive: true });
    pdfViewer.addEventListener("touchend", onReaderTouchEnd, { passive: false });

    prevButton = button("", ICONS.prev, () => turn(-1));
    nextButton = button("", ICONS.next, () => turn(1));
    prevButton.classList.add("lb-page-turn", "lb-page-turn-prev");
    nextButton.classList.add("lb-page-turn", "lb-page-turn-next");
    prevButton.setAttribute("aria-label", "Pagina precedente");
    nextButton.setAttribute("aria-label", "Pagina successiva");
    prevButton.addEventListener("click", showPageControls);
    nextButton.addEventListener("click", showPageControls);
    pageControls = el("div", "lb-page-controls");
    pageControls.setAttribute("role", "group");
    pageControls.setAttribute("aria-label", "Navigazione pagine");
    pageControls.append(prevButton, nextButton);
    progressLabel = el("span", "lb-progress");
    progressLabel.setAttribute("role", "status");
    ocrStatus = el("span", "lb-ocr-status");
    ocrStatus.setAttribute("role", "status");
    ocrStatus.setAttribute("aria-live", "polite");
    const footer = el("div", "lb-footer");
    footer.append(progressLabel, ocrStatus);
    readerStage = el("div", "lb-reader-stage");
    readerStage.addEventListener("pointermove", schedulePageControlsHide, { passive: true });
    readerStage.addEventListener("touchstart", showPageControls, { passive: true });
    readerStage.addEventListener("focusin", showPageControls);
    readerStage.append(thumbPanel, frame, pdfViewer, pageControls);
    ocrDialog = el("dialog", "lb-dialog lb-ocr-dialog");
    ocrDialog.setAttribute("aria-label", "Testo riconosciuto");
    const ocrBody = el("div", "lb-dialog-body");
    const ocrTitle = el("h2", "lb-dialog-title", "Testo riconosciuto");
    const ocrHint = el("p", "lb-note", "Il riconoscimento è locale e può contenere errori. Puoi correggere o selezionare il testo prima di copiarlo.");
    ocrText = el("textarea", "lb-ocr-text");
    ocrText.setAttribute("aria-label", "Testo riconosciuto, modificabile");
    ocrText.rows = 10;
    const copyStatus = el("p", "lb-note");
    copyStatus.setAttribute("role", "status");
    const copy = button("Copia testo", null, async () => {
      try {
        await navigator.clipboard.writeText(ocrText.value);
        copyStatus.textContent = "Testo copiato.";
      } catch (error) {
        ocrText.focus();
        ocrText.select();
        copyStatus.textContent = "Copia automatica non disponibile: usa Ctrl+C o il comando Copia del dispositivo.";
      }
    }, false);
    const closeOcr = button("Chiudi", null, () => ocrDialog.close());
    ocrDialog.addEventListener("close", () => { copyStatus.textContent = ""; });
    ocrBody.append(ocrTitle, ocrHint, ocrText, copy, closeOcr, copyStatus);
    ocrDialog.append(ocrBody);
    panel.append(toolbar, popover, readerStage, footer, ocrDialog);
    return panel;
  }

  /* ---------- Navigazione dell'hub ---------- */

  function saveView(tab) {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ hub: "library", tab })); } catch { /* storage non disponibile */ }
  }

  function renderTabs() {
    const strip = document.querySelector("#category-strip");
    if (!strip) return;
    const tabs = [["shelf", "Scaffale"], ["bookmarks", "Segnalibri"]];
    if (reader) tabs.push(["read", reader.title.length > 24 ? `${reader.title.slice(0, 23)}…` : reader.title]);
    strip.replaceChildren(...tabs.map(([id, label]) => {
      const node = el("button", "category-button", label);
      node.type = "button";
      node.dataset.libraryTab = id;
      node.setAttribute("aria-pressed", String(id === ui.tab));
      if (id !== "read") node.addEventListener("click", () => selectTab(id));
      return node;
    }));
    const dashboard = document.querySelector(".dashboard-button");
    dashboard?.removeAttribute("data-category");
    dashboard?.setAttribute("aria-label", "Scaffale della libreria");
    dashboard?.setAttribute("aria-pressed", String(ui.tab === "shelf"));
  }

  async function selectTab(tab, position) {
    if (tab.startsWith("read:")) {
      await openBook(tab.slice(5), position);
      return;
    }
    closeReader();
    ui.tab = tab === "bookmarks" ? "bookmarks" : "shelf";
    saveView(ui.tab);
    titleElement.textContent = ui.tab === "shelf" ? "Cyber Library" : "Segnalibri";
    descriptionElement.textContent = ui.tab === "shelf"
      ? "I tuoi libri e le tue cartelle: restano su questo dispositivo e si leggono anche offline."
      : "I punti salvati in tutti i tuoi libri.";
    shelfPanel.hidden = ui.tab !== "shelf";
    bookmarksPanel.hidden = ui.tab !== "bookmarks";
    readerPanel.hidden = true;
    renderTabs();
    if (ui.tab === "shelf") {
      await renderShelf();
      autoSync();
    } else await renderBookmarks();
  }

  function showLibrary(startTab) {
    if (!window.CyberPulseAuth?.getUser()) return;
    const hub = document.body.dataset.hub;
    if (hub === "arena") window.CyberPulseArena?.showHome();
    if (hub === "music") window.CyberPulseMusic?.close();
    if (hub === "games") window.CyberPulseGames?.close();
    ui.active = true;
    document.querySelector("#home-page").hidden = true;
    document.querySelector("#arena-page")?.setAttribute("hidden", "");
    document.querySelector("#music-page")?.setAttribute("hidden", "");
    page.hidden = false;
    document.body.dataset.hub = "library";
    document.querySelectorAll("[data-launcher-home], #open-arena, #open-music, #open-games, #open-library").forEach((node) => {
      node.classList.toggle("current", node.id === "open-library");
    });
    document.querySelector("#launcher")?.close();
    document.querySelector(".second-row")?.setAttribute("aria-label", "Cyber Library");
    selectTab(typeof startTab === "string" ? startTab : "shelf");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function close() {
    if (!ui.active) return;
    closeReader();
    ui.active = false;
    page.hidden = true;
    document.querySelector("#open-library")?.classList.remove("current");
    if (document.body.dataset.hub === "library") document.body.removeAttribute("data-hub");
  }

  /* ---------- Stile ---------- */

  function addStyles() {
    if (document.querySelector("#cyber-pulse-library-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-library-styles";
    style.textContent = `
      .lb-page { padding-top: 32px; }
      .lb-page[hidden], .lb-page [hidden] { display: none !important; }
      html.library-reader-open, body.library-reader-open { height: 100%; overflow: hidden !important; }
      body[data-hub="library"] #source-filter-button { display: none; }
      .lb-title { margin: 0 0 8px; font-size: clamp(22px, 4vw, 28px); font-weight: 600; letter-spacing: -.3px; }
      .lb-description { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .lb-meta { min-height: 1.5em; margin: 8px 0 0; color: var(--text-muted); font-size: 12px; }
      .lb-panel { margin-top: 16px; }
      .lb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 20px; }
      .lb-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 6px; padding: 0 14px; border: 0; border-radius: 19px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; }
      .lb-button.ghost { border: 1px solid var(--border); background: transparent; color: var(--text); }
      .lb-button.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .lb-button:disabled { cursor: default; opacity: .45; }
      .lb-icon-button { display: inline-grid; width: 38px; height: 38px; flex: none; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--text); cursor: pointer; }
      .lb-icon-button:hover { background: var(--accent-soft); color: var(--accent); }
      .lb-search, .lb-select { min-height: 38px; padding: 0 14px; border: 1px solid var(--border); border-radius: 19px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
      .lb-search { flex: 1 1 200px; max-width: 320px; }
      .lb-folders { margin-top: 28px; }
      .lb-folders-title { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
      .lb-folder { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); color: var(--text-muted); }
      .lb-write-status { color: var(--accent); font-size: 11px; }
      .lb-folder-text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
      .lb-folder-text strong { overflow: hidden; color: var(--text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-folder-text small { font-size: 12px; }
      .lb-note { max-width: 70ch; margin: 16px 0 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
      .lb-ai-preview { display: grid; gap: 8px; width: 100%; }
      .lb-ai-preview summary { color: var(--accent); cursor: pointer; font-size: 13px; }
      .lb-ai-preview-text { width: 100%; max-height: 220px; resize: vertical; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 12px; line-height: 1.5; }
      .lb-cover-zoom { width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; margin: 0; padding: 16px; border: 0; background: rgb(0 0 0 / 88%); cursor: zoom-out; box-sizing: border-box; }
      .lb-cover-zoom[open] { display: flex; align-items: center; justify-content: center; }
      .lb-cover-zoom::backdrop { background: transparent; }
      .lb-cover-zoom img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; background: #fff; }
      .lb-ai-cover-preview { display: block; width: auto; max-width: min(100%, 360px); max-height: 320px; margin: 8px auto; border: 1px solid var(--border); border-radius: 8px; object-fit: contain; background: #fff; }
      .lb-empty { display: grid; justify-items: center; gap: 10px; padding: 48px 16px; border: 2px dashed var(--border); border-radius: var(--radius); color: var(--text-muted); text-align: center; }
      .lb-empty h2 { margin: 0; color: var(--text); font-size: 18px; }
      .lb-empty p { max-width: 46ch; margin: 0 0 8px; font-size: 14px; line-height: 1.6; }
      .lb-page.drag .lb-panel { outline: 3px dashed var(--accent); outline-offset: 6px; }
      .lb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--lb-cover-min, 160px)), 1fr)); gap: 20px 16px; }
      .lb-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 14px; }
      .lb-crumb { padding: 4px 6px; border: 0; background: none; color: var(--text-muted); font: inherit; cursor: pointer; }
      strong.lb-crumb { color: var(--text); cursor: default; }
      .lb-crumb-sep { color: var(--text-muted); }
      .lb-rows { display: grid; border-top: 1px solid var(--border); }
      .lb-row { display: flex; align-items: center; gap: 4px; width: 100%; min-height: 64px; padding: 6px 4px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; }
      .lb-row-folder { gap: 14px; cursor: pointer; }
      .lb-row-folder svg { flex: none; color: var(--accent); }
      .lb-row-open { display: flex; flex: 1; align-items: center; gap: 14px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
      .lb-row-text { display: grid; flex: 1; gap: 2px; min-width: 0; }
      .lb-row-text strong { overflow: hidden; font-size: 15px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
      .lb-row-text small { overflow: hidden; color: var(--text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-row-go { color: var(--text-muted); font-size: 22px; }
      .lb-row-thumb { display: grid; flex: none; place-items: center; width: var(--lb-row-cover-width, 40px); aspect-ratio: 5 / 7; overflow: hidden; border-radius: 4px; background: hsl(var(--hue, 210) 45% 35%); color: #fff; font-size: 10px; font-weight: 700; }
      .lb-row-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .lb-preview-button { color: var(--accent); }
      .lb-row:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
      .lb-book { display: flex; flex-direction: column; gap: 10px; }
      .lb-cover { position: relative; display: flex; aspect-ratio: 2 / 3; width: 100%; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 0; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: #fff; cursor: pointer; font: inherit; text-align: left; box-shadow: 0 2px 8px rgb(0 0 0 / 18%); }
      .lb-cover:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
      .lb-cover img { width: 100%; height: 100%; object-fit: cover; }
      .lb-cover.plain { padding: 14px 12px; background: linear-gradient(160deg, hsl(var(--hue) 55% 42%), hsl(calc(var(--hue) + 40) 55% 26%)); }
      .lb-cover-title { font-size: 15px; font-weight: 700; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; }
      .lb-cover-type { align-self: flex-start; padding: 2px 6px; border-radius: 4px; background: rgb(0 0 0 / 30%); font-size: 10px; font-weight: 700; letter-spacing: .5px; }
      .lb-cover-bar { position: absolute; right: 0; bottom: 0; left: 0; height: 5px; background: rgb(0 0 0 / 35%); }
      .lb-cover-bar::after { content: ""; display: block; width: var(--p); height: 100%; background: #fbbc04; }
      .lb-info { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
      .lb-book-heading { display: flex; align-items: center; min-width: 0; }
      .lb-book-heading .lb-preview-button { margin-left: -8px; }
      .lb-name { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; line-height: 1.3; }
      .lb-author, .lb-detail { overflow: hidden; color: var(--text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-file { color: var(--text-muted); font-size: 11px; line-height: 1.3; overflow-wrap: anywhere; }
      .lb-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
      .lb-list { margin: 0; padding: 0; list-style: none; }
      .lb-row { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--border); }
      .lb-row-main { display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; padding: 12px 8px; border: 0; background: none; color: var(--text); cursor: pointer; font: inherit; font-size: 14px; text-align: left; }
      .lb-row-main:hover, .lb-row-main[aria-current] { color: var(--accent); }
      .lb-row-main[aria-current] { font-weight: 700; }
      .lb-row-main small { color: var(--text-muted); font-size: 11px; }
      .lb-reader { --lb-bg: var(--surface); --lb-fg: var(--text); position: fixed; z-index: 20; inset: var(--header-height) 0 0; display: flex; height: auto; flex-direction: column; gap: 6px; margin: 0; padding: 8px 12px; overflow: hidden; box-sizing: border-box; background: var(--lb-bg); color: var(--lb-fg); }
      .lb-toolbar { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 4px; }
      .lb-reader-title { flex: 1 1 160px; min-width: 80px; margin: 0 4px; overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      .lb-toolbar-select { max-width: 150px; min-width: 104px; min-height: 36px; padding: 0 26px 0 10px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); color: var(--text); font: inherit; font-size: 12px; }
      .lb-toolbar-scale { display: inline-flex; flex: none; align-items: center; gap: 2px; }
      .lb-toolbar-scale .lb-button { min-width: 34px; min-height: 34px; padding: 0 8px; }
      .lb-toolbar-scale .lb-icon-button { width: 34px; height: 34px; }
      .lb-toolbar-scale-value { min-width: 3.5ch; color: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
      .lb-reader-stage { position: relative; display: flex; flex: 1; min-height: 0; gap: 8px; }
      .lb-thumbs { flex: 0 0 128px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--lb-bg); overscroll-behavior: contain; }
      .lb-thumbs[hidden] { display: none; }
      .lb-thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px; border: 2px solid transparent; border-radius: 6px; background: transparent; color: var(--lb-fg); font: inherit; font-size: 12px; cursor: pointer; }
      .lb-thumb canvas { display: block; width: 96px; min-height: 120px; max-width: 100%; height: auto; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
      .lb-thumb:hover { border-color: var(--border); }
      .lb-thumb[aria-current="page"] { border-color: var(--accent, #0ff); }
      .lb-thumb:focus-visible { outline: 2px solid var(--accent, #0ff); outline-offset: 2px; }
      .lb-frame, .lb-pdf { display: block; width: 100%; height: 100%; min-height: 0; flex: 1; border: 1px solid var(--border); border-radius: var(--radius); background: var(--lb-bg); }
      .lb-pdf { overflow: auto; overscroll-behavior: contain; }
      .lb-pdf:not(.continuous) { display: block; }
      .lb-pdf:not(.continuous) .lb-pdf-page { width: max-content; min-width: 100%; height: max-content; min-height: 100%; margin: 0; aspect-ratio: auto !important; }
      .lb-pdf.original:not(.continuous) .lb-pdf-page { align-items: flex-start; justify-content: flex-start; }
      .lb-pdf.pannable { cursor: grab; touch-action: none; user-select: none; }
      .lb-pdf.panning { cursor: grabbing; }
      .lb-pdf.ocr-selecting { cursor: crosshair; touch-action: none; user-select: none; }
      .lb-reader-stage.ocr-selecting .lb-page-controls { visibility: hidden; }
      .lb-ocr-selection { position: fixed; z-index: 4; pointer-events: none; border: 2px solid #1976d2; background: rgb(25 118 210 / 20%); box-sizing: border-box; }
      .lb-pdf.pannable .lb-pdf-canvas { max-width: none; }
      .lb-pdf.pannable.continuous .lb-pdf-page { width: max-content; min-width: 100%; }
      .lb-pdf.continuous { padding: 14px; scroll-behavior: smooth; }
      .lb-pdf.original:not(.continuous) { align-items: flex-start; justify-content: flex-start; }
      .lb-pdf.original .lb-pdf-canvas { max-width: none; }
      .lb-pdf-page { display: flex; width: 100%; min-height: 360px; align-items: center; justify-content: center; margin: 0 auto 16px; }
      .lb-pdf-page.rendered { min-height: 0; }
      .lb-pdf-canvas { display: block; max-width: 100%; flex: none; background: #fff; box-shadow: 0 4px 24px rgb(0 0 0 / 24%); }
      .lb-reader:not(:has(.lb-pdf:not([hidden]))) .lb-pdf-open { display: none; }
      .lb-page-controls { position: absolute; z-index: 3; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; pointer-events: none; opacity: 0; }
      .lb-reader-stage.controls-visible .lb-page-controls { opacity: 1; }
      .lb-reader-stage.pdf-stage .lb-page-controls { padding-right: 28px; }
      .lb-page-turn { display: grid; width: 42px; height: 42px; flex: none; place-items: center; padding: 0; border: 0; border-radius: 50%; background: rgb(20 20 24 / 48%); color: #fff; cursor: pointer; pointer-events: auto; }
      .lb-page-turn:hover, .lb-page-turn:focus-visible { background: rgb(20 20 24 / 76%); }
      .lb-page-turn svg { width: 24px; height: 24px; }
      .lb-page-turn:disabled { opacity: .35; }
      .lb-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .lb-progress { flex: 1; overflow: hidden; color: var(--text-muted); font-size: 12px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
      .lb-ocr-status { color: var(--text-muted); font-size: 12px; }
      .lb-ocr-status:empty { display: none; }
      .lb-ocr-text { width: 100%; box-sizing: border-box; resize: vertical; font: inherit; color: var(--text); background: var(--surface); }
      .lb-pop { position: absolute; top: 48px; right: 0; z-index: 5; display: grid; gap: 12px; width: min(320px, 100%); padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / 25%); }
      .lb-field { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
      .lb-stepper { display: inline-flex; align-items: center; gap: 8px; }
      .lb-step { min-width: 40px; min-height: 36px; border: 1px solid var(--border); border-radius: 18px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-weight: 700; }
      .lb-step:hover { border-color: var(--accent); color: var(--accent); }
      .lb-size { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
      .lb-reader:fullscreen { inset: 0; height: 100%; padding: 12px; background: var(--lb-bg); color: var(--lb-fg); }
      .lb-reader:fullscreen .lb-frame { flex: 1; height: auto; min-height: 0; }
      .lb-reader:fullscreen .lb-reader-stage { display: flex; flex: 1; min-height: 0; }
      .lb-reader:fullscreen .lb-frame, .lb-reader:fullscreen .lb-pdf { flex: 1; height: auto; min-height: 0; }
      .lb-dialog { width: min(520px, calc(100vw - 32px)); max-height: 80vh; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); }
      .lb-dialog::backdrop { background: rgb(0 0 0 / 50%); }
      .lb-dialog-body { display: grid; gap: 8px; padding: 20px; }
      .lb-dialog-title { margin: 8px 0 0; font-size: 16px; font-weight: 600; }
      .lb-first-preview { width: min(760px, calc(100vw - 24px)); height: min(850px, calc(100dvh - 24px)); max-height: none; overflow: hidden; }
      .lb-first-preview-body { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 8px; padding: 12px; box-sizing: border-box; }
      .lb-first-preview-header { display: flex; align-items: center; gap: 8px; }
      .lb-first-preview-header h2 { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lb-first-preview-body > .lb-note { margin: 0; }
      .lb-first-preview-body > .lb-note:empty { display: none; }
      .lb-first-preview-content { display: flex; flex: 1; min-height: 0; align-items: center; justify-content: center; overflow: auto; border-radius: 6px; background: #fff; }
      .lb-first-preview-content canvas { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
      .lb-first-preview-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
      .lb-tools { width: min(760px, calc(100vw - 24px)); max-height: 88vh; }
      .lb-section { margin: 14px 0 0; font-size: 14px; font-weight: 600; }
      .lb-dup { display: grid; gap: 6px; margin: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
      .lb-dup legend { padding: 0 6px; font-size: 13px; font-weight: 600; }
      .lb-dup-row, .lb-check { display: flex; align-items: flex-start; gap: 8px; color: var(--text); font-size: 13px; line-height: 1.4; }
      .lb-dup .lb-button { justify-self: start; }
      .lb-tools-bar { position: sticky; bottom: 0; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 0; background: color-mix(in srgb, var(--surface) var(--bd-win-alpha, 100%), transparent); backdrop-filter: blur(var(--bd-win-blur, 0px)); }
      .lb-tools-bar .lb-check { flex: 1 1 260px; justify-content: flex-start; }
      .lb-fix { display: flex; align-items: flex-start; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--border); }
      .lb-fix-main { display: grid; flex: 1; gap: 6px; min-width: 0; }
      .lb-name-fields { display: flex; flex-wrap: wrap; gap: 6px 12px; min-width: 0; border: 1px solid var(--border); border-radius: 8px; }
      .lb-name-fields legend { color: var(--text-muted); font-size: 12px; }
      .lb-name-order { display: grid; gap: 4px; }
      .lb-name-order-row { display: flex; align-items: center; gap: 6px; }
      .lb-name-order-row .lb-check { flex: 1; }
      .lb-fix-old { overflow: hidden; color: var(--text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-fix-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) 82px 100px; gap: 8px; }
      .lb-tool-section { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid var(--border); }
      .lb-tool-section > .lb-section, .lb-tool-section > .lb-note { margin: 0; }
      .lb-tool-section .lb-dup { margin-top: 4px; }
      .lb-tool-tabs { position: sticky; top: -20px; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 0; background: var(--surface); border-bottom: 1px solid var(--border); }
      .lb-tool-tabs > .lb-button { margin-left: auto; }
      .lb-tool-tab { padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; }
      .lb-tool-tab[aria-selected="true"] { border-color: var(--accent, currentColor); background: var(--accent, var(--border)); color: var(--on-accent, var(--text)); font-weight: 600; }
      .lb-tool-tab:focus-visible { outline: 2px solid var(--accent, currentColor); outline-offset: 2px; }
      .lb-tool-panel { display: grid; gap: 8px; }
      .lb-tool-panel[hidden] { display: none; }
      .lb-dialog-body > .lb-note { margin: 0; }
      .lb-tools-notice { margin: 4px 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 13px; line-height: 1.5; }
      .lb-field { display: grid; gap: 2px; min-width: 0; color: var(--text-muted); font-size: 11px; }
      .lb-field input { min-width: 0; min-height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
      .lb-fix-new { overflow-wrap: anywhere; color: var(--accent); font-size: 12px; font-weight: 600; }
      .lb-settings-dialog { width: min(620px, calc(100vw - 32px)); max-width: none; max-height: min(760px, calc(100dvh - 40px)); border: 1px solid var(--border); border-radius: 28px; box-shadow: 0 20px 60px rgb(0 0 0 / 24%); }
      .lb-settings-dialog::backdrop { background: rgb(0 0 0 / 52%); backdrop-filter: blur(2px); }
      .lb-settings-body { display: grid; gap: 0; padding: 20px 24px 24px; }
      .lb-settings-header { position: sticky; z-index: 2; top: 0; display: flex; align-items: center; gap: 12px; min-width: 0; margin: -20px -24px 0; padding: 22px 24px 18px; background: color-mix(in srgb, var(--surface) var(--bd-win-alpha, 100%), transparent); backdrop-filter: blur(var(--bd-win-blur, 0px)); }
      .lb-settings-heading { flex: 1; min-width: 0; }
      .lb-settings-eyebrow { display: block; margin-bottom: 4px; color: var(--text-muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; }
      .lb-settings-title { margin: 0; font-size: clamp(21px, 4vw, 25px); font-weight: 600; letter-spacing: -.025em; line-height: 1.2; }
      .lb-settings-close, .lb-settings-back { width: 44px; height: 44px; }
      .lb-settings-back { margin-left: -10px; }
      .lb-settings-intro { margin: 0 0 18px; color: var(--text-muted); font-size: 14px; line-height: 1.5; }
      .lb-settings-menu { display: grid; gap: 4px; }
      .lb-settings-item { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 72px; padding: 10px 12px; border: 0; border-radius: 18px; background: transparent; color: var(--text); text-align: left; font: inherit; cursor: pointer; }
      .lb-settings-item:hover { background: var(--surface-muted); }
      .lb-settings-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      .lb-settings-item > svg { flex: none; color: var(--text-muted); }
      .lb-settings-item-icon { display: grid; width: 44px; height: 44px; flex: none; place-items: center; border-radius: 15px; background: var(--accent-soft); color: var(--accent); }
      .lb-settings-item-text { display: grid; flex: 1; gap: 4px; min-width: 0; }
      .lb-settings-item-text strong { font-size: 15px; font-weight: 600; line-height: 1.3; }
      .lb-settings-item-text span { color: var(--text-muted); font-size: 13px; line-height: 1.35; }
      .lb-settings-panel { gap: 0; min-width: 0; }
      .lb-settings-panel > .lb-note { max-width: none; margin: 0 0 16px; font-size: 13px; line-height: 1.55; }
      .lb-settings-panel > .lb-note:not(:first-child) { margin: 16px 0 8px; }
      .lb-settings-panel .cp-reading-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; padding: 10px 0; border-bottom: 1px solid var(--border); }
      .lb-settings-panel .cp-reading-row label { flex: 1; font-size: 14px; font-weight: 500; line-height: 1.4; }
      .lb-settings-panel select, .lb-settings-panel .lb-field input { min-width: 0; max-width: 58%; min-height: 42px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 13px; }
      .lb-settings-panel .lb-field { gap: 8px; padding: 14px 0; color: var(--text); font-size: 14px; font-weight: 500; }
      .lb-settings-panel .lb-field input { width: 100%; max-width: none; }
      .lb-settings-panel .lb-check { display: flex; min-height: 58px; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px; line-height: 1.45; cursor: pointer; }
      .lb-settings-panel .lb-check span { flex: 1; order: -1; }
      .lb-settings-panel .lb-check input { appearance: none; position: relative; width: 42px; height: 26px; flex: 0 0 42px; margin: 0; border: 2px solid var(--text-muted); border-radius: 20px; background: var(--surface-muted); cursor: pointer; }
      .lb-settings-panel .lb-check input::after { position: absolute; top: 4px; left: 4px; width: 14px; height: 14px; border-radius: 50%; background: var(--text-muted); content: ""; transition: transform 160ms ease, background 160ms ease; }
      .lb-settings-panel .lb-check input:checked { border-color: var(--accent); background: var(--accent); }
      .lb-settings-panel .lb-check input:checked::after { background: var(--on-accent); transform: translateX(16px); }
      .lb-settings-panel .lb-name-order { gap: 0; margin-bottom: 8px; border-top: 1px solid var(--border); }
      .lb-settings-panel .lb-name-order-row { min-height: 58px; gap: 4px; border-bottom: 1px solid var(--border); }
      .lb-settings-panel .lb-name-order-row .lb-check { min-width: 0; padding-right: 8px; border: 0; }
      .lb-settings-panel .lb-name-order-row .lb-button { width: 36px; min-width: 36px; height: 36px; min-height: 36px; margin: 0; padding: 0; border: 0; border-radius: 50%; }
      .lb-settings-panel > .lb-button, .lb-settings-panel details > .lb-button { justify-self: start; width: auto; min-height: 42px; margin: 12px 0 4px; padding: 0 18px; }
      .lb-settings-panel > .lb-button.ghost, .lb-settings-panel details > .lb-button.ghost { border-color: var(--border); }
      .lb-settings-panel details { padding: 14px 0 4px; border-bottom: 1px solid var(--border); }
      .lb-settings-panel summary { color: var(--accent); font-size: 14px; font-weight: 600; cursor: pointer; }
      .lb-settings-panel .lb-fix-new { margin: 10px 0; padding: 14px; border-radius: 14px; background: var(--accent-soft); color: var(--text); font-size: 13px; line-height: 1.5; }
      .lb-settings-body > .lb-tools-notice { margin: 14px 0 0; border: 0; border-radius: 12px; background: var(--surface-muted); }
      .lb-settings-body > .lb-tools-notice:empty { display: none; }
      @media (max-width: 600px) {
        .lb-settings-dialog { width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border: 0; border-radius: 0; }
        .lb-settings-body { padding: max(16px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)); }
        .lb-settings-header { margin: calc(-1 * max(16px, env(safe-area-inset-top))) -20px 0; padding: max(18px, env(safe-area-inset-top)) 20px 18px; }
        .lb-settings-panel .cp-reading-row { align-items: flex-start; flex-direction: column; gap: 8px; }
        .lb-settings-panel select { width: 100%; max-width: none; }
      }
      @media (max-width: 900px) { .lb-fix-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .lb-fix-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .lb-fix-grid .lb-field:first-child { grid-column: 1 / -1; } }
      @media (prefers-reduced-motion: no-preference) {
        .lb-page-controls { transition: opacity 260ms ease; }
        .lb-book { animation: lb-in 260ms ease-out backwards; }
        .lb-cover { transition: transform 160ms, box-shadow 160ms; }
        .lb-cover:hover { transform: translateY(-4px) rotate(-.5deg); box-shadow: 0 10px 22px rgb(0 0 0 / 28%); }
        .lb-frame { transition: opacity 180ms; }
        .lb-frame.loading { opacity: 0; }
        .lb-pop { animation: lb-in 160ms ease-out; }
      }
      @media (max-width: 560px) {
        .lb-reader { padding: 6px; }
        .lb-toolbar { gap: 2px; }
        .lb-reader-title { flex-basis: calc(100% - 130px); }
        .lb-toolbar-select { max-width: calc(50vw - 12px); min-width: 94px; }
        .lb-toolbar-scale .lb-button { min-height: 32px; }
        .lb-toolbar-scale .lb-icon-button { width: 32px; height: 32px; }
        .lb-page-controls { padding: 0 6px; }
        .lb-reader-stage.pdf-stage .lb-page-controls { padding-right: 22px; }
        .lb-page-turn { width: 38px; height: 38px; }
      }
      @keyframes lb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    `;
    document.head.append(style);
  }

  /* ---------- Avvio ---------- */

  // Pannelli del menu Impostazioni dell'app: stesse preferenze del lettore, ma consultabili senza aprire un libro.
  function settingsRow(label, control) {
    const row = el("div", "cp-reading-row");
    row.append(el("label", "cp-ai-legend", label), control);
    return row;
  }

  function settingsSelect(name, options, current, onChange) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", name);
    options.forEach(([value, text]) => {
      const option = el("option", "", text);
      option.value = String(value);
      select.append(option);
    });
    select.value = String(current);
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  function buildReadingSettings() {
    const section = el("section", "cp-settings-section");
    section.append(el("p", "cp-settings-hint", "Come appare il testo nel lettore. Valgono per tutti i libri e puoi cambiarle anche mentre leggi."));
    const grid = el("div", "cp-reading-grid");
    const apply = (key, cast) => (value) => {
      const frac = reader && reader.type !== "pdf" ? currentFrac() : 0;
      prefs()[key] = cast(value);
      savePrefs();
      if (readerPanel) restyleReader(frac);
    };
    grid.append(
      settingsRow("Carattere", settingsSelect("Carattere", [["serif", "Con grazie (serif)"], ["sans", "Senza grazie"], ["book", "Originale del libro"]], prefs().font, apply("font", String))),
      settingsRow("Dimensione del testo", settingsSelect("Dimensione del testo", [...new Set([15, 17, 19, 22, 26, 30, prefs().size])].sort((a, b) => a - b).map((size) => [size, `${size} px`]), prefs().size, apply("size", Number))),
      settingsRow("Tema di lettura", settingsSelect("Tema di lettura", [["auto", "Come l'app"], ["light", "Chiaro"], ["sepia", "Seppia"], ["dark", "Scuro"]], prefs().theme, apply("theme", String))),
      settingsRow("Interlinea", settingsSelect("Interlinea", [[1.35, "Stretta"], [1.6, "Normale"], [1.9, "Ampia"]], prefs().line, apply("line", Number))),
      settingsRow("Larghezza della pagina", settingsSelect("Larghezza della pagina", [[560, "Stretta"], [720, "Media"], [920, "Larga"]], prefs().width, apply("width", Number))),
    );
    section.append(grid);
    return section;
  }

  function buildShelfSettings() {
    const section = el("section", "cp-settings-section");
    section.append(el("p", "cp-settings-hint", "Come sono ordinati i libri nello scaffale e come tenerli in ordine. I libri restano su questo dispositivo."));
    const grid = el("div", "cp-reading-grid");
    grid.append(settingsRow("Ordinamento dello scaffale", settingsSelect("Ordinamento dello scaffale",
      Object.entries(SORTS).map(([value, text]) => [value, text.charAt(0).toUpperCase() + text.slice(1)]),
      SORTS[prefs().sort] ? prefs().sort : "recent",
      (value) => {
        prefs().sort = value;
        savePrefs();
        if (ui.active && ui.tab === "shelf") renderShelf();
      })));
    grid.append(settingsRow("Come mostrare i libri", settingsSelect("Come mostrare i libri",
      [["flat", "Elenco unico"], ["folders", "Cartelle, come in Esplora file"]],
      prefs().shelfView === "folders" ? "folders" : "flat",
      (value) => {
        prefs().shelfView = value;
        savePrefs();
        if (ui.active && ui.tab === "shelf") renderShelf();
      })));
    const tools = el("button", "cp-choice", "Apri Sistema libreria (rinomina, copie, cartelle)");
    tools.type = "button";
    tools.addEventListener("click", () => {
      document.querySelector("#settings-dialog")?.close();
      if (!ui.active) showLibrary();
      openTools();
    });
    section.append(grid, tools);
    return section;
  }

  function init() {
    addStyles();
    const main = document.querySelector("#home");
    if (!main) return;
    page = el("section", "lb-page");
    page.id = "library-page";
    page.hidden = true;
    page.setAttribute("aria-labelledby", "library-page-title");
    titleElement = el("h1", "lb-title", "Cyber Library");
    titleElement.id = "library-page-title";
    descriptionElement = el("p", "lb-description");
    metaElement = el("p", "lb-meta");
    metaElement.setAttribute("role", "status");
    metaElement.setAttribute("aria-live", "polite");
    shelfPanel = el("div", "lb-panel");
    bookmarksPanel = el("div", "lb-panel");
    bookmarksPanel.hidden = true;
    readerPanel = buildReader();
    readerPanel.classList.add("lb-panel");
    fileInput = el("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = ACCEPT;
    fileInput.hidden = true;
    fileInput.addEventListener("change", async () => {
      const files = [...fileInput.files];
      fileInput.value = "";
      await importFiles(files);
    });
    // Alternativa per i browser senza accesso diretto alle cartelle: i file vengono copiati nella libreria.
    folderInput = el("input");
    folderInput.type = "file";
    folderInput.multiple = true;
    folderInput.setAttribute("webkitdirectory", "");
    folderInput.hidden = true;
    folderInput.addEventListener("change", async () => {
      const files = [...folderInput.files];
      folderInput.value = "";
      await importFiles(files, { quiet: true });
    });
    indexDialog = el("dialog", "lb-dialog");
    indexDialog.setAttribute("aria-label", "Indice e segnalibri");
    indexDialog.addEventListener("click", (event) => { if (event.target === indexDialog) indexDialog.close(); });
    toolsDialog = el("dialog", "lb-dialog lb-tools");
    toolsDialog.setAttribute("aria-label", "Sistema la libreria");
    toolsDialog.addEventListener("click", (event) => { if (event.target === toolsDialog) toolsDialog.close(); });
    toolsDialog.addEventListener("close", () => { if (ui.active && ui.tab === "shelf") renderShelf(); });
    librarySettingsDialog = el("dialog", "lb-dialog lb-settings-dialog");
    librarySettingsDialog.setAttribute("aria-label", "Impostazioni della Libreria");
    const dismissSettings = () => {
      if (librarySettingsDirty && !window.confirm("Ci sono modifiche non salvate. Vuoi abbandonarle?")) return;
      librarySettingsDirty = false;
      librarySettingsDialog.close();
    };
    librarySettingsDialog.addEventListener("click", (event) => { if (event.target === librarySettingsDialog) dismissSettings(); });
    librarySettingsDialog.addEventListener("cancel", (event) => { event.preventDefault(); dismissSettings(); });
    page.append(titleElement, descriptionElement, metaElement, shelfPanel, bookmarksPanel, readerPanel, fileInput, folderInput, indexDialog, toolsDialog, librarySettingsDialog);
    main.append(page);

    page.addEventListener("dragover", (event) => {
      if (!ui.active || ui.tab !== "shelf" || !event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      page.classList.add("drag");
    });
    page.addEventListener("dragleave", (event) => {
      if (!page.contains(event.relatedTarget)) page.classList.remove("drag");
    });
    page.addEventListener("drop", (event) => {
      page.classList.remove("drag");
      if (!ui.active || ui.tab !== "shelf" || !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      importFiles(event.dataTransfer.files);
    });

    document.querySelector("#open-library")?.addEventListener("click", () => showLibrary());
    const restore = () => {
      try {
        const view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");
        if (view?.hub === "library" && !ui.active) showLibrary(String(view.tab || "shelf"));
      } catch { /* vista non valida */ }
    };
    if (window.CyberPulseAuth?.getUser()) restore();
    else document.addEventListener("cyberpulse:signedin", restore, { once: true });

    document.querySelectorAll("[data-launcher-home]").forEach((node) => node.addEventListener("click", () => {
      const wasActive = ui.active;
      close();
      if (wasActive) document.dispatchEvent(new CustomEvent("cyberpulse:restorestrip"));
    }));
    ["#open-arena", "#open-music", "#open-games"].forEach((selector) => {
      document.querySelector(selector)?.addEventListener("click", close);
    });
    document.querySelector(".brand")?.addEventListener("click", (event) => {
      if (!ui.active) return;
      event.preventDefault();
      window.CyberPulseArena?.showHome();
      close();
    });
    document.querySelector(".dashboard-button")?.addEventListener("click", (event) => {
      if (!ui.active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectTab("shelf");
    }, true);
    document.addEventListener("keydown", onKey);
    window.CyberPulseSettings?.register({ id: "library-reading", group: "library", title: "Lettura dei libri", build: buildReadingSettings });
    window.CyberPulseSettings?.register({ id: "library-shelf", group: "library", title: "Scaffale e ordine", build: buildShelfSettings });
    document.addEventListener("click", (event) => {
      if (popover && !popover.hidden && !event.target.closest(".lb-pop, .lb-toolbar")) popover.hidden = true;
    });
    document.addEventListener("cyberpulse:themechange", restyleReader);
    window.addEventListener("resize", () => {
      if (reader?.type !== "pdf") return;
      window.clearTimeout(pdfResizeTimer);
      pdfResizeTimer = window.setTimeout(() => {
        configurePdfReader().catch((error) => say(`Impossibile adattare il PDF allo schermo: ${error.message}`));
      }, 180);
    }, { passive: true });
    window.addEventListener("pagehide", () => {
      if (reader?.type === "pdf") {
        const info = bookState(reader.id);
        info.page = reader.page;
        info.updated = Date.now();
        writeState();
      } else if (reader) {
        reader.frac = currentFrac();
        persistProgress();
      }
    });
  }

  window.CyberPulseLibrary = Object.freeze({ open: showLibrary, close });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
