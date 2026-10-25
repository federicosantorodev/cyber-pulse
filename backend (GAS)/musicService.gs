/**
 * Cyber Pulse - Backend (Google Apps Script)
 * File: musicService.gs - Hub Musica: notizie musicali filtrate per generi e artisti scelti dall'utente.
 *
 * Nessuna AI e nessun servizio esterno: usa le notizie gia' raccolte nella categoria "musica" e le
 * raggruppa con la stessa logica della prima pagina (frontService.gs). Estrae anche nuove uscite,
 * concerti e i nomi piu' citati dalle testate.
 */

const MUSIC_ = Object.freeze({
  CATEGORY: "musica",
  SCAN_ROWS: 2500,
  WINDOW_HOURS: 96,
  MIN_PERSONAL: 6,
  MAX_GENRES: 30,
  MAX_ARTISTS: 20,
  MAX_NAME: 60,
  CACHE_SECONDS: 1800,
  DASH: { stories: 12, headlines: 18, members: 5 },
  SECTION: { stories: 10, headlines: 20, members: 5 },
  LIST_SIZE: 8,
  TRENDING_SIZE: 12,
  // Termini (senza accenti, minuscoli) che identificano ogni genere nei titoli e nei riassunti.
  GENRES: Object.freeze({
    pop: ["pop", "popstar", "pop star"],
    rock: ["rock", "hard rock", "grunge", "rock band"],
    metal: ["metal", "heavy metal", "thrash", "death metal", "black metal", "metalcore", "doom"],
    rap: ["rap", "rapper", "hip hop", "hiphop", "trap", "drill", "freestyle", "mixtape"],
    elettronica: ["elettronica", "electronic", "techno", "house", "edm", "dj", "dance", "rave", "dubstep", "drum and bass"],
    jazz: ["jazz", "swing", "bebop"],
    blues: ["blues", "rhythm and blues"],
    classica: ["classica", "orchestra", "sinfonica", "sinfonia", "opera", "lirica", "pianista", "violinista", "filarmonica", "teatro alla scala"],
    cantautori: ["cantautore", "cantautrice", "cantautori", "sanremo", "musica italiana", "x factor"],
    indie: ["indie", "alternative", "alt rock", "dream pop", "shoegaze"],
    country: ["country", "bluegrass", "nashville", "americana"],
    reggae: ["reggae", "ska", "dub", "rocksteady", "roots reggae"],
    caraibi: ["dancehall", "caraibica", "caraibi", "caribbean", "calypso", "soca", "zouk", "kompa", "giamaica", "jamaica"],
    latin: ["latin", "latino", "reggaeton", "salsa", "bachata", "merengue", "cumbia"],
    kpop: ["kpop", "k pop", "bts", "blackpink", "idol"],
    rnb: ["rnb", "r b", "soul", "neo soul", "funk", "motown"],
    punk: ["punk", "post punk", "pop punk", "emo"],
    folk: ["folk", "etnica", "world music", "celtica", "flamenco", "fado"],
    colonne: ["colonna sonora", "colonne sonore", "soundtrack", "ost"],
  }),
  RELEASE: /\b(nuovo album|nuovo singolo|nuovo disco|nuovo brano|nuovo ep|nuova canzone|nuovo video|esce|uscita|uscira|e uscito|annuncia l album|annuncia il nuovo|tracklist|out now|new album|new single|new song|new ep|releases|drops|shares new|announces album|debutta|inedito|inediti|anteprima del)\b/,
  TOUR: /\b(tour|concerto|concerti|in concerto|date live|biglietti|tickets|sold out|festival|world tour|palasport|stadi|data zero|prevendita|prevendite|reunion)\b/,
  NAME_STOP: "Nuovo Nuova Album Singolo Tour Live Video Ufficiale Italia Italiano Italiana Milano Roma Torino Napoli San Siro Stadio Palazzetto Arena Radio Rai Festival Concerto Concerti Music Awards Spotify Apple YouTube Netflix Amazon Instagram TikTok Sanremo Il La Lo Le Gli Un Una Dopo Prima Ecco Come Cosa Perche Chi Dove Quando Per Con Tra Fra The And Of For In On At To Is New Now Out With From This That What How Why Top Best Official Video Premio Premi Serata Giornata Stagione Canale Teatro Piazza Casa Gran",
});

