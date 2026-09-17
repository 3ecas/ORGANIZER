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

  /** "3/6" checklist progress, shown on cards and in the sidebar. */
  function stepsPill(t){
    const { done, total } = ORG.store.progress(t);
    if (!total) return null;
    const p = U.el("span", "pill steps" + (done === total ? " all" : ""));
    p.append(U.icon("M5 13l4 4L19 7", "glyph"), `${done}/${total}`);
    p.title = `${done} of ${total} steps done`;
    return p;
  }

  /* ============================================================
     THE CHECKLIST ON A CARD
     The compact, tickable version — the board and the to-do wall
     both draw it, so it lives here rather than in either of them.
     (ui/checklist.js is the editable one inside the modal.)
     ============================================================ */

  /**
   * Which slice of a long list to show: always in order, starting at the
   * first thing not done yet, so a card says where you are and what's next
   * rather than showing steps finished last week.
   */
  function stepWindow(t, max){
    if (t.steps.length <= max) return { rows:t.steps, hidden:0 };
    const next = Math.max(0, t.steps.findIndex(s => !s.done));
    const from = Math.min(next, t.steps.length - max);
    return { rows:t.steps.slice(from, from + max), hidden:t.steps.length - max };
  }

  function stepRow(t, s){
    const row = U.el("div", "cs-item" + (s.done ? " on" : ""));

    /* class "check" on purpose: the drag handlers and the card's own click
       handler both skip anything inside one, so ticking a step can't start
       a drag or open the card */
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

  /** Progress bar plus the next few steps. Null when there are none. */
  function miniList(t, max = 6){
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

    const { rows, hidden } = stepWindow(t, max);
    const items = U.el("div", "cs-items");
    rows.forEach(st => items.append(stepRow(t, st)));
    box.append(items);

    if (hidden){
      const more = U.el("div", "cs-more", `+${hidden} more`);
      more.title = "Open the card for the whole list";
      box.append(more);
    }
    return box;
  }

  /**
   * When a task sits on the calendar, in words.
   * `short` trims it for a card; the long form is for the hover preview.
   */
  function whenText(t, short){
    if (!t.date) return short ? "No date" : "Not on the calendar";

    const d = U.parseYmd(t.date);
    const day = short
      ? `${U.DOW[U.dowMon(d)]} ${d.getDate()} ${U.MON_SHORT[d.getMonth()]}`
      : `${U.DOW[U.dowMon(d)]} ${d.getDate()} ${U.MON_SHORT[d.getMonth()]}`;

    if (t.endDate){
      const e = U.parseYmd(t.endDate);
      const span = `${d.getDate()} ${U.MON_SHORT[d.getMonth()]} – ${e.getDate()} ${U.MON_SHORT[e.getMonth()]}`;
      return short ? span : `${span}  ·  ${ORG.store.spanDays(t)} days, all day`;
    }
    if (!t.start) return short ? `${day} · all day` : `${day}  ·  all day`;

    const end = U.fmtMin(Math.min(U.parseTime(t.start) + t.dur, 1439));
    return short ? `${day} · ${t.start}` : `${day}  ·  ${t.start} – ${end}`;
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

  return { tint, check, chip, duePill, stepsPill, clip,
           miniList, whenText };
})();
