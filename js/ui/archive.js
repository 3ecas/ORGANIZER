/* ============================================================
   ui/archive.js
   Finished work, put away.

   Archiving is not deleting: the task, its checklist and its
   attachments all stay in data.json. It just stops
   appearing in the calendar, the board, the wall and search —
   which is the actual problem with a year of finished jobs.

   One flat list, newest first, with its own search box and a row
   of client filters built from what's actually in here. It has
   its own search rather than borrowing the top bar's, because
   the top bar filters the live views and hunting through finished
   work shouldn't disturb what you were doing.

   Deleting from here is the only place that really destroys a
   task, so it asks twice as loudly.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.archive = (() => {
  const U = ORG.util;

  const NONE = "none";              // the filter chip for work with no client

  let query  = "";
  let picked = new Set();           // label ids; empty means everything

  const isOpen = () => !U.$("#archive").hidden;

  /* ============================================================
     OPEN / CLOSE
     ============================================================ */
  function open(){
    U.$("#archive").hidden = false;
    U.$("#arch-scrim").classList.add("on");
    render();
    setTimeout(() => U.$("#arch-search").focus(), 60);
  }

  function close(){
    U.$("#archive").hidden = true;
    U.$("#arch-scrim").classList.remove("on");
  }

  const toggle = () => (isOpen() ? close() : open());

  /* ============================================================
     WHAT'S IN HERE
     ============================================================ */

  /** Which filter a task answers to. Unlabelled work is its own group.

      Not ORG.store.labelOf: that falls back to the FIRST label so a card
      always has a colour to draw, which would file every unlabelled job
      under whichever client happens to sit at the top of the list. */
  const keyOf = t => (t.label && ORG.store.labelById(t.label)) ? t.label : NONE;

  const nameOfKey = k =>
    k === NONE ? "No label" : (ORG.store.labelById(k)?.name || "No label");

  const colorsOfKey = k =>
    k === NONE ? ["#7d8697"] : (ORG.store.labelById(k)?.colors || ["#7d8697"]);

  /** The clients present in the archive, in the order the labels are kept,
      with "No label" last because it's a leftover rather than a client. */
  function groups(){
    const all = ORG.store.archived();
    const count = new Map();
    for (const t of all){
      const k = keyOf(t);
      count.set(k, (count.get(k) || 0) + 1);
    }
    const out = ORG.store.state.labels
      .filter(l => count.has(l.id))
      .map(l => ({ key:l.id, name:l.name, n:count.get(l.id) }));
    if (count.has(NONE)) out.push({ key:NONE, name:"No label", n:count.get(NONE) });
    return out;
  }

  /** Archived tasks after the search box and the chips have had their say. */
  function filtered(){
    let all = ORG.store.archived();

    if (picked.size) all = all.filter(t => picked.has(keyOf(t)));

    /* Same reading of a query as the top bar — dates, times and words,
       all of which must match. See core/search.js. */
    const terms = ORG.search.parse(query);
    return terms.length ? all.filter(t => ORG.search.test(t, terms)) : all;
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render(){
    if (!isOpen()) return;

    const all  = ORG.store.archived();
    const list = filtered();

    U.$("#arch-count").textContent =
      !all.length            ? "Nothing archived yet"
      : list.length === all.length ? `${all.length} put away`
      : `${list.length} of ${all.length}`;

    U.$("#arch-clear").hidden = !query;
    renderFilters();

    const box = U.$("#arch-list");
    box.innerHTML = "";

    if (!list.length){
      box.append(U.el("div", "arch-empty",
        all.length
          ? "Nothing in the archive matches that."
          : "Tick something complete, then archive it from the card\nor from the Done list on the board."));
      return;
    }

    for (const t of list) box.append(row(t));
  }

  /** One chip per client in the archive, plus All. */
  function renderFilters(){
    const bar = U.$("#arch-filters");
    bar.innerHTML = "";

    const list = groups();
    if (list.length < 2){ bar.hidden = true; return; }   // nothing to choose between
    bar.hidden = false;

    const all = U.el("button", "fchip" + (picked.size ? "" : " on"), "All");
    all.addEventListener("click", () => { picked.clear(); render(); });
    bar.append(all);

    for (const g of list){
      const chip = U.el("button", "fchip" + (picked.has(g.key) ? " on" : "")
                                 + (g.key === NONE ? " bare" : ""));
      const dot = U.el("span", "fchip-dot");
      ORG.labels.stripe(dot, colorsOfKey(g.key), "to bottom right");
      chip.append(dot);
      chip.append(U.el("span", "fchip-name", g.name));
      chip.append(U.el("span", "fchip-n", String(g.n)));

      /* Toggling, not switching: two clients at once is an ordinary
         thing to want, and clicking the last one off shows everything. */
      chip.addEventListener("click", () => {
        picked.has(g.key) ? picked.delete(g.key) : picked.add(g.key);
        render();
      });
      bar.append(chip);
    }
  }

  function row(t){
    const n = U.el("div", "arch-row");

    const stripe = U.el("span", "arch-stripe");
    ORG.labels.stripe(stripe, colorsOfKey(keyOf(t)), "to bottom");
    n.append(stripe);

    const txt = U.el("div", "arch-txt");
    txt.append(U.el("div", "arch-title", t.title || "Untitled"));

    const meta = U.el("div", "arch-meta");
    meta.append(U.el("span", null, nameOfKey(keyOf(t))));
    meta.append(U.el("span", "dot", "·"));
    meta.append(U.el("span", null, ORG.spaces.nameOf(t.space)));

    const { total } = ORG.store.progress(t);
    if (total){
      meta.append(U.el("span", "dot", "·"));
      meta.append(U.el("span", null, `${total} step${total === 1 ? "" : "s"}`));
    }
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

    const search = U.$("#arch-search");
    search.addEventListener("input", e => { query = e.target.value; render(); });
    search.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      /* Escape clears the box first and only closes the sheet once it's
         empty, so a search is never one key away from losing the sheet. */
      e.stopPropagation();
      if (query){ query = ""; search.value = ""; render(); }
      else close();
    });

    U.$("#arch-clear").addEventListener("click", () => {
      query = ""; search.value = ""; render(); search.focus();
    });

    /* the count on the button is the only hint the archive exists */
    U.bus.on("change", () => {
      const n = ORG.store.archivedCount();
      U.$("#arch-n").textContent = n || "";
      render();
    });
  }

  return { init, open, close, toggle, isOpen, render, filtered };
})();
