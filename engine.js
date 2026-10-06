// Memory Match engine: turns a sentence into tags, scores photos on every tag, and explains each match.
// Pure functions, no DOM, so the same code runs in the browser and in node tests.

export const TODAY = "2026-10-06";

const COLORS = ["red", "yellow", "green", "blue", "black", "white", "grey", "gray", "pink", "orange", "purple", "brown", "maroon"];

// Each family: the word people say -> words that count as the same thing in photo labels.
const FAMILIES = {
  hoodie: ["hoodie", "hoody", "sweatshirt", "jacket"],
  sweater: ["sweater", "jumper", "pullover", "cardigan"],
  "t-shirt": ["t-shirt", "tshirt", "tee"],
  shirt: ["shirt"],
  cup: ["cup", "mug"],
  "fairy lights": ["fairy lights", "string lights", "fairy light"],
  "cold coffee": ["cold coffee", "cold coffees", "iced coffee", "frappe"],
  coffee: ["coffee"],
  ticket: ["ticket", "boarding pass", "flight"],
  insurance: ["insurance", "policy"],
  car: ["car"],
  bike: ["bike", "scooter", "two-wheeler"],
  paper: ["paper", "document"],
  logo: ["logo"],
  bill: ["bill", "invoice", "receipt"],
  ac: ["ac", "air conditioner", "aircon"],
  electricity: ["electricity", "power"],
  whiteboard: ["whiteboard", "board", "flip chart"],
  marker: ["marker", "pen"],
  swing: ["swing"],
  slide: ["slide"],
  cake: ["cake", "birthday cake"],
  candles: ["candles", "candle"],
  sunrise: ["sunrise"],
  sunset: ["sunset"],
  beach: ["beach"],
  sea: ["sea", "ocean"],
  cafe: ["cafe", "café", "coffee shop"],
  bar: ["bar", "pub"],
  medicine: ["medicine", "medicines", "tablets", "tablet", "pills", "strip"],
  mole: ["mole", "beauty spot"],
  freckles: ["freckles", "freckle"],
  beard: ["beard"],
  glasses: ["glasses", "spectacles"],
  hat: ["hat", "cap"],
  saree: ["saree", "sari"],
  diyas: ["diya", "diyas", "lamps"],
  fireworks: ["fireworks", "crackers", "sparkler"],
  rangoli: ["rangoli"],
  wedding: ["wedding"],
  dosa: ["dosa"],
  food: ["food", "meal", "breakfast", "lunch", "dinner"],
  thali: ["thali"],
  temple: ["temple"],
  church: ["church"],
  fort: ["fort"],
  waterfall: ["waterfall"],
  plantation: ["plantation", "estate"],
  "group selfie": ["group selfie", "selfie"],
  phone: ["phone"],
  dog: ["dog"],
  lake: ["lake"],
  fog: ["fog", "mist", "misty", "foggy"],
};

// Extra label words that count as a match for a family, without being read from the sentence.
const ALSO = { food: ["dosa", "thali", "rice", "curry", "chutney", "sambar", "banana leaf", "cake", "cold coffee"] };

const PEOPLE_ALIASES = {
  sister: "Isha", sis: "Isha", wife: "Riya", son: "Kabir", kid: "Kabir", baby: "Kabir", boy: "Kabir",
  mom: "Mom", mother: "Mom", amma: "Mom", mum: "Mom", dad: "Dad", father: "Dad", papa: "Dad",
};

