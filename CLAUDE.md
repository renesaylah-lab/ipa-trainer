# Logopädie-Trainer (Arbeitstitel)

Web-App für Logopädie-Studierende und -Praktizierende. Hilft beim Lernen für die Abschlussprüfung Bachelor Logopädie und langfristig als Nachschlage-/Reflexionstool in der Praxis.

Stack: Reines HTML/CSS/JavaScript, gehostet auf GitHub Pages. Kein Build-Tool, kein Backend, kein Framework. LocalStorage für Persistenz.

## Funktionsbereiche

- IPA-Trainer Wort → IPA: Benutzerin sieht deutsches Wort, gibt IPA-Transkription ein
- IPA-Trainer IPA → Wort: Benutzerin sieht IPA, gibt deutsches Wort ein
- Dodd-Analyse-Tool: Kindliche Aussprache-Produktionen → automatische Klassifikation nach Dodd (Artikulationsstörung / Phonologische Verzögerung / Konsequente phonologische Störung / Inkonsequente phonologische Störung)

## Fachliche Referenzen

- Dodd, B. (1995, 2014) — Klassifikationssystem kindlicher Aussprachestörungen
- Fox-Boyer, A. — deutsche Adaption (PLAKSS-II), Altersgrenzen für deutsche Phonologie, Liste typischer vs. untypischer Prozesse

Alle Altersgrenzen, Prozess-Klassifikationen und Wortlisten orientieren sich an diesen Quellen. Bei Unsicherheit: fragen statt raten. Datenbank-Einträge enthalten ein `quelle`-Feld; bei fehlender Verifikation steht dort "TBD".

## Architektur-Prinzipien

- Logik vor UI: Klassifikations-Logik und Datenmodell stehen vor jedem UI-Build
- Daten getrennt vom Code: Wörter und Prozesse in JSON-Dateien, leicht erweiterbar
- Persistenz im Browser: LocalStorage für Fortschritt, Korrekturen, Statistik
- Export/Import: Benutzerin kann ihre Daten sichern (gegen Browser-Cache-Verlust)
- Modulares JS: Trennung von App-Logik, IPA-Tastatur, Spaced Repetition, Klassifikator

## Datenmodell (vorläufig)

```
data/
├── words.json          # Wörter mit IPA-Transkription
├── processes.json      # Phonologische Prozesse mit Altersgrenzen
└── plakss_words.json   # PLAKSS-II Wortliste (falls verfügbar)
```

Details werden im Konzept-Dokument ausgearbeitet.

## Agenten-Nutzung

Du darfst Agents spawnen wenn es Sinn macht. Insbesondere für:

- Parallele Analyse von Code + Datenmodell
- Statische Code-Audits nach größeren Änderungen
- Vergleich mit Mockups/Spezifikation
- Edge-Case-Testing der Klassifikations-Logik

Nicht als Standard, sondern wenn die Aufgabe wirklich parallele oder spezialisierte Analyse erfordert.

## Konventionen

- Sprache: Deutsche UI-Texte, deutsche Kommentare bei fachspezifischen Stellen
- Keine Emojis in der UI
- Keine Frameworks: nur Vanilla JS, kein React/Vue/etc.
- Responsive: Funktioniert auf Handy und Laptop (1280×720 als Untergrenze)
- Keine externen APIs zur Laufzeit (außer Schriftarten ggf.)
- IPA-Eingabe: über klickbare Tastatur, native Tastatur-Eingabe nicht praktikabel
- Fachterminologie: korrekt nach Fox-Boyer/Dodd, keine vereinfachten Begriffe

## Was NICHT in den Scope gehört

- Klinische Diagnose-Tool für reale Patient:innen (Tool ist Lern- und Reflexions-Hilfe, ersetzt keine fachliche Diagnose)
- Audio-Aufnahme/Analyse
- Multi-User / Login-System
- Server-Backend

## Prompt-Stil

- Verhalten beschreiben, keine Zeilennummern
- Bei UX-Fragen: erst Konzept hier klären, dann implementieren
- Bei fachlichen Unsicherheiten (Altersgrenzen, Prozesse): explizit nachfragen statt annehmen
