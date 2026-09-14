/* ============================================================
   core/files.js
   Attachment storage, with three backends picked automatically:

     "disk"   server.py is running (the normal case, via
              start.command). Imported files are copied into
              FILES/<space>/<project name>/ as real files you can
              see in Finder, and previews point straight at them.

     "idb"    no server, but the browser allows IndexedDB. Files
              are kept inside the browser's own database.

     "memory" neither is available — files last until reload.
              This is what happens if index.html is double-clicked.

   File metadata lives on the task (id, name, size, type, path);
   only the bytes are handled here.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.files = (() => {
  const DB_NAME = "organizer-files";
  const STORE   = "blobs";

  let db = null;
  let mode = "memory";
  const memory = new Map();      // id -> Blob   (memory fallback)
  const urls   = new Map();      // id -> object URL cache (non-disk modes)

  /* ============================================================
     SETUP
     ============================================================ */
  async function init(){
    if (await probeServer()){ mode = "disk"; return mode; }
    await openIDB();
    return mode;
  }

  /** Is server.py answering? Short timeout so file:// fails fast. */
  async function probeServer(){
    if (!location.protocol.startsWith("http")) return false;
    try {
      const ctrl = new AbortController();
      const bail = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch("/api/ping", { signal:ctrl.signal });
      clearTimeout(bail);
      if (!res.ok) return false;
      return !!(await res.json()).ok;
    } catch {
      return false;
    }
  }

  function openIDB(){
    return new Promise(resolve => {
      let settled = false;
      const settle = () => { if (!settled){ settled = true; resolve(mode); } };

      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch(e){ mode = "memory"; return settle(); }
      if (!req){ mode = "memory"; return settle(); }

      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath:"id" });
      };

      /* Success always wins, even if it lands after the timeout below
         already let boot continue — a first run has to create the
         database, which can take a moment on a cold start. */
      req.onsuccess = () => {
        db = req.result;
        mode = "idb";
        ORG.util.bus.emit("storage");
        settle();
      };
      req.onerror = req.onblocked = () => { if (!db) mode = "memory"; settle(); };
      setTimeout(() => { if (!db) mode = "memory"; settle(); }, 4000);
    });
  }

  const tx = writable =>
    db.transaction(STORE, writable ? "readwrite" : "readonly").objectStore(STORE);

  /* ============================================================
     DISK PATH LOOKUP
     The path lives on the task's file metadata, so read it back
     from the store rather than keeping a second index in sync.
     ============================================================ */
  function pathOf(id){
    const state = ORG.store && ORG.store.state;
    if (!state) return null;
    for (const t of state.tasks){
      for (const f of t.files) if (f.id === id) return f.path || null;
    }
    return null;
  }

  /** Disk path -> a URL the browser can load. */
  const toURL = path => "/" + path.split("/").map(encodeURIComponent).join("/");

  /* ============================================================
     CRUD
     ============================================================ */
  /**
   * Store a blob. Returns { id, path } — `path` is set in disk mode
   * and must be saved onto the task's file metadata by the caller.
   */
  async function put(id, blob, meta = {}){
    if (mode === "disk"){
      const q = new URLSearchParams({
        name: meta.name || "file",
        space: meta.space || ORG.spaces.nameOf(ORG.spaces.DEFAULT),
        project: meta.project || "Untitled",
      });
      const res = await fetch(`/api/files?${q}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || "save failed");
      return { id, path: out.path };
    }

    if (mode === "idb"){
      await new Promise((resolve, reject) => {
        const r = tx(true).put({ id, blob });
        r.onsuccess = resolve;
        r.onerror   = () => reject(r.error);
      });
      return { id };
    }

    memory.set(id, blob);
    return { id };
  }

  async function get(id){
    if (mode === "disk"){
      const path = pathOf(id);
      if (!path) return null;
      try {
        const res = await fetch(toURL(path));
        return res.ok ? await res.blob() : null;
      } catch { return null; }
    }

    if (mode === "idb"){
      return new Promise(resolve => {
        const r = tx(false).get(id);
        r.onsuccess = () => resolve(r.result ? r.result.blob : null);
        r.onerror   = () => resolve(null);
      });
    }

    return memory.get(id) || null;
  }

  /**
   * Remove stored bytes. Pass `knownPath` when the caller has already
   * detached the metadata from the task — otherwise there is nothing
   * left to look the path up from and the copy is orphaned on disk.
   */
  async function del(id, knownPath){
    if (mode === "disk"){
      const path = knownPath || pathOf(id);
      if (!path) return;
      try { await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method:"DELETE" }); }
      catch(e){ console.warn("Could not delete", path, e); }
      return;
    }

    revoke(id);
    if (mode === "idb"){
      return new Promise(resolve => {
        const r = tx(true).delete(id);
        r.onsuccess = r.onerror = () => resolve();
      });
    }
    memory.delete(id);
  }

  /**
   * Move a stored file into another space/project folder. Returns the new
   * path, or the old one if the move couldn't happen — never null, so a
   * failed tidy-up can't orphan a file's metadata.
   */
  async function relocate(path, project, space){
    if (mode !== "disk" || !path) return path;
    try {
      const q = new URLSearchParams({
        path,
        space: space || ORG.spaces.nameOf(ORG.spaces.DEFAULT),
        project: project || "Untitled",
      });
      const res = await fetch(`/api/files/relocate?${q}`, { method:"POST" });
      const out = await res.json();
      return (res.ok && out.path) ? out.path : path;
    } catch(e){
      console.warn("Could not relocate", path, e);
      return path;
    }
  }

  /**
   * A URL the browser can render. On disk that's the real file path,
   * so previews stream off disk instead of loading into memory first.
   * Returns null when the bytes are gone.
   */
  async function url(id){
    if (mode === "disk"){
      const path = pathOf(id);
      return path ? toURL(path) : null;
    }
    if (urls.has(id)) return urls.get(id);
    const blob = await get(id);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    urls.set(id, u);
    return u;
  }

  function revoke(id){
    if (!urls.has(id)) return;
    URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
  }

  /* ============================================================
     CLASSIFICATION — drives which preview component is used
     ============================================================ */
  const EXT_KIND = {
    png:"image", jpg:"image", jpeg:"image", gif:"image", webp:"image",
    svg:"image", bmp:"image", avif:"image", heic:"image",
    mp4:"video", mov:"video", webm:"video", m4v:"video",
    mp3:"audio", wav:"audio", aac:"audio", m4a:"audio", aif:"audio", aiff:"audio",
    pdf:"pdf",
    txt:"text", md:"text", json:"text", csv:"text", srt:"text",
    log:"text", jsx:"text", js:"text", css:"text", html:"text",
  };

  const ext = name => (name.split(".").pop() || "").toLowerCase();

  /** "image" | "video" | "audio" | "pdf" | "text" | "other" */
  function kind(meta){
    const t = (meta.type || "").toLowerCase();
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("text/") || t === "application/json") return "text";
    return EXT_KIND[ext(meta.name)] || "other";
  }

  return {
    init, put, get, del, url, revoke, kind, ext, pathOf, relocate,
    get mode(){ return mode; },
    get onDisk(){ return mode === "disk"; },
    get persistent(){ return mode === "disk" || mode === "idb"; },
  };
})();
