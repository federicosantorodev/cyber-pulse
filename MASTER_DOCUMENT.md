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
- **Metadati della Libreria con Gemini:** Per EPUB e PDF l'estrazione dell'anteprima avviene sul dispositivo, limitata a 8.000 caratteri e ai primi capitoli o alle prime cinque pagine; viene preparata anche la copertina EPUB (o la prima pagina PDF) come immagine JPEG compressa entro 900 KB. Il backend accetta corpi JSON fino a 1.300.000 caratteri solo per richieste AI con immagine; le altre richieste POST restano limitate a 30.000 caratteri. Solo dopo aver consultato le anteprime e confermato l'invio, testo, immagine e nome file vengono trasmessi al backend GAS per proporre titolo, autore, anno, mese, serie, volume e capitolo. Per riviste, il titolo proposto privilegia la testata/masthead rispetto a fotografi, soggetti e titoli dei servizi. Le proposte compilano i campi modificabili e non vengono salvate o rinominate automaticamente: per rinominare un file in una cartella collegata occorre premere **Salva** e confermare; per un file aggiunto singolarmente il browser aggiorna solo il nome nella Libreria. La prima pagina dei PDF scansionati può essere letta visivamente, ma le pagine successive non sono sottoposte a OCR. In **Sistema la libreria** l'analisi di più libri in coda invia a Gemini, dopo un'unica conferma, la copertina (o il testo iniziale se manca) di ogni EPUB/PDF selezionato, al massimo 40 per volta, una richiesta ogni 7 secondi; la coda si ferma se la quota o la chiave non sono valide e le proposte restano nelle righe «prima → dopo» finché non si preme **Applica alle righe selezionate**. **Ricerca per ISBN/EAN:** nella modifica di un singolo libro il campo «ISBN / EAN» (precompilato se il codice è nel nome file, o cercato nelle prime pagine con «Cerca nel file») interroga Google Books e, in alternativa, Open Library (senza chiave; viene inviato solo il codice) per compilare titolo, autore e anno; nella coda multipla il codice ISBN valido (cifra di controllo verificata) viene provato per primo e Gemini è usato solo per i libri senza risultato.

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
- **Cyber Library (E-reader):** Libreria locale in IndexedDB con lettura offline, cartelle collegate e strumenti per correggere metadati, gestire copie, rinominare e annullare le modifiche. Il sistema propone modelli di nome con titolo, autore, anno, mese, serie, volume e capitolo, rileva copie identiche tramite SHA-256 e controlla i file spostati o mancanti senza cancellarli automaticamente. Il lettore offre navigazione verticale continua o pagina per pagina, adattamento di PDF/immagini allo schermo senza scorrimento residuo e PDF.js locale per consultare i PDF anche offline; le pagine PDF ingrandite si possono spostare trascinandole. I manga da immagini possono essere letti o esportati in CBZ/PDF. Libri, progressi e segnalibri restano su questo dispositivo e non vengono sincronizzati nel cloud. Nel lettore PDF il pulsante «Anteprima delle pagine» apre a sinistra una colonna di miniature (caricate solo quando visibili) con la pagina corrente evidenziata: un clic porta a quella pagina.
- **Anteprima iniziale:** l'icona a forma di occhio nello scaffale, nella vista a cartelle e nelle righe di modifica dei nomi mostra la prima pagina PDF o la prima schermata dei documenti supportati. L'anteprima viene elaborata sul dispositivo, non modifica il file e non cambia i progressi di lettura. Negli ebook con testo adattabile la schermata dipende dalle dimensioni della finestra.
- **Miniature PDF:** nello scaffale e nella vista a cartelle la prima pagina dei PDF viene renderizzata localmente come miniatura quando il documento si avvicina all'area visibile, senza generare tutte le miniature contemporaneamente. Per le cartelle collegate serve il permesso di lettura; i file non vengono modificati.
- **Dimensione delle copertine:** l'impostazione Piccole, Medie o Grandi vale sia per lo scaffale sia per le righe della vista a cartelle; in questa vista è disponibile anche un selettore rapido. La preferenza è condivisa e salvata sul dispositivo.
- **Nomi e metadati:** il campo casa editrice viene salvato nella Libreria, può essere letto dai nuovi EPUB e proposto dalla ricerca ISBN o da Gemini. La proposta dal nome riconosce anche i separatori doppi e rimuove duplicazioni e identificativi solo nel formato riconoscibile `-- hash -- Anna’s Archive`; le proposte vanno comunque controllate e i dati modificati a mano sono conservati. In «Modifica nome e dati» le spunte scelgono quali campi includere nel nome; i dati esclusi rimangono salvati. L'ingranaggio apre cinque schede: Nomi e metadati, Ricerca ISBN, Scaffale, Lettore, Sicurezza e dati. Per la rinomina sono disponibili profili modificabili per libri, riviste e fumetti: CBZ è suggerito come fumetto e i nomi contenenti «rivista», «magazine» o «periodico» come rivista; negli altri casi è suggerito libro. Il profilo è modificabile in ogni riga. Ciascun profilo consente ordine e campi, separatore, formato anno, mese e numeri e modello avanzato; il modello precedente dei libri è conservato. Per impostazione iniziale la rinomina viene fermata se manca un campo selezionato o il nome esiste già; si possono invece omettere i campi mancanti o aggiungere un numero progressivo. La rinomina su disco richiede sempre conferma. Queste operazioni non riscrivono i metadati incorporati nel PDF o EPUB.
- **Formato mese:** tutti i profili usano inizialmente il numero a due cifre. Al primo avvio dopo l'aggiornamento anche i profili salvati e i loro modelli `{meseNome}` vengono convertiti al formato numerico; in seguito è possibile scegliere di nuovo il nome del mese o usare `{meseNome}` nel modello avanzato.
- **Ricerca ISBN:** Google Books, SBN e Open Library sono attivabili e ordinabili nelle impostazioni; l'ordine iniziale è quello indicato. L'opzione italiano preferisce risultati Google Books esplicitamente marcati come italiani e associati allo stesso codice; non garantisce l'edizione corretta. Si può scegliere se riempire solo i campi vuoti. Il pulsante opzionale Amazon.it apre una ricerca nel browser e non importa metadati. SBN consulta tramite Apps Script l'endpoint SPARQL aperto dell'ICCU, inviando solo l'ISBN valido. Per ISBN con prefisso 978 si cerca anche l'equivalente ISBN-10 (e viceversa). La risposta propone titolo, dichiarazione di responsabilità, editore e anno quando disponibili; se SBN restituisce più edizioni non ne viene scelta automaticamente una. La funzione richiede la pubblicazione aggiornata di `Code.gs` e non garantisce che ogni libro sia presente nel catalogo.
- **Impostazioni Libreria:** il menu iniziale presenta le categorie separatamente, con navigazione indietro e conferma prima di abbandonare modifiche non salvate. Le sezioni Scaffale e Lettore gestiscono vista, ordinamento, dimensione copertine, dettagli e preferenze di lettura condivise con i controlli rapidi. Sicurezza e dati permette di richiedere la conferma per modifiche multiple, esportare/importare le sole impostazioni in JSON e ripristinare le preferenze delle singole sezioni senza cancellare libri o metadati. La conferma per i file sul dispositivo e per l'invio a Gemini rimane obbligatoria. I componenti visivi condivisi seguono uno stile ispirato a Material, mantenendo temi e trasparenze dell'utente.
- **OCR su PDF:** nel lettore il pulsante «Riconosci testo selezionato (OCR)» attiva la selezione di un riquadro su una singola pagina; Esc annulla. Tesseract.js 6.0.1 e i dati italiano e inglese sono inclusi e memorizzati nella cache dell'app, per il riconoscimento sul dispositivo anche offline dopo il caricamento delle risorse. Il testo, potenzialmente imperfetto, è modificabile e copiabile; non modifica il PDF e non viene inviato online. Se la copia automatica non è disponibile si può copiare manualmente il testo selezionato. Il motore e i dati OCR aumentano lo spazio occupato dalla cache.
- **Cyber Music (Esclusiva Livello AI):**
  - Onboarding musicale a bolle (Gemini mappa i gusti).
  - Radar Artisti generato dall'IA.
  - **Funzione Deep Linking "Ascolta 🎧":** Quando l'app rileva una notizia su una release musicale, genera un pulsante per aprire direttamente l'App Musicale predefinita (Spotify, Apple Music, ecc.).

