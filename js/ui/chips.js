/* ============================================================
   ui/chips.js
   The three task visuals reused across every view:
     check()  completion box
     chip()   compact row  — month cells, all-day strip, lists
     block()  timed block  — day/week grid
   All of them wire up drag and click-to-open the same way.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.ui = (() => {
  const U = ORG.util;

  /**
   * Paint a surface in a task's label colours: a soft wash of the first
   * one, text shaded to stay legible in both themes, and the label's full
   * set of colours as the stripe down the left edge (--stripe, drawn by a
   * pseudo-element so it can be more than one colour).
   */
  function tint(node, t){
    const colors = ORG.store.colorsOf(t);
    // nudged off the background, so a black or white label still shows
    const hex = ORG.labels.visible(colors[0]);
    node.style.background = U.hexToRgba(hex, U.isLight() ? .15 : .19);
    node.style.color      = U.isLight() ? U.shade(hex, -.45) : U.shade(hex, .45);
    node.style.setProperty("--stripe", ORG.labels.gradient(colors, "to bottom"));
  }

  /* ---------- completion checkbox ---------- */
  function check(t){
    const c = U.el("button", "check" + (t.done ? " on" : ""));
    c.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    c.title = "Mark complete";
    c.addEventListener("click", e => {
      e.stopPropagation();
      // setDone, not a raw flag flip — it also moves the card to the Done list
      ORG.store.setDone(t, !t.done);
    });
    return c;
  }

  /* ---------- due-date pill ---------- */
  function duePill(t){
    if (!t.due || t.done) return null;
    const diff = U.daysBetween(U.ymd(new Date()), t.due);
    const cls = diff < 0 ? " over" : diff <= 2 ? "" : " far";
    const p = U.el("span", "pill due" + cls);
    p.append(U.icon(U.PATH.flag, "glyph"));
    p.append(U.relDay(t.due));
    p.title = "Due " + t.due;
    return p;
  }

  /* ---------- logged-hours pill ---------- */
  function timePill(t){
    const mins = ORG.store.logged(t);
    if (!mins) return null;
    const p = U.el("span", "pill time");
    p.append(U.icon(U.PATH.clock, "glyph"));
    p.append(U.fmtHM(mins));
    p.title = "Time logged";
    return p;
  }

  /** "3/6" checklist progress, shown on cards and in the sidebar. */
  function stepsPill(t){
    const { done, total } = ORG.store.progress(t);
    if (!total) return null;
    const p = U.el("span", "pill steps" + (done === total ? " all" : ""));
    p.append(U.icon("M5 13l4 4L19 7", "glyph"), `${done}/${total}`);
    p.title = `${done} of ${total} steps done`;
    return p;
  }

  /** Small paperclip shown when a task has attachments. */
  function clip(t){
    if (!t.files.length) return null;
    const s = U.icon(U.PATH.clip, "glyph");
    s.style.flex = "0 0 auto";
    return s;
  }

  /* ---------- shared interaction ---------- */
  function wire(node, t){
    node.addEventListener("pointerdown", e => ORG.dnd.begin(e, t, node));
    node.addEventListener("click", () => { if (!ORG.dnd.moved) ORG.editor.open(t.id); });
    ORG.hover.bind(node, t);          // rest on it for a second for the full preview
  }

  /* ============================================================
     CHIP — month cells and the all-day strip
     ============================================================ */
  /**
   * `day` is the cell being drawn, as "YYYY-MM-DD". Pass it and a task
   * running across days gets flattened joins, so the repeats in adjacent
   * cells read as one continuous run rather than several copies.
   */
  function chip(t, { showTime = true, day = null } = {}){
    const n = U.el("div", "chip" + (t.done ? " done" : ""));
    n.dataset.id = t.id;
    tint(n, t);

    if (day && t.endDate){
      if (day !== t.date)    n.classList.add("from");   // carries on from the left
      if (day !== t.endDate) n.classList.add("into");   // carries on to the right
    }

    if (showTime && t.start) n.append(U.el("span", "cm", t.start));
    n.append(U.el("span", "ct", t.title || "Untitled"));
    /* a chip is one line, so the subtitle rides alongside dimmed rather than
       below — it gets clipped first, which is the right order of importance */
    if (t.subtitle) n.append(U.el("span", "cs", t.subtitle));

    const c = clip(t); if (c) n.append(c);
    if (t.due && !t.done && U.daysBetween(U.ymd(new Date()), t.due) < 0){
      const dot = U.el("span");
      dot.style.cssText = "width:5px;height:5px;border-radius:99px;flex:0 0 5px;background:var(--danger)";
      dot.title = "Overdue";
      n.append(dot);
    }

    wire(n, t);
    return n;
  }

  /* ============================================================
     BLOCK — a timed task in the day/week grid
     `it` comes from grid.packColumns(): { t, s, e, col, cols }
     ============================================================ */
  function block(it){
    const t = it.t;
    const G = ORG.grid;

    const top = G.minToY(it.s);
    const h   = Math.max(t.dur / 60 * G.hourPx() - 2, 16);

    const n = U.el("div", "block" + (t.done ? " done" : "") + (h < 32 ? " tiny" : ""));
    n.dataset.id = t.id;
    n.style.top    = top + "px";
    n.style.height = h + "px";
    /* 3px inset each side, so side-by-side blocks sit 6px apart and neither
       one's text ever runs up against the next one's edge */
    n.style.left   = `calc(${(it.col / it.cols) * 100}% + 3px)`;
    n.style.width  = `calc(${(1 / it.cols) * 100}% - 6px)`;
    tint(n, t);

    n.append(U.el("div", "bt", t.title || "Untitled"));
    /* the block has vertical room, so the subtitle gets its own line —
       but only once the block is tall enough to show it without crowding */
    if (t.subtitle && h >= 48) n.append(U.el("div", "bs", t.subtitle));

    const m = U.el("div", "bm");
    m.append(`${t.start}–${U.fmtMin(it.e % 1440)}`);
    const c = clip(t); if (c) m.append(c);

    /* tracked time, glyphed so it can't be misread as part of the range */
    const mins = ORG.store.logged(t);
    if (mins && h >= 32){
      const w = U.el("span");
      w.style.cssText = "display:inline-flex;align-items:center;gap:3px";
      w.append(U.icon(U.PATH.clock, "glyph"), U.fmtHM(mins));
      w.title = "Time logged";
      m.append(w);
    }
    n.append(m);

    const grip = U.el("div", "grip");
    grip.addEventListener("pointerdown", e => ORG.dnd.beginResize(e, t));
    n.append(grip);

    wire(n, t);
    return n;
  }

  return { tint, check, chip, block, duePill, timePill, stepsPill, clip };
})();
