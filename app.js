import { ruleParse, tagsFromAI, parseTime, search, followUp, oneWord, oneWordCandidates, TODAY, KINDS, DAYPARTS } from "./engine.js";

const $ = id => document.getElementById(id);
const h = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const EXAMPLES = [
  "me and Riya in Goa around Diwali",
  "man with a mole and freckles",
  "that AC bill from last summer",
  "me holding a black cup",
];
// Live tasks described in the hypothetical (composite) interviews.
const TASKS = [
  { id: "T1", say: "me and my sister at Nandi Hills at sunrise, she had a yellow hoodie" },
  { id: "T2", say: "my IndiGo ticket for the Goa trip last year" },
  { id: "T3", say: "my son on the swing in the park, red sweater" },
  { id: "T4", say: "car insurance paper with a red logo" },
  { id: "T5", say: "café in Hauz Khas with fairy lights, we had cold coffees" },
  { id: "T6", say: "whiteboard from the Goa offsite, green marker" },
];

let LIB = [];
let tags = [];
let result = { groups: [], scored: [] };
let activeTask = null;
let startedAt = 0;
let todayWord = null;
let viewing = null;
let readBy = "";
let measures = {};
try { measures = JSON.parse(localStorage.getItem("mm-measures") || "{}"); } catch (e) {}

const ICON = { person: "person", place: "location_on", time: "calendar_today", detail: "sell", text: "match_case", kind: "photo_library", daypart: "schedule" };
const SOURCE_ICON = { Camera: "photo_camera", WhatsApp: "chat", Screenshot: "screenshot_monitor", Download: "download" };
const dt = d => new Date(d.replace(" ", "T"));
const fmtDate = d => dt(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = d => dt(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtTime = d => dt(d).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
const img = p => `photos/${p.id}.jpg`;

async function boot() {
  const j = await (await fetch("data/library.json")).json();
  LIB = j.photos;
  $("libcount").textContent = `${LIB.length} photos of Aarav, a made-up user. “Today” is ${fmtDate(TODAY)}.`;
  $("form").onsubmit = e => {
    e.preventDefault(); hideSuggest();
    const t = TASKS.find(t => t.id === activeTask);
    if (!t || t.say !== $("q").value.trim()) activeTask = null;
    run($("q").value);
  };
  $("q").onfocus = () => { hideFilters(); $("q").select(); showSuggest(true); };
  $("q").oninput = () => showSuggest(false);
  // the filter panel sits inside the form, so Enter is handled here rather than by implicit form submission
  $("q").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("form").requestSubmit(); } };
  document.addEventListener("click", e => { if (!e.target.closest(".searchpill")) { hideSuggest(); hideFilters(); } });
  $("clearQ").onclick = () => { $("q").value = ""; $("q").focus(); };
  $("filterBtn").onclick = e => { e.stopPropagation(); toggleFilters(); };
  $("backBtn").onclick = goHome;
  $("logo").onclick = e => { e.preventDefault(); goHome(); };
  $("menuBtn").onclick = () => $("rail").classList.toggle("open");
  $("rail").onclick = e => {
    const a = e.target.closest("[data-nav]");
    if (!a) return;
    e.preventDefault();
    $("rail").classList.remove("open");
    const n = a.dataset.nav;
    if (n === "photos") goHome();
    if (n === "search") { if (tags.length) showResults(); else $("q").focus(); }
    if (n === "tasks") showTasks();
    if (n === "compare") showCompare();
    if (n === "credits") showCredits();
  };
  $("vBack").onclick = closeViewer;
  $("vInfo").onclick = () => $("vPanel").classList.toggle("hidden");
  $("foundBtn").onclick = markFound;
  $("dClose").onclick = closeDialog;
  $("scrim").onclick = e => { if (e.target.id === "scrim") closeDialog(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeViewer(); closeDialog(); hideSuggest(); hideFilters(); } });
  window.addEventListener("resize", () => { if (!$("home").classList.contains("hidden")) renderTimeline(); });
  renderTimeline();
  const q = new URLSearchParams(location.search).get("q");
  if (q) run(q);
}

function setNav(n) { document.querySelectorAll(".navi").forEach(a => a.classList.toggle("active", a.dataset.nav === n)); }
function goHome() { $("results").classList.add("hidden"); $("home").classList.remove("hidden"); setNav("photos"); renderTimeline(); }
function showResults() { $("home").classList.add("hidden"); $("results").classList.remove("hidden"); setNav("search"); }

