# Implementierungs-Prompt — UI-Redesign + Dark Mode (Logopädie-Trainer)

> Kopiere diesen Block in Claude Code (im Repo-Root von `ipa-trainer`).
> Die Mockups und das fertige Stylesheet liegen im Ordner `design/` (u. a. `design/theme.css`).

---

**Lies ZUERST `CLAUDE.md`.** Halte dich an alle dort genannten Konventionen (Vanilla HTML/CSS/JS, kein Framework, kein Build, LocalStorage, deutsche UI, keine Emojis, keine Runtime-APIs außer Schriften).

## Kontext

Das UI ist funktional fertig, aber visuell generisch. Es gibt ein vollständiges, abgestimmtes Redesign im Ordner `design/`:

- `design/theme.css` — **produktionsreifes Stylesheet** (Light + Dark), trifft exakt die bestehenden Klassennamen. Soll `css/style.css` ersetzen.
- `design/01-tokens.html … 04-hybrid.html` — Mockups (Tokens, Komponenten, Tabs, Hybrid-Eingabe), je in Light und Dark. Nutze sie als visuelle Referenz.

Stilrichtung: **freundlich-bildungsorientiert, warm** (Sand/Creme-Flächen, Heather/Pflaume `#6b4f9e` als Akzent — bewusst nicht Blau), klare Hierarchie, IPA-taugliche Serife (Charis SIL). Dark Mode ist **eigenständig** entworfen (warmes Anthrazit, kein Pure-Black, Akzent heller/entsättigt), nicht invertiert.

## Harte Regeln

1. **JS-Logik nicht anfassen.** Klassifikation (`dodd-analyzer.js`), Trainer-Logik, Spaced Repetition, Storage, G2P (`ortho-to-ipa.js`) bleiben unverändert. Es wird **nur** UI/CSS geändert + ein Theme-Toggle ergänzt.
2. **Keine Klassennamen umbenennen.** Das Redesign baut auf den vorhandenen Klassen auf. Wenn du Markup anfasst (Header-Toggle), füge nur hinzu, entferne nichts Bestehendes.
3. **Datenmodelle unverändert.** `words.json`, `processes.json`, `dodd-examples.json` bleiben wie sie sind.
4. **Theme-Umschaltung rein über CSS-Variablen** (Attribut `data-theme` auf `<html>`). Kein JS-Repaint, keine Re-Renders laufender Übungen — der Wechsel darf den App-State nicht anfassen.
5. **Deutsche UI-Texte.** Keine Emojis (Icons als Inline-SVG).

## Schritte

### 1 · Schriften einbinden
In `index.html` im `<head>` (vor dem Stylesheet):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Charis+SIL:ital,wght@0,400;0,700;1,400&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```
**Wichtig:** Charis SIL über **Google Fonts** laden (deckt den IPA-Block + Kombizeichen ab). Den Fontsource-`latin`-Subset NICHT verwenden — der enthält die IPA-Glyphen nicht. Die Stacks (`--ipa-font`, `--ui-font`) sind in `theme.css` schon gesetzt; lokale Charis/Doulos-Installationen greifen als Fallback.

### 2 · Stylesheet ersetzen
Ersetze den **kompletten Inhalt** von `css/style.css` durch `design/theme.css` (oder verschiebe `theme.css` nach `css/` und passe den `<link>` an). Das bringt Light- und Dark-Tokens, alle Komponenten und die Hybrid-Eingabe-Optik mit.

### 3 · Dark-Mode-Toggle (Header)
Im Header (`index.html`, in `.header-actions`, hinter den vorhandenen Buttons) einfügen — // TBD verifizieren: exakte Stelle in `.header-actions`:
```html
<button id="theme-toggle" class="theme-toggle" type="button" aria-label="Hell/Dunkel umschalten">
  <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg>
  <svg class="ico-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z"/></svg>
</button>
```
(Die `theme.css` blendet automatisch Sonne im Light, Mond im Dark ein.)

### 4 · Theme-Logik (neu, klein)
**a)** Ganz oben im `<head>` (vor dem Stylesheet) ein winziges Inline-Skript gegen das Aufblitzen (FOUC) — setzt das Theme vor dem ersten Paint:
```html
<script>
  (function () {
    try {
      var saved = localStorage.getItem("lt-theme");
      var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", theme);
    } catch (e) { document.documentElement.setAttribute("data-theme", "light"); }
  })();
