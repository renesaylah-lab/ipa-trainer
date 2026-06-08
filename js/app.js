/* app.js
 * Tab-Routing, Daten laden, IPA-Tastatur initialisieren, Dodd-Analyse-UI,
 * Export/Import. Hält den App-State zusammen.
 */
(function (global) {
  "use strict";

  // words      : aktiver Pool (Standard + eigene Wörter), wird IN PLACE gepflegt
  // standardWords : nur die ausgelieferte words.json (für "Alle 25 laden")
  var DATA = { words: [], standardWords: [], processes: null, examples: null };

  // --- Daten laden ----------------------------------------------------------

  function ladeDaten() {
    return Promise.all([
      fetch("data/words.json").then(function (r) { return r.json(); }),
      fetch("data/processes.json").then(function (r) { return r.json(); }),
      fetch("data/dodd-examples.json").then(function (r) { return r.json(); })
    ]).then(function (res) {
      // words.json ist ein flaches Array { wort, ipa, source } (single source of truth).
      var roh = Array.isArray(res[0]) ? res[0] : (res[0].woerter || []);
      DATA.standardWords = roh.map(normalizeWord);
      DATA.processes = res[1];
      DATA.examples = res[2];
      aktualisiereWortpool();
      pruefeKonsistenz();
    });
  }

  // Vereinheitlicht einen Wort-Eintrag (ergänzt id für die Spaced-Repetition).
  function normalizeWord(w) {
    return {
      id: w.id || w.wort,
      wort: w.wort,
      ipa: w.ipa,
      ipa_varianten: w.ipa_varianten || [],
      source: w.source || w.quelle || "TBD"
    };
  }

  // Standard-Wörter (Datei) + eigene Wörter (LocalStorage) zum aktiven Pool
  // zusammenführen. DATA.words wird IN PLACE aktualisiert, damit bestehende
  // Referenzen (z. B. im Trainer) den neuen Stand sehen.
  function aktualisiereWortpool() {
    var eigene = LT_Storage.getUserWords().map(normalizeWord);
    DATA.words.length = 0;
    DATA.standardWords.concat(eigene).forEach(function (w) { DATA.words.push(w); });
  }

  function findIpaForWord(wort, liste) {
    var n = String(wort || "").trim().toLowerCase();
    if (!n) return null;
    var m = liste.filter(function (w) { return w.wort.toLowerCase() === n; })[0];
    return m ? m.ipa : null;
  }

  function wortImPool(wort) {
    var n = String(wort || "").trim().toLowerCase();
    return DATA.words.some(function (w) { return w.wort.toLowerCase() === n; });
  }

  // Konsistenz-Check beim Start: Beispiel-Sets müssen so lang sein wie die
  // Standard-Wortliste (gleiche Reihenfolge). Sonst Warnung in der Konsole.
  function pruefeKonsistenz() {
    var n = DATA.standardWords.length;
    ((DATA.examples && DATA.examples.sets) || []).forEach(function (set) {
      var kp = set.kind_produktionen || [];
      if (kp.length !== n) {
        console.warn("[Konsistenz] Beispiel-Set \"" + set.id + "\" hat " + kp.length +
          " Einträge, words.json hat " + n + ". Länge/Reihenfolge müssen übereinstimmen.");
      }
    });
  }

  function zeigeLadefehler() {
    var main = document.querySelector("main");
    main.innerHTML =
      '<div class="error-box">' +
      '<h2>Daten konnten nicht geladen werden</h2>' +
      '<p>Die App lädt die JSON-Dateien aus <code>data/</code> (u. a. <code>words.json</code>, <code>processes.json</code>, <code>dodd-examples.json</code>) per <code>fetch</code>. ' +
      'Beim direkten Öffnen über <code>file://</code> blockieren die meisten Browser das.</p>' +
      '<p><strong>Lösung:</strong> Über einen lokalen Server starten, z. B. im Projektordner:</p>' +
      '<pre>python -m http.server 8000</pre>' +
      '<p>… dann <code>http://localhost:8000</code> öffnen. Auf GitHub Pages funktioniert es direkt.</p>' +
      '</div>';
  }

  // --- Tabs -----------------------------------------------------------------

  function setupTabs() {
    var buttons = document.querySelectorAll(".tab-btn");
    var panels = document.querySelectorAll(".tab-panel");
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        buttons.forEach(function (x) { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
        panels.forEach(function (p) { p.classList.remove("active"); });
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
        var panel = document.getElementById(b.dataset.tab);
        if (panel) panel.classList.add("active");
      });
    });
  }

  // --- Trainer (Modi 1 + 2) -------------------------------------------------

  function setupTrainer() {
    LT_Keyboard.render(document.getElementById("kbd-wort2ipa"));
    LT_Keyboard.render(document.getElementById("kbd-dodd"));

    LT_Trainer.init("wort2ipa", document.getElementById("trainer-wort2ipa"), DATA.words);
    LT_Trainer.init("ipa2wort", document.getElementById("trainer-ipa2wort"), DATA.words);
    LT_Trainer.start("wort2ipa");
    LT_Trainer.start("ipa2wort");
  }

  // --- Dodd-Analyse UI ------------------------------------------------------

  var doddRows = []; // {zielwort, ziel_ipa, kind_ipa, versuch}

  function leereZeile() { return { zielwort: "", ziel_ipa: "", kind_ipa: "", versuch: 1 }; }

  function addDoddRow(daten) {
    doddRows.push(daten || leereZeile());
    renderDoddRows();
  }

  function renderDoddRows() {
    var tbody = document.getElementById("dodd-rows");
    tbody.innerHTML = "";
    doddRows.forEach(function (row, i) {
      tbody.appendChild(buildDoddRow(row, i));
    });
    document.getElementById("dodd-count").textContent =
      doddRows.length + " Produktion" + (doddRows.length === 1 ? "" : "en") +
      " · Wortquelle: words.json (" + DATA.standardWords.length + " PLAKSS-Wörter)";
  }

  function buildDoddRow(row, i) {
    var tr = document.createElement("tr");
    tr.className = "dodd-row";

    // Ziel-IPA (Hybrid) – wird von der Zielwort-Autovervollständigung gefüllt.
    var ziel = makeHybridIpaCell(row, "ziel_ipa", null, "Ziel-IPA", "schule", function () { aktualisiereAddBtn(); });
    // Kind-IPA (Hybrid, Referenz = Ziel-IPA für Länge/Betonung).
    var kind = makeHybridIpaCell(row, "kind_ipa", "ziel_ipa", "Kind-IPA", "tule");

    // "+ zur Wortliste hinzufügen" sitzt in der Ziel-Zelle; nur sichtbar, wenn
    // Zielwort + Ziel-IPA befüllt sind und das Wort noch nicht im Pool ist.
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-small wortliste-add";
    addBtn.textContent = "+ zur Wortliste";
    addBtn.title = "Dieses Wort mit Ziel-IPA in die eigene Wortliste übernehmen";
    addBtn.hidden = true;
    addBtn.addEventListener("click", function () {
      if (LT_Storage.addUserWord({ wort: row.zielwort, ipa: row.ziel_ipa, source: "Eigene Eingabe" })) {
        aktualisiereWortpool();
      }
      aktualisiereAddBtn();
    });
    ziel.td.querySelector(".hybrid-ipa-wrap").appendChild(addBtn);

    function aktualisiereAddBtn() {
      var z = (row.zielwort || "").trim();
      var ip = (row.ziel_ipa || "").trim();
      addBtn.hidden = !(z && ip && !wortImPool(z));
    }

    // Zielwort mit Autovervollständigung.
    var zielwort = makeZielwortCell(row,
      function (wort, ipa, fokussiere) {   // bei Auswahl / Exact-Match
        if (ipa) ziel.setWert(ipa);
        aktualisiereAddBtn();
        if (fokussiere !== false) kind.focus(); // Cursor springt ins Kind-IPA-Feld
      },
      function () { aktualisiereAddBtn(); }      // bei jeder Änderung
    );

    tr.appendChild(zielwort.td);
    tr.appendChild(ziel.td);
    tr.appendChild(kind.td);
    tr.appendChild(versuchCell(row));

    // Aktionen: + Versuch und × Löschen
    var aktionen = document.createElement("td");
    aktionen.className = "dodd-actions";

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "btn btn-small";
    plus.textContent = "+ Versuch";
    plus.title = "Weiteren Versuch für dasselbe Wort hinzufügen";
    plus.addEventListener("click", function () {
      doddRows.splice(i + 1, 0, {
        zielwort: row.zielwort, ziel_ipa: row.ziel_ipa, kind_ipa: "", versuch: (row.versuch || 1) + 1
      });
      renderDoddRows();
    });

    var del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-small btn-danger";
    del.textContent = "×";
    del.title = "Produktion entfernen";
    del.addEventListener("click", function () {
      doddRows.splice(i, 1);
      if (doddRows.length === 0) doddRows.push(leereZeile());
      renderDoddRows();
    });

    aktionen.appendChild(plus);
    aktionen.appendChild(del);
    tr.appendChild(aktionen);

    aktualisiereAddBtn();
    return tr;
  }

  // Versuch-Spalte: read-only, automatisch nummeriert.
  function versuchCell(row) {
    var td = document.createElement("td");
    td.className = "versuch-cell";
    td.textContent = row.versuch || 1;
    td.title = "Versuchsnummer (automatisch)";
    return td;
  }

  // Zielwort-Feld mit Autovervollständigung aus dem Wortpool (words.json +
  // eigene Wörter). Dropdown unter dem Feld, Tastatur-Navigation.
  function makeZielwortCell(row, onChosen, onChange) {
    var td = document.createElement("td");
    td.className = "zielwort-cell";
    var wrap = el("div", "autocomplete-wrap");
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Wort";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className = "zielwort-input";
    input.value = row.zielwort || "";
    var menu = el("div", "autocomplete-menu");
    menu.hidden = true;
    wrap.appendChild(input);
    wrap.appendChild(menu);
    td.appendChild(wrap);

    var treffer = [];
    var aktiv = -1;

    function renderMenu() {
      var q = input.value.trim().toLowerCase();
      treffer = q ? DATA.words.filter(function (w) {
        return w.wort.toLowerCase().indexOf(q) === 0; // beginnt mit
      }).slice(0, 8) : [];
      menu.innerHTML = "";
      if (!treffer.length) { menu.hidden = true; aktiv = -1; return; }
      treffer.forEach(function (w, idx) {
        var it = document.createElement("button");
        it.type = "button";
        it.className = "autocomplete-item";
        it.appendChild(el("span", "autocomplete-wort", w.wort));
        it.appendChild(el("span", "autocomplete-ipa ipa-text", "/" + w.ipa + "/"));
        it.addEventListener("mousedown", function (e) { e.preventDefault(); waehle(idx); });
        menu.appendChild(it);
      });
      aktiv = -1;
      menu.hidden = false;
    }

    function markiere() {
      Array.prototype.forEach.call(menu.children, function (c, idx) {
        c.classList.toggle("active", idx === aktiv);
      });
    }

    function waehle(idx) {
      var w = treffer[idx];
      if (!w) return;
      input.value = w.wort;     // Schreibweise aus der Wortliste übernehmen
      row.zielwort = w.wort;
      menu.hidden = true;
      treffer = [];
      onChosen(w.wort, w.ipa);
    }

    input.addEventListener("input", function () {
      row.zielwort = input.value;
      renderMenu();
      if (onChange) onChange();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { if (menu.hidden) return; e.preventDefault(); aktiv = Math.min(aktiv + 1, treffer.length - 1); markiere(); }
      else if (e.key === "ArrowUp") { if (menu.hidden) return; e.preventDefault(); aktiv = Math.max(aktiv - 1, 0); markiere(); }
      else if (e.key === "Enter") { if (!menu.hidden && aktiv >= 0) { e.preventDefault(); waehle(aktiv); } }
      else if (e.key === "Tab") { if (treffer.length) { e.preventDefault(); waehle(aktiv >= 0 ? aktiv : 0); } }
      else if (e.key === "Escape") { menu.hidden = true; }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () { menu.hidden = true; }, 120); // mousedown auf Item zuerst greifen lassen
      row.zielwort = input.value.trim();
      // Exact-Match beim Verlassen, wenn Ziel-IPA noch leer ist (ohne Fokus-
      // wechsel – nur bei expliziter Auswahl/Tab springt der Cursor weiter).
      if (row.zielwort && !(row.ziel_ipa || "").trim()) {
        var ipa = findIpaForWord(row.zielwort, DATA.words);
        if (ipa) { onChosen(row.zielwort, ipa, false); return; }
      }
      if (onChange) onChange();
    });

    return { td: td, focus: function () { input.focus(); } };
  }

  // --- Hybrid-Eingabe (orthografisch -> IPA) --------------------------------
  // Wird für Ziel-IPA UND Kind-IPA im Dodd-Tab genutzt. Live-Vorschau beim
  // Tippen, Konvertierung erst bei Blur (= gespeicherter Wert). IPA-Direktmodus
  // bleibt erhalten (isAlreadyIpa). Bleistift öffnet das Korrektur-Popup.
  //
  // feld     : "ziel_ipa" oder "kind_ipa" (Feld in row)
  // refFeld  : Feld, dessen IPA als Referenz für Länge/Betonung dient
  //            (Kind-IPA -> "ziel_ipa"); null = rein heuristisch (Ziel-IPA).
  // label    : Anzeigename für Placeholder/Popup-Titel
  // beispiel : orthografisches Tipp-Beispiel im Tooltip
  // onChange : optionaler Callback, wird nach Blur (gespeicherter Wert) gerufen
  // Rückgabe : { td, setWert(v), focus() }
  function makeHybridIpaCell(row, feld, refFeld, label, beispiel, onChange) {
    var td = document.createElement("td");
    td.className = "hybrid-ipa-cell";

    function refIpa() { return (refFeld && row[refFeld]) ? row[refFeld] : null; }

    var wrap = el("div", "hybrid-ipa-wrap");
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = label;
    input.className = "ipa-input ipa-text hybrid-ipa-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.title = "Orthografisch tippen (z. B. ‚" + beispiel + "’) – wird automatisch in IPA umgewandelt. Bleistift = manuell korrigieren.";
    input.value = row[feld] || "";

    var pencil = document.createElement("button");
    pencil.type = "button";
    pencil.className = "btn btn-small hybrid-ipa-edit";
    pencil.textContent = "✎"; // Bleistift
    pencil.title = label + " manuell bearbeiten";
    pencil.hidden = true;

    var preview = el("div", "hybrid-ipa-preview");
    preview.hidden = true;

    wrap.appendChild(input);
    wrap.appendChild(pencil);
    td.appendChild(wrap);
    td.appendChild(preview);

    // große Tastatur unten kann dieses Feld als Ziel nutzen
    LT_Keyboard.attach(input);

    function aktualisiereVorschau() {
      var val = input.value;
      if (!val.trim() || LT_Ortho.isAlreadyIpa(val)) { preview.hidden = true; return; }
      preview.textContent = "→ " + LT_Ortho.orthoToIpa(val, refIpa());
      preview.hidden = false;
    }

    function zeigeEingabe() {           // Zustand B
      td.classList.add("state-edit");
      td.classList.remove("state-display");
      pencil.hidden = true;
      input.value = row[feld] || ""; // alter Wert vorbelegt
      aktualisiereVorschau();
    }

    function zeigeAnzeige() {           // Zustand C
      td.classList.remove("state-edit");
      td.classList.add("state-display");
      input.value = row[feld] || "";
      pencil.hidden = !row[feld];
      preview.hidden = true;
    }

    input.addEventListener("focus", zeigeEingabe);
    input.addEventListener("input", aktualisiereVorschau);
    input.addEventListener("blur", function () {
      var val = input.value.trim();
      // Erst bei Blur wird der konvertierte Wert gespeichert.
      if (val && !LT_Ortho.isAlreadyIpa(val)) {
        row[feld] = LT_Ortho.orthoToIpa(val, refIpa());
      } else {
        row[feld] = val;
      }
      zeigeAnzeige();
      if (onChange) onChange();
    });

    pencil.addEventListener("click", function () {
      openIpaPopup(row[feld] || "", label, function (neu) {
        row[feld] = neu;
        zeigeAnzeige();
        if (onChange) onChange();
      });
    });

    // Startzustand: vorhandener Wert -> Anzeige (C), sonst leer (A/B)
    if (row[feld]) zeigeAnzeige(); else td.classList.add("state-edit");

    // Programmatisch setzen (z. B. Auto-Fill aus der Zielwort-Auswahl).
    function setWert(v) { row[feld] = v; zeigeAnzeige(); }

    return { td: td, setWert: setWert, focus: function () { input.focus(); } };
  }

  // Mini-Popup zur manuellen IPA-Korrektur mit kompakter IPA-Tastatur.
  function openIpaPopup(startwert, label, onSave) {
    var overlay = el("div", "modal-overlay");
    var dialog = el("div", "modal");

    dialog.appendChild(el("h3", "modal-title", (label || "IPA") + " bearbeiten"));

    var input = document.createElement("input");
    input.type = "text";
    input.className = "ipa-input ipa-text modal-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = startwert || "";
    dialog.appendChild(input);

    var kbd = el("div", "modal-kbd");
    dialog.appendChild(kbd);
    LT_Keyboard.render(kbd);          // gleiche Zeichensätze wie die große Tastatur

    var actions = el("div", "modal-actions");
    var cancel = el("button", "btn", "Abbrechen");
    var save = el("button", "btn btn-primary", "Speichern");
    cancel.type = "button"; save.type = "button";
    actions.appendChild(cancel);
    actions.appendChild(save);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    LT_Keyboard.attach(input);
    LT_Keyboard.setTarget(input);
    input.focus();
    input.select();

    function schliessen() {
      document.removeEventListener("keydown", onKey);
      LT_Keyboard.setTarget(null);
      overlay.remove();
    }
    function speichern() { onSave(input.value.trim()); schliessen(); }
    function onKey(e) {
      if (e.key === "Escape") schliessen();
      else if (e.key === "Enter") { e.preventDefault(); speichern(); }
    }

    cancel.addEventListener("click", schliessen);
    save.addEventListener("click", speichern);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) schliessen(); });
    document.addEventListener("keydown", onKey);
  }

  function setupDodd() {
    document.getElementById("dodd-add").addEventListener("click", function () { addDoddRow(); });
    document.getElementById("dodd-loadall").addEventListener("click", ladeAllePlakss);
    document.getElementById("dodd-analyze").addEventListener("click", analysiere);
    document.getElementById("dodd-clear").addEventListener("click", zuruecksetzen);
    setupBeispielDropdown();
    // Startzustand: eine leere Zeile
    doddRows = [leereZeile()];
    renderDoddRows();
    renderDoddHistory();
  }

  function hatDaten() {
    return doddRows.some(function (r) {
      return (r.zielwort || "").trim() || (r.ziel_ipa || "").trim() || (r.kind_ipa || "").trim();
    });
  }

  // Bequemlichkeit: füllt die Tabelle mit allen Standard-PLAKSS-Wörtern
  // (Zielwort + Ziel-IPA), Kind-IPA leer, Versuch 1.
  function ladeAllePlakss() {
    if (hatDaten() && !confirm("Aktuelle Eingaben verwerfen und alle " +
      DATA.standardWords.length + " PLAKSS-Wörter laden?")) return;
    doddRows = DATA.standardWords.map(function (w) {
      return { zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: "", versuch: 1 };
    });
    document.getElementById("dodd-result").innerHTML = "";
    renderDoddRows();
  }

  function zuruecksetzen() {
    if (hatDaten() && !confirm("Alle Eingaben verwerfen?")) return;
    doddRows = [leereZeile()];                 // eine leere Zeile bleibt stehen
    document.getElementById("dodd-result").innerHTML = "";
    renderDoddRows();                          // Alter-Feld bleibt unverändert
  }

  // --- Beispiel-Dropdown ----------------------------------------------------
  // Menü-Einträge stammen aus data/dodd-examples.json (Label + Kurzbeschreibung),
  // nicht aus hartkodierten Werten.

  function setupBeispielDropdown() {
    var dropdown = document.getElementById("dodd-example-dropdown");
    var toggle = document.getElementById("dodd-example-toggle");
    var menu = document.getElementById("dodd-example-menu");
    if (!dropdown || !toggle || !menu) return;

    var sets = (DATA.examples && DATA.examples.sets) || [];
    menu.innerHTML = "";
    sets.forEach(function (set) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "dropdown-item";
      item.setAttribute("role", "menuitem");
      var titel = el("span", "dropdown-item-title", set.label);
      item.appendChild(titel);
      if (set.kurzbeschreibung) {
        item.appendChild(el("span", "dropdown-item-desc", set.kurzbeschreibung));
      }
      item.addEventListener("click", function () {
        ladeBeispielSet(set);
        schliesseMenu();
      });
      menu.appendChild(item);
    });

    function oeffneMenu() {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("click", aussenKlick);
    }
    function schliesseMenu() {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", aussenKlick);
    }
    function aussenKlick(e) {
      if (!dropdown.contains(e.target)) schliesseMenu();
    }

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) oeffneMenu(); else schliesseMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") schliesseMenu();
    });
  }

  // Lädt ein Beispiel-Set: Zielwörter + Ziel-IPA kommen aus words.json, die
  // kind_produktionen (in gleicher Reihenfolge) liefern die Kind-IPA. Ein
  // Listeneintrag kann ein String (1 Versuch) oder ein Array (mehrere Versuche)
  // sein – Letzteres erzeugt mehrere Zeilen für dasselbe Wort.
  function ladeBeispielSet(set) {
    if (hatDaten() && !confirm("Aktuelle Eingaben verwerfen und Beispiel „" + set.label + "“ laden?")) return;
    var kp = set.kind_produktionen || [];
    doddRows = [];
    DATA.standardWords.forEach(function (w, idx) {
      var prod = kp[idx];
      if (Array.isArray(prod)) {
        prod.forEach(function (k, vi) {
          doddRows.push({ zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: k, versuch: vi + 1 });
        });
      } else {
        doddRows.push({ zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: prod || "", versuch: 1 });
      }
    });
    document.getElementById("dodd-jahre").value = set.alter_jahre != null ? set.alter_jahre : 0;
    document.getElementById("dodd-monate").value = set.alter_monate != null ? set.alter_monate : 0;
    document.getElementById("dodd-result").innerHTML = "";
    renderDoddRows();
  }

  function analysiere() {
    var jahre = parseInt(document.getElementById("dodd-jahre").value, 10) || 0;
    var monate = parseInt(document.getElementById("dodd-monate").value, 10) || 0;
    var produktionen = doddRows.filter(function (r) {
      return (r.ziel_ipa || "").trim() && (r.kind_ipa || "").trim();
    });
    if (produktionen.length === 0) {
      alert("Bitte mindestens eine Produktion mit Ziel-IPA und Kind-IPA eingeben.");
      return;
    }
    var input = { alter_jahre: jahre, alter_monate: monate, produktionen: produktionen };
    var ergebnis = LT_DoddAnalyzer.analyze(input, DATA.processes);
    renderDoddResult(ergebnis, input);

    LT_Storage.addDoddAnalysis({
      timestamp: new Date().toISOString(),
      alter: LT_DoddAnalyzer.fmtAlter(ergebnis.alter_dezimal),
      anzahl: ergebnis.anzahl_produktionen,
      klassifikation: ergebnis.klassifikation.kategorie,
      inkonsequenz: ergebnis.klassifikation.inkonsequenz_score
    });
    renderDoddHistory();
  }

  function renderDoddResult(e, input) {
    var c = document.getElementById("dodd-result");
    c.innerHTML = "";

    var head = el("div", "dodd-klass");
    head.appendChild(el("div", "dodd-klass-label", "Klassifikation nach Dodd"));
    head.appendChild(el("div", "dodd-klass-value", e.klassifikation.kategorie));
    head.appendChild(el("div", "dodd-klass-meta",
      "Alter: " + LT_DoddAnalyzer.fmtAlter(e.alter_dezimal) +
      " · Produktionen: " + e.anzahl_produktionen +
      " · Inkonsequenz: " + e.klassifikation.inkonsequenz_score + "%"));
    c.appendChild(head);

    var disclaimer = el("p", "dodd-disclaimer", e.klassifikation.hinweis);
    c.appendChild(disclaimer);

    // Begründung
    var bg = el("div", "dodd-section");
    bg.appendChild(el("h4", null, "Begründung"));
    var ul = document.createElement("ul");
    e.klassifikation.begruendung.forEach(function (b) {
      ul.appendChild(el("li", null, b));
    });
    bg.appendChild(ul);
    c.appendChild(bg);

    // Inkonsequenz
    var ink = el("div", "dodd-section");
    ink.appendChild(el("h4", null, "Inkonsequenz-Analyse"));
    if (e.inkonsequenz.woerter_mehrfach === 0) {
      ink.appendChild(el("p", "muted", "Keine mehrfach produzierten Wörter – Inkonsequenz nicht beurteilbar. Für die Inkonsequenz-Diagnostik dasselbe Wort mehrfach (verschiedene Versuchsnummern) erheben."));
    } else {
      ink.appendChild(el("p", null,
        "Score: " + e.klassifikation.inkonsequenz_score + "% (" +
        e.inkonsequenz.woerter_variabel + " von " + e.inkonsequenz.woerter_mehrfach +
        " mehrfach produzierten Wörtern variabel; Grenze 40%)."));
      e.inkonsequenz.details.forEach(function (d) {
        if (d.variabel) {
          ink.appendChild(el("p", "muted", "„" + d.wort + "“: " + d.produktionen.map(function (p) { return "[" + p + "]"; }).join(" / ")));
        }
      });
    }
    c.appendChild(ink);

    // Prozesse
    var ps = el("div", "dodd-section");
    ps.appendChild(el("h4", null, "Erkannte Prozesse"));
    if (e.prozesse.length === 0) {
      ps.appendChild(el("p", "muted", "Keine phonologischen Prozessmuster erkannt."));
    } else {
      var t = document.createElement("table");
      t.className = "result-table";
      t.innerHTML = "<thead><tr><th>Prozess</th><th>Typ</th><th>Vorkommen</th><th>Konsistenz</th><th>Alters-Bewertung</th><th>Beispiele</th></tr></thead>";
      var tb = document.createElement("tbody");
      e.prozesse.forEach(function (p) {
        var tr = document.createElement("tr");
        tr.appendChild(td(p.name));
        tr.appendChild(typBadge(p.typ));
        tr.appendChild(td(String(p.vorkommen) + (p.gelegenheiten != null ? " / " + p.gelegenheiten : "")));
        tr.appendChild(td(p.konsistenz != null ? Math.round(p.konsistenz * 100) + "%" : "—"));
        tr.appendChild(td(p.alters_bewertung.text, statusKlasse(p.alters_bewertung.status)));
        tr.appendChild(td(p.beispiele.join(", "), "ipa-text"));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      ps.appendChild(t);
    }
    if (e.unklassifizierte_substitutionen.length) {
      ps.appendChild(el("p", "muted", "Weitere Einzel-Abweichungen ohne hinterlegtes Prozessmuster: " +
        e.unklassifizierte_substitutionen.join(", ")));
    }
    c.appendChild(ps);

    c.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function typBadge(typ) {
    var t = document.createElement("td");
    var span = document.createElement("span");
    span.className = "badge badge-" + typ;
    span.textContent = typ;
    t.appendChild(span);
    return t;
  }

  function statusKlasse(s) {
    if (s === "verzoegert" || s === "untypisch") return "status-bad";
    if (s === "im_rahmen") return "status-ok";
    return "status-neutral";
  }

  function renderDoddHistory() {
    var c = document.getElementById("dodd-history");
    if (!c) return;
    var hist = LT_Storage.getDoddHistory();
    c.innerHTML = "";
    if (!hist.length) {
      c.appendChild(el("p", "muted", "Noch keine gespeicherten Analysen."));
      return;
    }
    var t = document.createElement("table");
    t.className = "result-table";
    t.innerHTML = "<thead><tr><th>Datum</th><th>Alter</th><th>Produktionen</th><th>Klassifikation</th><th>Inkonsequenz</th></tr></thead>";
    var tb = document.createElement("tbody");
    hist.forEach(function (h) {
      var tr = document.createElement("tr");
      tr.appendChild(td(new Date(h.timestamp).toLocaleString("de-DE")));
      tr.appendChild(td(h.alter || "—"));
      tr.appendChild(td(String(h.anzahl)));
      tr.appendChild(td(h.klassifikation));
      tr.appendChild(td((h.inkonsequenz != null ? h.inkonsequenz + "%" : "—")));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    c.appendChild(t);
  }

  // --- Export / Import ------------------------------------------------------

  function setupDatenButtons() {
    document.getElementById("btn-export").addEventListener("click", function () {
      LT_Storage.downloadExport();
    });

    var fileInput = document.getElementById("import-file");
    document.getElementById("btn-import").addEventListener("click", function () {
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(reader.result);
          LT_Storage.importAll(obj);
          alert("Import erfolgreich. Die Seite wird neu geladen.");
          location.reload();
        } catch (err) {
          alert("Import fehlgeschlagen: " + err.message);
        }
      };
      reader.readAsText(f);
      fileInput.value = "";
    });
  }

  // --- DOM-Helfer -----------------------------------------------------------
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

  // --- Init -----------------------------------------------------------------

  function init() {
    setupTabs();
    setupDatenButtons();
    ladeDaten().then(function () {
      setupTrainer();
      setupDodd();
    }).catch(function (err) {
      console.error(err);
      zeigeLadefehler();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  global.LT_App = { data: DATA };
})(window);
