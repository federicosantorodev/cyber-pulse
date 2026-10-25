/* Cyber Pulse - Giochi aggiuntivi per Cyber Games: Memory, 2048 e Campo minato.
 * Ogni gioco si registra in window.CyberPulseGamesExtra; games.js crea le schede e chiama mount(panel).
 * Tutto funziona offline: i record sono salvati nel browser. */
(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const FLAG_PATH = "M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z";
  const REFRESH_PATH = "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z";
  const UNDO_PATH = "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z";

  /* ---------- Utilita' ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(path, size = 18) {
    const node = document.createElementNS(SVG_NS, "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("width", String(size));
    node.setAttribute("height", String(size));
    const shape = document.createElementNS(SVG_NS, "path");
    shape.setAttribute("d", path);
    shape.setAttribute("fill", "currentColor");
    node.append(shape);
    return node;
  }

  function button(label, path, handler, ghost = true) {
    const node = el("button", `gm-button${ghost ? " ghost" : ""}`);
    node.type = "button";
    if (path) node.append(svg(path));
    node.append(document.createTextNode(label));
    node.addEventListener("click", handler);
    return node;
  }

  function select(label, options, handler) {
    const node = el("select", "gm-select");
    node.setAttribute("aria-label", label);
    options.forEach(([value, text]) => {
      const option = el("option", "", text);
      option.value = value;
      node.append(option);
    });
    node.addEventListener("change", () => handler(node.value));
    return node;
  }

  function infoItem(label) {
    const wrap = el("span", "", `${label} `);
    const value = el("strong", "", "0");
    wrap.append(value);
    return { wrap, value };
  }

  function load(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage non disponibile */ }
  }

  function formatTime(total) {
    const s = Math.max(0, Math.floor(total || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function visible(node) {
    return Boolean(node && node.isConnected && node.offsetParent !== null);
  }

  // Le animazioni dei giochi sono attive di default; l'utente può scegliere di seguire il sistema.
  const MOTION_KEY = "cyber-pulse.games.motion";
  function motionMode() {
    try { return localStorage.getItem(MOTION_KEY) === "system" ? "system" : "on"; } catch { return "on"; }
  }
  function reducedMotion() {
    return motionMode() === "system" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function syncMotionClass() {
    document.documentElement.classList.toggle("gm-motion", !reducedMotion());
  }
  syncMotionClass();
  window.CyberPulseGamesMotion = Object.freeze({
    mode: motionMode,
    reduced: reducedMotion,
    set(mode) {
      try { localStorage.setItem(MOTION_KEY, mode === "system" ? "system" : "on"); } catch { /* storage non disponibile */ }
      syncMotionClass();
    },
  });

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function status() {
    const node = el("p", "gx-status");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    return node;
  }

  /* ---------- Memory ---------- */

  function memoryGame() {
    const KEY = "cyber-pulse.games.memory";
    const SYMBOLS = [
      ["★", "#f9a825", "stella"], ["●", "#e53935", "cerchio"], ["▲", "#43a047", "triangolo"], ["■", "#1e88e5", "quadrato"],
      ["◆", "#8e24aa", "rombo"], ["♥", "#d81b60", "cuore"], ["☾", "#fb8c00", "luna"], ["♫", "#00acc1", "nota"],
      ["✿", "#6d4c41", "fiore"], ["☀", "#fdd835", "sole"], ["☂", "#3949ab", "ombrello"], ["♣", "#2e7d32", "fiori"],
    ].map(([sym, color, name]) => ({ sym: `${sym}\uFE0E`, color, name }));
    const LEVELS = {
      easy: { label: "Facile", pairs: 6, cols: 4 },
      medium: { label: "Medio", pairs: 8, cols: 4 },
      hard: { label: "Difficile", pairs: 12, cols: 6 },
    };
    let panel;
    let grid;
    let message;
    let movesInfo;
    let timeInfo;
    let levelSelect;
    let run = null;
    let level = "easy";
    let mounted = false;

    function readStats() {
      const saved = load(KEY);
      const stats = {};
      Object.keys(LEVELS).forEach((id) => {
        stats[id] = { played: 0, won: 0, bestTime: 0, bestMoves: 0, ...(saved[id] || {}) };
      });
      return stats;
    }

    function newGame() {
      const config = LEVELS[level];
      const cards = shuffle(SYMBOLS.slice(0, config.pairs).flatMap((symbol) => [{ ...symbol }, { ...symbol }]));
      run = { cards: cards.map((card) => ({ ...card, up: false, done: false })), first: null, lock: false, moves: 0, seconds: 0, started: false, finished: false, pending: 0 };
      grid.style.setProperty("--cols", String(config.cols));
      grid.replaceChildren(...run.cards.map((card, index) => {
        const node = el("button", "gx-mem-card");
        node.type = "button";
        node.setAttribute("aria-label", "Carta coperta");
        const inner = el("span", "gx-mem-in");
        const back = el("span", "gx-mem-face gx-mem-back");
        const front = el("span", "gx-mem-face gx-mem-front", card.sym);
        front.style.color = card.color;
        inner.append(back, front);
        node.append(inner);
        node.addEventListener("click", () => flip(index));
        card.node = node;
        return node;
      }));
      message.textContent = "Trova tutte le coppie.";
      updateInfo();
    }

    function updateInfo() {
      movesInfo.value.textContent = String(run.moves);
      timeInfo.value.textContent = formatTime(run.seconds);
    }

    function setCard(card, up) {
      card.up = up;
      card.node.classList.toggle("up", up);
      card.node.setAttribute("aria-label", up || card.done ? `Carta: ${card.name}` : "Carta coperta");
    }

    function flip(index) {
      const card = run.cards[index];
      if (run.finished || run.lock || card.up || card.done) return;
      if (!run.started) {
        run.started = true;
        const stats = readStats();
        stats[level].played += 1;
        save(KEY, stats);
      }
      setCard(card, true);
      if (run.first === null) {
        run.first = index;
        return;
      }
      const other = run.cards[run.first];
      run.first = null;
      run.moves += 1;
      updateInfo();
      if (other.sym === card.sym) {
        other.done = true;
        card.done = true;
        other.node.classList.add("done");
        card.node.classList.add("done");
        message.textContent = `Coppia trovata: ${card.name}!`;
        if (run.cards.every((item) => item.done)) finish();
        return;
      }
      run.lock = true;
      window.setTimeout(() => {
        setCard(other, false);
        setCard(card, false);
        run.lock = false;
      }, 800);
    }

    function finish() {
      run.finished = true;
      const stats = readStats();
      const entry = stats[level];
      entry.won += 1;
      const record = [];
      if (!entry.bestTime || run.seconds < entry.bestTime) { entry.bestTime = run.seconds; record.push("miglior tempo"); }
      if (!entry.bestMoves || run.moves < entry.bestMoves) { entry.bestMoves = run.moves; record.push("meno mosse"); }
      save(KEY, stats);
      message.textContent = `Hai trovato tutte le coppie in ${run.moves} mosse e ${formatTime(run.seconds)}.${record.length ? ` Nuovo record: ${record.join(" e ")}!` : ""}`;
      message.classList.remove("pop");
      void message.offsetWidth;
      message.classList.add("pop");
    }

    return {
      id: "memory",
      icon: "M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z",
      color: "#8e24aa",
      summary() {
        const stats = readStats();
        const won = Object.values(stats).reduce((sum, entry) => sum + entry.won, 0);
        const best = Math.min(...Object.values(stats).map((entry) => entry.bestMoves || Infinity));
        return won ? `${won} vittorie · record ${best} mosse` : "Non ancora giocato";
      },
      label: "Memory",
      title: "Memory",
      description: "Scopri due carte alla volta e trova tutte le coppie nel minor tempo e con meno mosse possibili.",
      mount(target) {
        if (mounted) return;
        mounted = true;
        panel = target;
        const bar = el("div", "gm-bar");
        movesInfo = infoItem("Mosse");
        timeInfo = infoItem("Tempo");
        const info = el("div", "gm-info");
        info.append(movesInfo.wrap, timeInfo.wrap);
        levelSelect = select("Difficoltà", Object.entries(LEVELS).map(([id, config]) => [id, `${config.label} (${config.pairs * 2} carte)`]), (value) => {
          level = value;
          newGame();
        });
        bar.append(button("Nuova partita", REFRESH_PATH, newGame, false), levelSelect, info);
        grid = el("div", "gx-mem-grid");
        message = status();
        panel.append(bar, grid, message, el("p", "gm-note", "Tocca due carte per girarle: se sono uguali restano scoperte. Ogni gioco salva i record su questo dispositivo."));
        window.setInterval(() => {
          if (!run || !run.started || run.finished || !visible(panel)) return;
          run.seconds += 1;
          updateInfo();
        }, 1000);
        newGame();
      },
      stats() {
        const stats = readStats();
        return {
          title: "Memory",
          headers: ["Livello", "Partite", "Vittorie", "Miglior tempo", "Meno mosse"],
          rows: Object.entries(LEVELS).map(([id, config]) => {
            const entry = stats[id];
            return [config.label, entry.played, entry.won, entry.bestTime ? formatTime(entry.bestTime) : "–", entry.bestMoves || "–"];
          }),
        };
      },
      reset() { save(KEY, {}); },
    };
  }

  /* ---------- 2048 ---------- */

  function game2048() {
    const KEY = "cyber-pulse.games.g2048";
    const SIZE = 4;
    const VECTORS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
    let panel;
    let board;
    let layer;
    let message;
    let scoreInfo;
    let bestInfo;
    let undoButton;
    let store;
    let state;
    let mounted = false;
    const nodes = new Map();

    function freshState() {
      return { tiles: [], score: 0, nextId: 1, over: false, reached: false, moves: 0, counted: false, prev: null };
    }

    function readStore() {
      const saved = load(KEY);
      const base = { best: 0, bestTile: 0, played: 0, reached: 0, state: null };
      return { ...base, ...saved };
    }

    function validState(value) {
      return value && Array.isArray(value.tiles) && value.tiles.every((t) => Number.isInteger(t.r) && Number.isInteger(t.c) && t.r >= 0 && t.r < SIZE && t.c >= 0 && t.c < SIZE && t.v > 0)
        && new Set(value.tiles.map((t) => `${t.r}:${t.c}`)).size === value.tiles.length;
    }

    function persist() {
      store.state = { ...state, tiles: state.tiles.filter((t) => !t.dead).map(({ id, v, r, c }) => ({ id, v, r, c })) };
      save(KEY, store);
    }

    function spawn() {
      const taken = new Set(state.tiles.filter((t) => !t.dead).map((t) => `${t.r}:${t.c}`));
      const free = [];
      for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) if (!taken.has(`${r}:${c}`)) free.push([r, c]);
      if (!free.length) return;
      const [r, c] = free[Math.floor(Math.random() * free.length)];
      state.tiles.push({ id: state.nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, isNew: true });
    }

    function canMove() {
      const live = state.tiles.filter((t) => !t.dead);
      if (live.length < SIZE * SIZE) return true;
      return live.some((t) => live.some((o) => o.v === t.v && Math.abs(o.r - t.r) + Math.abs(o.c - t.c) === 1));
    }

    function newGame() {
      if (state && state.moves > 0 && !state.over && !state.counted) {
        store.played += 1;
      }
      state = freshState();
      spawn();
      spawn();
      message.textContent = "";
      render();
      persist();
    }

    function render() {
      const live = new Set(state.tiles.map((t) => t.id));
      nodes.forEach((node, id) => {
        if (!live.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      });
      state.tiles.forEach((tile) => {
        let node = nodes.get(tile.id);
        if (!node) {
          node = el("div", "gx-tile");
          node.append(el("div", "gx-tile-in"));
          layer.append(node);
          nodes.set(tile.id, node);
        }
        node.style.setProperty("--r", String(tile.r));
        node.style.setProperty("--c", String(tile.c));
        node.classList.toggle("dead", Boolean(tile.dead));
        node.dataset.v = String(Math.min(tile.v, 4096));
        const inner = node.firstChild;
        inner.textContent = String(tile.v);
        inner.dataset.len = String(String(tile.v).length);
        if (!reducedMotion()) {
          if (tile.isNew) inner.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 180, delay: 110, easing: "ease-out", fill: "backwards" });
          else if (tile.merged) inner.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(1)" }], { duration: 200, delay: 100, easing: "ease-out" });
        }
        tile.isNew = false;
        tile.merged = false;
      });
      node_label();
      scoreInfo.value.textContent = String(state.score);
      bestInfo.value.textContent = String(store.best);
      undoButton.disabled = !state.prev || state.over;
    }

    function node_label() {
      const live = state.tiles.filter((t) => !t.dead).sort((a, b) => a.r - b.r || a.c - b.c);
      board.setAttribute("aria-label", `Tavoliere 2048. ${live.map((t) => `${t.v} in riga ${t.r + 1} colonna ${t.c + 1}`).join(", ")}`);
    }

    function move(direction) {
      if (state.over) return;
      const [dr, dc] = VECTORS[direction];
      const horizontal = dr === 0;
      state.tiles = state.tiles.filter((t) => !t.dead);
      const live = state.tiles;
      live.forEach((t) => { t.merged = false; t.isNew = false; });
      const snapshot = { tiles: live.map(({ id, v, r, c }) => ({ id, v, r, c })), score: state.score, nextId: state.nextId, moves: state.moves };
      let moved = false;
      let gained = 0;
      for (let line = 0; line < SIZE; line += 1) {
        const inLine = live
          .filter((t) => (horizontal ? t.r === line : t.c === line))
          .sort((a, b) => (horizontal ? (dc < 0 ? a.c - b.c : b.c - a.c) : (dr < 0 ? a.r - b.r : b.r - a.r)));
        let k = 0;
        let last = null;
        for (const tile of inLine) {
          if (last && last.v === tile.v && !last.merged) {
            tile.r = last.r;
            tile.c = last.c;
            tile.dead = true;
            last.v *= 2;
            last.merged = true;
            gained += last.v;
            moved = true;
          } else {
            const nr = horizontal ? line : (dr < 0 ? k : SIZE - 1 - k);
            const nc = horizontal ? (dc < 0 ? k : SIZE - 1 - k) : line;
            if (tile.r !== nr || tile.c !== nc) moved = true;
            tile.r = nr;
            tile.c = nc;
            last = tile;
            k += 1;
          }
        }
      }
      if (!moved) return;
      state.prev = snapshot;
      state.score += gained;
      state.moves += 1;
      if (!state.counted) {
        state.counted = true;
        store.played += 1;
      }
      spawn();
      const top = Math.max(...state.tiles.filter((t) => !t.dead).map((t) => t.v));
      store.bestTile = Math.max(store.bestTile, top);
      if (state.score > store.best) store.best = state.score;
      if (top >= 2048 && !state.reached) {
        state.reached = true;
        store.reached += 1;
        message.textContent = "Hai raggiunto 2048! Puoi continuare a giocare.";
      }
      if (!canMove()) {
        state.over = true;
        message.textContent = `Partita finita: ${state.score} punti, tessera massima ${top}.`;
      }
      render();
      persist();
      window.setTimeout(() => {
        if (!state.tiles.some((t) => t.dead)) return;
        state.tiles = state.tiles.filter((t) => !t.dead);
        render();
      }, 140);
    }

    function undo() {
      if (!state.prev) return;
      const { tiles, score, nextId, moves } = state.prev;
      state.tiles = tiles.map((t) => ({ ...t }));
      state.score = score;
      state.nextId = nextId;
      state.moves = moves;
      state.over = false;
      state.prev = null;
      message.textContent = "";
      render();
      persist();
    }

    function onKey(event) {
      if (!visible(panel) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest?.("select, input, textarea")) return;
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    }

    let touch = null;

    return {
      id: "g2048",
      icon: "M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z",
      color: "#f59563",
      summary() {
        const data = readStore();
        if (data.state?.moves > 0 && !data.state.over) return `Partita in corso · ${data.state.score} punti`;
        return data.best ? `Record ${data.best} punti · tessera ${data.bestTile}` : "Non ancora giocato";
      },
      label: "2048",
      title: "2048",
      description: "Fai scorrere le tessere con le frecce o con uno swipe: le tessere uguali si fondono. Arriva a 2048!",
      mount(target) {
        if (mounted) return;
        mounted = true;
        panel = target;
        store = readStore();
        const bar = el("div", "gm-bar");
        scoreInfo = infoItem("Punti");
        bestInfo = infoItem("Record");
        const info = el("div", "gm-info");
        info.append(scoreInfo.wrap, bestInfo.wrap);
        undoButton = button("Annulla", UNDO_PATH, undo);
        bar.append(button("Nuova partita", REFRESH_PATH, () => {
          if (state.moves > 0 && !state.over && !window.confirm("Abbandonare la partita in corso?")) return;
          newGame();
        }, false), undoButton, info);
        board = el("div", "gx-2048");
        board.tabIndex = 0;
        board.setAttribute("role", "group");
        const cells = el("div", "gx-2048-cells");
        for (let i = 0; i < SIZE * SIZE; i += 1) cells.append(el("div", "gx-2048-cell"));
        layer = el("div", "gx-2048-layer");
        board.append(cells, layer);
        message = status();
        panel.append(bar, board, message, el("p", "gm-note", "Frecce o WASD sulla tastiera, swipe sul telefono. Puoi annullare l'ultima mossa."));
        board.addEventListener("pointerdown", (event) => { touch = { x: event.clientX, y: event.clientY }; });
        board.addEventListener("pointerup", (event) => {
          if (!touch) return;
          const dx = event.clientX - touch.x;
          const dy = event.clientY - touch.y;
          touch = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
        });
        board.addEventListener("pointercancel", () => { touch = null; });
        document.addEventListener("keydown", onKey);
        window.addEventListener("pagehide", () => { if (state) persist(); });
        state = validState(store.state) ? { ...freshState(), ...store.state, tiles: store.state.tiles.map((t) => ({ ...t })), prev: null } : null;
        if (state && state.tiles.length) {
          state.nextId = Math.max(state.nextId, ...state.tiles.map((t) => t.id + 1));
          if (state.over) message.textContent = `Partita finita: ${state.score} punti. Premi "Nuova partita".`;
          render();
        } else {
          newGame();
        }
      },
      stats() {
        const data = readStore();
        return {
          title: "2048",
          headers: ["Partite", "Record punti", "Tessera massima", "Volte a 2048"],
          rows: [[data.played, data.best || "–", data.bestTile || "–", data.reached]],
        };
      },
      reset() {
        const keep = store ? store.state : null;
        save(KEY, { best: 0, bestTile: 0, played: 0, reached: 0, state: keep });
        if (store) Object.assign(store, { best: 0, bestTile: 0, played: 0, reached: 0 });
        if (mounted && state) render();
      },
    };
  }

  /* ---------- Campo minato ---------- */

  function minesweeperGame() {
    const KEY = "cyber-pulse.games.minesweeper";
    const LEVELS = {
      easy: { label: "Facile", rows: 9, cols: 9, mines: 10 },
      medium: { label: "Medio", rows: 12, cols: 12, mines: 25 },
      hard: { label: "Difficile", rows: 16, cols: 16, mines: 40 },
    };
    let panel;
    let grid;
    let message;
    let minesInfo;
    let timeInfo;
    let flagToggle;
    let level = "easy";
    let run = null;
    let flagMode = false;
    let focusIndex = 0;
    let longPress = { timer: 0, fired: false };
    let mounted = false;

    function readStats() {
      const saved = load(KEY);
      const stats = {};
      Object.keys(LEVELS).forEach((id) => {
        stats[id] = { played: 0, won: 0, bestTime: 0, ...(saved[id] || {}) };
      });
      return stats;
    }

    function neighbours(index) {
      const { rows, cols } = run;
      const r = Math.floor(index / cols);
      const c = index % cols;
      const out = [];
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
        }
      }
      return out;
    }

    function mineIcon() {
      const node = document.createElementNS(SVG_NS, "svg");
      node.setAttribute("viewBox", "0 0 24 24");
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("class", "gx-mine-icon");
      node.innerHTML = '<circle cx="12" cy="12" r="6" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="1.8" fill="#fff"/>';
      return node;
    }

    function newGame() {
      const config = LEVELS[level];
      run = {
        ...config,
        cells: Array.from({ length: config.rows * config.cols }, () => ({ mine: false, open: false, flag: false, count: 0 })),
        started: false, over: false, won: false, seconds: 0, flags: 0, opened: 0,
      };
      focusIndex = 0;
      grid.style.setProperty("--cols", String(config.cols));
      grid.setAttribute("aria-label", `Campo minato ${config.rows} per ${config.cols}, ${config.mines} mine`);
      grid.replaceChildren(...run.cells.map((cell, index) => {
        const node = el("button", "gx-cell");
        node.type = "button";
        node.dataset.i = String(index);
        node.tabIndex = index === 0 ? 0 : -1;
        node.setAttribute("aria-label", "Casella coperta");
        cell.node = node;
        return node;
      }));
      message.textContent = "Il primo tocco è sempre sicuro.";
      updateInfo();
    }

    function updateInfo() {
      minesInfo.value.textContent = String(run.mines - run.flags);
      timeInfo.value.textContent = formatTime(run.seconds);
    }

    function placeMines(safe) {
      const blocked = new Set([safe, ...neighbours(safe)]);
      const pool = [];
      run.cells.forEach((_, index) => { if (!blocked.has(index)) pool.push(index); });
      shuffle(pool).slice(0, run.mines).forEach((index) => { run.cells[index].mine = true; });
      run.cells.forEach((cell, index) => {
        cell.count = neighbours(index).filter((n) => run.cells[n].mine).length;
      });
    }

    function paint(index) {
      const cell = run.cells[index];
      const node = cell.node;
      node.className = "gx-cell";
      node.replaceChildren();
      if (cell.open) {
        node.classList.add("open");
        if (cell.mine) {
          node.classList.add("mine");
          node.append(mineIcon());
          node.setAttribute("aria-label", "Mina");
        } else if (cell.count) {
          node.textContent = String(cell.count);
          node.dataset.n = String(cell.count);
          node.setAttribute("aria-label", `${cell.count} mine vicine`);
        } else {
          node.setAttribute("aria-label", "Casella vuota");
        }
      } else if (cell.flag) {
        node.classList.add("flag");
        node.append(svg(FLAG_PATH, 16));
        node.setAttribute("aria-label", "Bandierina");
      } else {
        node.setAttribute("aria-label", "Casella coperta");
      }
    }

    function reveal(index) {
      const stack = [index];
      while (stack.length) {
        const current = stack.pop();
        const cell = run.cells[current];
        if (cell.open || cell.flag) continue;
        cell.open = true;
        run.opened += 1;
        paint(current);
        if (cell.mine) return true;
        if (!cell.count) neighbours(current).forEach((n) => { if (!run.cells[n].open) stack.push(n); });
      }
      return false;
    }

    function lose(hit) {
      run.over = true;
      run.cells.forEach((cell, index) => {
        if (cell.mine && !cell.flag) {
          cell.open = true;
          paint(index);
        } else if (!cell.mine && cell.flag) {
          paint(index);
          cell.node.classList.add("wrong");
        }
      });
      run.cells[hit].node.classList.add("boom");
      message.textContent = "Boom! Hai colpito una mina. Riprova con una nuova partita.";
    }

    function win() {
      run.over = true;
      run.won = true;
      run.cells.forEach((cell, index) => {
        if (cell.mine && !cell.flag) {
          cell.flag = true;
          run.flags += 1;
          paint(index);
        }
      });
      const stats = readStats();
      const entry = stats[level];
      entry.won += 1;
      let record = false;
      if (!entry.bestTime || run.seconds < entry.bestTime) {
        entry.bestTime = run.seconds;
        record = true;
      }
      save(KEY, stats);
      message.textContent = `Campo ripulito in ${formatTime(run.seconds)}!${record ? " Nuovo record!" : ""}`;
      message.classList.remove("pop");
      void message.offsetWidth;
      message.classList.add("pop");
      updateInfo();
    }

    function checkWin() {
      if (run.opened === run.cells.length - run.mines) win();
    }

    function startIfNeeded(index) {
      if (run.started) return;
      run.started = true;
      placeMines(index);
      const stats = readStats();
      stats[level].played += 1;
      save(KEY, stats);
    }

    function open(index) {
      if (run.over) return;
      const cell = run.cells[index];
      if (cell.flag) return;
      if (cell.open) {
        chord(index);
        return;
      }
      startIfNeeded(index);
      if (reveal(index)) {
        lose(index);
        return;
      }
      checkWin();
    }

    function chord(index) {
      const cell = run.cells[index];
      if (!cell.count) return;
      const around = neighbours(index);
      if (around.filter((n) => run.cells[n].flag).length !== cell.count) return;
      let hit = -1;
      around.forEach((n) => {
        if (run.cells[n].flag || run.cells[n].open) return;
        if (reveal(n) && hit < 0) hit = n;
      });
      if (hit >= 0) lose(hit);
      else checkWin();
    }

    function toggleFlag(index) {
      if (run.over) return;
      const cell = run.cells[index];
      if (cell.open) return;
      cell.flag = !cell.flag;
      run.flags += cell.flag ? 1 : -1;
      paint(index);
      updateInfo();
    }

    function focusCell(index) {
      const next = Math.max(0, Math.min(run.cells.length - 1, index));
      run.cells[focusIndex].node.tabIndex = -1;
      focusIndex = next;
      run.cells[next].node.tabIndex = 0;
      run.cells[next].node.focus();
    }

    function onKey(event) {
      const node = event.target.closest(".gx-cell");
      if (!node) return;
      const index = Number(node.dataset.i);
      const { cols } = run;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
      if (event.key in moves) {
        event.preventDefault();
        focusCell(index + moves[event.key]);
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFlag(index);
      }
    }

    return {
      id: "minesweeper",
      icon: FLAG_PATH,
      color: "#e53935",
      summary() {
        const stats = readStats();
        const won = Object.values(stats).reduce((sum, entry) => sum + entry.won, 0);
        const best = Math.min(...Object.values(stats).map((entry) => entry.bestTime || Infinity));
        return won ? `${won} vittorie · record ${formatTime(best)}` : "Non ancora giocato";
      },
      label: "Campo minato",
      title: "Campo minato",
      description: "Scopri tutte le caselle senza mine. I numeri indicano quante mine ci sono nelle caselle vicine.",
      mount(target) {
        if (mounted) return;
        mounted = true;
        panel = target;
        const bar = el("div", "gm-bar");
        minesInfo = infoItem("Mine");
        timeInfo = infoItem("Tempo");
        const info = el("div", "gm-info");
        info.append(minesInfo.wrap, timeInfo.wrap);
        const levelSelect = select("Difficoltà", Object.entries(LEVELS).map(([id, config]) => [id, `${config.label} (${config.rows}×${config.cols}, ${config.mines} mine)`]), (value) => {
          level = value;
          newGame();
        });
        flagToggle = button("Bandierina", FLAG_PATH, () => {
          flagMode = !flagMode;
          flagToggle.setAttribute("aria-pressed", String(flagMode));
          flagToggle.classList.toggle("on", flagMode);
        });
        flagToggle.setAttribute("aria-pressed", "false");
        bar.append(button("Nuova partita", REFRESH_PATH, newGame, false), flagToggle, levelSelect, info);
        const wrap = el("div", "gx-mines-wrap");
        grid = el("div", "gx-mines");
        grid.setAttribute("role", "group");
        wrap.append(grid);
        message = status();
        panel.append(bar, wrap, message, el("p", "gm-note", "Clic o tocco per scoprire. Tasto destro, pressione lunga o pulsante Bandierina per segnare una mina (da tastiera: F). Su un numero già scoperto, con le bandierine giuste, scopri le caselle intorno."));
        grid.addEventListener("click", (event) => {
          const node = event.target.closest(".gx-cell");
          if (!node) return;
          if (longPress.fired) {
            longPress.fired = false;
            return;
          }
          const index = Number(node.dataset.i);
          if (flagMode && !run.cells[index].open) toggleFlag(index);
          else open(index);
        });
        grid.addEventListener("contextmenu", (event) => {
          const node = event.target.closest(".gx-cell");
          if (!node) return;
          event.preventDefault();
          toggleFlag(Number(node.dataset.i));
        });
        grid.addEventListener("pointerdown", (event) => {
          const node = event.target.closest(".gx-cell");
          longPress.fired = false;
          if (!node || event.pointerType === "mouse") return;
          window.clearTimeout(longPress.timer);
          longPress.timer = window.setTimeout(() => {
            longPress.fired = true;
            toggleFlag(Number(node.dataset.i));
          }, 450);
        });
        ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
          grid.addEventListener(name, () => window.clearTimeout(longPress.timer));
        });
        grid.addEventListener("keydown", onKey);
        window.setInterval(() => {
          if (!run || !run.started || run.over || !visible(panel)) return;
          run.seconds += 1;
          updateInfo();
        }, 1000);
        newGame();
      },
      stats() {
        const stats = readStats();
        return {
          title: "Campo minato",
          headers: ["Livello", "Partite", "Vittorie", "Miglior tempo"],
          rows: Object.entries(LEVELS).map(([id, config]) => {
            const entry = stats[id];
            return [config.label, entry.played, entry.won, entry.bestTime ? formatTime(entry.bestTime) : "–"];
          }),
        };
      },
      reset() { save(KEY, {}); },
    };
  }

  /* ---------- Stile ---------- */

  function addStyles() {
    if (document.querySelector("#cyber-pulse-games-more-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-games-more-styles";
    style.textContent = `
      .gx-status { min-height: 1.5em; margin: 14px 0 0; color: var(--text); font-size: 14px; font-weight: 600; }
      .gm-button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
      .gx-stat-title { margin: 28px 0 8px; font-size: 16px; font-weight: 600; }

      .gx-mem-grid { display: grid; grid-template-columns: repeat(var(--cols, 4), 1fr); gap: 10px; width: min(100%, calc(var(--cols, 4) * 112px)); margin: 0 auto; }
      .gx-mem-card { aspect-ratio: 1; padding: 0; border: 0; background: none; cursor: pointer; perspective: 700px; -webkit-tap-highlight-color: transparent; }
      .gx-mem-card:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 10px; }
      .gx-mem-in { position: relative; display: block; width: 100%; height: 100%; transform-style: preserve-3d; }
      .gx-mem-card.up .gx-mem-in { transform: rotateY(180deg); }
      .gx-mem-face { position: absolute; inset: 0; display: grid; place-items: center; box-sizing: border-box; border-radius: 10px; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
      .gx-mem-back { border: 2px solid #fff; background: repeating-linear-gradient(45deg, var(--accent) 0 6px, color-mix(in srgb, var(--accent) 65%, #000) 6px 12px); box-shadow: 0 1px 3px rgb(0 0 0 / 35%); }
      .gx-mem-front { transform: rotateY(180deg); border: 1px solid #b9bcc5; background: #fff; font-size: clamp(28px, 8vw, 52px); line-height: 1; box-shadow: 0 1px 3px rgb(0 0 0 / 35%); }
      .gx-mem-card.done .gx-mem-front { box-shadow: 0 0 0 3px #43a047; }

      .gx-2048 { position: relative; width: min(100%, 420px); aspect-ratio: 1; margin: 0 auto; padding: 8px; box-sizing: border-box; border-radius: 12px; background: var(--border); container-type: inline-size; touch-action: none; user-select: none; -webkit-user-select: none; outline-offset: 3px; }
      .gx-2048:focus-visible { outline: 3px solid var(--accent); }
      .gx-2048-cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; position: absolute; inset: 8px; }
      .gx-2048-cell { margin: 6px; border-radius: 8px; background: color-mix(in srgb, var(--surface) 70%, transparent); }
      .gx-2048-layer { position: absolute; inset: 8px; }
      .gx-tile { position: absolute; top: 0; left: 0; width: 25%; height: 25%; transform: translate(calc(var(--c) * 100%), calc(var(--r) * 100%)); z-index: 2; }
      .gx-tile.dead { z-index: 1; }
      .gx-tile-in { position: absolute; inset: 6px; display: grid; place-items: center; border-radius: 8px; background: #eee4da; color: #3c3a32; font-size: 8cqw; font-weight: 800; box-shadow: 0 1px 3px rgb(0 0 0 / 25%); }
      .gx-tile-in[data-len="3"] { font-size: 6.6cqw; }
      .gx-tile-in[data-len="4"], .gx-tile-in[data-len="5"] { font-size: 5.2cqw; }
      .gx-tile[data-v="4"] .gx-tile-in { background: #ede0c8; }
      .gx-tile[data-v="8"] .gx-tile-in { background: #f2b179; color: #fff; }
      .gx-tile[data-v="16"] .gx-tile-in { background: #f59563; color: #fff; }
      .gx-tile[data-v="32"] .gx-tile-in { background: #f67c5f; color: #fff; }
      .gx-tile[data-v="64"] .gx-tile-in { background: #f65e3b; color: #fff; }
      .gx-tile[data-v="128"] .gx-tile-in { background: #edcf72; color: #fff; }
      .gx-tile[data-v="256"] .gx-tile-in { background: #edcc61; color: #fff; }
      .gx-tile[data-v="512"] .gx-tile-in { background: #edc850; color: #fff; }
      .gx-tile[data-v="1024"] .gx-tile-in { background: #edc53f; color: #fff; }
      .gx-tile[data-v="2048"] .gx-tile-in { background: #edc22e; color: #fff; box-shadow: 0 0 14px 2px rgb(237 194 46 / 70%); }
      .gx-tile[data-v="4096"] .gx-tile-in { background: #3c3a32; color: #fff; }

      .gx-mines-wrap { max-width: 100%; overflow-x: auto; padding: 2px; }
      .gx-mines { --cs: min(36px, calc((100vw - 96px) / var(--cols, 9))); display: grid; grid-template-columns: repeat(var(--cols, 9), var(--cs)); gap: 2px; width: max-content; margin: 0 auto; padding: 8px; border-radius: 12px; background: var(--border); user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
      .gx-cell { display: grid; place-items: center; width: var(--cs); height: var(--cs); padding: 0; border: 0; border-radius: 4px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: calc(var(--cs) * .55); font-weight: 800; line-height: 1; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      .gx-cell:hover:not(.open) { filter: brightness(1.12); }
      .gx-cell:focus-visible { outline: 3px solid #fbbc04; outline-offset: 1px; z-index: 1; }
      .gx-cell.open { background: var(--surface); cursor: default; }
      .gx-cell.flag { background: color-mix(in srgb, var(--accent) 80%, #fff); color: #c62828; }
      .gx-cell.flag svg { width: 65%; height: 65%; }
      .gx-cell.mine { color: #424242; background: #ffd9d6; }
      .gx-cell.mine.boom { background: #e53935; color: #fff; }
      .gx-cell.wrong { background: #ffd9d6; opacity: .75; }
      .gx-mine-icon { width: 72%; height: 72%; }
      .gx-cell[data-n="1"] { color: #1e88e5; } .gx-cell[data-n="2"] { color: #43a047; } .gx-cell[data-n="3"] { color: #e53935; }
      .gx-cell[data-n="4"] { color: #5e35b1; } .gx-cell[data-n="5"] { color: #8d6e63; } .gx-cell[data-n="6"] { color: #00acc1; }
      .gx-cell[data-n="7"] { color: var(--text); } .gx-cell[data-n="8"] { color: var(--text-muted); }

      @keyframes gx-pop { 0% { transform: scale(.9); opacity: .4; } 60% { transform: scale(1.04); } 100% { transform: scale(1); opacity: 1; } }
      @keyframes gx-boom { 0% { transform: scale(.6); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
      html.gm-motion .gx-mem-in { transition: transform 380ms cubic-bezier(.2, .8, .2, 1); }
      html.gm-motion .gx-mem-card:not(.up):hover .gx-mem-in { transform: translateY(-3px); }
      html.gm-motion .gx-mem-card.done .gx-mem-front { animation: gx-pop 450ms ease-out; }
      html.gm-motion .gx-tile { transition: transform 110ms ease-out; }
      html.gm-motion .gx-cell.open { animation: gx-pop 160ms ease-out; }
      html.gm-motion .gx-cell.boom { animation: gx-boom 380ms ease-out; }
      html.gm-motion .gx-status.pop { animation: gx-pop 500ms ease-out; }
    `;
    document.head.append(style);
  }

  addStyles();
  window.CyberPulseGamesExtra = [memoryGame(), game2048(), minesweeperGame()];
})();
