/* ============================================================
   ui/cardpanel.js
   The working side of a card: Notes, Task list and Files, as
   three tabs down the right-hand pane.

   Each tab gets the whole pane rather than a slice of it, which
   is the point: notes get room to actually write in, a nested
   task list gets room to be read, and a file preview gets room
   to be looked at instead of squinted at.

   The tab bar carries a count on each one — "3/8", "2" — so you
   can see what's in the other two without going there. That is
   the usual complaint about tabs, and it's cheap to answer.

   A card always opens on the FIRST tab, so opening one is the same
   move every time. Which tab that is, is the order — drag them.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.cardpanel = (() => {
  const U = ORG.util;

  const ORDER = ["steps", "notes", "files"];      // the shipping order

  const TABS = {
    notes: { name:"Notes", body:notesBody,
             count: t => t.notes.trim() ? "•" : "" },
    steps: { name:"Task list", body:stepsBody, count(t){
               const { done, total } = ORG.store.progress(t);
               return total ? `${done}/${total}` : "";
             } },
    files: { name:"Files", body:filesBody,
             count: t => t.files.length ? String(t.files.length) : "" },
  };

  let task = null;

  /* ---------- what the settings remember ---------- */
  function order(){
    const saved = ORG.store.state.settings.cardOrder;
    const ok = Array.isArray(saved) && ORDER.every(k => saved.includes(k));
    return ok ? saved.filter(k => TABS[k]) : [...ORDER];
  }

  /* Which tab this card is showing. Deliberately NOT saved: a card opens
     on the first tab every time, so there's no guessing what you'll get. */
  let showing = null;
  const reset = () => { showing = null; };

  const current = () => (TABS[showing] ? showing : order()[0]);

  function show(key){
    showing = key;
    ORG.editor.refreshPanel();
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render(node, t){
    task = t;
    node.innerHTML = "";

    const key = current();
    node.append(tabBar(key));

    const pane = U.el("div", "tabpane");
    pane.dataset.pane = key;
    TABS[key].body(pane);
    node.append(pane);

    /* Only now is the pane in the document. The file strip finds its boxes
       by id, so filling it any earlier searches a page they aren't on yet
       and quietly draws nothing. */
    ORG.editor.refreshFiles();
    return node;
  }

  function tabBar(key){
    const bar = U.el("div", "tabs");
    for (const k of order()){
      const def = TABS[k];
      const tab = U.el("button", "tab" + (k === key ? " on" : ""));
      tab.dataset.tab = k;

      const grip = U.el("span", "tab-grip", "⠿");
      grip.title = "Drag to reorder — applies to every card";
      grip.addEventListener("pointerdown", e => beginReorder(e, tab, k));
      tab.append(grip);

      tab.append(U.el("span", "tab-name", def.name));

      const n = def.count(task);
      if (n) tab.append(U.el("span", "tab-n" + (n === "•" ? " dot" : ""), n));

      tab.addEventListener("click", () => { if (k !== current()) show(k); });
      bar.append(tab);
    }
    return bar;
  }

  /* ============================================================
     THE THREE PANES
     ============================================================ */
  function notesBody(pane){
    pane.classList.add("pane-notes");
    const ta = U.el("textarea", "input notes-full");
    ta.id = "m-notes";
    ta.placeholder = "Brief, feedback, references, what changed today…";
    ta.value = task.notes;
    ta.addEventListener("input", () => ORG.editor.writeNotes(ta.value));
    pane.append(ta);
  }

  function stepsBody(pane){
    pane.classList.add("pane-steps");
    const cl = U.el("div", "cl");
    cl.id = "m-steps";
    pane.append(cl);
    ORG.checklist.render(cl, task);
  }

  function filesBody(pane){
    pane.classList.add("pane-files");

    const head = U.el("div", "files-head");
    head.append(U.el("span", "fsize",
      task.files.length ? U.bytes(task.files.reduce((a, f) => a + f.size, 0)) : "Nothing attached yet"));
    head.append(U.el("div", "spacer"));
    const add = U.el("button", "btn sm", "Attach");
    add.addEventListener("click", () => U.$("#filein").click());
    head.append(add);
    pane.append(head);

    /* With the whole pane to play with, an empty Files tab can say so
       properly and be the drop target itself. */
    if (!task.files.length){
      const empty = U.el("div", "files-empty");
      empty.append(U.el("div", "fe-mark", "＋"));
      empty.append(U.el("div", "fe-say", "Drag files in from Finder"));
      empty.append(U.el("div", "fe-sub", "or paste a screenshot, or press Attach"));
      empty.addEventListener("click", () => U.$("#filein").click());
      pane.append(empty);
      return;
    }

    const strip = U.el("div", "filestrip");
    strip.id = "filestrip";
    pane.append(strip);

    const preview = U.el("div", "preview");
    preview.id = "preview";
    pane.append(preview);
  }

  /* ============================================================
     REORDERING THE TABS
     One order for every card — it's a preference about how you
     read a project, not a fact about any one of them.
     ============================================================ */
  let drag = null;

  function beginReorder(e, node, key){
    e.preventDefault();
    e.stopPropagation();
    drag = { node, key, started:false, x0:e.clientX };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once:true });
  }

  function onMove(e){
    if (!drag) return;
    if (!drag.started){
      if (Math.abs(e.clientX - drag.x0) < 4) return;
      drag.started = true;
      drag.node.classList.add("moving");
    }
    const bar = drag.node.parentElement;
    const others = [...bar.children].filter(n => n !== drag.node);
    bar.querySelectorAll(".over").forEach(n => n.classList.remove("over"));

    /* a row, so it's the horizontal midpoint that decides */
    const i = others.findIndex(n => {
      const r = n.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2;
    });
    drag.index = i === -1 ? others.length : i;
    if (others[i]) others[i].classList.add("over");
  }

  function onUp(){
    window.removeEventListener("pointermove", onMove);
    const d = drag; drag = null;
    U.$("#m-stack")?.querySelectorAll(".over").forEach(n => n.classList.remove("over"));
    if (!d) return;
    d.node.classList.remove("moving");
    if (!d.started || d.index == null) return;

    const next = order().filter(k => k !== d.key);
    next.splice(U.clamp(d.index, 0, next.length), 0, d.key);
    ORG.store.state.settings.cardOrder = next;
    ORG.store.save(true);
    ORG.editor.refreshPanel();
  }

  return { render, order, show, current, reset };
})();
