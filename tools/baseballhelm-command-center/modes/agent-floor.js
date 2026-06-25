/* ===========================================================================
   Agent Floor — faithful rebuild of the GolfHelm "night two" live agent
   dashboard (scripts/live_dashboard.py), retargeted to the BaseballHelm build
   and wired to the live telemetry event stream.

   Every workstream (subsystem) shows as a named CREW with a golf codename, a
   live status dot, a % completion bar, what it's doing RIGHT NOW, and a rich
   live OUTPUT WINDOW — a console tailing that crew's telemetry with colored
   stage chips, timestamps, and the full milestone + detail text. One crew is
   "Fairway" (Practice OS), exactly like the original.

   Helm CREAM background + GREEN accents. 100% honest: derived ONLY from real
   events in ctx.events — nothing invented (a crew with no events shows
   "queued"). Updates IN PLACE each tick (no remount, preserves scroll).
   =========================================================================== */
export const meta = { label: "Agent Floor", district: "Prompt Plaza" };

/* Golf codename pool — identical order to the night-two dashboard. */
const NAMES = [
  "Eagle", "Birdie", "Albatross", "Ace", "Mulligan", "Fairway", "Bunker", "Divot", "Niblick", "Mashie",
  "Brassie", "Stinger", "Draw", "Fade", "Flop", "Pitch", "Chip", "Lag", "Tempo", "Grip", "Stance", "Pin",
  "Flag", "Apron", "Fringe", "Rough", "Tee", "Hazard", "Dogleg", "Links", "Bogey", "Sandy", "Scramble",
];

/* Canonical BaseballHelm crews, FIXED order → codename = NAMES[index].
   (index 5 → "Fairway" → Practice OS, matching the original "one named fairway".)
   `kw` = regexes matched against an event's subsystem text to attribute work. */
const CREWS = [
  { key: "coach-command", name: "Coach Command Center", glyph: "🎛", kw: [/coach command/i, /command center/i, /signal layer/i, /coach.?command/i] },
  { key: "player-today", name: "Player Today", glyph: "📅", kw: [/player today/i, /daily contract/i, /today.?screen/i, /passport/i] },
  { key: "profile-timeline", name: "Player Profile & Timeline", glyph: "👤", kw: [/profile/i, /timeline/i, /snapshot card/i] },
  { key: "stats", name: "Stats Engine", glyph: "📊", kw: [/\bstats?\b/i, /statistic/i, /leaderboard/i, /spray/i, /metric depth/i] },
  { key: "imports", name: "Import Center", glyph: "📥", kw: [/import/i, /upload/i, /\bcsv\b/i, /stat upload/i, /lineage/i] },
  { key: "practice", name: "Practice OS", glyph: "🥎", kw: [/practice/i, /drill/i, /bullpen/i] },
  { key: "lifting", name: "Lifting OS", glyph: "🏋", kw: [/lift/i, /strength/i, /weight room/i, /\b1rm\b/i] },
  { key: "coachhelm", name: "CoachHelm Engine", glyph: "🧠", kw: [/coachhelm/i, /insight engine/i, /\bnlg\b/i, /prediction/i, /generator/i] },
  { key: "decisions", name: "Decision Ledger", glyph: "⚖", kw: [/decision/i, /ledger/i, /signal *-> *action/i, /action *-> *decision/i] },
  { key: "settings", name: "Settings & Program-Type OS", glyph: "⚙", kw: [/setting/i, /program.?type/i, /onboarding/i, /preferences/i] },
];

/* Stage detection from an event (title prefix wins, else event.type). */
function stageOf(e) {
  const t = String(e.title || "").toLowerCase();
  const ty = String(e.type || "").toLowerCase();
  const head = t.split(":")[0] || "";
  if (/fail|unbuilt|missing|absent/.test(t)) return "fail";
  if (head.includes("audit") || /depth audit/.test(t)) return t.includes("complete") ? "built" : "audit";
  if (head.includes("plan")) return "plan";
  if (head.includes("implement")) return "implement";
  if (head.startsWith("built") || head.startsWith("ship")) return "built";
  if (head.includes("verify")) return "verify";
  if (head.includes("fix")) return "fix";
  if (ty === "packet_completed" || ty === "packet_finished") return "built";
  if (ty === "packet_started") return "start";
  if (ty === "packet_progress") return "progress";
  return "progress";
}

