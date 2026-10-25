/**
 * Cyber Pulse - Backend (Google Apps Script)
 * File: frontService.gs - prima pagina precalcolata, senza AI e senza costi.
 *
 * Raggruppa le notizie che raccontano lo stesso fatto (somiglianza dei titoli), le ordina con un
 * punteggio (numero di testate, freschezza, immagine) e restituisce un unico pacchetto leggero
 * che il browser puo' mostrare subito. Il risultato resta in cache per tutti gli utenti.
 */

const FRONT_ = Object.freeze({
  WINDOW_HOURS: 48,
  SAME_STORY_HOURS: 36,
  SCAN_ROWS: 1500,
  MIN_ITEMS_IN_WINDOW: 20,
  MAX_STORIES: 14,
  MAX_HEADLINES: 24,
  MAX_MEMBERS: 8,
  HOME_STORIES: 3,
  HOME_HEADLINES: 4,
  HOME_MEMBERS: 5,
  MIN_SHARED: 2,
  MIN_JACCARD: 0.4,
  CACHE_SECONDS: 1800,
  STOP_WORDS: "il lo la i gli le un uno una di a da in con su per tra fra e ed o ma che chi cui non si del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle " +
    "come dove quando perche anche piu meno molto dopo prima sono era ha ho hanno essere stato stata sara cosa ecco suo sua suoi sue questo questa questi queste " +
    "the of and for with to in on at is are was were be been has have had will its it as by from that this these those after before over into out up new " +
    "formazioni ufficiali probabili partita diretta live video foto risultato risultati oggi domani ieri dove vedere orario orari tv streaming pagelle classifica ultime notizie news serie giornata " +
    "gara match highlights gallery commento intervista conferenza stampa",
});

function frontStopSet_() {
  if (!frontStopSet_.cache) {
    const set = {};
    FRONT_.STOP_WORDS.split(" ").forEach((word) => { if (word) set[word] = true; });
    frontStopSet_.cache = set;
  }
  return frontStopSet_.cache;
}

function frontTokens_(title) {
  const stop = frontStopSet_();
  const words = String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/);
  const seen = {};
  const tokens = [];
  words.forEach((word) => {
    if (word.length < 3 || stop[word] || seen[word]) return;
    seen[word] = true;
    tokens.push(word);
  });
  return tokens;
}

function frontTime_(item) {
  const ms = Date.parse(String(item.publishedAt));
  return isNaN(ms) ? 0 : ms;
}

// Raggruppamento greedy: ogni notizia entra nel gruppo con piu' parole significative in comune.
function clusterItems_(items) {
  const entries = items.map((item) => ({ item, tokens: frontTokens_(item.title), time: frontTime_(item) }));

  // Le parole presenti in troppe notizie (es. "Juventus" in un giorno di Serie A) non distinguono una storia dall'altra.
  const frequency = {};
  entries.forEach((entry) => entry.tokens.forEach((token) => { frequency[token] = (frequency[token] || 0) + 1; }));
  const maxFrequency = Math.max(12, Math.floor(entries.length * 0.06));
  entries.forEach((entry) => { entry.tokens = entry.tokens.filter((token) => frequency[token] <= maxFrequency); });

  const clusters = [];
  const index = {};
  const sameStoryMs = FRONT_.SAME_STORY_HOURS * 3600000;

  entries.forEach((entry) => {
    const shared = {};
    entry.tokens.forEach((token) => {
      (index[token] || []).forEach((clusterId) => { shared[clusterId] = (shared[clusterId] || 0) + 1; });
    });

    let best = -1;
    let bestScore = 0;
    Object.keys(shared).forEach((key) => {
      const cluster = clusters[key];
      const common = shared[key];
      if (common < FRONT_.MIN_SHARED) return;
      if (entry.time && cluster.time && Math.abs(entry.time - cluster.time) > sameStoryMs) return;
      const jaccard = common / (entry.tokens.length + cluster.tokens.length - common);
      const overlap = common / Math.min(entry.tokens.length, cluster.tokens.length);
      const similar = jaccard >= FRONT_.MIN_JACCARD || (common >= 3 && overlap >= 0.6);
      if (similar && jaccard > bestScore) {
        best = Number(key);
        bestScore = jaccard;
      }
    });

    if (best >= 0) {
      clusters[best].items.push(entry.item);
      return;
    }
    const id = clusters.length;
    clusters.push({ tokens: entry.tokens, time: entry.time, items: [entry.item] });
    entry.tokens.forEach((token) => { (index[token] = index[token] || []).push(id); });
  });
  return clusters.map((cluster) => cluster.items);
}

