/* storage.js
 * LocalStorage-Wrapper für den Logopädie-Trainer.
 * Alles wird unter wenigen Schlüsseln abgelegt; Export/Import sichert den
 * gesamten Zustand als eine JSON-Datei (Schutz gegen Browser-Cache-Verlust).
 */
(function (global) {
  "use strict";

  var KEYS = {
    progress: "lt_words_progress", // pro Wort: Spaced-Repetition-Daten
    stats: "lt_stats",             // Gesamtstatistik / schwächste Laute
    dodd: "lt_dodd_history",       // Verlauf der letzten ~20 Dodd-Analysen
    settings: "lt_settings",       // ggf. Einstellungen
    userWords: "words_user_added", // eigene Wörter der Nutzerin (Override für words.json)
    overrides: "words_standard_overrides", // bearbeitete Standard-Einträge (pro Original-Wort)
    hidden: "words_hidden"         // verborgene Standard-Wörter (Sperr-Liste)
  };

  var DODD_HISTORY_MAX = 20;

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("Storage-Lesefehler für", key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("Storage-Schreibfehler für", key, e);
      return false;
    }
  }

  // --- Wort-Fortschritt (Spaced Repetition) ---------------------------------

  function getProgress() {
    return read(KEYS.progress, {});
  }

  function getWordProgress(wordId) {
    var all = getProgress();
    return all[wordId] || null;
  }

  function setWordProgress(wordId, entry) {
    var all = getProgress();
    all[wordId] = entry;
    write(KEYS.progress, all);
  }

  // --- Gesamtstatistik ------------------------------------------------------

  function getStats() {
    return read(KEYS.stats, {
      total_correct: 0,
      total_wrong: 0,
      // pro Laut/Phonem: { korrekt, falsch } – für "schwächste Laute"
      per_phoneme: {}
    });
  }

  function saveStats(stats) {
    write(KEYS.stats, stats);
  }

  /* Registriert ein Ergebnis und aktualisiert die Phonem-Statistik.
   * fehlerPhoneme: Array von Ziel-Phonemen, die in diesem Wort falsch waren. */
  function recordResult(correct, zielPhoneme, fehlerPhoneme) {
    var stats = getStats();
    if (correct) {
      stats.total_correct += 1;
    } else {
      stats.total_wrong += 1;
    }
    (zielPhoneme || []).forEach(function (p) {
      if (!stats.per_phoneme[p]) stats.per_phoneme[p] = { korrekt: 0, falsch: 0 };
    });
    (fehlerPhoneme || []).forEach(function (p) {
      if (!stats.per_phoneme[p]) stats.per_phoneme[p] = { korrekt: 0, falsch: 0 };
      stats.per_phoneme[p].falsch += 1;
    });
    // korrekt gezählte Phoneme = Ziel minus Fehler
    (zielPhoneme || []).forEach(function (p) {
      if (fehlerPhoneme.indexOf(p) === -1) stats.per_phoneme[p].korrekt += 1;
    });
    saveStats(stats);
  }

  /* Liefert die schwächsten Laute (höchste Fehlerquote, min. 2 Versuche). */
  function getWeakestPhonemes(limit) {
    var stats = getStats();
    var rows = Object.keys(stats.per_phoneme).map(function (p) {
      var e = stats.per_phoneme[p];
      var gesamt = e.korrekt + e.falsch;
      return { phonem: p, gesamt: gesamt, falsch: e.falsch, quote: gesamt ? e.falsch / gesamt : 0 };
    }).filter(function (r) { return r.gesamt >= 2 && r.falsch > 0; });
    rows.sort(function (a, b) { return b.quote - a.quote || b.falsch - a.falsch; });
    return rows.slice(0, limit || 8);
  }

  // --- Eigene Wörter (Override für die ausgelieferte words.json) -------------
  // Werden in einem separaten Schlüssel gehalten und beim Laden mit der
  // Standard-Wortliste zusammengeführt. So überleben sie App-Updates und
  // kollidieren nicht mit künftigen Korrekturen der Standardliste.

  function getUserWords() {
    var list = read(KEYS.userWords, []);
    return Array.isArray(list) ? list : [];
  }

  function addUserWord(entry) {
    if (!entry || !entry.wort || !entry.ipa) return false;
    var list = getUserWords();
    var norm = String(entry.wort).trim().toLowerCase();
    var existiert = list.some(function (w) { return String(w.wort).trim().toLowerCase() === norm; });
    if (existiert) return false;
    list.push({ wort: entry.wort.trim(), ipa: entry.ipa.trim(), source: entry.source || "Eigene Eingabe" });
    write(KEYS.userWords, list);
    return true;
  }

  function lc(w) { return String((w && w.wort) || w || "").trim().toLowerCase(); }

  /* Aktualisiert einen eigenen Eintrag (gefunden über das Original-Wort). */
  function updateUserWord(originalWort, entry) {
    if (!entry || !entry.wort || !entry.ipa) return false;
    var list = getUserWords();
    var ziel = String(originalWort).trim().toLowerCase();
    var gefunden = false;
    list = list.map(function (w) {
      if (lc(w) === ziel) { gefunden = true; return { wort: entry.wort.trim(), ipa: entry.ipa.trim(), source: w.source || "Eigene Eingabe" }; }
      return w;
    });
    if (!gefunden) return false;
    write(KEYS.userWords, list);
    return true;
  }

  /* Entfernt einen eigenen Eintrag endgültig. */
  function removeUserWord(wort) {
    var ziel = String(wort).trim().toLowerCase();
    var list = getUserWords().filter(function (w) { return lc(w) !== ziel; });
    write(KEYS.userWords, list);
    return true;
  }

  // --- Standard-Overrides (bearbeitete Standard-Einträge) -------------------

  function getOverrides() {
    var o = read(KEYS.overrides, {});
    return (o && typeof o === "object") ? o : {};
  }
  /* Override für einen Standard-Eintrag setzen (Schlüssel = Original-Wort). */
  function setOverride(originalWort, entry) {
    if (!entry || !entry.wort || !entry.ipa) return false;
    var o = getOverrides();
    o[originalWort] = { wort: entry.wort.trim(), ipa: entry.ipa.trim(), source: "Standard (geändert)" };
    write(KEYS.overrides, o);
    return true;
  }
  function removeOverride(originalWort) {
    var o = getOverrides();
    if (originalWort in o) { delete o[originalWort]; write(KEYS.overrides, o); }
    return true;
  }

  // --- Verborgene Standard-Wörter (Sperr-Liste, NICHT echtes Löschen) -------

  function getHidden() {
    var list = read(KEYS.hidden, []);
    return Array.isArray(list) ? list : [];
  }
  function isHidden(wort) {
    var ziel = String(wort).trim().toLowerCase();
    return getHidden().some(function (w) { return String(w).trim().toLowerCase() === ziel; });
  }
  function hideWord(wort) {
    if (isHidden(wort)) return true;
    var list = getHidden(); list.push(String(wort).trim());
    write(KEYS.hidden, list);
    return true;
  }
  function unhideWord(wort) {
    var ziel = String(wort).trim().toLowerCase();
    write(KEYS.hidden, getHidden().filter(function (w) { return String(w).trim().toLowerCase() !== ziel; }));
    return true;
  }

  /* Gemergter Pool für ALLE Tabs (Trainer, Dodd-Autovervollständigung):
   *   1) Start mit der Standard-Wortliste (words.json)
   *   2) verborgene Standard-Wörter herausfiltern
   *   3) bearbeitete Standard-Einträge durch ihren Override ersetzen
   *   4) eigene Wörter anhängen (Dublette: eigener Eintrag gewinnt)
   * Reihenfolge der Standardliste bleibt erhalten. */
  function mergeWithUserWords(standardList) {
    var standard = Array.isArray(standardList) ? standardList : [];
    var overrides = getOverrides();
    var eigene = getUserWords();

    var merged = standard
      .filter(function (w) { return !isHidden(w.wort); })
      .map(function (w) { return overrides[w.wort] ? overrides[w.wort] : w; });

    var vorhanden = {};
    merged.forEach(function (w) { vorhanden[lc(w)] = true; });
    eigene.forEach(function (w) {
      if (vorhanden[lc(w)]) {
        // Dublette: eigenen Eintrag bevorzugen (überschreibt)
        merged = merged.map(function (m) { return lc(m) === lc(w) ? w : m; });
      } else {
        merged.push(w);
      }
    });

    return merged;
  }

  // --- Dodd-Analyse-Verlauf -------------------------------------------------

  function getDoddHistory() {
    return read(KEYS.dodd, []);
  }

  function addDoddAnalysis(entry) {
    var hist = getDoddHistory();
    hist.unshift(entry);
    if (hist.length > DODD_HISTORY_MAX) hist = hist.slice(0, DODD_HISTORY_MAX);
    write(KEYS.dodd, hist);
  }

  // --- Export / Import ------------------------------------------------------

  function exportAll() {
    return {
      _format: "logopaedie-trainer-backup",
      _version: 1,
      _exported: new Date().toISOString(),
      progress: getProgress(),
      stats: getStats(),
      dodd: getDoddHistory(),
      settings: read(KEYS.settings, {}),
      userWords: getUserWords(),
      overrides: getOverrides(),
      hidden: getHidden()
    };
  }

  function downloadExport() {
    var data = exportAll();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "logopaedie-trainer-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* Importiert ein zuvor exportiertes Backup. Überschreibt den LocalStorage.
   * Gibt true zurück bei Erfolg, sonst wirft es einen Fehler mit Meldung. */
  function importAll(obj) {
    if (!obj || obj._format !== "logopaedie-trainer-backup") {
      throw new Error("Datei ist kein gültiges Trainer-Backup.");
    }
    write(KEYS.progress, obj.progress || {});
    write(KEYS.stats, obj.stats || getStats());
    write(KEYS.dodd, obj.dodd || []);
    write(KEYS.settings, obj.settings || {});
    write(KEYS.userWords, obj.userWords || []);
    write(KEYS.overrides, obj.overrides || {});
    write(KEYS.hidden, obj.hidden || []);
    return true;
  }

  function clearAll() {
    Object.keys(KEYS).forEach(function (k) {
      global.localStorage.removeItem(KEYS[k]);
    });
  }

  global.LT_Storage = {
    KEYS: KEYS,
    getProgress: getProgress,
    getWordProgress: getWordProgress,
    setWordProgress: setWordProgress,
    getStats: getStats,
    saveStats: saveStats,
    recordResult: recordResult,
    getWeakestPhonemes: getWeakestPhonemes,
    getUserWords: getUserWords,
    addUserWord: addUserWord,
    updateUserWord: updateUserWord,
    removeUserWord: removeUserWord,
    getOverrides: getOverrides,
    setOverride: setOverride,
    removeOverride: removeOverride,
    getHidden: getHidden,
    isHidden: isHidden,
    hideWord: hideWord,
    unhideWord: unhideWord,
    mergeWithUserWords: mergeWithUserWords,
    getDoddHistory: getDoddHistory,
    addDoddAnalysis: addDoddAnalysis,
    exportAll: exportAll,
    downloadExport: downloadExport,
    importAll: importAll,
    clearAll: clearAll
  };
})(window);
