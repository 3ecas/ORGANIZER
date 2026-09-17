/* ============================================================
   ui/dnd.js
   Pointer-based drag and drop for tasks, plus block resizing.

   Pointer events (rather than HTML5 drag events) are used so the
   same code handles every case identically — sidebar -> calendar,
   day -> day, calendar -> sidebar — and so we can drop on an exact
   15-minute slot instead of a whole element.

   You drag the card itself, not a stand-in. There used to be a small
   ghost pill following the cursor while the real thing sat dimmed
   where it started, which told you less than the card does.

   Drop targets are any element carrying data-drop:
     data-drop="inbox"                  unschedule
     data-drop="day"    data-date=…     put on that day, untimed
     data-drop="time"   data-date=… data-hour=…   that day, at the
                                        x-position across the hour
     data-drop="column" data-col=…      board list, inserted at the y-position

   Whole board lists are dragged by their header instead — see
   beginColumn. Cards on the to-do wall don't use drop targets at
   all; they land wherever you leave them — see beginPin.
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
      grabX: e.clientX - rect.left,     // keep the grab point under the cursor
      grabY: e.clientY - rect.top,
      started: false,
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once:true });
  }

  /**
   * Lift a node out of the page so it can follow the cursor, keeping its
   * exact size and where it started.
   *
   * Fixed, not transformed: the sidebar list and the board columns both
   * clip their overflow, and a merely shifted child would be sliced off at
   * their edge the moment you dragged out of one.
   */
  function lift(node){
    const r = node.getBoundingClientRect();
    node.dataset.carry = node.getAttribute("style") || "";
    node.style.position = "fixed";
    node.style.left   = r.left + "px";
    node.style.top    = r.top + "px";
    node.style.width  = r.width + "px";
    node.style.height = r.height + "px";
    node.style.margin = "0";
    node.classList.add("carrying");
  }

  /** Put it back exactly as it was. A re-render usually replaces it anyway,
      but a cancelled drag has to leave no trace. */
  function land(node){
    node.classList.remove("carrying");
    const had = node.dataset.carry;
    /* restore what was there, or nothing at all — an empty style="" is not
       the same as a node that never had one */
    if (had) node.setAttribute("style", had);
    else node.removeAttribute("style");
    delete node.dataset.carry;
  }

  function onMove(e){
    if (!drag) return;

    if (!drag.started){
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;   // not a drag yet
      drag.started = true;
      moved = true;
      document.body.classList.add("dragging");
      lift(drag.node);
    }

    /* `translate` rather than `transform`, so the wiggle can own `rotate`
       without the two overwriting each other */
    drag.node.style.translate =
      (e.clientX - drag.x0) + "px " + (e.clientY - drag.y0) + "px";

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

  /* ============================================================
     THE TO-DO WALL
     Free placement rather than drop targets: the card follows the
     cursor and lands on whichever cell it ends up nearest. An
     outlined cell shows where that is before you let go.
     ============================================================ */
  let pinDrag = null;

  function beginPin(e, task, node, geom){
    if (e.button !== 0) return;
    if (e.target.closest(".check")) return;

    const r = node.getBoundingClientRect();
    moved = false;
    pinDrag = {
      task, node, geom,
      x0:e.clientX, y0:e.clientY,
      grabX: e.clientX - r.left,      // keep the grab point under the cursor
      grabY: e.clientY - r.top,
      /* the cell it is leaving — whatever it was drawn on, pinned or not,
         so a card it swaps with can take exactly this spot */
      from: cellOfCard(node, geom),
      started:false, cell:null,
    };
    window.addEventListener("pointermove", onPinMove);
    window.addEventListener("pointerup", onPinUp, { once:true });
  }

  function onPinMove(e){
    if (!pinDrag) return;
    const d = pinDrag;

    if (!d.started){
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
      d.started = true;
      moved = true;
      document.body.classList.add("dragging");
      d.node.classList.add("lifted", "carrying");
    }

    const wall = U.$(".todo-wall");
    if (!wall) return;
    const wr = wall.getBoundingClientRect();

    const left = e.clientX - d.grabX - wr.left;
    const top  = e.clientY - d.grabY - wr.top;
    d.node.style.left = left + "px";
    d.node.style.top  = top + "px";

    // nearest cell, never off the top or left edge
    d.cell = {
      x: Math.max(0, Math.round((left - d.geom.PAD) / d.geom.stepX)),
      y: Math.max(0, Math.round((top  - d.geom.PAD) / d.geom.stepY)),
    };
    /* Same-size cards swap, so landing on one is fine. Anything else has
       to find clear ground — growing over a card would hide it. */
    const onto = occupantAt(d.cell, d.node, d.geom);
    const other = onto && ORG.store.byId(onto);
    const sameSize = other &&
      other.span.w === d.task.span.w && other.span.h === d.task.span.h;
    d.blocked = !ORG.store.footprintFree(d.task, d.cell, d.task.span) && !sameSize;

    showCell(wall, d.cell, d.task.span, d.geom, d.blocked);
  }

  /** Which cell a card is drawn on, pinned or auto-placed. */
  function cellOfCard(el, geom){
    return {
      x: Math.max(0, Math.round((parseFloat(el.style.left) - geom.PAD) / geom.stepX)),
      y: Math.max(0, Math.round((parseFloat(el.style.top)  - geom.PAD) / geom.stepY)),
    };
  }

  /** The id of the card already sitting on this cell, if any. */
  function occupantAt(cell, skip, geom){
    const wall = U.$(".todo-wall");
    if (!wall) return null;
    for (const el of wall.querySelectorAll(".tcard")){
      if (el === skip) continue;
      const c = cellOfCard(el, geom);
      if (c.x === cell.x && c.y === cell.y) return el.dataset.id;
    }
    return null;
  }

  /** Outline the footprint a card would take, red when it can't go there. */
  function showCell(wall, cell, span, geom, blocked){
    let g = wall.querySelector(".cellghost");
    if (!g){ g = U.el("div", "cellghost"); wall.append(g); }
    g.classList.toggle("blocked", !!blocked);
    g.style.left   = (geom.PAD + cell.x * geom.stepX) + "px";
    g.style.top    = (geom.PAD + cell.y * geom.stepY) + "px";
    g.style.width  = (span.w * geom.stepX - geom.GAP) + "px";
    g.style.height = (span.h * geom.stepY - geom.GAP) + "px";
  }

  function onPinUp(){
    window.removeEventListener("pointermove", onPinMove);
    const d = pinDrag; pinDrag = null;

    document.body.classList.remove("dragging");
    U.$(".cellghost")?.remove();

    if (!d) return;
    d.node.classList.remove("lifted");
    if (!d.started) return;

    // either way a repaint follows, which puts the card on its cell
    /* a blocked drop just puts the card back — the repaint does that */
    if (d.cell && !d.blocked){
      ORG.store.setPin(d.task, d.cell.x, d.cell.y, d.from,
                       occupantAt(d.cell, d.node, d.geom));
    }
    else U.bus.emit("change");
    clearMoved();
  }

  /* ============================================================
     RESIZING A WALL CARD
     The card grows in whole cells, so the wall stays a grid. It
     stops short of anything already there rather than covering it.
     ============================================================ */
  let sizeDrag = null;

  function beginCardResize(e, task, node, geom){
    if (e.button !== 0) return;
    e.stopPropagation();                 // not a move, and not opening the card
    e.preventDefault();

    const r = node.getBoundingClientRect();
    moved = false;
    sizeDrag = { task, node, geom, left:r.left, top:r.top, span:{ ...task.span } };
    node.classList.add("sizing");
    window.addEventListener("pointermove", onSizeMove);
    window.addEventListener("pointerup", onSizeUp, { once:true });
  }

  function onSizeMove(e){
    if (!sizeDrag) return;
    const d = sizeDrag;
    moved = true;

    const max = ORG.store.MAX_SPAN;
    const w = U.clamp(Math.round((e.clientX - d.left + d.geom.GAP) / d.geom.stepX), 1, max);
    const h = U.clamp(Math.round((e.clientY - d.top  + d.geom.GAP) / d.geom.stepY), 1, max);

    const wall = U.$(".todo-wall");
    const blocked = d.task.pin && !ORG.store.footprintFree(d.task, d.task.pin, { w, h });

    /* Growing over a neighbour would hide it, so the card stops. Say why,
       rather than just not moving — an outline that won't grow reads as a
       broken grip otherwise. */
    if (blocked){
      if (wall) showCell(wall, d.task.pin, { w, h }, d.geom, true);
      return;
    }
    if (wall) wall.querySelector(".cellghost")?.remove();

    if (w === d.span.w && h === d.span.h) return;
    d.span = { w, h };
    d.node.style.width  = (w * d.geom.stepX - d.geom.GAP) + "px";
    d.node.style.height = (h * d.geom.stepY - d.geom.GAP) + "px";
  }

  function onSizeUp(){
    window.removeEventListener("pointermove", onSizeMove);
    const d = sizeDrag; sizeDrag = null;
    U.$(".cellghost")?.remove();
    if (!d) return;
    d.node.classList.remove("sizing");
    ORG.store.setSpan(d.task, d.span.w, d.span.h);
    U.bus.emit("change");                // redraw at the committed size
    clearMoved();
  }

  function onUp(e){
    window.removeEventListener("pointermove", onMove);
    const d = drag; drag = null;

    document.body.classList.remove("dragging");
    U.$$(".dropping").forEach(n => n.classList.remove("dropping"));
    hideDropLine();

    if (!d) return;
    if (!d.started) return;
    land(d.node);

    const target = targetAt(e.clientX, e.clientY);
    if (target) applyDrop(d, target, e);
    clearMoved();
  }

  /**
   * Which lane the pointer is over on the timeline. Free: whatever row you
   * let go on is the row it takes, whether or not anything is already
   * there. Auto-packing only ever places bars you haven't placed.
   */
  function laneAt(y, grabY){
    const body = U.$(".tl-body");
    if (!body) return null;
    const g = ORG.views.tlGeom;
    const top = body.getBoundingClientRect().top;
    return Math.max(0, Math.round((y - grabY - top - 8) / g.LANE_H));
  }

  function applyDrop(d, target, e){
    const t = d.task;
    const kind = target.dataset.drop;

    /* on the timeline, where you drop it vertically is its lane from now on */
    if (kind === "day" || kind === "time"){
      const lane = laneAt(e.clientY, d.grabY);
      if (lane !== null) t.lane = lane;
    }

    if (kind === "inbox"){
      /* Dragging a bar leftward past the calendar lands on the sidebar, and
         taking a job off the schedule without a word reads as the calendar
         losing it. Say so — it's one drag back either way. */
      if (t.date) U.toast(`“${t.title || "Untitled"}” is back in Unscheduled`);
      t.date = null; t.start = null; t.endDate = null;
      t.lane = null;                       // off the timeline, off its row
    }
    else if (kind === "day"){
      // moveTo slides a multi-day run whole, rather than stretching it
      ORG.store.moveTo(t, target.dataset.date);
      t.start = null;
    }
    else if (kind === "time"){
      /* the axis runs left to right now, so where you let go across the
         hour is the start time */
      const rect = target.getBoundingClientRect();
      const hour = +target.dataset.hour || G().dayStart();
      const into = (e.clientX - d.grabX - rect.left) / rect.width;   // 0..1 of an hour
      const mins = G().snap(hour * 60 + into * 60);

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

  /**
   * The drop target under the pointer.
   *
   * elementsFromPoint — plural — and take the first thing in the stack that
   * IS one. The single version returns only the topmost element, which on a
   * busy lane is another bar: it has no data-drop of its own, so letting go
   * anywhere something already sat did nothing at all, and the card just
   * sprang back. Dropping onto occupied ground has to work; that's most of
   * the ground.
   */
  function targetAt(x, y){
    for (const el of document.elementsFromPoint(x, y)){
      const hit = el.closest && el.closest("[data-drop]");
      if (hit) return hit;
    }
    return null;
  }

  /* ============================================================
     STRETCHING A BAR
     Either end of a bar on the timeline. In day view that's the
     start time or the length; in week view it's the first or last
     day of a run.

     Stretching a timed job across days drops its clock: the grid
     draws one day at a time, so "Tuesday 10:00 until Thursday"
     has no honest shape. It says so rather than doing it quietly.
     ============================================================ */
  let stretch = null;

  function beginStretch(e, task, node, side, week){
    if (e.button !== 0) return;
    e.stopPropagation();                  // not a move, and not opening the card
    e.preventDefault();

    const geom = ORG.views.tlGeom;
    stretch = {
      task, node, side, week, geom,
      x0: e.clientX,
      left0: parseFloat(node.style.left),
      w0: parseFloat(node.style.width),
      unit: week ? geom.DAY_W : geom.HOUR_W,
      steps: 0,
    };
    node.classList.add("stretching");
    window.addEventListener("pointermove", onStretchMove);
    window.addEventListener("pointerup", onStretchUp, { once:true });
  }

  function onStretchMove(e){
    if (!stretch) return;
    const d = stretch;
    moved = true;

    /* whole days in week view; quarter hours in day view */
    const raw = (e.clientX - d.x0) / d.unit;
    d.steps = d.week ? Math.round(raw) : Math.round(raw * 4) / 4;

    const px = d.steps * d.unit;
    if (d.side === "e"){
      d.node.style.width = Math.max(d.w0 + px, d.geom.MIN_BAR) + "px";
    } else {
      const w = Math.max(d.w0 - px, d.geom.MIN_BAR);
      d.node.style.left  = (d.left0 + d.w0 - w) + "px";
      d.node.style.width = w + "px";
    }
  }

  function onStretchUp(){
    window.removeEventListener("pointermove", onStretchMove);
    const d = stretch; stretch = null;
    if (!d) return;
    d.node.classList.remove("stretching");

    if (d.steps) d.week ? stretchDays(d) : stretchHours(d);
    U.bus.emit("change");               // redraw at the committed size either way
    clearMoved();
  }

  /** Week view: the first or last day of the run. */
  function stretchDays(d){
    const t = d.task;
    const first = t.date;
    const last  = t.endDate || t.date;

    let from = first, to = last;
    if (d.side === "e") to   = U.ymd(U.addDays(U.parseYmd(last), d.steps));
    else                from = U.ymd(U.addDays(U.parseYmd(first), d.steps));

    if (to < from) return;                       // dragged past itself; leave it
    const spans = to > from;

    if (spans && t.start){
      t.start = null;                            // a run is all-day by definition
      U.toast("Now all day — a run of days has no start time");
    }
    t.date    = from;
    t.endDate = spans ? to : null;
    ORG.store.touch(t);
  }

  /** Day view: the start time or the length. */
  function stretchHours(d){
    const t = d.task;
    if (!t.start) return;                        // an all-day bar fills the row

    const mins = Math.round(d.steps * 60);
    const start = U.parseTime(t.start);

    if (d.side === "e"){
      t.dur = U.clamp(G().snap(t.dur + mins), G().SNAP, 1440 - start);
    } else {
      const moved = U.clamp(G().snap(start + mins), 0, start + t.dur - G().SNAP);
      t.dur   = t.dur + (start - moved);
      t.start = U.fmtMin(moved);
    }
    ORG.store.touch(t);
  }

  const clearMoved = () => setTimeout(() => { moved = false; }, 0);

  return {
    begin, beginStretch, beginColumn, beginPin, beginCardResize,
    /** Click handlers use this to ignore the click fired after a drag. */
    get moved(){ return moved; },
  };
})();
