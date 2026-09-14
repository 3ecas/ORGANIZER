/* ============================================================
   views/year.js
   Twelve mini months. Days carrying work are tinted with that
   day's first task colour; hovering lists what's on. Click a day
   to jump into it, click a month name to open the month.
   ============================================================ */
window.ORG = window.ORG || {};
ORG.views = ORG.views || {};

(() => {
  const U = ORG.util;

  ORG.views.year = function(cursor){
    const root = U.el("div", "year");
    const year = cursor.getFullYear();
    const today = new Date();

    /* Bucket the year's tasks by date once, rather than filtering per day.
       A task running across days lands in every day it covers. */
    const byDate = {};
    const stamp = String(year);
    for (const t of ORG.store.visible()){
      if (!t.date) continue;
      const last = t.endDate && t.endDate > t.date ? t.endDate : t.date;
      for (let d = U.parseYmd(t.date), k = t.date; k <= last; d = U.addDays(d, 1), k = U.ymd(d)){
        if (k.startsWith(stamp)) (byDate[k] ||= []).push(t);
      }
    }

    for (let m = 0; m < 12; m++){
      root.append(miniMonth(year, m, byDate, today));
    }
    return root;
  };

  function miniMonth(year, m, byDate, today){
    const isCurrent = year === today.getFullYear() && m === today.getMonth();
    const card = U.el("div", "mini" + (isCurrent ? " cur" : ""));

    /* title + task count for the month */
    const h = U.el("h4");
    h.append(U.MONTHS[m]);
    /* count tasks, not day-slots — a five-day job is one thing to do */
    const total = new Set(Object.entries(byDate)
      .filter(([k]) => +k.slice(5, 7) === m + 1)
      .flatMap(([, v]) => v.map(t => t.id))).size;
    if (total) h.append(U.el("span", "tot", String(total)));
    h.title = "Open " + U.MONTHS[m];
    h.addEventListener("click", () => ORG.app.goto(new Date(year, m, 1), "month"));
    card.append(h);

    /* day grid */
    const g = U.el("div", "mini-grid");
    U.DOW.forEach(d => g.append(U.el("div", "mini-dw", d[0])));

    const from = U.startOfWeek(new Date(year, m, 1));
    for (let i = 0; i < 42; i++){
      const d = U.addDays(from, i);
      if (d.getMonth() !== m){ g.append(U.el("div", "mini-d out", "")); continue; }
      g.append(dayCell(d, byDate[U.ymd(d)] || [], today));
    }
    card.append(g);
    return card;
  }

  function dayCell(d, list, today){
    const c = U.el("div", "mini-d"
      + (list.length ? " has" : "")
      + (U.sameDay(d, today) ? " today" : ""), String(d.getDate()));

    if (list.length){
      c.style.background = U.hexToRgba(ORG.labels.visible(ORG.store.hexOf(list[0])), .26);
      c.title = list
        .map(t => (t.start ? t.start + "  " : "") + (t.title || "Untitled"))
        .join("\n");
    }

    c.addEventListener("click", () => ORG.app.goto(new Date(d), "day"));
    return c;
  }
})();
