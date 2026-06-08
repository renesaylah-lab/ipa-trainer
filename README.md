# Logopädie-Trainer

Web-App für Logopädie-Studierende und -Praktizierende. Hilft beim Lernen für die
Abschlussprüfung Bachelor Logopädie und dient langfristig als Nachschlage- und
Reflexionstool. Reines HTML/CSS/Vanilla-JavaScript, kein Build-Tool, kein Backend,
kein Framework. Persistenz über LocalStorage.

> **Hinweis:** Die Dodd-Analyse ist eine **Lern- und Reflexionshilfe** und **ersetzt
> keine fachliche Diagnose** für reale Patient:innen.

## Funktionen

1. **Wort → IPA** – deutsches Wort wird angezeigt, Nutzerin gibt die IPA-Transkription ein.
2. **IPA → Wort** – IPA wird angezeigt, Nutzerin gibt das deutsche Wort ein.
3. **Dodd-Analyse** – kindliche Aussprache-Produktionen werden nach Dodd
   (dt. Adaption Fox-Boyer) klassifiziert.

Modi 1 + 2 laufen als Batch von 10 Wörtern (keine sofortige Lösung, Auswertung am
Ende) mit vereinfachtem Spaced Repetition (SM-2): falsche Wörter kehren nach 1, 3
und 7 Tagen wieder. Fortschritt, Statistik und der Verlauf der letzten ~20
Dodd-Analysen werden im Browser (LocalStorage) gespeichert und lassen sich als JSON
exportieren/importieren.

## Projektstruktur

```
ipa-trainer/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js               # Tab-Routing, App-State, Dodd-UI, Export/Import
│   ├── ipa-keyboard.js      # Klickbare IPA-Tastatur
│   ├── ipa-trainer.js       # Modi 1 + 2 (Batch-Logik)
│   ├── dodd-analyzer.js     # IPA-Tokenizer, Alignment, Klassifikation
│   ├── storage.js           # LocalStorage-Wrapper + Export/Import
│   └── spaced-repetition.js # SM-2 (vereinfacht)
└── data/
    ├── words.json           # ~150 Wörter mit IPA
    └── processes.json       # Phonologische Prozesse (typisch/untypisch)
```

## Lokal ausführen

Die App lädt `data/*.json` per `fetch`. Beim **direkten Öffnen über `file://`**
blockieren die meisten Browser das (CORS). Daher einen kleinen lokalen Server nutzen:

```bash
# im Projektordner
python -m http.server 8000
# dann im Browser öffnen:
# http://localhost:8000
```

Alternativen: VS Code „Live Server“-Erweiterung oder `npx serve`. Auf GitHub Pages
(siehe unten) funktioniert alles direkt ohne Server.

## Hosting auf GitHub Pages

1. Repository auf GitHub anlegen und den Projektinhalt pushen:
   ```bash
   git add .
   git commit -m "Logopädie-Trainer initial"
   git push origin main
   ```
2. Auf GitHub: **Settings → Pages**.
3. Unter **Build and deployment → Source** „Deploy from a branch“ wählen.
4. **Branch:** `main`, **Folder:** `/ (root)` → **Save**.
5. Nach kurzer Zeit ist die App unter
   `https://<benutzername>.github.io/<repo-name>/` erreichbar.

Da die App vollständig statisch ist, sind keine weiteren Build-Schritte nötig.

## Fachliche Grundlagen & Datenpflege

- Dodd, B. — Klassifikationssystem kindlicher Aussprachestörungen
- Fox-Boyer, A. — deutsche Adaption, PLAKSS-II, Altersgrenzen der deutschen Phonologie

Jeder Datensatz hat ein `quelle`-Feld. Wo eine Angabe nicht gesichert verifiziert ist,
steht dort **„TBD“** bzw. **„TBD verifizieren“**. Insbesondere die **Altersgrenzen in
`data/processes.json`** sind Richtwerte und **gegen Fox-Boyer/PLAKSS-II zu prüfen**,
bevor man sich fachlich darauf verlässt.

### Daten erweitern

- **Wörter:** Eintrag in `data/words.json` ergänzen:
  ```json
  { "id": "w-151", "wort": "Beispiel", "ipa": "baɪʃpiːl", "ipa_varianten": [], "kategorie": "Standard", "hinweis": "", "quelle": "TBD" }
  ```
  Bei mehreren akzeptierten Aussprachen `ipa_varianten` füllen (z. B. silbisches
  `[n̩]` vs. `[ən]`).
- **Prozesse:** Eintrag in `data/processes.json` unter `prozesse` ergänzen; `typ`
  ist `typisch`, `untypisch` oder `artikulatorisch`, `regel.von`/`regel.zu` steuern
  das Substitutions-Matching.

## Hinweise zur Klassifikations-Logik

`dodd-analyzer.js` bildet den Entscheidungsbaum nach:

1. Inkonsequenz-Score > 40 % → **Inkonsequente phonologische Störung**
2. sonst untypische Prozesse vorhanden → **Konsequente phonologische Störung**
3. sonst typische Prozesse über ihrer Altersgrenze → **Phonologische Verzögerung**
4. sonst nur Einzellaut-/Lautbildungsfehler → **Artikulationsstörung**
5. sonst → **Unauffällig / altersgemäß**

Der Inkonsequenz-Score braucht **dasselbe Wort mehrfach** (verschiedene
Versuchsnummern). Die Altersgrenze wird **pro Prozess** aus `processes.json`
ausgewertet. Das IPA-Alignment ist eine vereinfachte Edit-Distanz und kann bei
komplexen Mehrfachabweichungen ungenau sein – Ergebnisse stets fachlich prüfen.
