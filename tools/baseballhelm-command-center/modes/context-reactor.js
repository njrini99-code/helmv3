/* Context Reactor — the Observatory's honesty core for context / memory state.
   THE CARDINAL RULE: never invent token or context-window numbers. Direct token /
   context telemetry needs OTel spans or Claude Code hooks this local command center
   does not (yet) receive, so those gauges are shown as explicitly UNAVAILABLE.

   Everything else is a REAL measured proxy drawn from LIVE ctx:
   - plan-read cycle      → ctx.events plan_read_started / plan_read_completed
   - fuel loaded          → ctx.state.read_order (the spec stack loaded as context)
   - context load by lane → ctx.events grouped by agent (who is carrying the most context)
   - context load by work-stream → ctx.events grouped by packet (which packet is hottest)
   - context boundaries   → ctx.events SessionStart / compaction / server-start markers
   - milestone capsules   → ctx.state.handoff.notes + ctx.state.decisions
   - live agent fuel      → ctx.state.agents (queue depth + heartbeat freshness)

   Honest empty / loading / error states throughout; defensive against missing fields.
   Cream/green only, matched to mission-control. */
export const meta = { label: "Context Reactor", district: "Observatory" };

// --- event-type signal classifiers (matched against the LIVE event stream) -----------
const PLAN_START = /plan_read_started/i;
const PLAN_DONE = /plan_read_completed/i;
// A "context boundary" = a moment the working context was (re)seeded or trimmed.
// These are the markers the live log actually emits, plus any future compaction hook.
const BOUNDARY_TYPES = /session_?start|command_center_(server_)?started|command_center_started|compact|compaction|summariz|context_(trim|prune|reset)|memory_(flush|compact)/i;
const COMPACT_TYPES = /compact|compaction|summariz|context_(trim|prune|reset)|memory_(flush|compact)/i;

