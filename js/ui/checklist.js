/* ============================================================
   ui/checklist.js
   The list of steps inside a card — what actually has to be done
   on the job, as opposed to the job itself.

   Typing is handled in place rather than by re-rendering, so the
   caret never jumps mid-word. Only structural changes (add, tick,
   delete, reorder) redraw the list.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.checklist = (() => {
  const U = ORG.util;

  let box = null;      // the container we own
  let task = null;

  /** Draw the whole control into `container` for `t`. */
  function render(container, t){
    box = container;
    task = t;
    paint();
  }

  function paint(){
    const focus = document.activeElement;
    const keepAdd = focus && focus.classList.contains("cl-add");

    box.innerHTML = "";
    box.append(header(), items(), addBox());

    if (keepAdd) U.$(".cl-add", box).focus();
  }

  /* ============================================================
     PROGRESS HEADER
     ============================================================ */
  function header(){
    const { done, total } = ORG.store.progress(task);
    const complete = total > 0 && done === total;

    const top = U.el("div", "cl-top");
    top.append(U.el("span", "cl-count" + (complete ? " all" : ""), `${done}/${total}`));

    const bar = U.el("div", "cl-bar");
    const fill = U.el("i");
    fill.style.width = total ? (done / total * 100) + "%" : "0%";
    if (complete) fill.classList.add("all");
    bar.append(fill);
    top.append(bar);

    if (done){
      const clear = U.el("button", "cl-clear", "Clear done");
      clear.title = "Remove the finished steps";
      clear.addEventListener("click", () => { ORG.store.clearDoneSteps(task); paint(); });
      top.append(clear);
    }
    return top;
  }

  /* ============================================================
     ROWS
     ============================================================ */
  function items(){
    const list = U.el("div", "cl-items");
    task.steps.forEach((step, i) => list.append(row(step, i)));
    return list;
  }

  function row(step, index){
    const n = U.el("div", "cl-item" + (step.done ? " on" : ""));
    n.dataset.id = step.id;

    const grip = U.el("span", "cl-grip", "⠿");
    grip.title = "Drag to reorder";
    grip.addEventListener("pointerdown", e => beginReorder(e, n, step));
    n.append(grip);

    const check = U.el("button", "check" + (step.done ? " on" : ""));
    check.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    check.addEventListener("click", () => {
      ORG.store.updateStep(task, step.id, { done: !step.done });
      paint();
    });
    n.append(check);

    const text = U.el("input", "cl-text");
    text.value = step.text;
    text.spellcheck = false;
    text.placeholder = "Step";
    text.addEventListener("input", () => ORG.store.updateStep(task, step.id, { text: text.value }));
    text.addEventListener("keydown", e => onRowKey(e, step, index, text));
    text.addEventListener("blur", () => {
      // an emptied step is a deleted step
      if (!text.value.trim()){ ORG.store.removeStep(task, step.id); paint(); }
    });
    n.append(text);

    const del = U.el("button", "cl-del", "×");
    del.title = "Delete this step";
    del.addEventListener("click", () => { ORG.store.removeStep(task, step.id); paint(); });
    n.append(del);

    return n;
  }

  /** Enter splits a new step below; Backspace on an empty one deletes it. */
  function onRowKey(e, step, index, input){
    if (e.key === "Enter"){
      e.preventDefault();
      const fresh = ORG.store.addStep(task, "", index + 1);
      paint();
      focusStep(fresh.id);
    }
    else if (e.key === "Backspace" && input.value === ""){
      e.preventDefault();
      ORG.store.removeStep(task, step.id);
      paint();
      const prev = task.steps[index - 1];
      if (prev) focusStep(prev.id, true);
      else U.$(".cl-add", box).focus();
    }
    else if (e.key === "Escape"){
      input.blur();
    }
  }

  function focusStep(id, toEnd){
    const input = U.$(`.cl-item[data-id="${id}"] .cl-text`, box);
    if (!input) return;
    input.focus();
    if (toEnd) input.setSelectionRange(input.value.length, input.value.length);
  }

  /* ============================================================
     ADD BOX — stays focused so a whole list can be typed straight in
     ============================================================ */
  function addBox(){
    const input = U.el("input", "cl-add");
    input.placeholder = "Add a step…";
    input.spellcheck = false;
    input.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const v = e.target.value.trim();
      if (!v) return;
      ORG.store.addStep(task, v);
      e.target.value = "";
      paint();
      U.$(".cl-add", box).focus();
    });
    return input;
  }

  /* ============================================================
     REORDER — local to this list, so it stays out of ui/dnd.js
     ============================================================ */
  let drag = null;

  function beginReorder(e, node, step){
    e.preventDefault();
    e.stopPropagation();
    drag = { node, step, list: node.parentElement };
    node.classList.add("dragging");
    window.addEventListener("pointermove", onReorderMove);
    window.addEventListener("pointerup", onReorderUp, { once:true });
  }

  function onReorderMove(e){
    if (!drag) return;
    U.$$(".cl-item.over", box).forEach(n => n.classList.remove("over"));
    const target = rowAt(e.clientY);
    if (target && target !== drag.node) target.classList.add("over");
  }

  function onReorderUp(e){
    window.removeEventListener("pointermove", onReorderMove);
    if (!drag) return;

    drag.node.classList.remove("dragging");
    U.$$(".cl-item.over", box).forEach(n => n.classList.remove("over"));

    const rows = [...drag.list.querySelectorAll(".cl-item")];
    let index = rows.length;
    for (let i = 0; i < rows.length; i++){
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2){ index = i; break; }
    }

    ORG.store.moveStep(task, drag.step.id, index);
    drag = null;
    paint();
  }

  function rowAt(y){
    const under = document.elementFromPoint(
      drag.list.getBoundingClientRect().left + 20, y
    );
    return under ? under.closest(".cl-item") : null;
  }

  return { render };
})();
