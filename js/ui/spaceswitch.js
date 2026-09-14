/* ============================================================
   ui/spaceswitch.js
   The Work / Personal switch at the top of the sidebar.

   Each button normally shows how many tasks are still open in that
   space. While the search box has something in it the number turns
   into "matches over here" instead — so a task can never look lost
   just because it lives in the other space.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.spaceswitch = (() => {
  const U = ORG.util;

  function render(){
    const box = U.$("#spaces");
    box.innerHTML = "";

    const active = ORG.store.space();

    for (const s of ORG.spaces.all()){
      const on = s.id === active;
      const b = U.el("button", "space" + (on ? " on" : ""));
      b.style.setProperty("--space-accent", s.accent);

      const dot = U.el("span", "dot");
      dot.style.background = s.accent;
      b.append(dot);

      b.append(U.el("span", "nm", s.name));
      b.append(count(s, on));

      b.addEventListener("click", () => ORG.store.setSpace(s.id));
      box.append(b);
    }
  }

  function count(s, on){
    const { open, hits } = ORG.store.tally(s.id);

    if (hits !== null){
      const n = U.el("span", "n hit" + (hits ? "" : " zero"), String(hits));
      n.title = `${hits} match${hits === 1 ? "" : "es"} in ${s.name}`;
      return n;
    }

    const n = U.el("span", "n", open ? String(open) : "");
    n.title = `${open} open task${open === 1 ? "" : "s"} in ${s.name}`
            + (on ? "" : "  —  click to switch");
    return n;
  }

  return { render };
})();
