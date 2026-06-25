/* ===========================================================================
   BaseballHelm Ultracode Command Center — app core (spine)
   - Loads aggregate state + events + repo + replay from the local server
   - Live updates via SSE (/events) with a polling fallback
   - Renders persistent chrome (mission bar, agent rail, mode nav, event ribbon)
   - Owns the shared h / ui / fmt helper library and the `ctx` contract
   - Each mode is an ES module in ./modes/<id>.js exporting `render(ctx)`
   =========================================================================== */

/* ----------------------------------------------------------------- helpers: h */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* ----------------------------------------------------------------- formatters */
const pad = (n) => String(n).padStart(2, "0");
export const fmt = {
  time(iso) { if (!iso) return "--:--:--"; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; },
  ago(iso) {
    if (!iso) return "—";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${Math.floor(s)}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  },
  pct(n) { return `${Math.round(Number(n) || 0)}%`; },
  num(n) { return (Number(n) || 0).toLocaleString(); },
  date(iso) { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); },
};

/* --------------------------------------------------------- motion helpers */
const REDUCED_MOTION = (() => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
})();
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/* Animate the numeric portions inside a value string ("12,480 ln", "63% · conf 41%")
   counting up from the element's last value to the new one. Honest: only the digits
   actually present in the real telemetry are animated; surrounding text is preserved.
   Reduced-motion (or first paint) -> set instantly, no animation. */
const countUpState = new WeakMap(); // el -> { nums:[number], raf:id }
function setMetricValue(el, text) {
  const nums = (String(text).match(/-?\d[\d,]*\.?\d*/g) || []).map((m) => Number(m.replace(/,/g, "")));
  const prev = countUpState.get(el);
  // cancel any in-flight animation on this element
  if (prev && prev.raf) cancelAnimationFrame(prev.raf);
  // no numbers, reduced motion, first paint, or a structural change -> set instantly
  if (REDUCED_MOTION || !nums.length || !prev || prev.nums.length !== nums.length) {
    el.textContent = text;
    countUpState.set(el, { nums, raf: 0 });
    return;
  }
  const from = prev.nums;
  const same = nums.every((n, i) => n === from[i]);
  if (same) { el.textContent = text; countUpState.set(el, { nums, raf: 0 }); return; }
  // template: replace each number with a placeholder we can refill each frame
  const parts = String(text).split(/(-?\d[\d,]*\.?\d*)/);
  const slots = []; // indices in `parts` that are numbers + whether decimal/grouped
  let ni = 0;
  for (let i = 0; i < parts.length; i++) {
    if (/^-?\d[\d,]*\.?\d*$/.test(parts[i])) {
      const decimals = (parts[i].split(".")[1] || "").length;
      const grouped = parts[i].includes(",");
      slots.push({ i, decimals, grouped, idx: ni++ });
    }
  }
  const t0 = performance.now();
  const DUR = 520;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / DUR);
    const e = easeOutCubic(k);
    for (const s of slots) {
      const v = from[s.idx] + (nums[s.idx] - from[s.idx]) * e;
      const r = s.decimals ? v.toFixed(s.decimals) : String(Math.round(v));
      parts[s.i] = s.grouped ? Number(r).toLocaleString() : r;
    }
    el.textContent = parts.join("");
    if (k < 1) { const id = requestAnimationFrame(tick); countUpState.set(el, { nums, raf: id }); }
    else { el.textContent = text; countUpState.set(el, { nums, raf: 0 }); }
  };
  countUpState.set(el, { nums, raf: requestAnimationFrame(tick) });
}

