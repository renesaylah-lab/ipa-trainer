/* ortho-to-ipa.js
 * Heuristische Graphem-zu-Phonem-Konvertierung (G2P) für deutsche Orthografie
 * -> IPA. Bewusst eine 80–90%-Heuristik, KEINE vollständige G2P-Lösung. Der
 * konvertierte Wert ist immer im Korrektur-Popup nachbearbeitbar.
 *
 * Reines Logik-Modul, UI-unabhängig und isoliert testbar:
 *   LT_Ortho.orthoToIpa(input, zielIpa = null) -> string
 *   LT_Ortho.isAlreadyIpa(input)               -> boolean
 *
 * Regel-Reihenfolge: Trigraphe vor Digraphen vor Einzelzeichen (siehe unten).
 * Stellen mit fachlicher Unsicherheit sind mit "TBD verifizieren" markiert.
 */
(function (global) {
  "use strict";

  // --- Schritt 1: IPA-Detection --------------------------------------------
  // Enthält die Eingabe bereits IPA-spezifische Zeichen, wird NICHT konvertiert
  // (Profi-/Direktmodus). Buchstaben des dt. Alphabets (inkl. ä ö ü ß) zählen
  // nicht als IPA-spezifisch.
  var IPA_SPEZIFISCH = /[ʃʒçŋʁʔɐøœyʏʊɪɔɛəːˈˌɡˑ]|[̀-ͯ]/;

  function isAlreadyIpa(input) {
    return !!input && IPA_SPEZIFISCH.test(String(input));
  }

  // Vokal-Qualitäten je Schreibvokal (kurz/lang). Diphthonge separat.
  var LANG = { a: "aː", e: "eː", i: "iː", o: "oː", u: "uː", "ä": "ɛː", "ö": "øː", "ü": "yː" };
  var KURZ = { a: "a", e: "ɛ", i: "ɪ", o: "ɔ", u: "ʊ", "ä": "ɛ", "ö": "œ", "ü": "ʏ" };
  var VOKALE = "aeiouäöü";

  function istVokalBuchstabe(c) { return VOKALE.indexOf(c) !== -1; }
  function istHinterVokal(seg) {
    if (!seg) return false;
    if (seg.dipth) return seg.src === "au"; // au = hinten; ei/eu/äu = vorne
    return /[aou]/.test(seg.src);
  }

  // --- Silben-/Betonungs-Hilfen aus der Ziel-IPA ---------------------------
  // Nutzt den IPA-Tokenizer aus dodd-analyzer.js (LT_IPA). Nicht-silbische
  // Vokale (ɐ̯, mit U+032F) zählen NICHT als Silbe.
  var VOKAL_IPA = /[aeiouɛɪɔʊəɐyøœʏ]/;

  function silbischeVokalTokens(rawIpa) {
    if (!rawIpa || !global.LT_IPA) return [];
    return global.LT_IPA.tokenize(rawIpa).filter(function (t) {
      var b = t.replace(/[ːˑ]/g, "");
      return VOKAL_IPA.test(b[0] || "") && t.indexOf("̯") === -1;
    });
  }

  function silbenzahlIpa(rawIpa) {
    return silbischeVokalTokens(rawIpa).length;
  }

  function betonteSilbeIndex(rawIpa) {
    if (!rawIpa) return -1;
    var idx = rawIpa.indexOf("ˈ");
    if (idx < 0) return -1;
    // Anzahl silbischer Vokale VOR der Markierung = Index der betonten Silbe
    return silbenzahlIpa(rawIpa.slice(0, idx));
  }

  // --- Hauptfunktion --------------------------------------------------------

  function orthoToIpa(input, zielIpa) {
    if (input == null) return "";
    // Schritt 1
    if (isAlreadyIpa(input)) return String(input).trim();

    var s = String(input).toLowerCase().trim();
    if (!s) return "";

    // Schritt 8 (vorgezogen): unbetonte Endsilben -er -> ɐ, -e -> ə
    var suffix = null;
    if (s.length > 2 && /er$/.test(s)) {
      suffix = "ɐ"; s = s.slice(0, -2);
    } else if (s.length > 1 && /e$/.test(s) && /[aeiouäöü]/.test(s.slice(0, -1))) {
      // nur reduzieren, wenn das Wort noch einen anderen Vokal hat (mehrsilbig)
      suffix = "ə"; s = s.slice(0, -1);
    }

    var segs = [];
    function letztesSeg() { return segs[segs.length - 1]; }
    function letzterVokal() {
      for (var j = segs.length - 1; j >= 0; j--) if (segs[j].t === "V") return segs[j];
      return null;
    }
    function markiereKurz() { var v = letzterVokal(); if (v) { v.kurz = true; v.dehnH = false; } }
    function markiereDehnH() { var v = letzterVokal(); if (v) v.dehnH = true; }
    function machV(src, longHint) {
      return { t: "V", src: src, ipa: null, lang: longHint, kurz: false, dehnH: false, dipth: false, schwa: false };
    }
    function machDiph(ipa, src) {
      return { t: "V", src: src || "diph", ipa: ipa, lang: true, kurz: false, dehnH: false, dipth: true, schwa: false };
    }

    var i = 0, N = s.length;
    while (i < N) {
      var c = s[i];
      var four = s.substr(i, 4), three = s.substr(i, 3), two = s.substr(i, 2);

      // Schritt 2: Tri-/Tetragraphe
      if (four === "tsch") { segs.push({ t: "C", ipa: "tʃ" }); i += 4; continue; }
      if (three === "sch") { segs.push({ t: "C", ipa: "ʃ" }); i += 3; continue; }

      // Schritt 3: Digraphe
      if (two === "ch") {
        // ch nach Hintervokal (a,o,u,au) -> x ; sonst (i,e,ä,ö,ü,ei,eu,äu) und
        // am Wortanfang -> ç.  // TBD verifizieren: Kontext vereinfacht.
        var pv = letzterVokal();
        segs.push({ t: "C", ipa: istHinterVokal(pv) ? "x" : "ç" });
        i += 2; continue;
      }
      if (two === "ng") { segs.push({ t: "C", ipa: "ŋ" }); i += 2; continue; }
      if (two === "pf") { segs.push({ t: "C", ipa: "pf" }); i += 2; continue; }
      if (two === "tz") { markiereKurz(); segs.push({ t: "C", ipa: "ts" }); i += 2; continue; }
      if (two === "ts") { segs.push({ t: "C", ipa: "ts" }); i += 2; continue; }
      if (two === "qu") { segs.push({ t: "C", ipa: "k" }, { t: "C", ipa: "v" }); i += 2; continue; }
      if (two === "ck") { markiereKurz(); segs.push({ t: "C", ipa: "k" }); i += 2; continue; }
      if (two === "ie") { segs.push(machV("i", true)); i += 2; continue; } // ie -> iː

      // Schritt 4: Diphthonge
      if (two === "ei" || two === "ai") { segs.push(machDiph("aɪ")); i += 2; continue; }
      if (two === "au") { segs.push(machDiph("aʊ", "au")); i += 2; continue; }
      if (two === "eu" || two === "äu") { segs.push(machDiph("ɔʏ")); i += 2; continue; }
      // TBD verifizieren: Spec nennt ɔy; App-Standard und Tokenizer nutzen ɔʏ.

      // Schritt 5: Einzelvokale (Länge folgt in Schritt 7)
      if (istVokalBuchstabe(c)) { segs.push(machV(c, undefined)); i += 1; continue; }

      // Schritt 6: Doppelkonsonant -> Vokal davor kurz, danach ein Konsonant
      var doppelt = (c === s[i + 1] && !istVokalBuchstabe(c));
      if (doppelt) markiereKurz();

      switch (c) {
        case "s": {
          // s am Wortanfang vor Vokal oder intervokalisch -> z, sonst s
          var nx = s[i + 1];
          var stimmhaft = istVokalBuchstabe(nx) && (segs.length === 0 || (letztesSeg() && letztesSeg().t === "V"));
          segs.push({ t: "C", ipa: stimmhaft ? "z" : "s" });
          break;
          // TBD verifizieren: initiales st/sp -> ʃt/ʃp ist bewusst NICHT umgesetzt
          // (nicht in der Regelliste); ggf. im Korrektur-Popup ergänzen.
        }
        case "ß": segs.push({ t: "C", ipa: "s" }); break;
        case "v": segs.push({ t: "C", ipa: "f" }); break; // TBD: Lehnwörter (Vase) wären [v]
        case "w": segs.push({ t: "C", ipa: "v" }); break;
        case "z": segs.push({ t: "C", ipa: "ts" }); break;
        case "j": segs.push({ t: "C", ipa: "j" }); break;
        case "h": {
          // h nach Vokal = stummes Dehnungs-h (längt), sonst gesprochenes [h]
          if (letztesSeg() && letztesSeg().t === "V") markiereDehnH();
          else segs.push({ t: "C", ipa: "h" });
          break;
        }
        case "r": {
          // r im Onset (Wortanfang / vor Vokal) -> ʁ; postvokalische Coda -> ɐ̯
          var nx2 = s[i + 1];
          if (segs.length === 0 || istVokalBuchstabe(nx2)) segs.push({ t: "C", ipa: "ʁ" });
          else if (letztesSeg() && letztesSeg().t === "V") segs.push({ t: "C", ipa: "ɐ̯" });
          else segs.push({ t: "C", ipa: "ʁ" });
          break;
        }
        case "x": segs.push({ t: "C", ipa: "k" }, { t: "C", ipa: "s" }); break; // TBD: x -> ks
        case "y": segs.push(machV("ü", undefined)); break; // TBD: y selten, wie ü behandelt
        case "c": segs.push({ t: "C", ipa: "k" }); break;  // TBD: einzelnes c -> k
        case "b": case "d": case "f": case "g": case "k":
        case "l": case "m": case "n": case "p": case "t":
          segs.push({ t: "C", ipa: c }); break;
        default: break; // unbekanntes Zeichen ignorieren
      }

      i += doppelt ? 2 : 1;
    }

    if (suffix) segs.push({ t: "V", src: "e", ipa: suffix, schwa: true, dipth: false });

    // --- Schritt 7: Vokallängen ---------------------------------------------
    var nuklei = segs.filter(function (x) { return x.t === "V"; });
    var zVokale = silbischeVokalTokens(zielIpa);
    var ausZiel = zielIpa && zVokale.length === nuklei.length && zVokale.length > 0;

    nuklei.forEach(function (v, idx) {
      if (v.dipth) return;                 // Diphthong: immer lang
      if (v.schwa) { v.ipa = v.ipa || "ə"; return; }
      if (ausZiel) {
        var zt = zVokale[idx];
        var zb = zt.replace(/[ːˑ]/g, "");
        // Unbetonte Reduktion aus der Ziel-IPA übernehmen, da die Orthografie
        // sie nicht zeigt.  // TBD verifizieren: übernimmt ə/ɐ aus Ziel.
        if (zb === "ə") { v.ipa = "ə"; v.schwa = true; return; }
        if (zb === "ɐ") { v.ipa = "ɐ"; v.schwa = true; return; }
        v.ipa = /ː/.test(zt) ? LANG[v.src] : KURZ[v.src];
        return;
      }
      // Default-Heuristik ohne (passende) Ziel-IPA:
      if (v.kurz) { v.ipa = KURZ[v.src]; return; }
      if (v.dehnH || v.lang === true) { v.ipa = LANG[v.src]; return; }
      // offene/einfach geschlossene Silbe -> lang; Cluster danach -> kurz
      var coda = codaAnzahl(segs, v);
      v.ipa = (coda <= 1) ? LANG[v.src] : KURZ[v.src]; // TBD verifizieren: Längen-Default
    });

    // --- Schritt 9: Betonung ------------------------------------------------
    var stressIdx;
    if (nuklei.length <= 1) stressIdx = 0;
    else {
      var bi = betonteSilbeIndex(zielIpa);
      stressIdx = (bi >= 0 && bi < nuklei.length) ? bi : 0; // Default: erste Silbe
    }
    var stressSeg = nuklei[stressIdx];
    var stressPos = segs.indexOf(stressSeg);
    var onsetStart = stressPos;
    while (onsetStart - 1 >= 0 && segs[onsetStart - 1].t === "C") onsetStart--;

    // --- Schritt 10: Zusammenbau + Cleanup ----------------------------------
    var out = "";
    segs.forEach(function (seg, idx) {
      if (idx === onsetStart) out += "ˈ";
      out += seg.ipa || "";
    });
    out = out.replace(/ːː+/g, "ː").replace(/\s+/g, "").trim();
    return out;
  }

  function codaAnzahl(segs, v) {
    var k = segs.indexOf(v), n = 0;
    for (var j = k + 1; j < segs.length; j++) {
      if (segs[j].t === "V") break;
      n++;
    }
    return n;
  }

  global.LT_Ortho = { orthoToIpa: orthoToIpa, isAlreadyIpa: isAlreadyIpa };
})(window);
