/* ============================================================
   views/timeline.js
   Day and Week, drawn along a horizontal time axis.

   Time runs left to right; every task is a bar in its own lane,
   stacked down the page only where bars would otherwise collide.
   Drag a bar to move it, drag either end to stretch it.

   This replaced a vertical hour grid. The grid was built for
   appointments — an hour tall, an hour's work — and a project
   that runs for a fortnight has no honest shape in it. A bar has
   both: length says how long, and there's room along it to read
   what the thing actually is.

   Two axes, one renderer:
     day   — hours, left to right, bars placed by clock time
     week  — days, left to right, bars covering whole days
   A bar is two lines tall: the name, then when it is and whatever
   else fits underneath.
   A week's bars are whole days on purpose: at an hour's
   resolution a 90-minute job is fifteen pixels wide, which is
   exactly the unreadable sliver the vertical grid already was.
   Everything a bar says is drawn inside the bar; a short one
   cuts its name short rather than spilling it into the lane.

   A bar keeps its lane. Where it sits vertically is a fact about
   the job, not about what else is on screen that week.
   ============================================================ */
window.ORG = window.ORG || {};
ORG.views = ORG.views || {};

(() => {
  const U = ORG.util;
  const G = () => ORG.grid;

  /* An hour has to be wide enough for a short name to sit inside it —
     "GALP" in a 14:00–15:00 slot is the case that sets this. */
  const HOUR_W   = 132;    // px per hour in day view
  const DAY_W    = 190;    // px per day in week view
  const SPAN_W   = 52;     // px per day in the long timeline
  const SPAN_DAYS = 56;    // eight weeks of it
  const BAR_H    = 52;     // a bar, twice the height it started at
  const LANE_H   = BAR_H + 8;   // its row, with the gap it always had
  const GUTTER   = 0;      // the axis needs no left column; bars carry their names
  const MIN_BAR  = 26;     // a bar never disappears entirely

  /* ============================================================
     THE AXIS
     Both views are "a run of equal slots"; only the unit differs.
     ============================================================ */
  function axis(days, long){
    const week = days.length > 1;
    if (long){
      return {
        week: true, long: true,
        slots: days.map(d => ({ key:U.ymd(d), date:d })),
        slotW: SPAN_W,
        place(t, keys){
          const from = keys.indexOf(t.date);
          if (from === -1) return null;
          const last = t.endDate && keys.indexOf(t.endDate) !== -1
            ? keys.indexOf(t.endDate) : from;
          return { s:from, e:Math.max(last, from) + 1 };
        },
      };
    }
    if (week){
      return {
        week: true,
        slots: days.map(d => ({ key:U.ymd(d), date:d })),
        slotW: DAY_W,
        /** a task's position, measured in days from the first slot */
        place(t, keys){
          const from = keys.indexOf(t.date);
          if (from === -1) return null;
          const last = t.endDate && keys.indexOf(t.endDate) !== -1
            ? keys.indexOf(t.endDate) : from;
          return { s:from, e:Math.max(last, from) + 1 };
        },
      };
    }
    const g = G();
    return {
      week: false,
      slots: Array.from({ length:g.span() }, (_, i) => ({ hour:g.dayStart() + i })),
      slotW: HOUR_W,
      /** minutes past the first drawn hour, in slot units */
      place(t){
        const base = g.dayStart() * 60;
        if (!t.start) return { s:0, e:g.span() };          // all day fills the row
        const s = (U.parseTime(t.start) - base) / 60;
        return { s, e:s + (t.dur || 60) / 60 };
      },
    };
  }

  /* ============================================================
     LANES
     First fit: a bar drops into the topmost lane it doesn't
     collide in, so the view is as short as the work allows.
     ============================================================ */
  function packLanes(items){
    const taken = new Map();          // lane -> bars already on it
    const put = (i, it) => {
      if (!taken.has(i)) taken.set(i, []);
      taken.get(i).push(it);
      it.lane = i;
    };

    /* A lane you chose is a lane you keep — even if something else is
       already there and they overlap. That's the point of choosing. */
    const loose = [];
    for (const it of items){
      if (Number.isFinite(it.t.lane)) put(it.t.lane, it);
      else loose.push(it);
    }

    /* the rest drop into the first lane they don't collide in */
    for (const it of loose.sort((a, b) => a.s - b.s || b.e - a.e)){
      let i = 0;
      for (;; i++){
        const on = taken.get(i);
        if (!on || on.every(o => o.e <= it.s || o.s >= it.e)) break;
      }
      put(i, it);
    }

    return Math.max(1, ...[...taken.keys()].map(i => i + 1), 1);
  }

  /**
   * Whatever lane a bar lands in the first time it's drawn is its lane
   * from then on.
   *
   * Without this the row a job sits on is decided by whatever else happens
   * to be on screen: the same three Tuesday jobs came out on rows 2, 3, 4
   * in the week and 0, 1, 2 in the day, and every change of date reshuffled
   * the lot. Auto-packing is a first guess, not an answer — the same
   * "position, not fact" mistake that the board lists and the labels both
   * had to be cured of.
   *
   * Saved silently: this runs during a render, and asking for another one
   * would loop.
   */
  function pinLanes(items){
    const fresh = items.filter(it => it.t.lane !== it.lane);
    if (!fresh.length) return;
    fresh.forEach(it => { it.t.lane = it.lane; });
    ORG.store.save(true);
  }

  /* ============================================================
     VIEW
     ============================================================ */
  ORG.views.timeGrid = function(days, long){
    const ax = axis(days, long);
    const keys = days.map(U.ymd);
    const today = new Date();

    /* Everything that belongs on this stretch of time. In week view a
       run of days is one bar, so it's gathered once rather than per day. */
    const seen = new Set();
    const items = [];
    for (const d of days){
      for (const t of ORG.store.tasksOn(d)){
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const at = ax.place(t, keys);
        if (at) items.push({ t, ...at });
      }
    }
    const lanes = packLanes(items);
    pinLanes(items);

    const width = ax.slots.length * ax.slotW;
    const root  = U.el("div", "tl" + (ax.week ? " week" : " day") + (ax.long ? " long" : ""));

    root.append(head(ax, today, width));

    const scroll = U.el("div", "tl-scroll");
    const body   = U.el("div", "tl-body");
    body.style.width  = width + "px";
    /* Spare lanes past the last one in use. Without them there's nothing
       under the pointer below the bottom bar, so dropping into a fresh
       lane would land on nothing and quietly do nothing at all. */
    body.style.height = Math.max((lanes + 3) * LANE_H + 16, 240) + "px";

    /* the slot rules, and the drop targets behind the bars */
    ax.slots.forEach((slot, i) => {
      const cell = U.el("div", "tl-slot"
        + (ax.week && U.dowMon(slot.date) >= 5 ? " weekend" : "")
        + (ax.long && U.dowMon(slot.date) === 0 ? " weekstart" : ""));
      cell.style.left  = (i * ax.slotW) + "px";
      cell.style.width = ax.slotW + "px";
      cell.dataset.drop = ax.week ? "day" : "time";
      cell.dataset.date = ax.week ? slot.key : keys[0];
      if (!ax.week) cell.dataset.hour = slot.hour;
      cell.addEventListener("dblclick", e => {
        if (e.target.closest(".tlbar")) return;
        ORG.app.newTask(ax.week
          ? { date:slot.key, start:null }
          : { date:keys[0], start:U.fmtMin(slot.hour * 60) });
      });
      body.append(cell);
    });

    for (const it of items) body.append(bar(it, ax));

    if (!items.length){
      body.append(U.el("div", "tl-empty",
        "Nothing here.\nDouble-click to put something on, or drag it in from the sidebar."));
    }

    body.dataset.lanes = "1";      // marks the lane surface for the drag layer
    scroll.append(body);
    root.append(scroll);

    /* open near now, the way the old grid did */
    requestAnimationFrame(() => {
      if (ax.week) return;
      const h = new Date().getHours() - G().dayStart() - 1;
      if (h > 0) scroll.scrollLeft = h * HOUR_W;
    });

    return root;
  };

  /* ---------- the ruler along the top ---------- */
  function head(ax, today, width){
    const h = U.el("div", "tl-head");
    const rail = U.el("div", "tl-rail");
    rail.style.width = width + "px";

    ax.slots.forEach((slot, i) => {
      const c = U.el("div", "tl-tick" +
        (ax.week && U.sameDay(slot.date, today) ? " today" : ""));
      c.style.left  = (i * ax.slotW) + "px";
      c.style.width = ax.slotW + "px";

      if (ax.long){
        const first = slot.date.getDate() === 1 || i === 0;
        if (first) c.append(U.el("span", "mo", U.MON_SHORT[slot.date.getMonth()]));
        c.append(U.el("span", "dn sm", String(slot.date.getDate())));
        c.title = "Open this day";
        c.addEventListener("click", () => ORG.app.goto(new Date(slot.date), "day"));
      }
      else if (ax.week){
        c.append(U.el("span", "dw", U.DOW[U.dowMon(slot.date)]));
        c.append(U.el("span", "dn", String(slot.date.getDate())));
        c.title = "Open this day";
        c.addEventListener("click", () => ORG.app.goto(new Date(slot.date), "day"));
      } else {
        c.append(U.el("span", "hr", `${String(slot.hour).padStart(2,"0")}:00`));
      }
      rail.append(c);
    });

    h.append(rail);
    return h;
  }

  /* ============================================================
     A BAR
     ============================================================ */
  function bar(it, ax){
    const t = it.t;
    const n = U.el("div", "tlbar" + (t.done ? " done" : ""));
    n.dataset.id = t.id;

    const left = it.s * ax.slotW;
    const w = Math.max((it.e - it.s) * ax.slotW - 4, MIN_BAR);
    n.style.left  = (left + 2) + "px";
    n.style.width = w + "px";
    n.style.top   = (it.lane * LANE_H + 8) + "px";
    ORG.ui.tint(n, t);

    n.append(ORG.ui.check(t));

    /* Two lines: the title owns the first, everything else shares the
       second. Before the bar got taller these all competed for the same
       strip of width and the title lost — which was the whole complaint
       about the vertical grid, just turned on its side. */
    const txt = U.el("div", "tlbar-txt");
    txt.append(U.el("div", "tt", t.title || "Untitled"));

    const line2 = U.el("div", "tlbar-sub");

    /* In week view a bar covers a whole day, so the label is the only clue
       to when — show it wherever there's room. In day view the ruler
       underneath already says, so it needs a longer bar to earn the space. */
    if (w >= (ax.week ? 108 : 150)){
      const when = U.el("span", "tlbar-when", whenLabel(t, ax));
      if (when.textContent) line2.append(when);
    }
    if (t.subtitle && w >= 150) line2.append(U.el("span", "ts", t.subtitle));
    if (w >= 170){
      const due = ORG.ui.duePill(t);  if (due) line2.append(due);
      const clip = ORG.ui.clip(t);    if (clip) line2.append(clip);
    }
    if (line2.children.length) txt.append(line2);
    n.append(txt);

    /* Nothing is drawn outside the bar. A label floating past the end
       reads as a different, empty lane and puts text where another bar
       may already be — what doesn't fit is cut short instead. */

    /* a handle at each end — this is the stretching he wanted */
    for (const side of ["w", "e"]){
      const g = U.el("div", "tlbar-grip " + side);
      g.addEventListener("pointerdown", e => ORG.dnd.beginStretch(e, t, n, side, ax.week));
      n.append(g);
    }

    ORG.hover.bind(n, t);
    n.addEventListener("pointerdown", e => ORG.dnd.begin(e, t, n));
    n.addEventListener("click", e => {
      if (e.target.closest(".check")) return;
      if (!ORG.dnd.moved) ORG.editor.open(t.id);
    });
    return n;
  }

  /** The time on the bar — a clock in day view, a span in week view. */
  function whenLabel(t, ax){
    if (!ax.week){
      if (!t.start) return "all day";
      return `${t.start}–${U.fmtMin(Math.min(U.parseTime(t.start) + t.dur, 1439))}`;
    }
    if (t.endDate) return `${ORG.store.spanDays(t)} days`;
    if (!t.start) return "all day";
    return t.start;
  }

  /* ============================================================
     NOW
     A vertical rule instead of a horizontal one — the axis turned,
     so the marker turned with it.
     ============================================================ */
  ORG.views.drawNow = function(){
    U.$$(".tl-now").forEach(n => n.remove());

    const view = ORG.store.state.settings.view;
    if (view !== "day" && view !== "week") return;

    const body = U.$(".tl-body");
    if (!body) return;

    const now = new Date();
    const g = G();
    const week = U.$(".tl.week");

    let x = null;
    if (week){
      const ticks = [...U.$$(".tl-tick")];
      const i = ticks.findIndex(c => c.classList.contains("today"));
      if (i === -1) return;
      const frac = (now.getHours() * 60 + now.getMinutes()) / 1440;
      x = (i + frac) * DAY_W;
    } else {
      const key = U.$(".tl-slot")?.dataset.date;
      if (key !== U.ymd(now)) return;
      const mins = now.getHours() * 60 + now.getMinutes() - g.dayStart() * 60;
      if (mins < 0 || mins > g.span() * 60) return;
      x = mins / 60 * HOUR_W;
    }

    const line = U.el("div", "tl-now");
    line.style.left = x + "px";
    line.append(U.el("div", "tl-now-label", U.fmtMin(now.getHours() * 60 + now.getMinutes())));
    body.append(line);
  };

  /* geometry the drag layer needs */
  ORG.views.tlGeom = { HOUR_W, DAY_W, SPAN_W, SPAN_DAYS, LANE_H, BAR_H, GUTTER, MIN_BAR };
})();