/* --------------------------------------------------------- shared UI component lib */
const toneClass = (t) => (t ? `tone-${t}` : "");
export const ui = {
  modeHead({ glyph, title, sub, actions } = {}) {
    return h("div", { class: "mode-head" },
      h("div", { class: "title" },
        glyph && h("div", { class: "glyph" }, glyph),
        h("div", {}, h("h1", {}, title), sub && h("div", { class: "sub" }, sub))),
      actions && h("div", { class: "actions" }, actions));
  },
  panel({ title, glyph, sub, actions, body, lift, span } = {}) {
    const head = (title || actions) && h("div", { class: "panel-head" },
      h("div", { class: "h" }, glyph && h("span", { class: "glyph" }, glyph), title && h("span", {}, title),
        sub && h("span", { class: "panel-sub", style: { marginLeft: "6px" } }, sub)),
      actions && h("div", { class: "row" }, actions));
    const p = h("div", { class: `panel ${lift ? "lift" : ""}` }, head, body);
    if (span) p.style.gridColumn = `span ${span}`;
    return p;
  },
  stat({ label, value, sub, tone } = {}) {
    return h("div", { class: `stat ${toneClass(tone)}` },
      h("div", { class: "label" }, label),
      h("div", { class: "value" }, value),
      sub && h("div", { class: "sub" }, sub));
  },
  badge(text, tone) { return h("span", { class: `badge ${toneClass(tone)}` }, text); },
  pill(text, { dot, tone } = {}) { return h("span", { class: `pill ${toneClass(tone)}` }, dot && h("span", { class: "dot" }), text); },
  dot(state) { return h("span", { class: `dot-state ${state || "idle"}` }); },
  progress(percent, { tone, label, right } = {}) {
    const wrap = h("div", { class: "progress-wrap" });
    if (label || right != null) wrap.append(h("div", { class: "lab" }, h("span", {}, label || ""), h("b", {}, right != null ? right : fmt.pct(percent))));
    wrap.append(h("div", { class: `progress ${tone ? "tone-" + tone : ""}` }, h("i", { style: { width: `${Math.max(0, Math.min(100, percent))}%` } })));
    return wrap;
  },
  empty({ glyph = "▦", title = "Nothing yet", hint = "" } = {}) {
    return h("div", { class: "empty" }, h("div", { class: "glyph" }, glyph), h("div", { class: "t" }, title), hint && h("div", { class: "h" }, hint));
  },
  loading(text = "Loading…") { return h("div", { class: "loading" }, h("div", { class: "spinner" }), h("span", {}, text)); },
  error(title, detail) { return h("div", { class: "errbox" }, h("b", {}, title), detail && h("span", { class: "mono" }, detail)); },
  kv(k, v) { return h("div", { class: "kv" }, h("span", { class: "k" }, k), h("span", { class: "v" }, v)); },
  section(title, right) { return h("div", { class: "row between center", style: { marginBottom: "8px" } }, h("div", { class: "muted", style: { fontSize: "10px", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: "700" } }, title), right); },
  grid(cols, children) { return h("div", { class: `grid ${cols}` }, children); },
  rows(children) { return h("div", { class: "rows" }, children); },
  listRow(children) { return h("div", { class: "list-row" }, children); },
  district({ name, status, active, count, tone, meta, onClick } = {}) {
    const lights = h("div", { class: "lights" }, Array.from({ length: 5 }, () => h("i")));
    return h("div", { class: `district ${active ? "is-active" : ""} ${tone ? "tone-" + tone : ""}`, onClick: onClick || null, role: onClick ? "button" : null, tabindex: onClick ? "0" : null },
      h("div", { class: "roof" }),
      count != null && h("span", { class: "count-chip" }, count),
      h("div", { class: "nm" }, name),
      meta && h("div", { class: "meta" }, meta),
      h("div", { class: "meta" }, status || ""),
      lights);
  },
  crate({ title, meta, state } = {}) {
    return h("div", { class: `crate ${state === "done" ? "is-done" : ""} ${state === "blocked" ? "is-blocked" : ""}` },
      h("div", { class: "t" }, title),
      meta && h("div", { class: "m" }, meta));
  },
  eventRow(e) {
    const sev = e.severity && e.severity !== "info" ? `sev-${e.severity}` : "";
    return h("div", { class: "evt" },
      h("span", { class: "ts" }, fmt.time(e.ts)),
      h("span", { class: `ty ${sev}` }, (e.type || "event").replace(/_/g, " ")),
      h("span", { class: "msg truncate" }, h("b", {}, e.title || ""), e.detail ? " — " + e.detail : ""),
      e.agent && h("span", { class: "agent" }, e.agent));
  },
  riskCard(r) {
    return h("div", { class: "panel", style: { borderColor: "var(--city-line-strong)" } },
      h("div", { class: "row between center mb3" }, h("b", {}, r.title), ui.badge(r.level || "info", r.level === "critical" ? "critical" : r.level === "high" ? "risk" : r.level === "medium" ? "warn" : "info")),
      r.description && h("div", { class: "muted", style: { fontSize: "12.5px" } }, r.description),
      r.mitigation && h("div", { class: "mt2", style: { fontSize: "12px" } }, h("span", { class: "muted" }, "Mitigation: "), r.mitigation),
      r.affected_paths && r.affected_paths.length ? h("div", { class: "mt2 mono", style: { fontSize: "11px", color: "var(--city-ink-muted)" } }, r.affected_paths.join(", ")) : null,
      h("div", { class: "mt2 row between", style: { fontSize: "11px" } }, ui.pill(r.status || "open"), h("span", { class: "muted mono" }, fmt.ago(r.timestamp))));
  },
  heartbeat(active) {
    const pts = active ? "0,8 6,8 9,2 12,14 16,5 20,10 26,10 30,8 36,8 40,3 44,12 48,8 54,8" : "0,8 54,8";
    return h("svg", { class: "heart", viewBox: "0 0 54 16" }, h("polyline", { points: pts, fill: "none", stroke: active ? "var(--city-turf)" : "var(--city-line-strong)", "stroke-width": "1.6" }));
  },
};

