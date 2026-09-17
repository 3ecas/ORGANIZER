/* ============================================================
   ui/sidebar.js
   Quick add, the Unscheduled list (tasks with no calendar date),
   the label filters, and the data footer.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.sidebar = (() => {
  const U = ORG.util;

  /** Every task in the space currently on screen, filters aside. The
      counts here are "what's in front of me", not "what exists". */
  const here = () => ORG.store.state.tasks.filter(t => t.space === ORG.store.space());

  /* ============================================================
     UNSCHEDULED LIST
     ============================================================ */
  function renderInbox(){
    const box = U.$("#inbox");
    box.innerHTML = "";

    const items = ORG.store.visible()
      .filter(t => !t.date)
      .sort(sortInbox);

    U.$("#inbox-count").textContent =
      here().filter(t => !t.date && !t.done).length;

    if (!items.length){
      box.append(U.el("div", "empty",
        ORG.store.getQuery()
          ? "No matches here."
          : "Nothing parked.\nAdd tasks you can't schedule yet."));
      return;
    }

    items.forEach(t => box.append(item(t)));
  }

  /** Done last, then by deadline (soonest first), then newest. */
  function sortInbox(a, b){
    if (a.done !== b.done) return a.done - b.done;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return b.createdAt - a.createdAt;
  }

  function item(t){
    const n = U.el("div", "item" + (t.done ? " done" : ""));
    n.dataset.id = t.id;

    const bar = U.el("div", "bar");
    ORG.labels.stripe(bar, ORG.store.colorsOf(t), "to bottom");
    n.append(bar);

    n.append(ORG.ui.check(t));

    const txt = U.el("div", "txt");
    txt.append(U.el("div", "t", t.title || "Untitled"));
    if (t.subtitle) txt.append(U.el("div", "s", t.subtitle));

    const meta = U.el("div", "m");
    meta.append(U.el("span", null, ORG.store.labelName(t)));
    const steps = ORG.ui.stepsPill(t); if (steps) meta.append(steps);
    const due   = ORG.ui.duePill(t);   if (due)   meta.append(due);
    const clip = ORG.ui.clip(t);
    if (clip){
      const w = U.el("span", null);
      w.style.cssText = "display:inline-flex;align-items:center;gap:3px";
      w.append(clip, String(t.files.length));
      meta.append(w);
    }
    txt.append(meta);
    n.append(txt);

    ORG.hover.bind(n, t);
    n.addEventListener("pointerdown", e => ORG.dnd.begin(e, t, n));
    n.addEventListener("click", e => {
      if (e.target.closest(".check")) return;
      if (!ORG.dnd.moved) ORG.editor.open(t.id);
    });
    return n;
  }

  /* ============================================================
     WIRING  (run once)
     ============================================================ */
  function init(){
    const st = () => ORG.store.state;

    U.$("#quickadd").addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const v = e.target.value.trim();
      if (!v) return;
      ORG.store.add({ title:v, label:ORG.editor.lastLabel() });
      e.target.value = "";
    });

    U.$("#hidedone").addEventListener("click", () => {
      st().settings.hideDone = !st().settings.hideDone;
      ORG.store.save();
    });

    U.$("#export").addEventListener("click", () => ORG.backup.exportBundle());
    U.$("#import").addEventListener("click", () => U.$("#backupin").click());
    U.$("#backupin").addEventListener("change", e => {
      if (e.target.files[0]) ORG.backup.importFile(e.target.files[0]);
      e.target.value = "";
    });
  }

  function render(){
    ORG.spaceswitch.render();
    renderInbox();
    /* the labels live in the topbar menu now — it keeps itself current */
    ORG.labels.refreshMenu();
    U.$("#hidedone").classList.toggle("on", ORG.store.state.settings.hideDone);
  }

  return { init, render };
})();