export function render(ctx) {
  const { h, ui, fmt } = ctx;
  const s = ctx.state || {};
  const events = Array.isArray(ctx.events) ? ctx.events : [];
  const agents = Array.isArray(s.agents) ? s.agents : [];

  // ---------------------------------------------------------------- idempotent CSS (tokens only)
  if (!document.getElementById("st-context-reactor")) {
    document.head.append(h("style", { id: "st-context-reactor" }, `
      .cr-core { position: relative; display:flex; flex-direction:column; align-items:center; gap:10px;
        padding: var(--sp-5); border:1px dashed var(--city-line-strong); border-radius: var(--r-xl);
        background:
          radial-gradient(220px 220px at 50% 40%, var(--city-mint), transparent 70%),
          linear-gradient(180deg, var(--city-cream-0), var(--city-cream-50)); }
      .cr-ring { width:132px; height:132px; border-radius:50%; position:relative;
        border:2px solid var(--city-line-strong);
        background: radial-gradient(circle, var(--city-cream-0), var(--city-mint)); }
      .cr-ring::before { content:""; position:absolute; inset:13px; border-radius:50%; border:1px solid var(--city-line); }
      .cr-ring::after { content:""; position:absolute; inset:0; border-radius:50%;
        background: conic-gradient(from 0deg, rgba(60,147,97,.30), transparent 30%); animation: sweep 6s linear infinite; }
      .cr-ring .cr-core-label { position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; text-align:center; gap:2px; }
      .cr-ring .cr-core-label .g { font-size:24px; }
      .cr-ring .cr-core-label .t { font-family:var(--font-mono); font-size:9.5px; letter-spacing:.12em;
        text-transform:uppercase; color:var(--city-ink-muted); }
      .cr-fuel { display:flex; flex-direction:column; gap:6px; width:100%; }
      .cr-fuel-rod { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:var(--r-sm);
        border:1px solid var(--city-line); background:var(--city-cream-0); }
      .cr-fuel-rod.lit { border-left:4px solid var(--city-turf); background: linear-gradient(180deg,#eef7ef,#dcefe3); }
      .cr-fuel-rod .ord { font-family:var(--font-mono); font-size:10.5px; color:var(--city-ink-muted); width:22px; flex:none; }
      .cr-fuel-rod .nm { font-weight:700; font-size:12.5px; flex:1; min-width:0; }
      .cr-cap { padding:9px 11px; border-radius:var(--r-sm); border:1px solid var(--city-line);
        border-left:4px solid var(--city-gold); background: linear-gradient(180deg,#fbf3df,#f3e7c8); }
      .cr-cap.decision { border-left-color: var(--city-turf); background: linear-gradient(180deg,#eef7ef,#dcefe3); }
      .cr-cap .ch { display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
      .cr-cap .ch .ct { font-weight:700; font-size:12.5px; }
      .cr-cap .ch .cw { font-family:var(--font-mono); font-size:10px; color:var(--city-ink-muted); white-space:nowrap; }
      .cr-cap .cb { font-size:11.5px; color:var(--city-ink-muted); margin-top:3px; }
      .cr-load { display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--city-line); }
      .cr-load:last-child { border-bottom:none; }
      .cr-load .lbl { font-weight:700; font-size:12.5px; min-width:0; }
      .cr-load .bar { flex:1; height:8px; border-radius:6px; background:var(--city-mint); overflow:hidden; }
      .cr-load .bar > i { display:block; height:100%; border-radius:6px;
        background: linear-gradient(90deg, var(--city-turf), #2f7a4e); }
      .cr-load .cnt { font-family:var(--font-mono); font-size:11px; color:var(--city-ink-muted); width:64px; text-align:right; }
      @media (prefers-reduced-motion: reduce) { .cr-ring::after { animation:none; } }
    `));
  }

  // ================================================================ PLAN-READ cycle (real, from events)
  const planStarts = events.filter((e) => e && PLAN_START.test(String(e.type || "")));
  const planDones = events.filter((e) => e && PLAN_DONE.test(String(e.type || "")));
  const planStartedAt = planStarts.length ? planStarts[0].ts : null;
  const planDoneAt = planDones.length ? planDones[planDones.length - 1].ts : null;
  const planRead = planDones.length > 0;
  const planPct = planRead ? 100 : (planStarts.length ? 50 : 0);

  // read_order = the "fuel" loaded as working context (state first, handoff fallback)
  const readOrder = (Array.isArray(s.read_order) && s.read_order.length)
    ? s.read_order
    : (Array.isArray(s.handoff?.read_order) ? s.handoff.read_order : []);

  // ================================================================ CONTEXT LOAD (real, from the live event stream)
  // The event log does NOT carry file paths, so a file-revisit proxy would be permanently
  // empty (and was, in the prior version). What the stream DOES carry is agent + packet on
  // every event — the true signal for "where is context concentrated right now." We measure
  // that instead, honestly: the lanes and work-streams generating the most context churn.
  const byAgent = new Map();   // agent id -> event count
  const byPacket = new Map();  // packet id -> event count
  for (const e of events) {
    if (!e) continue;
    const a = String(e.agent || "").trim();
    if (a) byAgent.set(a, (byAgent.get(a) || 0) + 1);
    const p = String(e.packet || "").trim();
    if (p) byPacket.set(p, (byPacket.get(p) || 0) + 1);
  }
  const agentLoad = [...byAgent.entries()].sort((a, b) => b[1] - a[1]);
  const packetLoad = [...byPacket.entries()].sort((a, b) => b[1] - a[1]);
  const agentLoadMax = agentLoad.length ? agentLoad[0][1] : 0;
  const packetLoadMax = packetLoad.length ? packetLoad[0][1] : 0;
  const hottestPacket = packetLoad.length ? packetLoad[0] : null;

  // ================================================================ CONTEXT BOUNDARIES (real / honest-empty)
  // Moments the working context was (re)seeded or trimmed: session starts, server (re)starts,
  // and any compaction event a future hook emits. These bound the windows of continuous context.
  const boundaries = events.filter((e) => e && BOUNDARY_TYPES.test(String(e.type || "")));
  const compactions = events.filter((e) => e && COMPACT_TYPES.test(String(e.type || "")));
  const lastBoundaryAt = boundaries.length ? boundaries[boundaries.length - 1].ts : null;
  // events accumulated since the last boundary = a live proxy for current context-window depth
  const sinceBoundary = lastBoundaryAt
    ? events.filter((e) => e && e.ts && new Date(e.ts) >= new Date(lastBoundaryAt)).length
    : events.length;

  // ================================================================ LIVE AGENT FUEL (real, from state.agents)
  // Queue depth + heartbeat freshness = a live read on which lanes are actively holding context.
  const now = Date.now();
  const STALE_MS = 1000 * 60 * 30; // 30 min without an update = heartbeat considered stale
  const activeAgents = agents.filter((a) => a && a.status === "active");
  const liveBeats = agents.filter((a) => {
    if (!a) return false;
    const ts = a.last_update ? new Date(a.last_update).getTime() : 0;
    return a.heartbeat === "live" && ts && (now - ts) < STALE_MS;
  });
  const totalQueue = agents.reduce((n, a) => n + (Number(a && a.queue_depth) || 0), 0);

  // ================================================================ MILESTONE capsules (real)
  const notes = Array.isArray(s.handoff?.notes) ? s.handoff.notes : [];
  const decisions = Array.isArray(s.decisions) ? s.decisions : [];
  const capsules = [
    ...notes.map((n) => ({
      title: "Handoff note",
      body: String((n && n.text) || ""),
      when: n && n.ts ? n.ts : null,
      kind: "handoff",
    })),
    ...decisions.map((d) => ({
      title: (d && d.title) || "Decision",
      body: String((d && d.decision) || (d && d.rationale) || ""),
      when: d && d.created_at ? d.created_at : null,
      kind: "decision",
    })),
  ].filter((c) => c.body)
    .sort((a, b) => (new Date(b.when || 0)) - (new Date(a.when || 0)));

  // ================================================================ TOP STAT BAND (only measured facts)
  const band = ui.grid("c4", [
    ui.stat({
      label: "Token / context window",
      value: "n/a",
      sub: "needs OTel or CC hooks",
      tone: "warn",
    }),
    ui.stat({
      label: "Plan-read cycle",
      value: planRead ? "complete" : (planStarts.length ? "in progress" : "not started"),
      sub: planDoneAt ? `locked ${fmt.ago(planDoneAt)}` : (planStartedAt ? `started ${fmt.ago(planStartedAt)}` : "no plan reads logged"),
      tone: planRead ? "ok" : (planStarts.length ? "info" : "idle"),
    }),
    ui.stat({
      label: "Context depth (proxy)",
      value: events.length ? fmt.num(sinceBoundary) : "n/a",
      sub: events.length
        ? (lastBoundaryAt ? `events since reseed ${fmt.ago(lastBoundaryAt)}` : `${fmt.num(events.length)} total, no boundary`)
        : "no events logged",
      tone: !events.length ? "idle" : (sinceBoundary >= 240 ? "warn" : "info"),
    }),
    ui.stat({
      label: "Live lanes",
      value: agents.length ? `${liveBeats.length}/${agents.length}` : "n/a",
      sub: agents.length ? `${activeAgents.length} active · ${totalQueue} queued` : "no agents seeded",
      tone: !agents.length ? "idle" : (liveBeats.length ? "ok" : "warn"),
    }),
  ]);

  // ================================================================ REACTOR CORE — token honesty front-and-center
  const reactorCore = ui.panel({
    glyph: "🜂",
    title: "Reactor core — context / token honesty",
    sub: "measured vs. unavailable",
    lift: true,
    actions: ui.badge("TOKENS UNAVAILABLE", "warn"),
    body: h("div", { class: "stack" },
      h("div", { class: "cr-core" },
        h("div", { class: "cr-ring" },
          h("div", { class: "cr-core-label" },
            h("span", { class: "g" }, "🜂"),
            h("span", { class: "t" }, "no telemetry"))),
        h("div", { class: "muted", style: { textAlign: "center", maxWidth: "54ch", fontSize: "12.5px" } },
          "Token counts, context-window fill and prompt-cache hit rate are not reported to this command center — they need OpenTelemetry spans or a Claude Code hook that posts usage. The reactor refuses to invent them, and shows real proxies from the live event stream instead."),
        h("div", { class: "row wrap gap2", style: { justifyContent: "center" } },
          ui.badge("tokens used: n/a", "idle"),
          ui.badge("context fill: n/a", "idle"),
          ui.badge("cache hit: n/a", "idle"))),
      ui.section("Real proxies measured below"),
      ui.rows([
        ui.listRow([ui.dot(planRead ? "ok" : (planStarts.length ? "warn" : "idle")), h("span", { class: "grow" },
          `Plan-read cycle — ${planRead ? "complete" : (planStarts.length ? "started, not locked" : "no reads logged")} (from plan_read_* events)`)]),
        ui.listRow([ui.dot(readOrder.length ? "ok" : "idle"), h("span", { class: "grow" },
          `Fuel loaded — ${readOrder.length ? readOrder.length + " specs in the read order" : "no read order declared"}`)]),
        ui.listRow([ui.dot(agentLoad.length ? "info" : "idle"), h("span", { class: "grow" },
          `Context load — ${agentLoad.length ? agentLoad.length + " lanes / " + packetLoad.length + " work-streams generating context" : "no agent/packet signal in events"}`)]),
        ui.listRow([ui.dot(boundaries.length ? "info" : "idle"), h("span", { class: "grow" },
          `Context boundaries — ${boundaries.length ? boundaries.length + " reseed / session markers" : "none observed"}`)]),
        ui.listRow([ui.dot(capsules.length ? "ok" : "idle"), h("span", { class: "grow" },
          `Milestone capsules — ${capsules.length ? capsules.length + " from handoff + decisions" : "none recorded yet"}`)]),
      ]),
      h("div", { class: "muted", style: { fontSize: "11px" } },
        "To light the live gauges: emit OTel context spans or a Claude Code PostToolUse/Stop hook that POSTs token usage to /api/events.")),
  });

  // ================================================================ FUEL LOADED — read order
  const fuelPanel = ui.panel({
    glyph: "⛽",
    title: "Fuel loaded — spec read order",
    sub: planRead ? "mission contract locked from this stack" : "stack declared; read cycle not yet complete",
    actions: ui.badge(planRead ? "PLAN READ ✓" : (planStarts.length ? "READING…" : "NOT STARTED"), planRead ? "ok" : (planStarts.length ? "active" : "idle")),
    body: h("div", { class: "stack" },
      ui.progress(planPct, {
        label: "Plan-read cycle",
        right: planRead ? "complete" : (planStarts.length ? "started, not locked" : "no reads logged"),
      }),
      readOrder.length
        ? h("div", { class: "cr-fuel" }, readOrder.map((r, i) =>
            h("div", { class: "cr-fuel-rod" + (planRead ? " lit" : "") },
              h("span", { class: "ord" }, String(i + 1).padStart(2, "0")),
              h("span", { class: "nm truncate" }, String(r)),
              i === 0 ? ui.badge("newest", "active") : (i === readOrder.length - 1 ? ui.badge("oldest", "idle") : null))))
        : ui.empty({ glyph: "⛽", title: "No read order declared", hint: "state.read_order / handoff.read_order is empty — nothing has been loaded as context fuel yet." })),
  });

  // ================================================================ CONTEXT LOAD BY LANE — agent event share
  const laneRow = (id, n, max) => {
    const ag = agents.find((a) => a && a.id === id);
    const label = ag && ag.name ? ag.name : id;
    const pct = max ? Math.round((n / max) * 100) : 0;
    return h("div", { class: "cr-load" },
      h("span", { class: "lbl truncate", style: { width: "150px" } }, label),
      h("div", { class: "bar" }, h("i", { style: { width: `${Math.max(4, pct)}%` } })),
      h("span", { class: "cnt" }, `${fmt.num(n)} ev`));
  };
  const lanePanel = ui.panel({
    glyph: "🧠",
    title: "Context load by lane",
    sub: "who is carrying the most context — agent share of the event stream",
    actions: agentLoad.length
      ? h("button", { class: "btn sm ghost", onClick: () => ctx.go && ctx.go("agent-tower") }, "Agent Tower")
      : ui.badge("no signal", "idle"),
    body: agentLoad.length
      ? h("div", { class: "scroll-y maxh-360" }, agentLoad.slice(0, 13).map(([id, n]) => laneRow(id, n, agentLoadMax)))
      : ui.empty({
          glyph: "🧠",
          title: "No lane signal in the event log",
          hint: "Events here don't carry an agent yet. Once agents tag their build events, context load per lane lights up.",
        }),
  });

  // ================================================================ CONTEXT LOAD BY WORK-STREAM — packet event share
  const packetPanel = ui.panel({
    glyph: "🔁",
    title: "Context load by work-stream",
    sub: "hottest packets — a real proxy for where context churns",
    actions: hottestPacket
      ? ui.badge(`${hottestPacket[0]} ·${fmt.num(hottestPacket[1])}`, hottestPacket[1] >= 60 ? "warn" : "info")
      : ui.badge("no signal", "idle"),
    body: packetLoad.length
      ? h("div", { class: "scroll-y maxh-360" }, ui.rows(packetLoad.slice(0, 18).map(([id, n]) => {
          const tone = n >= 60 ? "risk" : n >= 25 ? "warn" : "info";
          return ui.listRow([
            ui.dot(tone),
            h("span", { class: "grow mono truncate", style: { fontSize: "11.5px" } }, id),
            ui.badge(`${fmt.num(n)} ev`, tone),
          ]);
        })))
      : ui.empty({
          glyph: "🔁",
          title: "No work-stream signal in the event log",
          hint: "Events here don't carry a packet yet. Once build events tag a work-packet, the hottest context streams surface.",
        }),
  });

  // ================================================================ CONTEXT BOUNDARIES — reseed timeline (honest-empty)
  const boundaryPanel = ui.panel({
    glyph: "🗜",
    title: "Context boundaries",
    sub: "session / reseed markers — windows of continuous context",
    actions: ui.badge(String(boundaries.length), boundaries.length ? "info" : "idle"),
    body: boundaries.length
      ? h("div", { class: "scroll-y maxh-280" }, h("div", { class: "tl" }, boundaries.slice().reverse().slice(0, 24).map((e) => {
          const isCompact = COMPACT_TYPES.test(String(e.type || ""));
          return h("div", { class: "node" },
            h("div", { class: "row between center wrap", style: { gap: "8px" } },
              h("span", { style: { fontWeight: "700", fontSize: "12.5px" } },
                String((e && e.title) || (e && e.type || "").replace(/_/g, " ") || "Boundary")),
              h("span", { class: "muted mono", style: { fontSize: "10.5px" } }, e && e.ts ? fmt.ago(e.ts) : "")),
            h("div", { class: "row gap2", style: { marginTop: "3px" } },
              ui.badge(isCompact ? "compaction" : "reseed", isCompact ? "warn" : "info"),
              (e && e.detail) ? h("span", { class: "muted", style: { fontSize: "11.5px" } }, String(e.detail)) : null));
        })))
      : ui.empty({
          glyph: "🗜",
          title: "No context boundaries observed",
          hint: "No session-start, server-restart or compaction events have been logged. Honest-empty — these mark every reseed of the working context.",
        }),
  });

  // ================================================================ MILESTONE CAPSULES
  const capsulePanel = ui.panel({
    glyph: "🧭",
    title: "Milestone capsules",
    sub: "checkpoints — handoff notes + decisions",
    actions: capsules.length
      ? h("button", { class: "btn sm ghost", onClick: () => ctx.go && ctx.go("decision-ledger") }, "Decision Ledger")
      : ui.badge("0", "idle"),
    body: capsules.length
      ? h("div", { class: "scroll-y maxh-360", style: { display: "flex", flexDirection: "column", gap: "8px" } },
          capsules.slice(0, 16).map((c) =>
            h("div", { class: "cr-cap" + (c.kind === "decision" ? " decision" : "") },
              h("div", { class: "ch" },
                h("span", { class: "ct truncate" }, c.title),
                h("span", { class: "cw" }, [
                  c.kind === "decision" ? "decision" : "handoff",
                  c.when ? " · " + fmt.ago(c.when) : "",
                ].join(""))),
              h("div", { class: "cb" }, c.body))))
      : ui.empty({
          glyph: "🧭",
          title: "No milestone capsules yet",
          hint: "Capsules fill from the handoff ledger notes and recorded decisions as the build progresses.",
        }),
  });

  // ================================================================ BUILD OUTPUT — lines of code written (real, git-based)
  const loc = s.loc || { total: 0, files: 0, byCategory: [] };
  const locCats = Array.isArray(loc.byCategory) ? loc.byCategory : [];
  const locPanel = ui.panel({
    glyph: "🧱",
    title: "Build output — lines of code written",
    sub: "git-based · BaseballHelm footprint (excludes vendored PixiJS, docs & data)",
    lift: true,
    actions: ui.badge(`${fmt.num(loc.total)} lines`, loc.total ? "ok" : "idle"),
    body: h("div", { class: "stack" },
      ui.grid("c3", [
        ui.stat({ label: "Lines of code", value: fmt.num(loc.total), sub: `across ${fmt.num(loc.files)} files`, tone: loc.total ? "ok" : "idle" }),
        ui.stat({ label: "Files", value: fmt.num(loc.files), sub: "new + modified", tone: "info" }),
        ui.stat({ label: "Areas", value: locCats.length, sub: "with code written", tone: "info" }),
      ]),
      locCats.length
        ? ui.rows(locCats.map((c) => {
            const pctOfTotal = loc.total ? Math.round((c.lines / loc.total) * 100) : 0;
            return h("div", { class: "list-row" },
              h("span", { class: "grow", style: { fontWeight: "600", fontSize: "12.5px" } }, c.key),
              h("span", { class: "muted mono", style: { fontSize: "11px", width: "56px", textAlign: "right" } }, `${fmt.num(c.files)}f`),
              h("div", { style: { width: "150px" } }, ui.progress(pctOfTotal, { tone: "gold", right: fmt.num(c.lines) })));
          }))
        : ui.empty({ glyph: "🧱", title: "No code counted yet", hint: "Lines appear here as build files land — updates live as the waves write code." }),
      h("div", { class: "muted", style: { fontSize: "11px" } }, loc.generated_at ? `Counted ${fmt.ago(loc.generated_at)} · refreshes ~every 15s` : "Live, git-based count.")),
  });

  // ================================================================ assemble
  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "🜂",
      title: "Context Reactor",
      sub: "Observatory · honest context / memory state — never invented",
      actions: [
        ui.pill("tokens n/a", { dot: true, tone: "active" }),
        ui.badge(planRead ? "plan read ✓" : "plan read …", planRead ? "ok" : "warn"),
        h("button", { class: "btn sm ghost", onClick: () => ctx.refresh && ctx.refresh() }, "Refresh"),
      ],
    }),
    band,
    locPanel,
    reactorCore,
    ui.grid("c2", [fuelPanel, lanePanel]),
    ui.grid("c2", [packetPanel, boundaryPanel]),
    capsulePanel,
  );
}
