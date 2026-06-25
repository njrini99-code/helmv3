/* Codebase City — the Code Quarry skyline rendered from LIVE telemetry.
   The repo's real shape comes from ctx.state.loc.byCategory (server-computed:
   App routes / Components / Libraries / Migrations / RLS tests / Hooks — each
   with a true file count + line count). Every category is a city DISTRICT whose
   building height is its share of the skyline. Live agent + packet activity is
   overlaid by matching district names, a working-tree panel summarizes the dirty
   tree (filtering out playwright-report churn so signal isn't drowned), a risk
   lens surfaces touched auth/RLS/migration files, and a build-pulse rolls up
   file_changed / packet events by district (events carry no paths, so we group
   honestly by district instead of inventing file names).
   Honest at every empty slice — no fabricated buildings, counts, or churn. */
export const meta = { label: "Codebase City", district: "Code Quarry" };

/* High-attention path matcher (deterministic risk rules — auth/RLS/migrations). */
const RISK_RE = /(^|\/)(auth|middleware)|rls|policy|policies|supabase\/migrations/i;
function isRiskPath(p) { return RISK_RE.test(String(p || "")); }

/* Working-tree noise: generated artifacts that swamp the diff but are not
   product code. Filtered OUT of the "BaseballHelm signal" count, shown only as
   an honest, collapsed tally so the number is never silently dropped. */
const NOISE_RE = /^(playwright-report|test-results|coverage|\.next|node_modules|dist|build)\//i;
function isNoisePath(p) { return NOISE_RE.test(String(p || "")); }

/* Map a loc.byCategory key → a city district glyph + the live state.district
   name it corresponds to (so we can overlay agents/packets working there). */
const DISTRICT_META = {
  "App routes":  { glyph: "🏟", quarter: "Shipping & Routes", districts: ["Shipping Dock", "Permission Control Tower"], tone: "info" },
  "Components":  { glyph: "🏗", quarter: "Component Foundry",  districts: ["Component Foundry"], tone: "info" },
  "Libraries":  { glyph: "🧠", quarter: "Engine Row",        districts: ["Backend Machine Shop", "Observatory", "Memory Library"], tone: "info" },
  "Migrations":  { glyph: "🗄", quarter: "Data District",      districts: ["Data District"], tone: "warn" },
  "RLS tests":  { glyph: "🛡", quarter: "QA Lab",            districts: ["QA Lab"], tone: "warn" },
  "Hooks":      { glyph: "🪝", quarter: "Wiring Loft",        districts: ["Integration Harbor"], tone: "info" },
};
function metaFor(key) {
  return DISTRICT_META[key] || { glyph: "🗂", quarter: key, districts: [], tone: "info" };
}

/* Normalize a dirty/changed entry (string or {status,path}) to {path,status}. */
function pathOf(f) { return !f ? "" : (typeof f === "string" ? f : (f.path || f.file || "")); }
function statusOf(f) { return (!f || typeof f === "string") ? "" : (f.status || ""); }

