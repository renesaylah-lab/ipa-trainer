/* spaced-repetition.js
 * Vereinfachtes SM-2. Falsch beantwortete Wörter kehren nach 1, 3, 7 Tagen
 * wieder; danach gelten sie als gelernt. Neue Wörter werden dazugemischt.
 *
 * Pro Wort (im LocalStorage über storage.js):
 *   { last_seen, correct_count, wrong_count, next_due, stufe }
 * 'stufe' ist der Index in INTERVALLE für die Wiedervorlage nach einem Fehler.
 */
(function (global) {
  "use strict";

  var INTERVALLE_TAGE = [1, 3, 7]; // Wiedervorlage-Abstände nach einem Fehler
  var GELERNT_TAGE = 30;           // Abstand, wenn ein Wort als gelernt gilt
  var TAG_MS = 24 * 60 * 60 * 1000;

  function jetzt() { return Date.now(); }
  function inTagen(t) { return new Date(jetzt() + t * TAG_MS).toISOString(); }

  function leererFortschritt() {
    return {
      last_seen: null,
      correct_count: 0,
      wrong_count: 0,
      next_due: null,
      stufe: 0
    };
  }

  /* Aktualisiert den Fortschritt eines Wortes nach einer Antwort. */
  function update(wordId, korrekt) {
    var p = global.LT_Storage.getWordProgress(wordId) || leererFortschritt();
    p.last_seen = new Date(jetzt()).toISOString();

    if (korrekt) {
      p.correct_count += 1;
      if (p.stufe < INTERVALLE_TAGE.length) {
        // Wort war in der Fehler-Wiedervorlage: eine Stufe weiter
        p.stufe += 1;
        if (p.stufe >= INTERVALLE_TAGE.length) {
          p.next_due = inTagen(GELERNT_TAGE); // gelernt
        } else {
          p.next_due = inTagen(INTERVALLE_TAGE[p.stufe]);
        }
      } else {
        p.next_due = inTagen(GELERNT_TAGE);
      }
    } else {
      p.wrong_count += 1;
      p.stufe = 0; // zurück auf Anfang der Fehler-Wiedervorlage
      p.next_due = inTagen(INTERVALLE_TAGE[0]); // morgen wieder
    }

    global.LT_Storage.setWordProgress(wordId, p);
    return p;
  }

  function istFaellig(p) {
    return p && p.next_due && new Date(p.next_due).getTime() <= jetzt();
  }

  /* Stellt den nächsten Batch zusammen.
   * Priorität: 1) fällige (zuvor falsche) Wörter  2) neue Wörter  3) Auffüllen.
   */
  function buildBatch(alleWoerter, groesse) {
    groesse = groesse || 10;
    var progress = global.LT_Storage.getProgress();

    var faellig = [];
    var neu = [];
    var rest = [];

    alleWoerter.forEach(function (w) {
      var p = progress[w.id];
      if (!p) {
        neu.push(w);
      } else if (istFaellig(p)) {
        faellig.push({ wort: w, p: p });
      } else {
        rest.push({ wort: w, p: p });
      }
    });

    // fällige: meiste Fehler und älteste Fälligkeit zuerst
    faellig.sort(function (a, b) {
      return (b.p.wrong_count - a.p.wrong_count) ||
        (new Date(a.p.next_due) - new Date(b.p.next_due));
    });

    shuffle(neu);
    // rest: am längsten nicht gesehen zuerst (für Auffüllung)
    rest.sort(function (a, b) {
      return new Date(a.p.last_seen || 0) - new Date(b.p.last_seen || 0);
    });

    var batch = [];
    // ~60% fällige, Rest neu – aber flexibel auffüllen
    var maxFaellig = Math.min(faellig.length, Math.ceil(groesse * 0.6));
    for (var i = 0; i < maxFaellig; i++) batch.push(faellig[i].wort);
    for (var j = 0; batch.length < groesse && j < neu.length; j++) batch.push(neu[j]);
    // falls noch nicht voll: weitere fällige
    for (var k = maxFaellig; batch.length < groesse && k < faellig.length; k++) batch.push(faellig[k].wort);
    // immer noch nicht voll: ältesten Rest auffüllen
    for (var m = 0; batch.length < groesse && m < rest.length; m++) batch.push(rest[m].wort);

    shuffle(batch);
    return batch;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  global.LT_SpacedRepetition = {
    INTERVALLE_TAGE: INTERVALLE_TAGE,
    update: update,
    buildBatch: buildBatch,
    istFaellig: istFaellig
  };
})(window);
