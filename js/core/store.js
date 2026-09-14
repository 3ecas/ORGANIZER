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

  let state = null;
  let query = "";
  let storageOK = true;

  /* ============================================================
     MODEL
     ============================================================ */

  /**
   * A task. Everything optional is nulled rather than absent so the
   * rest of the app never has to guard for undefined.
   *
   *  space     "work" | "personal"   which work area it belongs to
   *  date      "YYYY-MM-DD" | null   where it sits on the calendar (first day)
   *  endDate   "YYYY-MM-DD" | null   last day of a run; null = just the one day
   *  start     "HH:MM" | null        null = untimed (all-day strip)
   *  dur       minutes               start + dur is the end time shown in the form
   *  due       "YYYY-MM-DD" | null   deadline, independent of `date`
   *  entries   [{id, min, note, at}] logged work
   *  files     [{id, name, size, type, at}]  blobs live in core/files.js
   */
  function normalizeTask(t){
    if (!t || typeof t !== "object") return null;
    const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

    const date  = isDate(t.date) ? t.date : null;
    const start = typeof t.start === "string" && /^\d{1,2}:\d{2}/.test(t.start) ? t.start.slice(0,5) : null;
    /* A run of days only means anything for an all-day task that's actually
       on the calendar, and only forwards. Anything else isn't a run. */
    const endDate = (date && !start && isDate(t.endDate) && t.endDate > date) ? t.endDate : null;

    return {
      id:     t.id || U.uid(),
      space:  ORG.spaces.idOf(t.space),
      title:  String(t.title ?? "").slice(0, 500),
      /* the second line under the title — which cut, which deliverable,
         which client. Short on purpose: it rides along everywhere the
         title does, including one-line chips on the calendar. */
      subtitle: String(t.subtitle ?? "").slice(0, 160),
      notes:  String(t.notes ?? ""),
      date, endDate, start,
      dur:    Number.isFinite(+t.dur) ? U.clamp(+t.dur, 15, 1440) : 60,
      due:    isDate(t.due) ? t.due : null,
      /* which label (client) this belongs to. `color` is what the field
         was called before labels had names, and still reads fine. */
      label:  typeof t.label === "string" ? t.label
            : typeof t.color === "string" ? t.color : null,
      done:   !!t.done,
      /* board position: which list it sits in, and where in that list */
      status: typeof t.status === "string" ? t.status : null,
      order:  Number.isFinite(+t.order) ? +t.order : 0,
      /* the checklist inside the card — what actually has to be done */
      steps: Array.isArray(t.steps)
        ? t.steps.map(s => ({
            id:   s.id || U.uid(),
            text: String(s.text ?? "").slice(0, 300),
            done: !!s.done,
          }))
        : [],
      entries: Array.isArray(t.entries)
        ? t.entries.map(e => ({
            id:   e.id || U.uid(),
            min:  U.clamp(Math.round(+e.min || 0), 0, 100000),
            note: String(e.note ?? ""),
            at:   +e.at || Date.now(),
          })).filter(e => e.min > 0)
        : [],
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
      createdAt: +t.createdAt || Date.now(),
      updatedAt: +t.updatedAt || Date.now(),
    };
  }

  /** Total minutes logged against a task. */
  const logged = t => t.entries.reduce((a, e) => a + e.min, 0);

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
    state.tasks.filter(t => t.space === space() && t.label === id && !t.done).length;

  /* ============================================================
     CHECKLIST — the steps inside a card
     ============================================================ */
  const progress = t => ({
    done:  t.steps.filter(s => s.done).length,
    total: t.steps.length,
  });

  function addStep(t, text, index){
    const step = { id:U.uid(), text:String(text || "").slice(0, 300), done:false };
    if (Number.isInteger(index)) t.steps.splice(U.clamp(index, 0, t.steps.length), 0, step);
    else t.steps.push(step);
    touch(t);
    return step;
  }

  function updateStep(t, id, patch){
    const step = t.steps.find(s => s.id === id);
    if (!step) return null;
    Object.assign(step, patch);
    // text edits shouldn't repaint the whole app on every keystroke
    patch.text !== undefined ? save(true) : touch(t);
    return step;
  }

  function removeStep(t, id){
    t.steps = t.steps.filter(s => s.id !== id);
    touch(t);
  }

  function moveStep(t, id, index){
    const from = t.steps.findIndex(s => s.id === id);
    if (from === -1) return;
    const [step] = t.steps.splice(from, 1);
    t.steps.splice(U.clamp(index, 0, t.steps.length), 0, step);
    touch(t);
  }

  const clearDoneSteps = t => {
    t.steps = t.steps.filter(s => !s.done);
    touch(t);
  };

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
        date:today, start:"09:30", dur:120, due:fri, label:"client-a",
        status:"doing", order:0,
        entries:[{ id:U.uid(), min:95, note:"first pass", at: now - 86400000 }],
        steps:[
          { id:U.uid(), text:"Listen through, mark the beats", done:true },
          { id:U.uid(), text:"Moodboard + colour script",      done:true },
          { id:U.uid(), text:"Storyboard the opening sequence", done:false },
          { id:U.uid(), text:"Animate 00:00 – 01:10",           done:false },
          { id:U.uid(), text:"Type treatment for the title",    done:false },
          { id:U.uid(), text:"Grade and export the master",     done:false },
        ] },
      { title:"Client call — feedback round 2", notes:"",
        date:today, start:"15:00", dur:45, label:"review", status:"doing", order:1 },
      { title:"Render + export deliverables", notes:"ProRes 4444 master + H.264 web cut.",
        date:tmr, start:null, dur:60, due:tmr, label:"delivered", status:"review", order:0 },
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
      timer: null,                    // { taskId, since } while a timer runs
      settings: {
        theme: "dark",
        space: ORG.spaces.DEFAULT,    // the work area currently on screen
        view: "week",
        lastDated: "week",            // calendar view to return to when leaving the board
        hideDone: false,
        dayStart: 7,                  // first hour drawn in day/week
        dayEnd: 23,                   // last hour drawn
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
      timer: raw.timer && raw.timer.taskId ? raw.timer : null,
      settings: { ...d.settings, ...(raw.settings || {}),
                  space: ORG.spaces.idOf((raw.settings || {}).space) },
    }));
  }

  /** data.json, via server.py. Null when there's nothing usable there. */
  async function readDisk(){
    try {
      const res = await fetch("/api/state");
      const raw = await res.json();
      if (!res.ok || raw.error) throw new Error(raw.error || res.status);
      return Array.isArray(raw.tasks) ? raw : null;
    } catch(e){
      console.warn("Could not read data.json.", e);
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
      try {
        const res = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(state),
        });
        const out = await res.json();
        if (!res.ok || out.error) throw new Error(out.error || res.status);
        setSaved("Saved to this folder", false);
      } catch(e){
        console.error("Write failed", e);
        setSaved("Not saved — check Terminal", true);
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
    const mine = state.tasks.filter(t => t.space === id);
    return {
      open: mine.filter(t => !t.done).length,
      hits: query ? mine.filter(matches).length : null,
    };
  }

  /* ============================================================
     QUERIES
     ============================================================ */
  const byId = id => state.tasks.find(t => t.id === id);

  const matches = t => {
    if (!query) return true;
    return t.title.toLowerCase().includes(query)
        || t.notes.toLowerCase().includes(query)
        || labelName(t).toLowerCase().includes(query)
        || t.files.some(f => f.name.toLowerCase().includes(query));
  };

  /** Tasks in this space passing the label filter, hide-done and search. */
  const visible = () => state.tasks.filter(t =>
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

  /** How many days a task runs for. 1 unless it's an all-day run. */
  const spanDays = t =>
    t.date && t.endDate ? U.daysBetween(t.date, t.endDate) + 1 : 1;

  const tasksOn = d => {
    const key = typeof d === "string" ? d : U.ymd(d);
    return visible().filter(t => covers(t, key));
  };

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

  const setQuery = q => { query = (q || "").trim().toLowerCase(); U.bus.emit("change"); };
  const getQuery = () => query;

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
    if (state.timer && state.timer.taskId === id) state.timer = null;
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

  /** Label filter + search, but never hide-done: the board HAS a Done list. */
  const boardTasks = () => state.tasks.filter(t =>
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
    progress, addStep, updateStep, removeStep, moveStep, clearDoneSteps,
    get state(){ return state; },
    get storageOK(){ return storageOK; },
    VERSION, KEY,
    load, save, setSaved, replaceState, defaults, normalizeTask, hydrate,
    byId, visible, tasksOn, covers, spanDays, moveTo, logged, setQuery, getQuery,
    add, remove, touch,
  };
})();