export function render(ctx) {
  const { h, ui, fmt } = ctx;
  const s = ctx.state || {};
  const repo = ctx.repo || {};
  const events = Array.isArray(ctx.events) ? ctx.events : [];

  injectCss(ctx);

  const branch = repo.branch || s.branch || "—";
  const lastCommit = repo.last_commit || "";
  const loc = s.loc || null;
  const cats = Array.isArray(loc?.byCategory) ? loc.byCategory.slice() : [];

  // ---- unify the working tree (changed_files ∪ dirty), then split signal vs noise
  const byPath = new Map();
  for (const f of (Array.isArray(repo.changed_files) ? repo.changed_files : [])) {
    const p = pathOf(f); if (p && !byPath.has(p)) byPath.set(p, { path: p, status: statusOf(f) });
  }
  for (const f of (Array.isArray(repo.dirty) ? repo.dirty : [])) {
    const p = pathOf(f); if (!p) continue;
    if (byPath.has(p)) { if (!byPath.get(p).status) byPath.get(p).status = statusOf(f); }
    else byPath.set(p, { path: p, status: statusOf(f) });
  }
  const allFiles = Array.from(byPath.values());
  const signalFiles = allFiles.filter((f) => !isNoisePath(f.path));
  const noiseFiles = allFiles.filter((f) => isNoisePath(f.path));
  const riskFiles = signalFiles.filter((f) => isRiskPath(f.path));

  // ---- live build-pulse per district: roll up file_changed / packet_* events.
  // Events carry NO file paths (verified live), so we group HONESTLY by the
  // district each event's agent/packet belongs to, not by inventing paths.
  const agentDistrict = new Map((s.agents || []).map((a) => [a.id, a.district]));
  const packetDistrict = new Map((s.packets || []).map((p) => [p.id, p.district]));
  const pulse = new Map(); // district -> {writes, tests, started, completed, last}
  const COUNTED = new Set(["file_changed", "file_change", "test_passed", "test_failed", "packet_started", "packet_progress", "packet_completed", "packet_finished"]);
  for (const e of events) {
    const t = e?.type || "";
    if (!COUNTED.has(t)) continue;
    const dist = agentDistrict.get(e.agent) || packetDistrict.get(e.packet) || null;
    if (!dist) continue;
    const cur = pulse.get(dist) || { writes: 0, tests: 0, started: 0, completed: 0, last: null };
    if (t === "file_changed" || t === "file_change") cur.writes++;
    else if (t === "test_passed" || t === "test_failed") cur.tests++;
    else if (t === "packet_started") cur.started++;
    else if (t === "packet_completed" || t === "packet_finished") cur.completed++;
    if (!cur.last || (e.ts && e.ts > cur.last)) cur.last = e.ts;
    pulse.set(dist, cur);
  }
  const pulseRows = Array.from(pulse.entries())
    .map(([dist, v]) => ({ dist, ...v, total: v.writes + v.tests + v.started + v.completed }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  // ---- top stat band (all live from loc + working tree)
  const stats = ui.grid("c4", [
    ui.stat({ label: "Lines of code", value: loc ? fmt.num(loc.total) : "—", sub: loc ? `${fmt.num(loc.files)} files in repo` : "loc inventory pending", tone: "ok" }),
    ui.stat({ label: "Districts", value: cats.length || "—", sub: cats.length ? "code-quarry neighborhoods" : "no breakdown yet", tone: "info" }),
    ui.stat({ label: "Working tree", value: signalFiles.length, sub: signalFiles.length ? "product files dirty" : "clean (excl. artifacts)", tone: signalFiles.length ? "warn" : "ok" }),
    ui.stat({ label: "Risk files", value: riskFiles.length, sub: "auth · RLS · migrations touched", tone: riskFiles.length ? "risk" : "ok" }),
  ]);

  // ---- the skyline: one building per loc.byCategory, height = share of repo
  const maxLines = cats.reduce((m, c) => Math.max(m, c.lines || 0), 0) || 1;
  const totalLines = loc?.total || cats.reduce((a, c) => a + (c.lines || 0), 0) || 0;
  const sortedCats = cats.slice().sort((a, b) => (b.lines || 0) - (a.lines || 0));

  let skylineNode;
  if (!sortedCats.length) {
    skylineNode = ui.panel({
      glyph: "🏙", title: "The skyline", sub: "Code Quarry districts",
      body: ui.empty({
        glyph: "🏙",
        title: "Codebase inventory not computed yet",
        hint: "The skyline rises from the server-side line-of-code inventory (ctx.state.loc.byCategory). Once it runs, each subsystem becomes a building sized to its share of the repo.",
      }),
    });
  } else {
    const buildings = sortedCats.map((c) => {
      const m = metaFor(c.key);
      const lines = c.lines || 0;
      const files = c.files || 0;
      const heightPct = Math.round((lines / maxLines) * 100);
      const sharePct = totalLines ? Math.round((lines / totalLines) * 100) : 0;
      // live activity in any district this category maps to
      const live = m.districts.reduce((acc, d) => {
        const p = pulse.get(d);
        if (p) { acc.writes += p.writes; acc.started += p.started; acc.completed += p.completed; acc.has = true; }
        return acc;
      }, { writes: 0, started: 0, completed: 0, has: false });
      const activeHere = (s.agents || []).filter((a) => m.districts.includes(a.district) && a.status === "active").length;

      return h("div", { class: "cc-tower" + (live.has ? " is-live" : "") },
        h("div", { class: "cc-tower-head" },
          h("span", { class: "cc-tower-glyph" }, m.glyph),
          h("div", { class: "grow" },
            h("div", { class: "cc-tower-name" }, c.key),
            h("div", { class: "cc-tower-quarter" }, m.quarter)),
          activeHere ? ui.badge(`${activeHere} live`, "active") : null),
        h("div", { class: "cc-bar", title: `${sharePct}% of repo` },
          h("i", { style: { height: heightPct + "%" } })),
        h("div", { class: "cc-tower-stats" },
          h("div", { class: "cc-ts" }, h("b", {}, fmt.num(files)), h("span", {}, "files")),
          h("div", { class: "cc-ts" }, h("b", {}, fmt.num(lines)), h("span", {}, "lines")),
          h("div", { class: "cc-ts" }, h("b", {}, sharePct + "%"), h("span", {}, "of repo"))),
        live.has
          ? h("div", { class: "cc-tower-live" },
              live.writes ? ui.pill(`${live.writes} writes`, { tone: "warn" }) : null,
              live.completed ? ui.pill(`${live.completed} shipped`, { tone: "ok" }) : null,
              live.started && !live.completed ? ui.pill(`${live.started} started`, { dot: true, tone: "active" }) : null)
          : h("div", { class: "cc-tower-quiet muted" }, "no live build events"));
    });
    skylineNode = ui.panel({
      glyph: "🏙", title: "The skyline", lift: true,
      sub: `${fmt.num(totalLines)} lines across ${sortedCats.length} districts`,
      actions: loc?.generated_at ? ui.pill(`measured ${fmt.ago(loc.generated_at)}`, { dot: false }) : null,
      body: h("div", { class: "cc-skyline" }, buildings),
    });
  }

  // ---- working-tree depot (cleaned: signal up top, artifact churn honest-tallied)
  const depot = ui.panel({
    glyph: "🗂", title: "Working tree", sub: `branch ${shortBranch(branch)}`,
    actions: ui.badge(signalFiles.length ? "DIRTY" : "CLEAN", signalFiles.length ? "warn" : "ok"),
    body: h("div", { class: "stack" },
      ui.kv("Last commit", lastCommit || "—"),
      ui.kv("Product files dirty", String(signalFiles.length)),
      ui.kv("Risk paths", String(riskFiles.length)),
      noiseFiles.length ? ui.kv("Generated artifacts", `${noiseFiles.length} (excluded from signal)`) : null,
      signalFiles.length
        ? h("div", {},
            ui.section("Touched product files"),
            h("div", { class: "scroll-y maxh-280" }, ui.rows(signalFiles.slice(0, 40).map((f) =>
              ui.listRow([
                isRiskPath(f.path) ? ui.dot("risk") : ui.dot("warn"),
                h("span", { class: "grow mono truncate", style: { fontSize: "11.5px" } }, prettyPath(f.path)),
                f.status ? h("span", { class: "muted mono", style: { fontSize: "10.5px" } }, f.status) : null,
              ])))),
            signalFiles.length > 40 ? h("div", { class: "muted", style: { fontSize: "11px", marginTop: "6px" } }, `+ ${signalFiles.length - 40} more`) : null)
        : ui.empty({ glyph: "✓", title: "No product files dirty", hint: "Git-tracked edits to BaseballHelm source appear here (generated artifacts are excluded)." })),
  });

  // ---- risk lens (genuinely useful — touched high-attention paths)
  const riskLens = ui.panel({
    glyph: "🛡", title: "Risk lens", sub: "auth · middleware · RLS · policy · migrations",
    lift: riskFiles.length > 0,
    actions: ui.badge(riskFiles.length ? `${riskFiles.length} FLAGGED` : "ALL CLEAR", riskFiles.length ? "risk" : "ok"),
    body: riskFiles.length
      ? h("div", { class: "scroll-y maxh-280" }, ui.rows(riskFiles.map((f) =>
          ui.listRow([
            ui.dot("risk"),
            h("span", { class: "grow mono truncate", style: { fontSize: "11.5px" } }, prettyPath(f.path)),
            f.status ? ui.badge(f.status, "warn") : null,
          ]))))
      : ui.empty({ glyph: "🛡", title: "No high-attention paths touched", hint: "Edits to auth, middleware, RLS, policies, or supabase/migrations light up here for review." }),
  });

  // ---- build pulse by district (replaces the dead path-regex "worn paths")
  const pulsePanel = ui.panel({
    glyph: "📡", title: "Build pulse by district", sub: "live churn rolled up from build events",
    actions: pulseRows.length ? ui.pill(`${events.length} events`, { dot: false }) : null,
    body: pulseRows.length
      ? ui.rows(pulseRows.map((r) =>
          ui.listRow([
            ui.dot(r.completed ? "ok" : r.writes ? "warn" : "info"),
            h("div", { class: "grow" },
              h("div", { style: { fontWeight: "600", fontSize: "12.5px" } }, r.dist),
              h("div", { class: "muted", style: { fontSize: "11px" } }, r.last ? `last activity ${fmt.ago(r.last)}` : "—")),
            h("div", { class: "row", style: { gap: "6px" } },
              r.writes ? ui.pill(`${r.writes} writes`, { tone: "warn" }) : null,
              r.tests ? ui.pill(`${r.tests} tests`, { tone: "ok" }) : null,
              r.completed ? ui.pill(`${r.completed} shipped`, { tone: "ok" }) : null),
          ])))
      : ui.empty({ glyph: "📡", title: "No build events yet", hint: "file_changed, test, and packet events stream in and roll up by district once agents start working." }),
  });

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "🗺",
      title: "Codebase City",
      sub: "Code Quarry — the BaseballHelm repo rendered as a living skyline",
      actions: [
        ui.pill(shortBranch(branch), { dot: signalFiles.length > 0, tone: signalFiles.length ? "active" : undefined }),
        loc ? ui.badge(`${fmt.num(loc.total)} ln`, "ok") : null,
        ui.badge(signalFiles.length ? `${signalFiles.length} dirty` : "clean", signalFiles.length ? "warn" : "ok"),
      ].filter(Boolean),
    }),
    stats,
    skylineNode,
    ui.grid("c2", [depot, riskLens]),
    pulsePanel,
  );
}