// ---------- search box suggestions ----------
function showSuggest(all) {
  const typed = all ? "" : $("q").value.trim().toLowerCase();
  const ex = EXAMPLES.filter(e => !typed || e.includes(typed));
  const ts = TASKS.filter(t => !typed || t.say.toLowerCase().includes(typed));
  if (!ex.length && !ts.length) { hideSuggest(); return; }
  $("suggest").innerHTML =
    (ex.length ? `<div class="sg-h">Try describing a photo</div>` + ex.map(e => `<button type="button" data-s="${h(e)}"><span class="ms">search</span>${h(e)}</button>`).join("") : "") +
    (ts.length ? `<div class="sg-h">Test tasks from the interviews</div>` + ts.map(t => `<button type="button" data-t="${t.id}"><span class="ms">checklist</span>${h(t.say)}</button>`).join("") : "");
  $("suggest").classList.remove("hidden");
  $("suggest").onclick = e => {
    const b = e.target.closest("button");
    if (!b) return;
    hideSuggest();
    if (b.dataset.t) startTask(b.dataset.t); else { activeTask = null; run(b.dataset.s); }
  };
}
function hideSuggest() { $("suggest").classList.add("hidden"); }

// ---------- Photos timeline (justified rows, grouped by day) ----------
function renderTimeline() {
  const H = window.innerWidth < 600 ? 100 : 150;
  const maxW = ($("timeline").clientWidth || 900);
  const byDay = new Map();
  [...LIB].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(p => {
    const k = p.date.slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(p);
  });
  let html = "", month = "";
  for (const [day, ps] of byDay) {
    const m = day.slice(0, 7);
    const place = [...new Set(ps.map(p => p.place).filter(Boolean))][0] || "";
    html += `<div class="dsec"><p class="day-h">${dt(day + " 00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(day.slice(0, 4) !== TODAY.slice(0, 4) ? { year: "numeric" } : {}) })}${place ? ` <span>${h(place)}</span>` : ""}</p><div class="tiles">${ps.map(p => `<div class="jt" data-open="${p.id}" style="width:${Math.min(maxW, Math.round((p.w / p.h) * H))}px;height:${H}px;background-image:url('${img(p)}')"></div>`).join("")}</div></div>`;
  }
  $("timeline").innerHTML = html;
  $("timeline").onclick = e => { const t = e.target.closest("[data-open]"); if (t) openPhoto(t.dataset.open); };
}

// ---------- reading the sentence ----------
async function readSentence(sentence) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch("api/parse", {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ sentence, people: [...new Set(LIB.flatMap(p => p.people))], today: TODAY }),
    });
    clearTimeout(timer);
    if (r.ok) {
      const j = await r.json();
      if (j && j.tags) {
        const t = tagsFromAI(j.tags, LIB);
        if (t.length) return { tags: t, by: "Read by Gemini" };
      }
    }
  } catch (e) {}
  return { tags: ruleParse(sentence, LIB), by: "Read by simple rules (AI not connected)" };
}

function startTask(id) {
  activeTask = id;
  run(TASKS.find(t => t.id === id).say);
}

async function run(sentence) {
  sentence = (sentence || "").trim();
  if (!sentence) return;
  $("q").value = sentence;
  $("q").blur();
  startedAt = performance.now();
  showResults();
  $("resTitle").textContent = sentence;
  $("grid").innerHTML = "";
  const ti = activeTask ? TASKS.findIndex(t => t.id === activeTask) + 1 : 0;
  $("taskNote").innerHTML = ti ? `<span class="ms">checklist</span>Test task ${ti}: open the right photo and tap “This is the one”` : "";
  $("taskNote").classList.toggle("hidden", !ti);
  const r = await readSentence(sentence);
  tags = r.tags;
  readBy = r.by;
  todayWord = null;
  refresh();
}

function makeTag(type, val) {
  const v = val.toLowerCase();
  if (type === "person") { const name = val[0].toUpperCase() + val.slice(1); return { type, value: name, label: name }; }
  if (type === "place") return { type, value: v, match: [v], label: val };
  if (type === "time") { const t = parseTime(val); return t ? { type, value: t, label: t.label } : null; }
  if (type === "text") return { type, value: v, label: `“${v}”` };
  const parsed = ruleParse(val, LIB).find(t => t.type === "detail");
  return parsed || { type: "detail", value: v, color: null, label: v };
}

