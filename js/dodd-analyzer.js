/* dodd-analyzer.js
 * Klassifikations-Logik nach Dodd (dt. Adaption Fox-Boyer).
 *
 * WICHTIG: Dies ist eine LERN- und REFLEXIONS-Hilfe, KEIN Diagnose-Tool für
 * reale Patient:innen. Die Heuristik bildet die Logik des Klassifikations-
 * baums nach, ersetzt aber keine fachliche Auswertung.
 *
 * Ablauf (gemäß Konzept):
 *   1. Pro Produktion: Ziel-IPA und Kind-IPA tokenisieren und ausrichten.
 *   2. Abweichungen (Substitution/Tilgung/Hinzufügung) erkennen.
 *   3. Gegen processes.json matchen, Vorkommen + Konsistenz zählen.
 *   4. Inkonsequenz-Score über mehrfach produzierte Wörter berechnen.
 *   5. Klassifikation in eine der vier Dodd-Kategorien.
 */
(function (global) {
  "use strict";

  // --- IPA-Tokenizer --------------------------------------------------------

  var DIGRAPHS = ["aɪ", "aʊ", "ɔʏ", "ɔɪ", "ts", "pf", "tʃ", "dʒ"];
  // Zeichen, die sich an das vorangehende Segment anhängen:
  var MODIFIER = "ːˑ̩̯̃ʰ̪ʷʲ̴̥";

  function istModifier(ch) { return MODIFIER.indexOf(ch) !== -1; }

  function tokenize(str) {
    if (!str) return [];
    // Normalisieren: Tie-Bars, Betonungs-, Silben- und Klammerzeichen entfernen
    var s = String(str).normalize("NFC")
      .replace(/[͡͠]/g, "")   // Tie-Bar (Affrikaten-Bogen)
      .replace(/[ˈˌ.\[\]\/ ]/g, "");     // Betonung, Silbengrenze, Klammern, Leerzeichen
    var tokens = [];
    var i = 0;
    while (i < s.length) {
      var two = s.substr(i, 2);
      var tok;
      if (DIGRAPHS.indexOf(two) !== -1) {
        tok = two; i += 2;
      } else {
        tok = s[i]; i += 1;
      }
      // anhängende Modifier (Längung, Silbisch, Unsilbisch, Nasalierung …)
      while (i < s.length && istModifier(s[i])) {
        tok += s[i]; i += 1;
      }
      // Falls das Segment NUR aus einem Modifier besteht: an Vorgänger hängen
      if (tok.length && istModifier(tok[0]) && tokens.length) {
        tokens[tokens.length - 1] += tok;
      } else {
        tokens.push(tok);
      }
    }
    return tokens;
  }

  // Kern-Phonem ohne Längung/Silbisch/Unsilbisch – für Identitätsvergleich
  function base(token) {
    if (!token) return token;
    return token.replace(new RegExp("[" + MODIFIER + "]", "g"), "");
  }

  var VOKALE = "aeiouəɐɛɪɔʊyøœʏ";
  function istVokalTok(token) {
    var b = base(token);
    return b.length > 0 && VOKALE.indexOf(b[0]) !== -1;
  }

  // --- Alignment (einfache Edit-Distanz mit Backtrace) ----------------------

  // Liefert Operationen: {op:'match'|'sub'|'del'|'ins', ziel, kind, zi, ki}
  function align(zielTokens, kindTokens) {
    var n = zielTokens.length, m = kindTokens.length;
    var dp = [];
    for (var a = 0; a <= n; a++) {
      dp[a] = [];
      for (var b = 0; b <= m; b++) dp[a][b] = 0;
    }
    for (var x = 0; x <= n; x++) dp[x][0] = x;
    for (var y = 0; y <= m; y++) dp[0][y] = y;
    for (var z = 1; z <= n; z++) {
      for (var k = 1; k <= m; k++) {
        var gleich = base(zielTokens[z - 1]) === base(kindTokens[k - 1]);
        var kosten = gleich ? 0 : 1;
        dp[z][k] = Math.min(
          dp[z - 1][k - 1] + kosten,
          dp[z - 1][k] + 1, // Tilgung (Ziel ohne Kind)
          dp[z][k - 1] + 1  // Hinzufügung (Kind ohne Ziel)
        );
      }
    }
    // Backtrace
    var ops = [];
    var ai = n, bj = m;
    while (ai > 0 || bj > 0) {
      if (ai > 0 && bj > 0) {
        var gl = base(zielTokens[ai - 1]) === base(kindTokens[bj - 1]);
        var ko = gl ? 0 : 1;
        if (dp[ai][bj] === dp[ai - 1][bj - 1] + ko) {
          ops.unshift({
            op: gl ? "match" : "sub",
            ziel: zielTokens[ai - 1], kind: kindTokens[bj - 1],
            zi: ai - 1, ki: bj - 1
          });
          ai--; bj--; continue;
        }
      }
      if (ai > 0 && dp[ai][bj] === dp[ai - 1][bj] + 1) {
        ops.unshift({ op: "del", ziel: zielTokens[ai - 1], kind: null, zi: ai - 1, ki: bj });
        ai--; continue;
      }
      ops.unshift({ op: "ins", ziel: null, kind: kindTokens[bj - 1], zi: ai, ki: bj - 1 });
      bj--;
    }
    return ops;
  }

  // --- Prozess-Erkennung ----------------------------------------------------

  function ladeProzesse(processesJson) {
    return (processesJson && processesJson.prozesse) ? processesJson.prozesse : [];
  }

  // Findet substitutionsbasierte Prozesse, deren Regel von->zu passt.
  function matchSubstitution(prozesse, zielBase, kindBase) {
    var treffer = [];
    prozesse.forEach(function (p) {
      var r = p.regel || {};
      if (r.von && r.zu) {
        if (r.von.indexOf(zielBase) !== -1 && r.zu.indexOf(kindBase) !== -1) {
          treffer.push(p);
        }
      }
    });
    return treffer;
  }

  /* Analysiert eine einzelne Produktion und liefert erkannte Ereignisse. */
  function analyseProduktion(prod, prozesse) {
    var zielT = tokenize(prod.ziel_ipa);
    var kindT = tokenize(prod.kind_ipa);
    var ops = align(zielT, kindT);
    var ereignisse = [];

    ops.forEach(function (o, idx) {
      if (o.op === "sub") {
        var zb = base(o.ziel), kb = base(o.kind);
        var treffer = matchSubstitution(prozesse, zb, kb);
        if (treffer.length) {
          treffer.forEach(function (p) {
            ereignisse.push({ prozessId: p.id, art: "substitution", ziel: zb, kind: kb, position: pos(idx, ops.length) });
          });
        } else {
          // unklassifizierte Substitution (kein hinterlegter Prozess)
          ereignisse.push({ prozessId: null, art: "substitution", ziel: zb, kind: kb, position: pos(idx, ops.length) });
        }
      } else if (o.op === "del") {
        var p2 = klassifiziereTilgung(o, idx, ops, prozesse);
        ereignisse.push(p2);
      } else if (o.op === "ins") {
        ereignisse.push({ prozessId: "epenthese", art: "hinzufuegung", ziel: null, kind: base(o.kind), position: pos(idx, ops.length) });
      }
    });

    return { ziel_ipa: prod.ziel_ipa, kind_ipa: prod.kind_ipa, zielTokens: zielT, kindTokens: kindT, ereignisse: ereignisse };
  }

  function pos(idx, laenge) {
    if (idx === 0) return "initial";
    if (idx === laenge - 1) return "final";
    return "medial";
  }

  function klassifiziereTilgung(o, idx, ops, prozesse) {
    var b = base(o.ziel);
    var vokal = istVokalTok(o.ziel);
    if (vokal) {
      return { prozessId: "silbenreduktion-unbetont", art: "tilgung", ziel: b, kind: null, position: pos(idx, ops.length) };
    }
    var p = pos(idx, ops.length);
    // War der getilgte Konsonant Teil einer Konsonantenverbindung? Dann
    // Konsonantenverbindungsreduktion (typisch) – das hat VORRANG vor der
    // Positions-Regel. Sonst würde die Tilgung eines Cluster-Glieds am Wort-
    // anfang/-ende fälschlich als (untypische) Initial- bzw. (typische) Final-
    // tilgung eines EINZELkonsonanten gewertet. Maßgeblich ist das nächste
    // tatsächlich vorhandene Ziel-Segment (Einschübe/weitere Tilgungen über-
    // springen).
    var prevZiel = null, nextZiel = null, i;
    for (i = idx - 1; i >= 0; i--) { if (ops[i].ziel) { prevZiel = ops[i].ziel; break; } }
    for (i = idx + 1; i < ops.length; i++) { if (ops[i].ziel) { nextZiel = ops[i].ziel; break; } }
    var imCluster = (prevZiel && !istVokalTok(prevZiel)) || (nextZiel && !istVokalTok(nextZiel));
    if (imCluster) {
      return { prozessId: "konsonantenverbindung-reduktion", art: "tilgung", ziel: b, kind: null, position: p };
    }
    // Einzelkonsonant: Position bestimmt den Prozess
    if (p === "initial") {
      return { prozessId: "initiale-konsonantentilgung", art: "tilgung", ziel: b, kind: null, position: "initial" };
    }
    return { prozessId: "finale-konsonantentilgung", art: "tilgung", ziel: b, kind: null, position: p };
  }

  // --- Aggregation + Konsistenz --------------------------------------------

  function zaehleGelegenheiten(prozess, alleProduktionen) {
    var r = prozess.regel || {};
    if (!r.von) return null; // nur für substitutionsbasierte sinnvoll zählbar
    var anzahl = 0;
    alleProduktionen.forEach(function (prod) {
      tokenize(prod.ziel_ipa).forEach(function (t) {
        if (r.von.indexOf(base(t)) !== -1) anzahl += 1;
      });
    });
    return anzahl;
  }

  // --- Inkonsequenz ---------------------------------------------------------

  function inkonsequenzScore(produktionen) {
    // Gruppiere nach Zielwort (oder Ziel-IPA, falls kein Wort)
    var gruppen = {};
    produktionen.forEach(function (p) {
      var key = (p.zielwort || p.ziel_ipa || "").trim().toLowerCase();
      if (!key) return;
      if (!gruppen[key]) gruppen[key] = [];
      gruppen[key].push((p.kind_ipa || "").trim());
    });

    var mehrfach = 0, variabel = 0;
    var details = [];
    Object.keys(gruppen).forEach(function (key) {
      var produktionenDesWortes = gruppen[key];
      if (produktionenDesWortes.length < 2) return;
      mehrfach += 1;
      var uniq = {};
      produktionenDesWortes.forEach(function (k) { uniq[k] = true; });
      var anzahlVarianten = Object.keys(uniq).length;
      var variiert = anzahlVarianten > 1;
      if (variiert) variabel += 1;
      details.push({ wort: key, versuche: produktionenDesWortes.length, varianten: anzahlVarianten, variabel: variiert, produktionen: produktionenDesWortes });
    });

    var score = mehrfach > 0 ? variabel / mehrfach : 0;
    return { score: score, woerter_mehrfach: mehrfach, woerter_variabel: variabel, details: details };
  }

  // --- Hauptfunktion --------------------------------------------------------

  function analyze(input, processesJson) {
    var prozesse = ladeProzesse(processesJson);
    var prozessMap = {};
    prozesse.forEach(function (p) { prozessMap[p.id] = p; });

    var alter = (input.alter_jahre || 0) + (input.alter_monate || 0) / 12;
    var produktionen = input.produktionen || [];

    // Schritt 1–2: pro Produktion analysieren
    var proProduktion = produktionen.map(function (prod) {
      return analyseProduktion(prod, prozesse);
    });

    // Schritt 3: Vorkommen + Konsistenz aggregieren
    var agg = {}; // prozessId -> {vorkommen, beispiele:[]}
    proProduktion.forEach(function (pa) {
      pa.ereignisse.forEach(function (ev) {
        if (!ev.prozessId) return; // unklassifizierte Substitution separat
        if (!agg[ev.prozessId]) agg[ev.prozessId] = { vorkommen: 0, beispiele: [] };
        agg[ev.prozessId].vorkommen += 1;
        if (agg[ev.prozessId].beispiele.length < 5) {
          agg[ev.prozessId].beispiele.push((ev.ziel || "∅") + " → " + (ev.kind || "∅"));
        }
      });
    });

    // unklassifizierte Substitutionen sammeln (Einzellaut-Fehler / Distorsionen)
    var unklassifiziert = [];
    proProduktion.forEach(function (pa) {
      pa.ereignisse.forEach(function (ev) {
        if (!ev.prozessId && ev.art === "substitution") {
          unklassifiziert.push(ev.ziel + " → " + ev.kind);
        }
      });
    });

    var prozessErgebnisse = Object.keys(agg).map(function (id) {
      var p = prozessMap[id] || { id: id, name: id, typ: "unbekannt", kategorie: "phonologisch", beschreibung: "", altersgrenze_jahre: null };
      var gelegenheiten = zaehleGelegenheiten(p, produktionen);
      var konsistenz = (gelegenheiten && gelegenheiten > 0)
        ? Math.min(1, agg[id].vorkommen / gelegenheiten)
        : null;
      return {
        id: p.id,
        name: p.name,
        typ: p.typ,
        kategorie: p.kategorie,
        beschreibung: p.beschreibung,
        vorkommen: agg[id].vorkommen,
        gelegenheiten: gelegenheiten,
        konsistenz: konsistenz,
        altersgrenze_jahre: p.altersgrenze_jahre,
        alters_bewertung: bewerteAlter(p, alter),
        beispiele: agg[id].beispiele,
        quelle: p.quelle
      };
    });

    // Schritt 4: Inkonsequenz
    var ink = inkonsequenzScore(produktionen);

    // Schritt 5: Klassifikation
    var klass = klassifiziere(prozessErgebnisse, ink, alter, unklassifiziert);

    return {
      alter_dezimal: Math.round(alter * 100) / 100,
      anzahl_produktionen: produktionen.length,
      prozesse: prozessErgebnisse,
      unklassifizierte_substitutionen: unklassifiziert,
      inkonsequenz: ink,
      klassifikation: klass,
      produktionen_analyse: proProduktion
    };
  }

  function bewerteAlter(prozess, alter) {
    if (prozess.typ === "untypisch") {
      return { status: "untypisch", text: "Untypischer Prozess – in jedem Alter auffällig." };
    }
    if (prozess.typ === "artikulatorisch") {
      return { status: "artikulatorisch", text: "Phonetische Fehlbildung (Lautbildung), kein Phonologie-Prozess." };
    }
    if (prozess.altersgrenze_jahre == null) {
      return { status: "unklar", text: "Keine Altersgrenze hinterlegt (TBD)." };
    }
    if (alter > prozess.altersgrenze_jahre) {
      return { status: "verzoegert", text: "Verzögert: Kind (" + fmtAlter(alter) + ") über Altersgrenze " + fmtAlter(prozess.altersgrenze_jahre) + "." };
    }
    return { status: "im_rahmen", text: "Im Rahmen: unter Altersgrenze " + fmtAlter(prozess.altersgrenze_jahre) + "." };
  }

  function fmtAlter(a) {
    var j = Math.floor(a);
    var m = Math.round((a - j) * 12);
    if (m === 12) { j += 1; m = 0; }
    return j + ";" + (m < 10 ? "0" + m : m);
  }

  function klassifiziere(prozesse, ink, alter, unklassifiziert) {
    var begruendung = [];
    var INK_GRENZE = 0.40;

    var phonologisch = prozesse.filter(function (p) { return p.kategorie === "phonologisch"; });
    var untypisch = phonologisch.filter(function (p) { return p.typ === "untypisch"; });
    var typisch = phonologisch.filter(function (p) { return p.typ === "typisch"; });
    var typischVerzoegert = typisch.filter(function (p) { return p.alters_bewertung.status === "verzoegert"; });
    var typischImRahmen = typisch.filter(function (p) { return p.alters_bewertung.status === "im_rahmen"; });
    var artikulatorisch = prozesse.filter(function (p) { return p.kategorie === "phonetisch" || p.typ === "artikulatorisch"; });

    // 1) Inkonsequenz-Score
    if (ink.woerter_mehrfach >= 1 && ink.score > INK_GRENZE) {
      begruendung.push("Inkonsequenz-Score " + Math.round(ink.score * 100) + "% (> 40%): " +
        ink.woerter_variabel + " von " + ink.woerter_mehrfach + " mehrfach produzierten Wörtern variieren.");
      return ergebnis("Inkonsequente phonologische Störung", begruendung, ink);
    } else if (ink.woerter_mehrfach >= 1) {
      begruendung.push("Inkonsequenz-Score " + Math.round(ink.score * 100) + "% (≤ 40%).");
    } else {
      begruendung.push("Inkonsequenz nicht beurteilbar (keine mehrfach produzierten Wörter).");
    }

    // 2) untypische Prozesse
    if (untypisch.length > 0) {
      begruendung.push("Untypische phonologische Prozesse vorhanden: " +
        untypisch.map(function (p) { return p.name; }).join(", ") + ".");
      return ergebnis("Konsequente phonologische Störung", begruendung, ink);
    }
    begruendung.push("Keine untypischen phonologischen Prozesse erkannt.");

    // 3) typische Prozesse über Altersgrenze
    if (typischVerzoegert.length > 0) {
      begruendung.push("Typische Prozesse über der Altersgrenze (verzögert): " +
        typischVerzoegert.map(function (p) { return p.name + " [" + fmtAlter(p.altersgrenze_jahre || 0) + "]"; }).join(", ") + ".");
      return ergebnis("Phonologische Verzögerung", begruendung, ink);
    }

    // 4) nur Einzellaut-/Artikulationsfehler ohne Prozessmuster
    if (phonologisch.length === 0 && (artikulatorisch.length > 0 || unklassifiziert.length > 0)) {
      begruendung.push("Keine phonologischen Prozessmuster; nur Einzellaut-/Lautbildungsfehler (" +
        (artikulatorisch.map(function (p) { return p.name; }).concat(unklassifiziert).join(", ") || "—") + ").");
      return ergebnis("Artikulationsstörung", begruendung, ink);
    }

    // 5) sonst: altersgemäß / unauffällig
    if (typischImRahmen.length > 0) {
      begruendung.push("Nur typische Prozesse innerhalb der Altersnorm – altersgemäße Entwicklung.");
    } else {
      begruendung.push("Keine auffälligen Prozesse erkannt.");
    }
    return ergebnis("Unauffällig / altersgemäß", begruendung, ink);
  }

  function ergebnis(kategorie, begruendung, ink) {
    return {
      kategorie: kategorie,
      begruendung: begruendung,
      inkonsequenz_score: Math.round(ink.score * 100),
      hinweis: "Lern-/Reflexions-Hilfe – ersetzt keine fachliche Diagnose."
    };
  }

  global.LT_IPA = { tokenize: tokenize, base: base, istVokal: istVokalTok, align: align };
  global.LT_DoddAnalyzer = { analyze: analyze, fmtAlter: fmtAlter };
})(window);
