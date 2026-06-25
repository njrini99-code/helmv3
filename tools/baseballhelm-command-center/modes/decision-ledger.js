/* Decision Ledger — the Memory Library's marble archive of architectural decisions.
   A stamped/filed timeline (newest first): each decision shows the call, the "why",
   alternatives considered, impact, the deciding agent (cross-linked into Agent City),
   and provenance pulled from the live event stream. Reads ENTIRELY from live ctx —
   no hardcoded counts, no fake progress. Honest empty states when a slice is bare.
   Pure DOM, cream/green tokens only — matches mission-control's polish. */
export const meta = { label: "Decision Ledger", district: "Memory Library" };

export function render(ctx) {
  const { h, ui, fmt, state, events } = ctx;
  const s = state || {};

  ensureStyle(h);

  // ---- live source slices (every field guarded) ----------------------------
  const decisions = Array.isArray(s.decisions) ? s.decisions.filter(Boolean) : null;
  const agents = Array.isArray(s.agents) ? s.agents.filter(Boolean) : [];
  const evts = Array.isArray(events) ? events.filter(Boolean) : [];

  // Index agents by id AND name so a decision's `agent` can be cross-linked
  // to its lane in Agent City regardless of which identifier was recorded.
  const agentBy = new Map();
  for (const a of agents) {
    if (a.id) agentBy.set(String(a.id).toLowerCase(), a);
    if (a.name) agentBy.set(String(a.name).toLowerCase(), a);
  }
  const lookupAgent = (ref) => (ref ? agentBy.get(String(ref).toLowerCase()) || null : null);

  // Decision-provenance events from the live stream, newest mapped per title.
  const decisionEvents = evts.filter((e) => e.type === "decision_added");
  const eventByTitle = new Map();
  for (const e of decisionEvents) {
    const key = (e.title || "").trim().toLowerCase();
    if (key) eventByTitle.set(key, e); // last-write-wins → most recent matching event
  }

  // ---- loading / empty short-circuits --------------------------------------
  if (decisions === null) {
    return h("div", { class: "stack" },
      ui.modeHead({ glyph: "⚖", title: "Decision Ledger",
        sub: "Memory Library — the decisions that shape this build, on the record" }),
      ui.panel({ glyph: "📜", title: "Architectural decision record", body: ui.loading("Reading the decision ledger…") }));
  }

  // ---- derived metrics (all from live data) --------------------------------
  const sorted = decisions.slice().sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const total = sorted.length;

  // distinct deciding agents
  const agentCounts = new Map();
  for (const d of sorted) {
    const key = (d.agent || "unattributed").trim();
    agentCounts.set(key, (agentCounts.get(key) || 0) + 1);
  }
  const distinctAgents = [...agentCounts.keys()].filter((k) => k !== "unattributed").length;

  // alternatives weighed across the whole ledger (roads not taken)
  const altCount = sorted.reduce(
    (n, d) => n + (Array.isArray(d.alternatives) ? d.alternatives.filter(Boolean).length : 0), 0
  );

  // impact themes — group identical impact strings
  const impactCounts = new Map();
  for (const d of sorted) {
    const imp = (d.impact || "").trim();
    if (imp) impactCounts.set(imp, (impactCounts.get(imp) || 0) + 1);
  }
  const impactThemes = [...impactCounts.entries()].sort((a, b) => b[1] - a[1]);

  // span of the ledger (oldest → newest), all from real timestamps
  const dated = sorted.filter((d) => d.created_at).map((d) => new Date(d.created_at));
  const newest = dated.length ? dated[0] : null;            // sorted desc → first is newest
  const oldest = dated.length ? dated[dated.length - 1] : null;

  const newestRec = sorted[0] || null;

  // ---- top stat band -------------------------------------------------------
  const stats = ui.grid("c4", [
    ui.stat({ label: "Decisions filed", value: total, sub: total ? "on the record" : "ledger is bare", tone: total ? "info" : "warn" }),
    ui.stat({ label: "Deciding agents", value: distinctAgents, sub: "distinct authors", tone: distinctAgents ? "ok" : "warn" }),
    ui.stat({ label: "Roads not taken", value: altCount, sub: "alternatives weighed", tone: altCount ? "info" : "idle" }),
    ui.stat({ label: "Most recent", value: newest ? fmt.ago(newest.toISOString()) : "—",
      sub: newestRec ? (newestRec.title || "untitled") : "no entries yet", tone: newest ? "info" : "warn" }),
  ]);

  // ---- ledger span + by-agent + impact themes (detail row) -----------------
  const spanPanel = ui.panel({
    glyph: "🕰", title: "Ledger span",
    body: total
      ? h("div", { class: "stack" },
          ui.kv("First decision", oldest ? `${fmt.date(oldest.toISOString())} · ${fmt.ago(oldest.toISOString())}` : "undated"),
          ui.kv("Latest decision", newest ? `${fmt.date(newest.toISOString())} · ${fmt.ago(newest.toISOString())}` : "undated"),
          ui.kv("Entries dated", `${dated.length}/${total}`),
          ui.kv("Avg alternatives", total ? (altCount / total).toFixed(1) + " per decision" : "—"))
      : ui.empty({ glyph: "🕰", title: "No span yet", hint: "The ledger span fills in once decisions are recorded." }),
  });

  const byAgent = [...agentCounts.entries()].sort((a, b) => b[1] - a[1]);
  const byAgentPanel = ui.panel({
    glyph: "🖋", title: "By deciding agent", sub: byAgent.length ? `${byAgent.length} author${byAgent.length === 1 ? "" : "s"}` : "",
    body: byAgent.length
      ? ui.rows(byAgent.map(([name, n]) => {
          const ag = lookupAgent(name);
          const isLinked = !!ag;
          return ui.listRow([
            ui.dot(ag ? dotForStatus(ag.status) : "idle"),
            h("div", { class: "grow" },
              h("div", { class: "row gap2 center" },
                h("span", { style: { fontWeight: "700", fontSize: "12.5px" } }, name),
                ag && ag.district ? h("span", { class: "muted", style: { fontSize: "11px" } }, ag.district) : null),
              ag && ag.role ? h("div", { class: "muted", style: { fontSize: "11px" } }, ag.role) : null),
            ui.badge(`${n}`, n > 1 ? "active" : "info"),
            isLinked
              ? h("button", { class: "btn sm ghost", title: `Open ${name} in Agent City`,
                  onClick: () => ctx.go("agent-city") }, "lane →")
              : null,
          ]);
        }))
      : ui.empty({ glyph: "🖋", title: "No authors recorded", hint: "Deciding agents appear once decisions carry an author." }),
  });

  const impactPanel = ui.panel({
    glyph: "🎯", title: "Impact themes", sub: impactThemes.length ? `${impactThemes.length} distinct` : "",
    body: impactThemes.length
      ? ui.rows(impactThemes.map(([imp, n]) => ui.listRow([
          ui.dot("info"),
          h("span", { class: "grow", style: { fontSize: "12.5px" } }, imp),
          ui.badge(`${n}×`, n > 1 ? "active" : "idle"),
        ])))
      : ui.empty({ glyph: "🎯", title: "No impact recorded", hint: "Decisions describe their impact here as they're filed." }),
  });

  // ---- the archive (timeline, newest first) --------------------------------
  let archiveBody;
  if (total === 0) {
    archiveBody = ui.empty({ glyph: "⚖", title: "The ledger is empty",
      hint: "Architectural decisions appear here once the build records them. Each entry captures the call, the why, the roads not taken, and the deciding agent." });
  } else {
    archiveBody = h("div", { class: "tl" }, sorted.map((d) =>
      h("div", { class: "node" }, decisionCard(ctx, d, lookupAgent, eventByTitle))
    ));
  }

  const ledger = ui.panel({
    glyph: "📜", title: "Architectural decision record", sub: total ? "newest first" : "",
    actions: ui.badge(total ? `${total} filed` : "empty", total ? "ok" : "idle"),
    body: archiveBody,
  });

  return h("div", { class: "stack" },
    ui.modeHead({ glyph: "⚖", title: "Decision Ledger",
      sub: "Memory Library — the decisions that shape this build, on the record",
      actions: [
        ui.pill(`${altCount} roads not taken`, { dot: true, tone: altCount ? "active" : "idle" }),
        h("button", { class: "btn sm ghost", onClick: () => ctx.go("memory-library") }, "Memory Library →"),
        ui.badge(total ? "Archived" : "Empty", total ? "ok" : "warn"),
      ] }),
    stats,
    ui.grid("c3", [spanPanel, byAgentPanel, impactPanel]),
    ledger,
  );
}

