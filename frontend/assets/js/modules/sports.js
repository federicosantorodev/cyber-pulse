/* Cyber Pulse - Arena: risultati e classifiche reali.
 * Fonte: endpoint pubblici JSON di ESPN (gratuiti, senza chiave, NON ufficiali: ESPN puo' cambiarli).
 * ESPN blocca i server Google (403), quindi le chiamate partono dal browser (ESPN ammette il CORS),
 * con cache in localStorage. Se una chiamata fallisce si restituisce l'elenco vuoto: nessun dato inventato.
 * Le funzioni di normalizzazione sono le stesse di backend (GAS)/sportsService.gs. */
(() => {
"use strict";

const SPORTS_ = {
  SITE: "https://site.api.espn.com/apis/site/v2/sports/",
  STANDINGS: "https://site.api.espn.com/apis/v2/sports/",
  RESULTS_TTL: 300,
  STANDINGS_TTL: 1800,
  MAX_LEAGUES: 8,
  MAX_RESULTS: 14,
  MAX_RESULTS_COMPETITION: 24,
};

// kind: "team" (partite a squadre), "tennis", "racing", "golf", "mma". std: schema colonne della classifica.
const SPORTS_LEAGUES_ = {
  seriea: { path: "soccer/ita.1", name: "Serie A", kind: "team", std: "soccer" },
  serieb: { path: "soccer/ita.2", name: "Serie B", kind: "team", std: "soccer" },
  coppaitalia: { path: "soccer/ita.coppa_italia", name: "Coppa Italia", kind: "team", std: "" },
  champions: { path: "soccer/uefa.champions", name: "Champions League", kind: "team", std: "soccer" },
  europa: { path: "soccer/uefa.europa", name: "Europa League", kind: "team", std: "soccer" },
  premier: { path: "soccer/eng.1", name: "Premier League", kind: "team", std: "soccer" },
  laliga: { path: "soccer/esp.1", name: "LaLiga", kind: "team", std: "soccer" },
  bundesliga: { path: "soccer/ger.1", name: "Bundesliga", kind: "team", std: "soccer" },
  ligue1: { path: "soccer/fra.1", name: "Ligue 1", kind: "team", std: "soccer" },
  mondiali: { path: "soccer/fifa.world", name: "Mondiali", kind: "team", std: "" },
  europei: { path: "soccer/uefa.euro", name: "Europei", kind: "team", std: "" },
  nba: { path: "basketball/nba", name: "NBA", kind: "team", std: "basket" },
  euroleague: { path: "basketball/euroleague", name: "EuroLeague", kind: "team", std: "" },
  atp: { path: "tennis/atp", name: "ATP", kind: "tennis", std: "" },
  wta: { path: "tennis/wta", name: "WTA", kind: "tennis", std: "" },
  f1: { path: "racing/f1", name: "Formula 1", kind: "racing", std: "drivers" },
  indycar: { path: "racing/irl", name: "IndyCar", kind: "racing", std: "drivers" },
  nascar: { path: "racing/nascar-premier", name: "NASCAR", kind: "racing", std: "" },
  sixnations: { path: "rugby/180659", name: "Sei Nazioni", kind: "team", std: "rugby" },
  rugbyworld: { path: "rugby/164205", name: "Mondiali di rugby", kind: "team", std: "" },
  pga: { path: "golf/pga", name: "PGA Tour", kind: "golf", std: "" },
  ufc: { path: "mma/ufc", name: "UFC", kind: "mma", std: "" },
  mlb: { path: "baseball/mlb", name: "MLB", kind: "team", std: "baseball" },
  nfl: { path: "football/nfl", name: "NFL", kind: "team", std: "nfl" },
  nhl: { path: "hockey/nhl", name: "NHL", kind: "team", std: "hockey" },
};

// Nomi delle competizioni proposte nell'app (in minuscolo) -> leghe.
const SPORTS_ALIASES_ = {
  "serie a": ["seriea"], "serie b": ["serieb"], "coppa italia": ["coppaitalia"],
  "champions league": ["champions"], "europa league": ["europa"], "premier league": ["premier"],
  "laliga": ["laliga"], "bundesliga": ["bundesliga"], "ligue 1": ["ligue1"],
  "mondiali": ["mondiali"], "europei": ["europei"],
  "nba": ["nba"], "euroleague": ["euroleague"],
  "australian open": ["atp", "wta"], "roland garros": ["atp", "wta"], "wimbledon": ["atp", "wta"],
  "us open": ["atp", "wta"], "atp finals": ["atp"],
  "formula 1": ["f1"], "indycar": ["indycar"], "nascar": ["nascar"],
  "sei nazioni": ["sixnations"], "mondiali di rugby": ["rugbyworld"],
  "masters": ["pga"], "pga tour": ["pga"], "ryder cup": ["pga"],
  "ufc": ["ufc"], "mma": ["ufc"],
  "mlb": ["mlb"], "nfl": ["nfl"], "super bowl": ["nfl"], "nhl": ["nhl"],
};

// Alcune competizioni sono eventi di un circuito: si filtra per nome dell'evento.
const SPORTS_EVENT_FILTER_ = {
  "australian open": ["australian"], "roland garros": ["french open", "roland"], "wimbledon": ["wimbledon"],
  "us open": ["us open"], "atp finals": ["finals"], "masters": ["masters"], "ryder cup": ["ryder"], "super bowl": ["super bowl"],
};

// Leghe mostrate quando si sceglie lo sport (o lo sport senza competizioni specifiche).
const SPORTS_DEFAULTS_ = {
  football: ["seriea", "champions", "premier", "laliga", "bundesliga", "europa", "serieb", "ligue1"],
  basketball: ["nba", "euroleague"],
  tennis: ["atp", "wta"],
  rugby: ["sixnations", "rugbyworld"],
  formula1: ["f1"],
  motorother: ["indycar", "nascar"],
  golf: ["pga"],
  boxing: ["ufc"],
  baseball: ["mlb"],
  americanfootball: ["nfl"],
  hockey: ["nhl"],
};

const SPORTS_SESSIONS_ = {
  fp1: "Prove libere 1", fp2: "Prove libere 2", fp3: "Prove libere 3", qual: "Qualifiche", race: "Gara",
  sprint: "Sprint", "sprint qualifying": "Qualifiche Sprint", "sprint shootout": "Qualifiche Sprint",
};

// Colonne delle classifiche: [etichetta, nome statistica ESPN, alternative].
const SPORTS_COLUMNS_ = {
  soccer: [["PG", "gamesPlayed"], ["V", "wins"], ["N", "ties"], ["P", "losses"], ["DR", "pointDifferential"], ["Pt", "points"]],
  basket: [["V", "wins"], ["P", "losses"], ["%", "winPercent", "leagueWinPercent"], ["GB", "gamesBehind"]],
  hockey: [["PG", "gamesPlayed"], ["V", "wins"], ["P", "losses"], ["OT", "otLosses"], ["Pt", "points"]],
  baseball: [["V", "wins"], ["P", "losses"], ["%", "winPercent", "leagueWinPercent"], ["GB", "gamesBehind"]],
  nfl: [["V", "wins"], ["P", "losses"], ["N", "ties"], ["%", "winPercent", "leagueWinPercent"]],
  rugby: [["PG", "gamesPlayed"], ["V", "gamesWon", "wins"], ["N", "gamesDrawn", "ties"], ["P", "gamesLost", "losses"], ["DR", "pointsDifference", "pointDifferential"], ["Pt", "points"]],
  drivers: [["Pt", "championshipPts", "points"]],
};

/* ---------- Normalizzazione (funzioni pure, senza servizi Google) ---------- */

function sportsState_(status) {
  const state = status && status.type && status.type.state;
  return state === "in" ? "live" : state === "post" ? "finished" : "scheduled";
}

function sportsNumber_(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return isFinite(n) ? n : null;
}

function sportsName_(competitor) {
  if (!competitor) return "";
  const t = competitor.team || {};
  const a = competitor.athlete || {};
  return String(t.displayName || t.shortDisplayName || t.name || a.displayName || a.fullName || "").trim();
}

function sportsTeamMatch_(event, league) {
  const comp = (event.competitions || [])[0];
  const list = comp && comp.competitors || [];
  const home = list.filter((c) => c.homeAway === "home")[0] || list[0];
  const away = list.filter((c) => c.homeAway === "away")[0] || list[1];
  if (!home || !away || home === away) return null;
  const status = sportsState_(event.status);
  const live = status === "live";
  return {
    competitionName: league.name,
    status,
    kickoffAt: event.date || comp.date || "",
    homeTeam: sportsName_(home),
    awayTeam: sportsName_(away),
    homeScore: status === "scheduled" ? null : sportsNumber_(home.score),
    awayScore: status === "scheduled" ? null : sportsNumber_(away.score),
    detail: live ? String((event.status.type && (event.status.type.shortDetail || event.status.type.detail)) || "") : "",
  };
}

function sportsTennisMatches_(event, league, filters) {
  const eventName = String(event.name || "");
  if (filters.length && !filters.some((f) => eventName.toLowerCase().indexOf(f) !== -1)) return [];
  const out = [];
  (event.groupings || []).forEach((group) => {
    const label = String((group.grouping && (group.grouping.displayName || group.grouping.slug)) || "");
    if (!/singles|singolo/i.test(label)) return;
    (group.competitions || []).forEach((m) => {
      const players = m.competitors || [];
      if (players.length !== 2) return;
      const a = players[0];
      const b = players[1];
      const status = sportsState_(m.status);
      const la = (a.linescores || []).map((s) => sportsNumber_(s.value));
      const lb = (b.linescores || []).map((s) => sportsNumber_(s.value));
      let setsA = 0;
      let setsB = 0;
      const sets = [];
      for (let i = 0; i < Math.min(la.length, lb.length); i++) {
        if (la[i] === null || lb[i] === null) continue;
        if (la[i] > lb[i]) setsA++; else if (lb[i] > la[i]) setsB++;
        sets.push(la[i] + "-" + lb[i]);
      }
      out.push({
        competitionName: league.name + " · " + eventName,
        status,
        kickoffAt: m.date || m.startDate || event.date || "",
        homeTeam: sportsName_(a),
        awayTeam: sportsName_(b),
        homeScore: status === "scheduled" ? null : setsA,
        awayScore: status === "scheduled" ? null : setsB,
        detail: sets.join(" "),
      });
    });
  });
  return out.filter((m) => m.homeTeam && m.awayTeam);
}

function sportsPodium_(competition, withScore) {
  const rows = (competition.competitors || []).slice().sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999)).slice(0, 3);
  return rows.map((c, i) => {
    const name = sportsName_(c);
    if (!name) return "";
    const score = withScore && c.score !== undefined && c.score !== "" ? " (" + c.score + ")" : "";
    return (i + 1) + ". " + name + score;
  }).filter(Boolean).join(" · ");
}

