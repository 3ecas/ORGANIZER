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

    /* the board has no date range, so date navigation doesn't apply to it */
    const dated = st.settings.view !== "board";
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
    else {
      const open = ORG.store.boardTasks().filter(t => !t.done).length;
      p.append("Board");
      p.append(U.el("span", "sub", `${open} open`));
    }
  }

  function renderMain(){
    const main = U.$("#main");
    const keepScroll = U.$(".tg-scroll")?.scrollTop;
    const keepPan    = U.$(".tg-pan")?.scrollLeft;

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
    }

    /* keep the scroll position, or open near the current hour first time */
    const sc = U.$(".tg-scroll");
    if (sc){
      sc.scrollTop = keepScroll != null
        ? keepScroll
        : Math.max(0, ORG.grid.minToY(Math.max(ORG.grid.dayStart(), new Date().getHours() - 2) * 60));
    }

    /* and the sideways one, or ticking a task on a wide week would throw
       you back to Monday every time */
    const pan = U.$(".tg-pan");
    if (pan && keepPan != null) pan.scrollLeft = keepPan;

    ORG.views.drawNow();
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  function setView(v){
    ORG.store.state.settings.view = v;
    ORG.store.save();
  }

  /** Board is a toggle — press it again to drop back to the calendar you left. */
  function toggleBoard(){
    const s = ORG.store.state.settings;
    if (s.view === "board") return setView(s.lastDated || "week");
    s.lastDated = s.view;
    setView("board");
  }

  function goto(date, view){
    cursor = date;
    if (view) ORG.store.state.settings.view = view;
    ORG.store.save();
  }

  function step(dir){
    const view = ORG.store.state.settings.view;
    if (view === "day")   cursor = U.addDays(cursor, dir);
    if (view === "week")  cursor = U.addDays(cursor, 7 * dir);
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

    U.$("#boardbtn").addEventListener("click", toggleBoard);

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

    const search = U.$("#search");
    search.addEventListener("input", e => ORG.store.setQuery(e.target.value));
    search.addEventListener("keydown", e => {
      if (e.key === "Escape"){ e.target.value = ""; ORG.store.setQuery(""); e.target.blur(); }
    });
  }

  function wireKeyboard(){
    document.addEventListener("keydown", e => {
      if (e.key === "Escape"){
        // the label dropdown first, the card only if nothing was open
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
      if (e.key === "/")          { e.preventDefault(); U.$("#search").focus(); }
      else if (e.key === "ArrowLeft")  step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (k === "t")         today();
      else if (k === "n")         { e.preventDefault(); U.$("#newtask").click(); }
      else if (k === "a")         { e.preventDefault(); U.$("#quickadd").focus(); }
      else if (k === "s")         { e.preventDefault(); otherSpace(); }
      else if (e.key === "5") toggleBoard();
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
  }

  /* ============================================================
     BOOT
     ============================================================ */
  async function boot(){
    await ORG.files.init();          // picks the disk / browser / memory backend
    await ORG.store.load();          // reads data.json when the server is up
    applyTheme();

    ORG.sidebar.init();
    ORG.editor.init();
    ORG.timer.init();
    ORG.hover.init();
    wireTopbar();
    wireKeyboard();
    wireBanner();
    checkEnvironment();

    U.bus.on("change", render);
    U.bus.on("theme", applyTheme);
    U.bus.on("storage", checkEnvironment);

    if (!ORG.store.storageOK) ORG.store.setSaved("Storage blocked — export!", true);

    render();
    setInterval(() => ORG.views.drawNow(), 30000);
  }

  return { boot, render, goto, step, today, setView, newTask, applyTheme,
           get cursor(){ return cursor; } };
})();

document.addEventListener("DOMContentLoaded", ORG.app.boot);