function refresh() {
  result = search(tags, LIB);
  if (!$("q").value.trim()) $("resTitle").textContent = tags.length ? "Filtered photos" : "Search";
  const n = tags.length;
  $("fbadge").textContent = n; $("fbadge").classList.toggle("hidden", !n);
  $("filterBtn").classList.toggle("on", !!n);
  if (!$("fpanel").classList.contains("hidden")) renderFilters();
  renderResults();
  renderFollowUp();
}

// ---------- results, near misses ----------
function whyLine(checks) {
  const sym = { yes: "✓", near: "~", no: "✗" };
  return checks.map(c => `<span class="${c.r}">${sym[c.r]} ${h(c.say)}</span>`).join("");
}

function renderResults() {
  const top = result.groups.slice(0, 6);
  const nofit = top.length && !top[0].best.full;
  const banner = $("nofit");
  if (nofit) {
    const miss = top[0].best.checks.filter(c => c.r !== "yes").map(c => c.tag.label);
    banner.innerHTML = `<span class="ms">lightbulb</span><div><b>No exact match.</b> Here are the closest. The first one has everything except <b>${h(miss.join(", "))}</b>. You can change that in <b>Filters</b>.</div>`;
    banner.classList.remove("hidden");
  } else banner.classList.add("hidden");
  if (!tags.length) { $("grid").innerHTML = `<p class="sec">Type what you remember, or pick something in Filters.</p>`; return; }
  if (!top.length) { $("grid").innerHTML = `<p class="sec">No photos found. Try removing a filter.</p>`; return; }
  $("grid").innerHTML = top.map((g, i) => {
    const p = g.best.photo;
    return `<div class="tile ${g.best.full ? "full" : ""}" data-open="${p.id}">
      <div class="img" style="background-image:url('${img(p)}')"><span class="rank">${i + 1}</span>
        ${g.similar.length ? `<button class="stack" data-stack="${i}" title="Look-alike photos from the same moment"><span class="ms">burst_mode</span>${g.similar.length + 1}</button>` : ""}</div>
      <div class="why">${whyLine(g.best.checks)}</div>
      <div class="when">${fmtDate(p.date)} · ${h(p.place || p.source)}${p.city && p.place !== p.city ? ", " + h(p.city) : ""}</div></div>`;
  }).join("");
  $("grid").onclick = e => {
    const s = e.target.closest("[data-stack]");
    if (s) { e.stopPropagation(); showStack(top[+s.dataset.stack]); return; }
    const o = e.target.closest("[data-open]");
    if (o) openPhoto(o.dataset.open);
  };
}

function renderFollowUp() {
  const f = tags.length ? followUp(tags, result) : null;
  $("step4").classList.toggle("hidden", !f);
  if (!f) return;
  const fullCount = result.groups.filter(g => g.best.full).length;
  $("fuQ").textContent = (fullCount > 6 ? `${fullCount} photos match everything. ` : "") + f.q;
  $("fuOpts").innerHTML = f.options.map(o => `<button class="chip plain" data-fu="${h(o)}">${h(o)}</button>`).join("") + `<button class="chip plain" data-fu="">Not sure</button>`;
  $("fuOpts").onclick = e => {
    const b = e.target.closest("[data-fu]");
    if (!b) return;
    if (!b.dataset.fu) { $("step4").classList.add("hidden"); return; }
    const t = makeTag(f.type, b.dataset.fu);
    if (t) { tags.push(t); refresh(); }
  };
}

// ---------- today vs Memory Match ----------
function targetPhoto() { return activeTask ? LIB.find(p => p.target === activeTask) : null; }
function mmRankOf(id) {
  const i = result.groups.findIndex(g => g.best.photo.id === id || g.similar.some(s => s.photo.id === id));
  return i < 0 ? null : i + 1;
}

