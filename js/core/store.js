/* ============================================================
   core/store.js
   The single source of truth. Owns the task model, the filters
   and localStorage persistence. Emits "change" on the bus; every
   renderer listens to that instead of calling each other.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.store = (() => {
  const U = ORG.util;
  const KEY = "organizer.v2";
  const VERSION = 2;
  const MAX_SPAN = 3;          // a card may cover up to 3x3 cells
  const SNAP_MIN = 15;         // the shortest stretch of time worth drawing

  let state = null;
  let query = "";
  let terms = [];              // the query, read as dates/times/words
  let storageOK = true;

  /* Which revision of data.json we're working from, and whether another
     device has since moved past it. Only meaningful in disk mode — see
     readDisk/persistNow below. */
  let diskRev = 0;
  let stale = null;          // { savedBy, savedAt } once we've been overtaken
  let broken = null;         // why data.json can't be read, when it can't
  let saving = 0;            // writes in flight — the reload button waits for them

  /* ============================================================
     MODEL
     ============================================================ */

  /**
   * A task. Everything optional is nulled rather than absent so the
   * rest of the app never has to guard for undefined.
   *
   *  space     "work" | "personal"   which work area it belongs to
   *  date      "YYYY-MM-DD" | null   the day it starts
   *  start     "HH:MM" | null        when on that day; null = all day
   *  endDate   "YYYY-MM-DD" | null   the day it ends; null = the same day
   *  end       "HH:MM" | null        when on that day; null when all-day
   *  due       "YYYY-MM-DD" | null   deadline, independent of the above
   *  files     [{id, name, size, type, at}]  blobs live in core/files.js
   */
  function normalizeTask(t){
    if (!t || typeof t !== "object") return null;
    const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

    const time  = v => typeof v === "string" && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0,5) : null;
    const date  = isDate(t.date) ? t.date : null;
    const start = time(t.start);

    /* A run of days, forwards, on something that's actually on the calendar.
       It may carry a clock now: "Wed 14:00 until Fri 18:00" is one job, and
       the timeline draws it as one bar. That used to be forbidden because
       the calendar was a vertical hour grid that could only draw a day at a
       time — a reason that left with the grid. */
    const endDate = (date && isDate(t.endDate) && t.endDate > date) ? t.endDate : null;

    /* The clock it finishes at, on its last day. Saves made before this
       stored a length in minutes instead; carry those over. */
    let end = time(t.end);
    if (start && !end){
      const mins = t.dur != null && Number.isFinite(+t.dur) ? +t.dur : 60;
      end = U.fmtMin(Math.min(U.parseTime(start) + mins, 1439));
    }
    if (!start) end = null;
    /* On a single day the end has to come after the start. Across days it
       needn't — finishing at 09:00 on Friday having begun at 14:00 on
       Wednesday is perfectly ordinary. */
    if (start && end && !endDate && U.parseTime(end) <= U.parseTime(start)){
      end = U.fmtMin(Math.min(U.parseTime(start) + 15, 1439));
    }

    return {
      id:     t.id || U.uid(),
      space:  ORG.spaces.idOf(t.space),
      title:  String(t.title ?? "").slice(0, 500),
      /* the second line under the title — which cut, which deliverable,
         which client. Short on purpose: it rides along everywhere the
         title does, including one-line chips on the calendar. */
      subtitle: String(t.subtitle ?? "").slice(0, 160),
      notes:  String(t.notes ?? ""),
      date, endDate, start, end,
      due:    isDate(t.due) ? t.due : null,
      /* which label (client) this belongs to. `color` is what the field
         was called before labels had names, and still reads fine. */
      label:  typeof t.label === "string" ? t.label
            : typeof t.color === "string" ? t.color : null,
      done:   !!t.done,
      /* board position: which list it sits in, and where in that list */
      status: typeof t.status === "string" ? t.status : null,
      order:  Number.isFinite(+t.order) ? +t.order : 0,
      /* where this card sits on the To-do wall, and how many cells it
         covers. Grid cells, not pixels, so a card lands where you left it
         at the size you left it, whatever the window size. */
      pin: t.pin && Number.isFinite(+t.pin.x) && Number.isFinite(+t.pin.y)
        ? { x: Math.max(0, Math.round(+t.pin.x)), y: Math.max(0, Math.round(+t.pin.y)) }
        : null,
      span: {
        w: U.clamp(Math.round(+(t.span?.w) || 1), 1, MAX_SPAN),
        h: U.clamp(Math.round(+(t.span?.h) || 1), 1, MAX_SPAN),
      },
      /* Which lane its bar sits on along the timeline. null means "wherever
         there's room" — drag a bar up or down and from then on that's where
         it lives, whatever else is on screen. */
      /* `== null` first: +null is 0, which IS finite, so a plain
         Number.isFinite check would quietly pin every unplaced task to
         lane 0 the next time it was loaded — everything on one row. */
      lane: t.lane == null || !Number.isFinite(+t.lane)
        ? null : Math.max(0, Math.round(+t.lane)),
      /* The checklist inside the card. A tree: an entry is either a step
         or a group holding more of either. A plain list is simply a tree
         with no groups in it, so there's no second kind of list to choose
         between when you make a card. */
      steps: cleanList(t.steps),
      files: Array.isArray(t.files)
        ? t.files.map(f => ({
            id:   f.id || U.uid(),
            name: String(f.name ?? "file"),
            size: +f.size || 0,
            type: String(f.type ?? ""),
            at:   +f.at || Date.now(),
            /* where the copy lives under FILES/ — disk mode only.
               "files/" is the old date-based layout, still readable. */
            path: typeof f.path === "string" && /^(FILES|files)\//.test(f.path) ? f.path : null,
          }))
        : [],
      /* When it was put away. Archived work stays in data.json — it is the
         record of what you did — but it is out of every view until you
         ask for it. 0 means still live. */
      archivedAt: +t.archivedAt || 0,
      createdAt: +t.createdAt || Date.now(),
      updatedAt: +t.updatedAt || Date.now(),
    };
  }

  /* ============================================================
     LABELS
     A label is a name plus one to three colours — normally a
     client. Every task carries exactly one, which is what tints
     it everywhere and what the sidebar filters on.
     ============================================================ */
  const MAX_COLORS = 3;
  const FALLBACK   = { id:"none", name:"No label", colors:["#7d8697"] };

  const isHex = c => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c);

  function cleanLabel(l){
    /* `colors` may arrive as a single `color` from a save made before a
       label could have more than one. */
    const raw = Array.isArray(l.colors) ? l.colors : [l.color];
    const colors = raw.filter(isHex).slice(0, MAX_COLORS);
    return {
      id:     String(l.id || U.uid()),
      name:   String(l.name ?? "Label").slice(0, 60),
      colors: colors.length ? colors : [FALLBACK.colors[0]],
    };
  }

  /**
   * Older saves stored labels as { colourId: "name" } — nine fixed colours
   * that WERE the labels. Rebuild them as real label records with their ids
   * intact, so every task's old `color` still points at the right one.
   */
  function hydrateLabels(raw, fallback){
    if (Array.isArray(raw) && raw.length) return raw.map(cleanLabel);

    if (raw && typeof raw === "object"){
      return ORG.LEGACY_PALETTE.map(c => cleanLabel({
        id: c.id, name: raw[c.id] || c.name, colors:[c.hex],
      }));
    }
    return fallback;
  }

  const labelById = id => state.labels.find(l => l.id === id) || null;
  const labelOf   = t => labelById(t.label) || state.labels[0] || FALLBACK;
  const labelName = t => labelOf(t).name;

  /** A task's colours, and the one to tint surfaces with. */
  const colorsOf = t => labelOf(t).colors;
  const hexOf    = t => colorsOf(t)[0];

  /**
   * Point every task at a label that exists.
   *
   * Same reasoning as pinStatuses: labelOf() falls back to "the first
   * label", which is a position, not a fact. Deleting or reordering
   * labels would otherwise quietly recolour unrelated tasks.
   */
  function pinLabels(s){
    if (!s.labels.length) s.labels = ORG.DEFAULT_LABELS.map(cleanLabel);
    sortIn(s);
    const ids = new Set(s.labels.map(l => l.id));
    for (const t of s.tasks) if (!ids.has(t.label)) t.label = s.labels[0].id;
    return s;
  }

  /**
   * Labels read alphabetically — with a client list of any size, the only
   * order you can predict is the one you'd look them up in.
   *
   * Sorted when the list changes, never while a name is being typed: a row
   * that re-sorts under the cursor mid-word is unusable. The UI calls
   * sortLabels() when a rename is committed instead.
   */
  const byName = (a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity:"base", numeric:true });

  const sortIn = s => { s.labels.sort(byName); return s; };
  const sortLabels = () => { sortIn(state); save(); };

  function addLabel(name, colors){
    const l = cleanLabel({ name: name || "New label", colors: colors || ["#8b7cf6"] });
    state.labels.push(l);
    sortIn(state);
    save();
    return l;
  }

  function updateLabel(id, patch){
    const i = state.labels.findIndex(l => l.id === id);
    if (i === -1) return null;
    state.labels[i] = cleanLabel({ ...state.labels[i], ...patch, id });
    // renaming shouldn't repaint the world on every keystroke
    patch.name !== undefined && patch.colors === undefined ? save(true) : save();
    return state.labels[i];
  }

  /** Delete a label; its tasks move to the first one left. Never deletes tasks. */
  function removeLabel(id){
    if (state.labels.length <= 1) return;
    const rest = state.labels.filter(l => l.id !== id);
    state.tasks.forEach(t => { if (t.label === id) t.label = rest[0].id; });
    state.labels = rest;
    state.hidden = state.hidden.filter(h => h !== id);
    save();
  }

  /** How many open tasks carry this label, in the space on screen. */
  const labelCount = id =>
    live().filter(t => t.space === space() && t.label === id && !t.done).length;

  /* ============================================================
     CHECKLIST — the steps inside a card
     A tree. An entry is either a step or a group, and a group holds
     entries of either kind, as deep as the work actually goes.

     Everything below works in terms of "leaves" — the actual things
     to do — so a group never counts as a task itself at any depth,
     and a plain list is simply a tree with no groups in it.
     ============================================================ */

  const MAX_DEPTH = 24;        // a stop against a damaged file, not a rule

  /* Note the explicit depth on every call. `list.map(cleanEntry)` would
     hand the ARRAY INDEX in as the depth — so the third group in a list
     would be read as three levels down. That mistake cost a group its
     children once; keep the recursion spelled out. */
  const cleanList = (list, depth = 0) =>
    Array.isArray(list) ? list.flatMap(s => cleanEntry(s, depth)) : [];

  /** One entry in, zero or more out — the stop flattens rather than drops. */
  function cleanEntry(s, depth){
    if (!s || typeof s !== "object") return [];
    const base = {
      id:   s.id || U.uid(),
      text: String(s.text ?? "").slice(0, 300),
    };
    if (!s.folder) return [{ ...base, done: !!s.done }];

    const children = cleanList(s.children, depth + 1);
    /* Past the stop the group's contents are lifted out rather than thrown
       away. A file nested this deep is damaged, and quietly deleting the
       steps inside it is a terrible way to find that out. */
    if (depth >= MAX_DEPTH) return children;

    return [{ ...base, folder:true, open: s.open !== false, children }];
  }

  /** Every actual step, groups opened out, in the order you'd read them. */
  const leafList = list => list.flatMap(s => s.folder ? leafList(s.children) : [s]);
  const leaves = t => leafList(t.steps);

  const progress = t => {
    const all = leaves(t);
    return { done: all.filter(s => s.done).length, total: all.length };
  };

  /** How far through one group you are — counting all the way down. */
  const folderProgress = f => {
    const all = leafList(f.children);
    return { done: all.filter(s => s.done).length, total: all.length };
  };

  /** Where an entry lives: the array holding it, its index, and its parent. */
  function locate(t, id, list = t.steps, folder = null){
    const i = list.findIndex(s => s.id === id);
    if (i !== -1) return { list, index: i, folder };
    for (const s of list){
      if (!s.folder) continue;
      const hit = locate(t, id, s.children, s);
      if (hit) return hit;
    }
    return null;
  }

  const stepById = (t, id) => { const at = locate(t, id); return at ? at.list[at.index] : null; };

  /** The group with this id, at whatever depth it sits. */
  function folderById(t, id){
    const at = id && locate(t, id);
    return at && at.list[at.index].folder ? at.list[at.index] : null;
  }

  /** How deep an entry sits — 0 at the top. Drives the indent. */
  function depthOf(t, id){
    let d = 0, at = locate(t, id);
    while (at && at.folder){ d++; at = locate(t, at.folder.id); }
    return d;
  }

  /** Is `id` inside `folder`, at any depth? Guards a group being dropped
      into its own contents, which would cut it out of the list entirely. */
  function contains(folder, id){
    return folder.children.some(c => c.id === id || (c.folder && contains(c, id)));
  }

  /** Add a step, optionally inside a group and at a position in it. */
  function addStep(t, text, index, folderId){
    const step = { id:U.uid(), text:String(text || "").slice(0, 300), done:false };
    const f = folderById(t, folderId);
    const list = f ? f.children : t.steps;
    if (Number.isInteger(index)) list.splice(U.clamp(index, 0, list.length), 0, step);
    else list.push(step);
    touch(t);
    return step;
  }

  /** Add a group, optionally inside another one. */
  function addFolder(t, name, index, folderId){
    const f = { id:U.uid(), text:String(name || "New group").slice(0, 300),
                folder:true, open:true, children:[] };
    const parent = folderById(t, folderId);
    const list = parent ? parent.children : t.steps;
    if (Number.isInteger(index)) list.splice(U.clamp(index, 0, list.length), 0, f);
    else list.push(f);
    touch(t);
    return f;
  }

  function updateStep(t, id, patch){
    const step = stepById(t, id);
    if (!step) return null;
    Object.assign(step, patch);
    /* text edits and opening a folder shouldn't repaint the whole app */
    const quiet = patch.text !== undefined || patch.open !== undefined;
    quiet ? save(true) : touch(t);
    return step;
  }

  /**
   * Remove an entry. A group's contents move up into wherever the group
   * was rather than being deleted — losing a morning's work because you
   * tidied a heading away would be an unkind way to find out how groups
   * behave. Anything nested inside keeps its own shape on the way up.
   */
  function removeStep(t, id){
    const at = locate(t, id);
    if (!at) return;
    const [gone] = at.list.splice(at.index, 1);
    if (gone.folder && gone.children.length){
      at.list.splice(at.index, 0, ...gone.children);
      const n = leafList(gone.children).length;
      U.toast(`Group removed — its ${n} step${n === 1 ? "" : "s"} moved out`);
    }
    touch(t);
  }

  /** Move an entry to a position, optionally into or out of a group. */
  function moveStep(t, id, index, folderId){
    const at = locate(t, id);
    if (!at) return;
    const moving = at.list[at.index];

    /* A group can go inside another group, but never inside itself or
       anything it holds — that would take it off the list altogether. */
    const f = folderById(t, folderId);
    if (f && moving.folder && (f.id === moving.id || contains(moving, f.id))) return;
    const to = f ? f.children : t.steps;

    at.list.splice(at.index, 1);
    const cap = to === at.list && index > at.index ? index - 1 : index;
    to.splice(U.clamp(cap, 0, to.length), 0, moving);
    touch(t);
  }

  /** Sweep finished steps at every depth. Groups stay, even when emptied. */
  function clearDoneSteps(t){
    const sweep = list => list
      .filter(s => s.folder || !s.done)
      .map(s => s.folder ? { ...s, children: sweep(s.children) } : s);
    t.steps = sweep(t.steps);
    touch(t);
  }

  /* ============================================================
     DEFAULTS / SEED
     ============================================================ */
  /** A fresh set of board lists. Each space gets its own objects, so
      renaming a list in Work leaves Personal alone.
      `done:true` marks the list that means "finished" — dropping a card
      there ticks the task complete, and vice versa. */
  const baseColumns = () => [
    { id:"backlog", name:"Backlog" },
    { id:"doing",   name:"In progress" },
    { id:"review",  name:"Review" },
    { id:"done",    name:"Done", done:true },
  ];

  function defaults(){
    const today = U.ymd(new Date());
    const tmr   = U.ymd(U.addDays(new Date(), 1));
    const fri   = U.ymd(U.addDays(new Date(), 4));
    const now   = Date.now();

    const seed = [
      { title:"Videoclip — “Nightdrive”", subtitle:"First cut · Aurora Records",
        notes:"3:42 track. Client wants a first cut by Friday.",
        date:today, start:"09:30", end:"11:30", due:fri, label:"client-a",
        status:"doing", order:0,
        steps:[
          { id:U.uid(), text:"Listen through, mark the beats", done:true },
          { id:U.uid(), text:"Moodboard + colour script",      done:true },
          { id:U.uid(), text:"Storyboard the opening sequence", done:false },
          { id:U.uid(), text:"Animate 00:00 – 01:10",           done:false },
          { id:U.uid(), text:"Type treatment for the title",    done:false },
          { id:U.uid(), text:"Grade and export the master",     done:false },
        ] },
      { title:"Client call — feedback round 2", notes:"",
        date:today, start:"15:00", end:"15:45", label:"review", status:"doing", order:1 },
      { title:"Render + export deliverables", notes:"ProRes 4444 master + H.264 web cut.",
        date:tmr, start:null, due:tmr, label:"delivered", status:"review", order:0 },
      { title:"Rebuild the type animation rig", notes:"No brief yet — parked here until it lands.",
        date:null, label:"admin", status:"backlog", order:0 },
      { title:"Update showreel", notes:"", date:null, status:"backlog", order:1,
        due:U.ymd(U.addDays(new Date(), 21)), label:"pitch" },
    ];

    /* A couple of examples over in Personal, so the other space isn't a
       blank wall on the first run. */
    const personalSeed = [
      { title:"Learn Houdini — chapter 3", notes:"Pyro solver. 40 min a night.",
        date:null, status:"doing", order:0, label:"research",
        steps:[
          { id:U.uid(), text:"Watch the lesson",       done:true },
          { id:U.uid(), text:"Rebuild the example",    done:false },
          { id:U.uid(), text:"Try it on my own shot",  done:false },
        ] },
      { title:"Renew passport", notes:"Expires in the spring.",
        date:null, status:"backlog", order:0, label:"client-b",
        due:U.ymd(U.addDays(new Date(), 45)) },
    ];

    const born = (list, space) =>
      list.map(s => normalizeTask({ ...s, space, id:U.uid(), createdAt: now }));

    /* pinned here as well as in hydrate(): a fresh install never goes
       through hydrate, and an unpinned task would pick its list and its
       label by position instead of by name */
    return pinLabels(pinStatuses({
      version: VERSION,
      tasks: [...born(seed, "work"), ...born(personalSeed, "personal")],
      labels: ORG.DEFAULT_LABELS.map(cleanLabel),
      hidden: [],
      /* board lists, one independent set per space */
      columns: Object.fromEntries(ORG.spaces.all().map(s => [s.id, baseColumns()])),
      settings: {
        theme: "dark",
        space: ORG.spaces.DEFAULT,    // the work area currently on screen
        view: "week",
        lastDated: "week",            // calendar view to return to when leaving the board
        hideDone: false,
        sidebar: true,                // the sidebar is showing
        dayStart: 8,                  // first hour drawn in day view
        dayEnd: 22,                   // last hour drawn
        /* the order of the tabs on the right of a card. One setting for
           every card — how you read a job is a habit, not a fact about any
           one of them — and the first one is what a card opens on. */
        cardOrder: ["steps", "notes", "files"],
      },
    }));
  }

  /* ============================================================
     PERSISTENCE
     ============================================================ */
  const cleanColumn = c => ({
    id:   String(c.id || U.uid()),
    name: String(c.name ?? "List"),
    done: !!c.done,
  });

  /**
   * Board lists, one set per space. A save from before the split had a
   * single shared array — that was the Work board, so it moves there and
   * Personal starts from the defaults. Task `status` values keep working
   * either way, because the ids come across untouched.
   */
  function hydrateColumns(raw, fallback){
    const legacy = Array.isArray(raw) ? raw : null;
    const out = {};

    for (const s of ORG.spaces.all()){
      const src = legacy
        ? (s.id === ORG.spaces.DEFAULT ? legacy : null)
        : (raw && Array.isArray(raw[s.id]) ? raw[s.id] : null);
      out[s.id] = src && src.length ? src.map(cleanColumn) : fallback[s.id];
    }
    return out;
  }

  function hydrate(raw){
    const d = defaults();
    /* pinned on the way in, so a save written before this existed gets its
       cards nailed to the lists they're already showing in, and every task
       points at a label that actually exists */
    return pinLabels(pinStatuses({
      version: VERSION,
      tasks: Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : [],
      labels: hydrateLabels(raw.labels, d.labels),
      hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
      columns: hydrateColumns(raw.columns, d.columns),
      settings: { ...d.settings, ...(raw.settings || {}),
                  space: ORG.spaces.idOf((raw.settings || {}).space),
                  /* the old 7-to-23 window was only ever a default, and there
                     is no UI to have chosen it deliberately — move it on */
                  ...(((raw.settings || {}).dayStart === 7 &&
                       (raw.settings || {}).dayEnd === 23)
                      ? { dayStart:8, dayEnd:22 } : {}),
                  /* Saves that still hold the old tab order get the new one.
                     Only if it's untouched — a deliberate arrangement is a
                     choice and stays put. */
                  ...(String((raw.settings || {}).cardOrder) === "notes,steps,files"
                      ? { cardOrder:["steps", "notes", "files"] } : {}) },
    }));
  }

  /** data.json, via server.py. Null when there's nothing usable there.

      Two very different kinds of nothing. No file yet is a first run.
      A file that's there but won't parse — a merge left half-done, a sync
      interrupted — sets `broken`, because the caller must then write
      NOTHING: a fresh file over a damaged one destroys the only copy that
      could still be put right. That used to be exactly what happened. */
  async function readDisk(){
    let res;
    try { res = await fetch("/api/state"); }
    catch(e){ console.warn("Could not reach the server.", e); return null; }

    try {
      const raw = await res.json();
      if (!res.ok || raw.error) throw new Error(raw.error || res.status);
      diskRev = +raw.rev || 0;          // what we must still match to save
      return Array.isArray(raw.tasks) ? raw : null;
    } catch(e){
      console.warn("Could not read data.json.", e);
      broken = String(e.message || e);
      return null;
    }
  }

  /** Whatever an earlier browser-storage session left behind. */
  function readLocal(){
    let raw = null;
    try { raw = localStorage.getItem(KEY) || localStorage.getItem("organizer.v1"); }
    catch(e){ storageOK = false; return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch(e){ console.warn("Browser save unreadable, ignoring it.", e); return null; }
  }

  async function load(){
    if (ORG.files.onDisk){
      const disk = await readDisk();
      if (disk){ state = hydrate(disk); return state; }

      if (broken){
        /* Show an empty app, save nothing, and let the banner explain.
           persistNow refuses while `broken` is set.
           Empty, NOT defaults() as it stands: that seeds sample jobs for a
           first run, and a calendar full of plausible-looking work — while
           nothing is saving — is the last thing to show someone whose
           real file just failed to open. */
        state = defaults();
        state.tasks = [];
        setSaved("Not saved — data.json can't be read", true);
        return state;
      }

      /* First run against the folder. Carry over anything the browser
         was holding so switching to disk doesn't look like data loss,
         then write it out immediately so the move sticks. */
      const local = readLocal();
      state = local ? hydrate(local) : defaults();
      await persistNow();
      return state;
    }

    const local = readLocal();
    state = local ? hydrate(local) : defaults();
    return state;
  }

  async function persistNow(){
    if (ORG.files.onDisk){
      /* Once another device has overtaken us, every further write would
         only widen the gap. Stop until the page is reloaded. */
      if (stale || broken) return;

      saving++;
      try {
        const res = await fetch(`/api/state?rev=${diskRev}`, {
          method: "PUT",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(state),
        });
        const out = await res.json();

        if (res.status === 423){
          /* data.json went bad underneath us while this was open — the
             server won't write over it, and nor will we try again. */
          broken = "data.json can't be read";
          setSaved("Not saved — data.json can't be read", true);
          U.bus.emit("broken");
          return;
        }

        if (res.status === 409){
          stale = { savedBy: out.savedBy, savedAt: out.savedAt };
          setSaved(`Not saved — ${out.savedBy} got there first`, true);
          U.bus.emit("stale");
          return;
        }
        if (!res.ok || out.error) throw new Error(out.error || res.status);

        diskRev = +out.rev || diskRev + 1;
        setSaved("Saved to this folder", false);
      } catch(e){
        console.error("Write failed", e);
        setSaved("Not saved — check Terminal", true);
      } finally {
        saving--;
      }
      return;
    }

    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setSaved("Saved in this browser", false);
    } catch(e){
      storageOK = false;
      setSaved("Not saved — export now", true);
    }
  }

  const persist = U.debounce(persistNow, 180);

  /** Save + tell everyone to re-render. */
  function save(silent){
    persist();
    if (!silent) U.bus.emit("change");
  }

  function setSaved(txt, warn){
    const n = U.$("#saved-txt");
    if (!n) return;
    n.textContent = txt;
    U.$("#saved").classList.toggle("warn", !!warn);
  }

  function replaceState(next){
    state = hydrate(next);
    U.bus.emit("theme");
    save();
  }

  /* ============================================================
     SPACES
     The active space is a filter over one task list, not a second
     copy of the app — switching is instant and nothing is loaded
     or unloaded. Everything on screen goes through here.
     ============================================================ */
  const space      = () => ORG.spaces.idOf(state.settings.space);
  const columnsIn  = id => state.columns[ORG.spaces.idOf(id)];
  const columns    = () => columnsIn(space());

  function setSpace(id){
    if (!ORG.spaces.valid(id) || state.settings.space === id) return;
    state.settings.space = id;
    U.bus.emit("theme");            // the accent colour follows the space
    save();
  }

  /** What to show on a space's button: open tasks, or search hits. */
  function tally(id){
    const mine = live().filter(t => t.space === id);
    return {
      open: mine.filter(t => !t.done).length,
      hits: query ? mine.filter(matches).length : null,
    };
  }

  /* ============================================================
     QUERIES
     ============================================================ */
  const byId = id => state.tasks.find(t => t.id === id);

  /* core/search.js decides what a query means — text, but also dates and
     clock times, and every term has to match. */
  const matches = t => ORG.search.test(t, terms);

  /** Everything still in play — archived work is excluded everywhere. */
  const live = () => state.tasks.filter(t => !t.archivedAt);

  /** Tasks in this space passing the label filter, hide-done and search. */
  const visible = () => live().filter(t =>
    t.space === space() &&
    !state.hidden.includes(t.label) &&
    !(state.settings.hideDone && t.done) &&
    matches(t)
  );

  /**
   * Does this task sit on this day?
   *
   * A timed task belongs to exactly one day — the grid draws one day at a
   * time. An all-day one can run across several, and then it belongs to
   * every day it covers, so it shows in each of their all-day cells.
   * Dates are "YYYY-MM-DD", which sorts the same as it reads.
   */
  function covers(t, key){
    if (!t.date) return false;
    if (t.date === key) return true;
    if (!t.endDate) return false;
    return key > t.date && key <= t.endDate;
  }

  /** How many days a task runs for. 1 unless it runs across days. */
  const spanDays = t =>
    t.date && t.endDate ? U.daysBetween(t.date, t.endDate) + 1 : 1;

  /** The day it finishes — the same day unless it runs. */
  const lastDay = t => t.endDate || t.date;

  /**
   * Which stretch of one day a task occupies, in minutes past midnight.
   * null when it isn't on that day at all.
   *
   * A job running Wed 14:00 to Fri 18:00 fills Thursday, starts partway
   * through Wednesday and stops partway through Friday — which is what
   * lets one bar mean one job rather than three.
   */
  function spanOnDay(t, key){
    if (!covers(t, key)) return null;
    if (!t.start) return { from:0, to:1440 };

    const from = key === t.date      ? U.parseTime(t.start) : 0;
    const to   = key === lastDay(t)  ? U.parseTime(t.end || t.start) : 1440;
    return { from, to: Math.max(to, from + SNAP_MIN) };
  }

  /** Minutes a single-day job lasts. 0 for anything all-day or running. */
  const durationOf = t => (t.start && t.end && !t.endDate)
    ? Math.max(SNAP_MIN, U.parseTime(t.end) - U.parseTime(t.start)) : 0;

  const tasksOn = d => {
    const key = typeof d === "string" ? d : U.ymd(d);
    return visible().filter(t => covers(t, key));
  };

  /**
   * Pin a bar to a lane on the timeline, or let go of it again.
   *
   * Deliberately unpoliced: two bars may share a lane and overlap if that's
   * where you put them. Auto-packing is only ever a starting suggestion for
   * bars you haven't placed yourself.
   */
  function setLane(t, lane){
    const n = lane == null ? null : Math.max(0, Math.round(lane));
    if (t.lane === n) return;
    t.lane = n;
    touch(t);
  }

  /**
   * Move a task to another day, carrying the rest of its run with it —
   * dragging the front of a three-day job should slide all three, not
   * stretch it backwards from a fixed end.
   */
  function moveTo(t, key){
    if (t.date && t.endDate){
      const len = U.daysBetween(t.date, t.endDate);
      t.endDate = U.ymd(U.addDays(U.parseYmd(key), len));
    }
    t.date = key;
  }

  const setQuery = q => {
    query = (q || "").trim().toLowerCase();
    terms = ORG.search.parse(query);
    U.bus.emit("change");
  };
  const getQuery = () => query;

  /* ============================================================
     THE ARCHIVE
     Finished work doesn't need deleting — it's the record of what
     you did, and it's what the hours and the files hang off. It
     just needs to be out of the way.
     ============================================================ */
  const archived = () => state.tasks
    .filter(t => t.archivedAt)
    .sort((a, b) => b.archivedAt - a.archivedAt);

  const archivedCount = () => state.tasks.reduce((n, t) => n + (t.archivedAt ? 1 : 0), 0);

  function archive(t){
    if (t.archivedAt) return;
    t.archivedAt = Date.now();
    touch(t);
  }

  function restore(t){
    if (!t.archivedAt) return;
    t.archivedAt = 0;
    /* its old cell may well be taken by now — let the wall re-place it */
    t.pin = null;
    touch(t);
  }

  /** Everything ticked complete in this space. The Done column's bulk action. */
  function archiveDone(){
    const doing = live().filter(t => t.space === space() && t.done);
    doing.forEach(t => { t.archivedAt = Date.now(); });
    if (doing.length) save();
    return doing.length;
  }

  /* ============================================================
     MUTATIONS
     ============================================================ */
  function add(patch = {}){
    // new tasks land in whichever space you're looking at
    const t = normalizeTask({ id:U.uid(), createdAt:Date.now(), space:space(), ...patch });
    state.tasks.push(t);

    // quick-add and the New button don't name a list; record the one it
    // lands in now rather than leaving it to be worked out at render time
    if (!columnsIn(t.space).some(c => c.id === t.status)) t.status = columnOf(t).id;
    if (!labelById(t.label)) t.label = state.labels[0].id;

    save();
    return t;
  }

  function remove(id){
    const t = byId(id);
    if (t) t.files.forEach(f => ORG.files.del(f.id, f.path));
    state.tasks = state.tasks.filter(x => x.id !== id);
    save();
  }

  function touch(t){
    t.updatedAt = Date.now();
    save();
  }

  /* ============================================================
     BOARD
     The board is another lens on the same tasks — no separate
     data, so a card and a calendar block are literally the same
     object and editing either updates both.
     ============================================================ */

  /* ============================================================
     THE TO-DO WALL
     Everything that isn't pinned to a time: work with no date yet,
     plus anything carrying a deadline. Cards are placed by hand,
     so this is the one view whose layout is a decision rather
     than a consequence.
     ============================================================ */

  /** Undated work, plus anything with a deadline. */
  const onWall = t => !t.date || !!t.due;

  const todoTasks = () => visible().filter(onWall);

  /** Soonest deadline first, then undated, then newest — the order a
      freshly tidied wall reads in. */
  function wallOrder(a, b){
    if (a.done !== b.done) return a.done - b.done;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return b.createdAt - a.createdAt;
  }

  /* ---------- footprints ----------
     A card covers span.w x span.h cells from its pin. Everything that
     places, moves or resizes one has to reason in whole footprints, or
     a big card would silently sit on top of a small one. */

  const cellsOf = (cell, span) => {
    const out = [];
    for (let i = 0; i < span.w; i++)
      for (let j = 0; j < span.h; j++) out.push(`${cell.x + i},${cell.y + j}`);
    return out;
  };

  /** Cards on this wall other than `t`, with the cells each one covers. */
  function others(t, drawn){
    return (drawn || state.tasks.filter(o => o.space === t.space && onWall(o)))
      .filter(o => o !== t && o.pin)
      .map(o => ({ task:o, cells:new Set(cellsOf(o.pin, o.span)) }));
  }

  /** Would `t` at this cell and size land clear of everything else? */
  function footprintFree(t, cell, span, drawn){
    const want = cellsOf(cell, span);
    return !others(t, drawn).some(o => want.some(c => o.cells.has(c)));
  }

  /**
   * Resize a card, stopping short of anything in the way rather than
   * covering it. Growing into occupied cells would hide work.
   */
  function setSpan(t, w, h){
    let nw = U.clamp(Math.round(w), 1, MAX_SPAN);
    let nh = U.clamp(Math.round(h), 1, MAX_SPAN);
    if (!t.pin){ t.span = { w:nw, h:nh }; return touch(t); }

    while (nw > 1 && !footprintFree(t, t.pin, { w:nw, h:nh })) nw--;
    while (nh > 1 && !footprintFree(t, t.pin, { w:nw, h:nh })) nh--;

    if (t.span.w === nw && t.span.h === nh) return;
    t.span = { w:nw, h:nh };
    touch(t);
  }

  /**
   * Put a card on a cell. If something is already there the two swap —
   * dropping onto an occupied cell and having a card vanish underneath
   * would be worse.
   *
   * `from` is the cell the dragged card was actually sitting on, which
   * the view knows even when the card had no pin of its own. Without it
   * the displaced card would lose its place entirely and reappear at the
   * far end of the wall, which reads as a bug however correct it is.
   */
  function setPin(t, x, y, from, swapId){
    const to = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
    if (t.pin && t.pin.x === to.x && t.pin.y === to.y) return;

    /* The view names whatever card is drawn on the target cell, which
       catches ones the wall auto-placed as well as ones you put there.
       Falling back to a pin search alone would miss half of them. */
    const sitting = (swapId && state.tasks.find(o => o.id === swapId && o !== t))
      || state.tasks.find(o =>
           o !== t && o.space === t.space && onWall(o) &&
           o.pin && o.pin.x === to.x && o.pin.y === to.y);

    /* Swapping only makes sense between cards of the same size. Anything
       else and the move has to land on clear ground — the view refuses it
       before we get here, but a stray call shouldn't bury a card either. */
    if (sitting && (sitting.span.w !== t.span.w || sitting.span.h !== t.span.h)) return;

    if (sitting){
      const back = from || t.pin;
      sitting.pin = back ? { x:back.x, y:back.y } : null;
    }
    t.pin = to;
    touch(t);
  }

  /**
   * Re-flow the whole wall into reading order, `cols` cards wide.
   * First-fit rather than a plain sequence, because cards are different
   * sizes now — a wide one simply skips a row that can't hold it.
   */
  function tidyPins(cols){
    const wide = Math.max(1, cols | 0);
    const taken = new Set();

    const fits = (x, y, w, h) => {
      if (x + w > wide) return false;
      for (let i = 0; i < w; i++)
        for (let j = 0; j < h; j++) if (taken.has(`${x+i},${y+j}`)) return false;
      return true;
    };

    for (const t of todoTasks().sort(wallOrder)){
      const w = Math.min(t.span.w, wide), h = t.span.h;
      let y = 0;
      for (;;){
        let put = false;
        for (let x = 0; x <= wide - w; x++){
          if (!fits(x, y, w, h)) continue;
          t.pin = { x, y };
          cellsOf(t.pin, { w, h }).forEach(c => taken.add(c));
          put = true;
          break;
        }
        if (put) break;
        y++;
      }
    }
    save();
  }

  /** Label filter + search, but never hide-done: the board HAS a Done list. */
  const boardTasks = () => live().filter(t =>
    t.space === space() && !state.hidden.includes(t.label) && matches(t)
  );

  /**
   * Which list a task sits in, looked up in its own space's board.
   *
   * The last two lines are a safety net, not the normal path: they answer
   * by POSITION, which is only correct until the lists get reordered.
   * pinStatuses() below makes sure no task ever has to rely on them.
   */
  function columnOf(t){
    const cols = columnsIn(t.space);
    if (t.status){
      const hit = cols.find(c => c.id === t.status);
      if (hit) return hit;
    }
    if (t.done) return cols.find(c => c.done) || cols[cols.length - 1];
    return cols[0];
  }

  /**
   * Give every task a real list id.
   *
   * A task created from quick-add, the New button or the calendar has no
   * `status`, so columnOf() used to answer "the first list" — meaning its
   * list was decided by position rather than identity. Drag a list to the
   * front and every one of those cards followed it, which looked exactly
   * like the board shuffling cards between categories on its own.
   *
   * Pinning writes down the list a card is already shown in, so from then
   * on its list is a fact about the card and reordering can't touch it.
   * Runs on load, on create, and once more before any reorder.
   */
  function pinStatuses(s){
    for (const t of s.tasks){
      const cols = s.columns[ORG.spaces.idOf(t.space)];
      if (!cols || !cols.length) continue;
      if (t.status && cols.some(c => c.id === t.status)) continue;

      /* An unpinned task shows in whichever list is first. If that happens
         to be the Done list it only drifted there — dropping a card into
         Done always ticks it — so put it in the first unfinished list and
         undo the drift rather than freezing it. */
      const home = t.done
        ? (cols.find(c => c.done)  || cols[0])
        : (cols.find(c => !c.done) || cols[0]);
      t.status = home.id;
    }
    return s;
  }

  const byOrder = (a, b) => a.order - b.order || a.createdAt - b.createdAt;

  const cardsIn = colId => boardTasks().filter(t => columnOf(t).id === colId).sort(byOrder);

  /** Drop a card into a list at a given position, renumbering that list. */
  function moveTask(t, colId, index){
    const col = columnsIn(t.space).find(c => c.id === colId);
    if (!col) return;

    t.status = colId;
    t.done = !!col.done;

    // renumber against every task in the list, not just the visible ones,
    // so filtering the board can't scramble the hidden cards' order.
    // Same-space only — the other space has its own numbering.
    const siblings = state.tasks
      .filter(x => x.id !== t.id && x.space === t.space && columnOf(x).id === colId)
      .sort(byOrder);

    siblings.splice(U.clamp(index, 0, siblings.length), 0, t);
    siblings.forEach((x, i) => { x.order = i; });

    touch(t);
  }

  /** Ticking complete anywhere moves the card to the Done list, and back. */
  function setDone(t, value){
    const cols = columnsIn(t.space);
    const doneCol = cols.find(c => c.done);
    t.done = !!value;

    if (!doneCol) return touch(t);
    if (value) return moveTask(t, doneCol.id, 0);
    if (t.status === doneCol.id){
      const first = cols.find(c => !c.done) || cols[0];
      return moveTask(t, first.id, 0);
    }
    touch(t);
  }

  /**
   * Hand a task over to the other work area. Its board list only exists
   * in the space it came from, so it lands at the top of the matching
   * list over there. Attachments are moved separately by the editor,
   * which knows the project name the folder is built from.
   */
  function moveToSpace(t, id){
    if (!ORG.spaces.valid(id) || t.space === id) return;
    t.space = id;
    const cols = columnsIn(id);
    const target = (t.done && cols.find(c => c.done)) || cols[0];
    moveTask(t, target.id, 0);
  }

  function addColumn(name){
    const cols = columns();
    const col = { id:U.uid(), name: name || "New list", done:false };
    const doneAt = cols.findIndex(c => c.done);
    if (doneAt === -1) cols.push(col);
    else cols.splice(doneAt, 0, col);              // keep Done on the right
    save();
    return col;
  }

  function renameColumn(id, name){
    const col = columns().find(c => c.id === id);
    if (!col) return;
    col.name = name;
    save(true);
  }

  /** Drag a whole list left or right. Cards don't move — the list order
      is only how the board reads, so nothing about a task changes. */
  function moveColumn(id, index){
    const cols = columns();
    const from = cols.findIndex(c => c.id === id);
    if (from === -1) return;

    // write down where every card currently sits BEFORE the order changes,
    // so no card can be carried along by the list that used to be first
    pinStatuses(state);

    const [col] = cols.splice(from, 1);
    cols.splice(U.clamp(index, 0, cols.length), 0, col);
    save();
  }

  function removeColumn(id){
    const sid = space();
    const cols = columnsIn(sid);
    if (cols.length <= 1) return;
    const fallback = cols.find(c => c.id !== id);
    state.tasks.forEach(t => { if (t.space === sid && t.status === id) t.status = fallback.id; });
    state.columns[sid] = cols.filter(c => c.id !== id);
    save();
  }

  return {
    space, setSpace, tally, columns, columnsIn, moveToSpace,
    labelById, labelOf, labelName, colorsOf, hexOf, labelCount,
    addLabel, updateLabel, removeLabel, sortLabels, MAX_COLORS,
    boardTasks, columnOf, cardsIn, moveTask, setDone,
    addColumn, renameColumn, removeColumn, moveColumn,
    progress, folderProgress, leaves, stepById, locate, depthOf, folderById,
    addStep, addFolder, updateStep, removeStep, moveStep, clearDoneSteps,
    get state(){ return state; },
    get storageOK(){ return storageOK; },
    /** Set once a synced copy of data.json has moved past the one we loaded. */
    get stale(){ return stale; },
    /** Why data.json couldn't be read, if it couldn't. Nothing saves then. */
    get broken(){ return broken; },
    /** True while a write is on its way, or waiting out the debounce. */
    get busy(){ return saving > 0 || persist.pending(); },
    VERSION, KEY,
    load, save, setSaved, replaceState, defaults, normalizeTask, hydrate,
    byId, visible, live, tasksOn, covers, spanDays, lastDay, spanOnDay, durationOf,
    moveTo, setQuery, getQuery,
    archived, archivedCount, archive, restore, archiveDone,
    todoTasks, wallOrder, setPin, setSpan, tidyPins, cellsOf, footprintFree, MAX_SPAN,
    setLane,
    add, remove, touch,
  };
})();