/* ----------------------------------------------------------------- mode registry */
export const MODES = [
  { group: "Overview", items: [
    { id: "mission-control", label: "Mission Control", icon: "◎" },
    { id: "agent-floor", label: "Agent Floor", icon: "⛳" },
    { id: "agent-city", label: "Agent City", icon: "▦" },
    { id: "factory-floor", label: "Factory Floor", icon: "⚙" },
  ]},
  { group: "Agents", items: [
    { id: "agent-tower", label: "Agent Tower", icon: "🏢" },
    { id: "agent-cockpit", label: "Agent Cockpit", icon: "🛰" },
  ]},
  { group: "Build", items: [
    { id: "codebase-city", label: "Codebase City", icon: "🗺" },
    { id: "data-district", label: "Data District", icon: "🗄" },
    { id: "integration-harbor", label: "Integration Harbor", icon: "⚓" },
  ]},
  { group: "Safety & QA", items: [
    { id: "control-tower", label: "Control Tower", icon: "📡" },
    { id: "qa-lab", label: "QA Lab", icon: "🧪" },
  ]},
  { group: "Memory", items: [
    { id: "context-reactor", label: "Context Reactor", icon: "🜂" },
    { id: "decision-ledger", label: "Decision Ledger", icon: "⚖" },
    { id: "memory-library", label: "Memory Library", icon: "📚" },
  ]},
  { group: "History", items: [
    { id: "flight-recorder", label: "Flight Recorder", icon: "⏱" },
    { id: "handoff-ledger", label: "Handoff Ledger", icon: "🤝" },
  ]},
];
const ALL_MODES = MODES.flatMap((g) => g.items);
const DEFAULT_MODE = "mission-control";

/* small per-mode nav ticks */
const TICKS = {
  "agent-tower": (s) => `${(s.agents || []).filter((a) => a.status === "active").length}/${(s.agents || []).length}`,
  "factory-floor": (s) => `${(s.packets || []).filter((p) => p.status === "active").length}▶`,
  "control-tower": (s) => `${(s.risks?.cards || []).filter((r) => r.status !== "resolved").length}⚑`,
  "qa-lab": (s) => `${(s.qa?.checks || []).filter((c) => c.status === "passed").length}✓`,
  "decision-ledger": (s) => `${(s.decisions || []).length}`,
};

/* ----------------------------------------------------------------- progress math */
export function weightedProgress(packets = []) {
  const tot = packets.reduce((a, p) => a + (p.weight || 0), 0) || 1;
  const got = packets.reduce((a, p) => a + (p.weight || 0) * (p.completion_percent || 0) / 100, 0);
  return Math.round((got / tot) * 100);
}
export function weightedConfidence(packets = []) {
  const tot = packets.reduce((a, p) => a + (p.weight || 0), 0) || 1;
  const got = packets.reduce((a, p) => a + (p.weight || 0) * (p.confidence_percent || 0) / 100, 0);
  return Math.round((got / tot) * 100);
}

