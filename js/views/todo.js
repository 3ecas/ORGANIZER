/* ============================================================
   views/todo.js
   The to-do wall: work with no date yet, plus anything carrying
   a deadline. The same tasks as the Unscheduled pile in the
   sidebar, with room to read them and to lay them out.

   Every other view decides where a card goes — the calendar from
   its date, the board from its list. Here YOU decide: drag a card
   anywhere and it stays. Positions are stored as grid cells rather
   than pixels, so a card is where you left it whatever size the
   window is next time.
   ============================================================ */
window.ORG = window.ORG || {};
ORG.views = ORG.views || {};

(() => {
  const U = ORG.util;

  const CELL_W = 244;
  /* tall enough for the title, the date and three steps of the task list —
     the card is meant to answer "what is this and what's left" on sight */
  const CELL_H = 196;
  const GAP    = 12;
  const PAD    = 16;
  const MAX_STEPS = 3;

  const stepX = CELL_W + GAP;
  const stepY = CELL_H + GAP;

  /** How many cards fit across the pane. At least one, always. */
  function columns(){
    const w = (U.$("#main")?.clientWidth || 900) - PAD * 2;
    return Math.max(1, Math.floor((w + GAP) / stepX));
  }

  /* ============================================================
     PLACEMENT
     ============================================================ */

  /**
   * Give every card a cell. Ones you've placed keep their spot; the rest
   * fill the first free cells in reading order, so a new task always turns
   * up somewhere sensible instead of on top of something.
   */
  function place(tasks, cols){
    const taken = new Set();
    const out = [];
    const loose = [];

    const mark = (cell, span) => ORG.store.cellsOf(cell, span).forEach(c => taken.add(c));
    const free = (cell, span) => ORG.store.cellsOf(cell, span).every(c => !taken.has(c));

    /* pairs of (real task, cell) — never copies of the task, or ticking
       the checkbox would mutate a detached object and appear to do nothing */
    for (const t of tasks){
      if (t.pin){ mark(t.pin, t.span); out.push({ t, cell:t.pin }); }
      else loose.push(t);
    }

    /* first fit, in reading order — a card two cells wide skips a gap it
       can't fit in rather than overlapping its neighbour */
    for (const t of loose.sort(ORG.store.wallOrder)){
      const w = Math.min(t.span.w, cols);
      let cell = null;
      for (let y = 0; !cell; y++){
        for (let x = 0; x <= cols - w; x++){
          const c = { x, y };
          if (free(c, { w, h:t.span.h })){ cell = c; break; }
        }
      }
      mark(cell, t.span);
      out.push({ t, cell });
    }

    return out;
  }

  const px = cell => ({ left: PAD + cell.x * stepX, top: PAD + cell.y * stepY });

  /* ============================================================
     VIEW
     ============================================================ */
  ORG.views.todo = function(){
    const cols = columns();
    const items = place(ORG.store.todoTasks(), cols);

    const root = U.el("div", "todo");
    root.append(bar(items.length, cols));

    const scroll = U.el("div", "todo-scroll");
    const wall = U.el("div", "todo-wall");
    wall.dataset.drop = "wall";

    if (!items.length){
      wall.append(U.el("div", "todo-empty", ORG.store.getQuery()
        ? "Nothing here matches that search."
        : "Nothing waiting.\nTasks with no date, and anything with a deadline, collect here."));
    }

    /* the wall has to be big enough to drag into, not just to hold what's
       already on it — one spare row and column past the furthest card */
    let maxX = cols - 1, maxY = 0;
    for (const { t, cell } of items){
      maxX = Math.max(maxX, cell.x + t.span.w - 1);
      maxY = Math.max(maxY, cell.y + t.span.h - 1);
    }
    wall.style.width  = (PAD * 2 + (maxX + 2) * stepX - GAP) + "px";
    wall.style.height = (PAD * 2 + (maxY + 2) * stepY - GAP) + "px";

    for (const { t, cell } of items) wall.append(card(t, cell));

    scroll.append(wall);
    root.append(scroll);
    return root;
  };

  function bar(count, cols){
    const b = U.el("div", "todo-bar");
    b.append(U.el("span", "todo-count",
      count ? `${count} waiting` : "Nothing waiting"));
    b.append(U.el("span", "todo-hint", "Drag a card anywhere — it stays where you put it"));

    const tidy = U.el("button", "btn sm", "Tidy up");
    tidy.title = "Lay every card out again, soonest deadline first";
    tidy.addEventListener("click", () => ORG.store.tidyPins(cols));
    b.append(tidy);
    return b;
  }

  /* ============================================================
     CARD
     ============================================================ */
  function card(t, cell){
    const n = U.el("div", "tcard" + (t.done ? " done" : ""));
    n.dataset.id = t.id;
    const { left, top } = px(cell);
    n.style.left   = left + "px";
    n.style.top    = top + "px";
    n.style.width  = (t.span.w * stepX - GAP) + "px";
    n.style.height = (t.span.h * stepY - GAP) + "px";

    const stripe = U.el("div", "tcard-stripe");
    ORG.labels.stripe(stripe, ORG.store.colorsOf(t), "to bottom");
    stripe.title = ORG.store.labelName(t);
    n.append(stripe);

    const body = U.el("div", "tcard-body");

    const top_ = U.el("div", "tcard-top");
    top_.append(ORG.ui.check(t));
    const names = U.el("div", "tcard-names");
    names.append(U.el("div", "tcard-title", t.title || "Untitled"));
    if (t.subtitle) names.append(U.el("div", "tcard-sub", t.subtitle));
    top_.append(names);
    body.append(top_);

    /* Where it sits on the calendar, stated rather than implied — this wall
       mixes dated and undated work, so "No date" is information too. */
    const when = U.el("div", "tcard-when" + (t.date ? "" : " none"), ORG.ui.whenText(t, true));
    when.title = t.date ? "Also on the calendar" : "Not on the calendar yet";
    body.append(when);

    /* a taller card has room for more of the list — roughly one row of the
       checklist per 17px of the extra height it gained */
    const list = ORG.ui.miniList(t, MAX_STEPS + (t.span.h - 1) * 11);
    if (list) body.append(list);

    const meta = U.el("div", "tcard-meta");
    const due  = ORG.ui.duePill(t);  if (due)  meta.append(due);
    if (t.files.length){
      const p = U.el("span", "pill files");
      p.append(U.icon(U.PATH.clip, "glyph"), String(t.files.length));
      meta.append(p);
    }
    if (meta.children.length) body.append(meta);
    n.append(body);

    const geom = { stepX, stepY, GAP, PAD, cellW:CELL_W, cellH:CELL_H };

    /* drag the corner to make the card cover more cells */
    const grip = U.el("div", "tcard-grip");
    grip.title = "Drag to resize";
    grip.addEventListener("pointerdown", e => ORG.dnd.beginCardResize(e, t, n, geom));
    n.append(grip);

    ORG.hover.bind(n, t);
    n.addEventListener("pointerdown", e => ORG.dnd.beginPin(e, t, n, geom));
    n.addEventListener("click", e => {
      if (e.target.closest(".check")) return;
      if (!ORG.dnd.moved) ORG.editor.open(t.id);
    });
    return n;
  }
})();
