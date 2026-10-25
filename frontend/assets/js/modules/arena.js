(() => {
  "use strict";

  const PREFS_KEY = "cyber-pulse.arena-preferences";
  const SPORTS = [
    ["football", "Calcio"],
    ["basketball", "Basket"],
    ["tennis", "Tennis"],
    ["volleyball", "Pallavolo"],
    ["rugby", "Rugby"],
    ["formula1", "Motori · Formula 1"],
    ["motogp", "Motori · MotoGP"],
    ["superbike", "Motori · Superbike"],
    ["rally", "Motori · Rally"],
    ["endurance", "Motori · Endurance"],
    ["motorother", "Motori · Altre serie"],
    ["cycling", "Ciclismo"],
    ["athletics", "Atletica"],
    ["swimming", "Nuoto"],
    ["winter", "Sport invernali"],
    ["golf", "Golf"],
    ["boxing", "Boxe e arti marziali"],
    ["baseball", "Baseball"],
    ["americanfootball", "Football americano"],
    ["hockey", "Hockey"],
    ["handball", "Pallamano"],
    ["padel", "Padel"],
    ["sailing", "Vela"],
    ["esports", "Esports"],
    ["other", "Altri sport"],
  ];
  // Il vecchio sport "Motori" è stato suddiviso: le preferenze già salvate vengono convertite.
  const LEGACY_SPORTS = { motorsport: ["formula1", "motogp", "superbike", "rally"] };
  const TYPES = [
    ["dashboard", "Dashboard"],
    ["competition", "Competizioni"],
    ["team", "Squadre del cuore"],
    ["sport", "Sport"],
    ["country", "Nazioni"],
  ];

  const state = { active: false, category: "dashboard", prefs: null, request: 0, last: null };
  let page;
  let pageTitle;
  let pageDescription;
  let pageMeta;
  let cards;
  let tabs;

  function readPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (!value || !Array.isArray(value.sports) || !Array.isArray(value.competitions) || !Array.isArray(value.teams)) return null;
      value.sports = [...new Set(value.sports.flatMap((id) => LEGACY_SPORTS[id] || [id]))];
      return value;
    } catch {
      return null;
    }
  }

  function writePreferences(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      return true;
    } catch {
      return false;
    }
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-arena-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-arena-styles";
    style.textContent = `
      .arena-page { padding-top: 32px; }
      .arena-page[hidden], #home-page[hidden] { display: none !important; }
      body[data-hub="arena"] #source-filter-button { display: none; }
      .arena-page-heading { margin: 0 0 8px; font-size: clamp(22px, 4vw, 28px); font-weight: 600; letter-spacing: -.3px; }
      .arena-page-description { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .arena-page-meta { min-height: 1.5em; margin: 8px 0 0; color: var(--text-muted); font-size: 12px; }
      .arena-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; align-items: start; }
      .arena-card { min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
      .arena-card.wide { grid-column: 1 / -1; }
      .arena-card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border); }
      .arena-card-title { margin: 0; font-size: 16px; font-weight: 600; }
      .arena-card-caption { color: var(--text-muted); font-size: 12px; }
      .arena-card-content { padding: 16px; }
      .arena-empty { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .arena-setup { display: grid; justify-items: start; gap: 12px; padding: 22px; border: 1px dashed var(--border); border-radius: var(--radius); background: var(--surface); }
      .arena-setup h2 { margin: 0; font-size: 18px; }
      .arena-setup p { max-width: 620px; margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .arena-settings-button { min-height: 42px; padding: 0 18px; border: 0; border-radius: 21px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; }
      .arena-settings-button:hover { filter: brightness(1.08); }
      .arena-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
      .arena-list-item { padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
      .arena-list-item:first-child { padding-top: 0; }
      .arena-list-item:last-child { padding-bottom: 0; border-bottom: 0; }
      .arena-table-wrap { overflow-x: auto; }
      .arena-table { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
      .arena-table th, .arena-table td { padding: 9px 8px; border-bottom: 1px solid var(--border); text-align: right; }
      .arena-table th:first-child, .arena-table td:first-child { text-align: center; }
      .arena-table th:nth-child(2), .arena-table td:nth-child(2) { text-align: left; }
      .arena-table td.arena-table-group { padding-top: 14px; color: var(--text-muted); font-weight: 600; text-align: left; }
      .arena-result { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
      .arena-result:last-child { border-bottom: 0; }
      .arena-result span:first-child { text-align: right; }
      .arena-result span:last-child { text-align: left; }
      .arena-score { font-size: 16px; font-weight: 700; white-space: nowrap; }
      .arena-live { color: #d93025; font-size: 11px; font-weight: 700; }
      .cp-arena-settings-form { display: grid; gap: 12px; }
      .cp-arena-settings-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .cp-arena-field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
      .cp-arena-field input, .cp-arena-field textarea { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 14px; }
      .cp-arena-field textarea { min-height: 86px; resize: vertical; }
      .cp-arena-sports { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .cp-arena-sport { display: flex; min-height: 40px; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; font-weight: 400; }
      .cp-arena-sport input { accent-color: var(--accent); }
      .cp-arena-settings-status { min-height: 1.4em; margin: 0; color: var(--text-muted); font-size: 13px; }
      @media (max-width: 700px) {
        .arena-page { padding-top: 24px; }
        .arena-cards { grid-template-columns: 1fr; gap: 12px; margin-top: 18px; }
        .arena-card.wide { grid-column: auto; }
        .cp-arena-settings-fields { grid-template-columns: 1fr; }
      }
    `;
    document.head.append(style);
  }

  function categories() {
    const list = [{ id: "dashboard", type: "dashboard", label: "Dashboard" }];
    const prefs = state.prefs;
    if (!prefs) return list;
    for (const [type, label] of TYPES.slice(1)) {
      const key = type === "competition" ? "competitions"
        : type === "team" ? "teams"
          : type === "country" ? "countries" : "sports";
      const items = prefs[key];
      for (const item of items || []) {
        const value = typeof item === "string" ? item : item.name;
        if (typeof value === "string" && value.trim()) {
          const label = type === "sport"
            ? (SPORTS.find(([id]) => id === value)?.[1] || value)
            : value.trim();
          list.push({ id: `${type}:${value}`, type, label });
        }
      }
    }
    return list;
  }

  function renderTabs() {
    const all = categories();
    const selected = all.some((item) => item.id === state.category) ? state.category : "dashboard";
    state.category = selected;
    const buttons = all.map((item) => {
      const button = document.createElement("button");
      button.className = "category-button";
      button.type = "button";
      button.dataset.arenaCategory = item.id;
      button.textContent = item.label;
      button.setAttribute("aria-pressed", String(item.id === selected));
      button.addEventListener("click", () => selectCategory(item.id));
      return button;
    });
    tabs.replaceChildren(...buttons);
    const dashboard = document.querySelector(".dashboard-button");
    dashboard?.removeAttribute("data-category");
    dashboard?.setAttribute("aria-label", "Dashboard Arena");
    dashboard?.setAttribute("aria-pressed", String(selected === "dashboard"));
  }

  function createCard(title, caption, { wide = false } = {}) {
    const card = document.createElement("section");
    card.className = `arena-card${wide ? " wide" : ""}`;
    const header = document.createElement("header");
    header.className = "arena-card-header";
    const heading = document.createElement("h2");
    heading.className = "arena-card-title";
    heading.textContent = title;
    header.append(heading);
    if (caption) {
      const note = document.createElement("span");
      note.className = "arena-card-caption";
      note.textContent = caption;
      header.append(note);
    }
    const body = document.createElement("div");
    body.className = "arena-card-content";
    card.append(header, body);
    return { card, body };
  }

  function emptyCard(body, text) {
    const message = document.createElement("p");
    message.className = "arena-empty";
    message.textContent = text;
    body.replaceChildren(message);
  }

  function renderSetup() {
    const setup = document.createElement("section");
    setup.className = "arena-setup";
    setup.innerHTML = "<h2>Configura la tua Arena</h2><p>Scegli gli sport, le competizioni, le squadre e le nazioni che vuoi seguire dalla sezione Arena nelle Impostazioni. Mostreremo solo notizie e dati disponibili dal backend, senza punteggi inventati o servizi sportivi esterni.</p>";
    const button = document.createElement("button");
    button.className = "arena-settings-button";
    button.type = "button";
    button.textContent = "Avvia la configurazione guidata";
    button.addEventListener("click", openWizard);
    setup.append(button);
    cards.replaceChildren(setup);
  }

  function renderEmptyDashboard() {
    const news = createCard("Notizie sportive", "Feed");
    emptyCard(news.body, "Le notizie sportive selezionate appariranno qui quando il backend Arena sarà disponibile.");
    const stats = createCard("Statistiche", "Selezione personale");
    emptyCard(stats.body, "Scegli sport e competizioni nelle Impostazioni per vedere qui le statistiche disponibili.");
    const curiosities = createCard("Curiosità", "Dal mondo dello sport");
    emptyCard(curiosities.body, "Qui appariranno curiosità brevi e verificate fornite dal backend.");
    const results = createCard("Risultati recenti", "Dati verificati");
    emptyCard(results.body, "Non ci sono ancora risultati forniti dal backend.");
    cards.replaceChildren(news.card, stats.card, curiosities.card, results.card);
  }

  function renderEmptyCategory(category) {
    const news = createCard(`Notizie · ${category.label}`, category.type === "team" ? "Squadra" : category.type === "competition" ? "Competizione" : category.label);
    emptyCard(news.body, "Le notizie di questa categoria appariranno qui quando saranno disponibili nel backend.");
    const stats = createCard(`Statistiche · ${category.label}`, "Dati ufficiali");
    emptyCard(stats.body, "Nessuna statistica disponibile dal backend per la selezione corrente.");
    const curiosities = createCard(`Curiosità · ${category.label}`, "Informazioni verificate");
    emptyCard(curiosities.body, "Nessuna curiosità disponibile dal backend per la selezione corrente.");
    const isCompetition = category.type === "competition";
    const data = createCard(isCompetition ? `Classifica · ${category.label}` : `Risultati · ${category.label}`, isCompetition ? "Solo questa competizione" : "Dati verificati");
    emptyCard(data.body, isCompetition
      ? "La classifica sarà mostrata qui solo quando il backend fornirà dati aggiornati per questa competizione."
      : "Nessun risultato fornito dal backend per la selezione corrente.");
    cards.replaceChildren(news.card, stats.card, curiosities.card, data.card);
  }

  async function loadCategory(category) {
    const sequence = ++state.request;
    const api = window.CyberPulseApi;
    const categoryData = categories().find((item) => item.id === category);
    if (!categoryData) return;
    state.category = category;
    saveView(category);
    renderTabs();
    pageTitle.textContent = categoryData.type === "dashboard" ? "Cyber Arena" : categoryData.label;
    pageDescription.textContent = categoryData.type === "dashboard"
      ? "Sport, squadre, competizioni e aggiornamenti scelti da te."
      : `${TYPES.find(([type]) => type === categoryData.type)?.[1] || "Arena"} seguiti nella tua Cyber Arena.`;
    if (!state.prefs) {
      renderSetup();
      pageMeta.textContent = "Imposta le tue preferenze Arena per iniziare.";
      return;
    }
    if (categoryData.type === "dashboard") renderEmptyDashboard();
    else renderEmptyCategory(categoryData);
    pageMeta.textContent = "Richiesta dati al backend Cyber Pulse…";
    try {
      const request = {
        categoryType: categoryData.type,
        category: categoryData.id === "dashboard" ? "" : categoryData.label,
        sports: state.prefs.sports,
        country: (state.prefs.countries || []).join(","),
        competitionIds: state.prefs.competitions,
        teamIds: state.prefs.teams,
      };
      const [data, sportsData] = await Promise.all([
        api.fetchArenaData(request),
        window.CyberPulseSports ? window.CyberPulseSports.get({ ...request, competitions: request.competitionIds, teams: request.teamIds }) : null,
      ]);
      if (sequence !== state.request) return;
      if (sportsData) {
        if (sportsData.errors && sportsData.errors.length) console.warn("ESPN non raggiungibile:", sportsData.errors.join(", "));
        data.results = sportsData.results;
        data.standings = sportsData.standings;
        if (sportsData.results.length) data.statistics.push({ label: "Risultati e partite", value: String(sportsData.results.length) });
        if (sportsData.liveCount) data.statistics.push({ label: "In corso adesso", value: String(sportsData.liveCount) });
      }
      state.last = { data, categoryData };
      renderPackage(data, categoryData);
    } catch (error) {
      if (sequence !== state.request) return;
      console.warn("Dati Arena non disponibili:", error.code || error.message);
      pageMeta.textContent = `Dati Arena non disponibili: ${error.message}`;
    }
  }

  function renderPackage(data, category) {
    if (!data || !Array.isArray(data.news) || !Array.isArray(data.statistics) || !Array.isArray(data.curiosities)
      || !Array.isArray(data.standings) || !Array.isArray(data.results)) {
      pageMeta.textContent = "Il backend non ha ancora pubblicato il pacchetto Arena previsto.";
      return;
    }
    const built = [];
    const news = createCard("Notizie sportive", category.type === "dashboard" ? "Selezione personale" : category.label, { wide: true });
    if (data.news.length === 0) emptyCard(news.body, "Nessuna notizia disponibile per questa selezione.");
    else {
      const list = document.createElement("div");
      list.className = "feed";
      list.style.marginTop = "0";
      const context = `Arena sport: ${category.type === "dashboard" ? "selezione personale" : category.label}`;
      const frontLayout = window.CyberPulseCards.getPrefs().layout === "front" && data.front && Array.isArray(data.front.stories) && window.CyberPulseFront;
      const shown = frontLayout
        ? window.CyberPulseFront.renderFront(list, data.front, { context })
        : (window.CyberPulseFront?.reset(list), window.CyberPulseCards.renderInto(list, data.news));
      if (shown === 0) emptyCard(news.body, "Tutte le notizie sono nascoste dai tuoi filtri di lettura.");
      else news.body.replaceChildren(list);
    }
    built.push(news.card);

    const stats = createCard("Statistiche", category.type === "dashboard" ? "Rilevanti e sintetiche" : category.label);
    if (data.statistics.length === 0) emptyCard(stats.body, "Nessuna statistica disponibile dal backend.");
    else {
      const list = document.createElement("ul");
      list.className = "arena-list";
      for (const entry of data.statistics) {
        const row = document.createElement("li");
        row.className = "arena-list-item";
        row.textContent = `${entry.label}: ${entry.value}`;
        list.append(row);
      }
      stats.body.replaceChildren(list);
    }
    built.push(stats.card);

    const curiosities = createCard("Curiosità", category.type === "dashboard" ? "Dal mondo dello sport" : category.label);
    if (data.curiosities.length === 0) emptyCard(curiosities.body, "Nessuna curiosità disponibile dal backend.");
    else {
      const list = document.createElement("ul");
      list.className = "arena-list";
      for (const entry of data.curiosities) {
        const row = document.createElement("li");
        row.className = "arena-list-item";
        row.textContent = typeof entry === "string" ? entry : entry.text || entry.title || "";
        list.append(row);
      }
      curiosities.body.replaceChildren(list);
    }
    built.push(curiosities.card);

    if (category.type === "competition") {
      const table = createCard(`Classifica · ${category.label}`, "Dati ESPN", { wide: true });
      const standings = data.standings.filter((item) => item.competitionName === category.label);
      renderStandings(table.body, standings);
      built.push(table.card);
    }
    const results = createCard("Risultati e partite", category.type === "dashboard" ? "Selezione personale" : category.label);
    renderResults(results.body, data.results);
    built.push(results.card);
    cards.replaceChildren(...built);
    pageMeta.textContent = data.generatedAt ? `Dati aggiornati ${formatDate(data.generatedAt)}.` : "Dati aggiornati dal backend.";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "orario non disponibile" : new Intl.DateTimeFormat("it", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function renderStandings(container, standings) {
    if (!standings.length) return emptyCard(container, "La classifica non è disponibile per questa competizione.");
    const wrap = document.createElement("div");
    wrap.className = "arena-table-wrap";
    const first = standings.flatMap((standing) => standing.rows || [])[0];
    const dynamic = Array.isArray(first?.stats);
    const labels = dynamic ? first.stats.map((stat) => stat.label) : ["PG", "V", "N", "P", "DR", "Pt"];
    const table = document.createElement("table");
    table.className = "arena-table";
    const head = document.createElement("thead");
    const header = document.createElement("tr");
    for (const label of ["#", dynamic && labels.length === 1 ? "Pilota / Team" : "Squadra", ...labels]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      header.append(th);
    }
    head.append(header);
    const body = document.createElement("tbody");
    for (const standing of standings) {
      if (standing.groupName && standings.length > 1) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = labels.length + 2;
        td.className = "arena-table-group";
        td.textContent = standing.groupName;
        tr.append(td);
        body.append(tr);
      }
      for (const row of standing.rows || []) {
        const tr = document.createElement("tr");
        const values = dynamic
          ? [row.position, row.teamName, ...row.stats.map((stat) => stat.value)]
          : [row.position, row.teamName, row.played, row.wins, row.draws, row.losses, row.goalDifference, row.points];
        for (const value of values) {
          const td = document.createElement("td");
          td.textContent = value == null ? "—" : String(value);
          tr.append(td);
        }
        body.append(tr);
      }
    }
    table.append(head, body);
    wrap.append(table);
    container.replaceChildren(wrap);
  }

  function renderResults(container, results) {
    if (!results.length) return emptyCard(container, "Nessun risultato o partita in programma per questa selezione.");
    const fragment = document.createDocumentFragment();
    for (const match of results) {
      const group = document.createElement("div");
      group.className = "arena-list-item";
      const meta = document.createElement("p");
      meta.className = "arena-page-meta";
      const when = match.status === "live" ? "IN CORSO" : match.status === "finished" ? "Terminata" : formatDate(match.kickoffAt);
      meta.textContent = `${match.competitionName || "Competizione"} · ${when}`;
      if (match.status === "live") meta.classList.add("arena-live");
      group.append(meta);
      if (match.title) {
        const title = document.createElement("strong");
        title.textContent = match.title;
        group.append(title);
      } else {
        const row = document.createElement("div");
        row.className = "arena-result";
        const home = document.createElement("span");
        home.textContent = match.homeTeam || "—";
        const score = document.createElement("span");
        score.className = "arena-score";
        score.textContent = match.homeScore == null || match.awayScore == null ? "—" : `${match.homeScore} – ${match.awayScore}`;
        const away = document.createElement("span");
        away.textContent = match.awayTeam || "—";
        row.append(home, score, away);
        group.append(row);
      }
      if (match.detail) {
        const detail = document.createElement("p");
        detail.className = "arena-page-meta";
        detail.textContent = match.detail;
        group.append(detail);
      }
      fragment.append(group);
    }
    container.replaceChildren(fragment);
  }

  function renderPreferencesForm() {
    const form = document.createElement("form");
    form.className = "cp-arena-settings-form";
    const hint = document.createElement("p");
    hint.className = "cp-settings-hint";
    hint.textContent = "Seleziona gli sport e inserisci competizioni, squadre e nazioni che vuoi seguire. I dati saranno salvati solo in questo browser.";

    const sportGroup = document.createElement("fieldset");
    sportGroup.className = "cp-ai-levels";
    const legend = document.createElement("legend");
    legend.className = "cp-ai-legend";
    legend.textContent = "Sport preferiti";
    const options = document.createElement("div");
    options.className = "cp-arena-sports";
    for (const [id, label] of SPORTS) {
      const option = document.createElement("label");
      option.className = "cp-arena-sport";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.name = "sports";
      check.value = id;
      option.append(check, document.createTextNode(label));
      options.append(option);
    }
    sportGroup.append(legend, options);

    const fields = document.createElement("div");
    fields.className = "cp-arena-settings-fields";
    const country = createPreferenceInput(fields, "Nazioni preferite", "countries", "Es. Italia, Francia", "text");
    const competitions = createPreferenceInput(fields, "Competizioni preferite", "competitions", "Una competizione per riga", "textarea");
    const teams = createPreferenceInput(fields, "Squadre del cuore", "teams", "Una squadra per riga", "textarea");

    const status = document.createElement("p");
    status.className = "cp-arena-settings-status";
    status.setAttribute("role", "status");
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "cp-choice";
    save.textContent = "Salva preferenze Arena";

    form.append(hint, sportGroup, fields, save, status);
    const current = readPreferences();
    if (current) {
      for (const check of form.querySelectorAll('input[name="sports"]')) check.checked = current.sports.includes(check.value);
      country.value = (current.countries || []).join(", ");
      competitions.value = current.competitions.map((item) => typeof item === "string" ? item : item.name).join("\n");
      teams.value = current.teams.map((item) => typeof item === "string" ? item : item.name).join("\n");
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const prefs = {
        sports: [...form.querySelectorAll('input[name="sports"]:checked')].map((input) => input.value),
        countries: country.value.split(",").map((value) => value.trim()).filter(Boolean),
        competitions: competitions.value.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
        teams: teams.value.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
      };
      if (prefs.sports.length === 0) {
        status.textContent = "Seleziona almeno uno sport.";
        return;
      }
      if (!writePreferences(prefs)) {
        status.textContent = "Non è stato possibile salvare le preferenze in questo browser.";
        return;
      }
      state.prefs = prefs;
      renderTabs();
      status.textContent = "Preferenze Arena salvate.";
      if (state.active) loadCategory(state.category);
    });
    return form;
  }

  function createPreferenceInput(parent, labelText, name, placeholder, type) {
    const label = document.createElement("label");
    label.className = "cp-arena-field";
    label.append(document.createTextNode(labelText));
    const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    input.name = name;
    input.placeholder = placeholder;
    label.append(input);
    parent.append(label);
    return input;
  }

  function buildSettingsPanel() {
    const section = document.createElement("section");
    section.id = "arena-preferences-section";
    section.className = "cp-settings-section";
    section.append(renderPreferencesForm());
    return section;
  }

  const WIZARD_COMPETITIONS = {
    football: ["Serie A", "Serie B", "Coppa Italia", "Champions League", "Europa League", "Premier League", "LaLiga", "Bundesliga", "Ligue 1", "Mondiali", "Europei"],
    basketball: ["Lega Basket Serie A", "NBA", "EuroLeague"],
    tennis: ["Australian Open", "Roland Garros", "Wimbledon", "US Open", "ATP Finals"],
    volleyball: ["SuperLega", "Serie A1 femminile", "Champions League volley"],
    formula1: ["Formula 1", "Formula 2", "Formula 3"],
    motogp: ["MotoGP", "Moto2", "Moto3"],
    superbike: ["Superbike", "Supersport"],
    rally: ["WRC", "Rally Dakar", "Campionato Italiano Rally"],
    endurance: ["24 Ore di Le Mans", "WEC", "IMSA"],
    motorother: ["Formula E", "IndyCar", "NASCAR", "DTM", "Karting"],
    rugby: ["Sei Nazioni", "Top 14", "Premiership Rugby", "Mondiali di rugby"],
    cycling: ["Giro d'Italia", "Tour de France", "Vuelta", "Mondiali di ciclismo", "Classiche monumento"],
    athletics: ["Diamond League", "Mondiali di atletica", "Maratona"],
    swimming: ["Mondiali di nuoto", "Europei di nuoto"],
    winter: ["Coppa del Mondo di sci", "Biathlon", "Olimpiadi invernali"],
    golf: ["Masters", "Ryder Cup", "PGA Tour"],
    boxing: ["Boxe professionistica", "UFC", "MMA"],
    baseball: ["MLB"],
    americanfootball: ["NFL", "Super Bowl"],
    hockey: ["NHL", "Hockey su ghiaccio"],
    handball: ["Pallamano Serie A", "Champions League pallamano"],
    padel: ["Premier Padel"],
    sailing: ["America's Cup", "SailGP"],
    esports: ["League of Legends", "Counter-Strike", "Valorant"],
    other: ["Olimpiadi", "Paralimpiadi"],
  };
  const WIZARD_TEAMS = {
    football: ["Juventus", "Inter", "Milan", "Napoli", "Roma", "Lazio", "Atalanta", "Fiorentina", "Nazionale italiana"],
    basketball: ["Olimpia Milano", "Virtus Bologna"],
    tennis: ["Jannik Sinner"],
    volleyball: ["Nazionale volley"],
    formula1: ["Ferrari", "Red Bull", "McLaren", "Mercedes"],
    motogp: ["Ducati", "Marc Marquez", "Francesco Bagnaia"],
    superbike: ["Ducati", "Nicolò Bulega"],
    rugby: ["Nazionale rugby"],
    cycling: ["Tadej Pogačar", "Jonathan Milan"],
    athletics: ["Marcell Jacobs", "Gianmarco Tamberi"],
    swimming: ["Thomas Ceccon", "Gregorio Paltrinieri"],
    other: [],
  };

  function addWizardStyles() {
    if (document.querySelector("#cyber-pulse-arena-wizard-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-arena-wizard-styles";
    style.textContent = `
      .arena-wizard { width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 24px); padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); }
      .arena-wizard::backdrop { background: rgba(0, 0, 0, .5); }
      .arena-wizard form { display: grid; gap: 14px; padding: 22px; }
      .arena-wizard h2 { margin: 0; font-size: 20px; }
      .arena-wizard p { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .arena-wizard-step { color: var(--text-muted); font-size: 12px; font-weight: 600; }
      .arena-wizard-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .arena-wizard-chip { min-height: 36px; padding: 0 14px; border: 1px solid var(--border); border-radius: 18px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-size: 13px; }
      .arena-wizard-chip[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
      .arena-wizard-add { display: flex; gap: 8px; }
      .arena-wizard-add input { flex: 1; min-width: 0; min-height: 42px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-muted); color: var(--text); font: inherit; font-size: 14px; }
      .arena-wizard-actions { display: flex; justify-content: space-between; gap: 8px; }
      .arena-wizard-actions button { min-height: 42px; padding: 0 18px; border: 1px solid var(--border); border-radius: 21px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; }
      .arena-wizard-actions .primary { border: 0; background: var(--accent); color: var(--on-accent); }
      .arena-wizard-error { min-height: 1.4em; color: #d93025; font-size: 13px; }
    `;
    document.head.append(style);
  }

  // Procedura guidata al primo avvio: sport, nazione, competizioni, squadre. Ogni passo si può saltare tranne gli sport.
  function openWizard() {
    addWizardStyles();
    document.querySelector("#arena-wizard")?.remove();
    const picked = { sports: [], countries: [], competitions: [], teams: [] };
    const current = readPreferences();
    if (current) {
      picked.sports = [...current.sports];
      picked.countries = [...(current.countries || [])];
      picked.competitions = current.competitions.map((item) => (typeof item === "string" ? item : item.name));
      picked.teams = current.teams.map((item) => (typeof item === "string" ? item : item.name));
    }

    const dialog = document.createElement("dialog");
    dialog.id = "arena-wizard";
    dialog.className = "arena-wizard";
    dialog.setAttribute("aria-labelledby", "arena-wizard-title");
    const form = document.createElement("form");
    form.method = "dialog";
    dialog.append(form);

    const steps = [
      {
        key: "sports",
        title: "Quali sport segui?",
        text: "Scegli almeno uno sport: la tua Arena parte da qui.",
        options: () => SPORTS.map(([id, label]) => [id, label]),
        custom: false,
      },
      {
        key: "countries",
        title: "Qual è la tua nazione preferita?",
        text: "Daremo risalto alle notizie sportive che la riguardano. Puoi aggiungerne più di una oppure saltare.",
        options: () => [["Italia", "Italia"]],
        custom: "Altra nazione",
      },
      {
        key: "competitions",
        title: "Quali campionati e competizioni preferisci?",
        text: "Seleziona dai suggerimenti o aggiungi i tuoi. Puoi anche saltare.",
        options: () => picked.sports.flatMap((sport) => WIZARD_COMPETITIONS[sport] || []).map((name) => [name, name]),
        custom: "Altra competizione",
      },
      {
        key: "teams",
        title: "Qual è la tua squadra del cuore?",
        text: "Seleziona dai suggerimenti o scrivi il nome di una o più squadre. Puoi anche saltare.",
        options: () => picked.sports.flatMap((sport) => WIZARD_TEAMS[sport] || []).map((name) => [name, name]),
        custom: "Altra squadra o atleta",
      },
    ];
    let index = 0;

    function render() {
      const step = steps[index];
      const stepLabel = document.createElement("span");
      stepLabel.className = "arena-wizard-step";
      stepLabel.textContent = `Passo ${index + 1} di ${steps.length}`;
      const title = document.createElement("h2");
      title.id = "arena-wizard-title";
      title.textContent = step.title;
      const text = document.createElement("p");
      text.textContent = step.text;

      const chips = document.createElement("div");
      chips.className = "arena-wizard-chips";
      const list = picked[step.key];
      const addChip = (value, label) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "arena-wizard-chip";
        chip.textContent = label;
        chip.setAttribute("aria-pressed", String(list.includes(value)));
        chip.addEventListener("click", () => {
          const at = list.indexOf(value);
          if (at >= 0) list.splice(at, 1);
          else list.push(value);
          chip.setAttribute("aria-pressed", String(at < 0));
        });
        chips.append(chip);
      };
      const known = new Set();
      for (const [value, label] of step.options()) {
        if (known.has(value)) continue;
        known.add(value);
        addChip(value, label);
      }
      for (const value of list) {
        if (!known.has(value)) {
          known.add(value);
          addChip(value, value);
        }
      }

      const error = document.createElement("p");
      error.className = "arena-wizard-error";
      error.setAttribute("role", "alert");

      const parts = [stepLabel, title, text, chips];
      if (step.custom) {
        const add = document.createElement("div");
        add.className = "arena-wizard-add";
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 60;
        input.placeholder = step.custom;
        input.setAttribute("aria-label", step.custom);
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "arena-wizard-chip";
        addButton.textContent = "Aggiungi";
        const commit = () => {
          const value = input.value.trim();
          if (!value) return;
          if (!list.includes(value)) list.push(value);
          input.value = "";
          render();
        };
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

      const actions = document.createElement("div");
      actions.className = "arena-wizard-actions";
      const back = document.createElement("button");
      back.type = "button";
      back.textContent = index === 0 ? "Annulla" : "Indietro";
      back.addEventListener("click", () => {
        if (index === 0) dialog.close();
        else {
          index -= 1;
          render();
        }
      });
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary";
      next.textContent = index === steps.length - 1 ? "Fine" : "Avanti";
      next.addEventListener("click", () => {
        if (step.key === "sports" && picked.sports.length === 0) {
          error.textContent = "Seleziona almeno uno sport.";
          return;
        }
        if (index < steps.length - 1) {
          index += 1;
          render();
          return;
        }
        if (!writePreferences({ ...picked })) {
          error.textContent = "Non è stato possibile salvare le preferenze in questo browser.";
          return;
        }
        state.prefs = readPreferences();
        dialog.close();
        renderTabs();
        if (state.active) loadCategory("dashboard");
        document.querySelector("#arena-preferences-section")?.replaceWith(buildSettingsPanel());
      });
      actions.append(back, next);
      parts.push(error, actions);
      form.replaceChildren(...parts);
      (step.custom ? form.querySelector("input") : chips.firstChild)?.focus();
    }

    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    render();
    dialog.showModal();
  }

  function saveView(tab) {
    try { sessionStorage.setItem("cyber-pulse.view", JSON.stringify({ hub: tab ? "arena" : "home", tab })); } catch { /* storage non disponibile */ }
  }

  function showArena(startCategory) {
    if (!window.CyberPulseAuth?.getUser()) return;
    const initialCategory = typeof startCategory === "string" ? startCategory : "dashboard";
    state.active = true;
    state.prefs = readPreferences();
    document.querySelector("#home-page").hidden = true;
    page.hidden = false;
    document.body.dataset.hub = "arena";
    document.querySelectorAll("[data-launcher-home], #open-arena").forEach((button) => {
      button.classList.toggle("current", button.id === "open-arena");
    });
    document.querySelector("#launcher")?.close();
    document.querySelector(".second-row")?.setAttribute("aria-label", "Categorie di Cyber Arena");
    state.category = initialCategory;
    renderTabs();
    loadCategory(state.category);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!state.prefs) {
      if (window.CyberPulse) promptArenaSettings();
      else document.addEventListener("cyberpulse:catalogready", promptArenaSettings, { once: true });
    }
  }

  function promptArenaSettings() {
    if (!state.active || state.prefs) return;
    window.setTimeout(openWizard, 0);
  }

  function showHome() {
    state.active = false;
    saveView("");
    state.request++;
    document.body.removeAttribute("data-hub");
    page.hidden = true;
    document.querySelector("#home-page").hidden = false;
    document.querySelectorAll("[data-launcher-home], #open-arena").forEach((button) => {
      button.classList.toggle("current", button.hasAttribute("data-launcher-home"));
    });
    const dashboard = document.querySelector(".dashboard-button");
    dashboard?.setAttribute("data-category", "all");
    dashboard?.setAttribute("aria-label", "Tutte le notizie");
    dashboard?.setAttribute("aria-pressed", "true");
    document.querySelector(".second-row")?.setAttribute("aria-label", "Categorie del feed");
    document.dispatchEvent(new CustomEvent("cyberpulse:categorychange", { detail: { category: "all" } }));
    document.dispatchEvent(new CustomEvent("cyberpulse:restorestrip"));
  }

  function init() {
    addStyles();
    const main = document.querySelector("#home");
    const homePage = document.createElement("div");
    homePage.id = "home-page";
    const existing = [...main.children];
    homePage.append(...existing);
    main.append(homePage);

    page = document.createElement("section");
    page.id = "arena-page";
    page.className = "arena-page";
    page.hidden = true;
    page.setAttribute("aria-labelledby", "arena-page-title");
    pageTitle = document.createElement("h1");
    pageTitle.id = "arena-page-title";
    pageTitle.className = "arena-page-heading";
    pageDescription = document.createElement("p");
    pageDescription.className = "arena-page-description";
    pageMeta = document.createElement("p");
    pageMeta.className = "arena-page-meta";
    pageMeta.setAttribute("role", "status");
    pageMeta.setAttribute("aria-live", "polite");
    cards = document.createElement("div");
    cards.className = "arena-cards";
    page.append(pageTitle, pageDescription, pageMeta, cards);
    main.append(page);
    tabs = document.querySelector("#category-strip");

    document.querySelector("#open-arena")?.addEventListener("click", () => showArena());
    const restore = () => {
      try {
        const view = JSON.parse(sessionStorage.getItem("cyber-pulse.view") || "null");
        if (view?.hub === "arena" && !state.active) showArena(String(view.tab || "dashboard"));
      } catch { /* vista non valida */ }
    };
    if (window.CyberPulseAuth?.getUser()) restore();
    else document.addEventListener("cyberpulse:signedin", restore, { once: true });
    document.querySelectorAll("[data-launcher-home]").forEach((button) => button.addEventListener("click", showHome));
    document.querySelector(".brand")?.addEventListener("click", (event) => {
      if (state.active) {
        event.preventDefault();
        showHome();
      }
    });
    document.querySelector(".dashboard-button")?.addEventListener("click", (event) => {
      if (state.active) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectCategory("dashboard");
      }
    }, true);
    window.CyberPulseSettings?.register({ id: "arena", group: "arena", title: "Sport e squadre", build: buildSettingsPanel });
    document.addEventListener("cyberpulse:catalogready", () => {
      state.prefs = readPreferences();
    });
    document.addEventListener("cyberpulse:aichange", () => {
      if (state.active) loadCategory(state.category);
    });
    document.addEventListener("cyberpulse:readingchange", () => {
      if (state.active && state.last) renderPackage(state.last.data, state.last.categoryData);
    });
  }

  function selectCategory(id) {
    if (!state.active) return;
    loadCategory(id);
  }

  window.CyberPulseArena = Object.freeze({ open: showArena, showHome, selectCategory });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
