/* ============================================================
   ui/archive.js
   Finished work, put away.

   Archiving is not deleting: the task, its checklist and its
   attachments all stay in data.json. It just stops
   appearing in the calendar, the board, the wall and search —
   which is the actual problem with a year of finished jobs.

   Deleting from here is the only place that really destroys a
   task, so it asks twice as loudly.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.archive = (() => {
  const U = ORG.util;

  const isOpen = () => !U.$("#archive").hidden;

  /* ============================================================
     OPEN / CLOSE
     ============================================================ */
  function open(){
    U.$("#archive").hidden = false;
    U.$("#arch-scrim").classList.add("on");
    render();
  }

  function close(){
    U.$("#archive").hidden = true;
    U.$("#arch-scrim").classList.remove("on");
  }

  const toggle = () => (isOpen() ? close() : open());

  /* ============================================================
     THE LIST
     ============================================================ */
  function render(){
    if (!isOpen()) return;

    const list = ORG.archive.filtered();
    U.$("#arch-count").textContent =
      list.length ? `${list.length} put away` : "Nothing archived yet";

    const box = U.$("#arch-list");
    box.innerHTML = "";

    if (!list.length){
      box.append(U.el("div", "arch-empty",
        ORG.store.getQuery()
          ? "Nothing archived matches that search."
          : "Tick something complete, then archive it from the card\nor from the Done list on the board."));
      return;
    }

    let heading = "";
    for (const t of list){
      const when = monthOf(t.archivedAt);
      if (when !== heading){
        heading = when;
        box.append(U.el("div", "arch-month", when));
      }
      box.append(row(t));
    }
  }

  /** Archived tasks, respecting the search box so a big archive is findable. */
  function filtered(){
    const q = ORG.store.getQuery();
    const all = ORG.store.archived();
    if (!q) return all;
    return all.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.subtitle.toLowerCase().includes(q) ||
      ORG.store.labelName(t).toLowerCase().includes(q));
  }

  const monthOf = ms => {
    const d = new Date(ms);
    return `${U.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  function row(t){
    const n = U.el("div", "arch-row");

    const stripe = U.el("span", "arch-stripe");
    ORG.labels.stripe(stripe, ORG.store.colorsOf(t), "to bottom");
    n.append(stripe);

    const txt = U.el("div", "arch-txt");
    txt.append(U.el("div", "arch-title", t.title || "Untitled"));

    const meta = U.el("div", "arch-meta");
    meta.append(U.el("span", null, ORG.store.labelName(t)));
    meta.append(U.el("span", "dot", "·"));
    meta.append(U.el("span", null, ORG.spaces.nameOf(t.space)));
    if (t.files.length){
      meta.append(U.el("span", "dot", "·"));
      meta.append(U.el("span", null, `${t.files.length} file${t.files.length === 1 ? "" : "s"}`));
    }
    meta.append(U.el("span", "dot", "·"));
    meta.append(U.el("span", null, U.fmtWhen(t.archivedAt)));
    txt.append(meta);
    n.append(txt);

    const back = U.el("button", "btn sm", "Restore");
    back.title = "Put it back in play";
    back.addEventListener("click", () => { ORG.store.restore(t); render(); });
    n.append(back);

    const kill = U.el("button", "arch-del", "×");
    kill.title = "Delete permanently";
    kill.addEventListener("click", () => {
      const files = t.files.length;
      const msg = `Delete “${t.title || "Untitled"}” for good?\n\n`
        + (files ? `Its ${files} attachment${files === 1 ? "" : "s"} go too.\n\n` : "")
        + `This cannot be undone — Restore puts it back instead.`;
      if (!confirm(msg)) return;
      ORG.store.remove(t.id);
      render();
    });
    n.append(kill);

    return n;
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function init(){
    U.$("#archivebtn").addEventListener("click", toggle);
    U.$("#arch-close").addEventListener("click", close);
    U.$("#arch-scrim").addEventListener("click", close);

    /* the count on the button is the only hint the archive exists */
    U.bus.on("change", () => {
      const n = ORG.store.archivedCount();
      U.$("#arch-n").textContent = n || "";
      render();
    });
  }

  return { init, open, close, toggle, isOpen, render, filtered };
})();
