/* case-generator.js
 * Prozeduraler Generator für PLAUSIBLE, ZUFÄLLIGE Dodd-Testfälle.
 *
 * Zweck: Das Diagnose-Tool lässt sich nicht zuverlässig prüfen, wenn die
 * Beispiele feste Strings mit einprogrammiertem Ausgang sind. Dieser Generator
 * erzeugt aus den 25 Zielwörtern (words.json) und den Prozess-Definitionen
 * (processes.json) jedes Mal einen NEUEN Fall: zufällig welche Wörter betroffen
 * sind, welche Prozess-Mischung greift und in welchem Alter. Die ERWARTETE
 * Kategorie ergibt sich aus dem angewandten Prozessprofil (Dodd / Fox-Boyer),
 * NICHT aus einem fixen Ergebnis – so prüft der Test, ob der Klassifikator die
 * Kategorie über viele verschiedene Eingaben hinweg robust zurückfindet.
 *
 * WICHTIG: Generator (Surface-Formen ERZEUGEN) und Klassifikator (Prozesse aus
 * Surface-Formen INFERIEREN) arbeiten in entgegengesetzte Richtung und teilen
 * keine Logik – der Test ist also nicht zirkulär.
 *
 * Reines Logik-Modul, UI-unabhängig:
 *   LT_CaseGenerator.generate(kategorieId, words, processesJson, rng?) -> {
 *     name, alter_jahre, alter_monate, kind_produktionen, expected_category, applied
 *   }
 *   LT_CaseGenerator.makeRng(seed) -> () => [0,1)   (seedbar, reproduzierbar)
 *
 * Plausibilität (Phonem-Mappings, Altersgrenzen) orientiert sich an Fox-Boyer /
 * processes.json. Stellen mit fachlicher Unsicherheit: TBD verifizieren.
 */
