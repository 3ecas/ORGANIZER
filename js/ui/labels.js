/* ============================================================
   ui/labels.js
   Everything that draws a label — the name-plus-colours record a
   task carries, normally a client.

     visible()  nudge a colour off the theme's background
     stripe()   paint a surface with a label's colours
     swatch()   the little multi-colour tile shown next to a name
     editor()   rename / recolour / delete one label
     picker()   the dropdown inside a card: which client is this?
     manager()  the sidebar list: filter, and manage the whole set

   The picker and the manager are two doors into the same editor,
   so a label can be made and changed from wherever you happen to
   be — inside a card while you're filing it, or in the sidebar
   while you're setting your clients up.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.labels = (() => {
  const U = ORG.util;

  /* Which label has its editor open, per surface, and whether the card's
     dropdown is down. Two editor keys rather than one, or opening a label
     in the sidebar would spring it open inside the card as well. */
  const openIn = { picker:null, manager:null };
  let menuOpen = false;

  /* ============================================================
     PAINT
     ============================================================ */

  /**
   * Nudge a colour off the current theme's background.
   *
   * Black and white are real choices for a client's brand, but a black
   * stripe on the dark theme — or a white one on the light theme — is an
   * invisible stripe. Only the extremes move, and only far enough to be
   * seen: black still reads as the darkest thing on screen, white as the
   * lightest, and the two never converge.
   */
  function visible(hex){
    if (typeof hex !== "string" || hex[0] !== "#") return hex;
    const l = U.luma(hex);
    if (!U.isLight() && l < 0.10) return U.shadeHex(hex,  0.30);
    if ( U.isLight() && l > 0.92) return U.shadeHex(hex, -0.26);
    return hex;
  }

  /**
   * A label's colours as hard-edged bands — no blending, so two
   * colours read as two colours at chip size rather than a smudge.
   * Vertical by default (a bar down the left of a chip); pass
   * "to right" for a horizontal one.
   */
  function gradient(colors, dir = "to bottom"){
    const c = colors.map(visible);
    if (c.length === 1) return c[0];
    const step = 100 / c.length;
    return `linear-gradient(${dir}, ${c.map((x, i) => `${x} ${i * step}% ${(i + 1) * step}%`).join(",")})`;
  }

  const stripe = (node, colors, dir) => {
    node.style.background = gradient(colors, dir);
  };

  /** The rounded tile that stands for a label in a list. */
  function swatch(label, cls = "lb-swatch"){
    const s = U.el("span", cls);
    stripe(s, label.colors, "to bottom");
    s.title = label.colors.join("  ");
    return s;
  }

  /* ============================================================
     THE EDITOR — one label's name, colours and deletion
     ============================================================ */
  function editor(l, onChange){
    const box = U.el("div", "lb-editor");
    box.addEventListener("click", e => e.stopPropagation());

    /* name and delete share a row, so the editor stays a small block
       rather than a stack of full-width controls */
    const top = U.el("div", "lb-top");

    const name = U.el("input", "lb-input");
    name.value = l.name;
    name.spellcheck = false;
    name.placeholder = "Client name";
    name.addEventListener("input", () => ORG.store.updateLabel(l.id, { name:name.value }));
    /* re-sorted on commit, not per keystroke — a row that re-sorts under
       the cursor while you type is unusable */
    name.addEventListener("change", () => { ORG.store.sortLabels(); onChange(); });
    name.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Enter") name.blur();
    });
    top.append(name);
    top.append(deleteButton(l, onChange));
    box.append(top);

    const max = ORG.store.MAX_COLORS;
    box.append(U.el("div", "lb-note",
      `${l.colors.length} of ${max} colours — click to add or remove`));

    const grid = U.el("div", "lb-swatches");
    for (const hex of ORG.SWATCHES){
      const picked = l.colors.includes(hex);
      const b = U.el("button", "lb-dot" + (picked ? " on" : ""));
      b.style.background = hex;              // the true colour, not the nudged one
      b.title = picked ? "Remove this colour" : "Add this colour";
      b.addEventListener("click", e => {
        e.stopPropagation();
        /* read the label back rather than trusting the one captured when
           this row was built — updateLabel replaces the object, so a
           handler that outlived a repaint would work from a stale copy */
        const live = ORG.store.labelById(l.id);
        if (!live) return;
        const colors = live.colors.includes(hex)
          ? live.colors.filter(c => c !== hex)
          : [...live.colors, hex].slice(0, max);
        if (!colors.length) return;      // a colourless label would be invisible
        ORG.store.updateLabel(l.id, { colors });
        onChange();
      });
      grid.append(b);
    }
    box.append(grid);

    return box;
  }

  /** The small bin beside the name. Never silently destroys anything. */
  function deleteButton(l, onChange){
    const kill = U.el("button", "lb-del");
    kill.append(U.icon("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", "glyph"));
    kill.title = `Delete “${l.name}”`;

    kill.addEventListener("click", e => {
      e.stopPropagation();
      if (ORG.store.state.labels.length <= 1){
        U.toast("That's the last label — make another one first");
        return;
      }
      const n = ORG.store.state.tasks.filter(t => t.label === l.id).length;
      const msg = n
        ? `Delete the label “${l.name}”?\n\nIts ${n} task${n === 1 ? "" : "s"} move to the first label — no tasks are deleted.`
        : `Delete the label “${l.name}”?`;
      if (!confirm(msg)) return;
      ORG.store.removeLabel(l.id);
      openIn.picker = openIn.manager = null;
      onChange();
    });
    return kill;
  }

  /** The ✎ that opens and closes the editor. Always visible: it was
      hover-only at first, which hid the whole feature. */
  function pencil(l, where, onChange){
    const b = U.el("button", "lb-edit" + (openIn[where] === l.id ? " on" : ""), "✎");
    b.title = "Rename this label or change its colours";
    b.addEventListener("click", e => {
      e.stopPropagation();
      openIn[where] = openIn[where] === l.id ? null : l.id;
      onChange();
    });
    return b;
  }

  /* ============================================================
     THE PICKER — a dropdown inside a card
     Closed, it's just the colour and the name, so the card stays
     about the job rather than about a list of clients.
     ============================================================ */
  function picker(box, task, onPick){
    box.innerHTML = "";
    const current = ORG.store.labelOf(task);

    const field = U.el("button", "lb-field" + (menuOpen ? " open" : ""));
    field.append(swatch(current));
    field.append(U.el("span", "lb-name", current.name));
    field.append(U.el("span", "lb-caret", "▾"));
    field.title = "Choose the client this job is for";
    field.addEventListener("click", e => {
      e.stopPropagation();
      menuOpen = !menuOpen;
      if (!menuOpen) openIn.picker = null;
      onPick();
    });
    box.append(field);

    if (!menuOpen) return;

    const menu = U.el("div", "lb-menu");
    for (const l of ORG.store.state.labels) menu.append(pickRow(l, task, onPick));

    const add = U.el("button", "lb-add", "+  New label");
    add.title = "Make a label for another client";
    add.addEventListener("click", e => {
      e.stopPropagation();
      const l = ORG.store.addLabel("New client", ["#8b7cf6"]);
      task.label = l.id;
      openIn.picker = l.id;                   // straight into naming it
      onPick();
    });
    menu.append(add);
    box.append(menu);

    /* the menu scrolls, so bring an opened editor into view rather than
       leaving it below the fold */
    if (openIn.picker){
      const row = [...menu.querySelectorAll(".lb-row")].find(r => r.querySelector(".lb-editor"));
      if (row) row.scrollIntoView({ block:"nearest" });
    }
  }

  function pickRow(l, task, onPick){
    const on = l.id === task.label;
    const wrap = U.el("div", "lb-row" + (on ? " on" : ""));

    const head = U.el("div", "lb-head");
    head.append(swatch(l));
    head.append(U.el("span", "lb-name", l.name));
    if (on) head.append(U.el("span", "lb-tick", "✓"));
    head.append(pencil(l, "picker", onPick));

    head.addEventListener("click", () => {
      task.label = l.id;
      menuOpen = false;                       // picking one closes the list
      openIn.picker = null;
      onPick();
    });
    wrap.append(head);

    if (openIn.picker === l.id) wrap.append(editor(l, onPick));
    return wrap;
  }

  /* ============================================================
     THE MANAGER — the sidebar list. Filter, and set the set up.
     ============================================================ */
  function manager(box){
    box.innerHTML = "";
    const redraw = () => U.bus.emit("change");

    for (const l of ORG.store.state.labels) box.append(manageRow(l, redraw));

    const add = U.el("button", "lb-add", "+  New label");
    add.title = "Add a client";
    add.addEventListener("click", () => {
      const l = ORG.store.addLabel("New client", ["#8b7cf6"]);
      openIn.manager = l.id;                  // straight into naming it
      redraw();
    });
    box.append(add);
  }

  function manageRow(l, redraw){
    const st = ORG.store.state;
    const hidden = st.hidden.includes(l.id);
    const wrap = U.el("div", "lb-row");

    const row = U.el("div", "label" + (hidden ? " off" : ""));
    row.append(swatch(l, "swatch"));

    const input = U.el("input");
    input.value = l.name;
    input.spellcheck = false;
    input.title = "Rename this label";
    input.addEventListener("click", e => e.stopPropagation());
    input.addEventListener("input", () => ORG.store.updateLabel(l.id, { name:input.value }));
    input.addEventListener("change", () => { ORG.store.sortLabels(); redraw(); });
    input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
    row.append(input);

    const open = ORG.store.labelCount(l.id);
    row.append(U.el("span", "n", open ? String(open) : ""));
    row.append(pencil(l, "manager", redraw));

    row.title = hidden ? `Show ${l.name} again` : `Hide everything labelled ${l.name}`;
    row.addEventListener("click", () => {
      const i = st.hidden.indexOf(l.id);
      if (i === -1) st.hidden.push(l.id); else st.hidden.splice(i, 1);
      ORG.store.save();
    });
    wrap.append(row);

    if (openIn.manager === l.id) wrap.append(editor(l, redraw));
    return wrap;
  }

  /** Close the card's dropdown and editor — called when a card is opened. */
  const reset = () => { openIn.picker = null; menuOpen = false; };

  return { visible, gradient, stripe, swatch, picker, manager, reset,
           closeMenu(){ if (!menuOpen) return false; reset(); return true; } };
})();
