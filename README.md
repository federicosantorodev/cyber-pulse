# Cyber Pulse

Aggregatore di notizie e hub personale (News, Arena sport, Giochi, Libreria, Musica) installabile come PWA.
Frontend statico (HTML/CSS/JS vanilla) + backend Google Apps Script + Firebase (login e sincronizzazione).

## Struttura

- `frontend/` – l'app (pubblicabile su GitHub Pages)
- `backend (GAS)/` – codice Google Apps Script (da incollare nel progetto Apps Script)
- `firestore.rules` – regole Firestore per la sincronizzazione
- `docs/` – documentazione ([architettura](docs/architecture.md), [setup backend](docs/setup-backend.md), [pubblicazione](docs/publishing.md))
- `MASTER_DOCUMENT.md` – specifica funzionale

## Provare in locale

Servire la cartella `frontend/` con un server statico su `http://localhost:<porta>/`
(il login Firebase non funziona da `file://` né da indirizzi IP numerici).

## Funzioni principali

Feed per categoria con ordinamento per data originale, "Per te", Arena (sport), Giochi, Libreria (EPUB/PDF offline),
Musica, 60 temi con modalità Giorno/Notte/Auto/OLED, traduzione automatica delle notizie, scorciatoie personalizzabili
nel menu laterale, sincronizzazione tra dispositivi, funzionamento offline (service worker).