function sportsRacing_(event, league) {
  const comps = event.competitions || [];
  const sessionName = (c) => {
    const raw = String((c.type && (c.type.abbreviation || c.type.text)) || "").trim();
    return SPORTS_SESSIONS_[raw.toLowerCase()] || raw;
  };
  const finished = comps.filter((c) => sportsState_(c.status) === "finished" && (c.competitors || []).length > 0);
  const live = comps.filter((c) => sportsState_(c.status) === "live")[0];
  const next = comps.filter((c) => sportsState_(c.status) !== "finished" && c !== live)[0];
  const last = finished[finished.length - 1];
  const parts = [];
  if (live) parts.push("In corso: " + (sessionName(live) || "sessione"));
  if (last) parts.push((sessionName(last) || "Ultima sessione") + ": " + sportsPodium_(last, false));
  if (next) parts.push("Prossima sessione: " + (sessionName(next) || "da definire"));
  return {
    competitionName: league.name,
    status: live ? "live" : next ? "scheduled" : "finished",
    kickoffAt: (live && live.date) || (next && next.date) || (last && last.date) || event.date || "",
    title: String(event.name || league.name),
    detail: parts.join(" — "),
  };
}

function sportsGolf_(event, league) {
  const comp = (event.competitions || [])[0] || {};
  const status = sportsState_(event.status);
  return {
    competitionName: league.name,
    status,
    kickoffAt: event.date || "",
    title: String(event.name || league.name),
    detail: status === "scheduled" ? "" : sportsPodium_(comp, true),
  };
}

