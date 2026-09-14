/* ============================================================
   core/backup.js
   Export / import a single portable file containing BOTH the task
   data and every attached file.

   .organizer layout
     bytes  0..7    magic  "ORGZ0001"
     bytes  8..15   header length, zero-padded ASCII decimal
     next N bytes   UTF-8 JSON  { state, blobs:[{id,size,type}] }
     remainder      the raw attachment bytes, concatenated in order

   Storing the blobs raw (rather than base64) keeps the backup the
   same size as the originals and means we never hold the whole
   thing in memory — Blob slices stream straight off disk.

   Plain .json files (data only, no attachments) import too, so an
   older export still opens.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.backup = (() => {
  const U = ORG.util;
  const MAGIC = "ORGZ0001";
  const PREFIX = 16;               // magic + 8-digit length

  function download(blob, filename){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  async function exportBundle(){
    const state = ORG.store.state;
    const metas = [];
    const parts = [];

    for (const t of state.tasks){
      for (const f of t.files){
        const blob = await ORG.files.get(f.id);
        if (!blob) continue;                       // bytes no longer available
        metas.push({
          id: f.id,
          size: blob.size,
          type: blob.type || f.type || "",
          name: f.name,                            // needed to re-file it on import
          at: f.at,
        });
        parts.push(blob);
      }
    }

    const header = new TextEncoder().encode(JSON.stringify({ state, blobs:metas }));
    const prefix = MAGIC + String(header.length).padStart(8, "0");

    const bundle = new Blob([prefix, header, ...parts], { type:"application/octet-stream" });
    download(bundle, `organizer-${U.ymd(new Date())}.organizer`);

    const n = metas.length;
    U.toast(`Backup saved — ${state.tasks.length} tasks, ${n} file${n === 1 ? "" : "s"}`);
  }

  /* ============================================================
     IMPORT
     ============================================================ */
  async function importFile(file){
    try {
      const head = await file.slice(0, PREFIX).text();
      return head.startsWith("ORGZ")
        ? await importBundle(file, head)
        : await importPlainJSON(file);
    } catch(err){
      console.error(err);
      alert("That file could not be read as an Organizer backup.\n\n" + err.message);
    }
  }

  async function importBundle(file, head){
    const headerLen = parseInt(head.slice(8, PREFIX), 10);
    if (!Number.isFinite(headerLen)) throw new Error("Corrupt header.");

    const payload = JSON.parse(await file.slice(PREFIX, PREFIX + headerLen).text());
    if (!payload.state || !Array.isArray(payload.state.tasks)) throw new Error("No task data inside.");

    const blobs = Array.isArray(payload.blobs) ? payload.blobs : [];
    if (!confirmReplace(payload.state.tasks.length, blobs.length)) return;

    // Attachment bytes sit end-to-end after the header; walk the offsets.
    // Restoring re-files each one, so remember where it landed.
    const newPath = {};
    const home = filingPlan(payload.state.tasks);
    let offset = PREFIX + headerLen;
    let restored = 0;

    for (const m of blobs){
      const slice = file.slice(offset, offset + m.size, m.type || "");
      offset += m.size;
      try {
        const saved = await ORG.files.put(m.id, slice,
          { name:m.name, at:m.at, ...(home[m.id] || {}) });
        if (saved.path) newPath[m.id] = saved.path;
        restored++;
      } catch(err){
        console.error(`Could not restore ${m.name}`, err);
      }
    }

    // Point the incoming metadata at the copies we just wrote.
    for (const t of payload.state.tasks){
      for (const f of (t.files || [])) if (newPath[f.id]) f.path = newPath[f.id];
    }

    ORG.store.replaceState(payload.state);
    U.toast(`Restored ${payload.state.tasks.length} tasks and ${restored} files`);
  }

  /**
   * The blob list in the header doesn't say which task owns what, so work
   * it out from the incoming tasks first. Without this every restored file
   * would be dumped into one folder instead of back under its own space
   * and project.
   */
  function filingPlan(tasks){
    const plan = {};
    for (const t of tasks){
      const where = {
        space:   ORG.spaces.nameOf(t.space),
        project: (t.title || "").trim() || "Untitled",
      };
      for (const f of (t.files || [])) plan[f.id] = where;
    }
    return plan;
  }

  async function importPlainJSON(file){
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.tasks)) throw new Error("No tasks array in this JSON.");
    if (!confirmReplace(data.tasks.length, 0)) return;
    ORG.store.replaceState(data);
    U.toast(`Restored ${data.tasks.length} tasks (no attachments in a .json backup)`);
  }

  function confirmReplace(taskCount, fileCount){
    const have = ORG.store.state.tasks.length;
    return confirm(
      `Replace everything currently in Organizer?\n\n` +
      `Current:  ${have} task${have === 1 ? "" : "s"}\n` +
      `Incoming: ${taskCount} task${taskCount === 1 ? "" : "s"}` +
      (fileCount ? `, ${fileCount} attachment${fileCount === 1 ? "" : "s"}` : "") +
      `\n\nThis cannot be undone.`
    );
  }

  return { exportBundle, importFile };
})();