/* The subsystem text = the part of the title after the stage prefix (or whole). */
function subsystemText(e) {
  const t = String(e.title || "");
  const i = t.indexOf(":");
  return (i >= 0 ? t.slice(i + 1) : t).trim();
}

function crewForEvent(e) {
  const sub = subsystemText(e);
  const full = String(e.title || "");
  for (const c of CREWS) {
    if (c.kw.some((rx) => rx.test(sub) || rx.test(full))) return c.key;
  }
  return null;
}

/* Per-stage presentation: [emoji, "doing now" phrase, console chip label, chip color]. */
const STAGE_META = {
  audit:     ["🔍", "auditing depth vs spec", "AUDIT", "#67e8f9"],
  plan:      ["📐", "architecting blueprint", "PLAN", "#c4b5fd"],
  implement: ["🔨", "building the subsystem", "BUILD", "#93c5fd"],
  start:     ["🚧", "breaking ground", "START", "#93c5fd"],
  progress:  ["⚙️", "in progress", "WORK", "#93c5fd"],
  verify:    ["🔎", "verifying against spec", "VERIFY", "#5eead4"],
  fix:       ["🩹", "patching gaps", "FIX", "#fcd34d"],
  built:     ["✅", "shipped — files written", "BUILT", "#86efac"],
  fail:      ["⚠️", "gap found — rebuild queued", "FAIL", "#fca5a5"],
};
const stageMeta = (st) => STAGE_META[st] || ["•", "working", "·", "#bfe3c8"];

const ACTIVE_STAGES = new Set(["audit", "plan", "implement", "start", "progress", "verify", "fix"]);
const WORK_WINDOW_MIN = 7; // an active stage older than this = stalled, not "working"

/* Build the crew model from the live event list. */
function buildCrews(events) {
  const now = Date.now();
  const byKey = new Map();
  for (const c of CREWS) byKey.set(c.key, { ...c, events: [], builtAt: 0, failAt: 0, last: null });

  for (const e of events || []) {
    if (!e || e.packet === "task-0") continue;
    if (String(e.type || "") === "command_center_server_started") continue;
    const key = crewForEvent(e);
    if (!key) continue;
    const crew = byKey.get(key);
    if (!crew) continue;
    const st = stageOf(e);
    const ts = new Date(e.ts).getTime() || 0;
    crew.events.push({ e, st, ts });
    if (st === "built") crew.builtAt = Math.max(crew.builtAt, ts);
    if (st === "fail") crew.failAt = Math.max(crew.failAt, ts);
    if (!crew.last || ts >= crew.last.ts) crew.last = { e, st, ts };
  }

  const crews = [];
  CREWS.forEach((c, i) => {
    const crew = byKey.get(c.key);
    crew.codename = NAMES[i % NAMES.length];
    const last = crew.last;
    const ageMin = last ? (now - last.ts) / 60000 : Infinity;

    let status, pct, badge, dot;
    if (last && ACTIVE_STAGES.has(last.st) && ageMin < WORK_WINDOW_MIN) {
      status = "working";
      pct = last.e.pct && last.e.pct > 0 && last.e.pct < 100 ? last.e.pct : 55;
      badge = "working"; dot = "#22c55e";
    } else if (crew.failAt && crew.failAt >= crew.builtAt) {
      status = "blocked"; pct = 60; badge = "needs rebuild"; dot = "#d97706";
    } else if (crew.builtAt) {
      status = "done"; pct = 100; badge = "built ✓"; dot = "#15803d";
    } else if (crew.events.length) {
      status = "idle"; pct = 35; badge = "stalled"; dot = "#d97706";
    } else {
      status = "queued"; pct = 0; badge = "queued"; dot = "#9ca3af";
    }

    const [emoji, phrase] = last ? stageMeta(last.st) : ["⏳", "waiting for the pipeline"];
    const nowLine = status === "queued" ? "⏳ queued" : `${emoji} ${phrase}`;

    // rich live output: this crew's recent telemetry, oldest→newest (tailed), with
    // stage chip + the full milestone text and any detail line.
    const recent = crew.events
      .slice().sort((a, b) => a.ts - b.ts).slice(-16)
      .map(({ e, st, ts }) => {
        const [, , chip, color] = stageMeta(st);
        const head = subsystemText(e) || String(e.title || "");
        const detail = String(e.detail || "").trim();
        const text = detail && detail.toLowerCase() !== head.toLowerCase()
          ? `${head} — ${detail}` : head;
        return { ts, chip, color, text: text.slice(0, 220) };
      });

    crews.push({
      key: c.key, name: c.name, glyph: c.glyph, codename: crew.codename,
      status, pct: Math.round(pct), badge, dot, nowLine, recent,
      touches: crew.events.length,
      lastAt: last ? last.ts : 0,
    });
  });
  return crews;
}

