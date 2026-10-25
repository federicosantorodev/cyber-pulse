/**
 * Cyber Pulse - Backend (Google Apps Script)
 * File: authService.gs - verifica dell'accesso (Firebase Auth) e registro utenti.
 *
 * Il browser invia il "gettone" (ID token) di Firebase nel corpo di una richiesta POST,
 * mai nell'indirizzo, cosi' non finisce nei log. Il gettone viene verificato da Google
 * (Identity Toolkit): firma, scadenza e progetto sono controllati dal servizio, non da questo codice.
 * La chiave web di Firebase non e' un segreto: identifica solo il progetto.
 */

const AUTH = Object.freeze({
  API_KEY: "AIzaSyDW0q-2X7HCo7R_OJJsrRJNakshwzCHOGE",
  PROJECT_ID: "cyber-pulse-signandlogin",
  LOOKUP_URL: "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=",
  CACHE_SECONDS: 300,
  MAX_TOKEN_CHARS: 4096,
  MAX_BODY_CHARS: 30000,
  DEFAULT_LEVEL: "standard",
});

function decodeJwtPayload_(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  try {
    let segment = parts[1];
    while (segment.length % 4 !== 0) segment += "=";
    const bytes = Utilities.base64DecodeWebSafe(segment);
    return JSON.parse(Utilities.newBlob(bytes).getDataAsString("UTF-8"));
  } catch (error) {
    return null;
  }
}

// Restituisce {uid, email, emailVerified} oppure lancia UNAUTHENTICATED.
function verifyIdToken_(idToken) {
  const denied = () => new ApiError("UNAUTHENTICATED", "Accesso non valido o scaduto: accedi di nuovo.");

  if (typeof idToken !== "string" || idToken.length > AUTH.MAX_TOKEN_CHARS || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) {
    throw denied();
  }
  // Controllo preliminare: scarta subito i gettoni di altri progetti o gia' scaduti, senza chiamare Google.
  const claims = decodeJwtPayload_(idToken);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!claims
    || claims.aud !== AUTH.PROJECT_ID
    || claims.iss !== "https://securetoken.google.com/" + AUTH.PROJECT_ID
    || typeof claims.exp !== "number"
    || claims.exp <= nowSeconds) {
    throw denied();
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = "auth_" + hash_(idToken);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let response;
  try {
    response = UrlFetchApp.fetch(AUTH.LOOKUP_URL + encodeURIComponent(AUTH.API_KEY), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ idToken }),
      muteHttpExceptions: true,
    });
  } catch (error) {
    throw new ApiError("AUTH_UNAVAILABLE", "Verifica dell'accesso temporaneamente non disponibile.");
  }
  if (response.getResponseCode() !== 200) throw denied();

  let user = null;
  try {
    user = (JSON.parse(response.getContentText()).users || [])[0];
  } catch (error) {
    throw denied();
  }
  if (!user || !user.localId || user.disabled) throw denied();

  const result = {
    uid: String(user.localId),
    email: String(user.email || ""),
    emailVerified: user.emailVerified === true,
  };
  cache.put(cacheKey, JSON.stringify(result), Math.max(1, Math.min(AUTH.CACHE_SECONDS, claims.exp - nowSeconds)));
  return result;
}

// Crea l'utente nel foglio "Utenti" alla prima visita e aggiorna l'ultimo accesso nelle successive.
function registerUser_(idToken) {
  const user = verifyIdToken_(idToken);
  if (!user.emailVerified) {
    throw new ApiError("EMAIL_NOT_VERIFIED", "Conferma il tuo indirizzo email per continuare.");
  }

  // Blocco separato da quello di refreshFeeds, che puo' restare occupato per minuti.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(15000)) throw new ApiError("BUSY", "Server occupato: riprova tra qualche secondo.");
  try {
    const sheet = getSpreadsheet_().getSheetByName(CP.SHEETS.USERS);
    const last = sheet.getLastRow();
    const nowIso = new Date().toISOString();
    const uids = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 1).getValues().map((row) => String(row[0]));
    const index = uids.indexOf(user.uid);

    if (index === -1) {
      sheet.appendRow([user.uid, user.email, AUTH.DEFAULT_LEVEL, "[]", nowIso, nowIso]);
      return { uid: user.uid, email: user.email, level: AUTH.DEFAULT_LEVEL, isNew: true };
    }

    const row = index + 2;
    sheet.getRange(row, 6).setValue(nowIso);
    if (sheet.getRange(row, 2).getValue() !== user.email) sheet.getRange(row, 2).setValue(user.email);
    const level = String(sheet.getRange(row, 3).getValue() || AUTH.DEFAULT_LEVEL);
    return { uid: user.uid, email: user.email, level, isNew: false };
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // il blocco puo' essere gia' scaduto
    }
  }
}
