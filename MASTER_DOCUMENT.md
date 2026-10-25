# MASTER DOCUMENT - CYBER PULSE
**Documento di Specifica Architetturale, Tecnica e Funzionale Definitiva**

## 1. Visione e Requisiti Fondamentali
Costruire una web app denominata **"Cyber Pulse"** (precedentemente Cyber Feed V2), un aggregatore premium di notizie e hub personale totale (News, Sport, Giochi, Libreria, Musica). L'app deve essere leggera, veloce, priva di algoritmi manipolativi e con zero carico in background sul dispositivo.
- **Cross-Platform & Responsività:** L'interfaccia deve adattarsi con switch automatico del layout tra versione Desktop e Mobile. Piena compatibilità testata su Chrome, Safari e Firefox (su PC, Mac e Smartphone).
- **Installabilità (PWA):** Frontend statico installabile come app nativa a schermo intero su Android (tramite `manifest.webmanifest` e Service Worker), ospitato gratuitamente su GitHub Pages (senza domini a pagamento). Il file `index.html` deve essere assolutamente privo di credenziali sensibili.

## 2. Stack Tecnologico e Architettura
- **Frontend (UI & PWA):** HTML, CSS, JavaScript (Vanilla modulare, zero framework pesanti).
- **Backend (Cloud Personale):** Delegato interamente a Google Apps Script (GAS) per la gestione dei cron-job RSS, scraping e logica IA.
- **Database:** Google Fogli (Tabelle: `Utenti`, `News`, `Fonti_Catalogo`, `Cloud_Backup`).
- **Performance (Stale-While-Revalidate):** Apertura istantanea tramite cache locale (IndexedDB/localStorage per le prime 60 news) e aggiornamento silente in background.
- **Ordinamento Rigoroso:** I feed e le notizie devono **sempre e solo** essere ordinati per data di pubblicazione originale.

## 3. Sicurezza Rigorosa, Resilienza e Modello BYOK
- **Regole Inviolabili:** Nessuna chiave API o token nel frontend. Nessun fetch diretto a Gemini dal browser. Nessuna credenziale nel codice sorgente su GitHub.
- **Gestione IA (BYOK):** L'utente inserisce la propria API Key di Gemini (Livello AI) nelle Impostazioni dell'app (salvata solo in locale). Le chiamate AI avvengono esclusivamente tramite il backend GAS.

## 4. Onboarding, Multi-utenza e Architettura a 2 Livelli
1. **Login Wall Obbligatorio:** Firebase Auth (Google/Email). Nessun accesso senza account (garantisce la Multi-Tenancy per i salvataggi in cloud).
2. **Scelta del Livello:** Standard (Gratuito, riassunti grezzi) o AI (Con BYOK, funzioni avanzate).
3. **Keyword Tailoring:** L'utente seleziona "Parole Chiave" per popolare dinamicamente il feed in base ai propri gusti.

## 5. Interfaccia Utente (UI) e Navigazione
Iconografia vettoriale SVG minimale. Design pulito in stile Google News.
- **Header Ultra-Compatto (2 Righe):** 
  - *Riga 1:* Menu Hamburger (☰), Titolo app, Lente fluttuante, Menu Kebab (⋮) per il Launcher.
  - *Riga 2:* Icona Dashboard fissa a sinistra. Categorie/Keyword scorrevoli al centro. Filtro Fonti a destra.
- **Launcher Laterale (Side Drawer):** Apribile dai 3 puntini (⋮). Contiene:
  - 🏠 Home
  - ⚽ Arena (Hub Sport)
  - 🎮 Giochi (Hub Intrattenimento)
  - 📚 Libreria (Hub E-reader offline)
  - 🎵 Musica (Hub Scoperta Musicale)
  - *--- Divisore ---*
  - 🎨 Aspetto (Tavolozza Temi)
  - ⚙️ Impostazioni
  - *--- Divisore ---*
  - ⚡ **Quick Actions (Dock):** 4 scorciatoie personalizzabili (Predefinite: Sincronizza, Secondo Cervello, Lab Fonti, Traduttore).

