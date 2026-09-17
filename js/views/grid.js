/* ============================================================
   views/grid.js
   What counts as a day, and what counts as a nudge.

   The pixel maths that used to live here went with the vertical
   grid — the timeline owns its own geometry, because its unit
   changes between day and week. What's left is the shared answer
   to "which hours do we draw" and "snap to the quarter hour".
   ============================================================ */
window.ORG = window.ORG || {};

ORG.grid = (() => {
  const SNAP = 15;                                  // minutes

  const settings  = () => ORG.store.state.settings;
  const dayStart  = () => settings().dayStart;
  const dayEnd    = () => settings().dayEnd;
  const span      = () => dayEnd() - dayStart() + 1; // hour rows drawn

  const snap = m => Math.round(m / SNAP) * SNAP;

  return { SNAP, dayStart, dayEnd, span, snap };
})();
