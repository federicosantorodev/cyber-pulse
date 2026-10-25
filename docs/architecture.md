# Architettura

## Frontend (`frontend/`)
- `index.html`, `manifest.webmanifest`, `service-worker.js` (cache dell'app; incrementare `CACHE_VERSION` a ogni modifica e aggiungere i nuovi file a `SHELL_FILES`).
- `assets/css/themes_styles.css` – variabili `:root`, 3+1 modalità (Giorno, Notte, Auto, OLED) e 60 temi.
- `assets/js/` – moduli globali: `config`, `auth` (Firebase Auth), `api` (backend), `cache`, `feed`, `cards`, `frontpage`, `foryou`, `ui` (temi), `backdrops`, `settings` (esplora Impostazioni), `shortcuts` (scorciatoie del menu laterale), `sync` (sincronizzazione), `translate`, `onboarding`, `ai`, `app`.
- `assets/js/modules/` – hub: `arena`, `sports`, `games`, `games-more`, `library`, `music`. `translator.js` è disattivato (Google Translate non è incorporabile).

## Backend (`backend (GAS)/`)
`Code.gs` (router), `feedManager.gs` (RSS/Atom/RDF, archivio News), `frontService.gs`, `arenaService.gs`, `sportsService.gs`, `musicService.gs`, `catalogData.gs`, `authService.gs` (verifica token Firebase), `geminiService.gs` (AI, in pausa).
Database: Google Fogli.

## Dati e sicurezza
- Nessuna chiave segreta nel frontend; la chiave web Firebase è pubblica per progetto.
- Gemini: solo tramite backend, chiave dell'utente (BYOK).
- Sincronizzazione: documento Firestore `users/{uid}/sync/data`, accessibile solo al proprietario (`firestore.rules`). Non sincronizzati: file dei libri, immagine di sfondo caricata, chiave Gemini. Conflitti: vince la modifica più recente per ogni chiave.
- Preferenze locali in `localStorage` con prefisso `cyber-pulse.`.