(function (global) {
  "use strict";

  // --- Mini-Tokenizer (hält Betonungszeichen, anders als der Analyzer) -------
  var DIGRAPHS = ["aɪ", "aʊ", "ɔʏ", "ɔɪ", "ts", "pf", "tʃ", "dʒ"];
  var MODIFIER = "ːˑ̩̯̃ʰ̪ʷʲ̴̥";
  var VOKALE = "aeiouəɐɛɪɔʊyøœʏ";

  function istModifier(ch) { return MODIFIER.indexOf(ch) !== -1; }
  function base(seg) { return seg.replace(new RegExp("[" + MODIFIER + "]", "g"), ""); }
  // Normalisiert IPA-Script-g (ɡ) -> ASCII-g fürs Matching (Daten mischen beide).
  function nb(seg) { return base(seg).replace(/ɡ/g, "g"); }
  function istVokalBase(b) { return b.length > 0 && VOKALE.indexOf(b[0]) !== -1; }
  // Nukleus = Vokal ODER silbischer Konsonant (l̩, n̩ …): nicht substituieren/tilgen.
  function istNukleus(seg) { return istVokalBase(base(seg)) || seg.indexOf("̩") !== -1; }

  function tokenize(str) {
    var s = String(str).normalize("NFC");
    var tokens = [], i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (ch === "ˈ" || ch === "ˌ") { tokens.push({ stress: ch }); i++; continue; }
      if (ch === "." || ch === " ") { i++; continue; }
      var two = s.substr(i, 2), tok;
      if (DIGRAPHS.indexOf(two) !== -1) { tok = two; i += 2; } else { tok = s[i]; i += 1; }
      while (i < s.length && istModifier(s[i])) { tok += s[i]; i += 1; }
      tokens.push({ seg: tok });
    }
    return tokens;
  }
  function detok(tokens) {
    return tokens.map(function (t) { return t.stress ? t.stress : t.seg; }).join("")
      .replace(/g/g, "ɡ");   // Ausgabe in IPA-Script-g (Konvention von words.json)
  }

  // --- seedbarer PRNG (mulberry32) -----------------------------------------
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
  function chance(p, rng) { return rng() < p; }
  function randInt(a, b, rng) { return a + Math.floor(rng() * (b - a + 1)); }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // --- Prozess-Bausteine (Generierungs-Wissen, plausible Phonem-Mappings) ----
  // type "sub": Substitution per Phonem-Map; "glottal": -> ʔ/h; Tilgungen separat.
  var SUB = {
    // typische phonologische Prozesse
    velar:    { id: "vorverlagerung-velar", map: { k: "t", g: "d", "ŋ": "n" } },
    plosiv:   { id: "plosivierung",         map: { f: "p", v: "b", s: "t", z: "d", "ʃ": "t", "ç": "t", x: "k" } },
    deaffr:   { id: "deaffrizierung",       map: { ts: "s", pf: "f", "tʃ": "ʃ" } },
    schfront: { id: "vorverlagerung-sch",   map: { "ʃ": "s" } },
    // untypische phonologische Prozesse
    backing:  { id: "rueckverlagerung-backing", map: { t: "k", d: "g", n: "ŋ", s: "x" } },
    denasal:  { id: "denasalierung",        map: { m: "b", n: "d", "ŋ": "g" } },
    nasal:    { id: "nasalierung",          map: { b: "m", d: "n", g: "ŋ" } },
    glottal:  { id: "glottale-ersetzung",   glottal: true },
    // artikulatorische (phonetische) Distorsionen
    sigmatismus: { id: "sigmatismus", map: { s: "θ", z: "ð" } },
    schetismus:  { id: "schetismus",  map: { "ʃ": "ç" } },
    rhotazismus: { id: "rhotazismus", map: { "ʁ": "ʀ" } }
  };
  // Tilgungs-Prozesse
  var DEL = {
    fcd:        "finale-konsonantentilgung",
    cluster:    "konsonantenverbindung-reduktion",
    initialdel: "initiale-konsonantentilgung"
  };

  // --- Transformation eines Wortes nach Plan --------------------------------
  // plan = { subOrder: [SUB-keys], dels: [DEL-keys], consistency: 0..1 }
  function transformWord(targetIpa, plan, rng, appliedOut) {
    var toks = tokenize(targetIpa);

    // 1) Substitutionen: pro Token max. EIN Prozess (erste passende in subOrder).
    toks.forEach(function (t) {
      if (t.stress || istNukleus(t.seg)) return;
      var b = nb(t.seg);
      for (var pi = 0; pi < plan.subOrder.length; pi++) {
        var spec = SUB[plan.subOrder[pi]];
        if (!spec) continue;
        var tgt = spec.glottal ? (chance(0.5, rng) ? "ʔ" : "h") : spec.map[b];
        if (tgt != null) {
          if (chance(plan.consistency, rng)) { t.seg = tgt; appliedOut[spec.id] = true; }
          break; // ein Prozess pro Token
        }
      }
    });

    // 2) Tilgungen (auf dem aktuellen Token-Stand)
    (plan.dels || []).forEach(function (delKey) {
      if (delKey === "fcd") {
        for (var i = toks.length - 1; i >= 0; i--) {
          if (toks[i].stress) continue;
          if (!istNukleus(toks[i].seg) && chance(plan.consistency, rng)) {
            toks.splice(i, 1); appliedOut[DEL.fcd] = true;
          }
          break; // nur das tatsächlich letzte Segment betrachten
        }
      } else if (delKey === "initialdel") {
        var fi = -1, nx = -1, j;
        for (j = 0; j < toks.length; j++) { if (!toks[j].stress) { fi = j; break; } }
        if (fi >= 0 && !istNukleus(toks[fi].seg)) {
          for (j = fi + 1; j < toks.length; j++) { if (!toks[j].stress) { nx = j; break; } }
          if (nx >= 0 && istNukleus(toks[nx].seg) && chance(plan.consistency, rng)) {
            toks.splice(fi, 1); appliedOut[DEL.initialdel] = true;
          }
        }
      } else if (delKey === "cluster") {
        for (var a = 0; a < toks.length - 1; a++) {
          if (toks[a].stress || toks[a + 1].stress) continue;
          if (!istNukleus(toks[a].seg) && !istNukleus(toks[a + 1].seg)) {
            if (chance(plan.consistency, rng)) { toks.splice(a + 1, 1); appliedOut[DEL.cluster] = true; }
            break;
          }
        }
      }
    });

    return detok(toks);
  }

  // Erzwingt, dass sich mind. zwei der Versuche unterscheiden (für Inkonsequenz).
  function forceDifferent(versuche, target, rng) {
    var uniq = {}; versuche.forEach(function (v) { uniq[v] = true; });
    if (Object.keys(uniq).length >= 2) return versuche;
    // Alle gleich -> einen Versuch durch eine erzwungene Einzel-Substitution ändern.
    var forced = transformWord(target, { subOrder: ["backing", "plosiv", "denasal"], dels: [], consistency: 1 }, rng, {});
    if (forced === versuche[0]) forced = target; // Fallback
    if (forced === versuche[0]) forced = versuche[0] + "ə"; // letzter Ausweg
    versuche[versuche.length - 1] = forced;
    return versuche;
  }

  // --- Altersgrenzen aus processes.json -------------------------------------
  function ageLimit(processesJson, procId) {
    var list = (processesJson && processesJson.prozesse) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === procId) return list[i].altersgrenze_jahre;
    }
    return null;
  }
  function toJahreMonate(dezimal) {
    var j = Math.floor(dezimal);
    var m = Math.round((dezimal - j) * 12);
    if (m === 12) { j += 1; m = 0; }
    return { jahre: j, monate: m };
  }

  // --- Kategorie-Strategien --------------------------------------------------

  // Baut die kind_produktionen (flaches 25er-Array) für einen Plan mit lauter
  // EINfach-Versuchen. Liefert auch die Menge angewandter Prozesse.
  function einzelfall(words, plan, rng) {
    var applied = {};
    var kp = words.map(function (w) { return transformWord(w.ipa, plan, rng, applied); });
    return { kind_produktionen: kp, applied: applied };
  }

  function generate(kategorieId, words, processesJson, rng) {
    rng = rng || Math.random;
    var TRIES = 25;

    for (var attempt = 0; attempt < TRIES; attempt++) {
      var res = null;

      if (kategorieId === "artikulationsstoerung") {
        // 1–2 artikulatorische Distorsionen, keine Phonologie.
        var arts = shuffle(["sigmatismus", "schetismus", "rhotazismus"], rng).slice(0, randInt(1, 2, rng));
        // Sigmatismus oft dabei (trifft mehr Wörter -> realistischer)
        if (arts.indexOf("sigmatismus") === -1 && chance(0.6, rng)) arts[0] = "sigmatismus";
        var f = einzelfall(words, { subOrder: arts, dels: [], consistency: 1 }, rng);
        var devA = anzahlAbweichungen(words, f.kind_produktionen);
        if (devA >= 3) {
          var a = toJahreMonate(4 + rng() * 2); // 4;0–6;0
          res = { name: "Generiert: " + arts.join(" + "), alter_jahre: a.jahre, alter_monate: a.monate,
                  kind_produktionen: f.kind_produktionen, expected_category: "Artikulationsstörung",
                  applied: Object.keys(f.applied) };
        }

      } else if (kategorieId === "phonologische-verzoegerung") {
        // 2–4 TYPISCHE Prozesse, konsequent, Alter ÜBER der höchsten Grenze.
        var typ = shuffle(["velar", "plosiv", "deaffr", "schfront", "fcd", "cluster"], rng).slice(0, randInt(2, 4, rng));
        var subs = typ.filter(function (k) { return SUB[k]; });
        var dels = typ.filter(function (k) { return DEL[k]; });
        if (!subs.length) subs = ["plosiv"]; // mind. eine Substitution
        var ids = typ.map(function (k) { return SUB[k] ? SUB[k].id : DEL[k]; });
        var maxLimit = 0;
        ids.forEach(function (id) { var l = ageLimit(processesJson, id); if (l != null && l > maxLimit) maxLimit = l; });
        var ageDec = Math.min(6.5, maxLimit + 0.4 + rng() * 1.1); // sicher > Grenze
        // Konsequenz < 1: realistischer (Kind produziert manche Laute korrekt).
        var fv = einzelfall(words, { subOrder: shuffle(subs, rng), dels: dels, consistency: 0.8 + rng() * 0.2 }, rng);
        if (Object.keys(fv.applied).length >= 1) {
          var av = toJahreMonate(ageDec);
          res = { name: "Generiert: " + typ.join(" + "), alter_jahre: av.jahre, alter_monate: av.monate,
                  kind_produktionen: fv.kind_produktionen, expected_category: "Phonologische Verzögerung",
                  applied: Object.keys(fv.applied) };
        }

      } else if (kategorieId === "konsequente-phonologische-stoerung") {
        // mind. ein UNTYPISCHER Prozess (+ optional typische), konsequent.
        var unt = shuffle(["backing", "denasal", "nasal", "glottal", "initialdel"], rng).slice(0, randInt(1, 2, rng));
        var extra = chance(0.5, rng) ? [pick(["velar", "plosiv", "deaffr"], rng)] : [];
        var allK = unt.concat(extra);
        var ksubs = allK.filter(function (k) { return SUB[k]; });
        var kdels = allK.filter(function (k) { return DEL[k]; });
        var untIds = ["rueckverlagerung-backing", "denasalierung", "nasalierung", "glottale-ersetzung", "initiale-konsonantentilgung"];
        var fk = einzelfall(words, { subOrder: shuffle(ksubs, rng), dels: kdels, consistency: 0.8 + rng() * 0.2 }, rng);
        var hatUnt = Object.keys(fk.applied).some(function (id) { return untIds.indexOf(id) !== -1; });
        if (hatUnt) {
          var ak = toJahreMonate(4 + rng() * 2);
          res = { name: "Generiert: " + allK.join(" + "), alter_jahre: ak.jahre, alter_monate: ak.monate,
                  kind_produktionen: fk.kind_produktionen, expected_category: "Konsequente phonologische Störung",
                  applied: Object.keys(fk.applied) };
        }

      } else if (kategorieId === "inkonsequente-phonologische-stoerung") {
        // K Wörter je 3 Versuche mit variierender Prozess-Anwendung (> 40 %).
        var K = randInt(9, 13, rng);
        var idxs = shuffle(words.map(function (_, i) { return i; }), rng).slice(0, K);
        var istMehrfach = {}; idxs.forEach(function (i) { istMehrfach[i] = true; });
        var alleSub = ["velar", "plosiv", "deaffr", "schfront", "backing", "denasal", "nasal"];
        var alleDel = ["fcd", "cluster", "initialdel"];
        var kpI = words.map(function (w, i) {
          if (!istMehrfach[i]) {
            // Einzelversuch: meist korrekt, gelegentlich leicht verändert.
            return transformWord(w.ipa, { subOrder: chance(0.4, rng) ? [pick(alleSub, rng)] : [], dels: [], consistency: 0.6 }, rng, {});
          }
          var versuche = [];
          for (var v = 0; v < 3; v++) {
            var sub = shuffle(alleSub, rng).slice(0, randInt(1, 2, rng));
            var del = chance(0.35, rng) ? [pick(alleDel, rng)] : [];
            versuche.push(transformWord(w.ipa, { subOrder: sub, dels: del, consistency: 0.7 }, rng, {}));
          }
          return forceDifferent(versuche, w.ipa, rng);
        });
        var ai = toJahreMonate(3.5 + rng() * 2); // 3;6–5;6
        res = { name: "Generiert: " + K + " variable Wörter", alter_jahre: ai.jahre, alter_monate: ai.monate,
                kind_produktionen: kpI, expected_category: "Inkonsequente phonologische Störung", applied: ["inkonsequenz"] };
      }

      if (res) return res;
    }
    return null; // sollte praktisch nie passieren
  }

  function anzahlAbweichungen(words, kp) {
    var n = 0;
    words.forEach(function (w, i) { if (kp[i] !== w.ipa) n++; });
    return n;
  }

  global.LT_CaseGenerator = { generate: generate, makeRng: makeRng };
})(window);
