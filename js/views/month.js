/* ============================================================
   views/month.js
   Monday-first month grid. Each cell is a drop target, shows up to
   four chips, and collapses the rest into "+N more".
   ============================================================ */
window.ORG = window.ORG || {};
ORG.views = ORG.views || {};

(() => {
  const U = ORG.util;
  const MAX_CHIPS = 4;

  ORG.views.month = function(cursor){
    const root = U.el("div", "month");
    root.append(head());
    root.append(grid(cursor));
    return root;
  };

  function head(){
    const h = U.el("div", "month-head");
    U.DOW.forEach(d => h.append(U.el("div", null, d)));
    return h;
  }

  function grid(cursor){
    const g = U.el("div", "month-grid");
    const today = new Date();

    const first    = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridFrom = U.startOfWeek(first);
    const daysIn   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const weeks    = Math.ceil((U.dowMon(first) + daysIn) / 7);

    g.style.gridTemplateRows = `repeat(${weeks},minmax(0,1fr))`;

    for (let i = 0; i < weeks * 7; i++){
      g.append(cell(U.addDays(gridFrom, i), cursor, today));
    }
    return g;
  }

  function cell(d, cursor, today){
    const outside = d.getMonth() !== cursor.getMonth();

    const c = U.el("div", "month-cell"
      + (outside ? " out" : "")
      + (U.dowMon(d) >= 5 ? " weekend" : "")
      + (U.sameDay(d, today) ? " today" : ""));

    const key = U.ymd(d);
    c.dataset.drop = "day";
    c.dataset.date = key;
    c.append(U.el("div", "dnum", String(d.getDate())));

    /* runs first so they line up across the week, then timed (by clock),
       then the rest (by creation) */
    const list = ORG.store.tasksOn(d).sort((a, b) =>
      !!b.endDate - !!a.endDate ||
      (a.start ? 0 : 1) - (b.start ? 0 : 1) ||
      (a.start || "").localeCompare(b.start || "") ||
      a.createdAt - b.createdAt
    );

    const chips = U.el("div", "chips");
    list.slice(0, MAX_CHIPS).forEach(t => chips.append(ORG.ui.chip(t, { day:key })));

    if (list.length > MAX_CHIPS){
      const more = U.el("div", "more", `+${list.length - MAX_CHIPS} more`);
      more.addEventListener("click", e => {
        e.stopPropagation();
        ORG.app.goto(new Date(d), "day");
      });
      chips.append(more);
    }
    c.append(chips);

    c.addEventListener("dblclick", e => {
      if (e.target.closest(".chip") || e.target.closest(".more")) return;
      ORG.app.newTask({ date:U.ymd(d), start:null });
    });

    return c;
  }
})();