</script>
```
**b)** Neue Datei `js/theme.js`, **vor** `js/app.js` einbinden — Toggle + Persistenz + System-Fallback:
```js
/* theme.js — Hell/Dunkel-Umschaltung. Manuelle Wahl > System-Präferenz. */
(function () {
  "use strict";
  var KEY = "lt-theme";
  function current() { return document.documentElement.getAttribute("data-theme") || "light"; }
  function set(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", function () { set(current() === "dark" ? "light" : "dark"); });
    // Folgt der System-Präferenz nur, solange keine manuelle Wahl gespeichert ist.
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
        try { if (!localStorage.getItem(KEY)) set(e.matches ? "dark" : "light"); } catch (_) {}
      });
    }
  });
})();
```
Export/Import (`storage.js`) kann den Theme-Key optional mitsichern — // TBD verifizieren: ob der Export ein generisches Key-Whitelisting hat; sonst hier nichts ändern.

### 5 · Komponenten — was die `theme.css` abdeckt (zur Kontrolle)
Header/Tabs, Buttons (primär/ghost/small/danger), Trainer-Karte + Eingabe, IPA-Tastatur (voll + kompakt im Modal), Auswertungs-Tabelle (`row-ok`/`row-bad`/`row-explain`), Dodd-Tabelle, Zielwort-Autovervollständigung, Klassifikations-Box + Badges + Status, Dropdown, Modal, Hybrid-Eingabe, Tooltip (`.lt-tip`, optional), Fehler-Box, Footer. Alles in Light + Dark. Vergleiche mit den Mockups in `design/`.

### 6 · Hybrid-Eingabe (nur Optik)
Das JS erzeugt bereits `.hybrid-ipa-cell` mit `state-edit`/`state-display`, `.hybrid-ipa-wrap > .hybrid-ipa-input + .hybrid-ipa-edit` und `.hybrid-ipa-preview`. // TBD verifizieren: diese Klassennamen in `js/app.js` (`makeHybridIpaCell`) gegenchecken. Das alte CSS referenzierte teils noch `.kind-ipa-*` — diese verwaisten Regeln entfernen, die neue `theme.css` stylt die `.hybrid-ipa-*`-Variante samt Zuständen und Live-Vorschau. Verhalten siehe `design/04-hybrid.html`.

## Dark-Mode-Spezifika

- **Token-Trennung:** Light-Tokens auf `:root`, Dark-Tokens auf `:root[data-theme="dark"]`. (In `theme.css` zusätzlich `.theme-light`/`.theme-dark` als Scope — das ist nur für die Mockup-Seiten und stört in der App nicht.)
- **Toggle-Verhalten:** manuelle Wahl wird in `localStorage` (`lt-theme`) gespeichert und gewinnt; ohne gespeicherte Wahl gilt `prefers-color-scheme`.
- **Kein Flash:** Inline-Skript im `<head>` (Schritt 4a) setzt `data-theme` vor dem ersten Paint.
- **Charakter erhalten:** warmes Anthrazit (`--bg: #1b1714`), kein Pure-Black; Akzent heller/entsättigt (`--primary: #bda7e8`); Status entsättigt; IPA-Text auf `--text` für AAA-Kontrast.

## Anti-Patterns (nicht tun)

- ❌ JS-Logik, Klassifikation, Datenmodelle oder Klassennamen ändern.
- ❌ Theme per JS Stile umschreiben oder Komponenten neu rendern (nur `data-theme` setzen).
- ❌ Reines Schwarz/Weiß im Dark Mode; Status-Farben grell lassen.
- ❌ IPA in einer Schrift ohne Phonetik-Abdeckung rendern (immer `--ipa-font`/`.ipa-text`).
- ❌ Emojis als Icons; stattdessen Inline-SVG.
- ❌ Build-Tools, npm-Abhängigkeiten, Runtime-APIs.

## Akzeptanzkriterien

1. App lädt unverändert über lokalen Server / GitHub Pages; alle drei Tabs funktionieren wie zuvor.
2. Header zeigt den Sonne/Mond-Toggle; Klick wechselt Light↔Dark **ohne** State-Verlust in einer laufenden Übung.
3. Beim ersten Aufruf folgt das Theme der System-Präferenz; nach manueller Wahl bleibt diese über Reloads erhalten.
4. Kein Theme-Flash beim Laden.
5. IPA-Zeichen (inkl. `ɐ̯ l̩ ŋ ç ʁ pf ts ɔʏ̯`) rendern in Charis SIL in beiden Modi sauber und kontrastreich.
6. Hybrid-Eingabe zeigt die drei Zustände + Popup wie in `design/04-hybrid.html`; Live-Vorschau und Bleistift funktionieren.
7. Optik entspricht den Mockups in `design/` (Light und Dark) — Stichprobe pro Tab.
8. Disclaimer „ersetzt keine fachliche Diagnose" bleibt in der Dodd-Analyse sichtbar.

## Vorgehen

1. `design/theme.css` sichten, dann `css/style.css` ersetzen; Fonts-`<link>` + Anti-Flash-Skript in `index.html`.
2. Toggle-Button im Header + `js/theme.js` (vor `app.js`) ergänzen.
3. Verwaiste `.kind-ipa-*`-Regeln entfernen (falls noch vorhanden); `.hybrid-ipa-*`-Namen gegen `app.js` verifizieren.
4. Jeden Tab in Light und Dark gegen die Mockups prüfen; Kontrast der IPA-Flächen stichprobenhaft testen (Ziel: WCAG AA, IPA möglichst AAA).
5. Kurzes Self-Review gegen die Akzeptanzkriterien; offene Annahmen mit `// TBD verifizieren` markieren.

## Empfehlungen (nicht vorgeschrieben)

- **Icons:** Es werden kaum welche gebraucht (Toggle, Bleistift). Vorschlag: weiterhin **Inline-SVG** (wie der Toggle oben) statt einer Icon-Library — null Abhängigkeiten, passt zu CLAUDE.md. Falls doch eine Library gewünscht ist: **Lucide** (per CDN, SVG-basiert) wäre die schlankste Wahl.
- **Schrift-Fallback:** Wer komplett CDN-unabhängig sein will, kann Charis SIL als WOFF2 lokal unter `assets/fonts/` ablegen und per `@font-face` einbinden — dann den Google-Fonts-`<link>` weglassen.
