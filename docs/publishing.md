# Pubblicazione su GitHub Pages

Account `federicosantorodev`, repository `cyber-pulse` → sito: `https://federicosantorodev.github.io/cyber-pulse/`

1. Installa **GitHub Desktop** (oppure Git) e accedi con il nuovo account.
2. Crea il repository `cyber-pulse` (pubblico) e carica l'intera cartella del progetto (il workflow `.github/workflows/pages.yml` pubblica solo `frontend/`).
3. Su GitHub: Settings → Pages → **Source: GitHub Actions**.
4. Al primo push sul ramo `main` il deploy parte da solo (scheda Actions); ci vogliono 1–2 minuti.
5. Firebase → Authentication → Impostazioni → Domini autorizzati: aggiungi `federicosantorodev.github.io`.
6. Aggiornamenti: commit + push da GitHub Desktop; il service worker aggiorna l'app quando cambia `CACHE_VERSION`.
7. Nessuna chiave segreta è richiesta nel frontend.