/* ----------------------------------------------------------------- app state */
const store = { state: null, events: [], repo: null, replay: null, artifacts: [], mode: DEFAULT_MODE, conn: "boot" };
// Cache-bust: a fresh stamp per page load so mode/engine modules are NEVER served
// stale by the browser module cache. Shared via window so agent-city.js reuses it.
const CC_VER = (window.__CC_VER = window.__CC_VER || Date.now());
const modCache = new Map();

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function loadAll() {
  const [state, events, repo, replay, artifacts] = await Promise.allSettled([
    getJSON("/api/state"), getJSON("/api/events?limit=400"), getJSON("/api/repo"), getJSON("/api/replay"), getJSON("/api/artifacts"),
  ]);
  if (state.status === "fulfilled") store.state = state.value;
  if (events.status === "fulfilled") store.events = normalizeEvents(events.value);
  if (repo.status === "fulfilled") store.repo = repo.value;
  if (replay.status === "fulfilled") store.replay = replay.value;
  if (artifacts.status === "fulfilled") store.artifacts = Array.isArray(artifacts.value) ? artifacts.value : (artifacts.value?.artifacts || []);
  return state.status === "fulfilled";
}
function normalizeEvents(v) {
  const arr = Array.isArray(v) ? v : (v?.events || []);
  return arr.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

/* ----------------------------------------------------------------- ctx contract */
function ctx() {
  return {
    state: store.state || {}, events: store.events, repo: store.repo || {}, replay: store.replay || {}, artifacts: store.artifacts,
    h, ui, fmt, MODES: ALL_MODES, weightedProgress, weightedConfidence,
    mode: store.mode,
    args: navArgs,
    go: navigate,
    log: postEvent,
    refresh: async () => { await loadAll(); renderAll(); },
  };
}

/* ----------------------------------------------------------------- rendering */
function renderMissionBar() {
  const bar = document.getElementById("mission-bar");
  const s = store.state || {};
  const packets = s.packets || [];
  const prog = weightedProgress(packets);
  const conf = weightedConfidence(packets);
  const activeAgents = (s.agents || []).filter((a) => a.status === "active").length;
  const qa = s.qa?.checks || [];
  const passed = qa.filter((c) => c.status === "passed").length, failed = qa.filter((c) => c.status === "failed").reduce((a, c) => a + (c.failed || 1), 0);
  const ranAny = qa.some((c) => c.status !== "not_run");
  const openRisks = (s.risks?.cards || []).filter((r) => r.status !== "resolved");
  const crit = openRisks.filter((r) => r.level === "critical").length;
  const gate = s.task0_gate?.verified ? "OPEN" : "IN PROGRESS";

  // metric spec (stable keys so we can update values in place + count up between ticks)
  const specs = [
    { key: "task0", k: "Task 0", v: gate, cls: s.task0_gate?.verified ? "is-ok" : "is-risk" },
    { key: "agents", k: "Agents", v: `${activeAgents} live` },
    { key: "tests", k: "Tests", v: ranAny ? `${passed}✓ ${failed}✕` : "none yet", cls: failed ? "is-risk" : ranAny ? "is-ok" : "" },
    { key: "risk", k: "Risk", v: crit ? `${crit} critical` : openRisks.length ? `${openRisks.length} open` : "clear", cls: crit ? "is-risk" : "" },
    { key: "code", k: "Code", v: `${fmt.num(s.loc?.total || 0)} ln`, cls: "is-ok" },
    { key: "branch", k: "Branch", v: s.branch || store.repo?.branch || "—" },
  ];

  // structure exists already -> update values in place (enables count-up + value flash)
  if (bar.dataset.built === "1") {
    const pf = bar.querySelector(".mb-progress i");
    if (pf) pf.style.width = `${Math.max(0, Math.min(100, prog))}%`;
    const lab = bar.querySelector(".mb-progress .lab b");
    if (lab) lab.textContent = `${prog}% · conf ${conf}%`;
    for (const spec of specs) {
      const cell = bar.querySelector(`.mb-metric[data-mk="${spec.key}"]`);
      if (!cell) continue;
      cell.className = `mb-metric ${spec.cls || ""}`.trim();
      const ve = cell.querySelector(".v");
      if (ve && ve.dataset.raw !== spec.v) {
        ve.dataset.raw = spec.v;
        setMetricValue(ve, spec.v);
        cell.classList.remove("flash"); void cell.offsetWidth; cell.classList.add("flash");
      }
    }
    const cb = bar.querySelector(".mb-conn");
    if (cb) cb.replaceWith(connBadge());
    return;
  }

  bar.replaceChildren(
    h("div", { class: "mb-brand" },
      h("svg", { class: "seam", viewBox: "0 0 32 32" }, h("circle", { cx: 16, cy: 16, r: 14, fill: "#fcf8ec", stroke: "#1f5b3d", "stroke-width": 2 }),
        h("path", { d: "M9 8c4 3 4 13 0 16M23 8c-4 3-4 13 0 16", fill: "none", stroke: "#b86a3d", "stroke-width": 1.6 })),
      h("div", {}, "BaseballHelm", h("small", {}, "Ultracode Command Center"))),
    h("div", { class: "mb-metrics" },
      h("div", { class: "mb-progress" }, ui.progress(prog, { label: `Build · ${s.phase || "Task 0"}`, right: `${prog}% · conf ${conf}%` })),
      ...specs.map((spec) => metric(spec.k, spec.v, spec.cls, spec.key))),
    h("div", { class: "mb-right" },
      connBadge(),
      h("button", { class: "kill-btn", title: "Open Control Tower kill/freeze controls", onClick: () => navigate("control-tower") }, "⛔ KILL / FREEZE")));
  bar.dataset.built = "1";
  // seed count-up baselines so the FIRST change animates from the real value, not zero
  for (const spec of specs) {
    const ve = bar.querySelector(`.mb-metric[data-mk="${spec.key}"] .v`);
    if (ve) { ve.dataset.raw = spec.v; countUpState.set(ve, { nums: (String(spec.v).match(/-?\d[\d,]*\.?\d*/g) || []).map((m) => Number(m.replace(/,/g, ""))), raf: 0 }); }
  }
}
function metric(k, v, cls = "", mk = "") { return h("div", { class: `mb-metric ${cls}`.trim(), dataset: mk ? { mk } : undefined }, h("span", { class: "k" }, k), h("span", { class: "v truncate" }, v)); }
function connBadge() {
  const live = store.conn === "live", down = store.conn === "down";
  return h("div", { class: `mb-conn ${live ? "live" : down ? "down" : ""}` }, h("span", { class: "dot" }), h("span", {}, live ? "live" : down ? "offline" : "connecting"));
}

function renderNav() {
  const nav = document.getElementById("mode-nav");
  const s = store.state || {};
  const frag = document.createDocumentFragment();
  for (const grp of MODES) {
    frag.append(h("div", { class: "nav-group" }, grp.group));
    for (const m of grp.items) {
      const tick = TICKS[m.id] ? safeTick(m.id, s) : "";
      frag.append(h("button", { class: `nav-item ${store.mode === m.id ? "active" : ""}`, onClick: () => navigate(m.id) },
        h("span", { class: "ico" }, m.icon), h("span", { class: "lbl" }, m.label), tick && h("span", { class: "tick" }, tick)));
    }
  }
  nav.replaceChildren(frag);
}
function safeTick(id, s) { try { return TICKS[id](s); } catch { return ""; } }

function renderAgentRail() {
  const rail = document.getElementById("agent-rail");
  const agents = (store.state?.agents || []);
  rail.replaceChildren(
    h("h4", {}, `Agent Lanes · ${agents.filter((a) => a.status === "active").length}/${agents.length} live`),
    ...agents.map((a) => h("div", { class: `lane ${a.status === "active" ? "is-active" : ""}`, title: (a.focus || []).join(" · "), onClick: () => navigate("agent-cockpit", { agent: a.id }) },
      h("span", { class: "hb" }), h("span", { class: "nm" }, a.name), h("span", { class: "st" }, a.status))));
}

function renderRibbon() {
  const foot = document.getElementById("event-ribbon");
  const recent = store.events.slice(-60).reverse();
  foot.replaceChildren(
    h("div", { class: "ribbon-head" },
      h("span", { class: "t" }, "Broadcast Center · live build feed"),
      ui.pill(`${store.events.length} events`, { dot: store.conn === "live" }),
      h("span", { class: "muted", style: { marginLeft: "auto", fontSize: "11px" } }, store.repo?.last_commit ? `HEAD ${store.repo.last_commit}` : "")),
    h("div", { class: "ribbon-feed", id: "ribbon-feed" }, recent.length ? recent.map(ui.eventRow) : ui.empty({ glyph: "📡", title: "No events yet", hint: "Build events stream here as agents work." })));
}

async function renderMode() {
  const root = document.getElementById("mode-root");
  const id = ALL_MODES.find((m) => m.id === store.mode) ? store.mode : DEFAULT_MODE;
  const switching = root.dataset.modeId !== id;
  // On a real switch, slide/fade the OLD content out first (GPU-safe transform+opacity),
  // then mount the new mode and fade it IN. Reduced-motion collapses this to an instant swap.
  if (switching) {
    root.classList.remove("mode-anim-in");
    if (!REDUCED_MOTION && root.firstChild) {
      root.classList.add("mode-anim-out");
      await new Promise((r) => setTimeout(r, 150)); // matches mode-out duration
      root.classList.remove("mode-anim-out");
    }
    root.replaceChildren(ui.loading("Loading mode…")); // only show loading on a real switch
  }
  try {
    let mod = modCache.get(id);
    if (!mod) { mod = await import(`./modes/${id}.js?v=${CC_VER}`); modCache.set(id, mod); }
    if (typeof mod.render !== "function") throw new Error(`modes/${id}.js has no export render(ctx)`);
    const node = await mod.render(ctx());
    root.dataset.modeId = id;
    // If the mode updated itself in place (returned its cached root), do NOT remount —
    // this is what keeps the live Pixi canvas from flickering on every data tick.
    // (Also: never re-animate an in-place update — that would re-trigger mode-in mid-stream.)
    if (root.firstChild === node) return;
    root.replaceChildren(node || ui.error(`Mode "${id}" returned nothing`, "render(ctx) must return a DOM node."));
    if (switching) {
      if (!REDUCED_MOTION) {
        root.classList.add("mode-anim-in");
        root.addEventListener("animationend", () => root.classList.remove("mode-anim-in"), { once: true });
      }
      root.focus({ preventScroll: true });
    }
  } catch (err) {
    root.classList.remove("mode-anim-out", "mode-anim-in");
    root.replaceChildren(
      ui.modeHead({ glyph: "⚠", title: ALL_MODES.find((m) => m.id === id)?.label || id, sub: "This mode failed to load." }),
      ui.error("Module error", String(err && err.stack || err)));
    console.error(`[command-center] mode ${id} failed`, err);
  }
}

function renderAll() { renderMissionBar(); renderNav(); renderAgentRail(); renderRibbon(); renderMode(); }
function renderChromeOnly() { renderMissionBar(); renderNav(); renderAgentRail(); renderRibbon(); }

/* ----------------------------------------------------------------- navigation */
let navArgs = {};
function navigate(modeId, args = {}) {
  if (!ALL_MODES.find((m) => m.id === modeId)) modeId = DEFAULT_MODE;
  store.mode = modeId; navArgs = args;
  if (location.hash.slice(1) !== modeId) history.replaceState(null, "", `#${modeId}`);
  renderNav(); renderMode();
}
window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== store.mode) navigate(id); });
export function getNavArgs() { return navArgs; }