function showCompare() {
  const words = oneWordCandidates(tags);
  if (!words.length) {
    openDialog(`<h3>Compare with today's search</h3><p class="sec">Search for something first, then open this to see how one-word search would do.</p>`);
    $("dBody").onclick = null;
    return;
  }
  const tp = targetPhoto();
  if (!todayWord || !words.includes(todayWord)) {
    // default to the word that gives one-word search its best shot
    todayWord = words.map(w => ({ w, hits: oneWord(w, LIB) }))
      .map(x => ({ ...x, pos: tp ? x.hits.findIndex(p => p.id === tp.id) : -1 }))
      .sort((a, b) => tp ? ((a.pos < 0) - (b.pos < 0) || a.pos - b.pos) : a.hits.length - b.hits.length)[0].w;
  }
  const hits = oneWord(todayWord, LIB);
  let todayRank = "You scroll these one by one, with no reason shown.", mmRank = "Each one says what matched.";
  if (tp) {
    const tpos = hits.findIndex(p => p.id === tp.id);
    const mr = mmRankOf(tp.id);
    todayRank = tpos < 0 ? "The right photo isn't in the results." : `Right photo is #${tpos + 1}, after ${tpos} other photo${tpos === 1 ? "" : "s"}.`;
    mmRank = mr ? `Right photo is #${mr}${mr > 6 ? " (not on screen)" : ""}.` : "Right photo not found.";
  }
  openDialog(`<h3>Compare with today's search</h3>
    <p class="sec">“${h($("q").value || "Filtered photos")}”. Today's search takes one word and lists everything with it, newest first. Pick the word:</p>
    <div class="chips">${words.map(w => `<button class="chip plain ${w === todayWord ? "on" : ""}" data-w="${h(w)}">${h(w)}</button>`).join("")}</div>
    <div class="vs">
      <div class="vsbox"><p class="ov">ONE WORD TODAY</p><p class="big">${hits.length} photo${hits.length === 1 ? "" : "s"}</p><p class="small">${todayRank}</p></div>
      <div class="vsbox blue"><p class="ov">MEMORY MATCH</p><p class="big">${Math.min(6, result.groups.length)} shown</p><p class="small">${mmRank}</p></div>
    </div>
    <p class="sec small">What one-word search shows first:</p>
    <div class="strip">${hits.slice(0, 12).map(p => `<div class="${tp && p.id === tp.id ? "hit" : ""}" style="background-image:url('${img(p)}')"></div>`).join("")}</div>
    <p class="sec small" style="margin-top:14px">${h(readBy)}. Sample library of ${LIB.length} fictional photos, so these numbers show how the idea works, not real-world results.</p>`);
  $("dBody").onclick = e => { const b = e.target.closest("[data-w]"); if (b) { todayWord = b.dataset.w; showCompare(); } };
}

// ---------- filters panel ----------
const PLACES = ["Goa", "Nandi Hills", "Coorg", "Bengaluru", "Delhi", "Hauz Khas", "Cubbon Park", "Jaipur"];
const THINGS = ["mole", "freckles", "yellow hoodie", "red sweater", "black cup", "fairy lights", "cake", "whiteboard", "boarding pass", "bill", "sunrise", "beach"];
const has = (type, value) => tags.findIndex(t => t.type === type && String(t.value).toLowerCase() === String(value).toLowerCase());
function toggleTag(t) {
  const i = has(t.type, t.value);
  if (i >= 0) tags.splice(i, 1); else tags.push(t);
  refresh();
}
function toggleFilters() { if ($("fpanel").classList.contains("hidden")) { hideSuggest(); renderFilters(); $("fpanel").classList.remove("hidden"); } else hideFilters(); }
function hideFilters() { $("fpanel").classList.add("hidden"); }

function quickTimes() {
  const y = +TODAY.slice(0, 4);
  return [["This year", String(y)], ["Last year", "last year"], ["Last summer", "last summer"], ["Around Diwali", "diwali"], ["Winter", "winter"]];
}

