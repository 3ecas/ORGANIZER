/* ============================================================
   ui/editor.js
   The task modal.
     LEFT  pane — the facts: client, board list, when it starts and
                  ends, the deadline. Read at a glance, rarely scrolled.
     RIGHT pane — where the work is: notes, the task list and the
                  files, in tabs. See ui/cardpanel.js.

   Edits apply immediately (there is no Save button). Text fields
   write straight to the task and only broadcast a re-render on a
   short debounce so typing never re-renders the calendar per key.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.editor = (() => {
  const U = ORG.util;
  const F = ORG.files;

  let task = null;              // task currently open, or null
  let selectedFile = null;      // id of the file shown in the preview
  let lastLabel = null;         // inherited by the next task created
  let warnedVolatile = false;

  const isOpen = () => !!task;

  /* Broadcast a re-render, but not on every keystroke. */
  const broadcast = U.debounce(() => U.bus.emit("change"), 350);
  function commit(now){
    task.updatedAt = Date.now();
    ORG.store.save(true);
    now ? U.bus.emit("change") : broadcast();
  }

  /* ============================================================
     OPEN / CLOSE
     ============================================================ */
  function open(id){
    const t = ORG.store.byId(id);
    if (!t) return;
    task = t;
    selectedFile = t.files.length ? t.files[0].id : null;

    ORG.labels.reset();        // no label left mid-edit from last time
    ORG.cardpanel.reset();     // every card opens on the first tab
    fillLeft();
    refreshPanel();

    U.$("#modal").classList.add("on");
    U.$("#scrim").classList.add("on");
    setTimeout(() => { U.$("#m-title").focus(); U.$("#m-title").select(); }, 70);
  }

  function close(){
    /* an untouched blank task is noise — bin it */
    if (task && !task.title.trim() && !task.subtitle.trim() && !task.notes.trim()
        && !task.files.length && !task.steps.length){
      ORG.store.remove(task.id);
    } else if (task){
      syncProjectFolder(task);          // follows a renamed project
    }
    task = null;
    U.$("#modal").classList.remove("on");
    U.$("#scrim").classList.remove("on");
    U.bus.emit("change");
  }

  /* ============================================================
     LEFT PANE
     ============================================================ */
  /** The stacked panel on the right redraws itself; it owns its own nodes. */
  function refreshPanel(){
    if (!task) return;
    ORG.cardpanel.render(U.$("#m-stack"), task);
  }

  /** Notes live in the panel, so it hands the text back here to be stored. */
  function writeNotes(text){
    if (!task) return;
    task.notes = text;
    commit();
  }

  function fillLeft(){
    U.$("#m-title").value = task.title;
    U.$("#m-subtitle").value = task.subtitle;
    ORG.labels.stripe(U.$("#m-dot"), ORG.store.colorsOf(task), "to bottom");

    U.$("#m-done").classList.toggle("on", task.done);
    U.$("#m-sched").classList.toggle("on", !!task.date);
    U.$("#m-allday").classList.toggle("on", !task.start);

    U.$("#m-date").value  = task.date  || U.ymd(new Date());
    U.$("#m-start").value = task.start || "09:00";
    U.$("#m-end").value   = task.end   || "10:00";
    U.$("#m-until").value = task.endDate || "";
    U.$("#m-due").value   = task.due || "";

    renderSpacePicker();
    renderListPicker();
    renderLabels();
    syncScheduleFields();
  }

  /** Which work area this task lives in. */
  function renderSpacePicker(){
    const sel = U.$("#m-space");
    sel.innerHTML = "";
    for (const s of ORG.spaces.all()){
      const o = U.el("option", null, s.name);
      o.value = s.id;
      sel.append(o);
    }
    sel.value = task.space;
  }

  /** Which board list this card sits in. Kept in step with the Completed toggle. */
  function renderListPicker(){
    const sel = U.$("#m-list");
    sel.innerHTML = "";
    for (const col of ORG.store.columnsIn(task.space)){
      const o = U.el("option", null, col.name);
      o.value = col.id;
      sel.append(o);
    }
    sel.value = ORG.store.columnOf(task).id;
    U.$("#m-done").classList.toggle("on", task.done);
  }

  const MIN_BLOCK = 15;   // minutes — the shortest stretch worth drawing

  /** Which client this job belongs to, and the tools to manage the list. */
  function renderLabels(){
    ORG.labels.picker(U.$("#m-labels"), task, () => {
      lastLabel = task.label;
      ORG.labels.stripe(U.$("#m-dot"), ORG.store.colorsOf(task), "to bottom");
      renderLabels();
      commit(true);
    });
  }

  /**
   * Show/hide the date rows to match the two toggles. Start/End and Last day
   * are alternatives, not extras: a block has a clock, an all-day job has a
   * run of days, and nothing sensibly has both.
   */
  function syncScheduleFields(){
    const scheduled = U.$("#m-sched").classList.contains("on");
    const allDay    = U.$("#m-allday").classList.contains("on");
    U.$("#m-schedfields").style.display = scheduled ? "flex" : "none";
    /* "Ends on" applies either way now — a job can run to Friday and still
       know it starts at 14:00. Only the hours come and go. */
    /* the two dates always apply; only the clocks come and go */
    U.$("#m-startwrap").style.visibility = (scheduled && !allDay) ? "" : "hidden";
    U.$("#m-endwrap").style.visibility   = (scheduled && !allDay) ? "" : "hidden";
    showSpanNote();
  }

  /** Say what the two datetimes add up to, so they aren't just four fields. */
  function showSpanNote(){
    const note = U.$("#m-spannote");
    if (!task || !task.date){ note.textContent = ""; return; }
    note.textContent = ORG.ui.whenText(task);
  }

  /** Pull the schedule controls back into the task. */
  function readSchedule(){
    if (!U.$("#m-sched").classList.contains("on")){
      task.date = null;
      task.start = null;
      task.endDate = null;
      return;
    }

    const wasDate = task.date;
    task.date = U.$("#m-date").value || U.ymd(new Date());

    /* Moving the first day slides the whole job rather than stretching it,
       which is what dragging the bar to another day does too. */
    let until = U.$("#m-until").value;
    if (until && wasDate && wasDate !== task.date && until > wasDate){
      const len = U.daysBetween(wasDate, until);
      until = U.ymd(U.addDays(U.parseYmd(task.date), len));
    }
    // a last day that isn't after the first isn't a run, it's a typo
    task.endDate = (until && until > task.date) ? until : null;
    U.$("#m-until").value = task.endDate || "";

    if (U.$("#m-allday").classList.contains("on")){
      task.start = task.end = null;
      showSpanNote();
      return;
    }

    task.start = U.$("#m-start").value || "09:00";
    task.end   = U.$("#m-end").value || "10:00";

    /* Within one day the end has to come after the start. Across days it
       needn't: finishing Friday at 09:00 having begun Wednesday at 14:00
       is an ordinary week. */
    if (!task.endDate && U.parseTime(task.end) <= U.parseTime(task.start)){
      const s = U.parseTime(task.start);
      task.end = U.fmtMin(Math.min(s + MIN_BLOCK, 1439));
      U.$("#m-end").value = task.end;
    }
    showSpanNote();
  }

  /* ============================================================
     RIGHT PANE — files
     ============================================================ */
  function refreshFiles(){
    if (!task) return;

    if (selectedFile && !task.files.some(f => f.id === selectedFile)){
      selectedFile = task.files.length ? task.files[0].id : null;
    }

    /* the Files section may be folded away, or empty and collapsed */
    const strip = U.$("#filestrip");
    if (!strip) return;

    ORG.preview.renderStrip(strip, task, selectedFile, id => {
      selectedFile = id;
      refreshFiles();
    });

    const meta = task.files.find(f => f.id === selectedFile) || null;
    ORG.preview.renderMain(U.$("#preview"), meta, task);
  }

  async function addFiles(fileList){
    if (!task || !fileList || !fileList.length) return;

    if (!F.onDisk && !warnedVolatile){
      warnedVolatile = true;
      U.toast("Not connected to the files folder — start with start.command");
    }

    let copied = 0;
    for (const file of fileList){
      const id = U.uid();
      const at = Date.now();
      try {
        const saved = await F.put(id, file, {
          name: file.name, at,
          space:   ORG.spaces.nameOf(task.space),   // these two decide
          project: projectName(),                   // the FILES/ subfolder
        });
        task.files.push({
          id, at,
          name: file.name,
          size: file.size,
          type: file.type,
          path: saved.path || null,        // set in disk mode
        });
        selectedFile = id;
        copied++;
      } catch(err){
        console.error(err);
        U.toast(`Couldn't attach ${file.name} — ${err.message}`);
      }
    }

    ORG.store.touch(task);
    /* You can drop files onto the pane from any tab. Having done it, what you
       want to see is the files — so go there rather than leaving the drop
       looking like it did nothing. */
    if (copied) ORG.cardpanel.show("files");
    else refreshPanel();

    if (copied && F.onDisk){
      const where = task.files[task.files.length - 1].path;
      U.toast(`Copied to ${where.replace(/\/[^/]+$/, "/")}`);
    }
  }

  /** The project a task's files belong to — its title. */
  const projectName = () => (task.title || "").trim() || "Untitled";

  /**
   * Keep FILES/ honest: if the project was renamed, or handed to the other
   * space, move its attachments into the folder that now matches. Renames
   * run on close rather than per keystroke, so a half-typed title never
   * makes a folder. Each file keeps working either way — relocate falls
   * back to the existing path if the move fails.
   */
  async function syncProjectFolder(t){
    if (!F.onDisk || !t.files.length) return;

    const project = (t.title || "").trim() || "Untitled";
    const space   = ORG.spaces.nameOf(t.space);

    const stale = t.files.filter(f => f.path && !inFolderFor(f.path, space, project));
    if (!stale.length) return;

    for (const f of stale) f.path = await F.relocate(f.path, project, space);
    ORG.store.save(true);
  }

  /** Cheap check that a path already sits in this space's project folder. */
  function inFolderFor(path, space, project){
    const folder = path.split("/").slice(0, -1).join("/").toLowerCase();
    const want = ["FILES", safeFolder(space), safeFolder(project)].join("/");
    return folder === want.toLowerCase();
  }

  /** Mirrors safe_folder() in server.py, so this check agrees with where
      the file actually ends up and we don't move files on every close. */
  const safeFolder = raw =>
    String(raw)
      .replace(/[\\/]/g, " ")
      .replace(/[<>:"|?*#%\x00-\x1f\x7f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 80) || "Untitled";

  /* ============================================================
     WIRING  (once, at boot)
     ============================================================ */
  function init(){
    /* --- header --- */
    U.$("#m-close").addEventListener("click", close);
    U.$("#scrim").addEventListener("click", close);

    /* Clicking anywhere else in the card closes the label dropdown. Same
       reasoning as the topbar menu: the ✎ redraws the list, so the clicked
       node is gone before this runs and only the event path still knows
       the click came from inside. */
    U.$("#modal").addEventListener("click", e => {
      if (!isOpen() || ORG.labels.cameFrom(e, "m-labels")) return;
      if (ORG.labels.closeMenu()) renderLabels();
    });

    U.$("#m-title").addEventListener("input", e => { task.title = e.target.value; commit(); });
    U.$("#m-title").addEventListener("keydown", e => {
      // Enter drops into the subtitle rather than closing — they're one thought
      if (e.key === "Enter"){ e.preventDefault(); U.$("#m-subtitle").focus(); }
    });

    U.$("#m-subtitle").addEventListener("input", e => { task.subtitle = e.target.value; commit(); });
    U.$("#m-subtitle").addEventListener("keydown", e => {
      if (e.key === "Enter"){ e.preventDefault(); commit(true); close(); }
    });

    U.$("#m-dup").addEventListener("click", () => {
      const copy = ORG.store.add({
        ...task, id:U.uid(), createdAt:Date.now(), updatedAt:Date.now(),
        done:false, files:[],                      // a copy starts with its own files
        title: task.title ? task.title + " (copy)" : "",
      });
      U.toast("Duplicated — attachments not copied");
      open(copy.id);
    });

    U.$("#m-archive").addEventListener("click", () => {
      const t = task;
      task = null;                       // close without the blank-task sweep
      U.$("#modal").classList.remove("on");
      U.$("#scrim").classList.remove("on");
      ORG.store.archive(t);
      U.toast(`Archived — find it under the archive button`);
    });

    U.$("#m-del").addEventListener("click", () => {
      if (!confirm(`Delete “${task.title || "Untitled"}”?\n\nIts ${task.files.length} attachment(s) go too.`)) return;
      const id = task.id;
      task = null;
      U.$("#modal").classList.remove("on");
      U.$("#scrim").classList.remove("on");
      ORG.store.remove(id);
      U.toast("Deleted");
    });

    /* --- toggles --- */
    U.$("#m-done").addEventListener("click", () => {
      U.$("#m-done").classList.toggle("on");
      // routes through the store so the board card follows the tick
      ORG.store.setDone(task, U.$("#m-done").classList.contains("on"));
      renderListPicker();
    });

    U.$("#m-list").addEventListener("change", e => {
      ORG.store.moveTask(task, e.target.value, 0);
      renderListPicker();                 // the Done list flips the tick
    });

    /* Handing a task to the other space takes its files with it. */
    U.$("#m-space").addEventListener("change", async e => {
      const to = e.target.value;
      const moving = task;                // it may be closed before we finish
      ORG.store.moveToSpace(moving, to);
      renderListPicker();                 // its lists live over there now
      await syncProjectFolder(moving);
      // it has just vanished from the view behind the modal, so say where to
      U.toast(`Now in ${ORG.spaces.nameOf(to)} — switch spaces to find it`);
    });

    U.$("#m-sched").addEventListener("click", () => {
      U.$("#m-sched").classList.toggle("on");
      syncScheduleFields();
      readSchedule();
      commit(true);
    });

    U.$("#m-allday").addEventListener("click", () => {
      U.$("#m-allday").classList.toggle("on");
      syncScheduleFields();
      readSchedule();
      commit(true);
    });

    /* --- schedule + deadline fields --- */
    ["#m-date", "#m-start", "#m-end", "#m-until"].forEach(sel => {
      U.$(sel).addEventListener("change", () => { readSchedule(); commit(true); });
    });

    U.$("#m-untilclear").addEventListener("click", () => {
      U.$("#m-until").value = "";
      readSchedule();
      commit(true);
    });

    U.$("#m-due").addEventListener("change", e => {
      task.due = e.target.value || null;
      commit(true);
    });
    U.$("#m-dueclear").addEventListener("click", () => {
      task.due = null;
      U.$("#m-due").value = "";
      commit(true);
    });

    /* --- files: OS drag-drop, paste ---
       The Attach buttons live inside the panel and are wired as it draws;
       only the hidden input is permanent, so only it gets wired here. */
    U.$("#filein").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });

    const pane = U.$("#pane-right");
    const veil = U.$("#dropveil");
    let depth = 0;                      // dragenter/leave fire for children too

    pane.addEventListener("dragenter", e => {
      if (!isOpen()) return;
      e.preventDefault(); depth++; veil.classList.add("on");
    });
    pane.addEventListener("dragover", e => { if (isOpen()) e.preventDefault(); });
    pane.addEventListener("dragleave", () => {
      if (--depth <= 0){ depth = 0; veil.classList.remove("on"); }
    });
    pane.addEventListener("drop", e => {
      if (!isOpen()) return;
      e.preventDefault();
      depth = 0; veil.classList.remove("on");
      addFiles(e.dataTransfer.files);
    });

    document.addEventListener("paste", e => {
      if (!isOpen()) return;
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length){ e.preventDefault(); addFiles(files); }
    });

    /* the browser would otherwise navigate away when a file misses the pane */
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", e => e.preventDefault());
  }

  /** Escape closes the label dropdown before it closes the whole card. */
  function dismissLabels(){
    if (!isOpen() || !ORG.labels.closeMenu()) return false;
    renderLabels();
    return true;
  }

  return {
    init, open, close, isOpen, dismissLabels,
    refreshFiles, refreshPanel, writeNotes,
    lastLabel: () => lastLabel,
    current: () => task,
  };
})();
