/* Cyber Pulse - Arena: pacchetto dati sportivo.
 * Notizie: dalle fonti RSS della categoria "sport" (e "motori") gia' raccolte.
 * Risultati e classifiche: sportsService.gs (ESPN, con cache). Mai dati inventati. */

const ARENA_ = {
  CATEGORY: "sport",
  MAX_LIST: 30,
  MAX_TERM: 60,
  NEWS_LIMIT: 40,
  SCAN_ROWS: 600,
  SPORT_TERMS: {
    football: ["calcio", "serie a", "serie b", "champions", "europa league", "coppa italia"],
    basketball: ["basket", "nba", "euroleague"],
    tennis: ["tennis", "atp", "wta", "wimbledon"],
    volleyball: ["volley", "pallavolo"],
    motorsport: ["formula 1", "f1", "motogp", "ferrari", "rally"],
    formula1: ["formula 1", "f1", "gran premio", "gp di", "gp usa", "verstappen", "leclerc", "hamilton", "norris", "piastri", "antonelli", "red bull racing"],
    motogp: ["motogp", "moto2", "moto3", "bagnaia", "marquez"],
    superbike: ["superbike", "wsbk", "supersport"],
    rally: ["rally", "wrc", "dakar"],
    endurance: ["le mans", "endurance", "wec", "imsa"],
    motorother: ["formula e", "indycar", "nascar", "dtm", "karting"],
    rugby: ["rugby", "sei nazioni"],
    cycling: ["ciclismo", "giro d'italia", "tour de france", "vuelta", "ciclista"],
    athletics: ["atletica", "maratona", "diamond league", "100 metri"],
    swimming: ["nuoto", "nuotatore", "nuotatrice"],
    winter: ["sci ", "biathlon", "snowboard", "olimpiadi invernali", "slittino", "pattinaggio"],
    golf: ["golf", "ryder cup", "pga tour"],
    boxing: ["boxe", "pugilato", "ufc", "mma", "arti marziali"],
    baseball: ["baseball", "mlb"],
    americanfootball: ["nfl", "super bowl", "football americano"],
    hockey: ["hockey", "nhl"],
    handball: ["pallamano"],
    padel: ["padel"],
    sailing: ["vela", "america's cup", "sailgp"],
    esports: ["esports", "e-sport", "league of legends", "counter-strike"],
    other: ["olimpiadi", "paralimpiadi"],
  },
};

function parseTermList_(value, name) {
  if (!value) return [];
  const terms = String(value).split(",").map((t) => t.trim()).filter(Boolean);
  if (terms.length > ARENA_.MAX_LIST) throw new ApiError("BAD_REQUEST", "Troppi valori in: " + name + ".");
  return terms.map((t) => {
    if (t.length > ARENA_.MAX_TERM) throw new ApiError("BAD_REQUEST", "Valore troppo lungo in: " + name + ".");
    return t.toLowerCase();
  });
}

function getArenaData_(params) {
  const type = String(params.categoryType || "dashboard");
  if (["dashboard", "competition", "team", "sport", "country"].indexOf(type) === -1) {
    throw new ApiError("BAD_REQUEST", "Parametro non valido: categoryType.");
  }
  const category = String(params.category || "").trim().toLowerCase();
  if (category.length > ARENA_.MAX_TERM) throw new ApiError("BAD_REQUEST", "Parametro non valido: category.");

  const sports = parseTermList_(params.sports, "sports");
  const countries = parseTermList_(params.country, "country");
  const competitions = parseTermList_(params.competitions, "competitions");
  const teams = parseTermList_(params.teams, "teams");

  // Termini da cercare: la categoria scelta, oppure tutte le preferenze nella Dashboard.
  let terms;
  if (type === "dashboard" || !category) {
    terms = competitions.concat(teams, countries);
    sports.forEach((s) => { terms = terms.concat(ARENA_.SPORT_TERMS[s] || []); });
  } else if (type === "sport") {
    terms = (ARENA_.SPORT_TERMS[category] || []).concat([category]);
  } else {
    terms = [category];
  }

  const cache = CacheService.getScriptCache();
  // Le fonti motoristiche stanno nella categoria "motori": le includo solo per gli sport a motore.
  const MOTOR_SPORTS = ["motorsport", "formula1", "motogp", "superbike", "rally", "endurance", "motorother"];
  const includeMotori = type === "dashboard" || !category
    ? sports.some((s) => MOTOR_SPORTS.indexOf(s) !== -1)
    : (type === "sport" && MOTOR_SPORTS.indexOf(category) !== -1);
  const cacheKey = "arena2_" + hash_([type, includeMotori, terms.join("|"), competitions.join("|"), teams.join("|"), sports.join("|")].join("#"));
  const cached = String(params.debug || "") === "1" ? null : cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = getSpreadsheet_().getSheetByName(CP.SHEETS.NEWS);
  const last = sheet.getLastRow();
  const count = Math.min(Math.max(last - 1, 0), ARENA_.SCAN_ROWS);
  const rows = count === 0 ? [] : sheet.getRange(2, 1, count, CP.HEADERS.News.length).getValues();

  const news = [];
  for (const row of rows) {
    if (!row[0]) continue;
    const isMotori = row[1] === "motori";
    if (row[1] !== ARENA_.CATEGORY && !(includeMotori && isMotori)) continue;
    const haystack = (String(row[4]) + " " + String(row[6])).toLowerCase();
    if ((terms.length > 0 || isMotori) && !terms.some((t) => haystack.indexOf(t) !== -1)) continue;
    news.push({
      id: row[0],
      categoryId: row[1],
      sourceId: row[2],
      title: row[4],
      summary: row[6],
      url: row[5],
      imageUrl: row[7],
      sourceName: row[3],
      publishedAt: row[8],
    });
    if (news.length >= ARENA_.NEWS_LIMIT) break;
  }

  const sportsData = getSportsData_({
    type,
    category,
    label: String(params.category || "").trim(),
    competitions,
    teams,
    sports,
  });
  const statistics = [{ label: "Notizie trovate", value: String(news.length) }];
  if (sportsData.results.length) statistics.push({ label: "Risultati e partite", value: String(sportsData.results.length) });
  if (sportsData.liveCount) statistics.push({ label: "In corso adesso", value: String(sportsData.liveCount) });

  const payload = {
    generatedAt: new Date().toISOString(),
    news,
    front: buildFront_(news),
    statistics,
    curiosities: [],
    standings: sportsData.standings,
    results: sportsData.results,
    sourceCount: new Set(news.map((n) => n.sourceName)).size,
    dataSources: sportsData.sources,
  };
  if (String(params.debug || "") === "1") payload.sportsLog = SPORTS_LOG_.slice(0, 12);
  const text = JSON.stringify(payload);
  if (text.length < CP.API.CACHE_MAX_CHARS) cache.put(cacheKey, text, CP.API.CACHE_SECONDS);
  return payload;
}