## 7. 🎨 Aspetto e Tavolozza Temi
Gestione tramite variabili CSS (`:root`). Modalità: Giorno, Notte, Auto (segue il sistema), OLED.
Gruppi tematici (varianti multiple, sfondi con sfumature morbide generati da canvas): Classico, Neon, Arcano, Galassia, Giappone, Italia, Mexico, Colori Solidi, Unicorno (nomi senza marchi; gli id interni di alcuni temi conservano i vecchi nomi). I temi si applicano anche ai giochi.

## 8. ⚙️ Modulo Impostazioni
Esplora a scomparti per gruppi (7 gruppi): lettura, traduzione (lingua predefinita e lingue da scaricare), categorie e fonti, aspetto, account/BYOK, **Sincronizzazione** (Firestore, manuale o automatica) e altro.
Ogni opzione/trigger può essere aggiunta alle **Scorciatoie** del menu laterale (max 12) con il pulsante pin, compresi Giorno/Notte/Auto/OLED; dal menu laterale funziona direttamente come trigger.

## 8bis. Stato attuale (aggiornamento)
- Hub attivi: Home, Arena, Giochi, Libreria, Musica. L'hub Traduttore è disattivato (Google Translate non è incorporabile).
- Dock Quick Actions sostituito dalle Scorciatoie personalizzabili; "Secondo Cervello" e "Lab Fonti" restano "In arrivo".
- Le funzioni Gemini sono opzionali e usano la chiave BYOK dell'utente; se chiave, connessione o quota non sono disponibili, l'app resta utilizzabile senza AI.
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