/* ------------------------------------------------------------- small helpers */
function shortBranch(b) {
  const s = String(b || "—");
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}
function prettyPath(p) {
  // collapse the repeated src/app/baseball prefix so the tail stays readable
  return String(p || "").replace(/^src\/app\/baseball\//, "…/").replace(/^src\/components\/baseball\//, "…/cmp/");
}

/* Mode-specific CSS injected once, idempotently, per the contract. Cream/green
   tokens only — the skyline uses the shared --city-* palette so it reads as one
   world with mission-control. */
function injectCss(ctx) {
  if (document.getElementById("st-codebase-city")) return;
  const css = `
  .cc-skyline { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .cc-tower {
    display: flex; flex-direction: column; gap: 8px; padding: 12px;
    border: 1px solid var(--city-line); border-radius: 12px;
    background: linear-gradient(180deg, var(--city-cream-0), var(--city-cream-50));
    box-shadow: 0 1px 0 rgba(18,53,34,.04);
  }
  .cc-tower.is-live { border-color: var(--city-line-strong); box-shadow: 0 0 0 1px rgba(60,147,97,.18), 0 6px 16px -10px rgba(18,53,34,.3); }
  .cc-tower-head { display: flex; align-items: flex-start; gap: 8px; }
  .cc-tower-glyph { font-size: 18px; line-height: 1; }
  .cc-tower-name { font-weight: 700; font-size: 13px; color: var(--city-ink); }
  .cc-tower-quarter { font-size: 10.5px; color: var(--city-ink-muted); letter-spacing: .04em; }
  .cc-bar {
    height: 56px; border-radius: 8px; display: flex; align-items: flex-end;
    background: repeating-linear-gradient(90deg, var(--city-cream-100) 0 10px, var(--city-cream-50) 10px 20px);
    border: 1px solid var(--city-line); overflow: hidden; padding: 3px;
  }
  .cc-bar > i {
    display: block; width: 100%; min-height: 6px;
    background: linear-gradient(180deg, var(--city-turf), var(--city-green-700));
    border-radius: 5px 5px 3px 3px;
    box-shadow: inset 0 1px 0 rgba(255,253,246,.4);
  }
  .cc-tower.is-live .cc-bar > i { background: linear-gradient(180deg, var(--city-green-600), var(--city-green-800)); }
  .cc-tower-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .cc-ts { text-align: center; }
  .cc-ts b { display: block; font-size: 13px; font-weight: 700; color: var(--city-green-800); font-family: var(--font-mono); }
  .cc-ts span { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--city-ink-muted); }
  .cc-tower-live { display: flex; flex-wrap: wrap; gap: 5px; }
  .cc-tower-quiet { font-size: 10.5px; font-style: italic; }
  `;
  document.head.append(ctx.h("style", { id: "st-codebase-city" }, css));
}