// --------------------------------------------------------------------------
function decisionCard(ctx, d, lookupAgent, eventByTitle) {
  const { h, ui, fmt } = ctx;
  const dd = d || {};
  const alts = Array.isArray(dd.alternatives) ? dd.alternatives.filter(Boolean) : [];
  const agentRef = dd.agent || null;
  const ag = lookupAgent(agentRef);

  // provenance — match this decision to a live decision_added event by title.
  const titleKey = (dd.title || "").trim().toLowerCase();
  const provEvt = titleKey ? eventByTitle.get(titleKey) : null;

  return h("div", { class: "dl-card" },
    h("span", { class: "dl-stamp" }, dd.created_at ? fmt.date(dd.created_at) : "undated"),
    h("div", { class: "dl-title" }, dd.title || "Untitled decision"),
    h("div", { class: "dl-call" }, dd.decision || "—"),
    dd.rationale
      ? h("div", { class: "dl-why" }, h("b", {}, "Why — "), dd.rationale)
      : h("div", { class: "dl-why muted" }, "No rationale recorded."),
    h("div", { class: "dl-lab" }, "Alternatives considered"),
    alts.length
      ? h("div", { class: "row wrap gap2" }, alts.map((a) => ui.badge("vs " + a, "idle")))
      : h("div", { class: "muted", style: { fontSize: "12px" } }, "None recorded."),
    h("div", { class: "dl-foot" },
      h("div", { class: "row gap2 center" },
        ui.dot("info"),
        h("span", { class: "muted", style: { fontSize: "12px" } }, "Impact:"),
        h("span", { style: { fontSize: "12px" } }, dd.impact || "—")),
      h("div", { class: "row gap2 center" },
        agentRef
          ? (ag
              ? h("button", { class: "dl-agent-link", title: `${ag.role || ag.name || agentRef} — open in Agent City`,
                  onClick: () => ctx.go("agent-city") },
                  ui.dot(dotForStatus(ag.status)),
                  h("span", {}, ag.name || agentRef),
                  h("span", { class: "dl-agent-arrow" }, "→"))
              : ui.pill(agentRef, { dot: true, tone: "active" }))
          : ui.pill("unattributed", {}),
        h("span", { class: "muted mono nowrap", style: { fontSize: "11px" } },
          dd.created_at ? fmt.ago(dd.created_at) : ""))),
    provEvt
      ? h("div", { class: "dl-prov" },
          h("span", { class: "dl-prov-dot" }),
          h("span", {}, "Logged to the live stream"),
          provEvt.source ? h("span", { class: "dl-prov-src" }, provEvt.source) : null,
          provEvt.ts ? h("span", { class: "muted mono", style: { fontSize: "10px" } }, fmt.ago(provEvt.ts)) : null)
      : null,
  );
}

