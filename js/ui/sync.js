/* ============================================================
   ui/sync.js
   The GitHub button: Get what the other computer sent, Send
   what this one changed.

   The work happens in sync.py; this is the part you see. One
   button in the top bar with a small panel under it, and a badge
   counting what this computer hasn't sent yet — the thing to
   glance at before you quit.

   GET happens by itself, when it's safe. On opening, and when
   the window comes back into focus, this asks GitHub whether the
   other computer sent anything. If it did, and nothing here is in
   the way, it's brought in and the page reloads onto it. That's
   the one direction worth automating: working on top of old data
   is how both computers end up changing the same thing, and that
   is the mess nothing can tidy up by itself.

   SEND never happens by itself. You decide when — before quitting,
   usually. Sending every few minutes would bury the history in
   hundreds of commits, most of them work half-done.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.sync = (() => {
  const U = ORG.util;

  const RECHECK = 60 * 1000;        // on focus, ask GitHub at most once a minute
  const LOOP_GUARD = 30 * 1000;     // and never auto-Get twice in a row this fast

  let st = null;                    // the last answer from /api/sync
  let busy = null;                  // "check" | "get" | "send" while one is running
  let note = null;                  // a line about what just happened
  let lastCheck = 0;

  const onWindows = /win/i.test(navigator.platform || navigator.userAgent);

  /* ============================================================
     TALKING TO THE SERVER
     ============================================================ */
  async function call(path, method = "GET"){
    let res;
    try { res = await fetch(path, { method }); }
    catch { return { git:false, reason:"server" }; }
    /* 404 means the server running now predates this file: the page was
       reloaded onto new code, but the server wasn't restarted. */
    if (res.status === 404) return { git:false, reason:"old-server" };
    try { return await res.json(); }
    catch { return { git:false, reason:"server" }; }
  }

  /** Let any save that's pending land on disk first. Otherwise the last
      thing typed is missing from a Send, or — worse — a Get sees this
      computer as clean when it isn't. */
  async function settle(){
    for (let i = 0; i < 40 && ORG.store.busy; i++) await new Promise(r => setTimeout(r, 50));
  }

  /* ============================================================
     WHAT THE STATE MEANS
     ============================================================ */
  const count = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const toSend = s => s.changed.length || s.ahead;
  const diverged = s => s.behind > 0 && (s.ahead > 0 || s.clash.length > 0);

  const LOGIN = onWindows
    ? "This PC needs signing in to GitHub once. Open a Command Prompt in the "
      + "Organizer folder and run  git push . The README has the steps."
    : "This Mac needs signing in to GitHub once. Open Terminal in the "
      + "Organizer folder and run  git push . The README has the steps.";

  /** { tone, word, line } for the current state. */
  function reading(){
    if (busy === "get")  return { tone:"busy", word:"Getting…", line:"Bringing in what the other computer sent." };
    if (busy === "send") return { tone:"busy", word:"Sending…", line:"Committing and pushing what changed here." };
    if (!st)             return { tone:"busy", word:"Checking…", line:"Asking GitHub what's new." };

    if (!st.git){
      switch (st.reason){
        case "old-server": return { tone:"warn", word:"Restart needed",
          line:"Quit and reopen Organizer to switch this on — the server running now is older than the page." };
        case "no-git": return { tone:"off", word:"No git",
          line:"There's no git on this computer. Installing GitHub Desktop brings one." };
        case "not-a-repo": return { tone:"off", word:"Not linked",
          line:"This folder isn't a GitHub repository." };
        case "no-upstream": return { tone:"off", word:"Not linked",
          line:"This folder isn't connected to a repository on GitHub yet. Publish it once from GitHub Desktop." };
        default: return { tone:"off", word:"Unavailable", line:"The server isn't answering." };
      }
    }

    if (st.broken || ORG.store.broken) return { tone:"danger", word:"Can't send",
      line:"data.json is damaged, so nothing will be sent — sending it would pass the damage "
        + "to the other computer. Put it right in GitHub Desktop first, then reload." };

    if (st.error === "login")   return { tone:"warn", word:"Sign-in needed", line:LOGIN };
    if (st.error === "offline") return { tone:"off",  word:"Offline",
      line:"Couldn't reach GitHub. Nothing is lost — try again once you're online." };
    if (st.error === "behind")  return { tone:"warn", word:"Get first",
      line:"The other computer sent something just now. Get it, then Send." };
    if (st.error)               return { tone:"warn", word:"GitHub refused",
      line:st.detail || "GitHub didn't accept that." };

    if (diverged(st)) return { tone:"danger", word:"Both changed",
      line:"The other computer sent changes, and this one changed "
        + (st.clash.length ? `the same ${count(st.clash.length, "file")}` : "things too")
        + ". That needs a person to choose — GitHub Desktop can pull and ask which version of each file to keep." };

    if (st.behind)   return { tone:"get", word:`${st.behind} to get`,
      line:"The other computer sent changes." };
    if (toSend(st))  return { tone:"send", word:`${count(toSend(st), "change")} to send`,
      line:"Changed here since the last Send. Send before you quit, so the other computer gets it." };
    return { tone:"ok", word:"Up to date", line:"Both computers have the same work." };
  }

  /** Plain words for a list of paths: tasks, attachments, the app. */
  function describe(files){
    const out = [];
    if (files.includes("data.json")) out.push("Your tasks and notes");
    const att = files.filter(f => f.startsWith("FILES/"));
    if (att.length){
      const names = att.slice(0, 3).map(f => f.split("/").slice(-2).join(" / "));
      out.push(`${count(att.length, "attachment")}: ${names.join(", ")}${att.length > 3 ? "…" : ""}`);
    }
    const app = files.filter(f => f !== "data.json" && !f.startsWith("FILES/"));
    if (app.length) out.push(`${count(app.length, "app file")} — Organizer itself`);
    return out;
  }

  /* ============================================================
     DRAWING IT
     ============================================================ */
  function paint(){
    const r = reading();
    const btn = U.$("#syncbtn");
    btn.dataset.tone = r.tone;
    btn.title = `GitHub — ${r.word}`;
    /* The count shows only when sending is the next thing to do. Anything
       else — something to get, or trouble — is the dot's job instead, so
       the two never sit on top of each other. */
    U.$("#sync-n").textContent = r.tone === "send" ? String(toSend(st)) : "";

    const panel = U.$("#syncpanel");
    if (panel.hidden) return;
    panel.innerHTML = "";

    const head = U.el("div", "lp-head", "GitHub");
    const word = U.el("span", "sp-word", r.word);
    word.dataset.tone = r.tone;
    head.append(word);
    panel.append(head);

    panel.append(U.el("p", "sp-line", note || r.line));

    const acts = U.el("div", "sp-acts");
    const get = U.el("button", "btn sm", "↓ Get");
    get.title = "Bring in what the other computer sent";
    get.disabled = !!busy || !st || !st.git;
    get.addEventListener("click", () => doGet(false));

    const send = U.el("button", "btn sm primary", "↑ Send");
    send.title = "Commit what changed here and push it to GitHub";
    send.disabled = !!busy || !st || !st.git || !st.canSend;
    send.addEventListener("click", doSend);
    acts.append(get, send);
    panel.append(acts);

    // What's waiting, in plain words. Not while data.json is damaged: a
    // list of things "to send" under "Can't send" reads like a promise.
    if (st && st.git && !st.broken && !ORG.store.broken){
      const list = st.behind && st.incoming.length ? describe(st.incoming)
                 : toSend(st) ? describe(st.changed) : [];
      if (list.length){
        const ul = U.el("ul", "sp-files");
        for (const line of list) ul.append(U.el("li", null, line));
        panel.append(ul);
      }
      if (st.tooBig && st.tooBig.length){
        panel.append(U.el("p", "sp-warn",
          `Too big for GitHub, kept on this computer only: ${st.tooBig.map(f => f.split("/").pop()).join(", ")}`));
      }
      if (st.remote && st.remote.subject){
        panel.append(U.el("div", "sp-foot",
          `On GitHub: ${st.remote.subject.split(" · ")[0]} · ${U.fmtWhen(st.remote.when)}`));
      }
    }
  }

  /* ============================================================
     DOING IT
     ============================================================ */
  async function check(){
    if (busy) return st;
    busy = "check";
    paint();
    st = await call("/api/sync?fetch=1");
    lastCheck = Date.now();
    busy = null;
    note = null;
    paint();
    return st;
  }

  /* After an edit, update the count without asking GitHub anything — the
     badge is what you glance at before quitting, so it can't still be
     saying "up to date" about work done a minute ago. Local only: git
     status on this folder, no network, cheap enough to run after every
     burst of changes. */
  const recount = U.debounce(async () => {
    if (busy || !st || !st.git || ORG.store.broken) return;
    const local = await call("/api/sync");
    if (busy || !local.git) return;
    /* Keep what the last real check learned about the network — a login
       problem, being offline — since this one never went out to ask. */
    st = { ...local, error: st.error, detail: st.detail };
    paint();
  }, 1500);

  function reloadSoon(msg){
    U.toast(msg, 2500);
    setTimeout(() => location.reload(), 700);
  }

  async function doGet(auto){
    if (busy) return;
    await settle();
    busy = "get";
    paint();
    const r = await call("/api/sync/get", "POST");
    busy = null;
    st = r;
    note = null;

    if (r.ok && r.got && r.got.length){
      if (r.restart){
        /* New server code came in. Reloading the page onto it while the
           old server is still running would pair new pages with old
           answers, so stop here and ask for a restart instead. */
        note = "Updated — quit and reopen Organizer to finish. Part of what arrived is the server itself.";
        U.toast("Updated from GitHub — restart Organizer to finish", 6000);
        paint();
        return;
      }
      try { sessionStorage.setItem("org.autoget", String(Date.now())); } catch {}
      reloadSoon(`Brought in ${count(r.got.length, "change")} from GitHub`);
      return;
    }
    if (r.ok && !auto) note = "Already up to date.";
    if (!r.ok && r.why === "clash")
      note = `Not brought in: this computer changed ${r.clash.join(", ")} too, and so did the other one.`;
    paint();
  }

  async function doSend(){
    if (busy) return;
    await settle();
    busy = "send";
    paint();
    const r = await call("/api/sync/send", "POST");
    busy = null;
    st = r;
    note = null;

    if (r.ok && r.nothing) note = "Nothing to send.";
    else if (r.ok){
      note = `Sent ${count(r.sent.length, "file")} to GitHub.`;
      U.toast("Sent to GitHub", 2200);
    }
    else if (r.why === "behind") note = "The other computer sent changes first. Get them, then Send.";
    else if (r.committed) note = "Saved as a commit here, but not sent yet — press Send again to retry.";
    paint();
  }

  /** Ask GitHub, and bring in whatever's safe to. */
  async function refresh(){
    await check();
    if (!st || !st.git || st.error || !st.canGet) return;

    /* A reload that lands straight back here and Gets again would loop
       forever in a window with no address bar to escape through. */
    let last = 0;
    try { last = +sessionStorage.getItem("org.autoget") || 0; } catch {}
    if (Date.now() - last < LOOP_GUARD) return;
    if (ORG.store.busy) return;          // mid-edit: leave it for the next focus
    doGet(true);
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function toggle(force){
    const panel = U.$("#syncpanel");
    const open = force !== undefined ? force : panel.hidden;
    panel.hidden = !open;
    U.$("#syncbtn").classList.toggle("on", open);
    if (open) paint();
  }

  const cameFrom = (e, ...ids) =>
    (e.composedPath ? e.composedPath() : []).some(n => n && n.id && ids.includes(n.id));

  function showBroken(){
    const b = U.$("#brokenbanner");
    if (b) b.hidden = !ORG.store.broken;
  }

  function init(){
    U.$("#syncbtn").addEventListener("click", e => { e.stopPropagation(); toggle(); });
    document.addEventListener("click", e => {
      if (!U.$("#syncpanel").hidden && !cameFrom(e, "syncpanel", "syncbtn")) toggle(false);
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !U.$("#syncpanel").hidden) toggle(false);
    });

    U.$("#broken-reload").addEventListener("click", () => location.reload());
    U.bus.on("broken", () => { showBroken(); paint(); });
    U.bus.on("change", recount);
    showBroken();

    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > RECHECK) refresh();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);

    paint();
    /* Only when the app is really saving to this folder. In the browser-only
       fallback there's no server to run git, and asking would just fail. */
    if (!ORG.files.onDisk){ st = { git:false, reason:"server" }; paint(); return; }
    /* With data.json damaged, still say where things stand — that's when
       you most need to know — but bring nothing in on top of it. */
    if (ORG.store.broken) check();
    else refresh();
  }

  return { init, check, refresh, get state(){ return st; } };
})();