function sportsMma_(event, league) {
  const comps = event.competitions || [];
  const main = comps[comps.length - 1] || {};
  const fighters = main.competitors || [];
  const status = sportsState_(event.status);
  let detail = "";
  if (fighters.length === 2) {
    detail = "Evento principale: " + sportsName_(fighters[0]) + " vs " + sportsName_(fighters[1]);
    const winner = fighters.filter((c) => c.winner === true)[0];
    if (winner && sportsState_(main.status) === "finished") detail += " — vince " + sportsName_(winner);
  }
  return { competitionName: league.name, status, kickoffAt: event.date || "", title: String(event.name || league.name), detail };
}

function sportsNormalizeScoreboard_(json, league, filters) {
  const events = (json && json.events) || [];
  const out = [];
  events.forEach((event) => {
    if (league.kind === "team") {
      const m = sportsTeamMatch_(event, league);
      if (m) out.push(m);
    } else if (league.kind === "tennis") {
      sportsTennisMatches_(event, league, filters || []).forEach((m) => out.push(m));
    } else if (league.kind === "racing") {
      out.push(sportsRacing_(event, league));
    } else if (league.kind === "golf") {
      out.push(sportsGolf_(event, league));
    } else if (league.kind === "mma") {
      out.push(sportsMma_(event, league));
    }
  });
  if (league.kind === "tennis" && out.length > 30) {
    out.sort((a, b) => sportsRank_(a) - sportsRank_(b));
    return out.slice(0, 30);
  }
  return out;
}