function dotForStatus(status) {
  switch ((status || "").toLowerCase()) {
    case "active": return "ok";
    case "blocked": return "risk";
    case "done": return "info";
    case "idle": return "idle";
    case "planned": return "warn";
    default: return "idle";
  }
}

function ensureStyle(h) {
  if (document.getElementById("st-decision-ledger")) return;
  const css = `
    .dl-card{ position:relative; border:1px solid var(--city-line-strong); border-radius:var(--r-md);
      background:linear-gradient(180deg,var(--city-cream-0),var(--city-cream-50));
      padding:14px 16px 14px 18px; box-shadow:var(--city-shadow-soft);
      border-left:4px solid var(--city-gold); }
    .dl-card .dl-stamp{ position:absolute; top:12px; right:14px; font-family:var(--font-mono);
      font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--city-ink-muted);
      border:1px solid var(--city-line-strong); border-radius:var(--r-sm); padding:2px 7px;
      transform:rotate(-3deg); background:var(--city-cream-100); opacity:.85; }
    .dl-card .dl-title{ font-weight:800; font-size:14.5px; letter-spacing:-.01em; padding-right:84px; }
    .dl-card .dl-call{ font-size:13px; margin-top:6px; }
    .dl-card .dl-why{ font-size:12.5px; color:var(--city-ink-muted); margin-top:8px;
      border-left:2px dashed var(--city-line-strong); padding-left:10px; }
    .dl-card .dl-why b{ color:var(--city-green-700); font-weight:700; }
    .dl-card .dl-lab{ font-size:9.5px; letter-spacing:.12em; text-transform:uppercase;
      color:var(--city-ink-muted); margin:10px 0 4px; font-weight:700; }
    .dl-card .dl-foot{ display:flex; justify-content:space-between; align-items:center; gap:10px;
      flex-wrap:wrap; margin-top:12px; padding-top:10px; border-top:1px dashed var(--city-line); }
    .dl-agent-link{ display:inline-flex; align-items:center; gap:6px; cursor:pointer;
      border:1px solid var(--city-line-strong); border-radius:999px; padding:3px 10px;
      background:linear-gradient(180deg,#eef7ef,#dcefe3); color:var(--city-green-800);
      font-size:11.5px; font-weight:700; transition:box-shadow .15s ease, transform .15s ease; }
    .dl-agent-link:hover{ box-shadow:var(--city-shadow-soft); transform:translateY(-1px); }
    .dl-agent-arrow{ color:var(--city-green-700); font-weight:800; }
    .dl-card .dl-prov{ display:flex; align-items:center; gap:8px; margin-top:10px;
      font-size:10.5px; color:var(--city-ink-muted); }
    .dl-card .dl-prov-dot{ width:7px; height:7px; border-radius:999px;
      background:var(--city-turf); box-shadow:0 0 0 3px rgba(22,163,74,.12); }
    .dl-card .dl-prov-src{ font-family:var(--font-mono); font-size:9.5px; letter-spacing:.08em;
      text-transform:uppercase; border:1px solid var(--city-line); border-radius:var(--r-sm);
      padding:1px 6px; color:var(--city-green-700); background:var(--city-cream-100); }
  `;
  document.head.append(h("style", { id: "st-decision-ledger" }, css));
}