/* ===========================================================================
   MILESTONE TOASTS — pop a premium cream/green toast when a NEW meaningful event
   lands on the live stream. 100% honest: derived ONLY from events the app already
   received, diffed by event id against the last one we toasted. Never invented.
   =========================================================================== */
const TOAST = {
  lastId: null,          // highest event id we've already evaluated
  seedDone: false,       // suppress the historical backlog on first paint
  live: new Map(),       // id -> { el, timer }
  MAX: 4, LIFE: 6500,
};
function toastNumOf(id) { const m = String(id || "").match(/(\d+)/); return m ? Number(m[1]) : -1; }

/* Classify an event into a milestone toast spec, or null if it's not noteworthy.
   Categories per the brief: packet shipped, tests passed/failed, new risk, compaction. */
function milestoneFor(e) {
  if (!e) return null;
  const type = String(e.type || "");
  const sev = String(e.severity || "");
  const done = e.detail || "";
  const mk = (glyph, tone, title, mode, args) => ({ glyph, tone, title, sub: e.title || done || "", mode, args, agent: e.agent });

  // packet shipped: explicit completion types, or a status -> done transition
  if (/^(packet_completed|packet_finished|command_center_verified)$/.test(type) ||
      (/^packet_/.test(type) && /\bdone\b/i.test(done))) {
    return mk("📦", "ok", type === "command_center_verified" ? "Command center verified" : "Packet shipped",
      e.packet ? "factory-floor" : "mission-control", null);
  }
  // tests / checks
  if (/^(test_passed|check_passed)$/.test(type)) return mk("✓", "ok", "Tests passed", "qa-lab", null);
  if (/^(test_failed|check_failed|build_failed)$/.test(type)) return mk("✕", "risk", "Tests failed", "qa-lab", null);
  // new / escalated risk
  if (/^(risk_added|risk_escalated|guard_tripped)$/.test(type) || sev === "critical" || sev === "high" || sev === "risk")
    return mk(sev === "critical" ? "⛔" : "⚑", sev === "critical" ? "risk" : "warn",
      sev === "critical" ? "Critical risk" : "New risk flagged", "control-tower", null);
  // context compaction
  if (/compact|compaction|context_reset|summariz/i.test(type))
    return mk("🜂", "info", "Context compacted", "context-reactor", null);
  return null;
}

