/* ============================================================
   core/search.js
   What a search box means.

   A query is split into terms on the spaces, and EVERY term has
   to match — so "galp 16 september" is Galp work on the 16th,
   not everything Galp plus everything on the 16th. That crossing
   is the point of typing two things.

   A term is a date, a time, or plain text:

     16 september     16 sep     september 16     16/09/2026
     2026-09-16       september  2026             today
     14:00            9h         9am

   A date term matches a job whose run of days COVERS that day —
   a job from the 14th to the 18th answers to "16 september",
   because that is a day you were on it. Its due date and the day
   it was archived count too.

   Anything that isn't a date or a time stays plain text, so
   "v16" and "16" behave as they always did rather than being
   quietly read as the sixteenth.
   ============================================================ */
window.ORG = window.ORG || {};

ORG.search = (() => {
  const U = ORG.util;

  /* Month names as the app writes them, plus Portuguese — the interface is
     in English but the person typing is not, and "setembro" costs one line. */
  const MONTHS_PT = ["janeiro","fevereiro","março","abril","maio","junho",
                     "julho","agosto","setembro","outubro","novembro","dezembro"];

  /** 0–11 for a month word, or -1. Matches on any prefix of 3 or more. */
  function monthIndex(word){
    const w = word.replace(/[.,]$/, "");
    if (w.length < 3) return -1;
    for (let i = 0; i < 12; i++){
      const en = U.MONTHS[i].toLowerCase();
      const pt = MONTHS_PT[i];
      if (en.startsWith(w) || pt.startsWith(w) || w === U.MON_SHORT[i].toLowerCase()) return i;
    }
    return -1;
  }

  const isDay   = n => Number.isInteger(n) && n >= 1 && n <= 31;
  const isYear  = n => Number.isInteger(n) && n >= 1900 && n <= 2100;
  const num     = s => (/^\d{1,4}$/.test(s) ? +s : NaN);

  const pad = n => String(n).padStart(2, "0");
  const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

  /* ============================================================
     READING THE QUERY
     ============================================================ */

  /** A date starting at token `i`, or null. Returns how many tokens it ate. */
  function takeDate(toks, i){
    const a = toks[i], b = toks[i + 1], c = toks[i + 2];
    const today = new Date();

    /* ---- one word ---- */
    if (a === "today")     return { term: day(U.ymd(today)), used:1 };
    if (a === "yesterday") return { term: day(U.ymd(U.addDays(today, -1))), used:1 };
    if (a === "tomorrow")  return { term: day(U.ymd(U.addDays(today, 1))), used:1 };

    // 2026-09-16
    let m = a.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return { term: day(key(+m[1], +m[2] - 1, +m[3])), used:1 };

    // 16/09/2026 or 16-09-2026 — day first, as the date fields show it
    m = a.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (m && isDay(+m[1]) && +m[2] >= 1 && +m[2] <= 12){
      const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null;
      return y ? { term: day(key(y, +m[2] - 1, +m[1])), used:1 }
               : { term: { kind:"md", mo:+m[2] - 1, d:+m[1] }, used:1 };
    }

    // a bare year
    if (isYear(num(a)) && a.length === 4) return { term: { kind:"year", y:num(a) }, used:1 };

    const ma = monthIndex(a);

    /* ---- month + day (+ year) ---- */
    if (ma !== -1){
      if (isDay(num(b))){
        if (isYear(num(c))) return { term: day(key(num(c), ma, num(b))), used:3 };
        return { term: { kind:"md", mo:ma, d:num(b) }, used:2 };
      }
      return { term: { kind:"month", mo:ma }, used:1 };   // "september" on its own
    }

    /* ---- day + month (+ year) ---- */
    if (isDay(num(a)) && b){
      const mb = monthIndex(b);
      if (mb !== -1){
        if (isYear(num(c))) return { term: day(key(num(c), mb, num(a))), used:3 };
        return { term: { kind:"md", mo:mb, d:num(a) }, used:2 };
      }
    }
    return null;
  }

  const day = k => ({ kind:"day", k });

  /** A clock time at token `i`, or null. */
  function takeTime(toks, i){
    const a = toks[i];
    let m = a.match(/^(\d{1,2}):(\d{2})$/);
    if (m && +m[1] < 24 && +m[2] < 60) return { term:{ kind:"time", min:+m[1] * 60 + +m[2] }, used:1 };

    m = a.match(/^(\d{1,2})\s*(h|am|pm)$/);
    if (m){
      let h = +m[1];
      if (h > 23) return null;
      if (m[2] === "pm" && h < 12) h += 12;
      if (m[2] === "am" && h === 12) h = 0;
      return { term:{ kind:"time", min:h * 60 }, used:1 };
    }
    return null;
  }

  /** The query as a list of terms, all of which must match. */
  function parse(q){
    const toks = String(q || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const terms = [];
    let i = 0;
    while (i < toks.length){
      const hit = takeDate(toks, i) || takeTime(toks, i);
      if (hit){ terms.push(hit.term); i += hit.used; continue; }
      terms.push({ kind:"text", v:toks[i] });
      i++;
    }
    return terms;
  }

  /* ============================================================
     MATCHING A TASK
     ============================================================ */

  /** Every day this job was on: its run of days, plus its deadline.

      NOT the day it was archived. Filing something away is not a day you
      worked on it, and a wet afternoon spent tidying the archive would
      otherwise stamp thirty old jobs with the same date and answer to it
      ever after. */
  function daysOf(t){
    const out = [];
    if (t.date){
      const last = t.endDate && t.endDate > t.date ? t.endDate : t.date;
      let d = U.parseYmd(t.date);
      /* a run of days, capped — a job spanning years is a typo, not a plan */
      for (let n = 0; n < 400; n++){
        const k = U.ymd(d);
        out.push(k);
        if (k >= last) break;
        d = U.addDays(d, 1);
      }
    }
    if (t.due) out.push(t.due);
    return out;
  }

  const textOf = t => [
    t.title, t.subtitle, t.notes,
    ORG.store.labelName(t),
    ...ORG.store.leaves(t).map(s => s.text),
    ...t.files.map(f => f.name),
  ].join(" ").toLowerCase();

  function hits(t, term, days, text){
    switch (term.kind){
      case "text":  return text.includes(term.v);
      case "day":   return days.includes(term.k);
      case "md":    return days.some(k => +k.slice(5, 7) === term.mo + 1 && +k.slice(8, 10) === term.d);
      case "month": return days.some(k => +k.slice(5, 7) === term.mo + 1);
      case "year":  return days.some(k => +k.slice(0, 4) === term.y);
      case "time":  return inClock(t, term.min);
      default:      return false;
    }
  }

  /** Was this job running at that time of day? */
  function inClock(t, min){
    if (!t.start) return false;
    const from = U.parseTime(t.start);
    const to   = t.end ? U.parseTime(t.end) : from;
    if (min === from || min === to) return true;
    /* Across days the clock says when it starts and when it finishes, not
       what it covers in between, so only the ends are meaningful. */
    if (t.endDate) return false;
    return min > from && min < to;
  }

  /** Does this task answer the query? An empty query answers yes. */
  function test(t, terms){
    if (!terms.length) return true;
    const days = daysOf(t);
    const text = textOf(t);
    return terms.every(term => hits(t, term, days, text));
  }

  return { parse, test, monthIndex };
})();