/* Global live feed across ALL crews — tails the whole build event stream so the
   floor always shows movement, even during phases (verify/fix) whose events are
   cross-cutting and don't belong to a single subsystem crew. */
const CODENAME_BY_KEY = (() => { const m = {}; CREWS.forEach((c, i) => { m[c.key] = NAMES[i % NAMES.length]; }); return m; })();
function buildFeed(events) {
  const out = [];
  for (const e of events || []) {
    if (!e || e.packet === "task-0") continue;
    if (String(e.type || "") === "command_center_server_started") continue;
    const st = stageOf(e);
    const [, , chip, color] = stageMeta(st);
    const key = crewForEvent(e);
    const head = subsystemText(e) || String(e.title || "");
    const detail = String(e.detail || "").trim();
    const text = detail && detail.toLowerCase() !== head.toLowerCase() ? `${head} — ${detail}` : head;
    out.push({ ts: new Date(e.ts).getTime() || 0, chip, color, crew: key ? CODENAME_BY_KEY[key] : "", text: text.slice(0, 240) });
  }
  return out.slice(-46);
}

/* ----------------------------------------------------------------- styles */
function ensureStyles() {
  const existing = document.getElementById("afloor-style");
  const css = `
  .afloor{--af-ink:#1f2b22;--af-mut:#7a8474;--af-grn:#16a34a;--af-grnd:#15803d;
    --af-line:#e7e0cd;--af-card:#fffdf6;--af-cream:#fffefa;
    color:var(--af-ink);font:14px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;
    background:
      radial-gradient(1000px 480px at 82% -14%,#e6f4e8 0%,transparent 56%),
      linear-gradient(180deg,#fffefa,#fbf6ea);
    border:1px solid var(--af-line);border-radius:18px;padding:24px 24px 28px;min-height:100%;}
  .afloor .af-h1{font-size:23px;font-weight:800;letter-spacing:-.3px;margin:0 0 3px;display:flex;align-items:center;gap:10px;color:#16432b}
  .afloor .af-sub{color:var(--af-mut);font-size:13px;margin-bottom:16px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  .afloor .af-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--af-grn);box-shadow:0 0 8px #16a34a99;animation:afp 1.5s infinite}
  @keyframes afp{0%,100%{opacity:1}50%{opacity:.22}}
  .afloor .af-bar{height:14px;border-radius:9px;background:#efe7d4;overflow:hidden;margin:6px 0 4px;border:1px solid #e2d9c2;box-shadow:inset 0 1px 2px #5b4a1f12}
  .afloor .af-fill{height:100%;background:linear-gradient(90deg,#15803d,#22c55e);width:0%;transition:width .7s cubic-bezier(.32,.72,0,1);box-shadow:0 0 10px #22c55e44}
  .afloor .af-stats{display:flex;gap:26px;flex-wrap:wrap;color:var(--af-mut);font-size:13px;margin:13px 0 20px}
  .afloor .af-stats b{color:#16432b;font-size:21px;font-weight:800;margin-right:5px}
  .afloor .af-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
  .afloor .af-card{background:var(--af-card);border:1px solid var(--af-line);border-radius:17px;padding:16px 18px;
    box-shadow:0 1px 2px #5b4a1f0d,0 8px 20px #5b4a1f08;transition:border-color .4s,box-shadow .4s,opacity .4s,background .4s;position:relative;overflow:hidden}
  .afloor .af-card.working{border-color:#22c55e66;background:linear-gradient(180deg,#f6fdf5,#fffdf6);box-shadow:0 0 0 1px #22c55e26,0 12px 28px #16a34a16}
  .afloor .af-card.done{background:linear-gradient(180deg,#fcfdf7,#fffdf6)}
  .afloor .af-card.blocked{border-color:#f59e0b55;background:linear-gradient(180deg,#fffaf1,#fffdf6)}
  .afloor .af-card.queued{opacity:.66}
  .afloor .af-hd{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .afloor .af-dot{width:12px;height:12px;border-radius:50%;flex:none;box-shadow:0 0 8px currentColor;transition:background .4s}
  .afloor .af-card.working .af-dot{animation:afp 1.5s infinite}
  .afloor .af-name{font-size:18px;font-weight:800;color:#16432b;letter-spacing:-.2px}
  .afloor .af-glyph{font-size:16px;opacity:.82}
  .afloor .af-badge{margin-left:auto;font-size:11px;color:var(--af-mut);background:#f5f0e1;padding:3px 11px;border-radius:20px;border:1px solid var(--af-line);white-space:nowrap;font-weight:600}
  .afloor .af-card.working .af-badge{color:#15803d;background:#e8f8eb;border-color:#bfe6c7}
  .afloor .af-card.blocked .af-badge{color:#b45309;background:#fdf3e3;border-color:#f3d9aa}
  .afloor .af-feat{color:#2f5a40;font-size:13px;font-weight:700;margin-bottom:10px}
  .afloor .af-cbar-row{display:flex;align-items:center;gap:10px;margin-bottom:11px}
  .afloor .af-cbar{flex:1;height:7px;border-radius:6px;background:#efe7d4;overflow:hidden;border:1px solid #e2d9c2}
  .afloor .af-cfill{height:100%;background:linear-gradient(90deg,#15803d,#22c55e);width:0%;transition:width .7s cubic-bezier(.32,.72,0,1)}
  .afloor .af-card.blocked .af-cfill{background:linear-gradient(90deg,#b45309,#f59e0b)}
  .afloor .af-pct{font-size:12.5px;font-weight:800;color:#15803d;min-width:40px;text-align:right;font-variant-numeric:tabular-nums}
  .afloor .af-card.blocked .af-pct{color:#b45309}
  .afloor .af-card.queued .af-pct{color:#9ca3af}
  .afloor .af-now{font-size:13px;color:#1c3a2a;font-weight:600;background:#f5f1e4;border:1px solid var(--af-line);border-radius:9px;padding:7px 11px;margin-bottom:10px}
  /* the live OUTPUT WINDOW — a real console tailing this crew's telemetry */
  .afloor .af-out{background:#0d160f;border:1px solid #1d3326;border-radius:11px;padding:0;
    max-height:188px;overflow:hidden;box-shadow:inset 0 1px 0 #ffffff08,inset 0 0 24px #0006}
  .afloor .af-out-hd{display:flex;align-items:center;gap:7px;padding:7px 11px 5px;border-bottom:1px solid #1b2f23;
    font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6f9c7e;background:#0a120c}
  .afloor .af-out-hd .af-tl{display:flex;gap:5px;margin-right:2px}
  .afloor .af-out-hd .af-tl i{width:8px;height:8px;border-radius:50%;display:inline-block}
  .afloor .af-out-body{padding:8px 11px 10px;max-height:152px;overflow-y:auto;scroll-behavior:smooth;
    font:11.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe9d6}
  .afloor .af-out-body::-webkit-scrollbar{width:7px} .afloor .af-out-body::-webkit-scrollbar-thumb{background:#2e4a38;border-radius:6px}
  .afloor .af-line{display:flex;gap:8px;align-items:baseline;padding:2px 0;border-bottom:1px dotted #15271b}
  .afloor .af-line:last-child{border-bottom:0}
  .afloor .af-line .af-t{color:#56806492;color:#5a8068;flex:none;font-size:10.5px}
  .afloor .af-line .af-chip{flex:none;font-size:9.5px;font-weight:800;letter-spacing:.06em;padding:1px 6px;border-radius:5px;
    background:#13241a;border:1px solid #24412f;min-width:50px;text-align:center}
  .afloor .af-line .af-x{color:#d4ecda;white-space:normal;word-break:break-word;flex:1}
  .afloor .af-out-body.empty{color:#5e8a6c;font-style:italic;padding:14px 11px}
  /* master live feed console (full width, taller) */
  .afloor .af-feed{margin-bottom:20px;max-height:300px}
  .afloor .af-feed .af-out-hd{font-size:10.5px;color:#86c79a}
  .afloor .af-feed-body{padding:9px 13px 11px;max-height:248px;overflow-y:auto;scroll-behavior:smooth;
    font:11.5px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe9d6}
  .afloor .af-feed-body::-webkit-scrollbar{width:8px} .afloor .af-feed-body::-webkit-scrollbar-thumb{background:#2e4a38;border-radius:6px}
  .afloor .af-crewtag{flex:none;font-size:9.5px;font-weight:800;color:#7fd79a;background:#10271a;border:1px solid #225c39;border-radius:5px;padding:1px 7px}
  .afloor .af-empty{color:var(--af-mut);font-size:13px;padding:30px 4px}
  @media (max-width:980px){ .afloor .af-grid{grid-template-columns:1fr} }
  `;
  if (existing) { existing.textContent = css; return; } // refresh styles in place on hot-reload
  const tag = document.createElement("style");
  tag.id = "afloor-style";
  tag.textContent = css;
  document.head.appendChild(tag);
}