## 6. Moduli Hub Integrati
- **Cyber Arena (Sport):** Widget classifiche/risultati. Tema visivo dinamico basato sulla squadra del cuore.
- **Cyber Studio (Giochi):** Solitario Klondike in Vanilla JS. Punteggi in Cloud.
- **Cyber Library (E-reader):** Accesso al File System locale (PC/Mobile) per leggere libri. Cronologia e segnalibro sincronizzati in Cloud Firebase.
- **Cyber Music (Esclusiva Livello AI):**
  - Onboarding musicale a bolle (Gemini mappa i gusti).
  - Radar Artisti generato dall'IA.
  - **Funzione Deep Linking "Ascolta 🎧":** Quando l'app rileva una notizia su una release musicale, genera un pulsante per aprire direttamente l'App Musicale predefinita (Spotify, Apple Music, ecc.).

## 7. 🎨 Aspetto e Tavolozza Temi
Gestione tramite variabili CSS (`:root`). Modalità: Giorno, Notte, Auto (segue il sistema), OLED.
Gruppi tematici (varianti multiple, sfondi generati da canvas): Classico, Neon, Arcano, Galassia, Giappone, Italia, Mexico, Colori Solidi, Unicorno (nomi senza marchi; gli id interni di alcuni temi conservano i vecchi nomi). I temi si applicano anche ai giochi.

## 8. ⚙️ Modulo Impostazioni
Esplora a scomparti per gruppi (7 gruppi): lettura, traduzione (lingua predefinita e lingue da scaricare), categorie e fonti, aspetto, account/BYOK, **Sincronizzazione** (Firestore, manuale o automatica) e altro.
Ogni opzione/trigger può essere aggiunta alle **Scorciatoie** del menu laterale (max 12) con il pulsante pin, compresi Giorno/Notte/Auto/OLED; dal menu laterale funziona direttamente come trigger.

## 8bis. Stato attuale (aggiornamento)
- Hub attivi: Home, Arena, Giochi, Libreria, Musica. L'hub Traduttore è disattivato (Google Translate non è incorporabile).
- Dock Quick Actions sostituito dalle Scorciatoie personalizzabili; "Secondo Cervello" e "Lab Fonti" restano "In arrivo".
- Gemini/AI in pausa (crediti esauriti); l'app funziona senza AI.
- Documentazione: `README.md` e `docs/`.

## 9. Struttura del Catalogo Fonti (Regole di Popolamento)
Il database iniziale deve essere configurato dal backend con le seguenti categorie, popolando il file `sources-catalog.json` e il Foglio Google con fonti autorevoli, stabili e rilevanti.
**Regola per ogni categoria:** Inserire 30 fonti Italiane e 20 Internazionali. Di queste, impostare come "Attive" di default esattamente 10 Italiane e 5 Internazionali.
Le categorie da configurare con questa regola sono:
- **Tech, PC & Gaming**
- **Fotografia e Video**
- **Anime e Manga**
- **Musica** (inclusivi di tutti i generi: classica, metal, blues, caraibica, ecc.)
- **Cucina e Alimentazione**
- **Scienza, Storia e Viaggi**

## 10. Alberatura dei File
```text
project-cyber-pulse/
├── frontend/
│   ├── index.html 
│   ├── manifest.webmanifest 
│   ├── service-worker.js 
│   └── assets/
│       ├── css/
│       │   ├── styles.css
│       │   └── themes_styles.css 
│       ├── js/
│       │   ├── app.js 
│       │   ├── onboarding.js 
│       │   ├── api.js 
│       │   ├── ui.js 
│       │   ├── cache.js 
│       │   └── modules/ (klondike.js, arena.js, library.js, music.js, settings.js)
│       └── icons/
├── backend (GAS)/
│   └── [Code.gs, feedManager.gs, geminiService.gs, authService.gs]
└── docs/ 
    ├── cyber_pulse_master.md
    ├── architecture.md 
    ├── setup-backend.md
    └── README.md
```