/* ============================================================
   ui/timer.js
   Hours spent on a task. Two ways in:
     - a live stopwatch (one task at a time), and
     - manual "+15m / +30m / +1h" buttons.

   The stopwatch stores only a start timestamp in state, so closing
   the tab mid-session doesn't lose the time — it keeps counting and
   is still there when the page is reopened.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.timer = (() => {
  const U = ORG.util;
  const S = () => ORG.store.state;

  /* ============================================================
     QUERIES
     ============================================================ */
  const running     = () => S().timer;
  const isRunning   = id => !!S().timer && S().timer.taskId === id;
  const elapsedMs   = () => S().timer ? Date.now() - S().timer.since : 0;
  /** Minutes so far in the live session (not yet committed to an entry). */
  const elapsedMin  = () => Math.floor(elapsedMs() / 60000);

  /** Committed minutes + whatever the stopwatch is currently holding. */
  function liveTotal(t){
    return ORG.store.logged(t) + (isRunning(t.id) ? elapsedMin() : 0);
  }

  /* ============================================================
     COMMANDS
     ============================================================ */
  function start(taskId){
    if (S().timer) stop(true);                     // only one clock at a time
    S().timer = { taskId, since: Date.now() };
    ORG.store.save();
    paint();
  }

  function stop(silent){
    const timer = S().timer;
    if (!timer) return;

    const mins = Math.round(elapsedMs() / 60000);
    const t = ORG.store.byId(timer.taskId);
    S().timer = null;

    if (t && mins >= 1){
      t.entries.push({ id:U.uid(), min:mins, note:"timer", at:Date.now() });
      t.updatedAt = Date.now();
      if (!silent) U.toast(`Logged ${U.fmtHM(mins)} to “${t.title || "Untitled"}”`);
    } else if (!silent){
      U.toast("Under a minute — nothing logged");
    }

    ORG.store.save();
    paint();
  }

  function toggle(taskId){
    isRunning(taskId) ? stop() : start(taskId);
  }

  /** Manual log, used by the +15m / +30m / +1h buttons. */
  function addManual(t, mins, note = "manual"){
    t.entries.push({ id:U.uid(), min:mins, note, at:Date.now() });
    ORG.store.touch(t);
  }

  function removeEntry(t, entryId){
    t.entries = t.entries.filter(e => e.id !== entryId);
    ORG.store.touch(t);
  }

  /* ============================================================
     TOPBAR PILL
     ============================================================ */
  function paint(){
    const pill = U.$("#timerpill");
    if (!pill) return;

    const timer = S().timer;
    if (!timer){ pill.classList.remove("on"); return; }

    const t = ORG.store.byId(timer.taskId);
    if (!t){ S().timer = null; pill.classList.remove("on"); return; }

    pill.classList.add("on");
    U.$(".tp-name", pill).textContent = t.title || "Untitled";
    U.$(".tp-time", pill).textContent = U.fmtClock(elapsedMs());
    pill.title = "Running — click to open the task";
  }

  /** Called once from app.js after the DOM exists. */
  function init(){
    const pill = U.$("#timerpill");

    pill.addEventListener("click", e => {
      if (e.target.closest(".tp-stop")) { stop(); return; }
      if (S().timer) ORG.editor.open(S().timer.taskId);
    });

    setInterval(() => {
      if (!S().timer) return;
      paint();
      ORG.editor.refreshTimer();          // keep the modal's big counter ticking
    }, 1000);

    paint();
  }

  return {
    init, paint,
    running, isRunning, elapsedMin, liveTotal,
    start, stop, toggle, addManual, removeEntry,
  };
})();
