/* ============================================================
   ui/shortcuts.js
   The keys, listed. Press ? to see them.

   The list lives here rather than in app.js so there is one place
   to read: if a key isn't in this table it isn't a shortcut, and
   if it's in this table it had better work.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.shortcuts = (() => {
  const U = ORG.util;

  const KEYS = [
    ["Getting around", [
      ["1  2  3  4", "Day · Week · Month · Year"],
      ["5",          "Board — again to go back"],
      ["6",          "To do wall — again to go back"],
      ["← →",        "Previous / next period"],
      ["T",          "Today"],
      ["S",          "Swap between Work and Personal"],
      ["\\",         "Show or hide the sidebar"],
    ]],
    ["Doing things", [
      ["N",  "New task, straight into its card"],
      ["A",  "Jump to quick-add"],
      ["/",  "Search"],
      ["⌘S", "Export a backup, attachments and all"],
    ]],
    ["Getting out", [
      ["Esc", "Close the card — or just the menu inside it"],
      ["?",   "This list"],
    ]],
  ];

  const isOpen = () => !U.$("#keys").hidden;

  function open(){
    const box = U.$("#keys-body");
    box.innerHTML = "";

    for (const [title, rows] of KEYS){
      box.append(U.el("div", "keys-head", title));
      const table = U.el("div", "keys-table");
      for (const [key, what] of rows){
        const r = U.el("div", "keys-row");
        const k = U.el("div", "keys-k");
        // each chunk becomes its own key cap: "1  2  3  4" is four keys
        key.split(/\s{2,}|\s(?=[←→])/).forEach(part => k.append(U.el("kbd", null, part)));
        r.append(k);
        r.append(U.el("div", "keys-w", what));
        table.append(r);
      }
      box.append(table);
    }

    U.$("#keys").hidden = false;
    U.$("#keys-scrim").classList.add("on");
  }

  function close(){
    U.$("#keys").hidden = true;
    U.$("#keys-scrim").classList.remove("on");
  }

  const toggle = () => (isOpen() ? close() : open());

  function init(){
    U.$("#keys-close").addEventListener("click", close);
    U.$("#keys-scrim").addEventListener("click", close);
    U.$("#keysbtn").addEventListener("click", toggle);
  }

  return { init, open, close, toggle, isOpen };
})();