/* ----------------------------------------------------------------- render */
/* Module-level cache for in-place updates (returning the SAME node short-circuits
   app.js's remount, preserving scroll + enabling CSS transitions). */
let elRoot = null;
const cardEls = new Map(); // key -> { card, dot, badge, now, cfill, pct, body }

function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }

function outLines(h, fmt, recent) {
  if (!recent.length) return [h("div", { class: "af-line" }, h("span", { class: "af-x" }, "— no output yet · crew is queued —"))];
  return recent.map((r) => h("div", { class: "af-line" },
    h("span", { class: "af-t" }, fmt.time(new Date(r.ts).toISOString())),
    h("span", { class: "af-chip", style: { color: r.color } }, r.chip),
    h("span", { class: "af-x", title: r.text }, r.text)));
}
function fillBody(body, h, fmt, recent) {
  body.classList.toggle("empty", !recent.length);
  body.replaceChildren(...outLines(h, fmt, recent));
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; }); // tail to newest
}
function feedLines(h, fmt, feed) {
  if (!feed.length) return [h("div", { class: "af-line" }, h("span", { class: "af-x" }, "— waiting for build telemetry —"))];
  return feed.map((r) => h("div", { class: "af-line" },
    h("span", { class: "af-t" }, fmt.time(new Date(r.ts).toISOString())),
    h("span", { class: "af-chip", style: { color: r.color } }, r.chip),
    r.crew ? h("span", { class: "af-crewtag" }, r.crew) : null,
    h("span", { class: "af-x", title: r.text }, r.text)));
}
function fillFeed(body, h, fmt, feed) {
  body.replaceChildren(...feedLines(h, fmt, feed));
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
}

