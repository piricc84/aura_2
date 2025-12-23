# AURA 3.5.0 • Elfo nella Foresta (PWA)

## Cosa cambia (wow)
- **Nuova intro narrativa + mini‑demo guidata** (30s) con evidenziazione dei pulsanti.
- **Personaggio Elfo** con animazioni morbide, particelle e "camminata" nella foresta.
- **Audio ambient generativo** (foresta / pioggia / notte) + SFX soft su interazioni (toggle in alto a destra, pannello collassabile).
- **Haptics** (Vibration API) calibrati e disattivabili.
- **Consigli** contestuali: respiro, grounding, micro‑azioni, journaling.
- **Protezione dati**: opzione **PIN + cifratura AES‑GCM** dei dati (local‑only). Nessun tracking.

## Struttura
- `index.html` (single‑file app)
- `sw.js` (service worker)
- `manifest.webmanifest`
- `icons/`

## Esecuzione locale
```bash
# dalla cartella del progetto
python -m http.server 8000
# poi apri http://localhost:8000
```

## Installazione su iPhone/Android
- Apri la web app in Safari/Chrome.
- Menu → **Aggiungi a schermata Home**.

## Privacy
Tutti i dati restano **sul dispositivo**. Se abiliti il PIN, i contenuti (umore/diario/preferenze) vengono salvati in locale **cifrati**.