function renderFilters() {
  const people = [...new Set(LIB.flatMap(p => p.people))].filter(n => n !== "Aarav");
  const timeTag = tags.find(t => t.type === "time");
  const chip = (on, attrs, inner) => `<button type="button" class="chip plain ${on ? "sel" : ""}" ${attrs}>${inner}</button>`;
  $("fpanel").innerHTML = `
    <div class="fp-head"><h3>Filters</h3><button type="button" class="icon-btn small" data-close aria-label="Close"><span class="ms">close</span></button></div>
    <div class="fp-sec"><h4><span class="ms">filter_list</span>In this search</h4>
      <div class="chips">${tags.length ? tags.map((t, i) => `<span class="chip on">${t.type === "person" ? `<span class="face">${h(t.value[0])}</span>` : `<span class="ms">${ICON[t.type] || "sell"}</span>`}${h(t.label)}<button type="button" class="x" data-del="${i}" aria-label="Remove"><span class="ms">close</span></button></span>`).join("") : `<span class="sec small">Nothing yet. Pick below or type in the search bar.</span>`}</div></div>
    <div class="fp-sec"><h4><span class="ms">person</span>People</h4>
      <div class="chips">${chip(has("person", "Aarav") >= 0, `data-person="Aarav"`, `<span class="face">Y</span>You`)}${people.map(n => chip(has("person", n) >= 0, `data-person="${h(n)}"`, `<span class="face">${h(n[0])}</span>${h(n)}`)).join("")}</div></div>
    <div class="fp-sec"><h4><span class="ms">location_on</span>Places</h4>
      <div class="chips">${PLACES.map(pl => chip(has("place", pl.toLowerCase()) >= 0, `data-place="${h(pl)}"`, h(pl))).join("")}</div></div>
    <div class="fp-sec"><h4><span class="ms">calendar_today</span>Date</h4>
      <div class="chips">${quickTimes().map(([l, v]) => chip(timeTag && timeTag.src === v, `data-time="${h(v)}"`, h(l))).join("")}</div>
      <div class="fp-row"><span class="sec small">From</span><input type="date" id="fFrom" min="2024-01-01" max="${TODAY}"><span class="sec small">to</span><input type="date" id="fTo" min="2024-01-01" max="${TODAY}"><button type="button" class="textbtn" data-range>Apply dates</button></div></div>
    <div class="fp-sec"><h4><span class="ms">schedule</span>Time of day</h4>
      <div class="chips">${Object.keys(DAYPARTS).map(d => chip(has("daypart", d) >= 0, `data-daypart="${d}"`, d[0].toUpperCase() + d.slice(1))).join("")}</div></div>
    <div class="fp-sec"><h4><span class="ms">photo_library</span>Type of photo</h4>
      <div class="chips">${Object.entries(KINDS).map(([k, v]) => chip(has("kind", k) >= 0, `data-kind="${k}"`, h(v.label))).join("")}</div></div>
    <div class="fp-sec"><h4><span class="ms">sell</span>Things in the photo</h4>
      <div class="chips">${THINGS.map(t => { const d = makeTag("detail", t); return chip(has("detail", d.value) >= 0 && tags[has("detail", d.value)].color === d.color, `data-thing="${h(t)}"`, h(t)); }).join("")}</div>
      <div class="fp-row"><input type="text" id="fThing" placeholder="Something else, like a green marker or a mole on the cheek"><button type="button" class="textbtn" data-addthing>Add</button></div></div>
    <div class="fp-sec"><h4><span class="ms">match_case</span>Words in the photo</h4>
      <div class="fp-row" style="margin-top:0"><input type="text" id="fWords" placeholder="Words on a ticket, bill or sign, like IndiGo"><button type="button" class="textbtn" data-addwords>Add</button></div></div>
    <div class="fp-foot"><button type="button" class="textbtn" data-clear>Clear all</button><button type="button" class="filled" data-done>Show photos</button></div>`;
  $("fpanel").onkeydown = e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const btn = e.target.id === "fThing" ? "[data-addthing]" : e.target.id === "fWords" ? "[data-addwords]" : e.target.type === "date" ? "[data-range]" : null;
    if (btn) $("fpanel").querySelector(btn).click();
  };
  $("fpanel").onclick = e => {
    e.stopPropagation();
    const t = e.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if ("close" in d || "done" in d) { hideFilters(); if (tags.length) { showResults(); refresh(); } return; }
    if ("clear" in d) { tags = []; refresh(); return; }
    if (d.del !== undefined) { tags.splice(+d.del, 1); refresh(); return; }
    if (d.person) toggleTag({ type: "person", value: d.person, label: d.person === "Aarav" ? "You (Aarav)" : d.person });
    if (d.place) toggleTag({ type: "place", value: d.place.toLowerCase(), match: [d.place.toLowerCase()], label: d.place });
    if (d.daypart) toggleTag({ type: "daypart", value: d.daypart, label: d.daypart[0].toUpperCase() + d.daypart.slice(1) });
    if (d.kind) toggleTag({ type: "kind", value: d.kind, label: KINDS[d.kind].label });
    if (d.thing) { const nt = makeTag("detail", d.thing); const i = has("detail", nt.value); if (i >= 0 && tags[i].color === nt.color) tags.splice(i, 1); else { if (i >= 0) tags.splice(i, 1); tags.push(nt); } refresh(); }
    if (d.time) { const cur = tags.findIndex(x => x.type === "time"); const same = cur >= 0 && tags[cur].src === d.time; if (cur >= 0) tags.splice(cur, 1); if (!same) { const tt = parseTime(d.time); if (tt) tags.push({ type: "time", value: tt, label: tt.label, src: d.time }); } refresh(); }
    if ("range" in d) {
      const a = $("fFrom").value, b = $("fTo").value || TODAY;
      if (a) { const cur = tags.findIndex(x => x.type === "time"); if (cur >= 0) tags.splice(cur, 1); const label = `${fmtDate(a + " 00:00")} to ${fmtDate(b + " 00:00")}`; tags.push({ type: "time", value: { label, windows: [[a, b]] }, label }); refresh(); }
    }
    if ("addthing" in d) { const v = $("fThing").value.trim(); if (v) { tags.push(makeTag("detail", v)); refresh(); } }
    if ("addwords" in d) { const v = $("fWords").value.trim(); if (v) { tags.push(makeTag("text", v)); refresh(); } }
  };
}