/* console "traffic light" dots header */
function outHeader(h, name) {
  return h("div", { class: "af-out-hd" },
    h("span", { class: "af-tl" },
      h("i", { style: { background: "#f87171" } }),
      h("i", { style: { background: "#fbbf24" } }),
      h("i", { style: { background: "#34d399" } })),
    h("span", {}, `${name} · live output`));
}

export function render(ctx) {
  const { h, fmt, events, state } = ctx;
  ensureStyles();
  const crews = buildCrews(events);
  const feed = buildFeed(events);

  // monotonic forward-momentum signals (only ever climb) — counters the optical
  // "progress went down" when verify honestly demotes a superficially-built crew.
  let fixesApplied = 0, gapsFound = 0;
  for (const e of events || []) {
    if (!e || e.packet === "task-0") continue;
    const t = String(e.title || "").toLowerCase();
    if (t.startsWith("fixed")) fixesApplied++;
    else if (/fail|unbuilt/.test(t)) gapsFound++;
  }

  const total = crews.length;
  const doneN = crews.filter((c) => c.status === "done").length;
  const workingN = crews.filter((c) => c.status === "working").length;
  const blockedN = crews.filter((c) => c.status === "blocked").length;
  const onFloor = crews.filter((c) => c.touches > 0).length;
  const overall = Math.round((100 * (doneN + 0.5 * workingN + 0.25 * blockedN)) / Math.max(1, total));
  const loc = (state && state.loc && state.loc.total) || 0;
  const locAdded = (state && state.loc && state.loc.added) || 0;
  const lastAt = crews.reduce((m, c) => Math.max(m, c.lastAt), 0);
  const stamp = lastAt ? fmt.time(new Date(lastAt).toISOString()) : "—";

  // ---- in-place update path (root already mounted)
  if (elRoot && document.contains(elRoot)) {
    const fill = elRoot.querySelector(".af-fill");
    if (fill) fill.style.width = `${overall}%`;
    setText(elRoot.querySelector('[data-st="overall"]'), `${overall}%`);
    setText(elRoot.querySelector('[data-st="built"]'), `${doneN}/${total}`);
    setText(elRoot.querySelector('[data-st="working"]'), String(workingN));
    setText(elRoot.querySelector('[data-st="done"]'), String(doneN));
    setText(elRoot.querySelector('[data-st="floor"]'), String(onFloor));
    elRoot.querySelectorAll('[data-st="loc"]').forEach((el) => setText(el, fmt.num(loc)));
    setText(elRoot.querySelector('[data-st="locadd"]'), `+${fmt.num(locAdded)}`);
    setText(elRoot.querySelector('[data-st="stamp"]'), stamp);
    setText(elRoot.querySelector('[data-st="fixes"]'), fmt.num(fixesApplied));
    setText(elRoot.querySelector('[data-st="gaps"]'), fmt.num(gapsFound));
    const fb = elRoot.querySelector(".af-feed-body");
    if (fb) fillFeed(fb, h, fmt, feed);
    for (const c of crews) {
      const refs = cardEls.get(c.key);
      if (!refs) continue;
      refs.card.className = `af-card ${c.status}`;
      refs.dot.style.background = c.dot;
      refs.dot.style.color = c.dot;
      setText(refs.badge, c.badge);
      setText(refs.now, c.nowLine);
      refs.cfill.style.width = `${c.pct}%`;
      setText(refs.pct, `${c.pct}%`);
      fillBody(refs.body, h, fmt, c.recent);
    }
    return elRoot;
  }

  // ---- fresh build
  cardEls.clear();
  const cards = crews.map((c) => {
    const dot = h("span", { class: "af-dot", style: { background: c.dot, color: c.dot } });
    const badge = h("span", { class: "af-badge" }, c.badge);
    const cfill = h("i", { class: "af-cfill", style: { width: `${c.pct}%` } });
    const pct = h("span", { class: "af-pct" }, `${c.pct}%`);
    const now = h("div", { class: "af-now" }, c.nowLine);
    const body = h("div", { class: `af-out-body ${c.recent.length ? "" : "empty"}` }, outLines(h, fmt, c.recent));
    const out = h("div", { class: "af-out" }, outHeader(h, c.codename), body);
    const card = h("div", { class: `af-card ${c.status}` },
      h("div", { class: "af-hd" },
        dot,
        h("span", { class: "af-name" }, c.codename),
        h("span", { class: "af-glyph" }, c.glyph),
        badge),
      h("div", { class: "af-feat" }, c.name),
      h("div", { class: "af-cbar-row" }, h("div", { class: "af-cbar" }, cfill), pct),
      now,
      out);
    cardEls.set(c.key, { card, dot, badge, now, cfill, pct, body });
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    return card;
  });

  const stat = (label, key, val) => h("div", {}, h("b", { dataset: { st: key } }, val), label);

  // master live console — tails the whole build stream so lines always move
  const feedBody = h("div", { class: "af-feed-body" }, feedLines(h, fmt, feed));
  const feedConsole = h("div", { class: "af-out af-feed" },
    h("div", { class: "af-out-hd" },
      h("span", { class: "af-tl" },
        h("i", { style: { background: "#f87171" } }),
        h("i", { style: { background: "#fbbf24" } }),
        h("i", { style: { background: "#34d399" } })),
      h("span", {}, "📡 Live build feed · all crews · streaming")),
    feedBody);
  requestAnimationFrame(() => { feedBody.scrollTop = feedBody.scrollHeight; });

  elRoot = h("div", { class: "afloor" },
    h("div", { class: "af-h1" }, "⛳ BaseballHelm — Live Agent Floor"),
    h("div", { class: "af-sub" },
      h("span", { class: "af-live" }),
      "live · auto-updates from telemetry · ",
      h("span", { "data-st": "loc" }, fmt.num(loc)), " lines built · last event ",
      h("span", { "data-st": "stamp" }, stamp)),
    h("div", { class: "af-bar" }, h("div", { class: "af-fill", style: { width: `${overall}%` } })),
    h("div", { class: "af-stats" },
      stat(" lines of code", "loc", fmt.num(loc)),
      stat(" new this build ▲", "locadd", `+${fmt.num(locAdded)}`),
      stat(" build coverage", "overall", `${overall}%`),
      stat(" fixes applied ▲", "fixes", fmt.num(fixesApplied)),
      stat(" gaps found", "gaps", fmt.num(gapsFound)),
      stat(" subsystems built", "built", `${doneN}/${total}`),
      stat(" crews working", "working", String(workingN)),
      stat(" on the floor", "floor", String(onFloor))),
    feedConsole,
    crews.length
      ? h("div", { class: "af-grid" }, cards)
      : h("div", { class: "af-empty" }, "No build telemetry yet — crews light up here as agents break ground."));
  return elRoot;
}
