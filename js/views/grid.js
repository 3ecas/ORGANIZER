/* ============================================================
   views/grid.js
   Geometry shared by the day/week grid and the drag-and-drop
   layer: pixel <-> minute conversion, snapping, and the algorithm
   that packs overlapping blocks into side-by-side columns.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.grid = (() => {
  const SNAP = 15;                                  // minutes

  const settings  = () => ORG.store.state.settings;
  const dayStart  = () => settings().dayStart;
  const dayEnd    = () => settings().dayEnd;
  const span      = () => dayEnd() - dayStart() + 1; // hour rows drawn

  /** Current height of one hour row, read from the CSS variable. */
  const hourPx = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 54;

  const snap = m => Math.round(m / SNAP) * SNAP;

  /** y (px from the top of a day column) -> minutes past midnight */
  const yToMin = y => dayStart() * 60 + (y / hourPx()) * 60;

  /** minutes past midnight -> y (px from the top of a day column) */
  const minToY = m => (m - dayStart() * 60) / 60 * hourPx();

  /**
   * Lay overlapping blocks out side by side.
   * Input:  [{ t, s, e }] where s/e are minutes past midnight.
   * Output: same objects, each given `col` (0-based) and `cols` (total
   *         columns in its overlap cluster).
   */
  function packColumns(items){
    const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);

    let cluster = [], clusterEnd = -1;

    const flush = () => {
      if (!cluster.length) return;
      const cols = [];
      for (const it of cluster){
        // reuse the first column whose last block already finished
        let i = cols.findIndex(c => c[c.length - 1].e <= it.s);
        if (i === -1){ cols.push([it]); i = cols.length - 1; }
        else cols[i].push(it);
        it.col = i;
      }
      cluster.forEach(it => it.cols = cols.length);
      cluster = []; clusterEnd = -1;
    };

    for (const it of sorted){
      if (cluster.length && it.s >= clusterEnd) flush();   // no overlap -> new cluster
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    }
    flush();

    return sorted;
  }

  /**
   * How many side-by-side lanes a day needs — the widest overlap cluster
   * in it. Call after packColumns; the day/week view uses this to decide
   * how much width to give the column.
   */
  const laneCount = items => items.reduce((max, it) => Math.max(max, it.cols || 1), 1);

  return { SNAP, dayStart, dayEnd, span, hourPx, snap, yToMin, minToY,
           packColumns, laneCount };
})();