// ---------- viewer ----------
function openPhoto(id) {
  const p = LIB.find(x => x.id === id);
  viewing = p;
  const s = tags.length ? result.scored.find(x => x.photo.id === id) : null;
  const c = p.credit;
  $("vImg").src = img(p);
  $("foundBtn").classList.toggle("hidden", !activeTask);
  $("foundNote").classList.add("hidden");
  $("vPanel").innerHTML = `
    <h3>Info</h3>
    ${s ? `<p class="ov">WHY IT CAME UP</p><div class="why">${whyLine(s.checks)}</div>` : ""}
    <p class="ov">DETAILS</p>
    <div class="drow"><span class="ms">calendar_today</span><div><p>${fmtDay(p.date)}</p><p class="sec small">${fmtTime(p.date)}</p></div></div>
    ${p.place || p.city ? `<div class="drow"><span class="ms">location_on</span><div><p>${h(p.place || p.city)}</p><p class="sec small">${h(p.place && p.city !== p.place ? p.city : "")}</p></div></div>` : ""}
    <div class="drow"><span class="ms">${SOURCE_ICON[p.source] || "image"}</span><div><p>${h(p.source)}</p></div></div>
    ${p.people.length ? `<p class="ov">PEOPLE</p><div class="faces">${p.people.map(n => `<div><span>${h(n[0])}</span>${h(n)}</div>`).join("")}</div>` : ""}
    <p class="ov">THINGS IN THIS PHOTO</p>
    <div class="chips" style="margin-top:0">${p.objects.map(o => `<span class="chip plain">${h(o)}</span>`).join("")}</div>
    ${p.text ? `<p class="ov">WORDS IN THE PHOTO</p><p class="small">${h(p.text)}</p>` : ""}
    <p class="ov">CREDIT</p>
    <p class="sec small">${c.url ? `<a href="${h(c.url)}" target="_blank" rel="noopener">${h(c.title)}</a> by ${h(c.creator || "unknown")} · ${h(c.license)}${c.modified ? ` · ${h(c.modified)}` : ""}` : h(c.title)}. The people, place and date above are made up for the demo.</p>`;
  $("vPanel").classList.toggle("hidden", window.innerWidth < 800 && !s);
  $("viewer").classList.remove("hidden");
}
function closeViewer() { $("viewer").classList.add("hidden"); viewing = null; }

function markFound() {
  const t = targetPhoto(), p = viewing, note = $("foundNote");
  if (t && p && t.id === p.id) {
    recordFound(p);
    const m = measures[activeTask];
    note.textContent = `Found it at #${m.mmRank} in ${m.secs}s with ${m.tags} tags. With one word it was #${m.todayBest ?? "–"} at best.`;
    note.className = "v-toast";
  } else {
    note.textContent = "Not the photo this task is looking for. Go back and try another, or change a tag.";
    note.className = "v-toast bad";
  }
}

