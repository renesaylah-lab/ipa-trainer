/* theme.js — Hell/Dunkel-Umschaltung. Manuelle Wahl > System-Präferenz. */
(function () {
  "use strict";
  var KEY = "lt-theme";
  function current() { return document.documentElement.getAttribute("data-theme") || "light"; }
  function set(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", function () { set(current() === "dark" ? "light" : "dark"); });
    // Folgt der System-Präferenz nur, solange keine manuelle Wahl gespeichert ist.
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
        try { if (!localStorage.getItem(KEY)) set(e.matches ? "dark" : "light"); } catch (_) {}
      });
    }
  });
})();
