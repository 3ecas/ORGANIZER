/* ============================================================
   views/day-week.js
   The timeline grid. Day view is the same renderer with a single
   column, so both share one code path.

   Rows:  header with the dates
          all-day strip (dated tasks with no set time)
          scrolling hour grid

   Column widths are worked out FIRST, before anything is drawn.
   A day with overlapping work needs its blocks side by side, and
   splitting a narrow column between them squeezes every one of
   them — so instead the column itself gets wider and the whole
   grid pans sideways. The three rows all have to agree on those
   widths or the header stops lining up with the grid, which is
   why they're measured once up front and handed to each row.
   ============================================================ */
window.ORG = window.ORG || {};
ORG.views = ORG.views || {};

(() => {
  const U = ORG.util;
  const G = () => ORG.grid;

  const MIN_LANE  = 108;    // px one block needs before its title starts to clip
  const MIN_DAY   = 124;    // narrowest a day column is ever drawn

  /* What the columns don't get to use. All three come out of the pane
     before the days are measured, or a plain week picks up a few pixels
     of overflow and a horizontal scrollbar it has no reason to have. */
  const GUTTER    = 52;     // the hour-label column
  const PAD       = 10;     // the rows' padding-right
  const SCROLLBAR = 10;     // the hour grid's own vertical scrollbar

  /* ============================================================
     MEASURE
     ============================================================ */

  /** Pack every day's blocks and note how many lanes each day needs. */
  function layout(days){
    return days.map(d => {
      const items = G().packColumns(
        ORG.store.tasksOn(d)
          .filter(t => t.start)
          .map(t => {
            const s = U.parseTime(t.start);
            return { t, s, e: s + t.dur, col:0, cols:1 };
          })
      );
      return { d, key:U.ymd(d), items, lanes:G().laneCount(items) };
    });
  }

  /**
   * Give every day a width in pixels.
   *
   * Days share the pane evenly until one of them needs more room than its
   * share — then that one takes what it needs and the week gets wider than
   * the pane, which is what .tg-pan scrolls. Integers throughout, so the
   * even case adds up to at most the space available and a plain week
   * never gains a scrollbar it doesn't need.
   */
  function measure(cols){
    const pane = U.$("#main")?.clientWidth || 1000;
    const room = Math.max(280, pane - GUTTER - PAD - SCROLLBAR);
    const even = Math.max(MIN_DAY, Math.floor(room / cols.length));
    cols.forEach(c => { c.w = Math.max(even, c.lanes * MIN_LANE); });
    return cols;
  }

  /** Every column in every row is sized the same way, or they'd drift apart. */
  const size = (node, c) => { node.style.flex = `0 0 ${c.w}px`; return node; };

  /* ============================================================
     HEADER
     ============================================================ */
  function header(cols, today){
    const head = U.el("div", "tg-head");
    head.append(U.el("div", "tg-gutter"));

    for (const c of cols){
      const h = U.el("div", "tg-col-head" + (U.sameDay(c.d, today) ? " today" : ""));
      h.append(U.el("div", "dw", U.DOW[U.dowMon(c.d)]));
      h.append(U.el("div", "dn", String(c.d.getDate())));
      h.title = "Open this day";
      h.addEventListener("click", () => ORG.app.goto(new Date(c.d), "day"));
      head.append(size(h, c));
    }
    return head;
  }

  /* ============================================================
     ALL-DAY STRIP
     ============================================================ */
  function allDayStrip(cols){
    const strip = U.el("div", "allday");
    strip.append(U.el("div", "allday-label", "All day"));

    for (const c of cols){
      const col = U.el("div", "allday-col");
      col.dataset.drop = "day";
      col.dataset.date = c.key;

      /* runs first, so a job crossing the week keeps the same row across
         the columns instead of jumping up and down as neighbours change */
      ORG.store.tasksOn(c.d)
        .filter(t => !t.start)
        .sort((a, b) =>
          a.done - b.done ||
          !!b.endDate - !!a.endDate ||
          (a.date || "").localeCompare(b.date || "") ||
          a.createdAt - b.createdAt)
        .forEach(t => col.append(ORG.ui.chip(t, { showTime:false, day:c.key })));

      col.addEventListener("dblclick", e => {
        if (e.target.closest(".chip")) return;
        ORG.app.newTask({ date:c.key, start:null });
      });

      strip.append(size(col, c));
    }
    return strip;
  }

  /* ============================================================
     HOUR GRID
     ============================================================ */
  function hourGrid(cols){
    const g = G();
    const scroll = U.el("div", "tg-scroll");
    const body   = U.el("div", "tg-body");

    /* hour labels down the left edge */
    const hours = U.el("div", "hours");
    for (let h = g.dayStart(); h <= g.dayEnd(); h++){
      const mark = U.el("div", "hour-mark");
      mark.append(U.el("span", null, `${String(h).padStart(2,"0")}:00`));
      hours.append(mark);
    }
    body.append(hours);

    const span = g.span();

    for (const c of cols){
      const col = U.el("div", "daycol" + (U.dowMon(c.d) >= 5 ? " weekend" : ""));
      col.style.height = (span * g.hourPx()) + "px";
      col.dataset.drop = "time";
      col.dataset.date = c.key;

      /* rules: solid on the hour, faint on the half hour */
      for (let h = 0; h <= span; h++){
        const line = U.el("div", "gridline");
        line.style.top = (h * g.hourPx()) + "px";
        col.append(line);
        if (h < span){
          const half = U.el("div", "gridline half");
          half.style.top = ((h + .5) * g.hourPx()) + "px";
          col.append(half);
        }
      }

      /* already packed into lanes by layout() above */
      c.items.forEach(it => col.append(ORG.ui.block(it)));

      /* double-click empty space -> new task starting right there */
      col.addEventListener("dblclick", e => {
        if (e.target.closest(".block")) return;
        const y = e.clientY - col.getBoundingClientRect().top;
        const mins = g.snap(g.yToMin(y));
        ORG.app.newTask({ date:c.key, start:U.fmtMin(U.clamp(mins, 0, 1425)) });
      });

      body.append(size(col, c));
    }

    scroll.append(body);
    return scroll;
  }

  /* ============================================================
     PUBLIC
     ============================================================ */
  ORG.views.timeGrid = function(days){
    const today = new Date();
    const cols = measure(layout(days));

    const root = U.el("div", "tg");
    const pan  = U.el("div", "tg-pan");      // scrolls all three rows together
    const grid = U.el("div", "tg-cols");

    grid.append(header(cols, today));
    grid.append(allDayStrip(cols));
    grid.append(hourGrid(cols));

    pan.append(grid);
    root.append(pan);
    return root;
  };

  /** Red "now" rule. Redrawn on a timer without a full re-render. */
  ORG.views.drawNow = function(){
    const g = G();
    U.$$(".nowline").forEach(n => n.remove());

    const view = ORG.store.state.settings.view;
    if (view !== "day" && view !== "week") return;

    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < g.dayStart() * 60 || mins > (g.dayEnd() + 1) * 60) return;

    const key = U.ymd(now);
    U.$$(".daycol").forEach(col => {
      if (col.dataset.date !== key) return;
      const line = U.el("div", "nowline");
      line.style.top = g.minToY(mins) + "px";
      line.append(U.el("div", "nowlabel", U.fmtMin(mins)));
      col.append(line);
    });
  };
})();
