/* Cyber Pulse - Hub Musica (Cyber Music).
 * Notizie musicali per i generi e gli artisti scelti, nuove uscite, concerti, nomi in tendenza e scorciatoie
 * verso l'app musicale preferita. Tutto funziona senza AI; Gemini serve solo per il Radar Artisti, a richiesta. */
(() => {
  "use strict";

  const PREFS_KEY = "cyber-pulse.music-preferences";
  const CACHE_PREFIX = "cyber-pulse.music-cache.";
  const RADAR_KEY = "cyber-pulse.music-radar";
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const RADAR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_ARTISTS = 20;
  const MAX_GENRES = 30;

  const GENRES = [
    ["pop", "Pop", ["Dua Lipa", "Taylor Swift", "Harry Styles", "Ariana Grande", "Elodie", "Annalisa", "Mahmood", "Laura Pausini"]],
    ["rock", "Rock", ["Foo Fighters", "Måneskin", "Arctic Monkeys", "Queen", "Muse", "Ligabue", "Vasco Rossi"]],
    ["metal", "Metal", ["Metallica", "Iron Maiden", "Ghost", "Slipknot", "Megadeth", "Lacuna Coil"]],
    ["rap", "Rap e Trap", ["Kendrick Lamar", "Drake", "Sfera Ebbasta", "Lazza", "Salmo", "Fedez", "Marracash", "Travis Scott"]],
    ["elettronica", "Elettronica e Dance", ["Daft Punk", "Calvin Harris", "David Guetta", "Fred again", "Kraftwerk", "Gigi D'Agostino"]],
    ["jazz", "Jazz", ["Miles Davis", "Norah Jones", "Stefano Bollani", "Paolo Fresu", "Kamasi Washington", "Diana Krall"]],
    ["blues", "Blues", ["B.B. King", "Eric Clapton", "Joe Bonamassa", "Zucchero", "Buddy Guy", "Pino Daniele"]],
    ["classica", "Classica e Lirica", ["Ludovico Einaudi", "Yo-Yo Ma", "Lang Lang", "Giovanni Allevi", "Andrea Bocelli", "Riccardo Muti"]],
    ["cantautori", "Cantautori italiani", ["Fabrizio De André", "Francesco De Gregori", "Niccolò Fabi", "Daniele Silvestri", "Brunori Sas", "Cesare Cremonini"]],
    ["indie", "Indie e Alternative", ["The Strokes", "Tame Impala", "Calcutta", "Phoenix", "Coez", "Colapesce"]],
    ["country", "Country e Americana", ["Johnny Cash", "Dolly Parton", "Morgan Wallen", "Luke Combs", "Chris Stapleton", "Zach Bryan"]],
    ["reggae", "Reggae", ["Bob Marley", "Damian Marley", "Alborosie", "Protoje", "Chronixx"]],
    ["caraibi", "Caraibi", ["Sean Paul", "Shaggy", "Rihanna", "Machel Montano", "Kes"]],
    ["latin", "Latin", ["Bad Bunny", "Shakira", "Rosalía", "J Balvin", "Karol G", "Marc Anthony"]],
    ["kpop", "K-pop", ["BTS", "Blackpink", "Stray Kids", "NewJeans", "Twice", "Seventeen"]],
    ["rnb", "R&B e Soul", ["Beyoncé", "SZA", "The Weeknd", "Alicia Keys", "Stevie Wonder", "Frank Ocean"]],
    ["punk", "Punk ed Emo", ["Ramones", "Sex Pistols", "Blink-182", "Green Day", "The Clash", "The Offspring"]],
    ["folk", "Folk e Musica del mondo", ["Mumford & Sons", "Bob Dylan", "Fleet Foxes", "Vinicio Capossela", "Goran Bregovic", "Nick Drake"]],
    ["colonne", "Colonne sonore", ["Hans Zimmer", "Ennio Morricone", "John Williams", "Ludwig Göransson", "Howard Shore", "Nicola Piovani"]],
  ];

  // Microgeneri suggeriti nella ricerca; qualsiasi altro testo libero è accettato e cercato nelle notizie.
  const MICRO_GENRES = [
    "Shoegaze", "Post-rock", "Math rock", "Dream pop", "Synthwave", "Vaporwave", "Lo-fi", "Hyperpop", "City pop", "Italo disco",
    "Italo dance", "Eurodance", "Trance", "Psytrance", "Drum and bass", "Dubstep", "Techno", "House", "Ambient", "IDM",
    "Industrial", "Darkwave", "Gothic rock", "Post-punk", "Hardcore punk", "Ska punk", "Emo", "Screamo", "Grindcore", "Black metal",
    "Death metal", "Doom metal", "Stoner rock", "Prog rock", "Progressive metal", "Power metal", "Metalcore", "Djent", "Symphonic metal", "Folk metal",
    "Psychedelic rock", "Krautrock", "Garage rock", "Surf rock", "Rockabilly", "Britpop", "Grunge", "Glam rock", "Hard rock", "Blues rock",
    "Bebop", "Jazz fusion", "Acid jazz", "Free jazz", "Swing", "Bossa nova", "Gypsy jazz", "Smooth jazz", "Neo soul", "Funk",
    "Disco", "Boogie", "Gospel", "Afrobeat", "Afrobeats", "Amapiano", "Highlife", "Reggaeton", "Dembow", "Salsa",
    "Bachata", "Cumbia", "Tango", "Flamenco", "Fado", "Rebetiko", "Bluegrass", "Outlaw country", "Honky tonk", "Celtic",
    "Drill", "Boom bap", "Trap", "Grime", "UK garage", "Phonk", "Cloud rap", "Hip hop italiano", "Neomelodica", "Musica popolare",
    "Opera", "Barocca", "Minimalismo", "Contemporanea", "Chiptune", "Videogame music", "City pop", "Bedroom pop", "Indie folk", "Cantautorato",
  ].filter((name, at, all) => all.indexOf(name) === at);

  const PLAYERS = {
    spotify: ["Spotify", (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`],
    apple: ["Apple Music", (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`],
    youtube: ["YouTube Music", (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`],
    deezer: ["Deezer", (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}`],
  };

  const MOODS = [
    ["Energia", "workout energia"],
    ["Relax", "relax chill"],
    ["Concentrazione", "focus concentrazione"],
    ["Malinconia", "malinconia"],
    ["Festa", "party festa"],
    ["In viaggio", "road trip viaggio"],
    ["Notte", "late night notte"],
  ];

  const RELEASE_PATTERN = /\b(nuovo album|nuovo singolo|nuovo disco|nuovo brano|nuovo ep|nuova canzone|nuovo video|esce|uscita|uscir[àa]|è uscito|tracklist|out now|new album|new single|new song|new ep|releases|drops|debutta|inedito|inediti)\b/i;
  const NAME_PATTERN = /[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'’-]+){1,2}/;
  const NAME_STOP = new Set("Nuovo Nuova Album Singolo Tour Live Video Ufficiale Italia Milano Roma Torino San Siro Stadio Arena Radio Festival Concerto Music Spotify Apple YouTube Netflix".split(" "));

  const state = { active: false, prefs: null, tab: "dashboard", request: 0, last: null, extraArtist: "" };
  let page;
  let titleElement;
  let descriptionElement;
  let metaElement;
  let cardsElement;

  const timeFormat = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

  /* ---------- Preferenze e cache ---------- */

  function cleanName(value) {
    return String(value || "").replace(/[^A-Za-z0-9\u00C0-\u00FF '.&-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  }

  // Un microgenere personalizzato è salvato come "x:testo in minuscolo".
  function microId(value) {
    const text = String(value || "").toLowerCase().replace(/[^a-z0-9\u00E0-\u00FF '.&-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    return text.length >= 2 ? `x:${text}` : "";
  }

  function isMicroId(id) {
    return typeof id === "string" && /^x:[a-z0-9\u00E0-\u00FF '.&-]{2,40}$/.test(id);
  }

  function readPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (!raw || !Array.isArray(raw.genres)) return null;
      const known = new Set(GENRES.map(([id]) => id));
      const artists = [];
      for (const name of Array.isArray(raw.artists) ? raw.artists : []) {
        const clean = cleanName(name);
        if (clean.length >= 2 && !artists.includes(clean)) artists.push(clean);
      }
      return {
        genres: raw.genres.filter((id, at, all) => (known.has(id) || isMicroId(id)) && all.indexOf(id) === at).slice(0, MAX_GENRES),
        artists: artists.slice(0, MAX_ARTISTS),
        player: PLAYERS[raw.player] ? raw.player : "spotify",
      };
    } catch {
      return null;
    }
  }

  function writePrefs(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function signature() {
    return `${state.prefs.genres.join(",")}|${state.prefs.artists.join(",")}`;
  }

  function readCache(tab) {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + tab) || "null");
      if (!saved || saved.sig !== signature() || Date.now() - saved.savedAt > CACHE_MAX_AGE_MS) return null;
      return saved.data;
    } catch {
      return null;
    }
  }

  function saveCache(tab, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + tab, JSON.stringify({ savedAt: Date.now(), sig: signature(), data }));
    } catch {
      // La copia serve solo per l'apertura immediata.
    }
  }

  /* ---------- Utilità ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(path) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("fill", "currentColor");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("d", path);
    svg.append(shape);
    return svg;
  }

  const HEADPHONES = "M12 1a9 9 0 0 0-9 9v7a3 3 0 0 0 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3a3 3 0 0 0 3-3v-7a9 9 0 0 0-9-9z";
  const SHUFFLE = "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z";
  const TUNE = "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z";

  function genreLabel(id) {
    const known = GENRES.find(([key]) => key === id);
    if (known) return known[1];
    const text = isMicroId(id) ? id.slice(2) : id;
    return MICRO_GENRES.find((name) => name.toLowerCase() === text) || text.charAt(0).toUpperCase() + text.slice(1);
  }

  function addFollowed(name) {
    if (state.prefs.artists.includes(name) || state.prefs.artists.length >= MAX_ARTISTS) return false;
    state.prefs = { ...state.prefs, artists: [...state.prefs.artists, name] };
    writePrefs(state.prefs);
    if (state.extraArtist === name) state.extraArtist = "";
    renderTabs();
    return true;
  }

  function followButton(name) {
    const button = el("button", "mu-chip", "");
    button.type = "button";
    const sync = () => {
      const followed = state.prefs.artists.includes(name);
      button.textContent = followed ? "✓ Nei preferiti" : "＋ Preferiti";
      button.disabled = followed;
      button.title = followed ? `${name} è già tra i tuoi artisti` : `Aggiungi ${name} ai tuoi artisti preferiti`;
    };
    button.addEventListener("click", () => {
      if (!addFollowed(name)) button.title = `Hai già ${MAX_ARTISTS} artisti: togline uno dalle Impostazioni.`;
      sync();
    });
    sync();
    return button;
  }

  function player() {
    return PLAYERS[state.prefs?.player] || PLAYERS.spotify;
  }

  function listenUrl(query) {
    return player()[1](query);
  }

  function ago(value) {
    const ms = Date.parse(value);
    if (!ms) return "";
    const minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 1) return "adesso";
    if (minutes < 60) return timeFormat.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 48) return timeFormat.format(-hours, "hour");
    return timeFormat.format(-Math.round(hours / 24), "day");
  }

  function safeHttp(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function fold(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Query di ricerca per il pulsante Ascolta: un artista seguito citato nel titolo, altrimenti il primo nome proprio.
  function queryFor(item) {
    const title = String(item.title || "");
    const folded = fold(title);
    const known = (state.prefs?.artists || []).find((name) => folded.includes(fold(name)));
    if (known) return known;
    const match = NAME_PATTERN.exec(title);
    if (match) {
      const words = match[0].split(/\s+/).filter((word) => !NAME_STOP.has(word));
      if (words.length >= 2) return words.join(" ");
    }
    return title.slice(0, 60);
  }

  function isRelease(item) {
    return RELEASE_PATTERN.test(`${item.title || ""} ${item.summary || ""}`);
  }

  function listenLink(query, label = "Ascolta") {
    const link = el("a", "cp-story-read mu-listen");
    link.href = listenUrl(query);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `Cerca "${query}" su ${player()[0]}`;
    link.append(icon(HEADPHONES), document.createTextNode(` ${label}`));
    return link;
  }

  function releaseAction(item) {
    return isRelease(item) ? listenLink(queryFor(item)) : null;
  }

  /* ---------- Stili ---------- */

  function addStyles() {
    if (document.querySelector("#cyber-pulse-music-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-music-styles";
    style.textContent = `
      .mu-page { padding-top: 32px; }
      .mu-page[hidden] { display: none !important; }
      body[data-hub="music"] #source-filter-button { display: none; }
      .mu-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
      .mu-title { margin: 0 0 8px; font-size: clamp(22px, 4vw, 28px); font-weight: 600; letter-spacing: -.3px; }
      .mu-description { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .mu-meta { min-height: 1.5em; margin: 8px 0 0; color: var(--text-muted); font-size: 12px; }
      .mu-eq { display: flex; height: 34px; flex: 0 0 auto; align-items: flex-end; gap: 4px; }
      .mu-eq span { width: 6px; height: 100%; border-radius: 3px; background: var(--accent); transform-origin: bottom; animation: mu-eq 1.1s ease-in-out infinite; }
      .mu-eq span:nth-child(2) { animation-delay: -.3s; }
      .mu-eq span:nth-child(3) { animation-delay: -.6s; }
      .mu-eq span:nth-child(4) { animation-delay: -.9s; }
      @keyframes mu-eq { 0%, 100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }
      .mu-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; margin-top: 24px; }
      @media (min-width: 1200px) { .mu-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      .mu-card { min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
      .mu-card.wide { grid-column: 1 / -1; }
      .mu-card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border); }
      .mu-card-title { margin: 0; font-size: 16px; font-weight: 600; }
      .mu-card-caption { color: var(--text-muted); font-size: 12px; }
      .mu-card-body { display: grid; gap: 12px; padding: 16px; }
      .mu-empty { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .mu-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .mu-pair { display: inline-flex; gap: 4px; }
      .mu-chip:disabled { cursor: default; opacity: .7; }
      .mu-add.stack { flex-wrap: wrap; }
      .mu-hint { color: var(--text-muted); font-size: 12px; }
      .mu-chip { display: inline-flex; min-height: 34px; align-items: center; gap: 6px; padding: 0 14px; border: 1px solid var(--border); border-radius: 17px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-size: 13px; text-decoration: none; }
      .mu-chip:hover { border-color: var(--accent); color: var(--accent); }
      .mu-chip.fill { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
      .mu-chip small { color: var(--text-muted); font-size: 11px; }
      .mu-button { display: inline-flex; min-height: 38px; align-items: center; gap: 6px; padding: 0 16px; border: 0; border-radius: 19px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; text-decoration: none; }
      .mu-button.ghost { border: 1px solid var(--border); background: transparent; color: var(--text); }
      .mu-button:disabled { cursor: progress; opacity: .6; }
      .mu-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
      .mu-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
      .mu-row:first-child { padding-top: 0; }
      .mu-row:last-child { padding-bottom: 0; border-bottom: 0; }
      .mu-row a.mu-title-link { color: var(--text); line-height: 1.4; text-decoration: none; overflow-wrap: anywhere; }
      .mu-row a.mu-title-link:hover { color: var(--accent); }
      .mu-row small { grid-column: 1; color: var(--text-muted); font-size: 11px; }
      .mu-listen svg { margin-right: 2px; vertical-align: -3px; }
      .mu-row .mu-listen { min-height: 30px; padding: 0 12px; font-size: 12px; }
      .mu-section-label { margin: 0; color: var(--text-muted); font-size: 12px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; }
      .mu-note { margin: 0; color: var(--text-muted); font-size: 12px; }
      .mu-news .feed { margin-top: 0; }
      .mu-radar-reason { color: var(--text-muted); font-size: 12px; }
      .mu-dialog { width: min(600px, calc(100vw - 24px)); max-height: calc(100vh - 24px); padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); }
      .mu-dialog::backdrop { background: rgba(0, 0, 0, .55); }
      .mu-dialog form { display: grid; gap: 14px; padding: 22px; }
      .mu-dialog h2 { margin: 0; font-size: 20px; }
      .mu-dialog p { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .mu-bubbles { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; padding: 6px 0; }
      .mu-bubble { min-height: 44px; padding: 0 20px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-muted); color: var(--text); cursor: pointer; font: inherit; font-size: 14px; animation: mu-float 4.5s ease-in-out infinite; transition: transform .15s, background .15s; }
      .mu-bubble:nth-child(3n) { min-height: 56px; padding: 0 26px; font-size: 16px; animation-duration: 5.5s; animation-delay: -1.2s; }
      .mu-bubble:nth-child(3n+1) { animation-delay: -2.4s; }
      .mu-bubble:nth-child(4n) { min-height: 38px; padding: 0 16px; font-size: 13px; animation-duration: 3.8s; }
      .mu-bubble:hover { transform: scale(1.05); }
      .mu-bubble[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: var(--on-accent); font-weight: 600; }
      @keyframes mu-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      .mu-add { display: flex; gap: 8px; }
      .mu-add input { flex: 1; min-width: 0; min-height: 42px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 14px; }
      .mu-actions { display: flex; justify-content: space-between; gap: 8px; }
      .mu-error { min-height: 1.4em; color: #d93025; font-size: 13px; }
      .mu-step { color: var(--text-muted); font-size: 12px; font-weight: 600; }
      @media (prefers-reduced-motion: reduce) { .mu-eq span, .mu-bubble { animation: none; } .mu-eq span { transform: scaleY(.6); } }
      @media (max-width: 700px) {
        .mu-page { padding-top: 24px; }
        .mu-cards { grid-template-columns: 1fr; column-gap: 12px; margin-top: 18px; }
        .mu-card.wide { grid-column: auto; }
      }
    `;
    document.head.append(style);
  }

  /* ---------- Schede ---------- */

  function createCard(title, caption, wide = false) {
    const card = el("section", `mu-card${wide ? " wide" : ""}`);
    const header = el("header", "mu-card-header");
    header.append(el("h2", "mu-card-title", title));
    if (caption) header.append(el("span", "mu-card-caption", caption));
    const body = el("div", "mu-card-body");
    card.append(header, body);
    return { card, body };
  }

  function empty(text) {
    return el("p", "mu-empty", text);
  }

  function linkRows(items, withListen) {
    const list = el("ul", "mu-list");
    for (const item of items) {
      const row = el("li", "mu-row");
      const href = safeHttp(item.url);
      const title = el(href ? "a" : "span", "mu-title-link", item.title);
      if (href) {
        title.href = href;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
      }
      row.append(title);
      if (withListen) row.append(listenLink(queryFor(item)));
      row.append(el("small", "", [item.sourceName || item.sourceId, ago(item.publishedAt)].filter(Boolean).join(" · ")));
      list.append(row);
    }
    return list;
  }

  function tasteCard() {
    const { card, body } = createCard("I tuoi gusti", "Personalizza il feed", true);
    const prefs = state.prefs;
    const chips = el("div", "mu-chips");
    for (const id of prefs.genres) chips.append(el("span", "mu-chip fill", genreLabel(id)));
    for (const name of prefs.artists) chips.append(el("span", "mu-chip", name));
    body.append(chips);
    const edit = el("button", "mu-button ghost");
    edit.type = "button";
    edit.append(icon(TUNE), document.createTextNode(" Modifica generi e artisti"));
    edit.addEventListener("click", openWizard);
    body.append(edit);
    return card;
  }

  // Ogni giorno una selezione diversa ma stabile: stesso giorno, stessa proposta.
  function dailySeed() {
    const now = new Date();
    return now.getFullYear() * 400 + now.getMonth() * 31 + now.getDate();
  }

  function pickFrom(list, seed) {
    return list.length ? list[Math.abs(seed) % list.length] : null;
  }

  function listenCard() {
    const { card, body } = createCard("Ascolta adesso", `Si apre su ${player()[0]}`, true);
    const prefs = state.prefs;
    const seed = dailySeed();

    body.append(el("p", "mu-section-label", "Il mix di oggi"));
    const mix = el("div", "mu-chips");
    const genre = pickFrom(prefs.genres, seed);
    const artist = pickFrom(prefs.artists, seed + 1);
    const mood = pickFrom(MOODS, seed + 2);
    const ideas = [];
    if (artist) ideas.push([`Il meglio di ${artist}`, artist]);
    if (genre && mood) ideas.push([`${genreLabel(genre)} · ${mood[0]}`, `${genreLabel(genre)} ${mood[1]}`]);
    if (genre) ideas.push([`Scoperte ${genreLabel(genre)}`, `${genreLabel(genre)} nuove uscite`]);
    for (const [label, query] of ideas) {
      const link = el("a", "mu-chip fill", label);
      link.href = listenUrl(query);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      mix.append(link);
    }
    if (ideas.length) body.append(mix);

    body.append(el("p", "mu-section-label", "Che atmosfera cerchi?"));
    const moods = el("div", "mu-chips");
    for (const [label, term] of MOODS) {
      const link = el("a", "mu-chip", label);
      const base = pickFrom(prefs.genres, seed + label.length);
      link.href = listenUrl(`${term}${base ? ` ${genreLabel(base)}` : ""}`);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      moods.append(link);
    }
    body.append(moods);

    const surprise = el("button", "mu-button");
    surprise.type = "button";
    surprise.append(icon(SHUFFLE), document.createTextNode(" Sorprendimi"));
    surprise.addEventListener("click", () => {
      const randomGenre = prefs.genres[Math.floor(Math.random() * prefs.genres.length)];
      const randomArtist = prefs.artists.length && Math.random() < 0.5 ? prefs.artists[Math.floor(Math.random() * prefs.artists.length)] : "";
      const randomMood = MOODS[Math.floor(Math.random() * MOODS.length)][1];
      const query = randomArtist || `${genreLabel(randomGenre)} ${randomMood}`;
      window.open(listenUrl(query), "_blank", "noopener,noreferrer");
    });
    body.append(surprise);
    return card;
  }

  function newsCard(front, title, caption, notice) {
    const { card, body } = createCard(title, caption, true);
    card.classList.add("mu-news");
    if (notice) body.append(el("p", "mu-note", notice));
    const list = el("div", "feed");
    const frontLayout = window.CyberPulseCards.getPrefs().layout === "front" && window.CyberPulseFront;
    let shown = 0;
    if (front.stories.length + front.headlines.length === 0) {
      body.append(empty("Nessuna notizia trovata per questa selezione."));
      return card;
    }
    if (frontLayout) {
      shown = window.CyberPulseFront.renderFront(list, front, { context: `Musica: ${title}`, actions: releaseAction, headlinesTitle: "Altri titoli" });
    } else {
      window.CyberPulseFront?.reset(list);
      const items = [...front.stories, ...front.headlines].map((item) => ({ ...item, summary: item.summary || "" }));
      shown = window.CyberPulseCards.renderInto(list, items);
    }
    if (shown === 0) body.append(empty("Tutte le notizie sono nascoste dai tuoi filtri di lettura."));
    else body.append(list);
    return card;
  }

  function listCard(title, caption, items, emptyText, withListen, moreTab) {
    const { card, body } = createCard(title, caption);
    if (!items || items.length === 0) body.append(empty(emptyText));
    else body.append(linkRows(items, withListen));
    if (moreTab && items && items.length > 0) {
      const more = el("button", "mu-button ghost", "Vedi tutte");
      more.type = "button";
      more.addEventListener("click", () => selectTab(moreTab));
      body.append(more);
    }
    return card;
  }

  function trendingCard(trending) {
    const { card, body } = createCard("In tendenza ora", "Nomi citati da più testate");
    if (!trending || trending.length === 0) {
      body.append(empty("Per ora nessun nome è citato da più testate."));
      return card;
    }
    const chips = el("div", "mu-chips");
    for (const entry of trending) {
      const chip = el("button", "mu-chip", entry.name);
      chip.type = "button";
      chip.append(el("small", "", `${entry.sources} testate`));
      chip.addEventListener("click", () => {
        if (!state.prefs.artists.includes(entry.name)) state.extraArtist = entry.name;
        selectTab(`artist:${entry.name}`);
      });
      const pair = el("span", "mu-pair");
      pair.append(chip, followButton(entry.name));
      chips.append(pair);
    }
    body.append(chips, el("p", "mu-note", "Il rilevamento legge i titoli e può includere nomi che non sono artisti."));
    return card;
  }

  function artistsCard(artists) {
    const { card, body } = createCard("I tuoi artisti", "Ultime notizie");
    if (state.prefs.artists.length === 0) {
      body.append(empty("Aggiungi i tuoi artisti dalla procedura guidata per vederli qui."));
      return card;
    }
    if (!artists || artists.length === 0) {
      body.append(empty("Nessuna novità recente sugli artisti che segui."));
      return card;
    }
    for (const entry of artists) {
      const block = el("div", "mu-chips");
      const name = el("button", "mu-chip fill", entry.name);
      name.type = "button";
      name.addEventListener("click", () => selectTab(`artist:${entry.name}`));
      block.append(name, listenLink(entry.name));
      body.append(block, linkRows(entry.items, false));
    }
    return card;
  }

  /* ---------- Radar Artisti (AI, a richiesta) ---------- */

  function readRadar() {
    try {
      const saved = JSON.parse(localStorage.getItem(RADAR_KEY) || "null");
      if (!saved || saved.sig !== signature() || Date.now() - saved.savedAt > RADAR_MAX_AGE_MS || !Array.isArray(saved.lines)) return null;
      return saved.lines;
    } catch {
      return null;
    }
  }

  function parseRadar(text) {
    const lines = [];
    for (const raw of String(text || "").split(/\r?\n/)) {
      const match = /^[\s\-*•\d.)]*(.+?)\s+[-–—:]\s+(.+)$/.exec(raw.trim());
      if (match) lines.push({ name: cleanName(match[1]), reason: match[2].trim().slice(0, 140) });
    }
    return lines.filter((line) => line.name.length >= 2).slice(0, 8);
  }

  function renderRadarLines(body, lines) {
    const list = el("ul", "mu-list");
    for (const line of lines) {
      const row = el("li", "mu-row");
      const info = el("div");
      info.append(el("strong", "", line.name), document.createElement("br"), el("span", "mu-radar-reason", line.reason));
      const actions = el("div", "mu-chips");
      actions.append(listenLink(line.name), followButton(line.name));
      row.append(info, actions);
      list.append(row);
    }
    body.replaceChildren(list, el("p", "mu-note", "Suggerimenti generati da Gemini: verifica sempre gli artisti prima di seguirli."));
  }

  function radarCard() {
    const { card, body } = createCard("✦ Radar Artisti", "Livello AI, a richiesta", false);
    if (!window.CyberPulseAi?.isEnabled()) {
      body.append(empty("Attiva il Livello AI nelle Impostazioni per ricevere suggerimenti di artisti simili ai tuoi gusti. Si usa solo quando lo chiedi tu."));
      return card;
    }
    const saved = readRadar();
    if (saved) renderRadarLines(body, saved);
    const button = el("button", "mu-button", saved ? "Rigenera il radar" : "Genera il mio radar");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const note = el("p", "mu-note", "✦ Gemini sta cercando artisti per te…");
      body.append(note);
      try {
        const text = [`Generi: ${state.prefs.genres.map(genreLabel).join(", ") || "nessuno"}`, `Artisti: ${state.prefs.artists.join(", ") || "nessuno"}`].join("\n");
        const data = await window.CyberPulseAi.run("radar", { text, title: "Radar Artisti", context: "Hub Musica" });
        const lines = parseRadar(data.text);
        if (lines.length === 0) throw Object.assign(new Error("vuoto"), { code: "AI_UNAVAILABLE", message: "Gemini non ha restituito suggerimenti utilizzabili. Riprova." });
        localStorage.setItem(RADAR_KEY, JSON.stringify({ savedAt: Date.now(), sig: signature(), lines }));
        renderRadarLines(body, lines);
        body.append(button);
        button.textContent = "Rigenera il radar";
      } catch (error) {
        note.textContent = window.CyberPulseAi.describe(error);
      } finally {
        button.disabled = false;
      }
    });
    body.append(button);
    return card;
  }

  /* ---------- Pagine ---------- */

  function tabs() {
    const list = [{ id: "dashboard", label: "Per te" }, { id: "releases", label: "Nuove uscite" }, { id: "tours", label: "Concerti e tour" }];
    for (const id of state.prefs?.genres || []) list.push({ id: `genre:${id}`, label: genreLabel(id) });
    for (const name of state.prefs?.artists || []) list.push({ id: `artist:${name}`, label: name });
    if (state.extraArtist && !(state.prefs?.artists || []).includes(state.extraArtist)) list.push({ id: `artist:${state.extraArtist}`, label: state.extraArtist });
    return list;
  }

  function renderTabs() {
    const strip = document.querySelector("#category-strip");
    if (!strip) return;
    const all = tabs();
    if (!all.some((item) => item.id === state.tab)) state.tab = "dashboard";
    strip.replaceChildren(...all.map((item) => {
      const button = el("button", "category-button", item.label);
      button.type = "button";
      button.dataset.musicTab = item.id;
      button.setAttribute("aria-pressed", String(item.id === state.tab));
      button.addEventListener("click", () => selectTab(item.id));
      return button;
    }));
    const dashboard = document.querySelector(".dashboard-button");
    dashboard?.removeAttribute("data-category");
    dashboard?.setAttribute("aria-label", "Per te: Cyber Music");
    dashboard?.setAttribute("aria-pressed", String(state.tab === "dashboard"));
  }

  function requestFor(tab) {
    const base = { genres: state.prefs.genres, artists: state.prefs.artists };
    if (tab.startsWith("genre:")) return { ...base, kind: "genre", value: tab.slice(6) };
    if (tab.startsWith("artist:")) return { ...base, kind: "artist", value: tab.slice(7) };
    return { ...base, kind: tab };
  }

  function describeTab(tab) {
    if (tab === "dashboard") return ["Cyber Music", "Notizie, uscite e idee d'ascolto scelte sui tuoi gusti."];
    if (tab === "releases") return ["Nuove uscite", "Album, singoli e video annunciati dalle testate musicali."];
    if (tab === "tours") return ["Concerti e tour", "Date, biglietti e festival raccontati dalle testate."];
    if (tab.startsWith("genre:")) return [genreLabel(tab.slice(6)), "Le notizie di questo genere."];
    return [tab.slice(7), "Tutte le notizie su questo artista."];
  }

  function artistActions(name) {
    const { card, body } = createCard(name, "Artista", true);
    const chips = el("div", "mu-chips");
    chips.append(listenLink(name, `Ascolta su ${player()[0]}`));
    const followed = state.prefs.artists.includes(name);
    const follow = el("button", "mu-button ghost", followed ? "Smetti di seguire" : "Segui questo artista");
    follow.type = "button";
    follow.addEventListener("click", () => {
      const artists = followed ? state.prefs.artists.filter((entry) => entry !== name) : [...state.prefs.artists, name].slice(0, MAX_ARTISTS);
      state.prefs = { ...state.prefs, artists };
      writePrefs(state.prefs);
      if (followed) state.extraArtist = name;
      renderTabs();
      renderData(state.last.data, state.tab);
    });
    chips.append(follow);
    body.append(chips);
    return card;
  }

  function renderData(data, tab) {
    const built = [];
    if (tab === "dashboard") {
      built.push(tasteCard(), listenCard());
      built.push(newsCard(data.front, "Notizie per te", data.personalized ? "Scelte sui tuoi gusti" : "Il meglio della musica",
        data.personalized ? "" : "Ci sono poche notizie sui tuoi generi e artisti: ti mostro il meglio della musica del momento."));
      built.push(
        listCard("Nuove uscite", "Dalle testate", data.releases, "Nessuna nuova uscita rilevata nelle ultime notizie.", true, "releases"),
        listCard("Concerti e tour", "Dalle testate", data.tours, "Nessun concerto o tour rilevato nelle ultime notizie.", false, "tours"),
        trendingCard(data.trending),
        artistsCard(data.artists),
        radarCard(),
      );
    } else {
      if (tab.startsWith("artist:")) built.push(artistActions(tab.slice(7)));
      const [title] = describeTab(tab);
      built.push(newsCard(data.front, title, "Notizie"));
    }
    cardsElement.replaceChildren(...built);
  }

  async function loadTab(tab) {
    const sequence = ++state.request;
    state.tab = tab;
    saveView(tab);
    renderTabs();
    const [title, description] = describeTab(tab);
    titleElement.textContent = title;
    descriptionElement.textContent = description;

    const cached = readCache(tab);
    if (cached) {
      state.last = { data: cached };
      renderData(cached, tab);
      metaElement.textContent = "Aggiornamento in corso…";
    } else {
      cardsElement.replaceChildren(createCard("Caricamento…", "", true).card);
      metaElement.textContent = "Sto leggendo le notizie musicali dal backend…";
    }
    try {
      const data = await window.CyberPulseApi.fetchMusic({ ...requestFor(tab) });
      if (sequence !== state.request) return;
      state.last = { data };
      saveCache(tab, data);
      renderData(data, tab);
      metaElement.textContent = data.generatedAt ? `Aggiornato alle ${new Date(data.generatedAt).toLocaleTimeString("it", { hour: "2-digit", minute: "2-digit" })}.` : "Aggiornato dal backend.";
    } catch (error) {
      if (sequence !== state.request) return;
      console.warn("Hub Musica non disponibile:", error.code || error.message);
      metaElement.textContent = cached ? `Non riesco ad aggiornare: mostro i dati salvati.` : `Notizie musicali non disponibili: ${error.message}`;
    }
  }

  function selectTab(tab) {
    if (state.active) loadTab(tab);
  }

  /* ---------- Procedura guidata (generi, artisti, app) ---------- */

  function openWizard() {
    document.querySelector("#music-wizard")?.remove();
    const current = readPrefs() || { genres: [], artists: [], player: "spotify" };
    const picked = { genres: [...current.genres], artists: [...current.artists], player: current.player };

    const dialog = el("dialog", "mu-dialog");
    dialog.id = "music-wizard";
    dialog.setAttribute("aria-labelledby", "music-wizard-title");
    const form = document.createElement("form");
    form.method = "dialog";
    dialog.append(form);

    const steps = [
      { key: "genres", title: "Che musica ti fa vibrare?", text: "Tocca le bolle dei generi che ascolti: popoleranno le tue categorie. Scegline almeno uno. Per i microgeneri di nicchia usa la barra qui sotto.", options: () => GENRES.map(([id, label]) => [id, label]), custom: "Cerca un microgenere (es. shoegaze, synthwave, amapiano)" },
      { key: "artists", title: "Quali artisti segui?", text: "Scegli tra i suggeriti per i tuoi generi o scrivi i tuoi: useremo i nomi per mettere in primo piano le loro notizie. Puoi anche saltare.", options: () => [...new Set(GENRES.filter(([id]) => picked.genres.includes(id)).flatMap(([, , names]) => names))].map((name) => [name, name]), custom: "Aggiungi un artista o una band" },
      { key: "player", title: "Dove ascolti la musica?", text: "Il pulsante Ascolta aprirà la ricerca nell'app scelta. Potrai cambiarla nelle Impostazioni.", options: () => Object.entries(PLAYERS).map(([id, [label]]) => [id, label]), custom: "" },
    ];
    let index = 0;

    function render() {
      const step = steps[index];
      const error = el("p", "mu-error");
      error.setAttribute("role", "alert");
      const bubbles = el("div", "mu-bubbles");
      const known = new Set();
      const addBubble = (value, label) => {
        const bubble = el("button", "mu-bubble", label);
        bubble.type = "button";
        const isOn = () => (step.key === "player" ? picked.player === value : picked[step.key].includes(value));
        bubble.setAttribute("aria-pressed", String(isOn()));
        bubble.addEventListener("click", () => {
          if (step.key === "player") {
            picked.player = value;
            for (const other of bubbles.children) other.setAttribute("aria-pressed", String(other === bubble));
            return;
          }
          const list = picked[step.key];
          const at = list.indexOf(value);
          if (at >= 0) list.splice(at, 1);
          else if (step.key === "artists" ? list.length < MAX_ARTISTS : step.key !== "genres" || list.length < MAX_GENRES) list.push(value);
          bubble.setAttribute("aria-pressed", String(list.includes(value)));
        });
        bubbles.append(bubble);
      };
      for (const [value, label] of step.options()) {
        if (known.has(value)) continue;
        known.add(value);
        addBubble(value, label);
      }
      if (step.key === "artists") for (const name of picked.artists) if (!known.has(name)) addBubble(name, name);
      if (step.key === "genres") for (const id of picked.genres) if (!known.has(id)) addBubble(id, genreLabel(id));

      const parts = [el("span", "mu-step", `Passo ${index + 1} di ${steps.length}`), el("h2", "", step.title), el("p", "", step.text), bubbles];
      parts[1].id = "music-wizard-title";
      if (step.custom) {
        const add = el("div", "mu-add");
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 60;
        input.placeholder = step.custom;
        input.setAttribute("aria-label", step.custom);
        if (step.key === "genres") {
          input.setAttribute("list", "music-micro-list");
          const options = document.createElement("datalist");
          options.id = "music-micro-list";
          for (const name of MICRO_GENRES) {
            const option = document.createElement("option");
            option.value = name;
            options.append(option);
          }
          add.append(options);
        }
        const commit = () => {
          if (step.key === "genres") {
            const typed = input.value.trim().toLowerCase();
            const main = GENRES.find(([id, label]) => id === typed || label.toLowerCase() === typed);
            const id = main ? main[0] : microId(typed);
            if (!id) return;
            if (!picked.genres.includes(id)) {
              if (picked.genres.length >= MAX_GENRES) {
                error.textContent = `Puoi scegliere al massimo ${MAX_GENRES} generi.`;
                return;
              }
              picked.genres.push(id);
            }
            render();
            return;
          }
          const name = cleanName(input.value);
          if (name.length < 2) return;
          if (!picked.artists.includes(name) && picked.artists.length < MAX_ARTISTS) picked.artists.push(name);
          render();
        };
        const addButton = el("button", "mu-chip", "Aggiungi");
        addButton.type = "button";
        addButton.addEventListener("click", commit);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        });
        add.append(input, addButton);
        parts.push(add);
      }

      const actions = el("div", "mu-actions");
      const back = el("button", "mu-button ghost", index === 0 ? "Annulla" : "Indietro");
      back.type = "button";
      back.addEventListener("click", () => {
        if (index === 0) dialog.close();
        else {
          index -= 1;
          render();
        }
      });
      const next = el("button", "mu-button", index === steps.length - 1 ? "Fine" : "Avanti");
      next.type = "button";
      next.addEventListener("click", () => {
        if (step.key === "genres" && picked.genres.length === 0) {
          error.textContent = "Scegli almeno un genere.";
          return;
        }
        if (index < steps.length - 1) {
          index += 1;
          render();
          return;
        }
        if (!writePrefs({ genres: picked.genres, artists: picked.artists, player: picked.player })) {
          error.textContent = "Non riesco a salvare le preferenze in questo browser.";
          return;
        }
        state.prefs = readPrefs();
        state.extraArtist = "";
        dialog.close();
        document.querySelector("#music-preferences-section")?.remove();
        if (state.active) loadTab("dashboard");
      });
      actions.append(back, next);
      parts.push(error, actions);
      form.replaceChildren(...parts);
      bubbles.firstChild?.focus();
    }

    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    render();
    dialog.showModal();
  }

  /* ---------- Impostazioni ---------- */

  function buildSettingsPanel() {
    const prefs = readPrefs() || { genres: [], artists: [], player: "spotify" };
    const section = el("section", "cp-settings-section");
    section.id = "music-preferences-section";
    const hint = el("p", "cp-settings-hint", "L'app musicale che si apre con il pulsante Ascolta. I tuoi gusti restano solo su questo dispositivo.");
    const row = el("div", "cp-reading-row");
    const label = el("label", "cp-ai-legend", "App musicale predefinita");
    const select = document.createElement("select");
    select.id = "music-player-select";
    for (const [id, [name]] of Object.entries(PLAYERS)) {
      const option = el("option", "", name);
      option.value = id;
      select.append(option);
    }
    select.value = prefs.player;
    label.htmlFor = select.id;
    select.addEventListener("change", () => {
      const next = readPrefs() || { genres: [], artists: [], player: "spotify" };
      next.player = select.value;
      writePrefs(next);
      state.prefs = readPrefs();
      if (state.active && state.last) renderData(state.last.data, state.tab);
    });
    row.append(label, select);
    const edit = el("button", "cp-choice", "Modifica generi e artisti");
    edit.type = "button";
    edit.addEventListener("click", openWizard);
    section.append(hint, row, edit);
    return section;
  }

  /* ---------- Navigazione ---------- */

  function saveView(tab) {
    try { sessionStorage.setItem("cyber-pulse.view", JSON.stringify({ hub: "music", tab })); } catch { /* storage non disponibile */ }
  }

  function showMusic(startTab) {
    if (!window.CyberPulseAuth?.getUser()) return;
    const initialTab = typeof startTab === "string" ? startTab : "dashboard";
    if (document.body.dataset.hub === "arena") window.CyberPulseArena?.showHome();
    state.active = true;
    state.prefs = readPrefs();
    document.querySelector("#home-page").hidden = true;
    document.querySelector("#arena-page")?.setAttribute("hidden", "");
    page.hidden = false;
    document.body.dataset.hub = "music";
    document.querySelectorAll("[data-launcher-home], #open-arena, #open-music").forEach((button) => {
      button.classList.toggle("current", button.id === "open-music");
    });
    document.querySelector("#launcher")?.close();
    document.querySelector(".second-row")?.setAttribute("aria-label", "Categorie di Cyber Music");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!state.prefs) {
      titleElement.textContent = "Cyber Music";
      descriptionElement.textContent = "Scegli i tuoi generi e artisti per iniziare.";
      metaElement.textContent = "";
      const { card, body } = createCard("Configura la tua musica", "Primo avvio", true);
      body.append(empty("Scegli i generi che ami e gli artisti che segui: creeremo i tuoi feed, le nuove uscite e le idee d'ascolto."));
      const start = el("button", "mu-button", "Inizia");
      start.type = "button";
      start.addEventListener("click", openWizard);
      body.append(start);
      cardsElement.replaceChildren(card);
      document.querySelector("#category-strip")?.replaceChildren();
      window.setTimeout(openWizard, 0);
      return;
    }
    loadTab(initialTab);
  }

  function close() {
    if (!state.active) return;
    state.active = false;
    state.request++;
    page.hidden = true;
    document.querySelector("#open-music")?.classList.remove("current");
    if (document.body.dataset.hub === "music") document.body.removeAttribute("data-hub");
  }

  function init() {
    addStyles();
    const main = document.querySelector("#home");
    if (!main) return;
    page = el("section", "mu-page");
    page.id = "music-page";
    page.hidden = true;
    page.setAttribute("aria-labelledby", "music-page-title");
    const head = el("div", "mu-head");
    const titles = el("div");
    titleElement = el("h1", "mu-title", "Cyber Music");
    titleElement.id = "music-page-title";
    descriptionElement = el("p", "mu-description");
    metaElement = el("p", "mu-meta");
    metaElement.setAttribute("role", "status");
    metaElement.setAttribute("aria-live", "polite");
    titles.append(titleElement, descriptionElement, metaElement);
    const eq = el("div", "mu-eq");
    eq.setAttribute("aria-hidden", "true");
    eq.append(el("span"), el("span"), el("span"), el("span"));
    head.append(titles, eq);
    cardsElement = el("div", "mu-cards");
    window.CyberPulseFront?.masonry(cardsElement);
    page.append(head, cardsElement);
    main.append(page);

    document.querySelector("#open-music")?.addEventListener("click", () => showMusic());
    const restore = () => {
      try {
        const view = JSON.parse(sessionStorage.getItem("cyber-pulse.view") || "null");
        if (view?.hub === "music" && !state.active) showMusic(String(view.tab || "dashboard"));
      } catch { /* vista non valida */ }
    };
    if (window.CyberPulseAuth?.getUser()) restore();
    else document.addEventListener("cyberpulse:signedin", restore, { once: true });
    document.querySelectorAll("[data-launcher-home]").forEach((button) => button.addEventListener("click", () => {
      const wasActive = state.active;
      close();
      if (wasActive) document.dispatchEvent(new CustomEvent("cyberpulse:restorestrip"));
    }));
    document.querySelector("#open-arena")?.addEventListener("click", close);
    document.querySelector(".brand")?.addEventListener("click", (event) => {
      if (state.active) {
        event.preventDefault();
        window.CyberPulseArena?.showHome();
        close();
      }
    });
    document.querySelector(".dashboard-button")?.addEventListener("click", (event) => {
      if (state.active) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectTab("dashboard");
      }
    }, true);
    window.CyberPulseSettings?.register({ id: "music", group: "music", title: "Gusti e ascolto", build: buildSettingsPanel });
    document.addEventListener("cyberpulse:aichange", () => {
      if (state.active && state.last) renderData(state.last.data, state.tab);
    });
    document.addEventListener("cyberpulse:readingchange", () => {
      if (state.active && state.last) renderData(state.last.data, state.tab);
    });
  }

  window.CyberPulseMusic = Object.freeze({ open: showMusic, close });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
