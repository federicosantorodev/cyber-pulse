(() => {
  "use strict";

  const PREF_KEY = "cyber-pulse.backdrop";
  const IMAGE_KEY = "cyber-pulse.backdrop.image";
  const MAX_SIDE = 1400;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;

  const LEVELS = [
    { id: "off", label: "Nessuno" },
    { id: "soft", label: "Discreto" },
    { id: "full", label: "Pieno" },
  ];

  // Per ogni tipo di menu: sfumatura di luce e quanto "velo" copre l'immagine (in %).
  const KINDS = {
    page: { soft: 54, full: 24, veil: "page", glow: "none" },
    header: { soft: 60, full: 32, veil: "surface", glow: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 10%, transparent), transparent 55%)" },
    side: { soft: 50, full: 22, veil: "surface", glow: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent 40%)" },
    panel: { soft: 62, full: 36, veil: "surface", glow: "radial-gradient(90% 55% at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)" },
    pop: { soft: 72, full: 50, veil: "surface", glow: "none" },
  };

  // Ogni gruppo mantiene la propria tavolozza di sfumature.
  const SCENES = {
    google: { extras: ["#ea4335", "#fbbc04", "#34a853"], blob: 0.55 },
    "cyberpunk-77": { extras: ["#00e5ff", "#ff2a6d", "#7c4dff"], blob: 0.45 },
    "harry-potter": { extras: ["#7e57c2", "#26c6da", "#ffd54f"], blob: 0.5 },
    "star-wars": { extras: ["#5c6bc0", "#ec407a", "#101733"], blob: 0.45 },
    japan: { extras: ["#f6ebe0", "#c62828", "#2b2b2b"], blob: 0.18, sun: true },
    italy: { extras: ["#f4efe6", "#008c45", "#cd212a"], blob: 0.35 },
    mexico: { extras: ["#ffb300", "#e53935", "#00897b"], blob: 0.6 },
    solid: { extras: [], blob: 0.3 },
    unicorn: { extras: ["#f8bbd0", "#b39ddb", "#80deea", "#fff59d"], blob: 0.7 },
  };
  const MODE_MIX = { day: ["#ffffff", 0.28], night: ["#000000", 0.08], oled: ["#000000", 0.3] };

  const probe = document.createElement("canvas").getContext("2d");
  function toRgb(color) {
    probe.fillStyle = "#000";
    probe.fillStyle = color;
    const hex = probe.fillStyle;
    if (hex.startsWith("#")) return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const found = hex.match(/\d+(\.\d+)?/g) || [0, 0, 0];
    return found.slice(0, 3).map(Number);
  }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Disegna l'immagine di sfondo del tema e la restituisce come data URL.
  function render({ group, theme, accent, base, mode = "day", w = 720, h = 480 }) {
    const scene = SCENES[group] || SCENES.solid;
    const seed = hash(theme || group);
    const rnd = random(seed);
    const [tint, amount] = MODE_MIX[mode] || MODE_MIX.day;
    const tintRgb = toRgb(tint);
    const palette = [accent, ...scene.extras].map((color) => mix(toRgb(color), tintRgb, amount));
    const baseRgb = toRgb(base);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `rgb(${baseRgb.join(",")})`;
    ctx.fillRect(0, 0, w, h);

    const blobs = scene.sun ? 1 : 5;
    for (let i = 0; i < blobs; i += 1) {
      const color = palette[i % palette.length];
      const x = scene.sun ? w * 0.78 : rnd() * w;
      const y = scene.sun ? h * 0.3 : rnd() * h;
      const radius = (scene.sun ? 0.55 : (i === 0 ? 0.9 : 0.45 + rnd() * 0.5)) * w;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = scene.sun ? 0.75 : (i === 0 ? Math.min(0.9, scene.blob * 1.6) : scene.blob);
      gradient.addColorStop(0, `rgba(${color.map(Math.round).join(",")},${alpha})`);
      gradient.addColorStop(1, `rgba(${color.map(Math.round).join(",")},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    return canvas.toDataURL("image/png");
  }

  function readPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      const visible = Number(raw.visible);
      const clear = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.min(80, Math.max(0, Math.round(n))) : 0;
      };
      return {
        level: LEVELS.some((l) => l.id === raw.level) ? raw.level : "soft",
        custom: raw.custom === true,
        visible: Number.isFinite(visible) ? Math.min(100, Math.max(5, Math.round(visible))) : 20,
        windowsClear: clear(raw.windowsClear),
        cardsClear: clear(raw.cardsClear)
      };
    } catch {
      return { level: "soft", custom: false, visible: 20, windowsClear: 0, cardsClear: 0 };
    }
  }

  function writePrefs(prefs) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* storage non disponibile */ }
  }

  function readImage() {
    try { return localStorage.getItem(IMAGE_KEY) || ""; } catch { return ""; }
  }

  function currentGroup() {
    return document.body?.dataset.themeGroup
      || (document.documentElement.dataset.theme || "google-1").replace(/-\d+$/, "");
  }

  function currentColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      accent: styles.getPropertyValue("--accent").trim() || "#1a73e8",
      base: styles.getPropertyValue("--page").trim() || "#f8f9fa",
      mode: document.documentElement.dataset.mode || "day",
      theme: document.documentElement.dataset.theme || "google-1",
    };
  }

  function targetSize() {
    const ratio = window.devicePixelRatio || 1;
    const aspect = Math.min(2, Math.max(0.5, innerWidth / Math.max(1, innerHeight)));
    const longSide = Math.max(screen.width, screen.height) * ratio;
    let w = aspect >= 1 ? longSide : longSide * aspect;
    let h = w / aspect;
    const scale = Math.min(1, Math.sqrt(2600000 / (w * h)));
    w = Math.max(720, Math.round(w * scale));
    h = Math.max(480, Math.round(h * scale));
    return { w, h };
  }

  const cache = new Map();
  function generated(group) {
    const colors = currentColors();
    const size = targetSize();
    const key = `${colors.theme}|${colors.mode}|${colors.accent}|${colors.base}|${size.w}x${size.h}`;
    if (!cache.has(key)) {
      if (cache.size > 3) cache.clear();
      cache.set(key, render({ group, ...colors, ...size }));
    }
    return cache.get(key);
  }

  function apply() {
    const root = document.documentElement;
    const prefs = readPrefs();
    const custom = prefs.custom ? readImage() : "";
    const style = root.style;

    const windowOpacity = 100 - prefs.windowsClear;
    style.setProperty("--bd-win-alpha", `${windowOpacity}%`);
    style.setProperty("--bd-win-blur", prefs.windowsClear > 0 ? "14px" : "0px");
    style.setProperty("--bd-card-alpha", `${100 - prefs.cardsClear}%`);
    style.setProperty("--bd-card-blur", prefs.cardsClear > 0 ? "10px" : "0px");
    // Le card dentro un contenitore già trasparente non devono sommare l'opacità.
    style.setProperty("--bd-card-nested", prefs.cardsClear > 0
      ? `color-mix(in srgb, var(--surface-muted) ${Math.round((100 - prefs.cardsClear) * 0.4)}%, transparent)`
      : "var(--surface)");

    if (prefs.level === "off") {
      style.setProperty("--bd-art", "none");
      for (const kind of Object.keys(KINDS)) {
        style.setProperty(`--bd-glow-${kind}`, "none");
        style.setProperty(`--bd-veil-${kind}`, "none");
      }
      return;
    }

    const art = custom || generated(currentGroup());
    style.setProperty("--bd-art", `url("${art}")`);
    for (const [kind, config] of Object.entries(KINDS)) {
      const tint = config.veil === "page" ? "var(--page)" : "var(--surface)";
      const base = custom ? 100 - prefs.visible : config[prefs.level];
      const strength = kind === "panel" || kind === "pop" ? Math.round(base * windowOpacity / 100) : base;
      const veil = `color-mix(in srgb, ${tint} ${strength}%, transparent)`;
      style.setProperty(`--bd-veil-${kind}`, `linear-gradient(${veil}, ${veil})`);
      style.setProperty(`--bd-glow-${kind}`, config.glow);
    }
  }

  function layers(kind) {
    return `background-image: var(--bd-glow-${kind}, none), var(--bd-veil-${kind}, none), var(--bd-art, none);
      background-size: auto, auto, cover;
      background-repeat: no-repeat;
      background-position: 0 0, 0 0, center;`;
  }

  // Miniatura dello sfondo di una variante (usata nella finestra Aspetto).
  function thumb(groupId, themeId, accent) {
    const colors = currentColors();
    const uri = render({ group: groupId, theme: themeId, accent, base: colors.base, mode: colors.mode, w: 96, h: 60 });
    return `linear-gradient(color-mix(in srgb, var(--surface) 30%, transparent), color-mix(in srgb, var(--surface) 30%, transparent)), url("${uri}")`;
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-backdrop-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-backdrop-styles";
    style.textContent = `
      html body { ${layers("page")} background-attachment: scroll, scroll, fixed; }
      html body .app-header { ${layers("header")} }
      html body .launcher { ${layers("side")} }
      html body dialog:not(.launcher) { ${layers("panel")} }
      html body .cp-source-popover { ${layers("pop")} }
      html body dialog:not(.launcher), html body .cp-source-popover, html body .lb-pop { background-color: color-mix(in srgb, var(--surface) var(--bd-win-alpha, 100%), transparent); -webkit-backdrop-filter: blur(var(--bd-win-blur, 0px)); backdrop-filter: blur(var(--bd-win-blur, 0px)); }
      html body .news-card, html body .cp-story, html body .cp-headlines, html body .fy-section, html body .arena-card, html body .mu-card, html body .gm-tile { background-color: color-mix(in srgb, var(--surface) var(--bd-card-alpha, 100%), transparent); -webkit-backdrop-filter: blur(var(--bd-card-blur, 0px)); backdrop-filter: blur(var(--bd-card-blur, 0px)); }
      html body .fy-section .news-card, html body .cp-headlines .news-card, html body .cp-story .news-card { background-color: var(--bd-card-nested, var(--surface)); -webkit-backdrop-filter: none; backdrop-filter: none; }
      html body .cp-panel-header, html body .cp-set-detail-header { background-color: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(6px); }
      html body .cp-set-nav { background-color: color-mix(in srgb, var(--surface-muted) 86%, transparent); }
      html body .gm-tile-icon { background: color-mix(in srgb, var(--tile) 62%, var(--accent)); }
      html body .gm-board { background-color: color-mix(in srgb, color-mix(in srgb, var(--accent) 16%, var(--surface)) var(--bd-card-alpha, 100%), transparent); background-image: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
      html body .gm-slot { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
      html body .gm-waste, html body .gm-col { border-color: transparent; }
      html body .gm-found::after { color: var(--accent); opacity: .5; }
      html body .gm-found.red::after { color: #c62828; opacity: .5; }
      html body .gx-2048 { background: color-mix(in srgb, var(--accent) 22%, var(--border)); }
      html body .gx-mines { background: color-mix(in srgb, var(--accent) 22%, var(--border)); }
      html body .gx-tile-in { background: color-mix(in srgb, var(--accent) 20%, var(--surface)); color: var(--text); }
      html body .gx-tile[data-v="4"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 30%, var(--surface)); color: var(--text); }
      html body .gx-tile[data-v="8"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 34%, var(--surface)); color: var(--text); }
      html body .gx-tile[data-v="16"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 48%, var(--surface)); color: var(--text); }
      html body .gx-tile[data-v="32"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 62%, var(--surface)); color: var(--on-accent); }
      html body .gx-tile[data-v="64"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 76%, var(--surface)); color: var(--on-accent); }
      html body .gx-tile[data-v="128"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 88%, var(--surface)); color: var(--on-accent); }
      html body .gx-tile[data-v="256"] .gx-tile-in { background: var(--accent); color: var(--on-accent); }
      html body .gx-tile[data-v="512"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 86%, var(--text)); color: var(--on-accent); }
      html body .gx-tile[data-v="1024"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 72%, var(--text)); color: var(--on-accent); }
      html body .gx-tile[data-v="2048"] .gx-tile-in { background: color-mix(in srgb, var(--accent) 58%, var(--text)); color: var(--on-accent); box-shadow: 0 0 16px 3px color-mix(in srgb, var(--accent) 70%, transparent); }
      html body .gx-tile[data-v="4096"] .gx-tile-in { background: var(--text); color: var(--surface); }
      html body .gx-mem-card.done .gx-mem-front { box-shadow: 0 0 0 3px var(--accent); }
      .cp-bd-controls { display: grid; gap: 14px; margin: 0 0 24px; }
      .cp-bd-controls .cp-panel-label { margin: 0; }
      .cp-bd-controls .cp-settings-hint, .cp-bd-controls .cp-ui-status { margin: 0; }
      .cp-bd-controls .cp-settings-hint { color: var(--text-muted); font-size: 13px; line-height: 1.5; }
      .cp-bd-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .cp-bd-opacity { display: grid; grid-template-columns: minmax(120px, 170px) 1fr 4ch; align-items: center; gap: 12px; margin-top: 0; font-size: 0.9rem; }
      .cp-bd-opacity[hidden] { display: none; }
      .cp-bd-opacity input { width: 100%; accent-color: var(--accent); }
      .cp-bd-opacity output { min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; }
      .cp-bd-previews { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .cp-bd-preview { display: grid; height: 86px; place-items: end start; padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; color: var(--text); font-size: 12px; font-weight: 600; }
      .cp-bd-preview[data-kind="page"] { background-color: var(--page); ${layers("page")} }
      .cp-bd-preview[data-kind="side"] { background-color: var(--surface); ${layers("side")} }
      .cp-bd-preview[data-kind="panel"] { background-color: var(--surface); ${layers("panel")} }
      .cp-bd-preview[data-kind="header"] { background-color: var(--surface); ${layers("header")} }
      .cp-variant .cp-variant-name { padding: 0 6px; border-radius: 8px; background: color-mix(in srgb, var(--surface) 70%, transparent); }
      .cp-bd-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      @media (max-width: 520px) { .cp-bd-previews { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;
    document.head.append(style);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile.")); };
      img.src = url;
    });
  }

  async function shrink(file) {
    const img = await loadImage(file);
    const ratio = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  // Sezione per la finestra "Aspetto e temi".
  function buildControls() {
    addStyles();
    const box = document.createElement("section");
    box.className = "cp-bd-controls";
    box.setAttribute("aria-label", "Sfondi dei menu");

    const label = document.createElement("p");
    label.className = "cp-panel-label";
    label.textContent = "Sfondi dei menu";

    const levelRow = document.createElement("div");
    levelRow.className = "cp-bd-row";
    levelRow.setAttribute("role", "group");
    levelRow.setAttribute("aria-label", "Intensità degli sfondi");

    const previews = document.createElement("div");
    previews.className = "cp-bd-previews";
    for (const [kind, name] of [["page", "Pagina"], ["side", "Menu laterale"], ["panel", "Finestre"], ["header", "Intestazione"]]) {
      const tile = document.createElement("div");
      tile.className = "cp-bd-preview";
      tile.dataset.kind = kind;
      tile.textContent = name;
      previews.append(tile);
    }

    const status = document.createElement("p");
    status.className = "cp-ui-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const hint = document.createElement("p");
    hint.className = "cp-settings-hint";
    hint.textContent = "Ogni tema ha il suo sfondo, fatto di sfumature morbide nei colori della variante scelta e adattato a ogni menu. Puoi usare anche una tua immagine: viene ridotta e salvata solo su questo dispositivo, sotto un velo che mantiene il testo leggibile.";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.className = "cp-bd-file";
    fileInput.tabIndex = -1;
    fileInput.setAttribute("aria-hidden", "true");

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "cp-choice";
    pick.textContent = "Usa una mia immagine";
    pick.addEventListener("click", () => fileInput.click());

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cp-choice";
    remove.textContent = "Torna allo sfondo del tema";

    const opacityRow = document.createElement("div");
    opacityRow.className = "cp-bd-opacity";
    const opacityLabel = document.createElement("label");
    opacityLabel.textContent = "Visibilità dell'immagine";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "5";
    slider.max = "100";
    slider.step = "5";
    slider.id = "cp-bd-visible";
    opacityLabel.htmlFor = slider.id;
    const value = document.createElement("output");
    value.htmlFor = slider.id;
    slider.addEventListener("input", () => {
      writePrefs({ ...readPrefs(), visible: Number(slider.value) });
      value.textContent = `${slider.value}%`;
      apply();
    });
    opacityRow.append(opacityLabel, slider, value);

    const clearRows = [["windowsClear", "Trasparenza finestre", "cp-bd-windows"], ["cardsClear", "Trasparenza card", "cp-bd-cards"]].map(([key, text, id]) => {
      const row = document.createElement("div");
      row.className = "cp-bd-opacity";
      const rowLabel = document.createElement("label");
      rowLabel.textContent = text;
      rowLabel.htmlFor = id;
      const range = document.createElement("input");
      range.type = "range";
      range.min = "0";
      range.max = "80";
      range.step = "5";
      range.id = id;
      const out = document.createElement("output");
      out.htmlFor = id;
      range.addEventListener("input", () => {
        writePrefs({ ...readPrefs(), [key]: Number(range.value) });
        out.textContent = `${range.value}%`;
        apply();
      });
      row.append(rowLabel, range, out);
      return { key, range, out, row };
    });

    const sync = () => {
      const prefs = readPrefs();
      levelRow.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.level === prefs.level)));
      const hasCustom = prefs.custom && Boolean(readImage());
      remove.hidden = !hasCustom;
      opacityRow.hidden = !hasCustom;
      slider.value = String(prefs.visible);
      value.textContent = `${prefs.visible}%`;
      for (const item of clearRows) {
        item.range.value = String(prefs[item.key]);
        item.out.textContent = `${prefs[item.key]}%`;
      }
    };

    for (const level of LEVELS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cp-choice";
      button.dataset.level = level.id;
      button.textContent = level.label;
      button.addEventListener("click", () => {
        writePrefs({ ...readPrefs(), level: level.id });
        apply();
        sync();
        status.textContent = level.id === "off" ? "Sfondi disattivati." : `Sfondi: ${level.label.toLowerCase()}.`;
      });
      levelRow.append(button);
    }

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) {
        status.textContent = "Scegli un'immagine (JPG, PNG, WebP) fino a 15 MB.";
        return;
      }
      try {
        const data = await shrink(file);
        localStorage.setItem(IMAGE_KEY, data);
        const prefs = readPrefs();
        writePrefs({ ...prefs, level: prefs.level === "off" ? "soft" : prefs.level, custom: true });
        apply();
        sync();
        status.textContent = "Sfondo personale applicato.";
      } catch (error) {
        console.error("Sfondo personale non salvato.", error);
        status.textContent = "Non è stato possibile salvare l'immagine: prova con una più piccola.";
      }
    });

    remove.addEventListener("click", () => {
      try { localStorage.removeItem(IMAGE_KEY); } catch { /* storage non disponibile */ }
      writePrefs({ ...readPrefs(), custom: false });
      apply();
      sync();
      status.textContent = "Sfondo del tema ripristinato.";
    });

    const actions = document.createElement("div");
    actions.className = "cp-bd-row";
    actions.append(pick, remove);
    box.append(label, levelRow, previews, actions, opacityRow, ...clearRows.map((item) => item.row), hint, fileInput, status);
    sync();
    return box;
  }

  document.addEventListener("cyberpulse:themechange", apply);
  document.addEventListener("DOMContentLoaded", () => { addStyles(); apply(); }, { once: true });
  if (document.readyState !== "loading") { addStyles(); apply(); }

  window.CyberPulseBackdrops = Object.freeze({ render, thumb, apply, buildControls, groups: Object.keys(SCENES) });
})();
