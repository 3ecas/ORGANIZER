/* ============================================================
   ui/hover.js
   The preview that appears after resting the mouse on a task for
   a moment — on a calendar chip, a timed block, a board card or a
   sidebar item. Everything the card holds, without opening it.

   This replaces the browser's own tooltip, which could only show
   plain text and gave no room for a thumbnail or the checklist.

   One popup exists for the whole app and is moved around, rather
   than one per task: there is only ever one mouse.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.hover = (() => {
  const U = ORG.util;

  const DELAY = 1000;          // a full second — it must not fire while you aim
  const EDGE  = 10;            // keep this far from the window edges
  const STEPS = 4;             // checklist lines before "+N more"
  const NOTES = 180;           // characters of the notes to show

  let box = null;              // the single popup element
  let timer = null;
  let shownFor = null;         // task id currently previewed

  /* ============================================================
     SHOW / HIDE
     ============================================================ */

  /** Attach the preview to a node standing for a task. */
  function bind(node, t){
    node.addEventListener("pointerenter", e => {
      if (e.pointerType !== "mouse") return;      // no hover on a trackpad tap
      clearTimeout(timer);
      timer = setTimeout(() => show(node, t), DELAY);
    });
    node.addEventListener("pointerleave", hide);
    node.addEventListener("pointerdown", hide);   // dragging or opening wins
  }

  function show(node, t){
    /* Conditions can change during the second we waited: the task may have
       been deleted, the view repainted, a drag started, the card opened. */
    if (!node.isConnected) return;
    if (document.body.classList.contains("dragging")) return;
    if (ORG.editor.isOpen()) return;
    if (!ORG.store.byId(t.id)) return;

    if (!box){
      box = U.el("div", "hovercard");
      document.body.append(box);
    }

    box.innerHTML = "";
    box.append(build(t));
    shownFor = t.id;

    /* measure with it laid out but invisible, then place and reveal */
    box.classList.add("measuring");
    box.classList.remove("on");
    place(node);
    box.classList.remove("measuring");
    box.classList.add("on");
  }

  function hide(){
    clearTimeout(timer);
    timer = null;
    shownFor = null;
    if (box) box.classList.remove("on");
  }

  /** Right of the task if it fits, otherwise left; nudged to stay on screen. */
  function place(node){
    const r = node.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;

    let left = r.right + EDGE;
    if (left + w > window.innerWidth - EDGE) left = r.left - w - EDGE;
    left = U.clamp(left, EDGE, Math.max(EDGE, window.innerWidth - w - EDGE));

    let top = r.top - 4;
    top = U.clamp(top, EDGE, Math.max(EDGE, window.innerHeight - h - EDGE));

    box.style.left = left + "px";
    box.style.top  = top + "px";
  }

  /* ============================================================
     CONTENT
     ============================================================ */
  function build(t){
    const wrap = U.el("div", "hc");

    /* --- name --- */
    const head = U.el("div", "hc-head");
    const bar = U.el("span", "hc-bar");
    ORG.labels.stripe(bar, ORG.store.colorsOf(t), "to bottom");
    head.append(bar);

    const names = U.el("div", "hc-names");
    names.append(U.el("div", "hc-title", t.title || "Untitled"));
    if (t.subtitle) names.append(U.el("div", "hc-sub", t.subtitle));
    head.append(names);
    wrap.append(head);

    /* --- cover, if there's a picture attached --- */
    const pic = t.files.find(f => ORG.files.kind(f) === "image");
    if (pic){
      const shot = U.el("div", "hc-shot");       // fixed height, so nothing jumps
      ORG.files.url(pic.id).then(url => {
        if (!url) return;
        const img = U.el("img");
        img.alt = pic.name;
        img.onload = () => shot.append(img);
        img.src = url;
      });
      wrap.append(shot);
    }

    /* --- when --- */
    wrap.append(U.el("div", "hc-when", when(t)));

    /* --- the same pills used on the cards --- */
    const pills = U.el("div", "hc-pills");
    const due  = ORG.ui.duePill(t);  if (due)  pills.append(due);
    const time = ORG.ui.timePill(t); if (time) pills.append(time);
    if (t.files.length){
      const p = U.el("span", "pill files");
      p.append(U.icon(U.PATH.clip, "glyph"), String(t.files.length));
      pills.append(p);
    }
    if (pills.children.length) wrap.append(pills);

    /* --- what's left to do --- */
    if (t.steps.length) wrap.append(checklist(t));

    /* --- notes --- */
    if (t.notes.trim()){
      const n = t.notes.trim();
      wrap.append(U.el("div", "hc-notes", n.slice(0, NOTES) + (n.length > NOTES ? "…" : "")));
    }

    /* --- where it lives --- */
    const foot = U.el("div", "hc-foot");
    foot.append(U.el("span", null, ORG.spaces.nameOf(t.space)));
    foot.append(U.el("span", "dot", "·"));
    foot.append(U.el("span", null, ORG.store.columnOf(t).name));
    foot.append(U.el("span", "dot", "·"));
    foot.append(U.el("span", null, ORG.store.labelName(t)));
    wrap.append(foot);

    return wrap;
  }

  function checklist(t){
    const { done, total } = ORG.store.progress(t);
    const box = U.el("div", "hc-steps");

    const bar = U.el("div", "hc-bar-track");
    const fill = U.el("i", done === total ? "all" : null);
    fill.style.width = (done / total * 100) + "%";
    bar.append(fill);

    const top = U.el("div", "hc-steps-top");
    top.append(bar, U.el("span", "hc-count", `${done}/${total}`));
    box.append(top);

    /* same window as the board card: start at the first thing not done */
    const next = Math.max(0, t.steps.findIndex(s => !s.done));
    const from = Math.min(next, Math.max(0, t.steps.length - STEPS));
    for (const s of t.steps.slice(from, from + STEPS)){
      const row = U.el("div", "hc-step" + (s.done ? " on" : ""));
      row.append(U.el("span", "tick", s.done ? "✓" : "○"));
      row.append(U.el("span", "tx", s.text || "Untitled step"));
      box.append(row);
    }
    const hidden = t.steps.length - Math.min(STEPS, t.steps.length - from);
    if (hidden > 0) box.append(U.el("div", "hc-more", `+${hidden} more`));

    return box;
  }

  /** "Mon 14 Sep · 09:30 – 11:30", or the run of days, or unscheduled. */
  function when(t){
    if (!t.date) return "Not on the calendar";

    const d = U.parseYmd(t.date);
    const day = `${U.DOW[U.dowMon(d)]} ${d.getDate()} ${U.MON_SHORT[d.getMonth()]}`;

    if (t.endDate){
      const e = U.parseYmd(t.endDate);
      return `${d.getDate()} ${U.MON_SHORT[d.getMonth()]} – ${e.getDate()} ${U.MON_SHORT[e.getMonth()]}`
           + `  ·  ${ORG.store.spanDays(t)} days, all day`;
    }
    if (!t.start) return `${day}  ·  all day`;

    const end = U.fmtMin(Math.min(U.parseTime(t.start) + t.dur, 1439));
    return `${day}  ·  ${t.start} – ${end}`;
  }

  /* ============================================================
     GLOBAL DISMISSAL
     Anything that moves the page out from under the popup has to
     take it down — it's positioned against a node that may be
     gone or somewhere else by the next frame.
     ============================================================ */
  function init(){
    document.addEventListener("scroll", hide, true);   // capture: any scroller
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    U.bus.on("change", hide);                          // a repaint replaces the node
  }

  return { init, bind, hide, get shownFor(){ return shownFor; } };
})();