function sportsStat_(entry, names) {
  const stats = entry.stats || [];
  for (let n = 0; n < names.length; n++) {
    for (let i = 0; i < stats.length; i++) {
      if (stats[i].name === names[n]) {
        const shown = stats[i].displayValue;
        if (shown !== undefined && shown !== null && shown !== "") return String(shown);
        return stats[i].value === undefined || stats[i].value === null ? null : String(stats[i].value);
      }
    }
  }
  return null;
}

function sportsNormalizeStandings_(json, league) {
  const columns = SPORTS_COLUMNS_[league.std];
  if (!columns || !json) return [];
  const groups = json.children && json.children.length ? json.children : [json];
  const out = [];
  groups.forEach((group) => {
    const entries = (group.standings && group.standings.entries) || [];
    if (!entries.length) return;
    const rows = entries.map((entry, index) => {
      const rank = sportsNumber_(sportsStat_(entry, ["rank"])) || sportsNumber_(sportsStat_(entry, ["playoffSeed"]));
      return {
        sort: rank === null ? index + 1 : rank,
        position: rank === null ? index + 1 : rank,
        teamName: sportsName_(entry),
        stats: columns.map((c) => ({ label: c[0], value: sportsStat_(entry, c.slice(1)) })),
      };
    }).filter((r) => r.teamName);
    rows.sort((a, b) => a.sort - b.sort);
    rows.forEach((r) => { delete r.sort; });
    out.push({ groupName: groups.length > 1 ? String(group.name || "") : "", rows });
  });
  return out;
}

/* ---------- Scelta delle leghe e recupero dal browser ---------- */

const CACHE_PREFIX = "cyber-pulse.sports.";
const FETCH_TIMEOUT_MS = 8000;

function sportsLeagueKeys_(o) {
  const out = [];
  const add = (list) => list.forEach((k) => { if (SPORTS_LEAGUES_[k] && out.indexOf(k) === -1) out.push(k); });
  if (o.type === "competition") {
    add(SPORTS_ALIASES_[o.category] || []);
  } else if (o.type === "sport") {
    add(SPORTS_DEFAULTS_[o.category] || []);
  } else if (o.type !== "country") {
    o.competitions.forEach((name) => add(SPORTS_ALIASES_[name] || []));
    o.sports.forEach((id) => add(SPORTS_DEFAULTS_[id] || []));
  }
  return out.slice(0, SPORTS_.MAX_LEAGUES);
}

function sportsDateParam_(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
}

function sportsMatchesTeam_(match, team) {
  return [match.homeTeam, match.awayTeam, match.title].join(" ").toLowerCase().indexOf(team) !== -1;
}

function sportsRank_(match) {
  if (match.status === "live") return -1;
  const when = new Date(match.kickoffAt).getTime();
  return isFinite(when) ? Math.abs(when - Date.now()) : Number.MAX_VALUE;
}

function readCache(url, ttlMs) {
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_PREFIX + url) || "null");
    return entry && Date.now() - entry.t < ttlMs ? entry.v : null;
  } catch (error) {
    return null;
  }
}

