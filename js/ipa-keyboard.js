/* ipa-keyboard.js
 * Klickbare IPA-Tastatur für die deutsche Transkription.
 * Fügt Zeichen an der Cursor-Position des zuletzt fokussierten IPA-Eingabefelds
 * ein. Felder werden über LT_Keyboard.attach(input) registriert.
 */
(function (global) {
  "use strict";

  // Gruppen für deutsche IPA-Transkription. Diakritika kombinieren sich mit
  // dem vorangehenden Zeichen (z. B. n + ̩ -> n̩, a + ː -> aː).
  var GRUPPEN = [
    {
      titel: "Vokale",
      zeichen: ["a", "e", "i", "o", "u", "ə", "ɐ", "ɛ", "ɪ", "ɔ", "ʊ", "y", "ø", "œ", "ʏ"]
    },
    {
      titel: "Diphthonge",
      zeichen: ["aɪ", "aʊ", "ɔʏ"]
    },
    {
      titel: "Konsonanten",
      zeichen: ["p", "b", "t", "d", "k", "g", "f", "v", "s", "z", "ʃ", "ʒ", "ç", "x", "h", "m", "n", "ŋ", "l", "r", "ʁ", "j"]
    },
    {
      titel: "Affrikaten",
      zeichen: ["ts", "pf", "tʃ", "dʒ"]
    },
    {
      titel: "Diakritika",
      zeichen: [
        { label: "ː", wert: "ː", titel: "Längung" },
        { label: "ˈ", wert: "ˈ", titel: "Hauptbetonung" },
        { label: "ˌ", wert: "ˌ", titel: "Nebenbetonung" },
        { label: "◌̩", wert: "̩", titel: "Silbisch (an Konsonant)" },
        { label: "◌̯", wert: "̯", titel: "Unsilbisch (z. B. ɐ̯)" }
      ]
    },
    {
      titel: "Klammern",
      zeichen: ["[", "]"]
    }
  ];

  var aktivesFeld = null;

  function attach(input) {
    input.addEventListener("focus", function () { aktivesFeld = input; });
    // Beim Mausklick ebenfalls als aktiv merken
    input.addEventListener("click", function () { aktivesFeld = input; });
  }

  function einfuegen(text) {
    var feld = aktivesFeld;
    if (!feld) return;
    feld.focus();
    var start = feld.selectionStart;
    var ende = feld.selectionEnd;
    if (start === null || start === undefined) {
      feld.value += text;
    } else {
      feld.value = feld.value.slice(0, start) + text + feld.value.slice(ende);
      var pos = start + text.length;
      feld.setSelectionRange(pos, pos);
    }
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspace() {
    var feld = aktivesFeld;
    if (!feld) return;
    feld.focus();
    var start = feld.selectionStart;
    var ende = feld.selectionEnd;
    if (start === ende && start > 0) {
      // ggf. ein vollständiges Zeichen inkl. kombinierender Diakritika löschen
      var davor = feld.value.slice(0, start);
      var entfernen = 1;
      // kombinierende Zeichen (U+0300–U+036F) mitnehmen
      while (entfernen < davor.length && /[̀-ͯ]/.test(davor[davor.length - entfernen])) {
        entfernen += 1;
      }
      feld.value = feld.value.slice(0, start - entfernen) + feld.value.slice(ende);
      feld.setSelectionRange(start - entfernen, start - entfernen);
    } else if (start !== ende) {
      feld.value = feld.value.slice(0, start) + feld.value.slice(ende);
      feld.setSelectionRange(start, start);
    }
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function clear() {
    var feld = aktivesFeld;
    if (!feld) return;
    feld.focus();
    feld.value = "";
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function macheTaste(label, wert, titel) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ipa-key";
    b.textContent = label;
    if (titel) b.title = titel;
    b.addEventListener("mousedown", function (e) {
      // mousedown statt click, damit der Fokus im Eingabefeld bleibt
      e.preventDefault();
      einfuegen(wert);
    });
    return b;
  }

  function render(container) {
    container.innerHTML = "";
    container.classList.add("ipa-keyboard");

    GRUPPEN.forEach(function (gruppe) {
      var g = document.createElement("div");
      g.className = "ipa-group";
      var h = document.createElement("div");
      h.className = "ipa-group-title";
      h.textContent = gruppe.titel;
      g.appendChild(h);
      var keys = document.createElement("div");
      keys.className = "ipa-keys";
      gruppe.zeichen.forEach(function (z) {
        if (typeof z === "string") {
          keys.appendChild(macheTaste(z, z, null));
        } else {
          keys.appendChild(macheTaste(z.label, z.wert, z.titel));
        }
      });
      g.appendChild(keys);
      container.appendChild(g);
    });

    // Aktionen
    var aktionen = document.createElement("div");
    aktionen.className = "ipa-group";
    var ah = document.createElement("div");
    ah.className = "ipa-group-title";
    ah.textContent = "Aktionen";
    aktionen.appendChild(ah);
    var akeys = document.createElement("div");
    akeys.className = "ipa-keys";

    var bsp = document.createElement("button");
    bsp.type = "button";
    bsp.className = "ipa-key ipa-key-action";
    bsp.textContent = "← Löschen";
    bsp.addEventListener("mousedown", function (e) { e.preventDefault(); backspace(); });
    akeys.appendChild(bsp);

    var clr = document.createElement("button");
    clr.type = "button";
    clr.className = "ipa-key ipa-key-action";
    clr.textContent = "Clear";
    clr.addEventListener("mousedown", function (e) { e.preventDefault(); clear(); });
    akeys.appendChild(clr);

    aktionen.appendChild(akeys);
    container.appendChild(aktionen);
  }

  global.LT_Keyboard = {
    render: render,
    attach: attach,
    setTarget: function (input) { aktivesFeld = input; }
  };
})(window);
