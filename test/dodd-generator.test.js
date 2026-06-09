/* test/dodd-generator.test.js
 * Fuzz-Test des Dodd-Klassifikators mit PROZEDURAL GENERIERTEN Fällen.
 * Erzeugt pro Kategorie viele zufällige, plausible Fälle (js/case-generator.js)
 * und prüft, ob der Klassifikator (js/dodd-analyzer.js) die aus dem
 * Prozessprofil erwartete Kategorie zurückfindet. Gibt eine Trefferquote je
 * Kategorie aus und listet reproduzierbare Fehlfälle (mit Seed).
 *
 * Ausführen (im Projekt-Root):
 *   node test/dodd-generator.test.js [ANZAHL_PRO_KATEGORIE] [BASIS_SEED]
 * z. B.  node test/dodd-generator.test.js 200 1
 */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var root = path.resolve(__dirname, "..");

var ctx = { console: console }; ctx.window = ctx; vm.createContext(ctx);
["js/dodd-analyzer.js", "js/case-generator.js"].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
});
var Gen = ctx.window.LT_CaseGenerator, Dodd = ctx.window.LT_DoddAnalyzer;

function load(f) { return JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8")); }
var words = load("words.json"), processes = load("processes.json");

function buildProductions(kp) {
  var rows = [];
  words.forEach(function (w, idx) {
    var prod = kp[idx];
    if (Array.isArray(prod)) prod.forEach(function (k, vi) { rows.push({ zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: k, versuch: vi + 1 }); });
    else rows.push({ zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: prod || "", versuch: 1 });
  });
  return rows.filter(function (r) { return (r.ziel_ipa || "").trim() && (r.kind_ipa || "").trim(); });
}

var N = parseInt(process.argv[2], 10) || 200;
var BASE = parseInt(process.argv[3], 10) || 1;
var kategorien = [
  "artikulationsstoerung",
  "phonologische-verzoegerung",
  "konsequente-phonologische-stoerung",
  "inkonsequente-phonologische-stoerung"
];

console.log("Fuzz-Test: " + N + " generierte Fälle pro Kategorie (Basis-Seed " + BASE + ")\n");
var gesamtOk = 0, gesamt = 0;
kategorien.forEach(function (katId) {
  var ok = 0, fails = [];
  for (var i = 0; i < N; i++) {
    var seed = BASE * 100000 + gesamt + i;
    var rng = Gen.makeRng(seed);
    var fall = Gen.generate(katId, words, processes, rng);
    if (!fall) { fails.push({ seed: seed, got: "GENERATOR-NULL" }); continue; }
    var erg = Dodd.analyze({ alter_jahre: fall.alter_jahre, alter_monate: fall.alter_monate, produktionen: buildProductions(fall.kind_produktionen) }, processes);
    var got = erg.klassifikation.kategorie;
    if (got === fall.expected_category) ok++;
    else if (fails.length < 4) fails.push({ seed: seed, got: got, exp: fall.expected_category, applied: fall.applied, alter: fall.alter_jahre + ";" + fall.alter_monate, kp: fall.kind_produktionen });
  }
  gesamtOk += ok; gesamt += N;
  var quote = Math.round(ok / N * 1000) / 10;
  console.log((quote >= 95 ? "OK  " : "!!  ") + katId + ": " + ok + "/" + N + " (" + quote + "%)");
  fails.forEach(function (f) {
    if (f.got === "GENERATOR-NULL") { console.log("      [seed " + f.seed + "] Generator lieferte null"); return; }
    console.log("      [seed " + f.seed + "] erwartet " + f.exp + " -> bekam " + f.got + "  (Alter " + f.alter + ", Prozesse: " + (f.applied || []).join(",") + ")");
  });
});
console.log("\nGesamt: " + gesamtOk + "/" + gesamt + " (" + (Math.round(gesamtOk / gesamt * 1000) / 10) + "%)");