function writeCache(url, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ t: Date.now(), v: value }));
  } catch (error) {
    // Spazio esaurito: si rimuovono le voci sport piu' vecchie e si riprova una volta.
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
    try { localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* ignorato */ }
  }
}

async function fetchJob(job, ttlSeconds) {
  const cached = readCache(job.url, ttlSeconds * 1000);
  if (cached) return cached;
  try {
    const response = await fetch(job.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), credentials: "omit" });
    if (!response.ok) {
      lastErrors.push(`HTTP ${response.status}`);
      return [];
    }
    const value = job.parse(await response.json());
    writeCache(job.url, value);
    return value;
  } catch (error) {
    lastErrors.push(error && error.name ? error.name : "errore di rete");
    return [];
  }
}

let lastErrors = [];

// Risultati e classifiche reali per Arena. Non lancia mai: in caso di problemi restituisce elenchi vuoti.
async function getSportsData(o) {
  const empty = { results: [], standings: [], liveCount: 0, sources: [] };
  try {
    const keys = sportsLeagueKeys_(o);
    if (!keys.length) return empty;
    const filters = o.type === "competition" ? (SPORTS_EVENT_FILTER_[o.category] || []) : [];

    const jobs = [];
    keys.forEach((key) => {
      const league = SPORTS_LEAGUES_[key];
      const parse = (json) => sportsNormalizeScoreboard_(json, league, filters);
      const base = SPORTS_.SITE + league.path + "/scoreboard";
      const daily = league.path.indexOf("soccer/") === 0 || key === "nba" || key === "nhl" || key === "mlb";
      if (daily) [-1, 0, 1].forEach((d) => jobs.push({ url: base + "?dates=" + sportsDateParam_(d), parse }));
      else jobs.push({ url: base, parse });
    });

    let standingsJob = null;
    if (o.type === "competition") {
      const key = keys.filter((k) => SPORTS_LEAGUES_[k].std)[0];
      if (key) {
        const league = SPORTS_LEAGUES_[key];
        standingsJob = { url: SPORTS_.STANDINGS + league.path + "/standings", parse: (json) => sportsNormalizeStandings_(json, league) };
      }
    }

    const [fetched, groups] = await Promise.all([
      Promise.all(jobs.map((job) => fetchJob(job, SPORTS_.RESULTS_TTL))),
      standingsJob ? fetchJob(standingsJob, SPORTS_.STANDINGS_TTL) : Promise.resolve([]),
    ]);

    let all = [];
    const seen = {};
    fetched.forEach((list) => (list || []).forEach((m) => {
      const id = [m.competitionName, m.kickoffAt, m.homeTeam, m.awayTeam, m.title].join("|");
      if (seen[id]) return;
      seen[id] = true;
      all.push(m);
    }));

    if (o.type === "team") all = all.filter((m) => sportsMatchesTeam_(m, o.category));
    const favorites = o.teams || [];
    all.sort((a, b) => {
      const fa = favorites.some((t) => sportsMatchesTeam_(a, t)) ? 0 : 1;
      const fb = favorites.some((t) => sportsMatchesTeam_(b, t)) ? 0 : 1;
      return o.type === "dashboard" && fa !== fb ? fa - fb : sportsRank_(a) - sportsRank_(b);
    });
    const limit = o.type === "competition" ? SPORTS_.MAX_RESULTS_COMPETITION : SPORTS_.MAX_RESULTS;
    const results = all.slice(0, limit);
    const standings = (groups || []).map((g) => ({ competitionName: o.label, groupName: g.groupName, rows: g.rows }));
    const has = results.length || standings.length;
    return { results, standings, liveCount: all.filter((m) => m.status === "live").length, sources: has ? ["ESPN"] : [], errors: lastErrors.slice(0, 3) };
  } catch (error) {
    return { ...empty, errors: [String(error && error.message || error)] };
  }
}

const list = (value) => (Array.isArray(value) ? value : []).map((v) => String(v).trim().toLowerCase()).filter(Boolean);

window.CyberPulseSports = Object.freeze({
  get({ categoryType, category, sports, competitions, teams }) {
    lastErrors = [];
    const label = String(category || "").trim();
    return getSportsData({
      type: categoryType || "dashboard",
      category: label.toLowerCase(),
      label,
      competitions: list(competitions),
      teams: list(teams),
      sports: list(sports),
    });
  },
});
})();

