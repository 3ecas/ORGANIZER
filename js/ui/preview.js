/* ============================================================
   ui/preview.js
   Everything that draws attachments: the thumbnail strip along the
   top of the right pane and the large preview underneath it.

   Blob loading is async, so each render takes a token and bails if
   another render started meanwhile — otherwise a slow video thumb
   could land in the pane after you already clicked something else.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.preview = (() => {
  const U = ORG.util;
  const F = ORG.files;
  const TEXT_LIMIT = 200_000;        // don't try to render giant text files

  let token = 0;

  /* ============================================================
     THUMBNAIL STRIP
     ============================================================ */
  function renderStrip(box, task, selectedId, onSelect){
    box.innerHTML = "";
    for (const meta of task.files){
      box.append(thumb(meta, meta.id === selectedId, onSelect, task));
    }
  }

  function thumb(meta, selected, onSelect, task){
    const n = U.el("div", "fthumb" + (selected ? " on" : ""));
    n.title = `${meta.name}\n${U.bytes(meta.size)}`;

    const box = U.el("div", "box");
    box.append(U.el("span", "ext", F.ext(meta.name) || "file"));
    n.append(box);
    n.append(U.el("div", "nm", meta.name));

    /* swap the extension label for a real thumbnail once the file loads */
    const k = F.kind(meta);
    if (k === "image"){
      F.url(meta.id).then(url => {
        if (!url) return;
        const img = U.el("img");
        img.onload = () => { box.innerHTML = ""; box.append(img); };
        img.src = url;
      });
    }
    else if (k === "video"){
      F.url(meta.id).then(url => {
        if (!url) return;
        const v = U.el("video");
        v.muted = true;
        v.preload = "metadata";           // don't pull a whole render down for a thumb
        v.onloadedmetadata = () => {
          // nudge past frame zero, which is often black
          try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { /* ignore */ }
        };
        v.onseeked = () => { box.innerHTML = ""; box.append(v); };
        v.src = url;
      });
    }

    const rm = U.el("button", "rm", "×");
    rm.title = "Remove this file";
    rm.addEventListener("click", e => {
      e.stopPropagation();
      const where = ORG.files.onDisk && meta.path
        ? `\n\nThe copy at ${meta.path} is deleted too.\nYour original file is untouched.`
        : "";
      if (!confirm(`Remove “${meta.name}” from this task?${where}`)) return;

      // pass the path explicitly — the metadata is about to disappear
      F.del(meta.id, meta.path);
      task.files = task.files.filter(f => f.id !== meta.id);
      ORG.store.touch(task);
      ORG.editor.refreshFiles();
    });
    n.append(rm);

    n.addEventListener("click", () => onSelect(meta.id));
    return n;
  }

  /* ============================================================
     LARGE PREVIEW
     ============================================================ */
  async function renderMain(box, meta, task){
    const mine = ++token;
    box.innerHTML = "";

    if (!meta){ box.append(emptyState(task)); return; }

    const url = await F.url(meta.id);
    if (mine !== token) return;                 // superseded

    if (!url){ box.append(missingState(meta)); return; }

    const body = await buildBody(F.kind(meta), meta, url);
    if (mine !== token) return;

    box.append(body);
    box.append(metaRow(meta, url));
  }

  async function buildBody(kind, meta, url){
    if (kind === "image"){
      const img = U.el("img");
      img.src = url; img.alt = meta.name;
      return img;
    }
    if (kind === "video"){
      const v = U.el("video");
      v.src = url; v.controls = true; v.preload = "metadata";
      return v;
    }
    if (kind === "audio"){
      const wrap = U.el("div", "pv-generic");
      wrap.append(U.el("div", "big", F.ext(meta.name)));
      const a = U.el("audio");
      a.src = url; a.controls = true;
      wrap.append(a);
      return wrap;
    }
    if (kind === "pdf"){
      const f = U.el("iframe");
      f.src = url;
      f.title = meta.name;
      return f;
    }
    if (kind === "text"){
      const pre = U.el("pre");
      try {
        const blob = await F.get(meta.id);
        const text = await blob.slice(0, TEXT_LIMIT).text();
        pre.textContent = text + (blob.size > TEXT_LIMIT ? "\n\n… truncated" : "");
      } catch {
        pre.textContent = "Could not read this file as text.";
      }
      return pre;
    }
    const g = U.el("div", "pv-generic");
    g.append(U.el("div", "big", F.ext(meta.name) || "file"));
    g.append(U.el("div", null, "No inline preview for this format."));
    return g;
  }

  /* ============================================================
     STATES
     ============================================================ */
  function metaRow(meta, url){
    const row = U.el("div", "pv-meta");
    row.append(U.el("span", "nm", meta.name));
    row.append(U.el("span", null, U.bytes(meta.size)));

    /* show where the copy actually lives, so it's findable in Finder */
    if (ORG.files.onDisk && meta.path){
      const folder = meta.path.replace(/\/[^/]+$/, "/");
      const tag = U.el("span", null, folder);
      tag.title = meta.path;
      row.append(tag);
    }

    const open = U.el("button", "btn sm", "Open");
    open.title = "Open in a new tab";
    open.addEventListener("click", () => window.open(url, "_blank"));
    row.append(open);

    const dl = U.el("button", "btn sm", "Save as…");
    dl.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = url; a.download = meta.name; a.click();
    });
    row.append(dl);

    return row;
  }

  function emptyState(task){
    const n = U.el("div", "pv-empty");
    n.append(U.icon(
      "M21 15V6a3 3 0 00-3-3H6a3 3 0 00-3 3v12a3 3 0 003 3h9M8 11h8M8 15h5",
      ""
    ));
    n.append(U.el("div", null,
      task && task.files.length
        ? "Pick a file above to preview it."
        : "Drop files here to attach them.\nImages, video, PDFs, text — anything." +
          (ORG.files.onDisk
            ? "\n\nA copy goes into FILES/, in a folder named after this project."
            : "")
    ));
    return n;
  }

  function missingState(meta){
    let why;
    if (!ORG.files.onDisk){
      why = "Not connected to the files folder — launch with start.command.";
    } else if (meta.path){
      why = `Expected it at ${meta.path}\nIt may have been moved or renamed in Finder.`;
    } else {
      why = "No copy was ever made — it was attached before the files folder existed.";
    }

    const n = U.el("div", "pv-empty");
    n.append(U.el("div", null, `“${meta.name}” isn't there.\n${why}`));
    return n;
  }

  return { renderStrip, renderMain };
})();
