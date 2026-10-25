(() => {
  "use strict";

  const KEY_STORAGE = "cyber-pulse.gemini-api-key";
  const LEVEL_STORAGE = "cyber-pulse.level";
  const ERROR_TEXT = {
    UNAUTHENTICATED: "Sessione scaduta: esci e accedi di nuovo.",
    AI_KEY_MISSING: "Inserisci una chiave Gemini valida (Livello AI).",
    AI_KEY_INVALID: "La chiave Gemini non è valida o non è abilitata.",
    AI_QUOTA: "Quota Gemini esaurita sulla tua chiave. Riprova più tardi.",
    RATE_LIMITED: "Troppe richieste AI. Riprova tra qualche minuto.",
    AI_EMPTY: "L'AI non ha prodotto un risultato per questo testo.",
    AI_UNAVAILABLE: "Il servizio AI non risponde. Riprova tra poco.",
    NETWORK: "Backend non raggiungibile. Controlla la connessione.",
    TIMEOUT: "Il servizio ha impiegato troppo tempo. Riprova.",
  };

  function readKey() {
    try {
      return (localStorage.getItem(KEY_STORAGE) || "").trim();
    } catch {
      return "";
    }
  }

  function isEnabled() {
    try {
      return localStorage.getItem(LEVEL_STORAGE) === "ai" && readKey() !== "";
    } catch {
      return false;
    }
  }

  function describe(error) {
    if (error?.code === "AI_UNAVAILABLE" && error.message) return error.message;
    return ERROR_TEXT[error?.code] || "Operazione AI non riuscita. Riprova.";
  }

  async function run(task, payload, signal) {
    const auth = window.CyberPulseAuth;
    if (!auth?.getUser()) throw Object.assign(new Error("auth"), { code: "UNAUTHENTICATED" });
    const apiKey = readKey();
    if (!apiKey) throw Object.assign(new Error("key"), { code: "AI_KEY_MISSING" });
    return window.CyberPulseApi.runAi({ task, ...payload, apiKey, idToken: await auth.getIdToken(), signal });
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-ai-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-ai-styles";
    style.textContent = `
      .cp-ai-button { margin-top: 10px; display: inline-flex; min-height: 34px; align-items: center; gap: 6px; padding: 0 14px; border: 1px solid var(--border); border-radius: 17px; background: transparent; color: var(--accent); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; }
      .cp-ai-button:hover:not(:disabled) { background: var(--accent-soft); }
      .cp-ai-button:disabled { cursor: progress; opacity: .6; }
      .cp-ai-result { margin: 10px 0 0; padding: 10px 12px; border-left: 3px solid var(--accent); border-radius: 4px; background: var(--surface-muted); font-size: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
      .cp-ai-result.error { border-left-color: #d93025; color: #d93025; }
    `;
    document.head.append(style);
  }

  function setResult(node, text, isError) {
    node.textContent = text;
    node.classList.toggle("error", isError);
    node.hidden = false;
  }

  // Aggiunge alla scheda il pulsante "Riassumi con AI". Il testo inviato è quello già mostrato nella scheda.
  function attachSummary(card, item) {
    if (!isEnabled()) return;
    const source = [item.summary || ""].join(" ").trim();
    if (source.length < 40) return;
    addStyles();

    const body = card.querySelector(".news-card-body");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cp-ai-button";
    button.textContent = "✦ Riassumi con AI";
    const result = document.createElement("p");
    result.className = "cp-ai-result";
    result.hidden = true;
    result.setAttribute("role", "status");

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Riassumo…";
      try {
        const data = await run("summarize", { title: item.title, text: source });
        setResult(result, data.text, false);
        button.remove();
      } catch (error) {
        setResult(result, describe(error), true);
        button.disabled = false;
        button.textContent = "✦ Riprova";
      }
    });
    body.append(button, result);
  }

  window.CyberPulseAi = Object.freeze({ isEnabled, attachSummary, run, describe });
})();
