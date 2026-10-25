(() => {
  "use strict";

  const LAST_UID_KEY = "cyber-pulse.last-uid";
  // Dati personali del browser: vengono azzerati quando entra un utente diverso dal precedente.
  const PERSONAL_KEYS = [
    "cyber-pulse.onboarding-complete",
    "cyber-pulse.level",
    "cyber-pulse.keywords",
    "cyber-pulse.gemini-api-key",
    "cyber-pulse.source-overrides",
    "cyber-pulse.category-order",
    "cyber-pulse.news-cache",
  ];
  const MIN_PASSWORD = 8;
  const RESEND_SECONDS = 30;

  const GOOGLE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  const ERRORS = {
    "auth/invalid-credential": "Email o password non corretti.",
    "auth/wrong-password": "Email o password non corretti.",
    "auth/user-not-found": "Email o password non corretti.",
    "auth/invalid-login-credentials": "Email o password non corretti.",
    "auth/email-already-in-use": "Esiste già un account con questa email. Prova ad accedere.",
    "auth/weak-password": `La password è troppo debole: usa almeno ${MIN_PASSWORD} caratteri.`,
    "auth/invalid-email": "Indirizzo email non valido.",
    "auth/too-many-requests": "Troppi tentativi. Riprova tra qualche minuto.",
    "auth/network-request-failed": "Connessione assente o instabile. Riprova.",
    "auth/popup-blocked": "Il browser ha bloccato la finestra di accesso. Consenti i popup per questo sito e riprova.",
    "auth/operation-not-allowed": "Questo metodo di accesso non è attivo nel progetto Firebase.",
    "auth/unauthorized-domain": "Questo indirizzo non è tra i domini autorizzati in Firebase.",
    "auth/user-disabled": "Questo account è stato disattivato.",
    "auth/popup-closed-by-user": "",
    "auth/cancelled-popup-request": "",
  };

  const state = {
    sdk: null,
    auth: null,
    user: null,
    view: "loading",
    mode: "signin",
    message: "",
    messageKind: "error",
    busy: false,
    resendUntil: 0,
  };
  let dialog = null;
  let content = null;
  let resendTimer = 0;

  function getUser() {
    return state.user ? { uid: state.user.uid, email: state.user.email || "" } : null;
  }

  async function getIdToken(forceRefresh = false) {
    if (!state.user) throw new Error("Nessun utente connesso.");
    return state.user.getIdToken(forceRefresh);
  }

  function describeError(error) {
    const code = error && error.code;
    if (code && Object.prototype.hasOwnProperty.call(ERRORS, code)) return ERRORS[code];
    return "Operazione non riuscita. Riprova.";
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, "");
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
    }
    node.append(...children.filter(Boolean));
    return node;
  }

  function addStyles() {
    if (document.querySelector("#cyber-pulse-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "cyber-pulse-auth-styles";
    style.textContent = `
      .cp-auth {
        width: min(420px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        padding: 0;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 24px 72px rgb(0 0 0 / 32%);
      }
      .cp-auth::backdrop { background: rgb(0 0 0 / 72%); backdrop-filter: blur(6px); }
      .cp-auth-body { display: grid; gap: 14px; padding: 28px 24px 24px; }
      .cp-auth-brand { display: flex; align-items: center; gap: 12px; }
      .cp-auth-brand img { width: 40px; height: 40px; border-radius: 10px; }
      .cp-auth-brand strong { font-size: 20px; }
      .cp-auth-title { margin: 4px 0 0; font-size: 22px; font-weight: 600; letter-spacing: -.2px; }
      .cp-auth-copy { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
      .cp-auth-form { display: grid; gap: 12px; }
      .cp-auth-field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
      .cp-auth-input {
        min-height: 46px;
        padding: 0 14px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface-muted);
        color: var(--text);
        font: inherit;
        font-size: 15px;
        font-weight: 400;
      }
      .cp-auth-input:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent); outline-offset: 1px; }
      .cp-auth-button {
        display: inline-flex;
        min-height: 46px;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 0 18px;
        border: 1px solid var(--border);
        border-radius: 23px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
      }
      .cp-auth-button:hover:not(:disabled) { background: var(--surface-muted); }
      .cp-auth-button.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
      .cp-auth-button.primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--accent); }
      .cp-auth-button:disabled { cursor: not-allowed; opacity: .55; }
      .cp-auth-link {
        padding: 6px 4px;
        border: 0;
        background: transparent;
        color: var(--accent);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
      }
      .cp-auth-link:hover:not(:disabled) { text-decoration: underline; }
      .cp-auth-link:disabled { color: var(--text-muted); cursor: default; }
      .cp-auth-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px; }
      .cp-auth-divider { display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-size: 12px; }
      .cp-auth-divider::before, .cp-auth-divider::after { content: ""; height: 1px; flex: 1; background: var(--border); }
      .cp-auth-message { min-height: 1.4em; margin: 0; font-size: 13px; line-height: 1.45; }
      .cp-auth-message.error { color: #d93025; }
      .cp-auth-message.info { color: var(--text-muted); }
      .cp-auth-spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: cp-auth-spin 800ms linear infinite; }
      .cp-auth-center { display: grid; justify-items: center; gap: 14px; padding: 12px 0; text-align: center; }
      @keyframes cp-auth-spin { to { transform: rotate(360deg); } }
      body.cp-auth-active { overflow: hidden; }
      .launcher-account { margin-top: auto; padding: 4px 12px 16px; }
      .launcher-account-email { margin: 0; padding: 8px 16px 4px; overflow: hidden; color: var(--text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    `;
    document.head.append(style);
  }

  function ensureDialog() {
    if (dialog) return;
    addStyles();
    content = el("div", { class: "cp-auth-body" });
    dialog = el("dialog", { class: "cp-auth", "aria-labelledby": "cp-auth-title" }, content);
    // Il login è obbligatorio: Esc non può chiudere la finestra.
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    document.body.append(dialog);
  }

  function openWall() {
    ensureDialog();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("cp-auth-active");
  }

  function closeWall() {
    if (dialog?.open) dialog.close();
    document.body.classList.remove("cp-auth-active");
  }

  function brand() {
    return el("div", { class: "cp-auth-brand" },
      el("img", { src: "./assets/icons/logo.svg", alt: "", width: "40", height: "40" }),
      el("strong", { text: "Cyber Pulse" }));
  }

  function messageNode() {
    return el("p", {
      class: `cp-auth-message ${state.messageKind}`,
      role: state.messageKind === "error" ? "alert" : "status",
      "aria-live": "polite",
      text: state.message,
    });
  }

  function setMessage(text, kind = "error") {
    state.message = text;
    state.messageKind = kind;
  }

  function show(view, message = "", kind = "error") {
    state.view = view;
    setMessage(message, kind);
    render();
  }

  function render() {
    openWall();
    const title = (text) => el("h1", { class: "cp-auth-title", id: "cp-auth-title", text });
    let nodes;

    if (state.view === "loading") {
      nodes = [brand(), el("div", { class: "cp-auth-center", role: "status" },
        el("div", { class: "cp-auth-spinner", "aria-hidden": "true" }),
        el("p", { class: "cp-auth-copy", id: "cp-auth-title", text: "Verifica dell'accesso…" }))];
    } else if (state.view === "sdk-error") {
      nodes = [brand(), title("Accesso non disponibile"),
        el("p", { class: "cp-auth-copy", text: "Non riesco a caricare il servizio di accesso. Controlla la connessione e riprova." }),
        el("button", { class: "cp-auth-button primary", type: "button", text: "Riprova", onclick: () => start() })];
    } else if (state.view === "verify") {
      nodes = renderVerify(title);
    } else {
      nodes = renderForm(title);
    }
    const previousEmail = content.querySelector("input[name=email]")?.value || "";
    content.replaceChildren(...nodes);
    const emailInput = content.querySelector("input[name=email]");
    if (emailInput && previousEmail) emailInput.value = previousEmail;
    const focusTarget = content.querySelector("input, button.primary");
    focusTarget?.focus();
  }

  function renderForm(title) {
    const signup = state.mode === "signup";
    const reset = state.mode === "reset";

    const email = el("input", { class: "cp-auth-input", type: "email", name: "email", autocomplete: "email", required: true, inputmode: "email", maxlength: "254" });
    const password = el("input", {
      class: "cp-auth-input",
      type: "password",
      name: "password",
      autocomplete: signup ? "new-password" : "current-password",
      required: true,
      minlength: signup ? String(MIN_PASSWORD) : false,
      maxlength: "128",
    });
    const submit = el("button", {
      class: "cp-auth-button primary",
      type: "submit",
      text: reset ? "Invia il link di recupero" : signup ? "Crea account" : "Accedi",
      disabled: state.busy,
    });

    const form = el("form", { class: "cp-auth-form", novalidate: true },
      el("label", { class: "cp-auth-field" }, "Email", email),
      reset ? null : el("label", { class: "cp-auth-field" }, "Password", password),
      messageNode(),
      submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (reset) resetPassword(email.value.trim());
      else if (signup) signUp(email.value.trim(), password.value);
      else signIn(email.value.trim(), password.value);
    });

    const switchMode = (mode) => () => {
      state.mode = mode;
      show("form");
    };
    const links = reset
      ? [el("button", { class: "cp-auth-link", type: "button", text: "Torna all'accesso", onclick: switchMode("signin") })]
      : [
        el("button", { class: "cp-auth-link", type: "button", text: signup ? "Ho già un account" : "Crea un account", onclick: switchMode(signup ? "signin" : "signup") }),
        signup ? null : el("button", { class: "cp-auth-link", type: "button", text: "Password dimenticata?", onclick: switchMode("reset") }),
      ];

    const nodes = [brand(), title(reset ? "Recupera la password" : signup ? "Crea il tuo account" : "Accedi a Cyber Pulse")];
    if (!reset) {
      nodes.push(
        el("button", { class: "cp-auth-button", type: "button", html: `${GOOGLE_ICON}<span>Continua con Google</span>`, disabled: state.busy, onclick: signInWithGoogle }),
        el("div", { class: "cp-auth-divider", text: "oppure" }));
    } else {
      nodes.push(el("p", { class: "cp-auth-copy", text: "Inserisci l'email dell'account: riceverai un link per scegliere una nuova password." }));
    }
    nodes.push(form, el("div", { class: "cp-auth-row" }, ...links));
    return nodes;
  }

  function renderVerify(title) {
    const email = state.user?.email || "";
    const remaining = Math.ceil((state.resendUntil - Date.now()) / 1000);
    const resend = el("button", {
      class: "cp-auth-link",
      type: "button",
      text: remaining > 0 ? `Invia di nuovo (${remaining}s)` : "Invia di nuovo l'email",
      disabled: state.busy || remaining > 0,
      onclick: resendVerification,
    });
    if (remaining > 0) {
      clearTimeout(resendTimer);
      resendTimer = setTimeout(() => {
        if (state.view === "verify") render();
      }, 1000);
    }
    return [
      brand(),
      title("Conferma la tua email"),
      el("p", { class: "cp-auth-copy", text: `Abbiamo inviato un link di conferma a ${email}. Aprilo (controlla anche lo spam), poi torna qui.` }),
      messageNode(),
      el("button", { class: "cp-auth-button primary", type: "button", text: "Ho confermato", disabled: state.busy, onclick: checkVerified }),
      el("div", { class: "cp-auth-row" }, resend,
        el("button", { class: "cp-auth-link", type: "button", text: "Esci", onclick: signOut })),
    ];
  }

  async function run(task) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      await task();
    } catch (error) {
      console.error("Autenticazione:", error && error.code ? error.code : error);
      setMessage(describeError(error), "error");
    } finally {
      state.busy = false;
      // Se l'accesso è riuscito la finestra è già stata chiusa dal flusso di accesso.
      if (state.view !== "done") render();
    }
  }

  function signIn(email, password) {
    if (!email || !password) return show("form", "Inserisci email e password.");
    return run(() => state.sdk.signInWithEmailAndPassword(state.auth, email, password));
  }

  function signUp(email, password) {
    if (!email) return show("form", "Inserisci la tua email.");
    if (password.length < MIN_PASSWORD) return show("form", `La password deve avere almeno ${MIN_PASSWORD} caratteri.`);
    return run(async () => {
      const credential = await state.sdk.createUserWithEmailAndPassword(state.auth, email, password);
      await state.sdk.sendEmailVerification(credential.user);
      state.resendUntil = Date.now() + RESEND_SECONDS * 1000;
    });
  }

  function signInWithGoogle() {
    return run(() => state.sdk.signInWithPopup(state.auth, new state.sdk.GoogleAuthProvider()));
  }

  async function resetPassword(email) {
    if (!email) return show("form", "Inserisci la tua email.");
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      await state.sdk.sendPasswordResetEmail(state.auth, email);
    } catch (error) {
      // L'esito non rivela se l'email esiste: unici errori mostrati sono quelli non legati all'account.
      const code = error && error.code;
      if (code === "auth/network-request-failed" || code === "auth/too-many-requests" || code === "auth/invalid-email") {
        state.busy = false;
        return show("form", describeError(error));
      }
    }
    state.busy = false;
    state.mode = "signin";
    show("form", "Se l'indirizzo è registrato, riceverai a breve un'email con il link per cambiare password.", "info");
  }

  function resendVerification() {
    return run(async () => {
      await state.sdk.sendEmailVerification(state.user);
      state.resendUntil = Date.now() + RESEND_SECONDS * 1000;
      setMessage("Email inviata di nuovo.", "info");
    });
  }

  function checkVerified() {
    return run(async () => {
      await state.user.reload();
      if (!state.user.emailVerified) {
        setMessage("L'email non risulta ancora confermata. Apri il link che ti abbiamo inviato.", "error");
        return;
      }
      await state.user.getIdToken(true);
      await enter(state.user);
    });
  }

  async function signOut() {
    try {
      localStorage.removeItem("cyber-pulse.gemini-api-key");
      localStorage.removeItem("cyber-pulse.news-cache");
    } catch {
      // storage non disponibile
    }
    try {
      await state.sdk.signOut(state.auth);
    } catch (error) {
      console.error("Uscita non riuscita:", error);
    }
    // Ricarico la pagina: nessun contenuto dell'utente precedente resta in memoria.
    location.reload();
  }

  function isPasswordUnverified(user) {
    return !user.emailVerified && user.providerData.some((provider) => provider.providerId === "password");
  }

  function updateAccountUi() {
    const account = document.querySelector("#launcher-account");
    if (!account) return;
    account.hidden = !state.user;
    const email = document.querySelector("#account-email");
    if (email) email.textContent = state.user?.email || "";
  }

  async function enter(user) {
    state.user = user;
    state.view = "done";
    try {
      const previous = localStorage.getItem(LAST_UID_KEY);
      if (previous && previous !== user.uid) {
        for (const key of PERSONAL_KEYS) localStorage.removeItem(key);
      }
      localStorage.setItem(LAST_UID_KEY, user.uid);
    } catch {
      // storage non disponibile: si prosegue senza pulizia
    }
    closeWall();
    updateAccountUi();
    document.dispatchEvent(new CustomEvent("cyberpulse:signedin", { detail: { uid: user.uid, email: user.email || "" } }));
    registerOnBackend(user);
  }

  // Non blocca l'uso dell'app: se il backend non risponde, la registrazione si ripete al prossimo accesso.
  async function registerOnBackend(user) {
    const api = window.CyberPulseApi;
    if (!api?.isConfigured()) return;
    try {
      const data = await api.registerUser(await user.getIdToken());
      document.dispatchEvent(new CustomEvent("cyberpulse:userregistered", { detail: data }));
    } catch (error) {
      console.warn("Registrazione sul backend non riuscita:", error.code || error.message);
    }
  }

  function onAuthChange(user) {
    if (!user) {
      state.user = null;
      state.mode = "signin";
      updateAccountUi();
      show("form");
      return;
    }
    state.user = user;
    if (isPasswordUnverified(user)) {
      show("verify");
      return;
    }
    if (state.view !== "done" || state.user?.uid !== user.uid) enter(user);
  }

  async function start() {
    const config = window.CYBER_PULSE_CONFIG;
    if (!config?.firebase?.apiKey) {
      show("sdk-error");
      return;
    }
    show("loading");
    try {
      const base = config.firebaseSdkUrl;
      const [app, auth] = await Promise.all([import(`${base}firebase-app.js`), import(`${base}firebase-auth.js`)]);
      state.sdk = auth;
      const firebaseApp = app.getApps().length ? app.getApp() : app.initializeApp(config.firebase);
      state.auth = auth.getAuth(firebaseApp);
      state.auth.languageCode = "it";
      auth.onAuthStateChanged(state.auth, onAuthChange);
    } catch (error) {
      console.error("Caricamento del servizio di accesso non riuscito:", error);
      show("sdk-error");
    }
  }

  function init() {
    document.querySelector("#sign-out")?.addEventListener("click", signOut);
    start();
  }

  window.CyberPulseAuth = Object.freeze({ getUser, getIdToken, signOut });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
