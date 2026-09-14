/* ============================================================
   ui/dnd.js
   Pointer-based drag and drop for tasks, plus block resizing.

   Pointer events (rather than HTML5 drag events) are used so the
   same code handles every case identically — sidebar -> calendar,
   day -> day, calendar -> sidebar — and so we can drop on an exact
   15-minute slot instead of a whole element.

   Drop targets are any element carrying data-drop:
     data-drop="inbox"                  unschedule
     data-drop="day"    data-date=…     put on that day, untimed
     data-drop="time"   data-date=…     put on that day at the y-position
     data-drop="column" data-col=…      board list, inserted at the y-position

   Whole board lists are dragged by their header instead — see
   beginColumn near the bottom.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.dnd = (() => {
  const U = ORG.util;
  const G = () => ORG.grid;

  let drag = null;
  let resize = null;
  let moved = false;          // true between a real drag and the click that follows

  /* ============================================================
     MOVE
     ============================================================ */
  function begin(e, task, node){
    if (e.button !== 0) return;
    if (e.target.closest(".check") || e.target.closest("input") || e.target.closest(".grip")) return;

    const rect = node.getBoundingClientRect();
    moved = false;
    drag = {
      task, node,
      x0: e.clientX, y0: e.clientY,
      grabY: e.clientY - rect.top,      // keep the grab point under the cursor
      started: false,
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once:true });
  }

  function onMove(e){
    if (!drag) return;

    if (!drag.started){
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;   // not a drag yet
      drag.started = true;
      moved = true;
      document.body.classList.add("dragging");
      showGhost(drag.task);
      drag.node.style.opacity = ".3";
    }

    const g = U.$("#ghost");
    g.style.left = (e.clientX + 12) + "px";
    g.style.top  = (e.clientY - 10) + "px";

    U.$$(".dropping").forEach(n => n.classList.remove("dropping"));
    const t = targetAt(e.clientX, e.clientY);
    if (t) t.classList.add("dropping");

    // on a board list, show exactly where the card will land
    if (t && t.dataset.drop === "column") showDropLine(t, e.clientY, drag.task.id);
    else hideDropLine();
  }

  /* ============================================================
     BOARD INSERTION LINE
     ============================================================ */
  function cardsOf(column, skipId){
    return [...column.querySelectorAll(".card")].filter(n => n.dataset.id !== skipId);
  }

  /** Index the dragged card would take if dropped at this y. */
  function insertIndex(column, y, skipId){
    const cards = cardsOf(column, skipId);
    for (let i = 0; i < cards.length; i++){
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length;
  }

  function showDropLine(column, y, skipId){
    const line = U.$("#dropline");
    const cards = cardsOf(column, skipId);
    const index = insertIndex(column, y, skipId);
    const rect = column.getBoundingClientRect();

    let top;
    if (!cards.length) top = rect.top + 8;
    else if (index >= cards.length) top = cards[cards.length - 1].getBoundingClientRect().bottom + 3;
    else top = cards[index].getBoundingClientRect().top - 3;

    line.style.left   = (rect.left + 8) + "px";
    line.style.width  = (rect.width - 16) + "px";
    line.style.height = "2px";
    line.style.top    = U.clamp(top, rect.top + 2, rect.bottom - 4) + "px";
    line.classList.add("on");
  }

  const hideDropLine = () => U.$("#dropline").classList.remove("on");

  /* ============================================================
     BOARD LISTS
     A whole list, dragged sideways by its header to reorder the
     board. Kept apart from the card drag above so grabbing a card
     can never pick up its list by accident — the two never run at
     the same time because they start from different elements.

     Nothing about any task changes: list order is only how the
     board reads.
     ============================================================ */
  let colDrag = null;

  function beginColumn(e, col, node){
    if (e.button !== 0 || !node) return;
    if (e.target.closest("input") || e.target.closest(".kill")) return;

    colDrag = { col, node, x0:e.clientX, started:false, index:null };
    window.addEventListener("pointermove", onColumnMove);
    window.addEventListener("pointerup", onColumnUp, { once:true });
  }

  function onColumnMove(e){
    if (!colDrag) return;

    if (!colDrag.started){
      if (Math.abs(e.clientX - colDrag.x0) < 5) return;   // a click, not a drag
      colDrag.started = true;
      moved = true;
      document.body.classList.add("dragging");
      colDrag.node.classList.add("lifted");
    }

    edgeScroll(e.clientX);
    colDrag.index = columnIndexAt(e.clientX, colDrag.node);
    showColumnLine(colDrag.index, colDrag.node);
  }

  const otherColumns = skip => [...U.$$(".board .col")].filter(n => n !== skip);

  /** Where the dragged list would land, by the midpoints of the others. */
  function columnIndexAt(x, skip){
    const cols = otherColumns(skip);
    let i = 0;
    for (const n of cols){
      const r = n.getBoundingClientRect();
      if (x < r.left + r.width / 2) break;
      i++;
    }
    return i;
  }

  function showColumnLine(index, skip){
    const board = U.$(".board");
    if (!board) return;

    const cols = otherColumns(skip);
    const br = board.getBoundingClientRect();
    const ref = (cols[Math.min(index, cols.length - 1)] || skip).getBoundingClientRect();

    let x;
    if (!cols.length) x = br.left + 14;
    else if (index >= cols.length) x = cols[cols.length - 1].getBoundingClientRect().right + 5;
    else x = cols[index].getBoundingClientRect().left - 7;

    const line = U.$("#dropline");
    line.style.left   = U.clamp(x, br.left + 2, br.right - 4) + "px";
    line.style.top    = ref.top + "px";
    line.style.width  = "2px";
    line.style.height = ref.height + "px";
    line.classList.add("on");
  }

  /** Nudge the board sideways near an edge, so a list can be dropped
      somewhere that isn't on screen yet. */
  function edgeScroll(x){
    const board = U.$(".board");
    if (!board) return;
    const r = board.getBoundingClientRect();
    const EDGE = 64;
    if (x < r.left + EDGE)       board.scrollLeft -= 14;
    else if (x > r.right - EDGE) board.scrollLeft += 14;
  }

  function onColumnUp(){
    window.removeEventListener("pointermove", onColumnMove);
    const d = colDrag; colDrag = null;

    document.body.classList.remove("dragging");
    hideDropLine();

    if (!d) return;
    d.node.classList.remove("lifted");
    if (!d.started) return;

    if (d.index !== null) ORG.store.moveColumn(d.col.id, d.index);
    clearMoved();
  }

  function onUp(e){
    window.removeEventListener("pointermove", onMove);
    const d = drag; drag = null;

    document.body.classList.remove("dragging");
    U.$("#ghost").classList.remove("on");
    U.$$(".dropping").forEach(n => n.classList.remove("dropping"));
    hideDropLine();

    if (!d) return;
    d.node.style.opacity = "";
    if (!d.started) return;

    const target = targetAt(e.clientX, e.clientY);
    if (target) applyDrop(d, target, e);
    clearMoved();
  }

  function applyDrop(d, target, e){
    const t = d.task;
    const kind = target.dataset.drop;

    if (kind === "inbox"){
      t.date = null; t.start = null; t.endDate = null;
    }
    else if (kind === "day"){
      // moveTo slides a multi-day run whole, rather than stretching it
      ORG.store.moveTo(t, target.dataset.date);
      t.start = null;
    }
    else if (kind === "time"){
      const rect = target.getBoundingClientRect();
      const mins = G().snap(G().yToMin(e.clientY - d.grabY - rect.top));
      /* giving it a clock time makes it a block, and a block lives on one
         day — say so rather than quietly dropping the other days */
      if (t.endDate) U.toast("Now a timed block, so just the one day");
      t.date    = target.dataset.date;
      t.endDate = null;
      t.start   = U.fmtMin(U.clamp(mins, 0, 1425));
    }
    else if (kind === "column"){
      // moveTask handles the reordering and the done/not-done sync itself
      return ORG.store.moveTask(t, target.dataset.col, insertIndex(target, e.clientY, t.id));
    }

    ORG.store.touch(t);
  }

  function targetAt(x, y){
    const under = document.elementFromPoint(x, y);      // #ghost is pointer-events:none
    return under ? under.closest("[data-drop]") : null;
  }

  function showGhost(task){
    const g = U.$("#ghost");
    const colors = ORG.store.colorsOf(task);
    const hex = ORG.labels.visible(colors[0]);
    g.textContent = task.title || "Untitled";
    g.style.background  = U.hexToRgba(hex, .92);
    g.style.borderColor = U.shade(hex, -.3);
    g.style.color = "#fff";
    g.classList.add("on");
  }

  /* ============================================================
     RESIZE  (bottom grip of a timed block)
     ============================================================ */
  function beginResize(e, task){
    e.stopPropagation();
    e.preventDefault();
    resize = { task, y0:e.clientY, dur0:task.dur };
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp, { once:true });
  }

  function onResizeMove(e){
    if (!resize) return;
    const deltaMin = (e.clientY - resize.y0) / G().hourPx() * 60;
    resize.task.dur = U.clamp(G().snap(resize.dur0 + deltaMin), G().SNAP, 1440);
    U.bus.emit("change");
  }

  function onResizeUp(){
    window.removeEventListener("pointermove", onResizeMove);
    if (resize) ORG.store.touch(resize.task);
    resize = null;
    moved = true;                 // swallow the click that follows the release
    clearMoved();
  }

  const clearMoved = () => setTimeout(() => { moved = false; }, 0);

  return {
    begin, beginResize, beginColumn,
    /** Click handlers use this to ignore the click fired after a drag. */
    get moved(){ return moved; },
  };
})();
