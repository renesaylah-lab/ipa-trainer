/* pdf-export.js
 * PDF-Export der Dodd-Analyse (jsPDF + AutoTable, beide via CDN in index.html).
 *
 * IPA-Schrift: jsPDF kann die Standard-14-Schriften nicht für IPA nutzen (keine
 * Glyphen). Wir betten eine Unicode-TTF ein:
 *   1) bevorzugt lokal assets/fonts/CharisSIL.ttf (schönstes IPA, wenn vorhanden)
 *   2) sonst Noto Sans Regular per CDN (deckt IPA-Extensions + Diakritika ab)
 * HINWEIS (TBD verifizieren): jsPDF macht KEIN komplexes Text-Shaping (GPOS).
 * Einzelzeichen-IPA (ʃ ʒ ç ŋ ʁ ə ɛ ɔ …) rendert sauber; gestapelte Kombi-Zeichen
 * (ɐ̯, l̩, t̠ …) können in der Position leicht verrutschen – Glyphen sind da, die
 * Positionierung ist die Bibliotheks-Grenze.
 *
 * API:  LT_PdfExport.export(data) -> Promise
 *   data = { pseudonym, alter_jahre, alter_monate, rows:[{zielwort,ziel_ipa,kind_ipa,versuch}],
 *            klassifikation:{ kategorie, begruendung:[..], prozesse:[{name,typ,beispiele:[..]}] } }
 */
(function (global) {
  "use strict";

  var LOKAL_TTF = "assets/fonts/CharisSIL.ttf";
  var CDN_TTF = "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
  var DISCLAIMER = "Lern-/Reflexionshilfe — ersetzt keine fachliche Diagnose.";

  var fontCache = null; // { name, base64 } – nach erstem Laden gecached

  function jsPDFCtor() {
    return (global.jspdf && global.jspdf.jsPDF) || global.jsPDF || null;
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf), bin = "", chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return global.btoa(bin);
  }

  // Lädt die IPA-Schrift (lokal bevorzugt, sonst CDN) und cached sie.
  function ladeFont() {
    if (fontCache) return Promise.resolve(fontCache);
    function hole(url, name) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      }).then(function (buf) {
        fontCache = { name: name, base64: arrayBufferToBase64(buf) };
        return fontCache;
      });
    }
    return hole(LOKAL_TTF, "CharisSIL").catch(function () {
      return hole(CDN_TTF, "NotoSans");
    });
  }

  function fmtAlter(j, m) {
    j = j || 0; m = m || 0;
    return j + " Jahr" + (j === 1 ? "" : "e") + ", " + m + " Monat" + (m === 1 ? "" : "e");
  }
  function heute() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function safePseudo(s) {
    return String(s || "").trim().replace(/[^\wäöüÄÖÜß\- ]+/g, "").replace(/\s+/g, "-").slice(0, 40);
  }

  function exportieren(data) {
    var JsPDF = jsPDFCtor();
    if (!JsPDF) { global.alert("PDF-Bibliothek nicht geladen (jsPDF). Bitte Internetverbindung prüfen."); return Promise.reject(new Error("jsPDF fehlt")); }

    return ladeFont().then(function (font) {
      var doc = new JsPDF({ unit: "pt", format: "a4" });
      var FONT = "ipa";
      doc.addFileToVFS(font.name + ".ttf", font.base64);
      doc.addFont(font.name + ".ttf", FONT, "normal");
      doc.setFont(FONT, "normal");

      var pageW = doc.internal.pageSize.getWidth();
      var pageH = doc.internal.pageSize.getHeight();
      var M = 40;
      var pseud = String((data && data.pseudonym) || "").trim();

      // --- Kopf ---
      doc.setFontSize(18);
      doc.text("Dodd-Analyse", M, 56);
      doc.setFontSize(11);
      var y = 80;
      doc.text("Datum: " + heute(), M, y); y += 16;
      if (pseud) { doc.text("Klient: " + pseud, M, y); y += 16; }
      doc.text("Alter: " + fmtAlter(data.alter_jahre, data.alter_monate), M, y); y += 10;

      // --- Tabelle (AutoTable: Seitenumbruch + wiederholter Kopf automatisch) ---
      var body = (data.rows || []).map(function (r) {
        return [r.zielwort || "", r.ziel_ipa || "", r.kind_ipa || "", String(r.versuch || 1)];
      });
      doc.autoTable({
        startY: y + 8,
        head: [["Zielwort", "Ziel-IPA", "Kind-IPA", "Versuch"]],
        body: body,
        margin: { left: M, right: M, bottom: 56 },
        styles: { font: FONT, fontStyle: "normal", fontSize: 11, cellPadding: 5, overflow: "linebreak" },
        headStyles: { font: FONT, fontStyle: "normal", fillColor: [107, 79, 158], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [246, 241, 232] },
        columnStyles: { 3: { halign: "center", cellWidth: 60 } },
        // Fußzeile (Disclaimer + Seitenzahl) auf jeder Seite
        didDrawPage: function (hook) {
          doc.setFontSize(9);
          doc.setTextColor(110);
          doc.text(DISCLAIMER, M, pageH - 30);
          var seite = doc.internal.getNumberOfPages();
          doc.text("Seite " + hook.pageNumber + " / " + seite, pageW - M, pageH - 30, { align: "right" });
          doc.setTextColor(0);
        }
      });

      // --- Klassifikations-Ergebnis ---
      var k = data.klassifikation || {};
      var cy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 28;
      function ensure(space) {
        if (cy + space > pageH - 56) { doc.addPage(); cy = 56; }
      }
      ensure(60);
      doc.setFontSize(11); doc.setTextColor(0);
      doc.text("Vorgeschlagene Klassifikation:", M, cy); cy += 20;
      doc.setFontSize(14);
      doc.text(k.kategorie || "—", M, cy); cy += 22;

      if (k.begruendung && k.begruendung.length) {
        doc.setFontSize(11);
        doc.text("Begründung:", M, cy); cy += 16;
        doc.setFontSize(10);
        k.begruendung.forEach(function (b) {
          var lines = doc.splitTextToSize("• " + b, pageW - 2 * M);
          ensure(lines.length * 13 + 4);
          doc.text(lines, M, cy); cy += lines.length * 13 + 2;
        });
        cy += 6;
      }

      if (k.prozesse && k.prozesse.length) {
        doc.setFontSize(11);
        ensure(20); doc.text("Erkannte Prozesse:", M, cy); cy += 16;
        doc.setFontSize(10);
        k.prozesse.forEach(function (p) {
          var bsp = (p.beispiele && p.beispiele.length) ? "  (" + p.beispiele.join(", ") + ")" : "";
          var txt = "• " + p.name + (p.typ ? " [" + p.typ + "]" : "") + bsp;
          var lines = doc.splitTextToSize(txt, pageW - 2 * M);
          ensure(lines.length * 13 + 4);
          doc.text(lines, M, cy); cy += lines.length * 13 + 2;
        });
      }

      // --- Dateiname + Download (Klick -> Browser-Download) ---
      var name = "Dodd-Analyse_" + (pseud ? safePseudo(pseud) + "_" : "") + heute() + ".pdf";
      doc.save(name);
      return name;
    });
  }

  global.LT_PdfExport = { export: exportieren };
})(window);
