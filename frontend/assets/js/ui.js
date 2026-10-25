(() => {
  "use strict";

  const THEME_GROUPS = [
    { id: "google", label: "Classico", colors: ["#1a73e8", "#4285f4", "#188038", "#d93025", "#8430ce"] },
    { id: "cyberpunk-77", label: "Neon", colors: ["#d500f9", "#00a6a6", "#f4511e", "#c2185b", "#3949ab"] },
    { id: "harry-potter", label: "Arcano", colors: ["#7b1fa2", "#b71c1c", "#1b5e20", "#b8860b", "#37474f"] },
    { id: "star-wars", label: "Galassia", colors: ["#1565c0", "#c62828", "#d49b00", "#2e7d32", "#455a64"] },
    { id: "japan", label: "Giappone", colors: ["#c62828", "#ad1457", "#00695c", "#1565c0", "#6d4c41"] },
    { id: "italy", label: "Italia", colors: ["#008c45", "#c62828", "#1565c0", "#6d4c41", "#00695c"] },
    { id: "mexico", label: "Mexico", colors: ["#006847", "#ce1126", "#d97706", "#007c91", "#8e244d"] },
    { id: "solid", label: "Colori Solidi", colors: ["#1a73e8", "#188038", "#d93025", "#8430ce", "#00695c"] },
    { id: "unicorn", label: "Unicorno", colors: ["#a142a5", "#c2185b", "#5e35b1", "#00838f", "#ad6500"] },
  ];
  const MODES = [
    { id: "day", label: "Giorno" },
    { id: "night", label: "Notte" },
    { id: "auto", label: "Auto" },
    { id: "oled", label: "OLED" },
  ];
  const THEME_STORAGE_KEY = "cyber-pulse.theme";
  const MODE_STORAGE_KEY = "cyber-pulse.mode";
  let activeSourceIds = new Set();
  let knownSources = [];
  let activeCategory = "all";
  let sourceOptionsRenderer = () => {};
  let repositionSourcePopover = () => {};

  function addStyles() {
    if (document.querySelector("#cyber-pulse-ui-styles")) return;

    const style = document.createElement("style");
    style.id = "cyber-pulse-ui-styles";
    style.textContent = `
      .cp-dialog {
        width: min(720px, calc(100vw - 32px));
        max-width: 720px;
        max-height: min(84vh, 760px);
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 24px 72px rgb(0 0 0 / 28%);
      }
      .cp-dialog::backdrop { background: rgb(0 0 0 / 52%); backdrop-filter: blur(2px); }
      .cp-panel { max-height: min(84vh, 760px); overflow: auto; }
      .cp-panel-header {
        position: sticky;
        z-index: 1;
        top: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }
      .cp-panel-header h2 { margin: 0 auto 0 0; font-size: 20px; }
      .cp-panel-close {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
      }
      .cp-panel-close:hover { background: var(--surface-muted); }
      .cp-panel-content { padding: 20px; }
      .cp-panel-label { margin: 0 0 12px; color: var(--text-muted); font-size: 13px; font-weight: 600; }
      .cp-mode-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
      .cp-choice {
        min-height: 40px;
        padding: 8px 16px;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
      }
      .cp-choice[aria-pressed="true"] {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
      }
      .cp-theme-group { margin: 0 0 24px; }
      .cp-theme-group h3 { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
      .cp-variant-list { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
      .cp-variant {
        display: grid;
        min-height: 70px;
        justify-items: center;
        align-content: center;
        gap: 7px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
      }
      .cp-variant[aria-pressed="true"] { border: 2px solid var(--accent); }
      .cp-swatch { width: 24px; height: 24px; border: 1px solid rgb(0 0 0 / 12%); border-radius: 50%; }
      .cp-variant-name { font-size: 12px; }
      .cp-ui-status { min-height: 1.5em; margin: 0; color: var(--text-muted); font-size: 13px; }
      .cp-source-popover {
        position: fixed;
        z-index: 20;
        width: min(340px, calc(100vw - 24px));
        max-height: min(70vh, 480px);
        overflow: auto;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 12px 40px rgb(0 0 0 / 22%);
      }
      .cp-source-popover[hidden] { display: none; }
      .cp-source-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
      .cp-source-header h2 { margin: 0 auto 0 0; font-size: 16px; }
      .cp-source-copy { margin: 0; padding: 16px; color: var(--text-muted); font-size: 13px; line-height: 1.5; }
      .cp-source-list { display: grid; gap: 2px; padding: 8px; }
      .cp-source-option { display: flex; min-height: 42px; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; font-size: 14px; }
      .cp-source-option:hover { background: var(--surface-muted); }
      .cp-source-option input { width: 18px; height: 18px; accent-color: var(--accent); }
      .cp-source-link { color: inherit; text-decoration: underline; text-decoration-color: var(--text-muted); text-underline-offset: 3px; }
      .cp-source-link:hover { color: var(--accent); text-decoration-color: var(--accent); }
      .cp-source-footer { padding: 10px 16px; border-top: 1px solid var(--border); }
      .cp-source-clear { padding: 8px 12px; border: 0; border-radius: 18px; background: var(--accent-soft); color: var(--accent); font-weight: 600; cursor: pointer; }
      body.modal-open { overflow: hidden; }
      body.theme-preview { transition: background-color 160ms ease, color 160ms ease; }
      @media (max-width: 520px) {
        .cp-variant-list { gap: 6px; }
        .cp-variant { min-height: 62px; }
        .cp-panel-content { padding: 16px; }
      }
      @media (prefers-reduced-motion: reduce) {
        body.theme-preview { transition: none; }
      }
    `;
    document.head.append(style);
  }

  function getThemeSelection() {
    const root = document.documentElement;
    return {
      theme: root.dataset.theme || "google-1",
      mode: root.dataset.modePref || root.dataset.mode || "day",
    };
  }

  // "Auto" segue la modalità chiara o scura del sistema operativo.
  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  systemDark?.addEventListener?.("change", () => {
    const selection = getThemeSelection();
    if (selection.mode === "auto") applyTheme(selection.theme, "auto", { persist: false });
  });

  function setThemeStatus(message) {
    const status = document.querySelector("#theme-status");
    if (status) status.textContent = message;
  }

  function applyTheme(themeId, mode, options = {}) {
    const validTheme = THEME_GROUPS.some((group) =>
      Array.from({ length: 5 }, (_, index) => `${group.id}-${index + 1}`).includes(themeId),
    );
    const validMode = MODES.some((item) => item.id === mode);

    if (!validTheme || !validMode) {
      throw new TypeError("Tema o modalità non riconosciuti.");
    }

    const root = document.documentElement;
    const body = document.body;
    const group = THEME_GROUPS.find((item) => themeId.startsWith(`${item.id}-`));
    const normalizedGroup = group.id;
    const variant = themeId.slice(group.id.length + 1);

    const preference = mode;
    if (mode === "auto") mode = systemDark?.matches ? "night" : "day";

    root.dataset.theme = themeId;
    root.dataset.mode = mode;
    root.dataset.modePref = preference;
    body.dataset.themeGroup = normalizedGroup;
    body.dataset.themeVariant = variant;
    body.dataset.mode = mode;
    [...body.classList].forEach((className) => {
      if (className.startsWith("theme-group-") || className.startsWith("theme-mode-")) {
        body.classList.remove(className);
      }
    });
    body.classList.add(`theme-group-${normalizedGroup}`, `theme-mode-${mode}`, "theme-preview");

    const themeColor = getComputedStyle(root).getPropertyValue("--page").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);

    if (options.persist !== false) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, themeId);
        localStorage.setItem(MODE_STORAGE_KEY, preference);
        setThemeStatus("Tema applicato e salvato su questo dispositivo.");
      } catch (error) {
        console.error("Impossibile salvare le preferenze del tema.", error);
        setThemeStatus("Tema applicato, ma non è stato possibile salvarlo nel browser.");
      }
    }

    document.dispatchEvent(new CustomEvent("cyberpulse:themechange", {
      detail: { theme: themeId, group: normalizedGroup, variant: Number(variant), mode, preference },
    }));
    return { theme: themeId, group: normalizedGroup, variant: Number(variant), mode, preference };
  }

  function restoreTheme() {
    try {
      let storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const storedMode = localStorage.getItem(MODE_STORAGE_KEY);
      // Temi eliminati: chi li aveva scelti passa al gruppo più vicino.
      const removed = { juventus: "google", vikings: "star-wars", universo: "star-wars" };
      const removedGroup = storedTheme && Object.keys(removed).find((id) => storedTheme.startsWith(`${id}-`));
      if (removedGroup) {
        storedTheme = `${removed[removedGroup]}-${storedTheme.slice(removedGroup.length + 1)}`;
        localStorage.setItem(THEME_STORAGE_KEY, storedTheme);
      }
      if (storedTheme && storedMode) applyTheme(storedTheme, storedMode, { persist: false });
    } catch (error) {
      console.error("Impossibile leggere le preferenze del tema.", error);
    }
  }

  function setupThemeModal() {
    addStyles();
    let dialog = document.querySelector("#theme-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "cp-dialog";
    dialog.id = "theme-dialog";
    dialog.setAttribute("aria-labelledby", "theme-dialog-title");

    const panel = document.createElement("div");
    panel.className = "cp-panel";
    const header = document.createElement("header");
    header.className = "cp-panel-header";
    const title = document.createElement("h2");
    title.id = "theme-dialog-title";
    title.textContent = "Aspetto e temi";
    const closeButton = document.createElement("button");
    closeButton.className = "cp-panel-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Chiudi le impostazioni dell'aspetto");
    closeButton.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    header.append(title, closeButton);

    const content = document.createElement("div");
    content.className = "cp-panel-content";
    const modeLabel = document.createElement("p");
    modeLabel.className = "cp-panel-label";
    modeLabel.textContent = "Modalità";
    const modeList = document.createElement("div");
    modeList.className = "cp-mode-list";
    modeList.setAttribute("role", "group");
    modeList.setAttribute("aria-label", "Modalità di visualizzazione");

    const current = getThemeSelection();
    for (const mode of MODES) {
      const button = document.createElement("button");
      button.className = "cp-choice";
      button.type = "button";
      button.dataset.mode = mode.id;
      button.textContent = mode.label;
      button.setAttribute("aria-pressed", String(mode.id === current.mode));
      button.addEventListener("click", () => {
        const selection = getThemeSelection();
        applyTheme(selection.theme, mode.id);
        updatePressed(modeList, "mode", mode.id);
      });
      modeList.append(button);
    }

    const themeLabel = document.createElement("p");
    themeLabel.className = "cp-panel-label";
    themeLabel.textContent = "Gruppi tematici · 5 varianti ciascuno";
    const groupsContainer = document.createElement("div");
    groupsContainer.className = "cp-theme-groups";
    for (const group of THEME_GROUPS) {
      const section = document.createElement("section");
      section.className = "cp-theme-group";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const variants = document.createElement("div");
      variants.className = "cp-variant-list";
      variants.setAttribute("role", "group");
      variants.setAttribute("aria-label", `Varianti ${group.label}`);

      group.colors.forEach((color, index) => {
        const themeId = `${group.id}-${index + 1}`;
        const button = document.createElement("button");
        button.className = "cp-variant";
        button.type = "button";
        button.dataset.theme = themeId;
        button.setAttribute("aria-label", `${group.label}, variante ${index + 1}`);
        button.setAttribute("aria-pressed", String(themeId === current.theme));
        const swatch = document.createElement("span");
        swatch.className = "cp-swatch";
        swatch.style.backgroundColor = color;
        swatch.setAttribute("aria-hidden", "true");
        button.dataset.accent = color;
        button.dataset.group = group.id;
        const label = document.createElement("span");
        label.className = "cp-variant-name";
        label.textContent = `Variante ${index + 1}`;
        button.append(swatch, label);
        button.addEventListener("click", () => {
          const selection = getThemeSelection();
          applyTheme(themeId, selection.mode);
          updatePressed(groupsContainer, "theme", themeId);
        });
        variants.append(button);
      });

      section.append(heading, variants);
      groupsContainer.append(section);
    }

    const status = document.createElement("p");
    status.className = "cp-ui-status";
    status.id = "theme-status";
    status.setAttribute("role", "status");
    const backdropControls = window.CyberPulseBackdrops?.buildControls();
    content.append(modeLabel, modeList);
    if (backdropControls) content.append(backdropControls);
    content.append(themeLabel, groupsContainer, status);
    panel.append(header, content);
    dialog.append(panel);
    document.body.append(dialog);

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => document.body.classList.remove("modal-open"));
    dialog.addEventListener("cancel", () => document.body.classList.remove("modal-open"));

    window.openThemeModal = () => {
      if (dialog.open) return;
      if (!dialog.isConnected) document.body.append(dialog);
      updatePressed(modeList, "mode", getThemeSelection().mode);
      updatePressed(groupsContainer, "theme", getThemeSelection().theme);
      // Le miniature dipendono dalla modalità corrente, quindi si ridisegnano ad ogni apertura.
      for (const variant of groupsContainer.querySelectorAll(".cp-variant")) {
        variant.style.backgroundImage = window.CyberPulseBackdrops?.thumb(variant.dataset.group, variant.dataset.theme, variant.dataset.accent) ?? "";
        variant.style.backgroundSize = "cover";
        variant.style.backgroundPosition = "center";
        variant.style.backgroundRepeat = "no-repeat";
      }
      dialog.showModal();
      document.body.classList.add("modal-open");
      closeButton.focus();
    };
    document.addEventListener("cyberpulse:themechange", (event) => {
      updatePressed(modeList, "mode", event.detail.preference);
      updatePressed(groupsContainer, "theme", event.detail.theme);
    });
    document.dispatchEvent(new CustomEvent("cyberpulse:themedialog", { detail: { modeList } }));

    return dialog;
  }

  function updatePressed(container, attribute, value) {
    for (const button of container.querySelectorAll(`[data-${attribute}]`)) {
      button.setAttribute("aria-pressed", String(button.dataset[attribute] === value));
    }
  }

  function setupSourceFilter() {
    addStyles();
    const trigger = document.querySelector("#source-filter-button");
    if (!trigger || document.querySelector("#source-filter-popover")) return;

    const popover = document.createElement("section");
    popover.id = "source-filter-popover";
    popover.className = "cp-source-popover";
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-labelledby", "source-filter-title");

    const header = document.createElement("header");
    header.className = "cp-source-header";
    const heading = document.createElement("h2");
    heading.id = "source-filter-title";
    heading.textContent = "Filtra per fonte";
    const close = document.createElement("button");
    close.className = "cp-panel-close";
    close.type = "button";
    close.setAttribute("aria-label", "Chiudi il filtro fonti");
    close.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    header.append(heading, close);

    const copy = document.createElement("p");
    copy.id = "source-filter-copy";
    copy.className = "cp-source-copy";
    const list = document.createElement("div");
    list.className = "cp-source-list";
    list.id = "source-filter-list";
    list.setAttribute("aria-describedby", "source-filter-copy");
    const footer = document.createElement("footer");
    footer.className = "cp-source-footer";
    const clear = document.createElement("button");
    clear.className = "cp-source-clear";
    clear.type = "button";
    clear.textContent = "Rimuovi filtri";
    footer.append(clear);
    popover.append(header, copy, list, footer);
    document.body.append(popover);

    function renderSources() {
      list.replaceChildren();
      if (knownSources.length === 0) {
        copy.textContent = "Il catalogo delle fonti non è ancora stato caricato. Il filtro si attiverà quando le fonti saranno disponibili.";
        list.hidden = true;
        footer.hidden = true;
        return;
      }

      copy.textContent = "Seleziona una o più fonti. Se non ne selezioni, vengono mostrate tutte.";
      list.hidden = false;
      footer.hidden = false;
      knownSources.forEach((source) => {
        const label = document.createElement("label");
        label.className = "cp-source-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = source.id;
        checkbox.checked = activeSourceIds.has(source.id);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) activeSourceIds.add(source.id);
          else activeSourceIds.delete(source.id);
          applySourceFilters();
        });
        const name = document.createElement(source.siteUrl ? "a" : "span");
        name.textContent = source.name;
        if (source.siteUrl) {
          name.href = source.siteUrl;
          name.target = "_blank";
          name.rel = "noopener noreferrer";
          name.className = "cp-source-link";
          name.title = "Apri il sito della fonte";
          name.addEventListener("click", (event) => event.stopPropagation());
        }
        label.append(checkbox, name);
        list.append(label);
      });
    }
    sourceOptionsRenderer = renderSources;

    function positionPopover() {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      popover.style.left = `${left}px`;
      const popoverHeight = popover.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= popoverHeight + 8
        ? rect.bottom + 8
        : Math.max(12, rect.top - popoverHeight - 8);
      popover.style.top = `${top}px`;
    }
    repositionSourcePopover = positionPopover;

    function closePopover() {
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    function togglePopover() {
      if (!popover.hidden) {
        closePopover();
        return;
      }
      renderSources();
      popover.hidden = false;
      positionPopover();
      trigger.setAttribute("aria-expanded", "true");
      close.focus();
    }

    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", popover.id);
    trigger.addEventListener("click", togglePopover);
    close.addEventListener("click", () => {
      closePopover();
      trigger.focus();
    });
    clear.addEventListener("click", () => {
      activeSourceIds.clear();
      renderSources();
      applySourceFilters();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target)) {
        closePopover();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popover.hidden) {
        closePopover();
        trigger.focus();
      }
    });
    window.addEventListener("resize", () => {
      if (!popover.hidden) positionPopover();
    });
    window.addEventListener("scroll", () => {
      if (!popover.hidden) positionPopover();
    }, true);
  }

  function applySourceFilters() {
    applyFeedFilters();
    document.dispatchEvent(new CustomEvent("cyberpulse:sourcefilterchange", {
      detail: { sourceIds: [...activeSourceIds] },
    }));
  }

  function applyFeedFilters() {
    const feed = document.querySelector("#news-feed");
    if (!feed) return;

    const cards = [...feed.querySelectorAll("[data-news-card]")];
    const searchInput = document.querySelector("#news-search");
    const query = searchInput?.value.trim().toLocaleLowerCase("it") || "";
    let visibleCount = 0;

    for (const card of cards) {
      const categories = (card.dataset.category || "").split(/\s+/);
      const categoryMatches = activeCategory === "all" || categories.includes(activeCategory);
      const textMatches = !query || card.textContent.toLocaleLowerCase("it").includes(query);
      const sourceMatches = activeSourceIds.size === 0 || activeSourceIds.has(card.dataset.source);
      const visible = categoryMatches && textMatches && sourceMatches;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    const emptyState = document.querySelector("#empty-state");
    const status = document.querySelector("#feed-status");
    if (emptyState) emptyState.hidden = cards.length > 0;
    if (status) {
      status.textContent = cards.length > 0 && visibleCount === 0
        ? "Nessuna notizia corrisponde ai filtri selezionati."
        : "";
    }
  }

  function setSources(sources) {
    if (!Array.isArray(sources)) {
      throw new TypeError("Le fonti devono essere fornite come array.");
    }

    const normalized = sources.map((source) => {
      if (!source || typeof source.id !== "string" || typeof source.name !== "string") {
        throw new TypeError("Ogni fonte deve avere un id e un nome testuali.");
      }
      return { id: source.id, name: source.name, siteUrl: /^https?:\/\//i.test(source.siteUrl || "") ? source.siteUrl : "" };
    });
    knownSources = normalized;
    const knownIds = new Set(knownSources.map((source) => source.id));
    activeSourceIds = new Set([...activeSourceIds].filter((id) => knownIds.has(id)));
    const popover = document.querySelector("#source-filter-popover");
    if (popover && !popover.hidden) {
      sourceOptionsRenderer();
      repositionSourcePopover();
    }
    return knownSources.length;
  }

  function setupExistingControls() {
    const launcher = document.querySelector("#launcher");
    const closeButton = document.querySelector("#close-launcher");
    let lastLauncherTrigger = null;

    function openLauncher(event) {
      if (!launcher || launcher.open) return;
      lastLauncherTrigger = event.currentTarget;
      launcher.showModal();
      closeButton?.focus();
    }

    function closeLauncher() {
      if (!launcher?.open || launcher.classList.contains("closing")) return;
      launcher.classList.add("closing");
      launcher.addEventListener("animationend", (event) => {
        if (event.target !== launcher) return;
        launcher.classList.remove("closing");
        launcher.close();
      }, { once: true });
    }

    window.closeCyberPulseLauncher = closeLauncher;
    document.querySelector("#open-launcher-menu")?.addEventListener("click", openLauncher);
    closeButton?.addEventListener("click", closeLauncher);
    launcher?.addEventListener("click", (event) => {
      if (event.target === launcher) closeLauncher();
    });
    launcher?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeLauncher();
    });
    launcher?.addEventListener("close", () => {
      if (lastLauncherTrigger?.isConnected) lastLauncherTrigger.focus();
    });
    document.querySelector("[data-launcher-home]")?.addEventListener("click", () => {
      closeLauncher();
      document.querySelector("#home")?.scrollIntoView({ behavior: "smooth" });
    });

    const searchBox = document.querySelector("#search-box");
    const searchInput = document.querySelector("#news-search");
    const searchToggle = document.querySelector("#toggle-search");
    searchToggle?.addEventListener("click", () => {
      const opening = searchBox?.hidden ?? false;
      if (!searchBox || !searchInput) return;
      searchBox.hidden = !opening;
      searchToggle.setAttribute("aria-expanded", String(opening));
      searchToggle.setAttribute("aria-label", opening ? "Chiudi la ricerca" : "Apri la ricerca");
      if (opening) searchInput.focus();
      else {
        searchInput.value = "";
        applyFeedFilters();
        searchToggle.focus();
      }
    });
    searchInput?.addEventListener("input", applyFeedFilters);

    // Delegazione: le categorie vengono create dinamicamente da app.js dopo il caricamento del catalogo.
    document.querySelector(".category-nav, nav[aria-label='Categorie del feed']")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      activeCategory = button.dataset.category || "all";
      if (!document.body.dataset.hub) {
        try { sessionStorage.setItem("cyber-pulse.view", JSON.stringify({ hub: "home", tab: activeCategory })); } catch { /* storage non disponibile */ }
      }
      for (const categoryButton of document.querySelectorAll("[data-category]")) {
        categoryButton.setAttribute("aria-pressed", String(categoryButton === button));
      }
      applyFeedFilters();
      document.dispatchEvent(new CustomEvent("cyberpulse:categorychange", { detail: { category: activeCategory } }));
    });
    applyFeedFilters();
    document.addEventListener("cyberpulse:catalogready", () => {
      try {
        const view = JSON.parse(sessionStorage.getItem("cyber-pulse.view") || "null");
        if (view?.hub !== "home" || !view.tab || view.tab === "all") return;
        const target = [...document.querySelectorAll("[data-category]")].find((item) => item.dataset.category === view.tab);
        target?.click();
      } catch { /* vista non valida */ }
    }, { once: true });
  }

  function setupCategoryScroll() {
    const strip = document.querySelector("#category-strip");
    if (!strip) return;
    strip.addEventListener("wheel", (event) => {
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    }, { passive: false });
    let startX = 0;
    let startLeft = 0;
    let down = false;
    let moved = false;
    strip.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      down = true;
      moved = false;
      startX = event.clientX;
      startLeft = strip.scrollLeft;
    });
    window.addEventListener("pointermove", (event) => {
      if (!down) return;
      const delta = event.clientX - startX;
      if (!moved && Math.abs(delta) > 5) {
        moved = true;
        strip.classList.add("dragging");
      }
      if (moved) strip.scrollLeft = startLeft - delta;
    });
    window.addEventListener("pointerup", () => {
      down = false;
      strip.classList.remove("dragging");
    });
    strip.addEventListener("click", (event) => {
      if (moved) {
        event.stopImmediatePropagation();
        event.preventDefault();
        moved = false;
      }
    }, true);
    strip.addEventListener("focusin", (event) => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" }));
  }

  function initialize() {
    addStyles();
    setupCategoryScroll();
    restoreTheme();
    setupThemeModal();
    setupSourceFilter();
    setupExistingControls();

    const themeLauncherButton = document.querySelector("#open-theme-settings");
    if (themeLauncherButton) {
      themeLauncherButton.disabled = false;
      themeLauncherButton.removeAttribute("aria-label");
      themeLauncherButton.querySelector(".availability")?.remove();
      themeLauncherButton.addEventListener("click", () => {
        document.querySelector("#launcher")?.close();
        window.openThemeModal();
      });
    }
  }

  window.setupThemeModal = setupThemeModal;
  window.applyTheme = applyTheme;
  window.setCyberPulseSources = setSources;
  window.applyCyberPulseSourceFilters = applySourceFilters;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
