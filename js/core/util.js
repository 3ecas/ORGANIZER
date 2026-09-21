/* ============================================================
   core/util.js
   DOM helpers, local-date maths, colour maths, formatting.
   No app knowledge lives here.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.util = (() => {

  /* ---------- DOM ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };

  /** Inline SVG icon from a path string. */
  const icon = (d, cls = "glyph") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", cls);
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.append(p);
    return svg;
  };

  const PATH = {
    clip:  "M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 6",
    flag:  "M4 21V4h13l-2 4 2 4H4",
  };

  /* ---------- maths ---------- */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /* ---------- calendar constants ---------- */
  const DOW       = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DOW_FULL  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const MONTHS    = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
  const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* ---------- dates -------------------------------------------------
     Everything is local-time. Days are handled as "YYYY-MM-DD" strings
     built from local getters, so nothing ever shifts across timezones.
     ------------------------------------------------------------------ */
  const ymd = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  const parseYmd = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
  const addDays  = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay  = (a, b) => ymd(a) === ymd(b);

  /** Monday-first weekday index: Mon = 0 … Sun = 6 */
  const dowMon      = d => (d.getDay() + 6) % 7;
  const startOfWeek = d => addDays(d, -dowMon(d));

  /** Whole days between two YYYY-MM-DD strings (b - a). */
  const daysBetween = (a, b) =>
    Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

  /* ---------- time formatting ---------- */
  const fmtMin = m => {
    const h = Math.floor(m / 60), mm = m % 60;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  };
  const parseTime = s => { const [h,m] = s.split(":").map(Number); return h*60 + m; };

  /** A moment in human terms: "14:32", or "14 Sep 14:32" if it wasn't today. */
  const fmtWhen = ms => {
    const d = new Date(ms);
    const t = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    return ymd(d) === ymd(new Date()) ? t : `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${t}`;
  };

  /** Friendly due-date wording relative to today. */
  const relDay = dateStr => {
    const diff = daysBetween(ymd(new Date()), dateStr);
    if (diff === 0)  return "today";
    if (diff === 1)  return "tomorrow";
    if (diff === -1) return "yesterday";
    if (diff < 0)    return `${-diff}d late`;
    if (diff < 7)    return `in ${diff}d`;
    const d = parseYmd(dateStr);
    return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
  };

  const bytes = n => {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n/1024).toFixed(0) + " KB";
    if (n < 1073741824) return (n/1048576).toFixed(1) + " MB";
    return (n/1073741824).toFixed(2) + " GB";
  };

  /* ---------- colour ---------- */
  const hexToRgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  };

  /** Blend a hex colour towards white (amt > 0) or black (amt < 0), as hex. */
  const shadeHex = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const to = amt > 0 ? 255 : 0, k = Math.abs(amt);
    const mix = c => Math.round(c + (to - c) * k).toString(16).padStart(2, "0");
    return `#${mix((n>>16)&255)}${mix((n>>8)&255)}${mix(n&255)}`;
  };

  /** How close a colour is to white, 0..1. Perceptual, not arithmetic. */
  const luma = hex => {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126*((n>>16)&255) + 0.7152*((n>>8)&255) + 0.0722*(n&255)) / 255;
  };

  /** The same blend as an rgb() string. */
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const to = amt > 0 ? 255 : 0, k = Math.abs(amt);
    const mix = c => Math.round(c + (to - c) * k);
    return `rgb(${mix((n>>16)&255)},${mix((n>>8)&255)},${mix(n&255)})`;
  };

  const isLight = () => document.documentElement.dataset.theme === "light";

  /* ---------- misc ---------- */
  const debounce = (fn, ms) => {
    let t = null;
    const run = (...a) => {
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn(...a); }, ms);
    };
    /** Is a call still waiting to happen? */
    run.pending = () => t !== null;
    return run;
  };

  let toastTimer;
  const toast = (msg, ms = 2200) => {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), ms);
  };

  /** Tiny pub/sub so modules never import each other's render functions. */
  const bus = {
    map: {},
    on(evt, fn){ (this.map[evt] ||= []).push(fn); },
    emit(evt, payload){ (this.map[evt] || []).forEach(fn => fn(payload)); },
  };

  return {
    $, $$, el, icon, PATH,
    clamp, uid,
    DOW, DOW_FULL, MONTHS, MON_SHORT,
    ymd, parseYmd, addDays, sameDay, dowMon, startOfWeek, daysBetween,
    fmtMin, parseTime, fmtWhen, relDay, bytes,
    hexToRgba, shade, shadeHex, luma, isLight,
    debounce, toast, bus,
  };
})();