function toastStackEl() {
  let el = document.getElementById("toast-stack");
  if (!el) { el = h("div", { class: "toast-stack", id: "toast-stack", "aria-live": "polite" }); document.body.append(el); }
  return el;
}
function dismissToast(id) {
  const t = TOAST.live.get(id); if (!t) return;
  TOAST.live.delete(id);
  clearTimeout(t.timer);
  t.el.classList.add("leaving");
  t.el.addEventListener("animationend", () => t.el.remove(), { once: true });
  setTimeout(() => t.el.remove(), 400); // reduced-motion fallback
}
function showToast(spec, id) {
  const stack = toastStackEl();
  // cap the stack — drop the oldest
  while (TOAST.live.size >= TOAST.MAX) { const first = TOAST.live.keys().next().value; dismissToast(first); }
  const el = h("div", { class: `toast tone-${spec.tone}`, role: "status", tabindex: "0",
      style: { "--toast-life": `${TOAST.LIFE}ms` },
      title: "Click to open",
      onClick: () => { dismissToast(id); if (spec.mode) navigate(spec.mode, spec.args || {}); },
      onKeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); dismissToast(id); if (spec.mode) navigate(spec.mode, spec.args || {}); } } },
    h("div", { class: "tg" }, spec.glyph),
    h("div", { class: "tx" },
      h("div", { class: "tt" }, spec.title),
      spec.sub && h("div", { class: "td" }, spec.sub),
      h("div", { class: "tm" }, spec.mode ? `Open ${(ALL_MODES.find((m) => m.id === spec.mode) || {}).label || spec.mode}` : "Live event",
        spec.agent && h("span", { class: "agt" }, spec.agent))),
    h("div", { class: "tlife" }, h("i", {})));
  stack.append(el);
  const timer = setTimeout(() => dismissToast(id), TOAST.LIFE);
  TOAST.live.set(id, { el, timer });
}

/* Evaluate the current event stream and toast any NEW milestones since lastId. */
function scanForMilestones() {
  const evs = store.events || [];
  if (!evs.length) return;
  // First pass after boot: just remember the newest id, don't replay history.
  if (!TOAST.seedDone) {
    TOAST.lastId = evs.reduce((mx, e) => Math.max(mx, toastNumOf(e.id)), -1);
    TOAST.seedDone = true;
    return;
  }
  const prev = TOAST.lastId;
  let newest = prev;
  for (const e of evs) {
    const n = toastNumOf(e.id);
    if (n <= prev) continue;             // already evaluated
    if (n > newest) newest = n;
    const spec = milestoneFor(e);
    if (spec) showToast(spec, e.id);
  }
  TOAST.lastId = newest;
}

/* ===========================================================================
   COMMAND PALETTE — Cmd/Ctrl+K. Jump to any mode, agent, or building (packet).
   Arrow keys + Enter to go, Esc to close, number keys 1-9 switch first modes,
   "?" shows shortcut help. Built ENTIRELY from ctx/store data — no fabrication.
   =========================================================================== */
const PAL = { open: false, mode: "search", query: "", sel: 0, items: [], scrim: null, input: null };

function paletteItems(query) {
  const q = query.trim().toLowerCase();
  const out = [];
  // modes
  ALL_MODES.forEach((m, i) => out.push({
    kind: "Modes", icon: m.icon, label: m.label, hint: i < 9 ? String(i + 1) : "",
    go: () => navigate(m.id),
  }));
  // agents (real telemetry)
  const agents = (store.state?.agents || []);
  agents.forEach((a) => out.push({
    kind: "Agents", icon: a.status === "active" ? "🟢" : "○", label: a.name,
    sub: a.role || a.district || a.status, go: () => navigate("agent-cockpit", { agent: a.id }),
  }));
  // buildings = packets (real telemetry)
  const packets = (store.state?.packets || []);
  packets.forEach((p) => out.push({
    kind: "Buildings", icon: p.status === "done" ? "🏆" : p.status === "blocked" ? "⛔" : "🏗",
    label: p.title || p.id, sub: `${Math.round(p.completion_percent || 0)}% · ${p.status || "—"}`,
    go: () => navigate("factory-floor", { packet: p.id }),
  }));
  if (!q) return out;
  // simple fuzzy-ish: every query token appears somewhere in label/sub/kind
  const toks = q.split(/\s+/).filter(Boolean);
  return out.filter((it) => {
    const hay = `${it.label} ${it.sub || ""} ${it.kind}`.toLowerCase();
    return toks.every((t) => hay.includes(t));
  });
}

