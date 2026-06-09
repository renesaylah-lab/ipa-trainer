/* test/dodd-classification.test.js
 * Wiederholbarer Test der Dodd-Klassifikation OHNE Build-Tool/Abhängigkeit.
 * Lädt den echten Analyzer (js/dodd-analyzer.js) und prüft, dass JEDE Variante
 * jeder Beispiel-Kategorie aus data/dodd-examples.json in ihre erwartete
 * Dodd-Kategorie klassifiziert. Die Beispiele werden im UI pro Klick zufällig
 * gezogen – dieser Test deckt ALLE Varianten ab (unabhängig vom Zufall).
 *
 * Ausführen (im Projekt-Root):
 *   node test/dodd-classification.test.js
 * Exit-Code 0 = alles korrekt, 1 = mindestens eine Variante falsch.
 */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var root = path.resolve(__dirname, "..");

// Module in einem Kontext mit window-Shim laden (Browser-IIFE-Muster).
var ctx = { console: console }; ctx.window = ctx; vm.createContext(ctx);
["js/dodd-analyzer.js", "js/ortho-to-ipa.js"].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
});

function load(f) { return JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8")); }
var words = load("words.json");
var processes = load("processes.json");
var examples = load("dodd-examples.json");

// Baut die Produktionsliste einer Variante genau wie das UI (app.js).
function buildProductions(variante) {
  var rows = [];
  words.forEach(function (w, idx) {
    var prod = (variante.kind_produktionen || [])[idx];
    if (Array.isArray(prod)) {
      prod.forEach(function (k, vi) {
        rows.push({ zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: k, versuch: vi + 1 });
      });
    } else {
      rows.push({ zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: prod || "", versuch: 1 });
    }
  });
  return rows.filter(function (r) { return (r.ziel_ipa || "").trim() && (r.kind_ipa || "").trim(); });
}

var fails = 0, total = 0;
(examples.kategorien || []).forEach(function (kat) {
  (kat.varianten || []).forEach(function (v) {
    // Konsistenz: jede Variante muss so viele Einträge wie words.json haben.
    if ((v.kind_produktionen || []).length !== words.length) {
      console.log("  LENGTH-MISMATCH  " + kat.label + " / " + v.name +
        ": " + (v.kind_produktionen || []).length + " != " + words.length);
      fails++;
    }
    total++;
    var input = { alter_jahre: v.alter_jahre, alter_monate: v.alter_monate, produktionen: buildProductions(v) };
    var erg = ctx.window.LT_DoddAnalyzer.analyze(input, processes);
    var got = erg.klassifikation.kategorie;
    var ok = got === kat.category;
    if (!ok) fails++;
    console.log((ok ? "OK   " : "FAIL ") + "[" + kat.category + "] " + v.name +
      "  ->  " + got + "  (Inkonsequenz " + erg.klassifikation.inkonsequenz_score + "%)");
  });
});

console.log("\n" + (total - fails) + "/" + total + " Varianten korrekt klassifiziert.");
process.exit(fails ? 1 : 0);