function musicFold_(text) {
  return " " + String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

function musicHas_(folded, term) {
  return folded.indexOf(" " + term + " ") !== -1;
}

// Un genere è un id del catalogo oppure un microgenere libero nel formato "x:testo".
function musicIsMicro_(id) {
  return /^x:[a-z0-9\u00E0-\u00FF '.&-]{2,40}$/.test(id);
}

function musicGenreTerms_(id) {
  if (MUSIC_.GENRES[id]) return MUSIC_.GENRES[id];
  const term = musicFold_(id.slice(2)).trim();
  return term.length >= 2 ? [term] : [];
}

function musicParseGenres_(value) {
  const ids = String(value || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length > MUSIC_.MAX_GENRES) throw new ApiError("BAD_REQUEST", "Troppi generi.");
  ids.forEach((id) => {
    if (!MUSIC_.GENRES[id] && !musicIsMicro_(id)) throw new ApiError("BAD_REQUEST", "Genere non valido.");
  });
  return ids;
}

function musicCleanName_(value) {
  return String(value || "").replace(/[^A-Za-z0-9\u00C0-\u00FF '.&-]/g, "").replace(/\s+/g, " ").trim().slice(0, MUSIC_.MAX_NAME);
}

function musicParseArtists_(value) {
  const names = String(value || "").split(",").map(musicCleanName_).filter((name) => name.length >= 2);
  if (names.length > MUSIC_.MAX_ARTISTS) throw new ApiError("BAD_REQUEST", "Troppi artisti.");
  return names;
}

function musicLoadItems_() {
  const sheet = getSpreadsheet_().getSheetByName(CP.SHEETS.NEWS);
  const last = sheet.getLastRow();
  const count = Math.min(Math.max(last - 1, 0), MUSIC_.SCAN_ROWS);
  const rows = count === 0 ? [] : sheet.getRange(2, 1, count, CP.HEADERS.News.length).getValues();
  const all = [];
  rows.forEach((row) => {
    if (!row[0] || row[1] !== MUSIC_.CATEGORY) return;
    all.push({
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
  });
  const since = new Date(Date.now() - MUSIC_.WINDOW_HOURS * 3600000).toISOString();
  const recent = all.filter((item) => String(item.publishedAt) >= since);
  const items = recent.length >= FRONT_.MIN_ITEMS_IN_WINDOW ? recent : all.slice(0, 300);
  items.forEach((item) => {
    item.folded = musicFold_(item.title + " " + String(item.summary || "").slice(0, 300));
  });
  return items;
}

function musicMatchesGenre_(item, genreId) {
  return musicGenreTerms_(genreId).some((term) => musicHas_(item.folded, term));
}

function musicMatchesArtist_(item, name) {
  const folded = musicFold_(name).trim();
  return folded.length >= 2 && musicHas_(item.folded, folded);
}

function musicScore_(item, genres, artists) {
  let score = 0;
  if (artists.some((name) => musicMatchesArtist_(item, name))) score += 4;
  if (genres.some((id) => musicMatchesGenre_(item, id))) score += 2;
  return score;
}

function musicSlim_(item) {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    publishedAt: item.publishedAt,
  };
}

// Nomi propri (2-3 parole con la maiuscola) citati da almeno due testate diverse.
function musicTrending_(items) {
  const stop = {};
  MUSIC_.NAME_STOP.split(" ").forEach((word) => { stop[word] = true; });
  const wordPattern = /^[A-Z\u00C0-\u00D6\u00D8-\u00DE][A-Za-z\u00C0-\u00FF'-]+$/;
  const found = {};
  items.forEach((item) => {
    const words = String(item.title || "").split(/\s+/).map((word) => word.replace(/^[^A-Za-z\u00C0-\u00FF]+|[^A-Za-z\u00C0-\u00FF]+$/g, "")).filter(Boolean);
    const capital = words.filter((word) => wordPattern.test(word)).length;
    if (words.length >= 5 && capital / words.length > 0.7) return;
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        const name = run.slice(0, 3).join(" ");
        const entry = found[name] || (found[name] = { name, count: 0, sources: {} });
        entry.count += 1;
        entry.sources[item.sourceId] = true;
      }
      run = [];
    };
    words.forEach((word) => {
      if (wordPattern.test(word) && !stop[word]) run.push(word);
      else flush();
    });
    flush();
  });
  return Object.keys(found)
    .map((key) => found[key])
    .filter((entry) => Object.keys(entry.sources).length >= 2)
    .sort((a, b) => Object.keys(b.sources).length - Object.keys(a.sources).length || b.count - a.count)
    .slice(0, MUSIC_.TRENDING_SIZE)
    .map((entry) => ({ name: entry.name, count: entry.count, sources: Object.keys(entry.sources).length }));
}

function musicBuild_(kind, value, genres, artists) {
  const items = musicLoadItems_();
  if (kind === "releases") return { kind, front: buildFront_(items.filter((item) => MUSIC_.RELEASE.test(item.folded)), MUSIC_.SECTION) };
  if (kind === "tours") return { kind, front: buildFront_(items.filter((item) => MUSIC_.TOUR.test(item.folded)), MUSIC_.SECTION) };
  if (kind === "genre") return { kind, front: buildFront_(items.filter((item) => musicMatchesGenre_(item, value)), MUSIC_.SECTION) };
  if (kind === "artist") return { kind, front: buildFront_(items.filter((item) => musicMatchesArtist_(item, value)), MUSIC_.SECTION) };

  const scored = items.map((item) => ({ item, score: musicScore_(item, genres, artists) }));
  const personal = scored.filter((entry) => entry.score > 0).map((entry) => entry.item);
  const personalized = (genres.length > 0 || artists.length > 0) && personal.length >= MUSIC_.MIN_PERSONAL;
  const followed = artists
    .map((name) => ({ name, items: items.filter((item) => musicMatchesArtist_(item, name)).slice(0, 2).map(musicSlim_) }))
    .filter((entry) => entry.items.length > 0);
  return {
    kind: "dashboard",
    personalized,
    front: buildFront_(personalized ? personal : items, MUSIC_.DASH),
    releases: items.filter((item) => MUSIC_.RELEASE.test(item.folded)).slice(0, MUSIC_.LIST_SIZE).map(musicSlim_),
    tours: items.filter((item) => MUSIC_.TOUR.test(item.folded)).slice(0, MUSIC_.LIST_SIZE).map(musicSlim_),
    trending: musicTrending_(items),
    artists: followed,
  };
}

// Parametri: kind (dashboard|releases|tours|genre|artist), value, genres, artists.
function getMusicData_(params) {
  const kind = params.kind || "dashboard";
  if (["dashboard", "releases", "tours", "genre", "artist"].indexOf(kind) === -1) throw new ApiError("BAD_REQUEST", "Parametro non valido: kind.");
  const genres = musicParseGenres_(params.genres);
  const artists = musicParseArtists_(params.artists);
  let value = "";
  if (kind === "genre") value = musicParseGenres_(params.value)[0] || "";
  if (kind === "artist") value = musicCleanName_(params.value);
  if ((kind === "genre" || kind === "artist") && !value) throw new ApiError("BAD_REQUEST", "Parametro non valido: value.");

  const cache = CacheService.getScriptCache();
  const raw = [kind, value, genres.join(","), artists.join(",")].join("|");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw).map((b) => ("0" + (b & 255).toString(16)).slice(-2)).join("");
  const cacheKey = "music_" + digest;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const payload = musicBuild_(kind, value, genres, artists);
  payload.generatedAt = new Date().toISOString();
  payload.lastRefreshAt = getLastRefresh_().at || null;
  const text = JSON.stringify(payload);
  if (text.length < CP.API.CACHE_MAX_CHARS) cache.put(cacheKey, text, MUSIC_.CACHE_SECONDS);
  return payload;
}
