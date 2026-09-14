/* ============================================================
   core/spaces.js
   The two work areas. Every task belongs to exactly one of them
   and only one is ever on screen, so Work never shows up among
   Personal and the other way round.

   A space owns:
     · its tasks, everywhere they appear (calendar, board, sidebar)
     · its own set of board lists
     · its own folder under FILES/
     · an accent colour, so which one you're in is obvious at a glance

   Deliberately a fixed pair rather than user-made spaces: two is
   what the split is for, and anything more starts needing a manager.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.SPACES = [
  { id:"work",     name:"Work",     accent:"#8b7cf6" },
  { id:"personal", name:"Personal", accent:"#16b5a6" },
];

ORG.spaces = (() => {
  const DEFAULT = ORG.SPACES[0].id;

  const byId  = id => ORG.SPACES.find(s => s.id === id) || null;
  const valid = id => !!byId(id);

  /** Anything unrecognised — a missing field, an older save — reads as Work. */
  const idOf = id => (valid(id) ? id : DEFAULT);

  /** Also the folder name used under FILES/. */
  const nameOf = id => (byId(id) || ORG.SPACES[0]).name;

  const other = id => ORG.SPACES.find(s => s.id !== idOf(id)) || ORG.SPACES[0];

  return { DEFAULT, all: () => ORG.SPACES, byId, valid, idOf, nameOf, other };
})();