function closePalette() {
  if (!PAL.open || !PAL.scrim) return;
  PAL.open = false;
  const scrim = PAL.scrim; PAL.scrim = null; PAL.input = null;
  scrim.classList.add("leaving");
  scrim.addEventListener("animationend", () => scrim.remove(), { once: true });
  setTimeout(() => scrim.remove(), 300); // reduced-motion fallback
}

function renderPaletteList() {
  if (!PAL.scrim) return;
  const listEl = PAL.scrim.querySelector(".cmdk-list");
  if (!listEl) return;
  PAL.items = paletteItems(PAL.query);
  if (PAL.sel >= PAL.items.length) PAL.sel = Math.max(0, PAL.items.length - 1);
  if (!PAL.items.length) {
    listEl.replaceChildren(h("div", { class: "cmdk-empty" }, "No modes, agents, or buildings match ", h("b", {}, PAL.query)));
    return;
  }
  const frag = document.createDocumentFragment();
  let lastKind = null, gi = 0;
  PAL.items.forEach((it, idx) => {
    if (it.kind !== lastKind) { frag.append(h("div", { class: "cmdk-group" }, it.kind)); lastKind = it.kind; }
    frag.append(h("div", {
      class: "cmdk-item", role: "option", "aria-selected": idx === PAL.sel ? "true" : "false",
      dataset: { idx: String(idx) },
      onMouseenter: () => { PAL.sel = idx; markSelected(); },
      onClick: () => { closePalette(); it.go(); },
    },
      h("span", { class: "ci" }, it.icon || "▸"),
      h("span", { class: "cl" }, it.label),
      it.sub && h("span", { class: "cs" }, it.sub),
      it.hint && h("span", { class: "ck" }, it.hint)));
    gi++;
  });
  listEl.replaceChildren(frag);
  scrollSelectedIntoView();
}
function markSelected() {
  if (!PAL.scrim) return;
  PAL.scrim.querySelectorAll(".cmdk-item").forEach((el) => {
    el.setAttribute("aria-selected", Number(el.dataset.idx) === PAL.sel ? "true" : "false");
  });
  scrollSelectedIntoView();
}
function scrollSelectedIntoView() {
  if (!PAL.scrim) return;
  const el = PAL.scrim.querySelector(`.cmdk-item[data-idx="${PAL.sel}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

function helpBody() {
  const rows = [
    ["Open command palette", ["⌘/Ctrl", "K"]],
    ["Switch first modes", ["1", "–", "9"]],
    ["Open this help", ["?"]],
    ["Move selection", ["↑", "↓"]],
    ["Go to selection", ["↵"]],
    ["Open kill / freeze", ["⌘/Ctrl", "."]],
    ["Close", ["Esc"]],
  ];
  return h("div", { class: "cmdk-help" },
    h("h5", {}, "Keyboard shortcuts"),
    ...rows.map(([label, keys]) => h("div", { class: "kr" },
      h("span", {}, label),
      h("span", { class: "keys" }, keys.map((k) => h("span", { class: "kbd" }, k))))));
}

function openPalette(initialMode = "search") {
  if (PAL.open) { if (initialMode === "help") { PAL.mode = "help"; renderPaletteBody(); } return; }
  PAL.open = true; PAL.mode = initialMode; PAL.query = ""; PAL.sel = 0;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const search = h("div", { class: "cmdk-search" },
    h("span", { class: "ic" }, "⌕"),
    h("input", { type: "text", placeholder: "Search modes, agents, buildings…", autocomplete: "off", spellcheck: "false",
      "aria-label": "Command palette search",
      onInput: (ev) => { PAL.query = ev.target.value; PAL.sel = 0; PAL.mode = "search"; renderPaletteBody(); } }),
    h("span", { class: "kbd" }, isMac ? "⌘K" : "Ctrl K"));
  const list = h("div", { class: "cmdk-list", role: "listbox", "aria-label": "Results" });
  const foot = h("div", { class: "cmdk-foot" },
    h("span", { class: "hint" }, h("span", { class: "kbd" }, "↑↓"), "navigate"),
    h("span", { class: "hint" }, h("span", { class: "kbd" }, "↵"), "go"),
    h("span", { class: "hint" }, h("span", { class: "kbd" }, "1-9"), "modes"),
    h("span", { class: "hint" }, h("span", { class: "kbd" }, "?"), "help"),
    h("span", { class: "hint" }, h("span", { class: "kbd" }, "esc"), "close"));
  const panel = h("div", { class: "cmdk", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" }, search, list, foot);
  const scrim = h("div", { class: "cmdk-scrim", onMousedown: (ev) => { if (ev.target === scrim) closePalette(); } }, panel);
  document.body.append(scrim);
  PAL.scrim = scrim; PAL.input = scrim.querySelector("input");
  renderPaletteBody();
  if (PAL.input) PAL.input.focus();
}
function renderPaletteBody() {
  if (!PAL.scrim) return;
  const panel = PAL.scrim.querySelector(".cmdk");
  const list = panel.querySelector(".cmdk-list");
  const help = panel.querySelector(".cmdk-help");
  if (PAL.mode === "help") {
    if (list) list.style.display = "none";
    if (!help) panel.insertBefore(helpBody(), panel.querySelector(".cmdk-foot"));
  } else {
    if (help) help.remove();
    if (list) { list.style.display = ""; renderPaletteList(); }
  }
}

/* global keyboard wiring */
function onGlobalKey(ev) {
  const meta = ev.metaKey || ev.ctrlKey;
  // Cmd/Ctrl+K — toggle palette (works from anywhere)
  if (meta && (ev.key === "k" || ev.key === "K")) { ev.preventDefault(); PAL.open ? closePalette() : openPalette("search"); return; }
  // Cmd/Ctrl+. — kill/freeze quick jump
  if (meta && ev.key === ".") { ev.preventDefault(); closePalette(); navigate("control-tower"); return; }

  if (PAL.open) {
    if (ev.key === "Escape") { ev.preventDefault(); closePalette(); return; }
    if (PAL.mode === "help") { if (ev.key !== "Escape") { /* any key returns to search */ if (ev.key.length === 1 || ev.key === "Backspace") { PAL.mode = "search"; renderPaletteBody(); if (PAL.input) PAL.input.focus(); } } return; }
    if (ev.key === "ArrowDown") { ev.preventDefault(); if (PAL.items.length) { PAL.sel = (PAL.sel + 1) % PAL.items.length; markSelected(); } return; }
    if (ev.key === "ArrowUp") { ev.preventDefault(); if (PAL.items.length) { PAL.sel = (PAL.sel - 1 + PAL.items.length) % PAL.items.length; markSelected(); } return; }
    if (ev.key === "Enter") { ev.preventDefault(); const it = PAL.items[PAL.sel]; if (it) { closePalette(); it.go(); } return; }
    if (ev.key === "?" && !PAL.query) { ev.preventDefault(); PAL.mode = "help"; renderPaletteBody(); return; }
    return; // while open, swallow the rest (typing goes to the input)
  }

  // Closed-palette global shortcuts — ignore while typing in a field
  const tag = (ev.target && ev.target.tagName) || "";
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (ev.target && ev.target.isContentEditable)) return;
  if (ev.key === "?") { ev.preventDefault(); openPalette("help"); return; }
  // number keys 1-9 -> first nine modes
  if (!meta && !ev.altKey && /^[1-9]$/.test(ev.key)) {
    const m = ALL_MODES[Number(ev.key) - 1];
    if (m) { ev.preventDefault(); navigate(m.id); }
  }
}

/* ----------------------------------------------------------------- live wiring */
async function postEvent(evt) {
  try {
    const r = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evt) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
let stateRefreshT = null;
function refreshStateSoon() {
  if (stateRefreshT) return;
  stateRefreshT = setTimeout(async () => {
    stateRefreshT = null;
    try { store.state = await getJSON("/api/state"); } catch {}
    renderChromeOnly();
    renderMode();
  }, 350);
}
function onAppend(e) {
  store.events.push(e);
  if (store.events.length > 1000) store.events = store.events.slice(-1000);
  renderRibbon();
  scanForMilestones(); // pop a toast if this new event is a milestone (honest: only real events)
  // refetch aggregate state so packet/agent/risk changes (buildings rising) show live
  refreshStateSoon();
}
let es = null, pollTimer = null;
function startSSE() {
  try {
    es = new EventSource("/events");
    es.addEventListener("open", () => { store.conn = "live"; renderMissionBar(); stopPoll(); });
    es.addEventListener("append", (m) => { try { onAppend(JSON.parse(m.data)); } catch {} });
    es.addEventListener("tick", async (m) => { try { const d = JSON.parse(m.data); if (d.repo) store.repo = d.repo; if (d.state) store.state = d.state; renderChromeOnly(); } catch {} });
    es.addEventListener("error", () => { store.conn = "down"; renderMissionBar(); startPoll(); });
  } catch { store.conn = "down"; startPoll(); }
}
function startPoll() { if (pollTimer) return; pollTimer = setInterval(async () => { const ok = await loadAll(); store.conn = ok ? (es && es.readyState === 1 ? "live" : "poll") : "down"; renderAll(); scanForMilestones(); }, 5000); }
function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
// always-on backstop FULL refresh so the city stays live even if SSE blips
// (e.g. server restart) — guarantees updates without any manual refresh.
setInterval(async () => {
  try { const ok = await loadAll(); store.conn = ok ? (es && es.readyState === 1 ? "live" : "poll") : "down"; renderAll(); scanForMilestones(); } catch {}
}, 8000);

/* ----------------------------------------------------------------- boot */
async function boot() {
  const id = location.hash.slice(1); if (id && ALL_MODES.find((m) => m.id === id)) store.mode = id;
  const ok = await loadAll();
  store.conn = ok ? "poll" : "down";
  document.getElementById("app").dataset.booting = "false";
  renderAll();
  scanForMilestones(); // seed the last-seen id from the historical backlog (no replay)
  window.addEventListener("keydown", onGlobalKey); // Cmd/Ctrl+K palette, 1-9, ?, esc
  if (!ok) {
    document.getElementById("mode-root").prepend(ui.error("Cannot reach command-center server",
      "Start it: node scripts/baseballhelm-command-center.mjs — then reload. Showing last known/empty state."));
  }
  startSSE();
  startPoll(); // until SSE opens
}
window.BHCC = { store, navigate, ctx, h, ui, fmt, loadAll, renderAll, openPalette }; // debug handle
boot();
