/* Cyber Pulse - prima pagina.
 * Mostra le storie già raggruppate e ordinate dal backend (senza AI e senza costi).
 * Gemini interviene solo su richiesta, per la sintesi estesa di una singola storia. */
(() => {
  "use strict";

  const STORY_PREFIX = "cyber-pulse.story.";
  const relativeTime = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

  function hashText(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function session(key, value) {
    try {
      if (value === undefined) {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // La cache è solo un'ottimizzazione.
    }
    return null;
  }

  function oneLine(text, max) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function ago(value) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return "";
    const minutes = Math.round((ms - Date.now()) / 60000);
    if (Math.abs(minutes) < 60) return relativeTime.format(Math.min(minutes, 0), "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 48) return relativeTime.format(hours, "hour");
    return relativeTime.format(Math.round(hours / 24), "day");
  }

  // Impaginazione a muratura: ogni elemento occupa tante righe da 8px quante ne servono alla sua altezza,
  // così le card più basse riempiono i vuoti lasciati dalle più alte.
  const MASONRY_ROW = 8;

  function masonry(container) {
    if (!container || container._cpMasonry) return;
    container.classList.add("cp-masonry");
    const place = (child) => {
      if (!(child instanceof HTMLElement)) return;
      const gap = parseFloat(getComputedStyle(container).columnGap) || 16;
      if (!container.classList.contains("cp-masonry")) {
        child.style.gridRowEnd = "";
        return;
      }
      const box = child.getBoundingClientRect();
      const own = getComputedStyle(child);
      const height = box.height + (parseFloat(own.marginTop) || 0) + (parseFloat(own.marginBottom) || 0);
      child.style.gridRowEnd = box.height === 0 ? "" : `span ${Math.ceil((height + gap) / MASONRY_ROW)}`;
    };
    const resizes = new ResizeObserver((entries) => entries.forEach((entry) => place(entry.target)));
    const watch = (child) => {
      if (child instanceof HTMLElement) {
        resizes.observe(child);
        place(child);
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        record.removedNodes.forEach((node) => node instanceof HTMLElement && resizes.unobserve(node));
        record.addedNodes.forEach(watch);
      }
    }).observe(container, { childList: true });
    container._cpMasonry = true;
    Array.from(container.children).forEach(watch);
    window.addEventListener("resize", () => Array.from(container.children).forEach(place));
  }

  function addStyles() {
    if (document.querySelector("#cp-front-style")) return;
    const style = document.createElement("style");
    style.id = "cp-front-style";
    style.textContent = `
      .cp-masonry { grid-auto-rows: ${MASONRY_ROW}px; grid-auto-flow: row dense; row-gap: 0; align-items: start; }
      .cp-front { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
      .cp-front > :not([data-news-card]) { grid-column: 1 / -1; }
      .cp-section-title { margin: 12px 0 0; padding-bottom: 6px; border-bottom: 2px solid var(--accent); font-size: 20px; }
      .cp-front-note { margin: 0; color: var(--text-muted); font-size: 13px; }
      .cp-front-note.error { color: #d93025; }
      .cp-story, .cp-headlines { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
      .cp-story-image { width: 100%; height: 170px; border-radius: 12px; background: var(--surface-muted); object-fit: cover; }
      .cp-story-badge { align-self: flex-start; padding: 2px 10px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 600; }
      .cp-story-title { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
      .cp-story-summary { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.55; }
      .cp-story-meta { margin: 0; color: var(--text-muted); font-size: 12px; }
      .cp-story-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .cp-story-open, .cp-story-read { display: inline-flex; align-items: center; min-height: 36px; padding: 0 18px; border: 1px solid var(--accent); border-radius: 18px; background: var(--accent); color: var(--on-accent); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; text-decoration: none; }
      .cp-story-read, .cp-story-ai { background: transparent; color: var(--accent); }
      .cp-story-ai { min-height: 34px; padding: 0 14px; border: 1px solid var(--border); border-radius: 17px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; justify-self: start; }
      .cp-story-open:disabled, .cp-story-ai:disabled { cursor: progress; opacity: .6; }
      .cp-story-detail { display: grid; gap: 8px; padding: 12px; border-left: 3px solid var(--accent); border-radius: 4px; background: var(--surface-muted); }
      .cp-story-detail p { margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
      .cp-story-detail .cp-story-gen { color: var(--text-muted); font-size: 12px; white-space: normal; }
      .cp-story-detail .error { color: #d93025; }
      .cp-story-links { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 13px; }
      .cp-story-links a { color: var(--accent); }
      .cp-story-links span { color: var(--text-muted); }
      .cp-headlines h2 { margin: 0; font-size: 17px; }
      .cp-headlines ol { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
      .cp-headline-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 4px 8px; padding: 8px 10px; border-radius: 8px; }
      .cp-headline-row:hover { background: var(--surface-muted); }
      .cp-headline-link { color: var(--text); font-size: 14px; line-height: 1.4; text-decoration: none; overflow-wrap: anywhere; }
      .cp-headline-link:hover { color: var(--accent); }
      .cp-headline-source { grid-column: 1; color: var(--text-muted); font-size: 11px; }
      .cp-headline-row .cp-story-detail { grid-column: 1 / -1; }
      @media (min-width: 720px) {
        .cp-front .cp-story-hero { grid-column: span 2; }
        .cp-front .cp-story-hero .cp-story-image { height: 280px; }
        .cp-front .cp-story-hero .cp-story-title { font-size: 26px; }
      }
      @media (max-width: 719px) {
        .cp-front { column-gap: 14px; }
        .cp-story { padding: 14px; }
        .cp-story-image { height: 200px; }
      }
    `;
    document.head.append(style);
  }

  async function loadDetail(cacheKey, title, items, context) {
    const cached = session(STORY_PREFIX + cacheKey);
    if (cached) return cached;
    const text = items.map((item, index) => `[${index + 1}] ${oneLine(item.sourceName, 40)} | ${oneLine(item.title, 200)} | ${oneLine(item.summary, 600)}`).join("\n");
    const data = await window.CyberPulseAi.run("story", { title, text, context });
    session(STORY_PREFIX + cacheKey, data.text);
    return data.text;
  }

  // Sintesi estesa Gemini: parte solo quando l'utente la richiede.
  function attachAiSummary(trigger, host, title, items, context, labels) {
    let loaded = false;
    let busy = false;
    const detail = el("div", "cp-story-detail");
    detail.hidden = true;
    host.append(detail);
    const key = hashText(items.map((item) => item.id || item.url || item.title).join("|") + context);

    trigger.addEventListener("click", async () => {
      if (busy) return;
      if (loaded) {
        detail.hidden = !detail.hidden;
        trigger.setAttribute("aria-expanded", String(!detail.hidden));
        trigger.textContent = detail.hidden ? labels[0] : labels[1];
        return;
      }
      busy = true;
      trigger.disabled = true;
      detail.hidden = false;
      detail.replaceChildren(el("p", "cp-story-gen", "✦ Gemini sta scrivendo la sintesi…"));
      try {
        const text = await loadDetail(key, title, items, context);
        detail.replaceChildren(el("p", "", text), el("p", "cp-story-gen", "Sintesi generata da Gemini. Verifica sempre le testate originali."));
        loaded = true;
        trigger.setAttribute("aria-expanded", "true");
        trigger.textContent = labels[1];
      } catch (error) {
        detail.replaceChildren(el("p", "error", window.CyberPulseAi.describe(error)));
        trigger.textContent = "Riprova";
      } finally {
        busy = false;
        trigger.disabled = false;
      }
    });
  }

  function aiEnabled() {
    return Boolean(window.CyberPulseAi?.isEnabled());
  }

  function linkList(members) {
    const links = el("ul", "cp-story-links");
    for (const member of members) {
      const href = safeUrl(member.url);
      if (!href) continue;
      const li = document.createElement("li");
      const a = el("a", "", member.sourceName || member.sourceId || "Fonte");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.append(a, el("span", "", ` — ${oneLine(member.title, 140)}`));
      links.append(li);
    }
    return links;
  }

  function buildStory(story, index, context, prefs, extra) {
    const wide = index > 0 && index % 5 === 3;
    const card = el("article", `cp-story${index === 0 ? " cp-story-hero" : wide ? " cp-story-wide" : ""}`);
    card.dataset.newsCard = "";
    card.dataset.category = story.categoryId || "";
    card.dataset.source = story.members[0]?.sourceId || "";

    const imageUrl = safeUrl(story.imageUrl);
    if (imageUrl && prefs.showImages) {
      const image = el("img", "cp-story-image");
      image.src = imageUrl;
      image.alt = "";
      image.loading = index < 2 ? "eager" : "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove(), { once: true });
      card.append(image);
    }

    if (story.members.length > 1) card.append(el("span", "cp-story-badge", `${story.members.length} testate ne parlano`));
    card.append(el("h2", "cp-story-title", story.title));
    if (prefs.showSummary && story.summary) card.append(el("p", "cp-story-summary", oneLine(story.summary, 280)));
    const names = story.members.map((member) => member.sourceName || member.sourceId).filter(Boolean);
    const when = ago(story.publishedAt);
    card.append(el("p", "cp-story-meta", [names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : ""), when].filter(Boolean).join(" · ")));

    const actions = el("div", "cp-story-actions");
    const open = el("button", "cp-story-open", story.members.length > 1 ? "Tutte le fonti" : "Apri");
    open.type = "button";
    open.setAttribute("aria-expanded", "false");
    actions.append(open);
    const href = safeUrl(story.url);
    if (href) {
      const read = el("a", "cp-story-read", "Leggi");
      read.href = href;
      read.target = "_blank";
      read.rel = "noopener noreferrer";
      actions.append(read);
    }
    const extraAction = extra ? extra(story) : null;
    if (extraAction) actions.append(extraAction);
    card.append(actions);

    const detail = el("div", "cp-story-detail");
    detail.hidden = true;
    detail.append(linkList(story.members));
    if (aiEnabled()) {
      const ai = el("button", "cp-story-ai", "✦ Sintesi estesa con Gemini");
      ai.type = "button";
      ai.setAttribute("aria-expanded", "false");
      detail.append(ai);
      const items = story.members.map((member, i) => ({ ...member, summary: i === 0 ? story.summary : "" }));
      attachAiSummary(ai, detail, story.title, items, context, ["✦ Sintesi estesa con Gemini", "Nascondi sintesi"]);
    }
    card.append(detail);
    open.addEventListener("click", () => {
      detail.hidden = !detail.hidden;
      open.setAttribute("aria-expanded", String(!detail.hidden));
    });
    return card;
  }

  function buildHeadlines(headlines, context, title, extra) {
    if (headlines.length === 0) return null;
    const card = el("section", "cp-headlines");
    card.dataset.newsCard = "";
    card.dataset.category = headlines[0].categoryId || "";
    card.dataset.source = headlines[0].sourceId || "";
    card.append(el("h2", "", title || "Altre notizie"));
    const list = document.createElement("ol");
    for (const item of headlines) {
      const row = el("li", "cp-headline-row");
      row.dataset.source = item.sourceId || "";
      row.dataset.category = item.categoryId || "";
      const href = safeUrl(item.url);
      const title = href ? el("a", "cp-headline-link", oneLine(item.title, 200)) : el("span", "cp-headline-link", oneLine(item.title, 200));
      if (href) {
        title.href = href;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
      }
      row.append(title);
      const extraAction = extra ? extra(item) : null;
      if (extraAction) row.append(extraAction);
      if (aiEnabled()) {
        const ai = el("button", "cp-story-ai", "✦");
        ai.type = "button";
        ai.title = "Sintesi Gemini";
        ai.setAttribute("aria-label", `Sintesi Gemini: ${oneLine(item.title, 80)}`);
        ai.setAttribute("aria-expanded", "false");
        row.append(ai);
        row.append(el("span", "cp-headline-source", [item.sourceName || item.sourceId, ago(item.publishedAt)].filter(Boolean).join(" · ")));
        attachAiSummary(ai, row, item.title, [item], context, ["✦", "✦"]);
      } else {
        row.append(el("span", "cp-headline-source", [item.sourceName || item.sourceId, ago(item.publishedAt)].filter(Boolean).join(" · ")));
      }
      list.append(row);
    }
    card.append(list);
    return card;
  }

  // Applica fonti attive e parole silenziate scelte dall'utente.
  function filterFront(front, enabled, mute) {
    const muted = (text) => mute.length > 0 && mute.some((word) => String(text || "").toLocaleLowerCase("it").includes(word));
    const stories = [];
    for (const story of front.stories) {
      const members = enabled ? story.members.filter((member) => enabled.has(member.sourceId)) : story.members;
      if (members.length === 0 || muted(story.title)) continue;
      stories.push({ ...story, members });
    }
    const headlines = front.headlines.filter((item) => (!enabled || enabled.has(item.sourceId)) && !muted(item.title));
    return { stories, headlines };
  }

  // Sostituisce il contenuto del contenitore con la prima pagina. Restituisce il numero di card mostrate.
  function renderFront(container, front, options = {}) {
    addStyles();
    const prefs = window.CyberPulseCards.getPrefs();
    const context = oneLine(options.context, 200);
    const filtered = filterFront(front, options.enabled || null, prefs.mute);

    for (const card of container.querySelectorAll(":scope > [data-news-card], :scope > .cp-section-title")) card.remove();
    container.querySelector(":scope > .cp-front-note")?.remove();
    container.classList.add("cp-front");
    masonry(container);
    container.classList.add("cp-masonry");
    container.dataset.mode = "front";

    const extra = typeof options.actions === "function" ? options.actions : null;
    const fragment = document.createDocumentFragment();
    // Le notizie brevi, molto alte in un'unica card, lasciano vuoti nelle colonne: le divido in card da 6
    // righe e le distribuisco a intervalli regolari tra le storie.
    const HEADLINES_PER_CARD = 6;
    const place = (stories, headlines, title) => {
      const chunks = [];
      for (let at = 0; at < headlines.length; at += HEADLINES_PER_CARD) {
        const card = buildHeadlines(headlines.slice(at, at + HEADLINES_PER_CARD), context, title, extra);
        if (card) chunks.push(card);
      }
      const step = Math.max(2, Math.floor(stories.length / (chunks.length + 1)) + 1);
      let next = 0;
      stories.forEach((story, index) => {
        if (next < chunks.length && index >= Math.min(2, stories.length) + next * step) fragment.append(chunks[next++]);
        fragment.append(buildStory(story, index, context, prefs, extra));
      });
      while (next < chunks.length) fragment.append(chunks[next++]);
      return chunks.length;
    };
    let count = 0;
    if (options.sections) {
      // Home: una sezione per categoria, nell'ordine scelto dall'utente.
      for (const section of options.sections) {
        if (section.hidden) continue;
        const stories = filtered.stories.filter((story) => story.categoryId === section.id);
        const headlines = filtered.headlines.filter((item) => item.categoryId === section.id);
        if (stories.length === 0 && headlines.length === 0) continue;
        fragment.append(el("h2", "cp-section-title", section.name));
        count += stories.length + place(stories, headlines, "Altre notizie");
      }
    } else {
      count = filtered.stories.length + place(filtered.stories, filtered.headlines, options.headlinesTitle);
    }
    const anchor = options.anchor || null;
    if (anchor && anchor.parentNode === container) container.insertBefore(fragment, anchor);
    else container.append(fragment);
    window.applyCyberPulseSourceFilters?.();
    return count;
  }

  // Ripristina il contenitore in modalità standard (altri aspetti delle card).
  function reset(container) {
    container.classList.remove("cp-front", "cp-masonry");
    for (const child of container.children) child.style.gridRowEnd = "";
    delete container.dataset.mode;
    container.querySelector(":scope > .cp-front-note")?.remove();
    for (const title of container.querySelectorAll(":scope > .cp-section-title")) title.remove();
  }

  addStyles();
  window.CyberPulseFront = Object.freeze({ renderFront, reset, masonry });
})();
