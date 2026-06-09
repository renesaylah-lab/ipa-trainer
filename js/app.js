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
    // Standard + eigene Wörter zu einem Pool mergen (eigene überschreiben bei
    // Dublette). IN PLACE, damit bestehende Referenzen (Trainer) den neuen
    // Stand sehen.
    var merged = LT_Storage.mergeWithUserWords(DATA.standardWords);
    DATA.words.length = 0;
    merged.forEach(function (w) { DATA.words.push(normalizeWord(w)); });
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
    ((DATA.examples && DATA.examples.kategorien) || []).forEach(function (kat) {
      (kat.varianten || []).forEach(function (v) {
        var kp = v.kind_produktionen || [];
        if (kp.length !== n) {
          console.warn("[Konsistenz] Beispiel-Variante \"" + kat.id + " / " + v.name + "\" hat " +
            kp.length + " Einträge, words.json hat " + n + ". Länge/Reihenfolge müssen übereinstimmen.");
        }
      });
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
  var letzteAnalyse = null; // Snapshot der letzten Analyse (für PDF-Export)

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
    var verborgen = DATA.standardWords.length - sichtbareStandard().length;
    document.getElementById("dodd-count").textContent =
      doddRows.length + " Produktion" + (doddRows.length === 1 ? "" : "en") +
      " · Pool: words.json (" + DATA.standardWords.length + " Standard" +
      (verborgen ? ", " + verborgen + " verborgen" : "") + ")";
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
        zeigeToast("„" + (row.zielwort || "").trim() + "“ zur Wortliste hinzugefügt");
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
      function () { aktualisiereAddBtn(); },     // bei jeder Änderung
      function (wort) {                          // freie Eingabe ohne Treffer
        // G2P-Vorschlag aus der Orthografie erzeugen (umgekehrte Hybrid-Eingabe),
        // ins Ziel-IPA schreiben + dezenten "automatisch erzeugt"-Hinweis zeigen.
        var vorschlag = LT_Ortho.orthoToIpa(wort);
        if (vorschlag) ziel.setVorschlag(vorschlag);
        aktualisiereAddBtn();
      }
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
  function makeZielwortCell(row, onChosen, onChange, onFreitext) {
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
        // Kein Treffer im Pool -> G2P-Vorschlag fürs Ziel-IPA erzeugen.
        if (onFreitext) { onFreitext(row.zielwort); return; }
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

    // Dezenter Hinweis, wenn der Wert automatisch per G2P erzeugt wurde.
    var autoHint = el("div", "hybrid-ipa-auto", "IPA automatisch erzeugt – bitte prüfen");
    autoHint.hidden = true;

    wrap.appendChild(input);
    wrap.appendChild(pencil);
    td.appendChild(wrap);
    td.appendChild(preview);
    td.appendChild(autoHint);

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
      autoHint.hidden = true;        // beim Bearbeiten kein "auto erzeugt"-Hinweis
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
      autoHint.hidden = true;        // manuell gespeichert -> Hinweis weg
      if (onChange) onChange();
    });

    pencil.addEventListener("click", function () {
      openIpaPopup(row[feld] || "", label, function (neu) {
        row[feld] = neu;
        zeigeAnzeige();
        autoHint.hidden = true;      // manuell korrigiert -> Hinweis weg
        if (onChange) onChange();
      });
    });

    // Startzustand: vorhandener Wert -> Anzeige (C), sonst leer (A/B)
    if (row[feld]) zeigeAnzeige(); else td.classList.add("state-edit");

    // Programmatisch setzen (z. B. Auto-Fill aus der Zielwort-Auswahl). Ohne
    // "auto erzeugt"-Hinweis, weil der Wert aus dem Pool (verifiziert) kommt.
    function setWert(v) { row[feld] = v; zeigeAnzeige(); autoHint.hidden = true; }

    // G2P-Vorschlag setzen: wie setWert, aber mit dezentem "auto erzeugt"-Hinweis.
    function setVorschlag(v) { row[feld] = v; zeigeAnzeige(); autoHint.hidden = false; }

    return { td: td, setWert: setWert, setVorschlag: setVorschlag, focus: function () { input.focus(); } };
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
    var pdfBtn = document.getElementById("dodd-pdf");
    if (pdfBtn) pdfBtn.addEventListener("click", exportiereDoddPdf);
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

  // Sichtbare Standard-Wörter: nicht-verborgen, mit angewandten Overrides.
  function sichtbareStandard() {
    var ov = LT_Storage.getOverrides();
    return DATA.standardWords
      .filter(function (w) { return !LT_Storage.isHidden(w.wort); })
      .map(function (w) { return ov[w.wort] ? normalizeWord(ov[w.wort]) : w; });
  }

  // Bequemlichkeit: füllt die Tabelle mit den (sichtbaren) Standard-PLAKSS-
  // Wörtern. Verborgene Wörter werden NICHT geladen (können < 25 sein).
  function ladeAllePlakss() {
    var sichtbar = sichtbareStandard();
    var verborgen = DATA.standardWords.length - sichtbar.length;
    if (hatDaten() && !confirm("Aktuelle Eingaben verwerfen und " + sichtbar.length +
      " Standard-Wörter laden?" + (verborgen ? " (" + verborgen + " verborgen)" : ""))) return;
    doddRows = sichtbar.map(function (w) {
      return { zielwort: w.wort, ziel_ipa: w.ipa, kind_ipa: "", versuch: 1 };
    });
    document.getElementById("dodd-result").innerHTML = "";
    renderDoddRows();
  }

  function zuruecksetzen() {
    if (hatDaten() && !confirm("Alle Eingaben verwerfen?")) return;
    doddRows = [leereZeile()];                 // eine leere Zeile bleibt stehen
    document.getElementById("dodd-result").innerHTML = "";
    letzteAnalyse = null;                       // PDF-Export erst nach neuer Analyse
    var pdfBtn = document.getElementById("dodd-pdf");
    if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.title = "Bitte zuerst auf ‚Analysieren‘ klicken."; }
    renderDoddRows();                          // Alter-Feld bleibt unverändert
  }

  // PDF-Export der zuletzt durchgeführten Analyse (kein erneutes Analysieren).
  function exportiereDoddPdf() {
    if (!letzteAnalyse) { alert("Bitte zuerst auf ‚Analysieren‘ klicken."); return; }
    if (!global.LT_PdfExport) { alert("PDF-Export ist nicht verfügbar (Bibliothek nicht geladen)."); return; }
    LT_PdfExport.export(letzteAnalyse).catch(function (err) {
      console.error(err);
      alert("PDF-Export fehlgeschlagen: " + (err && err.message ? err.message : err));
    });
  }

  // --- Beispiel-Dropdown ----------------------------------------------------
  // Menü-Einträge stammen aus data/dodd-examples.json (Label + Kurzbeschreibung),
  // nicht aus hartkodierten Werten.

  function setupBeispielDropdown() {
    var dropdown = document.getElementById("dodd-example-dropdown");
    var toggle = document.getElementById("dodd-example-toggle");
    var menu = document.getElementById("dodd-example-menu");
    if (!dropdown || !toggle || !menu) return;

    var kategorien = (DATA.examples && DATA.examples.kategorien) || [];
    menu.innerHTML = "";

    function macheItem(label, desc, onClick) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "dropdown-item";
      item.setAttribute("role", "menuitem");
      item.appendChild(el("span", "dropdown-item-title", label));
      if (desc) item.appendChild(el("span", "dropdown-item-desc", desc));
      item.addEventListener("click", function () { onClick(); schliesseMenu(); });
      menu.appendChild(item);
    }

    // Gruppe 1: kuratierte Lehrbuch-Fälle (zufällige Variante je Kategorie).
    menu.appendChild(el("div", "dropdown-header", "Lehrbuch-Fälle"));
    kategorien.forEach(function (kat) {
      macheItem(kat.label, kat.kurzbeschreibung, function () { ladeBeispielKategorie(kat); });
    });

    // Gruppe 2: prozedural generierte Zufallsfälle (jedes Mal neu, plausibel).
    menu.appendChild(el("div", "dropdown-header", "Zufallsfall (plausibel generiert)"));
    kategorien.forEach(function (kat) {
      macheItem(kat.label, "Neuer Zufallsfall – jedes Mal anders", function () { ladeGeneriertenFall(kat); });
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

  // Lädt eine Beispiel-Kategorie NICHT-DETERMINISTISCH: pro Klick wird zufällig
  // eine der hinterlegten Varianten gezogen. Zielwörter + Ziel-IPA kommen aus
  // words.json, die kind_produktionen der Variante (gleiche Reihenfolge) liefern
  // die Kind-IPA. Ein Eintrag kann ein String (1 Versuch) oder ein Array
  // (mehrere Versuche desselben Wortes) sein. Der Variantenname wird NICHT im
  // UI angezeigt (kein Spoiler), nur in der Konsole geloggt (Debug).
  // Lehrbuch-Fall: zufällige (kuratierte) Variante einer Kategorie laden.
  function ladeBeispielKategorie(kat) {
    var varianten = (kat && kat.varianten) || [];
    if (!varianten.length) return;
    if (hatDaten() && !confirm("Aktuelle Eingaben verwerfen und Beispiel „" + kat.label + "“ laden?")) return;
    var v = varianten[Math.floor(Math.random() * varianten.length)];
    console.log("[Beispiel] Lehrbuch \"" + kat.label + "\" – Variante: \"" + v.name + "\"");
    ladeFall(v);
  }

  // Zufallsfall: prozedural generierten, plausiblen Fall laden (jedes Mal neu).
  function ladeGeneriertenFall(kat) {
    if (!global.LT_CaseGenerator) return;
    if (hatDaten() && !confirm("Aktuelle Eingaben verwerfen und einen Zufallsfall „" + kat.label + "“ laden?")) return;
    var fall = LT_CaseGenerator.generate(kat.id, DATA.standardWords, DATA.processes);
    if (!fall) { alert("Konnte keinen Fall generieren – bitte erneut versuchen."); return; }
    console.log("[Beispiel] Zufallsfall \"" + kat.label + "\" generiert – erwartete Kategorie: " +
      fall.expected_category + "; angewandte Prozesse: " + (fall.applied || []).join(", "));
    ladeFall(fall);
  }

  // Gemeinsames Laden: kind_produktionen (String = 1 Versuch, Array = mehrere)
  // in der Reihenfolge von words.json; Alter setzen; Ergebnis leeren.
  function ladeFall(fall) {
    var kp = fall.kind_produktionen || [];
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
    document.getElementById("dodd-jahre").value = fall.alter_jahre != null ? fall.alter_jahre : 0;
    document.getElementById("dodd-monate").value = fall.alter_monate != null ? fall.alter_monate : 0;
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

    // Snapshot für den PDF-Export (nutzt die AKTUELL sichtbare Klassifikation).
    var pseudInput = document.getElementById("dodd-pseudonym");
    letzteAnalyse = {
      pseudonym: pseudInput ? pseudInput.value : "",
      alter_jahre: jahre, alter_monate: monate,
      rows: produktionen.map(function (r) {
        return { zielwort: r.zielwort, ziel_ipa: r.ziel_ipa, kind_ipa: r.kind_ipa, versuch: r.versuch };
      }),
      klassifikation: {
        kategorie: ergebnis.klassifikation.kategorie,
        begruendung: ergebnis.klassifikation.begruendung,
        prozesse: ergebnis.prozesse.map(function (p) { return { name: p.name, typ: p.typ, beispiele: p.beispiele }; })
      }
    };
    var pdfBtn = document.getElementById("dodd-pdf");
    if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.title = "Aktuelle Analyse als PDF speichern"; }

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

    // Gut sichtbarer PDF-Export direkt im Ergebnisbereich.
    var pdfBtn = el("button", "btn btn-primary dodd-result-pdf", "Ergebnis als PDF speichern");
    pdfBtn.type = "button";
    pdfBtn.addEventListener("click", exportiereDoddPdf);
    c.appendChild(pdfBtn);

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

  // --- Wortlisten-Verwaltung (Tab 4) ----------------------------------------
  // Zeigt den gemergten Pool annotiert (Standard / Standard (geändert) / Eigene),
  // mit Suche, Filter, Hinzufügen, Bearbeiten, Löschen (eigene) bzw. Verbergen
  // (Standard, reversibel). Alle Änderungen laufen über LocalStorage-Overrides;
  // data/words.json bleibt unverändert.

  var wlFilter = "alle";    // alle | standard | eigene
  var wlShowHidden = false; // bei Filter "standard": auch verborgene zeigen

  function setupWortliste() {
    var kbd = document.getElementById("kbd-wortliste");
    if (kbd) LT_Keyboard.render(kbd);

    var search = document.getElementById("wl-search");
    if (search) search.addEventListener("input", renderWortliste);

    document.querySelectorAll(".wl-filter-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        wlFilter = b.dataset.filter;
        document.querySelectorAll(".wl-filter-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        renderWortliste();
      });
    });

    var showHidden = document.getElementById("wl-showhidden");
    if (showHidden) showHidden.addEventListener("change", function () {
      wlShowHidden = showHidden.checked; renderWortliste();
    });

    setupWlAddForm();
    renderWortliste();
  }

  // Eigenständiges IPA-Feld (Input + Bleistift-Popup + ortho->IPA bei Blur),
  // unabhängig von der Dodd-Tabelle. Für Hinzufügen- und Bearbeiten-Formular.
  function makeIpaField(initial, label) {
    var wrap = el("div", "wl-ipa-wrap");
    var input = document.createElement("input");
    input.type = "text"; input.className = "wl-input ipa-input ipa-text";
    input.autocomplete = "off"; input.spellcheck = false;
    input.value = initial || ""; input.placeholder = label || "IPA";
    var pencil = el("button", "btn btn-small hybrid-ipa-edit", "✎");
    pencil.type = "button"; pencil.title = (label || "IPA") + " mit IPA-Tastatur bearbeiten";
    wrap.appendChild(input); wrap.appendChild(pencil);
    LT_Keyboard.attach(input);
    input.addEventListener("blur", function () {
      var v = input.value.trim();
      if (v && !LT_Ortho.isAlreadyIpa(v)) input.value = LT_Ortho.orthoToIpa(v);
    });
    pencil.addEventListener("click", function () {
      openIpaPopup(input.value || "", label || "IPA", function (neu) { input.value = neu; });
    });
    return {
      el: wrap,
      getValue: function () { return input.value; },
      setValue: function (v) { input.value = v || ""; },
      focus: function () { input.focus(); }
    };
  }

  function setupWlAddForm() {
    var toggle = document.getElementById("wl-add-toggle");
    var form = document.getElementById("wl-addform");
    var wortInput = document.getElementById("wl-add-wort");
    var ipaCell = document.getElementById("wl-add-ipa-cell");
    var saveBtn = document.getElementById("wl-add-save");
    var cancelBtn = document.getElementById("wl-add-cancel");
    var hint = document.getElementById("wl-add-hint");
    if (!toggle || !form) return;

    var ipaField = makeIpaField("", "Ziel-IPA");
    ipaCell.innerHTML = ""; ipaCell.appendChild(ipaField.el);

    // G2P-Vorschlag beim Verlassen des Wort-Feldes, wenn IPA noch leer.
    wortInput.addEventListener("blur", function () {
      var w = wortInput.value.trim();
      if (w && !ipaField.getValue().trim()) {
        var vorschlag = LT_Ortho.orthoToIpa(w);
        if (vorschlag) { ipaField.setValue(vorschlag); hint.textContent = "IPA automatisch erzeugt – bitte prüfen."; }
      }
    });

    function reset() { wortInput.value = ""; ipaField.setValue(""); hint.textContent = ""; }
    toggle.addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) wortInput.focus();
    });
    cancelBtn.addEventListener("click", function () { reset(); form.hidden = true; });
    saveBtn.addEventListener("click", function () {
      var w = wortInput.value.trim(), ip = ipaField.getValue().trim();
      if (!w || !ip) { alert("Bitte Wort und IPA angeben."); return; }
      if (LT_Storage.addUserWord({ wort: w, ipa: ip, source: "Eigene Eingabe" })) {
        aktualisiereWortpool();
        zeigeToast("„" + w + "“ hinzugefügt");
        reset(); form.hidden = true;
        renderWortliste();
      } else {
        alert("„" + w + "“ ist bereits in der Wortliste.");
      }
    });
  }

  // Baut die annotierte Liste (Standard + Standard-Override + Eigene).
  function wortlisteEintraege() {
    var ov = LT_Storage.getOverrides();
    var rows = [];
    DATA.standardWords.forEach(function (w) {
      var o = ov[w.wort];
      rows.push({
        original: w.wort,
        wort: o ? o.wort : w.wort,
        ipa: o ? o.ipa : w.ipa,
        typ: o ? "Standard (geändert)" : "Standard",
        art: "standard", hidden: LT_Storage.isHidden(w.wort), override: !!o
      });
    });
    LT_Storage.getUserWords().forEach(function (w) {
      rows.push({ original: w.wort, wort: w.wort, ipa: w.ipa, typ: "Eigene", art: "eigene", hidden: false, override: false });
    });
    return rows;
  }

  function renderWortliste() {
    var tbody = document.getElementById("wl-rows");
    var empty = document.getElementById("wl-empty");
    if (!tbody) return;
    var q = (document.getElementById("wl-search").value || "").trim().toLowerCase();

    var rows = wortlisteEintraege().filter(function (r) {
      if (wlFilter === "standard" && r.art !== "standard") return false;
      if (wlFilter === "eigene" && r.art !== "eigene") return false;
      // Verborgene: bei "standard" nur wenn Toggle aktiv; bei "alle" mitzeigen.
      if (r.hidden && wlFilter === "standard" && !wlShowHidden) return false;
      return true;
    });
    if (q) rows = rows.filter(function (r) {
      return r.wort.toLowerCase().indexOf(q) !== -1 || (r.ipa || "").toLowerCase().indexOf(q) !== -1;
    });

    tbody.innerHTML = "";
    rows.forEach(function (r) { tbody.appendChild(buildWlRow(r)); });
    if (empty) empty.hidden = rows.length > 0;
  }

  function wlTypTag(r) {
    var cls = r.art === "eigene" ? "wl-tag-eigene" : (r.override ? "wl-tag-override" : "wl-tag-standard");
    return el("span", "wl-tag " + cls, r.typ);
  }

  function buildWlRow(r) {
    var tr = document.createElement("tr");
    tr.className = "wl-row" + (r.hidden ? " wl-row-hidden" : "");

    var tdTyp = document.createElement("td");
    tdTyp.appendChild(wlTypTag(r));
    if (r.hidden) tdTyp.appendChild(el("span", "wl-tag wl-tag-hidden", "verborgen"));

    var tdAkt = document.createElement("td");
    tdAkt.className = "wl-actions";

    if (r.hidden) {
      var einblenden = el("button", "btn btn-small", "Wieder einblenden");
      einblenden.type = "button";
      einblenden.addEventListener("click", function () {
        LT_Storage.unhideWord(r.original); aktualisiereWortpool(); renderWortliste();
        zeigeToast("„" + r.original + "“ wieder eingeblendet");
      });
      tdAkt.appendChild(einblenden);
    } else {
      var edit = el("button", "btn btn-small", "Bearbeiten");
      edit.type = "button";
      edit.addEventListener("click", function () { editWlRow(tr, r); });
      tdAkt.appendChild(edit);

      if (r.art === "eigene") {
        var del = el("button", "btn btn-small btn-danger", "Löschen");
        del.type = "button"; del.title = "Eigenen Eintrag löschen";
        del.addEventListener("click", function () {
          if (confirm("Eintrag „" + r.wort + "“ löschen?")) {
            LT_Storage.removeUserWord(r.original); aktualisiereWortpool(); renderWortliste();
            zeigeToast("„" + r.wort + "“ gelöscht");
          }
        });
        tdAkt.appendChild(del);
      } else {
        var verbergen = el("button", "btn btn-small btn-danger", "Verbergen");
        verbergen.type = "button"; verbergen.title = "Standard-Eintrag verbergen";
        verbergen.addEventListener("click", function () {
          if (confirm("Standard-Eintrag „" + r.wort + "“ verbergen?\n\nDieser Eintrag wird in keinem Modus mehr verwendet (auch nicht bei ‚Alle 25 laden‘), bis Sie ihn in der Wortliste wieder einblenden.")) {
            LT_Storage.hideWord(r.original); aktualisiereWortpool(); renderWortliste();
            zeigeToast("„" + r.wort + "“ verborgen");
          }
        });
        tdAkt.appendChild(verbergen);
      }
    }

    tr.appendChild(td(r.wort));
    tr.appendChild(td(r.ipa, "ipa-text"));
    tr.appendChild(tdTyp);
    tr.appendChild(tdAkt);
    return tr;
  }

  // Inline-Bearbeitung einer Zeile (Wort + IPA editierbar, Speichern/Abbrechen).
  function editWlRow(tr, r) {
    tr.innerHTML = "";
    tr.className = "wl-row wl-row-edit";

    var tdWort = document.createElement("td");
    var wortInput = document.createElement("input");
    wortInput.type = "text"; wortInput.className = "wl-input";
    wortInput.autocomplete = "off"; wortInput.spellcheck = false; wortInput.value = r.wort;
    tdWort.appendChild(wortInput);

    var tdIpa = document.createElement("td");
    var ipaField = makeIpaField(r.ipa, "IPA");
    tdIpa.appendChild(ipaField.el);

    var tdTyp = document.createElement("td");
    tdTyp.appendChild(wlTypTag(r));

    var tdAkt = document.createElement("td"); tdAkt.className = "wl-actions";
    var save = el("button", "btn btn-small btn-primary", "Speichern"); save.type = "button";
    var cancel = el("button", "btn btn-small btn-ghost", "Abbrechen"); cancel.type = "button";
    tdAkt.appendChild(save); tdAkt.appendChild(cancel);

    save.addEventListener("click", function () {
      var nw = wortInput.value.trim(), nip = ipaField.getValue().trim();
      if (!nw || !nip) { alert("Bitte Wort und IPA angeben."); return; }
      if (r.art === "eigene") {
        LT_Storage.updateUserWord(r.original, { wort: nw, ipa: nip });
      } else {
        if (!confirm("Standard-Eintrag bearbeiten?\n\nDie Änderung gilt nur in dieser Browser-Installation.")) return;
        LT_Storage.setOverride(r.original, { wort: nw, ipa: nip });
      }
      aktualisiereWortpool(); renderWortliste();
      zeigeToast("„" + nw + "“ gespeichert");
    });
    cancel.addEventListener("click", renderWortliste);

    tr.appendChild(tdWort); tr.appendChild(tdIpa); tr.appendChild(tdTyp); tr.appendChild(tdAkt);
    wortInput.focus();
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

  // Kurze, nicht-blockierende Bestätigung (Toast). Blendet sich selbst aus.
  var toastTimer = null;
  function zeigeToast(text) {
    var t = el("div", "lt-toast", text);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("visible"); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("visible");
      setTimeout(function () { t.remove(); }, 260);
    }, 2400);
  }

  // --- Init -----------------------------------------------------------------

  function init() {
    setupTabs();
    setupDatenButtons();
    ladeDaten().then(function () {
      setupTrainer();
      setupDodd();
      setupWortliste();
    }).catch(function (err) {
      console.error(err);
      zeigeLadefehler();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  global.LT_App = { data: DATA };
})(window);
