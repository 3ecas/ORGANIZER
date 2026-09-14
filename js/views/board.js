/* ============================================================
   views/board.js
   Lists of cards, Trello style.

   There is no separate board data — a card and a calendar block
   are the same task object. Drop a card in another list and the
   store updates; the calendar redraws from the same change.
   Clicking a card opens the very same editor the calendar uses.
   ============================================================ */
window.ORG = window.ORG || {};
ORG.views = ORG.views || {};

(() => {
  const U = ORG.util;

  ORG.views.board = function(){
    const root = U.el("div", "board");
    for (const col of ORG.store.columns()) root.append(column(col));
    root.append(addListButton());
    return root;
  };

  /* ============================================================
     LIST
     ============================================================ */
  function column(col){
    const wrap = U.el("div", "col" + (col.done ? " is-done" : ""));
    const cards = ORG.store.cardsIn(col.id);

    wrap.append(head(col, cards.length));

    /* the scrolling area is the drop target, so a card can be dropped
       anywhere in the list rather than only onto another card */
    const body = U.el("div", "col-body");
    body.dataset.drop = "column";
    body.dataset.col  = col.id;

    if (cards.length) cards.forEach(t => body.append(card(t)));
    else body.append(U.el("div", "col-empty", "Nothing here.\nDrag a card over."));

    wrap.append(body);

    const add = U.el("button", "col-add", "+  Add a card");
    add.addEventListener("click", () => {
      const t = ORG.store.add({
        label: ORG.editor.lastLabel(),
        status: col.id,
        done: !!col.done,
        order: cards.length,
      });
      ORG.editor.open(t.id);
    });
    wrap.append(add);

    return wrap;
  }

  function head(col, count){
    const h = U.el("div", "col-head");

    const grip = U.el("span", "col-grip", "⠿");
    grip.title = "Drag to reorder the lists";
    h.append(grip);

    /* the whole header is the handle, not just the grip — dnd.js lets the
       name field and the delete button through so they still work */
    h.addEventListener("pointerdown", e => ORG.dnd.beginColumn(e, col, h.closest(".col")));

    const name = U.el("input");
    name.value = col.name;
    name.spellcheck = false;
    name.title = "Rename this list";
    name.addEventListener("input", () => ORG.store.renameColumn(col.id, name.value));
    name.addEventListener("keydown", e => { if (e.key === "Enter") name.blur(); });
    h.append(name);

    h.append(U.el("span", "n", String(count)));

    const kill = U.el("button", "kill", "×");
    kill.title = "Delete this list";
    kill.addEventListener("click", () => {
      const msg = count
        ? `Delete the list “${col.name}”?\n\nIts ${count} card${count === 1 ? "" : "s"} move to the first list — no tasks are deleted.`
        : `Delete the empty list “${col.name}”?`;
      if (confirm(msg)) ORG.store.removeColumn(col.id);
    });
    h.append(kill);

    return h;
  }

  function addListButton(){
    const b = U.el("button", "col-new", "+  Add another list");
    b.addEventListener("click", () => {
      const col = ORG.store.addColumn("New list");
      // drop straight into renaming it
      setTimeout(() => {
        const input = [...U.$$(".col-head input")].find(i => i.value === col.name);
        if (input){ input.focus(); input.select(); }
      }, 40);
    });
    return b;
  }

  /* ============================================================
     CARD
     ============================================================ */
  function card(t){
    const n = U.el("div", "card" + (t.done ? " done" : ""));
    n.dataset.id = t.id;

    cover(n, t);

    /* the label's colours run along the top of the card — side by side
       here, since this bar is horizontal */
    const bar = U.el("div", "card-bar");
    ORG.labels.stripe(bar, ORG.store.colorsOf(t), "to right");
    bar.title = ORG.store.labelName(t);
    n.append(bar);

    const body = U.el("div", "card-body");

    const top = U.el("div", "card-top");
    top.append(ORG.ui.check(t));

    const names = U.el("div", "card-names");
    names.append(U.el("div", "card-title", t.title || "Untitled"));
    if (t.subtitle) names.append(U.el("div", "card-sub", t.subtitle));
    top.append(names);
    body.append(top);

    const list = steps(t);
    if (list) body.append(list);

    body.append(meta(t));
    n.append(body);

    ORG.hover.bind(n, t);
    n.addEventListener("pointerdown", e => ORG.dnd.begin(e, t, n));
    n.addEventListener("click", e => {
      if (e.target.closest(".check")) return;
      if (!ORG.dnd.moved) ORG.editor.open(t.id);
    });
    return n;
  }

  /** Use the first image attachment as a cover, like Trello does. */
  function cover(node, t){
    const pic = t.files.find(f => ORG.files.kind(f) === "image");
    if (!pic) return;

    ORG.files.url(pic.id).then(url => {
      if (!url) return;
      const img = U.el("img", "card-cover");
      img.alt = pic.name;
      img.onload = () => node.prepend(img);
      img.src = url;
    });
  }

  /* ============================================================
     THE TASK LIST ON A CARD
     The point of the board is seeing what has to happen without
     opening anything, so the steps are here and tickable in place.
     Ticking one is the same edit as ticking it inside the card —
     same step, same object, so both views agree immediately.
     ============================================================ */
  const MAX_STEPS = 6;          // a card is a summary, not the whole brief

  function steps(t){
    if (!t.steps.length) return null;

    const { done, total } = ORG.store.progress(t);
    const all = done === total;
    const box = U.el("div", "card-steps");

    const bar = U.el("div", "cs-bar");
    const fill = U.el("i", all ? "all" : null);
    fill.style.width = (done / total * 100) + "%";
    bar.append(fill);

    const head = U.el("div", "cs-top");
    head.append(bar, U.el("span", "cs-count" + (all ? " all" : ""), `${done}/${total}`));
    box.append(head);

    const { rows, hidden } = visibleSteps(t);
    const items = U.el("div", "cs-items");
    rows.forEach(s => items.append(stepRow(t, s)));
    box.append(items);

    if (hidden){
      const more = U.el("div", "cs-more", `+${hidden} more`);
      more.title = "Open the card for the whole list";
      box.append(more);
    }
    return box;
  }

  /**
   * Which slice of a long list to show. Always in order, and starting at
   * the first thing not done yet — so a card shows where you are and
   * what's next rather than six steps you finished last week.
   */
  function visibleSteps(t){
    if (t.steps.length <= MAX_STEPS) return { rows:t.steps, hidden:0 };
    const next = Math.max(0, t.steps.findIndex(s => !s.done));
    const from = Math.min(next, t.steps.length - MAX_STEPS);
    return { rows:t.steps.slice(from, from + MAX_STEPS), hidden:t.steps.length - MAX_STEPS };
  }

  function stepRow(t, s){
    const row = U.el("div", "cs-item" + (s.done ? " on" : ""));

    /* class "check" on purpose: dnd.js and the card's own click handler
       both skip anything inside one, so ticking a step can't start a drag
       or open the card */
    const box = U.el("button", "check cs-check" + (s.done ? " on" : ""));
    box.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    box.title = s.done ? "Not done after all" : "Mark this step done";
    box.addEventListener("click", e => {
      e.stopPropagation();
      ORG.store.updateStep(t, s.id, { done: !s.done });
    });
    row.append(box);

    row.append(U.el("span", "cs-text", s.text || "Untitled step"));
    return row;
  }

  function meta(t){
    const m = U.el("div", "card-meta");

    /* where it sits on the calendar — the link back to the other views */
    if (t.date){
      const d = U.parseYmd(t.date);
      const when = `${d.getDate()} ${U.MON_SHORT[d.getMonth()]}` + (t.start ? ` · ${t.start}` : "");
      const pill = U.el("span", "pill when");
      pill.append(when);
      pill.title = "On the calendar — click the card to change it";
      m.append(pill);
    }

    /* no steps pill here — the list above already shows the count */
    const due  = ORG.ui.duePill(t);  if (due)  m.append(due);
    const time = ORG.ui.timePill(t); if (time) m.append(time);

    if (t.files.length){
      const p = U.el("span", "pill files");
      p.append(U.icon(U.PATH.clip, "glyph"), String(t.files.length));
      p.title = `${t.files.length} attached file${t.files.length === 1 ? "" : "s"}`;
      m.append(p);
    }

    return m;
  }
})();
