/* ============================================================
   ui/checklist.js
   The task list inside a card — the editable one.

   One list. An entry is either a step or a group, and a group
   holds more of either — as deep as the job actually goes. A plain
   list is just a list with no groups in it, so there is no second
   kind of list to choose between when you make a card.

   A group is never "done" itself — it's as done as everything
   under it, all the way down.

   (ui/chips.js draws the compact, read-and-tick version that
   appears on cards; this is the one you type into.)
   ============================================================ */
window.ORG = window.ORG || {};

ORG.checklist = (() => {
  const U = ORG.util;

  let task = null;
  let box  = null;

  const redraw = () => render(box, task);

  /* ============================================================
     RENDER
     ============================================================ */
  function render(node, t){
    box = node; task = t;
    node.innerHTML = "";

    node.append(header());

    const list = U.el("div", "cl-items");
    list.dataset.drop = "cl-root";
    t.steps.forEach((s, i) => list.append(entryRow(s, i, null, 0)));
    node.append(list);

    node.append(addBox());
    return node;
  }

  /** Progress across every leaf, plus the two things you can add. */
  function header(){
    const { done, total } = ORG.store.progress(task);
    const h = U.el("div", "cl-top");

    const bar = U.el("div", "cl-bar");
    const fill = U.el("i", done && done === total ? "all" : null);
    fill.style.width = (total ? done / total * 100 : 0) + "%";
    bar.append(fill);

    h.append(U.el("span", "cl-count" + (total && done === total ? " all" : ""), `${done}/${total}`));
    h.append(bar);

    const group = U.el("button", "cl-act", "＋ Group");
    group.title = "A folder to put steps in";
    group.addEventListener("click", () => {
      const f = ORG.store.addFolder(task);
      redraw();
      focusRow(f.id, true);
    });
    h.append(group);

    if (done){
      const clear = U.el("button", "cl-act", "Clear done");
      clear.addEventListener("click", () => { ORG.store.clearDoneSteps(task); redraw(); });
      h.append(clear);
    }
    return h;
  }

  const entryRow = (s, index, folder, depth) =>
    s.folder ? folderRow(s, index, folder, depth) : stepRow(s, index, folder);

  /* ---------- a group ---------- */
  function folderRow(f, index, parent, depth){
    const wrap = U.el("div", "cl-folder" + (f.open ? " open" : ""));
    wrap.dataset.id = f.id;

    const head = U.el("div", "cl-item cl-fhead");

    const grip = U.el("span", "cl-grip", "⠿");
    grip.title = "Drag to reorder, or into another group";
    grip.addEventListener("pointerdown", e => beginReorder(e, wrap, f, parent));
    head.append(grip);

    const twist = U.el("button", "cl-twist", "▸");
    twist.title = f.open ? "Fold this group" : "Open this group";
    twist.addEventListener("click", () => {
      ORG.store.updateStep(task, f.id, { open: !f.open });
      redraw();
    });
    head.append(twist);

    head.append(nameField(f, index, parent, true));

    const { done, total } = ORG.store.folderProgress(f);
    head.append(U.el("span", "cl-fcount" + (total && done === total ? " all" : ""),
                     total ? `${done}/${total}` : "empty"));

    /* Two ways to fill a group, because either one may be what you meant:
       another step, or another group inside this one. */
    const sub = U.el("button", "cl-fadd", "⊞");
    sub.title = "Add a group in here";
    sub.addEventListener("click", () => {
      const g = ORG.store.addFolder(task, "", null, f.id);
      if (!f.open) ORG.store.updateStep(task, f.id, { open:true });
      redraw();
      focusRow(g.id, true);
    });
    head.append(sub);

    const add = U.el("button", "cl-fadd", "＋");
    add.title = "Add a step in here";
    add.addEventListener("click", () => {
      const s = ORG.store.addStep(task, "", null, f.id);
      if (!f.open) ORG.store.updateStep(task, f.id, { open:true });
      redraw();
      focusRow(s.id);
    });
    head.append(add);

    head.append(killButton(f, "Remove this group"));
    wrap.append(head);

    if (f.open){
      const kids = U.el("div", "cl-kids");
      kids.dataset.drop = "cl-folder";
      kids.dataset.folder = f.id;
      kids.dataset.depth = depth + 1;
      if (!f.children.length){
        kids.append(U.el("div", "cl-empty", "Nothing in here yet — drag something in, or press ＋"));
      }
      f.children.forEach((c, i) => kids.append(entryRow(c, i, f, depth + 1)));
      wrap.append(kids);
    }
    return wrap;
  }

  /* ---------- a step ---------- */
  function stepRow(s, index, folder){
    const row = U.el("div", "cl-item" + (s.done ? " on" : ""));
    row.dataset.id = s.id;

    const grip = U.el("span", "cl-grip", "⠿");
    grip.title = "Drag to reorder, or into a group";
    grip.addEventListener("pointerdown", e => beginReorder(e, row, s, folder));
    row.append(grip);

    const check = U.el("button", "check" + (s.done ? " on" : ""));
    check.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    check.addEventListener("click", () => {
      ORG.store.updateStep(task, s.id, { done: !s.done });
      redraw();
    });
    row.append(check);

    row.append(nameField(s, index, folder, false));
    row.append(killButton(s, "Delete this step"));
    return row;
  }

  /* ---------- the text of either ---------- */
  function nameField(s, index, folder, isFolder){
    const input = U.el("input", isFolder ? "cl-text cl-fname" : "cl-text");
    input.value = s.text;
    input.spellcheck = false;
    input.placeholder = isFolder ? "Group name" : "Step";

    input.addEventListener("input", () => ORG.store.updateStep(task, s.id, { text:input.value }));

    input.addEventListener("keydown", e => {
      if (e.key === "Enter"){
        e.preventDefault();
        /* Return on a folder heading starts a step inside it; on a step it
           opens the next one below, so a list comes out in one run. */
        const made = isFolder
          ? ORG.store.addStep(task, "", null, s.id)
          : ORG.store.addStep(task, "", index + 1, folder ? folder.id : null);
        if (isFolder && !s.open) ORG.store.updateStep(task, s.id, { open:true });
        redraw();
        focusRow(made.id);
      }
      else if (e.key === "Backspace" && !input.value){
        e.preventDefault();
        const before = previousId(s.id);
        ORG.store.removeStep(task, s.id);
        redraw();
        if (before) focusRow(before, null, true);
      }
      else if (e.key === "Escape") input.blur();
    });

    // an entry typed and then emptied was never really wanted
    input.addEventListener("blur", () => {
      if (!input.value.trim() && !(isFolder && s.children.length)){
        ORG.store.removeStep(task, s.id);
        redraw();
      }
    });
    return input;
  }

  function killButton(s, title){
    const b = U.el("button", "cl-del", "×");
    b.title = title;
    b.addEventListener("click", () => { ORG.store.removeStep(task, s.id); redraw(); });
    return b;
  }

  function addBox(){
    const input = U.el("input", "cl-add");
    input.placeholder = "Add a step…";
    input.spellcheck = false;
    input.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const v = input.value.trim();
      if (!v) return;
      ORG.store.addStep(task, v);
      input.value = "";
      redraw();
      // keep the focus here so a whole list can be typed in one go
      U.$(".cl-add", box)?.focus();
    });
    return input;
  }

  /* ---------- focus helpers ---------- */
  function focusRow(id, selectAll, toEnd){
    const row = box.querySelector(`[data-id="${id}"]`);
    const input = row && row.querySelector(".cl-text");
    if (!input) return;
    input.focus();
    if (selectAll) input.select();
    else if (toEnd) input.setSelectionRange(input.value.length, input.value.length);
  }

  /** The entry above this one, reading the list as it appears on screen. */
  function previousId(id){
    const order = [];
    (function walk(list){
      for (const s of list){
        order.push(s.id);
        if (s.folder && s.open) walk(s.children);
      }
    })(task.steps);
    const i = order.indexOf(id);
    return i > 0 ? order[i - 1] : null;
  }

  /* ============================================================
     REORDERING
     Drag by the grip. A step can land between other steps, or
     inside a folder; a folder only moves among the top level.
     ============================================================ */
  let drag = null;

  function beginReorder(e, node, entry, folder){
    e.preventDefault();
    e.stopPropagation();
    drag = { node, entry, folder, started:false, y0:e.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once:true });
  }

  function onMove(e){
    if (!drag) return;
    if (!drag.started){
      if (Math.abs(e.clientY - drag.y0) < 4) return;
      drag.started = true;
      drag.node.classList.add("dragging");
    }
    mark(e.clientY);
  }

  /** The entries of one container, ignoring the one being dragged. */
  const rowsOf = (container, skip) =>
    [...container.children].filter(n => n !== skip && !n.classList.contains("cl-empty"));

  /** Where in a container the cursor sits. */
  const slot = (rows, y) => {
    const i = rows.findIndex(n => {
      const r = n.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? rows.length : i;
  };

  /** Show where it would land, and remember it for the drop. */
  function mark(y){
    box.querySelectorAll(".over, .into").forEach(n => n.classList.remove("over", "into"));
    drag.target = null;

    /* Inside an open group? Groups sit inside groups, so several can hold
       the cursor at once — take the deepest, which is the one being
       pointed at. A group can't be dropped into its own contents, and
       drag.node contains exactly those, so skip anything within it. */
    let best = null;
    for (const kids of box.querySelectorAll(".cl-kids")){
      if (drag.node.contains(kids)) continue;
      const r = kids.getBoundingClientRect();
      if (y < r.top || y > r.bottom) continue;
      if (!best || +kids.dataset.depth > +best.dataset.depth) best = kids;
    }

    if (best){
      const rows = rowsOf(best, drag.node);
      const i = slot(rows, y);
      best.classList.add("into");
      drag.target = { folderId: best.dataset.folder, index: i };
      if (rows[i]) rows[i].classList.add("over");
      return;
    }

    /* otherwise among the top-level entries */
    const list = box.querySelector(".cl-items");
    const rows = rowsOf(list, drag.node);
    const i = slot(rows, y);
    drag.target = { folderId: null, index: i };
    if (rows[i]) rows[i].classList.add("over");
  }

  function onUp(){
    window.removeEventListener("pointermove", onMove);
    const d = drag; drag = null;
    box.querySelectorAll(".over, .into").forEach(n => n.classList.remove("over", "into"));
    if (!d) return;
    d.node.classList.remove("dragging");
    if (!d.started || !d.target) return;
    ORG.store.moveStep(task, d.entry.id, d.target.index, d.target.folderId);
    redraw();
  }

  return { render };
})();