function summarizeCluster_(group, nowMs, maxMembers) {
  const members = [];
  const sourceSeen = {};
  group.forEach((item) => {
    if (sourceSeen[item.sourceId]) return;
    sourceSeen[item.sourceId] = true;
    members.push({ id: item.id, sourceId: item.sourceId, sourceName: item.sourceName, title: item.title, url: item.url });
  });
  const withImage = group.filter((item) => item.imageUrl);
  const lead = withImage.length > 0 ? withImage[0] : group[0];
  const newest = group.reduce((max, item) => Math.max(max, frontTime_(item)), 0);
  const ageHours = newest ? Math.max(0, (nowMs - newest) / 3600000) : FRONT_.WINDOW_HOURS;
  const freshness = Math.max(0, 1 - ageHours / FRONT_.WINDOW_HOURS) * 4;
  const score = members.length * 3 + freshness + (lead.imageUrl ? 1.5 : 0);
  return {
    score,
    story: {
      id: lead.id,
      title: lead.title,
      summary: lead.summary,
      imageUrl: lead.imageUrl || "",
      url: lead.url,
      categoryId: lead.categoryId,
      sourceId: lead.sourceId,
      sourceName: lead.sourceName,
      publishedAt: group[0].publishedAt,
      sourceCount: members.length,
      members: members.slice(0, maxMembers || FRONT_.MAX_MEMBERS),
    },
  };
}

// items: notizie ordinate dalla piu' recente. Restituisce storie in evidenza e titoli minori.
function buildFront_(items, limits) {
  const maxStories = (limits && limits.stories) || FRONT_.MAX_STORIES;
  const maxHeadlines = (limits && limits.headlines) || FRONT_.MAX_HEADLINES;
  const maxMembers = (limits && limits.members) || FRONT_.MAX_MEMBERS;
  const nowMs = Date.now();
  const ranked = clusterItems_(items).map((group) => summarizeCluster_(group, nowMs, maxMembers));
  ranked.sort((a, b) => b.score - a.score);

  const stories = [];
  const rest = [];
  ranked.forEach((entry) => {
    const worthy = entry.story.sourceCount >= 2 || entry.story.imageUrl;
    if (worthy && stories.length < maxStories) stories.push(entry.story);
    else rest.push(entry.story);
  });

  rest.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  const headlines = rest.slice(0, maxHeadlines).map((story) => ({
    id: story.id,
    title: story.title,
    url: story.url,
    categoryId: story.categoryId,
    sourceId: story.sourceId,
    sourceName: story.sourceName,
    publishedAt: story.publishedAt,
    sourceCount: story.sourceCount,
  }));
  return { stories, headlines };
}

// Home: ogni categoria ha il suo spazio (poche storie e titoli), cosi' il browser puo' scegliere e ordinare le sezioni.
// Resta nel limite della cache: storie e titoli sono elenchi piatti con categoryId.
function buildSectionedFront_(items) {
  const byCategory = {};
  items.forEach((item) => {
    (byCategory[item.categoryId] = byCategory[item.categoryId] || []).push(item);
  });
  const stories = [];
  const headlines = [];
  Object.keys(byCategory).forEach((id) => {
    const part = buildFront_(byCategory[id], {
      stories: FRONT_.HOME_STORIES,
      headlines: FRONT_.HOME_HEADLINES,
      members: FRONT_.HOME_MEMBERS,
    });
    part.stories.forEach((story) => stories.push(story));
    part.headlines.forEach((headline) => headlines.push(headline));
  });
  return { stories, headlines };
}

// Parametro: category (id o "all").
function getFrontPage_(params) {
  const category = params.category && params.category !== "all" ? parseId_(params.category, "category") : "all";
  const cache = CacheService.getScriptCache();
  const cacheKey = "front_" + category;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = getSpreadsheet_().getSheetByName(CP.SHEETS.NEWS);
  const last = sheet.getLastRow();
  const count = Math.min(Math.max(last - 1, 0), FRONT_.SCAN_ROWS);
  const rows = count === 0 ? [] : sheet.getRange(2, 1, count, CP.HEADERS.News.length).getValues();

  const all = [];
  rows.forEach((row) => {
    if (!row[0] || (category !== "all" && row[1] !== category)) return;
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
  const since = new Date(Date.now() - FRONT_.WINDOW_HOURS * 3600000).toISOString();
  const recent = all.filter((item) => String(item.publishedAt) >= since);
  const pool = recent.length >= FRONT_.MIN_ITEMS_IN_WINDOW ? recent : all.slice(0, 300);
  const front = category === "all" ? buildSectionedFront_(pool) : buildFront_(pool);

  const payload = {
    category,
    stories: front.stories,
    headlines: front.headlines,
    generatedAt: new Date().toISOString(),
    lastRefreshAt: getLastRefresh_().at || null,
  };
  const text = JSON.stringify(payload);
  if (text.length < CP.API.CACHE_MAX_CHARS) cache.put(cacheKey, text, FRONT_.CACHE_SECONDS);
  return payload;
}

// Dopo ogni aggiornamento dei feed: elimina la cache e prepara subito la Home, cosi' il primo utente non aspetta.
function warmFrontPages_() {
  const cache = CacheService.getScriptCache();
  cache.remove("front_all");
  try {
    getFrontPage_({ category: "all" });
  } catch (error) {
    console.warn("Prima pagina non preparata: " + String(error).slice(0, 120));
  }
}
