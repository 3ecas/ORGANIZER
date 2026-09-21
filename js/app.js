/* ============================================================
   app.js
   Boot sequence, topbar wiring, keyboard shortcuts and the single
   render pass. Every other module raises bus "change"; this is the
   only thing that listens and repaints.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.app = (() => {
  const U = ORG.util;

  let cursor = new Date();          // the date the calendar is centred on

  /* ============================================================
     RENDER
     ============================================================ */
  function render(){
    const st = ORG.store.state;

    renderPeriod();
    ORG.sidebar.render();
    renderMain();

    U.$$("#views button").forEach(b => b.classList.toggle("on", b.dataset.view === st.settings.view));
    U.$("#boardbtn").classList.toggle("on", st.settings.view === "board");
    U.$("#todobtn").classList.toggle("on", st.settings.view === "todo");
    U.$("#tlbtn").classList.toggle("on", st.settings.view === "timeline");

    /* neither the board nor the wall has a date range, so date navigation
       doesn't apply to either */
    const dated = !["board", "todo"].includes(st.settings.view);
    ["#prev", "#next", "#today"].forEach(sel => {
      const n = U.$(sel);
      n.disabled = !dated;
      n.style.opacity = dated ? "" : ".3";
      n.style.pointerEvents = dated ? "" : "none";
    });
  }

  function renderPeriod(){
    const view = ORG.store.state.settings.view;
    const p = U.$("#period");
    p.innerHTML = "";

    if (view === "day"){
      p.append(`${U.DOW_FULL[U.dowMon(cursor)]} ${cursor.getDate()}`);
      p.append(U.el("span", "sub", `${U.MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`));
    }
    else if (view === "week"){
      const a = U.startOfWeek(cursor), b = U.addDays(a, 6);
      p.append(a.getMonth() === b.getMonth()
        ? `${a.getDate()} – ${b.getDate()} ${U.MON_SHORT[a.getMonth()]}`
        : `${a.getDate()} ${U.MON_SHORT[a.getMonth()]} – ${b.getDate()} ${U.MON_SHORT[b.getMonth()]}`);
      p.append(U.el("span", "sub", String(b.getFullYear())));
    }
    else if (view === "month"){
      p.append(U.MONTHS[cursor.getMonth()]);
      p.append(U.el("span", "sub", String(cursor.getFullYear())));
    }
    else if (view === "year"){
      p.append(String(cursor.getFullYear()));
    }
    else if (view === "board"){
      const open = ORG.store.boardTasks().filter(t => !t.done).length;
      p.append("Board");
      p.append(U.el("span", "sub", `${open} open`));
    }
    else if (view === "timeline"){
      const a = U.startOfWeek(cursor);
      const b = U.addDays(a, ORG.views.tlGeom.SPAN_DAYS - 1);
      p.append(`${a.getDate()} ${U.MON_SHORT[a.getMonth()]} – ${b.getDate()} ${U.MON_SHORT[b.getMonth()]}`);
      p.append(U.el("span", "sub", "8 weeks"));
    }
    else {
      const due = ORG.store.todoTasks().filter(t => t.due && !t.done).length;
      p.append("To do");
      p.append(U.el("span", "sub", due ? `${due} with a deadline` : "no deadlines"));
    }
  }

  function renderMain(){
    const main = U.$("#main");
    const keepScroll = U.$(".tl-scroll")?.scrollLeft;   // the timeline runs sideways
    const keepPan    = U.$(".todo-scroll")?.scrollLeft;

    main.innerHTML = "";

    switch (ORG.store.state.settings.view){
      case "day":
        main.append(ORG.views.timeGrid([new Date(cursor)]));
        break;
      case "week":
        main.append(ORG.views.timeGrid(
          Array.from({ length:7 }, (_, i) => U.addDays(U.startOfWeek(cursor), i))
        ));
        break;
      case "month":
        main.append(ORG.views.month(cursor));
        break;
      case "year":
        main.append(ORG.views.year(cursor));
        break;
      case "board":
        main.append(ORG.views.board());
        break;
      case "todo":
        main.append(ORG.views.todo());
        break;
      case "timeline":
        main.append(ORG.views.timeGrid(
          Array.from({ length:ORG.views.tlGeom.SPAN_DAYS },
                     (_, i) => U.addDays(U.startOfWeek(cursor), i)), true));
        break;
    }

    /* hold the scroll, or ticking a task would throw you back to the
       start of the day every time. timeline.js does the first-open
       scroll itself, so only restore a position we actually had. */
    const sc = U.$(".tl-scroll");
    if (sc && keepScroll != null) sc.scrollLeft = keepScroll;

    const wall = U.$(".todo-scroll");
    if (wall && keepPan != null) wall.scrollLeft = keepPan;

    ORG.views.drawNow();
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  function setView(v){
    ORG.store.state.settings.view = v;
    ORG.store.save();
  }

  /**
   * Board and To do are toggles — press again to drop back to whichever
   * calendar view you came from. `lastDated` only ever remembers a dated
   * view, so bouncing between the two undated ones can't strand you.
   */
  function toggle(view){
    const s = ORG.store.state.settings;
    if (s.view === view) return setView(s.lastDated || "week");
    if (!["board", "todo", "timeline"].includes(s.view)) s.lastDated = s.view;
    setView(view);
  }

  function goto(date, view){
    cursor = date;
    if (view) ORG.store.state.settings.view = view;
    ORG.store.save();
  }

  function step(dir){
    const view = ORG.store.state.settings.view;
    if (view === "day")   cursor = U.addDays(cursor, dir);
    if (view === "week" || view === "timeline") cursor = U.addDays(cursor, 7 * dir);
    if (view === "month") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    if (view === "year")  cursor = new Date(cursor.getFullYear() + dir, cursor.getMonth(), 1);
    render();
  }

  function today(){ cursor = new Date(); render(); }

  /** Create a task and drop straight into its editor. */
  function newTask(patch = {}){
    const t = ORG.store.add({ label: ORG.editor.lastLabel(), ...patch });
    ORG.editor.open(t.id);
    return t;
  }

  /* ============================================================
     THEME
     Also where the space's accent is applied: one colour swap and
     the wordmark, focus rings, Board button and every drop target
     follow, so Work and Personal never look like each other.
     ============================================================ */
  function applyTheme(){
    const s = ORG.store.state.settings;
    const root = document.documentElement;

    root.dataset.theme = s.theme;

    const space = ORG.spaces.byId(s.space) || ORG.spaces.all()[0];
    root.dataset.space = space.id;
    root.style.setProperty("--accent", space.accent);
    root.style.setProperty("--accent-soft", U.hexToRgba(space.accent, .30));
    root.style.setProperty("--accent-fog",  U.hexToRgba(space.accent, .08));
  }

  /** Flip to the other work area. */
  const otherSpace = () => ORG.store.setSpace(ORG.spaces.other(ORG.store.space()).id);

  /** Show or hide the sidebar. Remembered, so it stays how you left it. */
  function toggleSidebar(){
    const s = ORG.store.state.settings;
    s.sidebar = !s.sidebar;
    applySidebar();
    ORG.store.save();
  }

  function applySidebar(){
    const on = ORG.store.state.settings.sidebar !== false;
    U.$("#app").classList.toggle("no-side", !on);
    U.$("#sidebtn").classList.toggle("on", !on);
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function wireTopbar(){
    U.$("#prev").addEventListener("click", () => step(-1));
    U.$("#next").addEventListener("click", () => step(1));
    U.$("#today").addEventListener("click", today);

    U.$("#views").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (b) setView(b.dataset.view);
    });

    U.$("#sidebtn").addEventListener("click", toggleSidebar);
    U.$("#boardbtn").addEventListener("click", () => toggle("board"));
    U.$("#todobtn").addEventListener("click", () => toggle("todo"));
    U.$("#tlbtn").addEventListener("click", () => toggle("timeline"));

    U.$("#newtask").addEventListener("click", () => {
      const view = ORG.store.state.settings.view;
      const now = new Date();
      newTask(["day", "week"].includes(view)
        ? { date:U.ymd(cursor), start:U.fmtMin(ORG.grid.snap(now.getHours() * 60 + now.getMinutes())) }
        : {});
    });

    U.$("#theme").addEventListener("click", () => {
      const s = ORG.store.state.settings;
      s.theme = s.theme === "dark" ? "light" : "dark";
      applyTheme();
      ORG.store.save();
    });

    U.$("#reloadbtn").addEventListener("click", reloadApp);

    const search = U.$("#search");
    search.addEventListener("input", e => ORG.store.setQuery(e.target.value));
    search.addEventListener("keydown", e => {
      if (e.key === "Escape"){ e.target.value = ""; ORG.store.setQuery(""); e.target.blur(); }
    });
  }

  function wireKeyboard(){
    document.addEventListener("keydown", e => {
      if (e.key === "Escape"){
        /* innermost thing first, so Escape always closes exactly one layer */
        if (ORG.shortcuts.isOpen()) return ORG.shortcuts.close();
        if (ORG.archive.isOpen())   return ORG.archive.close();
        if (ORG.editor.dismissLabels()) return;
        if (ORG.editor.isOpen()) ORG.editor.close();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s"){
        e.preventDefault();
        ORG.backup.exportBundle();
        return;
      }

      /* everything below is a bare key — ignore while typing or editing */
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (ORG.editor.isOpen()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (e.key === "?")          { e.preventDefault(); ORG.shortcuts.toggle(); }
      else if (e.key === "\\")   { e.preventDefault(); toggleSidebar(); }
      else if (e.key === "/")     { e.preventDefault(); U.$("#search").focus(); }
      else if (e.key === "ArrowLeft")  step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (k === "t")         today();
      else if (k === "n")         { e.preventDefault(); U.$("#newtask").click(); }
      else if (k === "a")         { e.preventDefault(); U.$("#quickadd").focus(); }
      else if (k === "s")         { e.preventDefault(); otherSpace(); }
      else if (e.key === "5") toggle("board");
      else if (e.key === "6") toggle("todo");
      else if (e.key === "7") toggle("timeline");
      else if ("1234".includes(e.key)) setView(["day", "week", "month", "year"][+e.key - 1]);
    });
  }

  /**
   * Warn when opened straight off disk, where attachments can't persist.
   * Re-run whenever the storage layer reports in, since IndexedDB can
   * finish opening after boot has already carried on.
   */
  let bannerDismissed = false;

  function checkEnvironment(){
    U.$("#filebanner").hidden = bannerDismissed || ORG.files.onDisk;
  }

  function wireBanner(){
    U.$("#banner-x").addEventListener("click", () => {
      bannerDismissed = true;
      U.$("#filebanner").hidden = true;
    });

    U.$("#sync-reload").addEventListener("click", () => location.reload());
    U.$("#sync-export").addEventListener("click", () => ORG.backup.exportBundle());

    /* data.json there but unreadable: nothing is saving, so say so for as
       long as it lasts. It can be broken at load, or go bad while open. */
    const broken = U.$("#brokenbanner");
    broken.hidden = !ORG.store.broken;
    U.bus.on("broken", () => { broken.hidden = false; });
    U.$("#broken-reload").addEventListener("click", () => location.reload());
  }

  /** Reload from disk: whatever the folder holds right now, code and all.
      For when something outside Organizer has changed it — GitHub Desktop,
      a synced drive bringing in the other computer's work.

      Waits for any save still on its way before reloading, or the last thing
      typed would go with the page. Two seconds at most: a save that takes
      longer than that isn't going to finish by waiting. */
  async function reloadApp(){
    for (let i = 0; i < 40 && ORG.store.busy; i++){
      await new Promise(r => setTimeout(r, 50));
    }
    location.reload();
  }

  /**
   * A synced copy of data.json overtook the one this page loaded, so saving
   * has stopped. Not dismissable on purpose: everything typed from here on
   * is going nowhere, and quietly letting that continue is how work is lost.
   */
  function showStale(){
    const s = ORG.store.stale;
    if (!s) return;
    const when = s.savedAt ? U.fmtWhen(s.savedAt) : null;
    U.$("#sync-who").textContent =
      `${s.savedBy} saved this folder${when ? " at " + when : ""} while it was open here. `
      + `Nothing more will be saved on this computer until you reload — `
      + `that picks up their version. Export first if you've changed things here.`;
    U.$("#syncbanner").hidden = false;
  }

  /* ============================================================
     BOOT
     ============================================================ */
  /** Wire one part up. If it breaks, the rest of the app still opens.
      Everything here runs once at start-up, and a throw in any of it used
      to leave a white page with nothing on it and no way to know why —
      far worse than one section being dead. */
  function wire(name, fn){
    try { fn(); }
    catch (err){
      console.error(`${name} failed to start`, err);
      broken.push(name);
    }
  }
  const broken = [];

  async function boot(){
    await ORG.files.init();          // picks the disk / browser / memory backend
    await ORG.store.load();          // reads data.json when the server is up
    applyTheme();

    wire("Sidebar",   () => ORG.sidebar.init());
    wire("Card",      () => ORG.editor.init());
    wire("Previews",  () => ORG.hover.init());
    wire("Labels",    () => ORG.labels.initMenu());
    wire("Archive",   () => ORG.archive.init());
    wire("Shortcuts", () => ORG.shortcuts.init());
    wire("Sidebar",   applySidebar);
    wire("Topbar",    wireTopbar);
    wire("Keyboard",  wireKeyboard);
    wire("Banner",    wireBanner);
    wire("Storage",   checkEnvironment);

    U.bus.on("change", render);
    U.bus.on("theme", applyTheme);
    U.bus.on("storage", checkEnvironment);
    U.bus.on("stale", showStale);

    if (!ORG.store.storageOK) ORG.store.setSaved("Storage blocked — export!", true);

    render();
    U.$("#arch-n").textContent = ORG.store.archivedCount() || "";
    setInterval(() => ORG.views.drawNow(), 30000);

    if (broken.length){
      U.toast(`${[...new Set(broken)].join(", ")} didn't start — everything else works`, 8000);
    }
  }

  return { boot, render, goto, step, today, setView, newTask, applyTheme,
           get cursor(){ return cursor; } };
})();

document.addEventListener("DOMContentLoaded", ORG.app.boot);
