# Schriften für den PDF-Export (optional)

Der PDF-Export der Dodd-Analyse (`js/pdf-export.js`) bettet eine Unicode-TTF mit
IPA-Glyphen ein.

- **Standard (ohne Zutun):** Es wird **Noto Sans Regular** per CDN geladen
  (deckt IPA-Extensions + Diakritika ab). Funktioniert nur online.
- **Optionales Upgrade:** Lege hier eine Datei **`CharisSIL.ttf`** ab
  (Charis SIL Regular, von SIL International, OFL-Lizenz). Dann nutzt der Export
  diese lokal — schöneres IPA-Rendering und offline-fähig.

Download: https://software.sil.org/charis/ → „Charis SIL" → TTF → die Datei
`CharisSIL-Regular.ttf` hierher als `CharisSIL.ttf` kopieren.

Hinweis: jsPDF macht kein komplexes Text-Shaping; gestapelte Kombi-Diakritika
(z. B. ɐ̯, l̩) können leicht in der Position abweichen. Einzelzeichen-IPA rendert
sauber.
