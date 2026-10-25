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
  const VIEW_KEY = "cyber-pulse.view";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const TXT_CHUNK = 40000;
  const MIME = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", css: "text/css",
  };

  const ICONS = {
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    prev: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    next: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    list: "M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16 0h2v-2h-2v2zm0-10v2h2V7h-2zm0 6h2v-2h-2v2z",
    bookmark: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z",
    text: "M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z",
    full: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    book: "M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 18H6V4h12v16zM8 6h8v2H8zm0 4h8v2H8zm0 4h5v2H8z",
    open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    play: "M8 5v14l11-7z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    tools: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
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
  let frame;
  let pdfFrame;
  let popover;
  let progressLabel;
  let readerTitle;
  let prevButton;
  let nextButton;
  let bookmarkButton;
  let settingsButton;
  let reader = null;
  let coverUrls = [];
  let filterText = "";
  let scrollTimer = 0;

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
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        [STORE, FOLDERS].forEach((name) => {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        });
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

  function prefs() {
    if (!prefsCache) {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { /* preferenze non valide */ }
      prefsCache = { size: 19, font: "serif", theme: "auto", line: 1.6, width: 720, ...saved };
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
    return { zip, spine, toc, title: meta("title"), author: meta("creator"), year, coverBlob };
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
    return { title: useless.test(title) ? "" : title, author: /^(unknown|admin|user|)$/i.test(author) ? "" : author, year: "" };
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
    const result = { added: 0, updated: 0, removed: 0, problems: [], truncated: found.length >= MAX_FOLDER_FILES };
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
    if (!result.truncated) {
      for (const [path, book] of known) {
        if (seen.has(path)) continue;
        await dbDelete(book.id);
        delete readState()[book.id];
        result.removed += 1;
      }
      if (result.removed) writeState();
    }
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
        if (result.added || result.updated || result.removed) {
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

  function standardName(meta, record) {
    const base = [nameField(meta.title).slice(0, 120), nameField(meta.author).slice(0, 60), yearOf(meta.year)].filter(Boolean).join(" - ");
    return `${base || "Senza titolo"}${extOf(record.name).toLowerCase()}`;
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
    const base = deLeet(name.replace(/\.[^.]+$/, ""))
      .replace(/\((?:z-?lib|libgen|www)[^)]*\)|\[(?:www|ebook|z-?lib)[^\]]*\]/gi, " ")
      .replace(/_+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = base.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
    let year = "";
    if (parts.length > 1 && /^(1[0-9]{3}|20[0-9]{2})$/.test(parts[parts.length - 1])) year = parts.pop();
    else if (parts.length) {
      const match = parts[parts.length - 1].match(/\s*\((1[0-9]{3}|20[0-9]{2})\)\s*$/);
      if (match) {
        year = match[1];
        parts[parts.length - 1] = parts[parts.length - 1].slice(0, match.index);
      }
    }
    // «Autore - Titolo»: un nome breve di persona seguito da un testo lungo e' quasi sempre l'ordine inverso.
    const looksLikePerson = (text) => { const w = text.split(" "); return w.length >= 2 && w.length <= 3 && w.every((x) => /^\p{Lu}[\p{L}'’.]*$/u.test(x)); };
    if (parts.length === 2 && looksLikePerson(parts[0]) && parts[1].split(" ").length >= 4) parts.reverse();
    return { title: parts[0] || base, author: parts.slice(1).join(" – "), year };
  }

  // Valori proposti: i metadati del libro se esistono, altrimenti quelli intuiti dal nome del file.
  function proposal(record) {
    const base = record.name.replace(/\.[^.]+$/, "");
    const guess = guessFromName(record.name);
    const trusted = record.edited || (record.title && record.title !== base);
    return {
      title: cleanField(deLeet(trusted ? record.title : guess.title)),
      author: cleanField(deLeet(record.author) || guess.author),
      year: record.year || guess.year || "",
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

  async function freeName(directory, desired, current) {
    if (desired === current || desired.toLowerCase() === current.toLowerCase()) return desired;
    const extension = extOf(desired);
    const stem = desired.slice(0, desired.length - extension.length);
    for (let n = 1; n < 100; n += 1) {
      const candidate = n === 1 ? desired : `${stem} (${n})${extension}`;
      const taken = await directory.getFileHandle(candidate).then(() => true, (error) => error?.name !== "NotFoundError");
      if (!taken) return candidate;
    }
    throw new Error("nome già in uso");
  }

  async function renameOnDisk(folder, record, desired) {
    if (!(await ensurePermission(folder.handle, true, "readwrite"))) throw new Error("serve il permesso di scrittura sulla cartella");
    const directory = await parentDir(folder, record);
    const current = record.handle.name;
    const target = await freeName(directory, desired, current);
    if (target === current) return target;
    if (typeof record.handle.move === "function") {
      await record.handle.move(target);
    } else {
      const copy = await directory.getFileHandle(target, { create: true });
      const writable = await copy.createWritable();
      await (await record.handle.getFile()).stream().pipeTo(writable);
      await directory.removeEntry(current);
      record.handle = copy;
    }
    const file = await record.handle.getFile();
    Object.assign(record, { size: file.size, mtime: file.lastModified, path: record.path.replace(/[^/]*$/, "") + target });
    return target;
  }

  function uniqueDbName(records, desired, self) {
    const taken = new Set(records.filter((book) => book !== self && !book.folderId).map((book) => book.name.toLowerCase()));
    const extension = extOf(desired);
    const stem = desired.slice(0, desired.length - extension.length);
    let candidate = desired;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${stem} (${n})${extension}`;
    return candidate;
  }

  async function applyEdit(record, values, options) {
    const title = cleanField(values.title);
    const author = cleanField(values.author);
    const year = String(values.year || "").trim();
    if (!title) throw new Error("il titolo non può essere vuoto");
    if (year && !/^(1[0-9]{3}|20[0-9]{2})$/.test(year)) throw new Error("anno non valido (usa quattro cifre)");
    const desired = standardName({ title, author, year }, record);
    if (desired !== record.name) {
      if (record.folderId) {
        if (options.renameDisk) {
          const folder = options.folders.find((item) => item.id === record.folderId);
          if (!folder) throw new Error("cartella non più collegata");
          const target = await renameOnDisk(folder, record, desired);
          record.origName ||= record.name;
          record.name = target;
        }
      } else {
        record.origName ||= record.name;
        record.name = uniqueDbName(options.records, desired, record);
      }
    }
    if (title !== record.title || author !== (record.author || "") || year !== (record.year || "")) record.edited = true;
    Object.assign(record, { title, author, year });
    await dbPut(record);
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
    ["author", "year"].forEach((fieldName) => {
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
      input.inputMode = "numeric";
      input.maxLength = 4;
    }
    wrap.append(el("span", "", label), input);
    return { wrap, input };
  }

  async function openTools(onlyId, skipScan) {
    const loading = el("div", "lb-dialog-body");
    loading.append(el("p", "lb-note", "Leggo i dati della libreria…"));
    toolsDialog.replaceChildren(loading);
    if (!toolsDialog.open) toolsDialog.showModal();
    const all = await dbAll();
    if (!skipScan) await enrichRecords(all);
    renderTools(all, onlyId);
  }

  function renderTools(all, onlyId) {
    const state = readState();
    const body = el("div", "lb-dialog-body");
    body.append(el("h2", "lb-dialog-title", onlyId ? "Modifica nome e dati" : "Sistema la libreria"));
    body.append(el("p", "lb-note", "Standard dei nomi: Titolo - Autore - Anno. Le correzioni di titolo, autore e anno valgono nella libreria; il file sul dispositivo cambia nome solo se lo scegli qui sotto."));

    const finish = async (message) => {
      say(message);
      if (onlyId) toolsDialog.close();
      else await openTools(undefined, true);
      if (ui.tab === "shelf") renderShelf();
    };

    const groups = onlyId ? [] : duplicateGroups(all);
    if (groups.length) {
      body.append(el("h3", "lb-section", `Doppioni (${groups.length})`));
      body.append(el("p", "lb-note", "Libri con lo stesso titolo e autore. Per ogni gruppo scegli la copia da tenere: le altre escono dalla libreria. Se ne tieni una con meno dati (anno, autore) o senza progresso di lettura, li prende dalle copie scartate."));
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
        body.append(box);
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
      body.append(bulk);
    }

    const candidates = (onlyId ? all.filter((record) => record.id === onlyId) : all)
      .map((record) => ({ record, meta: proposal(record) }))
      .filter(({ record, meta }) => onlyId || standardName(meta, record) !== record.name
        || meta.title !== record.title || meta.author !== (record.author || "") || meta.year !== (record.year || ""))
      .sort((a, b) => collator.compare(a.meta.title, b.meta.title));
    const entries = [];
    if (!onlyId) {
      body.append(el("h3", "lb-section", `Nomi e dati da correggere (${candidates.length})`));
      body.append(el("p", "lb-note", candidates.length
        ? `${all.length - candidates.length} libri sono già a posto. Controlla le proposte, correggile a mano se serve e deseleziona quelle che non vuoi cambiare. Se trovi doppioni, risolvili prima: due file con lo stesso nome ricevono un numero progressivo.`
        : "Tutti i libri rispettano già lo standard."));
    }
    candidates.forEach(({ record, meta }) => {
      const row = el("div", "lb-fix");
      const pick = checkbox("", true);
      pick.input.setAttribute("aria-label", `Applica la correzione a ${record.name}`);
      const main = el("div", "lb-fix-main");
      main.append(el("small", "lb-fix-old", record.folderId ? record.path : record.name));
      const title = textField("Titolo", meta.title);
      const author = textField("Autore", meta.author);
      const year = textField("Anno", meta.year, true);
      const grid = el("div", "lb-fix-grid");
      grid.append(title.wrap, author.wrap, year.wrap);
      const preview = el("div", "lb-fix-new");
      const read = () => ({ title: title.input.value, author: author.input.value, year: year.input.value });
      const refresh = () => {
        const values = read();
        const missing = [!cleanField(values.author) ? "autore" : "", !values.year.trim() ? "anno" : ""].filter(Boolean);
        preview.textContent = `→ ${standardName(values, record)}${missing.length ? `  (manca: ${missing.join(", ")})` : ""}`;
      };
      [title, author, year].forEach((item) => item.input.addEventListener("input", refresh));
      refresh();
      main.append(grid, preview);
      main.append(button("Inverti titolo e autore", null, () => {
        const swapped = title.input.value;
        title.input.value = author.input.value;
        author.input.value = swapped;
        refresh();
      }));
      row.append(pick.wrap, main);
      body.append(row);
      entries.push({ record, pick: pick.input, read });
    });

    const footer = el("div", "lb-tools-bar");
    let disk = null;
    if (entries.some((entry) => entry.record.folderId)) {
      disk = checkbox("Rinomina anche i file nelle cartelle collegate", true);
      footer.append(disk.wrap);
    }
    if (entries.length) {
      footer.append(button(onlyId ? "Salva" : "Applica alle righe selezionate", null, async function apply() {
        const chosen = entries.filter((entry) => entry.pick.checked);
        if (!chosen.length) { say("Nessun libro selezionato."); return; }
        const renameDisk = Boolean(disk?.input.checked);
        const onDisk = chosen.filter((entry) => entry.record.folderId).length;
        if (renameDisk && onDisk && !window.confirm(`Verranno rinominati ${onDisk} file sul dispositivo. Continuare?`)) return;
        const folders = await folderAll();
        let done = 0;
        const problems = [];
        for (const entry of chosen) {
          try {
            await applyEdit(entry.record, entry.read(), { renameDisk, folders, records: all });
            done += 1;
          } catch (error) {
            problems.push(`${entry.record.name}: ${error.message || "errore"}`);
          }
        }
        await finish([`${done} ${done === 1 ? "libro aggiornato" : "libri aggiornati"}.`, ...problems.slice(0, 3)].join(" "));
      }, false));
    }
    footer.append(button("Chiudi", null, () => toolsDialog.close()));
    body.append(footer);
    toolsDialog.replaceChildren(body);
  }

  /* ---------- Scaffale ---------- */

  function hueOf(text) {
    let hash = 0;
    for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return hash;
  }

  function clearCoverUrls() {
    coverUrls.forEach((url) => URL.revokeObjectURL(url));
    coverUrls = [];
  }

  async function renderShelf() {
    const books = await dbAll();
    clearCoverUrls();
    const state = readState();
    sortBooks(books, state, prefs().sort);

    const bar = el("div", "lb-bar");
    bar.append(button("Aggiungi libri", ICONS.add, () => fileInput.click(), false));
    bar.append(button("Collega cartella", ICONS.folder, pickFolder));
    if (books.length) bar.append(button("Sistema libreria", ICONS.tools, () => openTools()));
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

    const grid = el("div", "lb-grid");
    books.forEach((book) => {
      const info = state[book.id];
      const pct = info?.pct || 0;
      const card = el("article", "lb-book");
      card.dataset.search = `${book.title} ${book.author}`.toLowerCase();
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
      const body = el("div", "lb-info");
      body.append(el("strong", "lb-name", book.title));
      if (book.author) body.append(el("span", "lb-author", book.author));
      body.append(el("span", "lb-detail", `${book.type.toUpperCase()}${book.year ? ` · ${book.year}` : ""} · ${formatSize(book.size)}${book.type === "pdf" ? "" : ` · letto ${pct}%`}`));
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
      grid.append(card);
    });
    const note = el("p", "lb-note", "");
    shelfPanel.replaceChildren(...[bar, grid, foldersBox, note].filter(Boolean));
    applyFilter();
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage) note.textContent = `Spazio usato dalla libreria in questo browser: ${formatSize(estimate.usage)}. I libri non vengono mai inviati online.`;
      }).catch(() => {});
    }
  }

  function applyFilter() {
    const query = filterText.trim().toLowerCase();
    shelfPanel.querySelectorAll(".lb-book").forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.search.includes(query);
    });
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
    return `
      html { background: ${c.bg} !important; font-size: ${p.size}px !important; }
      body { box-sizing: border-box; margin: 0 auto !important; max-width: ${p.width}px !important; padding: 28px 22px 90px !important; background: ${c.bg} !important; color: ${c.fg} !important; ${family ? `font-family: ${family} !important;` : ""} font-size: 1rem !important; line-height: ${p.line} !important; overflow-wrap: break-word; -webkit-hyphens: auto; hyphens: auto; }
      body * { color: inherit !important; background: transparent !important; ${family ? "font-family: inherit !important;" : ""} max-width: 100%; box-sizing: border-box; }
      a { color: ${c.link} !important; text-decoration: underline; cursor: pointer; }
      img, svg { max-width: 100% !important; height: auto !important; }
      h1, h2, h3, h4 { line-height: 1.25; }
      ::selection { background: ${c.sel}; }
    `;
  }

  function serialize(target, css) {
    target.head.insertAdjacentHTML("afterbegin", "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; font-src blob: data:\">");
    const bookStyle = target.createElement("style");
    bookStyle.id = "cp-book";
    bookStyle.textContent = css;
    const readerStyle = target.createElement("style");
    readerStyle.id = "cp-reader";
    readerStyle.textContent = readerCss();
    target.head.append(bookStyle, readerStyle);
    return `<!doctype html>${target.documentElement.outerHTML}`;
  }

  async function epubChapterHtml(book, index) {
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
    return serialize(target, css);
  }

  function txtChapterHtml(book, index) {
    const target = newTarget();
    const chunk = book.chunks[index];
    target.body.innerHTML = chunk
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p style="white-space: pre-wrap">${escapeHtml(block)}</p>`)
      .join("");
    return serialize(target, "p { margin: 0 0 1em; }");
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
    const max = node.scrollHeight - node.clientHeight;
    return max > 0 ? clamp(node.scrollTop / max, 0, 1) : 0;
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
    progressLabel.textContent = `${tocLabel(reader, reader.index)} · ${percent()}%`;
    prevButton.disabled = reader.index === 0 && reader.frac < 0.01;
  }

  async function chapterHtml(book, index) {
    if (book.type === "txt") return txtChapterHtml(book, index);
    if (book.type === "cbz") return cbzChapterHtml(book, index);
    if (FLAT.has(book.type)) {
      const target = newTarget();
      target.body.innerHTML = book.chapters[index];
      return serialize(target, "p { margin: 0 0 1em; } table { border-collapse: collapse; } td, th { border: 1px solid currentColor; padding: 4px 8px; } pre { overflow-x: auto; white-space: pre-wrap; } blockquote { margin: 1em 0 1em 1em; padding-left: 1em; border-left: 3px solid currentColor; opacity: .85; }");
    }
    return epubChapterHtml(book, index);
  }

  async function cbzChapterHtml(book, index) {
    const url = await resourceUrl(book, book.pages[index]);
    while (book.urls.size > 6) {
      const oldest = book.urls.keys().next().value;
      URL.revokeObjectURL(book.urls.get(oldest));
      book.urls.delete(oldest);
    }
    const target = newTarget();
    const img = target.createElement("img");
    img.setAttribute("src", url);
    img.setAttribute("alt", `Pagina ${index + 1}`);
    target.body.append(img);
    return serialize(target, "img { display: block; margin: 0 auto; }");
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
    window.requestAnimationFrame(() => {
      const node = scroller();
      if (node) {
        const max = node.scrollHeight - node.clientHeight;
        let anchor = null;
        if (hash) {
          try { anchor = doc.getElementById(decodeURIComponent(hash)); } catch { anchor = doc.getElementById(hash); }
        }
        if (anchor) anchor.scrollIntoView();
        else node.scrollTop = (end ? 1 : frac) * Math.max(0, max);
      }
      reader.frac = currentFrac();
      frame.classList.remove("loading");
      persistProgress();
      updateBar();
      frame.contentWindow?.focus();
    });
  }

  function onFrameScroll() {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      if (!reader || reader.type === "pdf") return;
      reader.frac = currentFrac();
      persistProgress();
      updateBar();
    }, 200);
  }

  function onFrameClick(event) {
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

  function turn(direction) {
    if (!reader || reader.type === "pdf") return;
    const node = scroller();
    if (!node) return;
    const smooth = reducedMotion() ? "auto" : "smooth";
    if (direction > 0) {
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 4) {
        if (reader.index < reader.count - 1) loadChapter(reader.index + 1);
        else say("Sei arrivato alla fine del libro.");
        return;
      }
      node.scrollBy({ top: node.clientHeight * 0.9, behavior: smooth });
    } else {
      if (node.scrollTop <= 4) {
        if (reader.index > 0) loadChapter(reader.index - 1, { end: true });
        return;
      }
      node.scrollBy({ top: -node.clientHeight * 0.9, behavior: smooth });
    }
  }

  function onKey(event) {
    if (!ui.active || ui.tab !== "read" || !reader || reader.type === "pdf" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (indexDialog.open || event.target.closest?.("button, a, select, input, textarea")) return;
    if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
      event.preventDefault();
      turn(1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
      event.preventDefault();
      turn(-1);
    }
  }

  function restyleReader() {
    const c = themeColors();
    readerPanel.style.setProperty("--lb-bg", c.bg);
    readerPanel.style.setProperty("--lb-fg", c.fg);
    const style = frame.contentDocument?.getElementById("cp-reader");
    if (!style) return;
    const frac = currentFrac();
    style.textContent = readerCss();
    window.requestAnimationFrame(() => {
      const node = scroller();
      if (node) node.scrollTop = frac * Math.max(0, node.scrollHeight - node.clientHeight);
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
    const current = { id, type: record.type, title: record.title, author: record.author, token: 0, index: 0, frac: 0, count: 1, toc: [], urls: new Map(), pending: null };
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
    readerTitle.textContent = record.title;
    const isPdf = record.type === "pdf";
    frame.hidden = isPdf;
    pdfFrame.hidden = !isPdf;
    popover.hidden = true;
    [prevButton, nextButton, bookmarkButton, settingsButton, progressLabel].forEach((node) => { node.hidden = isPdf; });
    renderTabs();
    restyleReader();
    if (isPdf) {
      current.url = URL.createObjectURL(current.blob);
      pdfFrame.src = current.url;
      info.updated = Date.now();
      writeState();
      say("Se il PDF non si vede (alcuni telefoni non lo mostrano), usa «Apri in una scheda».");
      return;
    }
    const start = position || { ch: info.ch, frac: info.frac };
    await loadChapter(clamp(start.ch || 0, 0, current.count - 1), { frac: start.frac || 0 });
    if (!position && info.updated) say(`Riprendi da: ${tocLabel(current, current.index)}.`);
  }

  function closeReader() {
    if (!reader) return;
    window.clearTimeout(scrollTimer);
    if (reader.type !== "pdf") {
      reader.frac = currentFrac();
      persistProgress();
    }
    reader.urls?.forEach((url) => URL.revokeObjectURL(url));
    if (reader.url) URL.revokeObjectURL(reader.url);
    reader = null;
    frame.removeAttribute("srcdoc");
    pdfFrame.removeAttribute("src");
    readerPanel.hidden = true;
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
        prefs()[key] = cast(select.value);
        savePrefs();
        restyleReader();
      });
      return select;
    };

    const sizeRow = el("div", "lb-field");
    sizeRow.append(el("span", "", "Dimensione"));
    const sizeValue = el("strong", "lb-size", `${prefs().size}`);
    const step = (delta) => () => {
      prefs().size = clamp(prefs().size + delta, 13, 34);
      sizeValue.textContent = String(prefs().size);
      savePrefs();
      restyleReader();
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
      sizeRow,
      field("Carattere", makeSelect("Carattere", [["serif", "Con grazie (serif)"], ["sans", "Senza grazie"], ["book", "Originale del libro"]], "font", String)),
      field("Tema", makeSelect("Tema", [["auto", "Come l'app"], ["light", "Chiaro"], ["sepia", "Seppia"], ["dark", "Scuro"]], "theme", String)),
      field("Interlinea", makeSelect("Interlinea", [[1.35, "Stretta"], [1.6, "Normale"], [1.9, "Ampia"]], "line", Number)),
      field("Larghezza", makeSelect("Larghezza", [[560, "Stretta"], [720, "Media"], [920, "Larga"]], "width", Number)),
    );
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
    toolbar.append(
      button("Scaffale", ICONS.back, () => selectTab("shelf")),
      readerTitle,
      iconButton("Indice e segnalibri", ICONS.list, openIndex),
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
    pdfFrame = el("iframe", "lb-pdf");
    pdfFrame.title = "Documento PDF";
    pdfFrame.hidden = true;

    prevButton = button("Indietro", ICONS.prev, () => turn(-1));
    nextButton = button("Avanti", ICONS.next, () => turn(1));
    progressLabel = el("span", "lb-progress");
    progressLabel.setAttribute("role", "status");
    const footer = el("div", "lb-footer");
    footer.append(prevButton, progressLabel, nextButton);
    panel.append(toolbar, popover, frame, pdfFrame, footer);
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
      .lb-folder-text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
      .lb-folder-text strong { overflow: hidden; color: var(--text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-folder-text small { font-size: 12px; }
      .lb-note { max-width: 70ch; margin: 16px 0 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
      .lb-empty { display: grid; justify-items: center; gap: 10px; padding: 48px 16px; border: 2px dashed var(--border); border-radius: var(--radius); color: var(--text-muted); text-align: center; }
      .lb-empty h2 { margin: 0; color: var(--text); font-size: 18px; }
      .lb-empty p { max-width: 46ch; margin: 0 0 8px; font-size: 14px; line-height: 1.6; }
      .lb-page.drag .lb-panel { outline: 3px dashed var(--accent); outline-offset: 6px; }
      .lb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px 16px; }
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
      .lb-name { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; line-height: 1.3; }
      .lb-author, .lb-detail { overflow: hidden; color: var(--text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
      .lb-list { margin: 0; padding: 0; list-style: none; }
      .lb-row { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--border); }
      .lb-row-main { display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; padding: 12px 8px; border: 0; background: none; color: var(--text); cursor: pointer; font: inherit; font-size: 14px; text-align: left; }
      .lb-row-main:hover, .lb-row-main[aria-current] { color: var(--accent); }
      .lb-row-main[aria-current] { font-weight: 700; }
      .lb-row-main small { color: var(--text-muted); font-size: 11px; }
      .lb-reader { --lb-bg: var(--surface); --lb-fg: var(--text); position: relative; display: flex; flex-direction: column; gap: 10px; }
      .lb-toolbar { display: flex; align-items: center; gap: 4px; }
      .lb-reader-title { flex: 1; min-width: 0; margin: 0 8px; overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      .lb-frame, .lb-pdf { display: block; width: 100%; height: calc(100vh - 270px); height: calc(100dvh - 270px); min-height: 420px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--lb-bg); }
      .lb-pdf { height: calc(100dvh - 200px); }
      .lb-reader:not(:has(.lb-pdf:not([hidden]))) .lb-pdf-open { display: none; }
      .lb-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .lb-progress { flex: 1; overflow: hidden; color: var(--text-muted); font-size: 12px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
      .lb-pop { position: absolute; top: 48px; right: 0; z-index: 5; display: grid; gap: 12px; width: min(320px, 100%); padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / 25%); }
      .lb-field { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
      .lb-stepper { display: inline-flex; align-items: center; gap: 8px; }
      .lb-step { min-width: 40px; min-height: 36px; border: 1px solid var(--border); border-radius: 18px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-weight: 700; }
      .lb-step:hover { border-color: var(--accent); color: var(--accent); }
      .lb-size { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
      .lb-reader:fullscreen { height: 100%; padding: 12px; background: var(--lb-bg); color: var(--lb-fg); }
      .lb-reader:fullscreen .lb-frame { flex: 1; height: auto; min-height: 0; }
      .lb-dialog { width: min(520px, calc(100vw - 32px)); max-height: 80vh; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); }
      .lb-dialog::backdrop { background: rgb(0 0 0 / 50%); }
      .lb-dialog-body { display: grid; gap: 8px; padding: 20px; }
      .lb-dialog-title { margin: 8px 0 0; font-size: 16px; font-weight: 600; }
      .lb-tools { width: min(760px, calc(100vw - 24px)); max-height: 88vh; }
      .lb-section { margin: 14px 0 0; font-size: 14px; font-weight: 600; }
      .lb-dup { display: grid; gap: 6px; margin: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
      .lb-dup legend { padding: 0 6px; font-size: 13px; font-weight: 600; }
      .lb-dup-row, .lb-check { display: flex; align-items: flex-start; gap: 8px; color: var(--text); font-size: 13px; line-height: 1.4; }
      .lb-dup .lb-button { justify-self: start; }
      .lb-tools-bar { position: sticky; bottom: -20px; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 0; background: var(--surface); }
      .lb-tools-bar .lb-check { flex: 1 1 260px; justify-content: flex-start; }
      .lb-fix { display: flex; align-items: flex-start; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--border); }
      .lb-fix-main { display: grid; flex: 1; gap: 6px; min-width: 0; }
      .lb-fix-old { overflow: hidden; color: var(--text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .lb-fix-grid { display: grid; grid-template-columns: 2fr 1.4fr 72px; gap: 8px; }
      .lb-field { display: grid; gap: 2px; min-width: 0; color: var(--text-muted); font-size: 11px; }
      .lb-field input { min-width: 0; min-height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
      .lb-fix-new { overflow-wrap: anywhere; color: var(--accent); font-size: 12px; font-weight: 600; }
      @media (max-width: 560px) { .lb-fix-grid { grid-template-columns: 1fr 72px; } .lb-fix-grid .lb-field:first-child { grid-column: 1 / -1; } }
      @media (prefers-reduced-motion: no-preference) {
        .lb-book { animation: lb-in 260ms ease-out backwards; }
        .lb-cover { transition: transform 160ms, box-shadow 160ms; }
        .lb-cover:hover { transform: translateY(-4px) rotate(-.5deg); box-shadow: 0 10px 22px rgb(0 0 0 / 28%); }
        .lb-frame { transition: opacity 180ms; }
        .lb-frame.loading { opacity: 0; }
        .lb-pop { animation: lb-in 160ms ease-out; }
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
      prefs()[key] = cast(value);
      savePrefs();
      if (readerPanel) restyleReader();
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
    const tools = el("button", "cp-choice", "Apri Sistema libreria (nomi, metadati, doppioni)");
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
    page.append(titleElement, descriptionElement, metaElement, shelfPanel, bookmarksPanel, readerPanel, fileInput, folderInput, indexDialog, toolsDialog);
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
    window.addEventListener("pagehide", () => {
      if (reader && reader.type !== "pdf") {
        reader.frac = currentFrac();
        persistProgress();
      }
    });
  }

  window.CyberPulseLibrary = Object.freeze({ open: showLibrary, close });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