// ---------- tasks and measurements ----------
function recordFound(p) {
  const secs = ((performance.now() - startedAt) / 1000).toFixed(1);
  const ranks = oneWordCandidates(tags).map(w => { const i = oneWord(w, LIB).findIndex(x => x.id === p.id); return i < 0 ? null : i + 1; }).filter(Boolean);
  measures[activeTask] = { mmRank: mmRankOf(p.id), secs, tags: tags.length, todayBest: ranks.length ? Math.min(...ranks) : null, todayWorst: ranks.length ? Math.max(...ranks) : null };
  try { localStorage.setItem("mm-measures", JSON.stringify(measures)); } catch (e) {}
}

function showTasks() {
  const ids = TASKS.map(t => t.id).filter(id => measures[id]);
  openDialog(`<h3>Six test tasks</h3>
    <p class="sec">Taken from the hypothetical interviews. Pick one, find the photo, open it and tap “This is the one”.</p>
    <ul class="tasks">${TASKS.map((t, i) => { const m = measures[t.id]; return `<li data-task="${t.id}"><span class="num">${i + 1}</span><div>“${h(t.say)}”${m ? `<span class="done">Found at #${m.mmRank} in ${m.secs}s · one word: #${m.todayBest ?? "–"} at best</span>` : ""}</div></li>`; }).join("")}</ul>
    ${ids.length ? `<h2>Demo measurements</h2>
    <table class="mtable"><tr><th>Task</th><th>Memory Match</th><th>One word (best to worst)</th><th>Tags</th><th>Time</th></tr>
    ${ids.map(id => { const m = measures[id]; return `<tr><td>${id.slice(1)}</td><td>#${m.mmRank}</td><td>${m.todayBest ? `#${m.todayBest} to #${m.todayWorst}` : "not found"}</td><td>${m.tags}</td><td>${m.secs}s</td></tr>`; }).join("")}</table>
    <p class="sec small">Measured on a sample library of fictional photos. This shows how the idea works, not results from real users.</p>
    <button class="textbtn" id="copyCsv">Copy as CSV</button>` : ""}`);
  $("dBody").onclick = e => {
    const li = e.target.closest("[data-task]");
    if (li) { closeDialog(); startTask(li.dataset.task); }
    if (e.target.closest("#copyCsv")) copyCsv(e.target.closest("#copyCsv"));
  };
}

function copyCsv(btn) {
  const rows = [["task", "sentence", "memory_match_rank", "one_word_best_rank", "one_word_worst_rank", "tags_used", "seconds"]];
  TASKS.forEach(t => { const m = measures[t.id]; if (m) rows.push([t.id, t.say, m.mmRank, m.todayBest ?? "", m.todayWorst ?? "", m.tags, m.secs]); });
  navigator.clipboard?.writeText(rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"));
  btn.textContent = "Copied";
}

// ---------- dialogs ----------
function openDialog(html) { $("dBody").innerHTML = html; $("scrim").classList.remove("hidden"); }
function closeDialog() { $("scrim").classList.add("hidden"); }

function showStack(g) {
  const all = [g.best, ...g.similar];
  openDialog(`<h3>${all.length} look-alike photos</h3>
    <p class="sec">Same people, place and day, so they're stacked into one tile instead of filling the screen.</p>
    <div class="simgrid">${all.map(s => `<div data-open="${s.photo.id}" style="background-image:url('${img(s.photo)}')" title="${h(s.checks.map(c => c.say).join(" · "))}"></div>`).join("")}</div>`);
  $("dBody").onclick = e => { const o = e.target.closest("[data-open]"); if (o) { closeDialog(); openPhoto(o.dataset.open); } };
}

function showCredits() {
  const real = LIB.filter(p => p.credit.url);
  openDialog(`<h3>Photo credits</h3>
    <p class="sec">${real.length} openly licensed photos found through Openverse. The ${LIB.length - real.length} tickets, bills and policies were made for this demo and are fictional. All names, places and dates attached to photos are made up.</p>
    <div class="credits">${real.map(p => `<p><a href="${h(p.credit.url)}" target="_blank" rel="noopener">${h(p.credit.title)}</a> · ${h(p.credit.creator || "unknown")} · ${p.credit.license_url ? `<a href="${h(p.credit.license_url)}" target="_blank" rel="noopener">${h(p.credit.license)}</a>` : h(p.credit.license)}${p.credit.modified ? ` · ${h(p.credit.modified)}` : ""}</p>`).join("")}</div>`);
  $("dBody").onclick = null;
}

boot();
