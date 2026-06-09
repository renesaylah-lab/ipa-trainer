/* ipa-trainer.js
 * Modi 1 (Wort -> IPA) und 2 (IPA -> Wort).
 * Batch von 10 Wörtern, KEINE sofortige Lösung, Auswertung erst am Ende.
 * Spaced Repetition über LT_SpacedRepetition, Statistik über LT_Storage.
 */
(function (global) {
  "use strict";

  var BATCH = 10;

  // Normalisiert eine IPA-Eingabe für den Vergleich (Tokenizer entfernt
  // Betonung, Klammern, Leerzeichen und normalisiert Affrikaten/Diakritika).
  function normIPA(s) {
    return global.LT_IPA.tokenize(s).join("");
  }

  function normWort(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function ipaKorrekt(eingabe, word) {
    var ziel = [word.ipa].concat(word.ipa_varianten || []).map(normIPA);
    return ziel.indexOf(normIPA(eingabe)) !== -1;
  }

  function wortKorrekt(eingabe, word) {
    return normWort(eingabe) === normWort(word.wort);
  }

  // Liefert Ziel-Phoneme und die fehlerhaften Phoneme (für Statistik/Erklärung)
  function phonemDiff(eingabe, word) {
    var ziel = global.LT_IPA.tokenize(word.ipa);
    var kind = global.LT_IPA.tokenize(eingabe);
    var ops = global.LT_IPA.align(ziel, kind);
    var zielBasen = ziel.map(global.LT_IPA.base);
    var fehler = [];
    ops.forEach(function (o) {
      if (o.op === "sub" || o.op === "del") fehler.push(global.LT_IPA.base(o.ziel));
    });
    return { ziel: zielBasen, fehler: fehler, ops: ops };
  }

  function State(mode, container, words) {
    this.mode = mode; // "wort2ipa" | "ipa2wort"
    this.container = container;
    this.words = words;
    this.batch = [];
    this.index = 0;
    this.answers = [];
    this.streak = 0;            // fortlaufende Serie korrekter Antworten (über Batches hinweg)
    this.batchRichtig = 0;      // richtige Antworten im laufenden Batch
    this.batchBeantwortet = 0;  // bereits bewertete Wörter im laufenden Batch
    this.letztesKorrekt = null; // Ergebnis des zuletzt bewerteten Wortes (für Mini-Feedback)
  }

  State.prototype.start = function () {
    this.batch = global.LT_SpacedRepetition.buildBatch(this.words, BATCH);
    this.index = 0;
    this.answers = [];
    // Batch-Quote zurücksetzen; die Serie läuft bewusst über Batches weiter.
    this.batchRichtig = 0;
    this.batchBeantwortet = 0;
    this.letztesKorrekt = null;
    this.renderFrage();
  };

  State.prototype.renderFrage = function () {
    var self = this;
    var w = this.batch[this.index];
    var c = this.container;
    c.innerHTML = "";

    var fortschritt = el("div", "trainer-progress",
      "Wort " + (this.index + 1) + " / " + this.batch.length);
    c.appendChild(fortschritt);

    var prompt = el("div", "trainer-prompt");
    prompt.textContent = this.mode === "wort2ipa" ? w.wort : "[" + w.ipa + "]";
    if (this.mode === "ipa2wort") prompt.classList.add("ipa-text");
    c.appendChild(prompt);

    var label = el("div", "trainer-label",
      this.mode === "wort2ipa" ? "IPA-Transkription eingeben:" : "Deutsches Wort eingeben:");
    c.appendChild(label);

    var input = document.createElement("input");
    input.type = "text";
    input.className = "trainer-input" + (this.mode === "wort2ipa" ? " ipa-input ipa-text" : "");
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.value = this.answers[this.index] != null ? this.answers[this.index] : "";
    c.appendChild(input);

    if (this.mode === "wort2ipa") {
      global.LT_Keyboard.attach(input);
      global.LT_Keyboard.setTarget(input);
    }

    var btn = el("button", "btn btn-primary",
      this.index === this.batch.length - 1 ? "Batch auswerten" : "Weiter");
    c.appendChild(btn);

    var hinweis = el("div", "trainer-hint", "Keine sofortige Lösung – Auswertung nach dem 10. Wort.");
    c.appendChild(hinweis);

    // Mini-Feedback (richtig/falsch des letzten Wortes, Serie, Batch-Quote) –
    // bewusst OHNE Lösung; die kommt gebündelt in der Auswertung.
    c.appendChild(self.renderFeedback());

    function submit() {
      self.answers[self.index] = input.value;
      self.bewerteWort(w, input.value);
      if (self.index < self.batch.length - 1) {
        self.index += 1;
        self.renderFrage();
      } else {
        self.renderAuswertung();
      }
    }

    btn.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });

    if (this.mode === "ipa2wort") input.focus();
  };

  // Mini-Feedback-Leiste unter dem Eingabefeld: Ergebnis des zuletzt bewerteten
  // Wortes (richtig/falsch, OHNE Lösung), laufende Serie und Trefferquote des
  // aktuellen Batches als Balken. Vor dem ersten beantworteten Wort nur die Serie.
  State.prototype.renderFeedback = function () {
    var fb = el("div", "trainer-feedback");
    if (this.letztesKorrekt != null) {
      fb.appendChild(el("span",
        "tf-result " + (this.letztesKorrekt ? "status-ok" : "status-bad"),
        this.letztesKorrekt ? "Letztes Wort: richtig" : "Letztes Wort: falsch"));
    }
    fb.appendChild(el("span", "tf-streak", "Serie: " + this.streak));
    if (this.batchBeantwortet > 0) {
      var bar = el("span", "tf-bar");
      var fill = document.createElement("span");
      fill.style.width = Math.round(this.batchRichtig / this.batchBeantwortet * 100) + "%";
      bar.appendChild(fill);
      fb.appendChild(bar);
      fb.appendChild(el("span", "tf-count",
        this.batchRichtig + " / " + this.batchBeantwortet + " richtig"));
    }
    return fb;
  };

  // Bewertet ein einzelnes Wort und aktualisiert SR + Statistik (Feedback
  // wird aber erst in der Auswertung gezeigt).
  State.prototype.bewerteWort = function (w, eingabe) {
    var korrekt;
    var ziel = [], fehler = [];
    if (this.mode === "wort2ipa") {
      korrekt = ipaKorrekt(eingabe, w);
      var d = phonemDiff(eingabe, w);
      ziel = d.ziel;
      fehler = korrekt ? [] : d.fehler;
    } else {
      korrekt = wortKorrekt(eingabe, w);
    }
    global.LT_SpacedRepetition.update(w.id, korrekt);
    global.LT_Storage.recordResult(korrekt, ziel, fehler);
    // Mini-Feedback aktualisieren: Serie läuft über Batches, Quote gilt im Batch.
    this.batchBeantwortet += 1;
    if (korrekt) { this.streak += 1; this.batchRichtig += 1; } else { this.streak = 0; }
    this.letztesKorrekt = korrekt;
    // Ergebnis für die Auswertungstabelle merken
    this._ergebnisse = this._ergebnisse || {};
    this._ergebnisse[this.index] = { korrekt: korrekt };
  };

  State.prototype.renderAuswertung = function () {
    var self = this;
    var c = this.container;
    c.innerHTML = "";
    c.appendChild(el("h3", null, "Auswertung"));

    var richtig = 0;
    var table = document.createElement("table");
    table.className = "result-table";
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>" + (this.mode === "wort2ipa" ? "Wort" : "IPA") +
      "</th><th>Ihre Antwort</th><th>Korrekte Antwort</th><th>Ergebnis</th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");

    this.batch.forEach(function (w, i) {
      var antwort = self.answers[i] || "";
      var korrekt = self.mode === "wort2ipa" ? ipaKorrekt(antwort, w) : wortKorrekt(antwort, w);
      if (korrekt) richtig += 1;

      var prompt = self.mode === "wort2ipa" ? w.wort : "[" + w.ipa + "]";
      var loesung = self.mode === "wort2ipa"
        ? "[" + w.ipa + "]" + ((w.ipa_varianten && w.ipa_varianten.length) ? " (auch: " + w.ipa_varianten.map(function (v) { return "[" + v + "]"; }).join(", ") + ")" : "")
        : w.wort;

      var tr = document.createElement("tr");
      tr.className = korrekt ? "row-ok" : "row-bad";
      tr.appendChild(td(prompt, self.mode === "ipa2wort" ? "ipa-text" : null));
      tr.appendChild(td(antwort || "—", self.mode === "wort2ipa" ? "ipa-text" : null));
      tr.appendChild(td(loesung, self.mode === "wort2ipa" ? "ipa-text" : null));
      tr.appendChild(td(korrekt ? "✓" : "✗", korrekt ? "mark-ok" : "mark-bad"));
      tbody.appendChild(tr);

      // Erklärungszeile bei Fehler
      if (!korrekt) {
        var erk = erklaerung(self.mode, antwort, w);
        if (erk) {
          var tr2 = document.createElement("tr");
          tr2.className = "row-explain";
          var cell = document.createElement("td");
          cell.colSpan = 4;
          cell.className = "explain";
          cell.textContent = "Hinweis: " + erk;
          tr2.appendChild(cell);
          tbody.appendChild(tr2);
        }
      }
    });

    table.appendChild(tbody);

    var score = el("div", "trainer-score",
      richtig + " / " + this.batch.length + " korrekt (" +
      Math.round(richtig / this.batch.length * 100) + "%)");
    c.appendChild(score);
    c.appendChild(table);

    var btn = el("button", "btn btn-primary", "Nächster Batch (10 Wörter)");
    btn.addEventListener("click", function () { self.start(); });
    c.appendChild(btn);

    var weak = global.LT_Storage.getWeakestPhonemes(6);
    if (weak.length) {
      var box = el("div", "weak-box");
      box.appendChild(el("strong", null, "Schwächste Laute bisher: "));
      box.appendChild(document.createTextNode(
        weak.map(function (r) { return "[" + r.phonem + "] " + Math.round(r.quote * 100) + "%"; }).join("  ·  ")
      ));
      c.appendChild(box);
    }
  };

  function erklaerung(mode, antwort, w) {
    if (mode === "wort2ipa") {
      if (w.hinweis) return w.hinweis;
      var d = phonemDiff(antwort, w);
      var fehlerOps = d.ops.filter(function (o) { return o.op !== "match"; });
      if (fehlerOps.length) {
        var o = fehlerOps[0];
        if (o.op === "sub") return "[" + global.LT_IPA.base(o.ziel) + "] erwartet, nicht [" + global.LT_IPA.base(o.kind) + "].";
        if (o.op === "del") return "[" + global.LT_IPA.base(o.ziel) + "] fehlt in der Eingabe.";
        if (o.op === "ins") return "[" + global.LT_IPA.base(o.kind) + "] ist zu viel.";
      }
      return "Korrekte Transkription: [" + w.ipa + "].";
    }
    return "Gesuchtes Wort: " + w.wort + ".";
  }

  // --- kleine DOM-Helfer ----------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function td(text, cls) {
    var c = document.createElement("td");
    if (cls) c.className = cls;
    c.textContent = text;
    return c;
  }

  var instanzen = {};

  global.LT_Trainer = {
    init: function (mode, container, words) {
      instanzen[mode] = new State(mode, container, words);
      return instanzen[mode];
    },
    start: function (mode) {
      if (instanzen[mode]) instanzen[mode].start();
    }
  };
})(window);
