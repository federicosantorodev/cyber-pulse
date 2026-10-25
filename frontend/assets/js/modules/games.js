/* Cyber Pulse - Hub Giochi (Cyber Games).
 * Solitario Klondike completo: pesca 1 o 3 carte, trascinamento, doppio tocco per mandare la carta alle basi,
 * annulla, suggerimento, completamento automatico, partita salvata nel browser e statistiche.
 * Funziona interamente offline, senza servizi esterni. */
(() => {
  "use strict";

  const GAME_KEY = "cyber-pulse.games.klondike";
  const STATS_KEY = "cyber-pulse.games.klondike-stats";
  const VIEW_KEY = "cyber-pulse.view";
  const HISTORY_MAX = 40;
  const UP_STEP = 0.3;
  const DOWN_STEP = 0.14;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const SUITS = [
    { id: "picche", sym: "♠\uFE0E", red: false },
    { id: "cuori", sym: "♥\uFE0E", red: true },
    { id: "quadri", sym: "♦\uFE0E", red: true },
    { id: "fiori", sym: "♣\uFE0E", red: false },
  ];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_NAMES = ["Asso", "Due", "Tre", "Quattro", "Cinque", "Sei", "Sette", "Otto", "Nove", "Dieci", "Fante", "Donna", "Re"];

  const ICONS = {
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    undo: "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z",
    hint: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z",
    play: "M8 5v14l11-7z",
    recycle: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
    trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  };

  const EXTRAS = Array.isArray(window.CyberPulseGamesExtra) ? window.CyberPulseGamesExtra : [];
  const TABS = [
    ["home", "Giochi"],
    ["klondike", "Solitario Klondike"],
    ...EXTRAS.map((extra) => [extra.id, extra.label]),
    ["stats", "Statistiche"],
  ];
  const extraPanels = new Map();
  const KLONDIKE_ICON = "M2.53 19.65l1.34.56v-9.03l-2.43 5.86c-.41 1.02.08 2.19 1.09 2.61zm19.5-3.7L17.07 3.98c-.31-.75-1.04-1.21-1.81-1.23-.26 0-.53.04-.79.15L7.1 5.95c-.75.31-1.21 1.03-1.23 1.8-.01.27.04.54.15.8l4.96 11.97c.31.76 1.05 1.22 1.83 1.23.26 0 .52-.05.77-.15l7.36-3.05c1.02-.42 1.51-1.59 1.09-2.6zM7.88 8.75c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-2 11c0 1.1.9 2 2 2h1.45l-3.45-8.34v6.34z";

  const ui = { active: false, tab: "home" };
  let homePanel;
  let page;
  let titleElement;
  let descriptionElement;
  let metaElement;
  let gamePanel;
  let statsPanel;
  let board;
  let movesLabel;
  let timeLabel;
  let undoButton;
  let autoButton;
  let drawSelect;
  let game;
  let selected = null;
  let lastTap = { key: "", t: 0 };
  let drag = null;
  let suppressClick = false;
  let auto = false;
  let hintTimer = 0;

  /* ---------- Utilita' ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(path) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    const shape = document.createElementNS(SVG_NS, "path");
    shape.setAttribute("d", path);
    shape.setAttribute("fill", "currentColor");
    svg.append(shape);
    return svg;
  }

  function button(label, path, handler, ghost = true) {
    const node = el("button", `gm-button${ghost ? " ghost" : ""}`);
    node.type = "button";
    if (path) node.append(icon(path));
    node.append(document.createTextNode(label));
    node.addEventListener("click", handler);
    return node;
  }

  function say(text) {
    metaElement.textContent = text;
  }

  function formatTime(total) {
    const s = Math.max(0, Math.floor(total || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  }

  function randomInt(n) {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(4294967296 / n) * n;
    do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
    return buffer[0] % n;
  }

  /* ---------- Stato e salvataggio ---------- */

  function deal(draw) {
    const deck = [];
    for (let s = 0; s < 4; s += 1) for (let r = 1; r <= 13; r += 1) deck.push({ s, r, u: false });
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const tab = [];
    for (let c = 0; c < 7; c += 1) {
      const column = deck.splice(-(c + 1));
      column[column.length - 1].u = true;
      tab.push(column);
    }
    return { stock: deck, waste: [], fan: 0, found: [[], [], [], []], tab, draw, moves: 0, seconds: 0, started: false, won: false, history: [] };
  }

  function validGame(value) {
    if (!value || !Array.isArray(value.stock) || !Array.isArray(value.waste) || !Array.isArray(value.found) || !Array.isArray(value.tab)) return false;
    if (value.found.length !== 4 || value.tab.length !== 7 || ![1, 3].includes(value.draw)) return false;
    const all = [...value.stock, ...value.waste, ...value.found.flat(), ...value.tab.flat()];
    if (all.length !== 52) return false;
    const seen = new Set(all.map((card) => `${card.s}:${card.r}`));
    return seen.size === 52 && all.every((card) => card.s >= 0 && card.s < 4 && card.r >= 1 && card.r <= 13);
  }

  function loadGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(GAME_KEY) || "null");
      if (validGame(saved)) {
        saved.history = Array.isArray(saved.history) ? saved.history : [];
        saved.fan = Number(saved.fan) || 0;
        return saved;
      }
    } catch { /* partita non valida */ }
    return deal(1);
  }

  function save() {
    try { localStorage.setItem(GAME_KEY, JSON.stringify(game)); } catch { /* storage non disponibile */ }
  }

  function emptyStats() {
    return { d1: { played: 0, won: 0, bestTime: 0, bestMoves: 0 }, d3: { played: 0, won: 0, bestTime: 0, bestMoves: 0 } };
  }

  function readStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
      const base = emptyStats();
      if (saved) for (const key of Object.keys(base)) Object.assign(base[key], saved[key] || {});
      return base;
    } catch {
      return emptyStats();
    }
  }

  function writeStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* storage non disponibile */ }
  }

  function pushHistory() {
    const { history, ...rest } = game;
    game.history.push(JSON.stringify(rest));
    if (game.history.length > HISTORY_MAX) game.history.shift();
  }

  /* ---------- Regole ---------- */

  function getRun(state, src) {
    if (src.t === "waste") return state.waste.length ? [state.waste[state.waste.length - 1]] : [];
    if (src.t === "found") {
      const pile = state.found[src.f];
      return pile.length ? [pile[pile.length - 1]] : [];
    }
    return state.tab[src.c].slice(src.i);
  }

  function canPlace(state, run, dest) {
    if (!run.length) return false;
    const first = run[0];
    if (dest.t === "found") return run.length === 1 && first.s === dest.f && first.r === state.found[dest.f].length + 1;
    const column = state.tab[dest.c];
    if (!column.length) return first.r === 13;
    const top = column[column.length - 1];
    return top.u && SUITS[top.s].red !== SUITS[first.s].red && top.r === first.r + 1;
  }

  function canMove(src, dest) {
    if (src.t === "tab" && dest.t === "tab" && src.c === dest.c) return false;
    if (src.t === "found" && dest.t === "found") return false;
    return canPlace(game, getRun(game, src), dest);
  }

  function applyMove(src, dest) {
    const run = getRun(game, src);
    pushHistory();
    if (src.t === "waste") {
      game.waste.pop();
      game.fan = game.waste.length ? Math.max(1, game.fan - 1) : 0;
    } else if (src.t === "found") {
      game.found[src.f].pop();
    } else {
      const column = game.tab[src.c];
      column.splice(src.i);
      if (column.length && !column[column.length - 1].u) column[column.length - 1].u = true;
    }
    if (dest.t === "found") game.found[dest.f].push(...run);
    else game.tab[dest.c].push(...run);
    game.moves += 1;
    game.started = true;
    clearSelection();
    if (game.found.every((pile) => pile.length === 13)) win();
    save();
  }

  function drawStock() {
    if (auto || game.won) return;
    if (!game.stock.length && !game.waste.length) return;
    pushHistory();
    if (game.stock.length) {
      const count = Math.min(game.draw, game.stock.length);
      for (let i = 0; i < count; i += 1) {
        const card = game.stock.pop();
        card.u = true;
        game.waste.push(card);
      }
      game.fan = count;
    } else {
      while (game.waste.length) {
        const card = game.waste.pop();
        card.u = false;
        game.stock.push(card);
      }
      game.fan = 0;
    }
    game.moves += 1;
    game.started = true;
    clearSelection();
    save();
    render();
  }

  function canAutoComplete() {
    return !game.won && !game.stock.length && !game.waste.length && game.tab.every((column) => column.every((card) => card.u));
  }

  function autoComplete() {
    if (auto || !canAutoComplete()) return;
    auto = true;
    const step = () => {
      if (!ui.active || game.won) {
        auto = false;
        render();
        return;
      }
      let moved = false;
      for (let c = 0; c < 7 && !moved; c += 1) {
        const column = game.tab[c];
        if (!column.length) continue;
        const src = { t: "tab", c, i: column.length - 1 };
        const dest = { t: "found", f: column[column.length - 1].s };
        if (canMove(src, dest)) {
          applyMove(src, dest);
          moved = true;
        }
      }
      render();
      if (moved) window.setTimeout(step, 110);
      else auto = false;
    };
    step();
  }

  function win() {
    game.won = true;
    const stats = readStats();
    const entry = stats[`d${game.draw}`];
    entry.played += 1;
    entry.won += 1;
    if (!entry.bestTime || game.seconds < entry.bestTime) entry.bestTime = game.seconds;
    if (!entry.bestMoves || game.moves < entry.bestMoves) entry.bestMoves = game.moves;
    writeStats(stats);
    if (statsPanel && !statsPanel.hidden) renderStats();
  }

  function newGame(draw) {
    if (game && game.started && !game.won) {
      const stats = readStats();
      stats[`d${game.draw}`].played += 1;
      writeStats(stats);
    }
    auto = false;
    clearSelection();
    game = deal(draw);
    dealing = true;
    lastWon = false;
    save();
    say("Nuova partita. Buon divertimento!");
    render();
  }

  function confirmAbandon() {
    return !game.started || game.won || game.moves === 0 || window.confirm("Abbandonare la partita in corso?");
  }

  function undo() {
    if (!game.history.length || game.won || auto) return;
    const previous = JSON.parse(game.history.pop());
    previous.history = game.history;
    previous.seconds = game.seconds;
    game = previous;
    clearSelection();
    save();
    render();
  }

  /* ---------- Suggerimenti e mosse automatiche ---------- */

  function srcKey(src) {
    if (src.t === "waste") return "waste";
    return src.t === "tab" ? `tab:${src.c}:${src.i}` : `found:${src.f}`;
  }

  function dropKey(dest) {
    return dest.t === "tab" ? `tab:${dest.c}` : `found:${dest.f}`;
  }

  function parseSrc(key) {
    const [t, a, b] = key.split(":");
    if (t === "waste") return { t };
    return t === "tab" ? { t, c: Number(a), i: Number(b) } : { t, f: Number(a) };
  }

  function parseDrop(key) {
    const [t, a] = key.split(":");
    return t === "tab" ? { t, c: Number(a) } : { t, f: Number(a) };
  }

  function smartMove(src) {
    const run = getRun(game, src);
    if (!run.length) return;
    const candidates = [];
    if (run.length === 1) candidates.push({ t: "found", f: run[0].s });
    let firstEmpty = -1;
    for (let c = 0; c < 7; c += 1) {
      if (game.tab[c].length) candidates.push({ t: "tab", c });
      else if (firstEmpty === -1) firstEmpty = c;
    }
    if (firstEmpty !== -1) candidates.push({ t: "tab", c: firstEmpty });
    for (const dest of candidates) {
      if (!canMove(src, dest)) continue;
      if (dest.t === "tab" && !game.tab[dest.c].length && src.t === "tab" && src.i === 0) continue;
      applyMove(src, dest);
      render();
      return;
    }
    say("Nessuna mossa possibile per questa carta.");
  }

  function meaningful(src, dest) {
    if (src.t === "waste") return true;
    const column = game.tab[src.c];
    if (src.i > 0) return !column[src.i - 1].u;
    return game.tab[dest.c].length > 0;
  }

  function findHint() {
    const sources = [];
    if (game.waste.length) sources.push({ t: "waste" });
    game.tab.forEach((column, c) => column.forEach((card, i) => { if (card.u) sources.push({ t: "tab", c, i }); }));
    for (const src of sources) {
      const run = getRun(game, src);
      if (run.length !== 1) continue;
      const dest = { t: "found", f: run[0].s };
      if (canMove(src, dest)) return { src, dest };
    }
    for (const src of sources) {
      for (let c = 0; c < 7; c += 1) {
        const dest = { t: "tab", c };
        if (canMove(src, dest) && meaningful(src, dest)) return { src, dest };
      }
    }
    return game.stock.length || game.waste.length ? { draw: true } : null;
  }

  function hint() {
    if (game.won || auto) return;
    const move = findHint();
    if (!move) {
      say("Nessuna mossa utile: prova Annulla o Nuova partita.");
      return;
    }
    window.clearTimeout(hintTimer);
    board.querySelectorAll(".hint").forEach((node) => node.classList.remove("hint"));
    if (move.draw) {
      say(game.stock.length ? "Pesca una carta dal mazzo." : "Rimetti gli scarti nel mazzo.");
      board.querySelector(".gm-stock")?.classList.add("hint");
    } else {
      say("Ecco una mossa possibile.");
      board.querySelector(`[data-src="${srcKey(move.src)}"]`)?.classList.add("hint");
      board.querySelector(`[data-drop="${dropKey(move.dest)}"]`)?.classList.add("hint");
    }
    hintTimer = window.setTimeout(() => board.querySelectorAll(".hint").forEach((node) => node.classList.remove("hint")), 2200);
  }

  /* ---------- Disegno ---------- */

  function cardElement(card, top, src) {
    const node = el("div", "gm-card");
    node.style.top = `calc(var(--ch) * ${top})`;
    if (card.s !== undefined) node.dataset.id = `${card.s}-${card.r}`;
    if (!card.u) {
      node.classList.add("back");
      return node;
    }
    const suit = SUITS[card.s];
    if (suit.red) node.classList.add("red");
    node.setAttribute("aria-label", `${RANK_NAMES[card.r - 1]} di ${suit.id}`);
    node.append(el("span", "gm-corner", `${RANKS[card.r - 1]}${suit.sym}`), el("span", "gm-pip", suit.sym));
    if (src) {
      node.dataset.src = src;
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      if (src === selected) node.classList.add("sel");
    }
    return node;
  }

  let flipOverride = null;
  let dealing = false;
  let lastWon = false;
  const EASE = "cubic-bezier(.2,.8,.2,1)";

  function reducedMotion() {
    return window.CyberPulseGamesMotion?.reduced() ?? false;
  }

  function snapshotCards() {
    const map = new Map();
    board.querySelectorAll(".gm-card[data-id]").forEach((node) => {
      const rect = node.getBoundingClientRect();
      map.set(node.dataset.id, { left: rect.left, top: rect.top, up: !node.classList.contains("back") });
    });
    if (flipOverride) {
      flipOverride.forEach((value, key) => map.set(key, value));
      flipOverride = null;
    }
    return map;
  }

  function ghostSnapshot(ghost) {
    const map = new Map();
    ghost.querySelectorAll(".gm-card[data-id]").forEach((node) => {
      const rect = node.getBoundingClientRect();
      map.set(node.dataset.id, { left: rect.left, top: rect.top, up: true });
    });
    return map;
  }

  function animateBoard(old) {
    const deal = dealing;
    dealing = false;
    if (reducedMotion() || (!old.size && !deal)) return;
    const stockBox = board.querySelector(".gm-stock").getBoundingClientRect();
    let index = 0;
    board.querySelectorAll(".gm-card[data-id]").forEach((node) => {
      const prev = old.get(node.dataset.id);
      const up = !node.classList.contains("back");
      const rect = node.getBoundingClientRect();
      const fromStock = deal || (!prev && node.closest(".gm-waste"));
      const from = fromStock ? stockBox : prev;
      const dx = from ? from.left - rect.left : 0;
      const dy = from ? from.top - rect.top : 0;
      if (dx || dy) {
        node.style.zIndex = "20";
        const start = `translate(${dx}px, ${dy}px)${fromStock && up ? " scaleX(.2)" : ""}`;
        const animation = node.animate([{ transform: start }, { transform: "none" }], {
          duration: deal ? 340 : 220,
          delay: deal ? index * 22 : 0,
          easing: EASE,
          fill: "backwards",
        });
        animation.onfinish = () => { node.style.zIndex = ""; };
        animation.oncancel = animation.onfinish;
      } else if (prev && prev.up !== up) {
        node.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 240, easing: EASE });
      }
      index += 1;
    });
  }

  function celebrate() {
    if (reducedMotion()) return;
    board.querySelector(".gm-banner")?.animate(
      [{ transform: "scale(.85)", opacity: 0 }, { transform: "scale(1.03)", opacity: 1 }, { transform: "scale(1)" }],
      { duration: 500, easing: EASE }
    );
    board.querySelectorAll(".gm-found .gm-card").forEach((node, i) => {
      node.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.3) rotate(-8deg)" }, { transform: "scale(1)" }],
        { duration: 600, delay: i * 130, easing: EASE }
      );
    });
  }

  function render() {
    if (!board) return;
    const old = board.childElementCount ? snapshotCards() : new Map();
    const parts = [];
    if (game.won) {
      const banner = el("div", "gm-banner");
      banner.append(icon(ICONS.trophy));
      banner.append(el("strong", "", `Hai vinto! ${game.moves} mosse in ${formatTime(game.seconds)}.`));
      banner.append(button("Nuova partita", ICONS.add, () => newGame(game.draw), false));
      parts.push(banner);
    }

    const stock = el("div", "gm-slot gm-stock");
    stock.tabIndex = 0;
    stock.setAttribute("role", "button");
    stock.setAttribute("aria-label", game.stock.length ? `Pesca dal mazzo, ${game.stock.length} carte rimaste` : game.waste.length ? "Rimetti gli scarti nel mazzo" : "Mazzo vuoto");
    if (game.stock.length) stock.append(cardElement({ u: false }, 0, null));
    else if (game.waste.length) stock.append(icon(ICONS.recycle));
    parts.push(stock);

    const waste = el("div", "gm-slot gm-waste");
    const shown = game.waste.length ? (game.draw === 3 ? Math.min(Math.max(game.fan, 1), game.waste.length, 3) : 1) : 0;
    for (let k = 0; k < shown; k += 1) {
      const card = game.waste[game.waste.length - shown + k];
      const node = cardElement(card, 0, k === shown - 1 ? "waste" : null);
      node.style.left = `calc(var(--cw) * ${k * 0.26})`;
      waste.append(node);
    }
    parts.push(waste, el("div", "gm-spacer"));

    for (let f = 0; f < 4; f += 1) {
      const slot = el("div", "gm-slot gm-found");
      slot.dataset.drop = `found:${f}`;
      slot.dataset.suit = SUITS[f].sym;
      slot.classList.toggle("red", SUITS[f].red);
      const pile = game.found[f];
      if (pile.length) slot.append(cardElement(pile[pile.length - 1], 0, `found:${f}`));
      parts.push(slot);
    }

    for (let c = 0; c < 7; c += 1) {
      const column = el("div", "gm-slot gm-col");
      column.dataset.drop = `tab:${c}`;
      let y = 0;
      game.tab[c].forEach((card, i) => {
        column.append(cardElement(card, y, card.u ? `tab:${c}:${i}` : null));
        if (i < game.tab[c].length - 1) y += card.u ? UP_STEP : DOWN_STEP;
      });
      column.style.height = `calc(var(--ch) * ${y + 1})`;
      parts.push(column);
    }

    board.replaceChildren(...parts);
    updateInfo();
    animateBoard(old);
    if (game.won && !lastWon) celebrate();
    lastWon = game.won;
  }

  function updateInfo() {
    movesLabel.textContent = String(game.moves);
    timeLabel.textContent = formatTime(game.seconds);
    undoButton.disabled = !game.history.length || game.won;
    autoButton.hidden = !canAutoComplete();
    drawSelect.value = String(game.draw);
  }

  function clearSelection() {
    selected = null;
  }

  /* ---------- Interazione ---------- */

  function onDown(event) {
    if (event.button > 0 || auto || game.won) return;
    const target = event.target.closest(".gm-card[data-src]");
    if (!target) return;
    drag = { src: parseSrc(target.dataset.src), key: target.dataset.src, el: target, x: event.clientX, y: event.clientY, moving: false, id: event.pointerId };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function startDrag(event) {
    const run = getRun(game, drag.src);
    const rect = drag.el.getBoundingClientRect();
    drag.dx = drag.x - rect.left;
    drag.dy = drag.y - rect.top;
    drag.ghost = el("div", "gm-ghost");
    drag.ghost.style.height = `calc(var(--ch) * ${1 + (run.length - 1) * UP_STEP})`;
    run.forEach((card, k) => drag.ghost.append(cardElement(card, k * UP_STEP, null)));
    document.body.append(drag.ghost);
    drag.hidden = [...board.querySelectorAll(".gm-card[data-src]")].filter((node) => {
      const src = parseSrc(node.dataset.src);
      if (drag.src.t === "tab") return src.t === "tab" && src.c === drag.src.c && src.i >= drag.src.i;
      return node === drag.el;
    });
    drag.hidden.forEach((node) => node.classList.add("gm-hidden"));
    drag.moving = true;
    moveGhost(event);
  }

  function moveGhost(event) {
    drag.ghost.style.left = `${event.clientX - drag.dx}px`;
    drag.ghost.style.top = `${event.clientY - drag.dy}px`;
  }

  function dropTarget() {
    const ghost = drag.ghost.getBoundingClientRect();
    let best = null;
    for (const zone of board.querySelectorAll("[data-drop]")) {
      const dest = parseDrop(zone.dataset.drop);
      if (!canMove(drag.src, dest)) continue;
      const box = zone.getBoundingClientRect();
      const width = Math.min(ghost.right, box.right) - Math.max(ghost.left, box.left);
      const height = Math.min(ghost.bottom, box.bottom) - Math.max(ghost.top, box.top);
      const area = Math.max(0, width) * Math.max(0, height);
      if (area > ghost.width * ghost.width * 0.2 && (!best || area > best.area)) best = { dest, zone, area };
    }
    return best;
  }

  function onMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moving) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      startDrag(event);
    }
    moveGhost(event);
    const target = dropTarget();
    board.querySelectorAll(".drop-ok").forEach((node) => node.classList.remove("drop-ok"));
    target?.zone.classList.add("drop-ok");
  }

  function endDrag() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  function onCancel() {
    if (!drag) return;
    endDrag();
    if (drag.ghost) flipOverride = ghostSnapshot(drag.ghost);
    drag.ghost?.remove();
    drag = null;
    render();
  }

  function onUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    endDrag();
    const current = drag;
    drag = null;
    if (current.moving) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
      drag = current;
      const target = dropTarget();
      drag = null;
      flipOverride = ghostSnapshot(current.ghost);
      current.ghost.remove();
      if (target) applyMove(current.src, target.dest);
      render();
      return;
    }
    onTap(current.key, current.src);
  }

  function onTap(key, src) {
    const now = Date.now();
    const double = lastTap.key === key && now - lastTap.t < 400;
    lastTap = { key, t: now };
    if (double) {
      smartMove(src);
      return;
    }
    if (selected && selected !== key) {
      const dest = src.t === "tab" ? { t: "tab", c: src.c } : src.t === "found" ? { t: "found", f: src.f } : null;
      const from = parseSrc(selected);
      if (dest && canMove(from, dest)) {
        applyMove(from, dest);
        render();
        return;
      }
    }
    selected = selected === key ? null : key;
    render();
  }

  function onBoardClick(event) {
    if (suppressClick || event.target.closest(".gm-card[data-src]")) return;
    if (event.target.closest(".gm-stock")) {
      drawStock();
      return;
    }
    const zone = event.target.closest("[data-drop]");
    if (!zone || !selected) return;
    const from = parseSrc(selected);
    const dest = parseDrop(zone.dataset.drop);
    if (canMove(from, dest)) {
      applyMove(from, dest);
      render();
    }
  }

  function onBoardKey(event) {
    if (event.key === "Escape") {
      clearSelection();
      render();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".gm-card[data-src]");
    if (card) {
      event.preventDefault();
      smartMove(parseSrc(card.dataset.src));
    } else if (event.target.closest(".gm-stock")) {
      event.preventDefault();
      drawStock();
    }
  }

  /* ---------- Pannelli ---------- */

  function renderStats() {
    const stats = readStats();
    const table = el("table", "gm-table");
    const head = el("tr");
    ["Modalità", "Partite", "Vittorie", "% vittorie", "Miglior tempo", "Meno mosse"].forEach((label) => head.append(el("th", "", label)));
    const header = el("thead");
    header.append(head);
    table.append(header);
    const body = el("tbody");
    [["d1", "Pesca 1"], ["d3", "Pesca 3"]].forEach(([key, label]) => {
      const entry = stats[key];
      const row = el("tr");
      const rate = entry.played ? `${Math.round((entry.won / entry.played) * 100)}%` : "–";
      [label, entry.played, entry.won, rate, entry.bestTime ? formatTime(entry.bestTime) : "–", entry.bestMoves || "–"].forEach((value) => row.append(el("td", "", String(value))));
      body.append(row);
    });
    table.append(body);
    const note = el("p", "gm-note", "Una partita conta come giocata quando la vinci o quando ne inizi un'altra senza finirla. Le mani sono casuali: non tutte sono vincibili.");
    const reset = button("Azzera statistiche", null, () => {
      if (!window.confirm("Azzerare tutte le statistiche dei giochi?")) return;
      writeStats(emptyStats());
      EXTRAS.forEach((extra) => extra.reset?.());
      renderStats();
    });
    const sections = [el("h2", "gx-stat-title", "Solitario Klondike"), table, note];
    EXTRAS.forEach((extra) => {
      const data = extra.stats?.();
      if (!data) return;
      const extraTable = el("table", "gm-table");
      const extraHead = el("tr");
      data.headers.forEach((label) => extraHead.append(el("th", "", label)));
      const thead = el("thead");
      thead.append(extraHead);
      const tbody = el("tbody");
      data.rows.forEach((values) => {
        const row = el("tr");
        values.forEach((value) => row.append(el("td", "", String(value))));
        tbody.append(row);
      });
      extraTable.append(thead, tbody);
      sections.push(el("h2", "gx-stat-title", data.title), extraTable);
    });
    sections.push(el("p", "gm-note", ""), reset);
    statsPanel.replaceChildren(...sections);
  }

  function buildGamePanel() {
    const bar = el("div", "gm-bar");
    const info = el("div", "gm-info");
    movesLabel = el("strong", "", "0");
    timeLabel = el("strong", "", "0:00");
    const moves = el("span", "", "Mosse ");
    moves.append(movesLabel);
    const time = el("span", "", "Tempo ");
    time.append(timeLabel);
    info.append(moves, time);

    drawSelect = el("select", "gm-select");
    drawSelect.setAttribute("aria-label", "Modalità di pesca");
    [["1", "Pesca 1"], ["3", "Pesca 3"]].forEach(([value, label]) => {
      const option = el("option", "", label);
      option.value = value;
      drawSelect.append(option);
    });
    drawSelect.addEventListener("change", () => {
      const draw = Number(drawSelect.value);
      if (draw === game.draw) return;
      if (!confirmAbandon()) {
        drawSelect.value = String(game.draw);
        return;
      }
      newGame(draw);
    });

    undoButton = button("Annulla", ICONS.undo, undo);
    autoButton = button("Completa", ICONS.play, autoComplete, false);
    autoButton.hidden = true;
    bar.append(
      button("Nuova partita", ICONS.add, () => { if (confirmAbandon()) newGame(game.draw); }, false),
      undoButton,
      button("Suggerimento", ICONS.hint, hint),
      autoButton,
      drawSelect,
      info,
    );

    board = el("div", "gm-board");
    board.addEventListener("pointerdown", onDown);
    board.addEventListener("click", onBoardClick);
    board.addEventListener("keydown", onBoardKey);
    const hintText = el("p", "gm-note", "Trascina le carte, oppure toccane una e poi tocca la destinazione. Doppio tocco: manda la carta alle basi o nella colonna giusta.");
    gamePanel.append(bar, board, hintText);
  }

  function buildSettingsPanel() {
    const section = el("section", "cp-settings-section");
    section.append(el("p", "cp-settings-hint", "I giochi funzionano offline e salvano partite e record solo su questo dispositivo. Qui vedi lo stato di ciascuno e puoi ripartire da zero con le statistiche."));
    const list = el("ul", "cp-saved-list");
    const rows = [["Solitario Klondike", klondikeSummary()], ...EXTRAS.map((extra) => [extra.title, extra.summary?.() || "Non ancora giocato"])];
    rows.forEach(([name, summary]) => {
      const item = el("li");
      item.append(el("strong", "", name), el("span", "cp-settings-hint", summary));
      list.append(item);
    });
    const status = el("p", "cp-ui-status");
    status.setAttribute("role", "status");
    const reset = el("button", "cp-choice", "Azzera le statistiche di tutti i giochi");
    reset.type = "button";
    reset.addEventListener("click", () => {
      if (!window.confirm("Azzerare tutte le statistiche dei giochi?")) return;
      writeStats(emptyStats());
      EXTRAS.forEach((extra) => extra.reset?.());
      if (statsPanel) renderStats();
      status.textContent = "Statistiche azzerate.";
    });
    const motion = el("label", "cp-order-visible");
    const motionBox = el("input");
    motionBox.type = "checkbox";
    motionBox.checked = window.CyberPulseGamesMotion?.mode() === "system";
    motionBox.addEventListener("change", () => {
      window.CyberPulseGamesMotion?.set(motionBox.checked ? "system" : "on");
      status.textContent = motionBox.checked ? "Le animazioni seguono l'impostazione del sistema." : "Animazioni sempre attive.";
    });
    motion.append(motionBox, document.createTextNode(" Riduci le animazioni se il sistema lo chiede"));
    section.append(list, motion, reset, status);
    return section;
  }

  /* ---------- Navigazione ---------- */

  function klondikeSummary() {
    if (game.started && !game.won) return `Partita in corso · ${game.moves} mosse`;
    const stats = readStats();
    const won = stats.d1.won + stats.d3.won;
    return won ? `${won} vittorie` : "Non ancora giocato";
  }

  function renderHome() {
    const games = [
      { id: "klondike", title: "Solitario Klondike", text: "Il classico solitario: pesca 1 o 3 carte, annulla, suggerimenti e completamento automatico.", icon: KLONDIKE_ICON, color: "#2e7d32", summary: klondikeSummary() },
      ...EXTRAS.map((extra) => ({ id: extra.id, title: extra.title, text: extra.description, icon: extra.icon, color: extra.color, summary: extra.summary?.() || "" })),
    ];
    const grid = el("div", "gm-gallery");
    games.forEach((item) => {
      const tile = el("button", "gm-tile");
      tile.type = "button";
      tile.style.setProperty("--tile", item.color);
      const badge = el("span", "gm-tile-icon");
      badge.append(icon(item.icon));
      badge.firstChild.setAttribute("width", "32");
      badge.firstChild.setAttribute("height", "32");
      const name = el("strong", "gm-tile-title", item.title);
      const text = el("span", "gm-tile-text", item.text);
      const state = el("span", "gm-tile-state", item.summary);
      const play = el("span", "gm-tile-play", "Gioca");
      play.prepend(icon(ICONS.play));
      tile.append(badge, name, text, state, play);
      tile.addEventListener("click", () => selectTab(item.id));
      grid.append(tile);
    });
    const count = el("p", "gm-note", `${games.length} giochi installati. Funzionano tutti offline e salvano partite e record solo su questo dispositivo.`);
    homePanel.replaceChildren(grid, count);
  }

  function describe(tab) {
    const extra = EXTRAS.find((item) => item.id === tab);
    if (extra) return [extra.title, extra.description];
    if (tab === "home") return ["Cyber Games", "Scegli un gioco dalla galleria: tutti funzionano offline e salvano i tuoi record su questo dispositivo."];
    return tab === "stats"
      ? ["Statistiche", "I tuoi risultati ai giochi, salvati solo su questo dispositivo."]
      : ["Solitario Klondike", "La partita resta salvata anche se ricarichi la pagina."];
  }

  function renderTabs() {
    const strip = document.querySelector("#category-strip");
    if (!strip) return;
    strip.replaceChildren(...TABS.map(([id, label]) => {
      const node = el("button", "category-button", label);
      node.type = "button";
      node.dataset.gamesTab = id;
      node.setAttribute("aria-pressed", String(id === ui.tab));
      node.addEventListener("click", () => selectTab(id));
      return node;
    }));
    const dashboard = document.querySelector(".dashboard-button");
    dashboard?.removeAttribute("data-category");
    dashboard?.setAttribute("aria-label", "Galleria dei giochi");
    dashboard?.setAttribute("aria-pressed", String(ui.tab === "home"));
  }

  function saveView(tab) {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ hub: "games", tab })); } catch { /* storage non disponibile */ }
  }

  function selectTab(tab) {
    ui.tab = TABS.some(([id]) => id === tab) ? tab : "home";
    saveView(ui.tab);
    const [title, description] = describe(ui.tab);
    titleElement.textContent = title;
    descriptionElement.textContent = description;
    homePanel.hidden = ui.tab !== "home";
    gamePanel.hidden = ui.tab !== "klondike";
    statsPanel.hidden = ui.tab !== "stats";
    extraPanels.forEach((panel, id) => { panel.hidden = id !== ui.tab; });
    metaElement.textContent = "";
    renderTabs();
    const extra = EXTRAS.find((item) => item.id === ui.tab);
    if (extra) {
      const panel = extraPanels.get(extra.id);
      if (!panel.dataset.mounted) {
        panel.dataset.mounted = "1";
        extra.mount(panel);
      }
    } else if (ui.tab === "stats") renderStats();
    else if (ui.tab === "home") renderHome();
    else render();
  }

  function showGames(startTab) {
    if (!window.CyberPulseAuth?.getUser()) return;
    if (document.body.dataset.hub === "arena") window.CyberPulseArena?.showHome();
    if (document.body.dataset.hub === "music") window.CyberPulseMusic?.close();
    ui.active = true;
    document.querySelector("#home-page").hidden = true;
    document.querySelector("#arena-page")?.setAttribute("hidden", "");
    document.querySelector("#music-page")?.setAttribute("hidden", "");
    page.hidden = false;
    document.body.dataset.hub = "games";
    document.querySelectorAll("[data-launcher-home], #open-arena, #open-music, #open-games").forEach((node) => {
      node.classList.toggle("current", node.id === "open-games");
    });
    document.querySelector("#launcher")?.close();
    document.querySelector(".second-row")?.setAttribute("aria-label", "Giochi di Cyber Games");
    selectTab(typeof startTab === "string" ? startTab : "home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function close() {
    if (!ui.active) return;
    ui.active = false;
    auto = false;
    save();
    page.hidden = true;
    document.querySelector("#open-games")?.classList.remove("current");
    if (document.body.dataset.hub === "games") document.body.removeAttribute("data-hub");
  }

  function tick() {
    if (!ui.active || ui.tab !== "klondike" || !game.started || game.won || document.hidden) return;
    game.seconds += 1;
    timeLabel.textContent = formatTime(game.seconds);
    if (game.seconds % 5 === 0) save();
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-games-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-games-styles";
    style.textContent = `
      .gm-page { padding-top: 32px; }
      .gm-page[hidden] { display: none !important; }
      body[data-hub="games"] #source-filter-button { display: none; }
      .gm-title { margin: 0 0 8px; font-size: clamp(22px, 4vw, 28px); font-weight: 600; letter-spacing: -.3px; }
      .gm-description { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
      .gm-meta { min-height: 1.5em; margin: 8px 0 0; color: var(--text-muted); font-size: 12px; }
      .gm-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
      .gm-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); cursor: pointer; font: inherit; text-align: left; -webkit-tap-highlight-color: transparent; }
      .gm-tile:hover { border-color: var(--tile); }
      .gm-tile:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
      .gm-tile-icon { display: grid; width: 56px; height: 56px; place-items: center; border-radius: 16px; background: var(--tile); color: #fff; }
      .gm-tile-title { margin-top: 6px; font-size: 17px; font-weight: 600; }
      .gm-tile-text { flex: 1; color: var(--text-muted); font-size: 13px; line-height: 1.5; }
      .gm-tile-state { color: var(--text); font-size: 12px; font-weight: 600; }
      .gm-tile-play { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; color: var(--accent); font-size: 13px; font-weight: 600; }
      html.gm-motion .gm-tile { transition: transform 160ms, box-shadow 160ms, border-color 160ms; }
      html.gm-motion .gm-tile:hover { transform: translateY(-4px); box-shadow: 0 8px 18px rgb(0 0 0 / 18%); }
      html.gm-motion .gm-tile:active { transform: scale(.98); }
      .gm-panel { margin-top: 16px; }
      .gm-panel[hidden] { display: none; }
      .gm-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 20px; }
      .gm-info { display: flex; gap: 16px; margin-left: auto; color: var(--text-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
      .gm-info strong { color: var(--text); }
      .gm-button { display: inline-flex; min-height: 38px; align-items: center; gap: 6px; padding: 0 14px; border: 0; border-radius: 19px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; }
      .gm-button.ghost { border: 1px solid var(--border); background: transparent; color: var(--text); }
      .gm-button.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .gm-button:disabled { cursor: default; opacity: .45; }
      .gm-button[hidden] { display: none; }
      .gm-select { min-height: 38px; padding: 0 12px; border: 1px solid var(--border); border-radius: 19px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
      .gm-note { max-width: 70ch; margin: 16px 0 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
      .gm-board, .gm-ghost {
        --cw: clamp(40px, calc((100vw - 40px) / 7.6), 100px);
        --ch: calc(var(--cw) * 1.4);
        --gap: calc(var(--cw) * .14);
      }
      .gm-board {
        display: grid; grid-template-columns: repeat(7, var(--cw)); justify-content: center; align-items: start;
        gap: calc(var(--gap) * 2) var(--gap); min-height: calc(var(--ch) * 4.6); padding: 16px 8px 24px;
        border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
      }
      .gm-slot { position: relative; width: var(--cw); min-height: var(--ch); border: 1px dashed var(--border); border-radius: calc(var(--cw) * .09); box-sizing: border-box; }
      .gm-slot.drop-ok { border-color: var(--accent); background: var(--accent-soft); }
      .gm-slot.hint, .gm-card.hint { box-shadow: 0 0 0 3px #fbbc04; }
      .gm-stock { cursor: pointer; }
      .gm-stock:focus-visible { outline: 3px solid var(--accent); }
      .gm-stock svg { position: absolute; top: 50%; left: 50%; width: calc(var(--cw) * .5); height: calc(var(--cw) * .5); transform: translate(-50%, -50%); color: var(--text-muted); }
      .gm-waste { border-color: transparent; overflow: visible; }
      .gm-spacer { width: var(--cw); }
      .gm-found::after { content: attr(data-suit); position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-muted); font-size: calc(var(--cw) * .5); opacity: .45; }
      .gm-found.red::after { color: #c62828; }
      .gm-col { border-color: transparent; }
      .gm-card {
        position: absolute; left: 0; width: var(--cw); height: var(--ch); box-sizing: border-box; overflow: hidden; border: 1px solid #b9bcc5;
        border-radius: calc(var(--cw) * .09); background: #fff; color: #1b1b1f; box-shadow: 0 1px 2px rgb(0 0 0 / 35%);
        font-size: calc(var(--cw) * .27); line-height: 1; user-select: none; -webkit-user-select: none; touch-action: none; cursor: grab;
      }
      .gm-card.red { color: #c62828; }
      .gm-card.back { border: 2px solid #fff; background: repeating-linear-gradient(45deg, var(--accent) 0 6px, color-mix(in srgb, var(--accent) 65%, #000) 6px 12px); cursor: default; }
      .gm-card.sel { outline: 3px solid var(--accent); outline-offset: -1px; }
      .gm-card:focus-visible { outline: 3px solid var(--accent); }
      .gm-corner { position: absolute; top: 5%; left: 8%; font-weight: 700; white-space: nowrap; }
      .gm-pip { position: absolute; right: 9%; bottom: 6%; font-size: calc(var(--cw) * .55); }
      .gm-hidden { visibility: hidden; }
      .gm-ghost { position: fixed; z-index: 60; width: var(--cw); pointer-events: none; filter: drop-shadow(0 6px 10px rgb(0 0 0 / 40%)); }
      .gm-banner { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--radius); background: var(--accent-soft); color: var(--accent); }
      .gm-table { width: 100%; max-width: 640px; border-collapse: collapse; font-size: 14px; }
      .gm-table th, .gm-table td { padding: 12px 8px; border-bottom: 1px solid var(--border); text-align: left; }
      .gm-table th { color: var(--text-muted); font-size: 12px; font-weight: 600; }
      @keyframes gm-pulse { 0%, 100% { box-shadow: 0 0 0 3px #fbbc04; } 50% { box-shadow: 0 0 0 7px rgb(251 188 4 / 35%); } }
      @keyframes gm-sel { from { transform: translateY(0); } to { transform: translateY(-6px); } }
      html.gm-motion .gm-card { transition: box-shadow 150ms, transform 150ms; }
      html.gm-motion .gm-card[data-src]:hover { transform: translateY(-3px); box-shadow: 0 5px 10px rgb(0 0 0 / 35%); }
      html.gm-motion .gm-card.sel { transform: translateY(-6px); }
      html.gm-motion .gm-slot { transition: background-color 150ms, border-color 150ms; }
      html.gm-motion .gm-slot.hint, html.gm-motion .gm-card.hint { animation: gm-pulse 700ms ease-in-out 3; }
      html.gm-motion .gm-stock:active .gm-card { transform: scale(.94); }
    `;
    document.head.append(style);
  }

  function init() {
    addStyles();
    const main = document.querySelector("#home");
    if (!main) return;
    game = loadGame();
    page = el("section", "gm-page");
    page.id = "games-page";
    page.hidden = true;
    page.setAttribute("aria-labelledby", "games-page-title");
    titleElement = el("h1", "gm-title", "Cyber Games");
    titleElement.id = "games-page-title";
    descriptionElement = el("p", "gm-description");
    metaElement = el("p", "gm-meta");
    metaElement.setAttribute("role", "status");
    metaElement.setAttribute("aria-live", "polite");
    homePanel = el("div", "gm-panel");
    gamePanel = el("div", "gm-panel");
    statsPanel = el("div", "gm-panel");
    statsPanel.hidden = true;
    buildGamePanel();
    page.append(titleElement, descriptionElement, metaElement, homePanel, gamePanel);
    EXTRAS.forEach((extra) => {
      const panel = el("div", "gm-panel");
      panel.hidden = true;
      extraPanels.set(extra.id, panel);
      page.append(panel);
    });
    page.append(statsPanel);
    main.append(page);

    document.querySelector("#open-games")?.addEventListener("click", () => showGames());
    const restore = () => {
      try {
        const view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");
        if (view?.hub === "games" && !ui.active) showGames(String(view.tab || "home"));
      } catch { /* vista non valida */ }
    };
    if (window.CyberPulseAuth?.getUser()) restore();
    else document.addEventListener("cyberpulse:signedin", restore, { once: true });

    document.querySelectorAll("[data-launcher-home]").forEach((node) => node.addEventListener("click", () => {
      const wasActive = ui.active;
      close();
      if (wasActive) document.dispatchEvent(new CustomEvent("cyberpulse:restorestrip"));
    }));
    ["#open-arena", "#open-music"].forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => node.addEventListener("click", close));
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
      selectTab("home");
    }, true);
    window.CyberPulseSettings?.register({ id: "games", group: "games", title: "Partite e statistiche", build: buildSettingsPanel });
    window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
    window.addEventListener("pagehide", save);
  }

  window.CyberPulseGames = Object.freeze({ open: showGames, close });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