// Distinctive words people use for places, mapped to the label text they should match.
const PLACE_ALIASES = {
  goa: ["goa"], "nandi hills": ["nandi hills"], nandi: ["nandi hills"], "hauz khas": ["hauz khas"],
  coorg: ["coorg"], delhi: ["delhi"], jaipur: ["jaipur"], mysuru: ["mysuru"], mysore: ["mysuru"],
  bengaluru: ["bengaluru"], bangalore: ["bengaluru"], ladakh: ["ladakh", "leh"], leh: ["leh"],
  "cubbon park": ["cubbon park"], cubbon: ["cubbon park"], lalbagh: ["lalbagh"], park: ["park", "lalbagh"],
  offsite: ["offsite"], baga: ["baga"], vagator: ["vagator"], calangute: ["calangute"], aguada: ["aguada"],
  koramangala: ["koramangala"], indiranagar: ["indiranagar"], office: ["office"], home: ["home"],
  meetup: ["meetup"], "old goa": ["old goa"], mapusa: ["mapusa"], mumbai: ["mumbai"],
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DIWALI = ["2024-11-01", "2025-10-20", "2026-11-08"];
const STOP = new Set("a an the and or of in on at to from for with my me i we our us was were had have has that this those these photo photos picture pic pics where when who it its is are be been find show looking look for some one there around about like near by she he her his they them their wearing wore holding having trip time day took taken last this year".split(" "));

const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const endOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 864e5);
const monthLabel = s => { const [y, m] = s.split("-"); return `${MONTHS[+m - 1][0].toUpperCase()}${MONTHS[+m - 1].slice(1)} ${y}`; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (hay, w) => new RegExp(`(^|[^a-z0-9])${esc(w)}([^a-z0-9]|$)`, "i").test(hay);

export function libraryVocab(photos) {
  const people = new Set(), textWords = new Set();
  for (const p of photos) {
    p.people.forEach(x => people.add(x));
    (p.text || "").split(/[^a-z0-9-]+/i).filter(w => w.length > 3).forEach(w => textWords.add(w.toLowerCase()));
  }
  return { people: [...people], textWords };
}

// ---------- time ----------
export function parseTime(s) {
  s = " " + s.toLowerCase() + " ";
  const ty = +TODAY.slice(0, 4), tm = +TODAY.slice(5, 7);
  const years = [2024, 2025, 2026];
  let yearsSaid = [...s.matchAll(/\b(20\d\d)\b/g)].map(m => +m[1]);
  if (/\blast year\b/.test(s)) yearsSaid.push(ty - 1);
  if (/\bthis year\b/.test(s)) yearsSaid.push(ty);
  const ys = yearsSaid.length ? yearsSaid : null;
  const wins = [], labels = [];
  const mk = (from, to) => wins.push([from, to]);
  if (/\bdiwali\b/.test(s)) {
    DIWALI.filter(d => !ys || ys.includes(+d.slice(0, 4))).filter(d => d <= TODAY).forEach(d => mk(addDays(d, -7), addDays(d, 7)));
    labels.push("around Diwali" + (ys ? " " + ys.join("/") : ""));
  }
  const season = (name, ms, lastOnly) => {
    if (!new RegExp(`\\b${name}\\b`).test(s)) return;
    const isLast = new RegExp(`\\blast ${name}\\b`).test(s);
    let yy = ys || years;
    if (isLast) { yy = [ms[0] <= tm && ms[ms.length - 1] < tm ? ty : ty - 1]; }
    for (const y of yy) mk(iso(y, ms[0], 1), iso(y, ms[ms.length - 1], endOfMonth(y, ms[ms.length - 1])));
    labels.push((isLast ? "last " : "") + name + (isLast ? ` (${yy[0]})` : ys ? " " + ys.join("/") : ""));
  };
  season("summer", [4, 5, 6]); season("monsoon", [7, 8, 9]);
  if (/\bwinter\b/.test(s)) {
    for (const y of ys || years) mk(iso(y - 1, 12, 1), iso(y, 2, 28));
    labels.push("winter" + (ys ? " " + ys.join("/") : ""));
  }
  const monthsSaid = [];
  MONTHS.forEach((m, i) => { if (new RegExp(`\\b(${MONTH_FULL[i]}|${m})\\b`).test(s) && !(m === "may" && !/\bmay\s+20\d\d\b|\bin may\b/.test(s))) monthsSaid.push(i + 1); });
  for (const m of monthsSaid) {
    for (const y of ys || years) mk(iso(y, m, 1), iso(y, m, endOfMonth(y, m)));
    labels.push(MONTH_FULL[m - 1][0].toUpperCase() + MONTH_FULL[m - 1].slice(1, 3) + (ys ? " " + ys.join("/") : ""));
  }
  if (/\blast month\b/.test(s)) { const y = tm === 1 ? ty - 1 : ty, m = tm === 1 ? 12 : tm - 1; mk(iso(y, m, 1), iso(y, m, endOfMonth(y, m))); labels.push("last month"); }
  if (/\brecently\b/.test(s)) { mk(addDays(TODAY, -90), TODAY); labels.push("recently"); }
  if (!wins.length && ys) { for (const y of ys) mk(iso(y, 1, 1), iso(y, 12, 31)); labels.push(/\blast year\b/.test(s) ? `last year (${ys.join("/")})` : ys.join("/")); }
  if (!wins.length) return null;
  return { label: labels.join(", "), windows: wins };
}

// ---------- sentence -> tags (rule-based reader) ----------
export function ruleParse(sentence, photos) {
  const vocab = libraryVocab(photos);
  const raw = sentence.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
  let s = " " + raw.replace(/[^a-z0-9\s-]/g, " ") + " ";
  const tags = [];
  const used = new Set();
  const take = phrase => { s = s.replace(new RegExp(`\\b${esc(phrase)}\\b`, "g"), " "); };

  // people
  const people = new Set();
  for (const name of vocab.people) if (hasWord(s, name.toLowerCase())) { people.add(name); take(name.toLowerCase()); }
  for (const [w, name] of Object.entries(PEOPLE_ALIASES)) if (hasWord(s, w)) { people.add(name); take(w); }
  if (!people.size && /\b(me|myself|selfie of me)\b/.test(s)) people.add("Aarav");
  people.forEach(p => tags.push({ type: "person", value: p, label: p === "Aarav" ? "You (Aarav)" : p }));

  // time (before places, so "may" etc. are consumed)
  const time = parseTime(raw);
  if (time) {
    tags.push({ type: "time", value: time, label: time.label });
    take("last year"); take("this year"); take("last month"); take("last summer"); take("diwali");
    ["summer", "winter", "monsoon", "recently", ...MONTH_FULL, ...MONTHS.filter(m => m !== "may")].forEach(take);
    s = s.replace(/\b20\d\d\b/g, " ");
  }

  // places (longest first)
  for (const w of Object.keys(PLACE_ALIASES).sort((a, b) => b.length - a.length)) {
    if (hasWord(s, w)) {
      if (w === "park" && tags.some(t => t.type === "place" && /park/.test(t.value))) { take(w); continue; }
      tags.push({ type: "place", value: w, match: PLACE_ALIASES[w], label: w.replace(/\b\w/g, c => c.toUpperCase()) });
      take(w);
    }
  }

  // details: colour + thing
  const words = s.split(/\s+/).filter(Boolean);
  const joined = " " + words.join(" ") + " ";
  const famHits = [];
  for (const [fam, syns] of Object.entries(FAMILIES)) {
    for (const syn of syns.slice().sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(?:\\b(${COLORS.join("|")})\\s+)?\\b${esc(syn)}\\b`);
      const m = joined.match(re);
      if (m) { famHits.push({ fam, color: m[1] ? m[1].replace("gray", "grey") : null, idx: m.index, syn }); break; }
    }
  }
  // drop families fully covered by a longer one (e.g. "coffee" inside "cold coffee")
  const keep = famHits.filter(h => !famHits.some(o => o !== h && o.syn.length > h.syn.length && o.syn.includes(h.syn)));
  keep.sort((a, b) => a.idx - b.idx).forEach(h => {
    tags.push({ type: "detail", value: h.fam, color: h.color, label: (h.color ? h.color + " " : "") + h.fam });
    h.syn.split(/\s+/).forEach(w => used.add(w)); if (h.color) used.add(h.color);
  });

  // Every other word is still searched: in names, places, things seen, printed text and source,
  // allowing a partial word ("dos" -> dosa) or a small typo ("sunrse" -> sunrise).
  for (const w of words) {
    if (STOP.has(w) || GENERIC.has(w) || w.length < 3 || used.has(w) || /^\d+$/.test(w)) continue;
    if (Object.values(FAMILIES).some(syns => syns.includes(w))) continue;
    if (COLORS.includes(w)) { tags.push({ type: "any", value: w, label: w }); continue; }
    const name = vocab.people.find(n => n.length > 2 && n.toLowerCase().startsWith(w));
    if (name && !people.has(name)) { people.add(name); tags.push({ type: "person", value: name, label: name }); continue; }
    tags.push({ type: "any", value: w, label: w });
  }
  return tags;
}

const GENERIC = new Set("man woman guy girl person people someone somebody thing things stuff image images shot screenshot picture kind sort which what with".split(" "));

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Find a word anywhere in a photo's labels, forgiving partial words and small typos.
// Returns the label phrase it was found in, or null.
export function fuzzyFind(word, p) {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  const fields = [...p.people, p.place, p.city, ...p.objects, p.source, p.text || ""].filter(Boolean);
  for (const f of fields) {
    for (const tok of f.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean)) {
      const ok = tok === w || tok.startsWith(w)
        || (w.length >= 4 && tok.length >= 4 && w.startsWith(tok))
        || (w.length >= 4 && tok.length >= 4 && lev(w, tok) <= 1)
        || (w.length >= 7 && lev(w, tok) <= 2);
      if (ok) return f.length > 40 ? tok : f;
    }
  }
  return null;
}

// Gemini returns a loose JSON; turn it into the same tag shape, keeping only values we can check.
export function tagsFromAI(j, photos) {
  const vocab = libraryVocab(photos);
  const tags = [];
  (j.people || []).forEach(p => {
    const name = vocab.people.find(n => n.toLowerCase() === String(p).toLowerCase()) || PEOPLE_ALIASES[String(p).toLowerCase()];
    if (name) tags.push({ type: "person", value: name, label: name === "Aarav" ? "You (Aarav)" : name });
  });
  if (j.time && Array.isArray(j.time.windows) && j.time.windows.length) {
    const wins = j.time.windows.filter(w => Array.isArray(w) && /^\d{4}-\d\d-\d\d$/.test(w[0]) && /^\d{4}-\d\d-\d\d$/.test(w[1]));
    if (wins.length) tags.push({ type: "time", value: { label: String(j.time.label || "time"), windows: wins }, label: String(j.time.label || "time") });
  }
  (j.places || []).forEach(p => {
    const w = String(p).toLowerCase();
    tags.push({ type: "place", value: w, match: PLACE_ALIASES[w] || [w], label: w.replace(/\b\w/g, c => c.toUpperCase()) });
  });
  (j.details || []).forEach(d => {
    const noun = String(d.thing || d.noun || "").toLowerCase();
    const fam = Object.entries(FAMILIES).find(([f, syns]) => f === noun || syns.includes(noun));
    const color = d.colour || d.color ? String(d.colour || d.color).toLowerCase().replace("gray", "grey") : null;
    const value = fam ? fam[0] : noun;
    if (value) tags.push({ type: "detail", value, color: COLORS.includes(color) ? color : null, label: (COLORS.includes(color) ? color + " " : "") + value });
  });
  (j.text || []).forEach(t => { const w = String(t).toLowerCase(); if (w) tags.push({ type: "text", value: w, label: `“${w}”` }); });
  return tags;
}

// ---------- scoring ----------
const WEIGHT = { person: 3, place: 3, time: 2, detail: 2, text: 2, kind: 2, daypart: 1, any: 2 };

export const DAYPARTS = { morning: [5, 12], afternoon: [12, 17], evening: [17, 21], night: [21, 29] };

// Type of photo, picked from the filter panel.
export const KINDS = {
  photo: { label: "Photos", test: p => p.source === "Camera" && !p.objects.includes("document") },
  selfie: { label: "Selfies", test: p => p.objects.some(o => /selfie/.test(o)) },
  screenshot: { label: "Screenshots", test: p => p.source === "Screenshot" },
  document: { label: "Documents", test: p => p.objects.some(o => /document|bill|boarding pass|ticket|whiteboard|flip chart|medicine strip/.test(o)) },
  whatsapp: { label: "From WhatsApp", test: p => p.source === "WhatsApp" },
  download: { label: "Downloads", test: p => p.source === "Download" },
};

function checkTag(tag, p) {
  const where = `${p.place} ${p.city}`.toLowerCase();
  if (tag.type === "person") {
    return p.people.includes(tag.value) ? { r: "yes", say: tag.label } : { r: "no", say: `no ${tag.value}` };
  }
  if (tag.type === "place") {
    if (tag.match.some(m => hasWord(where, m))) return { r: "yes", say: tag.label };
    if (tag.match.some(m => hasWord(p.text || "", m))) return { r: "yes", say: `${tag.label} (on the ${p.objects.includes("boarding pass") ? "ticket" : "document"})` };
    return { r: "no", say: p.city ? `${p.city}, not ${tag.label}` : `no place` };
  }
  if (tag.type === "time") {
    const d = p.date.slice(0, 10);
    if (tag.value.windows.some(([a, b]) => d >= a && d <= b)) return { r: "yes", say: monthLabel(d) };
    const gap = Math.min(...tag.value.windows.map(([a, b]) => d < a ? daysBetween(a, d) : daysBetween(d, b)));
    if (gap <= 45) return { r: "near", say: `${monthLabel(d)}, a bit off` };
    return { r: "no", say: `${monthLabel(d)}, not ${tag.label}` };
  }
  if (tag.type === "detail") {
    const syns = (FAMILIES[tag.value] || [tag.value]).concat(ALSO[tag.value] || []);
    const phrases = [...p.objects, p.place].map(x => x.toLowerCase());
    const hit = phrases.find(ph => syns.some(sy => hasWord(ph, sy)));
    if (hit) {
      if (!tag.color) return { r: "yes", say: hit };
      if (hasWord(hit, tag.color)) return { r: "yes", say: hit };
      const other = COLORS.find(c => hasWord(hit, c));
      return { r: "near", say: other ? `${hit}, not ${tag.color}` : `${hit}, colour unknown` };
    }
    if (!ALSO[tag.value] && syns.some(sy => hasWord(p.text || "", sy))) return { r: "yes", say: `${tag.value} (in text)` };
    const words = tag.value.split(/\s+/);
    const found = words.map(w => fuzzyFind(w, p));
    if (found.every(Boolean)) return { r: tag.color && !found.some(f => hasWord(f, tag.color)) ? "near" : "yes", say: found[found.length - 1] };
    return { r: "no", say: `no ${tag.label}` };
  }
  if (tag.type === "any") {
    const f = fuzzyFind(tag.value, p);
    return f ? { r: "yes", say: f } : { r: "no", say: `no ${tag.label}` };
  }
  if (tag.type === "daypart") {
    const [a, b] = DAYPARTS[tag.value] || [0, 0];
    let hr = +p.date.slice(11, 13); if (hr < 5) hr += 24;
    return hr >= a && hr < b ? { r: "yes", say: tag.label.toLowerCase() } : { r: "no", say: `not ${tag.label.toLowerCase()}` };
  }
  if (tag.type === "kind") {
    const k = KINDS[tag.value];
    return k && k.test(p) ? { r: "yes", say: tag.label } : { r: "no", say: `not ${tag.label.toLowerCase()}` };
  }
  if (tag.type === "text") {
    if (hasWord(p.text || "", tag.value)) return { r: "yes", say: tag.label };
    const f = fuzzyFind(tag.value, p);
    return f ? { r: "yes", say: f } : { r: "no", say: `no ${tag.label}` };
  }
  return { r: "no", say: "" };
}

export function scorePhoto(tags, p) {
  let got = 0, max = 0;
  const checks = tags.map(t => {
    const c = checkTag(t, p);
    const w = WEIGHT[t.type] || 1;
    max += w; got += c.r === "yes" ? w : c.r === "near" ? w * 0.4 : 0;
    return { tag: t, ...c };
  });
  return { photo: p, score: max ? got / max : 0, checks, full: checks.every(c => c.r === "yes") };
}

const groupKey = p => `${[...p.people].sort().join("+")}|${p.place}|${p.date.slice(0, 10)}|${p.objects[0]}`;

export function search(tags, photos) {
  if (!tags.length) return { groups: [], scored: [] };
  const scored = photos.map(p => scorePhoto(tags, p)).filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.photo.date < b.photo.date ? 1 : -1));
  const byKey = new Map();
  const groups = [];
  for (const s of scored) {
    const k = groupKey(s.photo);
    if (byKey.has(k)) byKey.get(k).similar.push(s);
    else { const g = { best: s, similar: [] }; byKey.set(k, g); groups.push(g); }
  }
  return { groups, scored };
}

// One question that would split the remaining photos best: who was there, or roughly when.
export function followUp(tags, result) {
  const fullCount = result.groups.filter(g => g.best.full).length;
  if (fullCount >= 1 && fullCount <= 6) return null; // the answer is already on screen
  const pool = (fullCount ? result.groups.filter(g => g.best.full) : result.groups.slice(0, 20)).map(g => g.best.photo);
  if (pool.length < 2) return null;
  if (!tags.some(t => t.type === "person")) {
    const count = {};
    pool.forEach(p => p.people.filter(x => x !== "Aarav").forEach(x => count[x] = (count[x] || 0) + 1));
    const opts = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    if (opts.length >= 2) return { q: "Who else was in the photo?", type: "person", options: opts };
  }
  if (!tags.some(t => t.type === "time")) {
    const count = {};
    pool.forEach(p => { const k = p.date.slice(0, 4); count[k] = (count[k] || 0) + 1; });
    const opts = Object.keys(count).sort().reverse().slice(0, 3);
    if (opts.length >= 2) return { q: "Roughly which year was it?", type: "time", options: opts };
  }
  if (!tags.some(t => t.type === "place")) {
    const count = {};
    pool.forEach(p => p.city && (count[p.city] = (count[p.city] || 0) + 1));
    const opts = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    if (opts.length >= 2) return { q: "Where was it taken?", type: "place", options: opts };
  }
  return null;
}

// "Today" baseline: one word, newest first, everything that contains that word.
export function oneWord(word, photos) {
  const w = word.toLowerCase();
  const syns = FAMILIES[w] || [w];
  const hits = photos.filter(p => {
    const hay = [p.people.join(" "), p.place, p.city, p.objects.join(" "), p.text || ""].join(" ").toLowerCase();
    return syns.some(sy => hasWord(hay, sy)) || (PLACE_ALIASES[w] || []).some(m => hasWord(hay, m));
  });
  return hits.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function oneWordCandidates(tags) {
  return tags.map(t => t.type === "time" || t.type === "kind" || t.type === "daypart" ? null : t.type === "detail" ? t.value : t.type === "place" ? t.value : t.value).filter(Boolean)
    .map(x => String(x).toLowerCase()).filter((x, i, a) => a.indexOf(x) === i);
}
