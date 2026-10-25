# Setup backend

1. Crea un progetto Google Apps Script e incolla tutti i file di `backend (GAS)/` (incluso `appsscript.json`).
2. Pubblica come **Applicazione web** (esegui come te, accesso a chiunque) e copia l'URL `/exec` in `frontend/assets/js/config.js` (`backendUrl`).
3. Ad ogni modifica ai `.gs`: incolla il file aggiornato e crea una **nuova versione** della distribuzione.
4. Firebase (console): abilita Authentication (Google/Email) e aggiungi tra i **domini autorizzati** il dominio di pubblicazione (es. `utente.github.io`).
5. Firestore: crea il database e pubblica le regole di `firestore.rules` (scheda Regole).
6. Se cambi progetto Firebase, aggiorna `firebase` in `config.js` e il progetto usato da `authService.gs`.
