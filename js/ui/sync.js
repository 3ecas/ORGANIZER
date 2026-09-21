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
  async function call(path, method = "GET", body){
    let res;
    try {
      res = await fetch(path, body === undefined ? { method } : {
        method, headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body),
      });
    }
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

  /* ============================================================
     LINKS TO GITHUB
     ============================================================ */

  /** GitHub's page for a new token, filled in as far as a link can fill it.
      Only the repository itself can't be chosen from a link — so the steps
      say which box to tick. Contents: read and write is all it gets, for
      one year, and it's named after this computer so the two are easy to
      tell apart if one ever needs cancelling. */
  function tokenUrl(){
    const [owner, name] = (st.repo || "/").split("/");
    const device = st.device || "this computer";
    const q = new URLSearchParams({
      name: `Organizer on ${device}`.slice(0, 40),
      description: `Lets Organizer on ${device} get and send ${name}. Nothing else.`,
      target_name: owner,
      expires_in: "366",
      contents: "write",
    });
    return `https://github.com/settings/personal-access-tokens/new?${q}`;
  }

  /** Open a github.com page in the browser you normally use, where you're
      signed in to GitHub — not in this window, which is a Firefox profile
      of its own, signed in to nothing. The server does the opening; if it
      can't (it predates this), fall back to a new window here. */
  async function openOnGitHub(url){
    const r = await call("/api/open", "POST", { url });
    if (!r.ok) window.open(url, "_blank", "noopener");
  }

  /** { tone, word, line, kind } for the current state. */
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

    /* Before anything else that could lead to a Send: while strangers can
       read the repository, nothing goes to it. The server refuses too —
       this is only the explanation. */
    if (st.public) return { tone:"danger", word:"Public", kind:"public",
      line:`Anyone can read ${st.repo || "this repository"} — your tasks, notes and attachments. `
        + "Nothing will be sent until it's private." };

    if (st.error === "login") return { tone:"warn", word:"Sign-in needed", kind:"login",
      line:"Git on this computer isn't signed in to GitHub yet. Once, and it's done:" };
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

    if (r.kind === "public") panel.append(goPrivate());
    if (r.kind === "login")  panel.append(signIn());

    // Signing in comes first; the buttons would only fail the same way.
    if (r.kind !== "login"){
      const acts = U.el("div", "sp-acts");
      const get = U.el("button", "btn sm", "↓ Get");
      get.title = "Bring in what the other computer sent";
      get.disabled = !!busy || !st || !st.git;
      get.addEventListener("click", () => doGet(false));

      const send = U.el("button", "btn sm primary", "↑ Send");
      send.title = "Commit what changed here and push it to GitHub";
      send.disabled = !!busy || !st || !st.git || !st.canSend || r.kind === "public";
      send.addEventListener("click", doSend);
      acts.append(get, send);
      panel.append(acts);
    }

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

  /** Step one of two: make the repository private. */
  function goPrivate(){
    const box = U.el("div", "sp-steps");
    const open = U.el("button", "btn sm", "Open its settings on GitHub");
    open.addEventListener("click", () => openOnGitHub(`https://github.com/${st.repo}/settings`));
    box.append(open);
    box.append(U.el("p", "sp-hint",
      "Right at the bottom, under Danger Zone: Change visibility → Make private. "
      + "Come back here afterwards and it's noticed within a few seconds."));
    return box;
  }

  /* Step two: sign git in. The field survives a redraw — coming back from
     the browser redraws this panel, and that must not throw away a token
     just pasted. The draft lives here only until it's sent, then goes. */
  let draft = "";
  let signing = false;
  let signTrouble = null;

  function signIn(){
    const box = U.el("div", "sp-steps");
    const name = (st.repo || "").split("/")[1] || "this repository";

    const one = U.el("div", "sp-step");
    const oneBody = U.el("div", "sp-body");
    const open = U.el("button", "btn sm", "Open GitHub's token page");
    open.addEventListener("click", () => openOnGitHub(tokenUrl()));
    oneBody.append(open, U.el("p", "sp-hint",
      `It opens in your usual browser. Under Repository access, choose Only select `
      + `repositories and pick ${name} — everything else is already filled in. `
      + `Generate the token and copy it.`));
    one.append(U.el("span", "sp-num", "1"), oneBody);

    const two = U.el("div", "sp-step");
    const twoBody = U.el("div", "sp-body");
    const row = U.el("div", "sp-paste");
    const input = U.el("input", "sp-token");
    input.type = "password";
    input.placeholder = "Paste the token here";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = draft;
    input.disabled = signing;
    input.addEventListener("input", () => { draft = input.value; });

    const go = U.el("button", "btn sm primary", signing ? "Checking…" : "Sign in");
    go.disabled = signing;
    const submit = async () => {
      const token = draft.trim();
      if (!token || signing) return;
      signing = true;
      signTrouble = null;
      paint();
      const r = await call("/api/sync/login", "POST", { token });
      draft = "";                          // gone from the page either way
      signing = false;
      if (r.ok){
        await check();
        note = `Signed in as ${r.user}. Send works from now on.`;
      } else {
        signTrouble = trouble(r, name);
      }
      paint();
    };
    go.addEventListener("click", submit);
    input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    row.append(input, go);
    twoBody.append(row);
    if (signTrouble) twoBody.append(U.el("p", "sp-warn", signTrouble));
    two.append(U.el("span", "sp-num", "2"), twoBody);

    box.append(one, two);
    if (!signing) setTimeout(() => { if (draft) input.focus(); }, 0);
    return box;
  }

  function trouble(r, name){
    if (r.reason === "old-server")
      return "Quit and reopen Organizer first — the server running now is older than this form.";
    switch (r.why){
      case "shape":    return "That doesn't look like a GitHub token — it should start with github_pat_. Copy it again.";
      case "rejected": return "GitHub doesn't recognise that token. It's only shown once; if it's lost, make another.";
      case "no-write": return `GitHub knows the token, but it can't send to ${name}. Check that you picked `
                            + `Only select repositories → ${name}, and that Contents says Read and write.`;
      case "offline":  return "Couldn't reach GitHub. Try again once you're online.";
      case "no-store": return onWindows
        ? "Git on this PC has nowhere to keep a login. Installing Git for Windows (git-scm.com) adds one; then sign in again."
        : "The Keychain wouldn't take it. Try once more.";
      case "not-github": return "This folder's repository isn't on GitHub.";
      default: return r.detail || "That didn't work. Try again.";
    }
  }

  /* ============================================================
     DOING IT
     ============================================================ */
  async function check(fresh){
    if (busy) return st;
    busy = "check";
    paint();
    st = await call(`/api/sync?fetch=1${fresh ? "&fresh=1" : ""}`);
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
  async function refresh(fresh){
    await check(fresh);
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

    /* Coming back to the window: ask again. Sooner while the repository is
       public — the likeliest reason for being away is making it private,
       and the panel should move on as soon as that's done. */
    const again = () => {
      if (document.visibilityState !== "visible") return;
      const watching = !!(st && st.public);
      if (Date.now() - lastCheck > (watching ? 10 * 1000 : RECHECK)) refresh(watching);
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
