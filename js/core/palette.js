/* ============================================================
   core/palette.js
   The colours a label can be built from, and the labels a fresh
   install starts with.

   A label is a NAME with one to three colours — a client, usually.
   Three colours instead of one because nine single colours run out
   fast once every client wants its own, and a striped pair reads
   as distinctly at chip size as a solid one does.
   ============================================================ */
window.ORG = window.ORG || {};

/** The swatch grid shown when picking a label's colours. */
ORG.SWATCHES = [
  "#8b7cf6", "#7a5cf0", "#5a9cf8", "#3f7fe0",
  "#33c2ce", "#16b5a6", "#46c07f", "#79c245",
  "#e0b341", "#f0a63f", "#f0873f", "#e0653c",
  "#ef5f5f", "#e04a7a", "#ec6cb4", "#b66ce0",
  "#ffffff", "#7d8697", "#525a68", "#000000",
];

/** What a brand-new install starts with. Rename them to your clients. */
ORG.DEFAULT_LABELS = [
  { id:"client-a",  name:"Aurora Records", colors:["#8b7cf6", "#ec6cb4"] },
  { id:"client-b",  name:"Client B",       colors:["#5a9cf8"] },
  { id:"research",  name:"Research",       colors:["#33c2ce"] },
  { id:"delivered", name:"Delivered",      colors:["#46c07f"] },
  { id:"review",    name:"Review",         colors:["#e0b341"] },
  { id:"urgent",    name:"Urgent",         colors:["#f0873f"] },
  { id:"deadline",  name:"Deadline",       colors:["#ef5f5f"] },
  { id:"pitch",     name:"Pitch",          colors:["#ec6cb4"] },
  { id:"admin",     name:"Admin",          colors:["#7d8697"] },
];

/**
 * The nine colours that used to BE the labels. Only here so a save from
 * before labels had names and multiple colours can be carried over with
 * its ids intact — every task's `color` becomes its `label`.
 */
ORG.LEGACY_PALETTE = [
  { id:"violet", hex:"#8b7cf6", name:"Project A" },
  { id:"blue",   hex:"#5a9cf8", name:"Project B" },
  { id:"cyan",   hex:"#33c2ce", name:"Research"  },
  { id:"green",  hex:"#46c07f", name:"Delivered" },
  { id:"yellow", hex:"#e0b341", name:"Review"    },
  { id:"orange", hex:"#f0873f", name:"Urgent"    },
  { id:"red",    hex:"#ef5f5f", name:"Deadline"  },
  { id:"pink",   hex:"#ec6cb4", name:"Pitch"     },
  { id:"slate",  hex:"#7d8697", name:"Admin"     },
];
