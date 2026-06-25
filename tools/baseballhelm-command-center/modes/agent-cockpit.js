/* Agent Cockpit — deep-dive into ONE agent lane in the Agent Residential Tower.
   Everything below is derived from LIVE ctx telemetry — never hardcoded:
     · identity / status / heartbeat / queue / freshest note  → ctx.state.agents[]
     · owned work packets (progress, confidence, stage, blocks) → ctx.state.packets[]  (owner_lane === agent.id)
     · activity trail, event-type mix, last-seen, progress pings → ctx.events[]        (agent === agent.id)
     · risk events attributed to the lane                        → ctx.state.risks.cards
     · decisions authored by the lane                            → ctx.state.decisions
   Pick from ctx.args.agent, else first active, else first.
   Honest ui.empty() for every missing slice. Cream/green tokens only — no black. */
export const meta = { label: "Agent Cockpit", district: "Agent Residential Tower" };

const STATUS_TONE = { active: "active", done: "ok", blocked: "risk", planned: "info", idle: "idle" };
const PKT_TONE = { active: "active", done: "ok", blocked: "risk", planned: "info", idle: "idle" };
const SEV_RANK = { critical: 4, high: 3, medium: 2, warn: 2, low: 1, info: 0 };

// heartbeat truthiness (string "live"/"active" or boolean), defensive
function beats(a) {
  const hb = a && a.heartbeat;
  if (hb === true) return true;
  if (typeof hb === "string") return /^(live|active|on|beating)$/i.test(hb);
  return (a && a.status) === "active";
}

export function render(ctx) {
  const { h, ui, fmt, state, events } = ctx;
  const s = state || {};
  const agents = Array.isArray(s.agents) ? s.agents : [];

  injectCss(ctx);

  // ---- honest empty: no roster at all
  if (!agents.length) {
    return h("div", { class: "stack" },
      ui.modeHead({ glyph: "🛰", title: "Agent Cockpit",
        sub: "Agent Residential Tower — single-agent deep dive",
        actions: ui.badge("No agents", "idle") }),
      ui.panel({ glyph: "🛰", title: "Agent roster",
        body: ui.empty({ glyph: "🛰", title: "No agents registered yet",
          hint: "Agents appear here once the build roster is seeded into /api/state → agents." }) }));
  }

  // ---- select the agent: args -> first active -> first
  const wanted = ctx.args && ctx.args.agent;
  const a = (wanted && agents.find((g) => g && g.id === wanted)) ||
    agents.find((g) => g && g.status === "active") ||
    agents[0] || {};
  const aid = a.id;
  const active = beats(a);
  const statusTone = STATUS_TONE[a.status] || "info";
  const focus = Array.isArray(a.focus) ? a.focus : [];

  // ---- LIVE: owned work packets (link by owner_lane)
  const allPackets = Array.isArray(s.packets) ? s.packets : [];
  const owned = allPackets.filter((p) => p && p.owner_lane === aid);
  const ownedDone = owned.filter((p) => p.status === "done");
  const ownedActive = owned.filter((p) => p.status === "active");
  const ownedBlocked = owned.filter((p) => p.status === "blocked");
  const ownedProg = owned.length ? ctx.weightedProgress(owned) : 0;
  const ownedConf = owned.length ? ctx.weightedConfidence(owned) : 0;
  // sort: blocked > active > planned > done, then most-recently-updated
  const PKT_RANK = { blocked: 0, active: 1, planned: 2, idle: 3, done: 4 };
  const ownedSorted = owned.slice().sort((x, y) => {
    const rx = PKT_RANK[x.status] ?? 9, ry = PKT_RANK[y.status] ?? 9;
    if (rx !== ry) return rx - ry;
    return new Date(y.updated_at || 0) - new Date(x.updated_at || 0);
  });

  // ---- LIVE: this agent's event trail
  const myEvents = (Array.isArray(events) ? events : []).filter((e) => e && e.agent === aid);
  const myEventsDesc = myEvents.slice().reverse();
  const lastEvent = myEventsDesc[0] || null;
  const firstEvent = myEvents[0] || null;
  // event-type histogram
  const typeMix = {};
  for (const e of myEvents) { const t = e.type || "event"; typeMix[t] = (typeMix[t] || 0) + 1; }
  const typeMixSorted = Object.entries(typeMix).sort((x, y) => y[1] - x[1]);
  // progress pings — events that carry a real pct
  const pcts = myEvents.filter((e) => Number.isFinite(e.pct));
  const lastPct = pcts.length ? pcts[pcts.length - 1].pct : null;
  const fileChanges = typeMix["file_changed"] || 0;
  const testsPassed = typeMix["test_passed"] || 0;

  // ---- LIVE: risk + decision slices attributed to this lane
  const allRisks = (s.risks && Array.isArray(s.risks.cards)) ? s.risks.cards : [];
  const myRisks = allRisks
    .filter((r) => r && (r.agent === aid || r.owner === aid))
    .sort((x, y) => (SEV_RANK[y.level] || 0) - (SEV_RANK[x.level] || 0));
  const openMyRisks = myRisks.filter((r) => r.status !== "resolved");
  const myDecisions = (Array.isArray(s.decisions) ? s.decisions : [])
    .filter((d) => d && d.agent === aid)
    .sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0));

  // ====================================================================== UI

  // ---- agent selector strip (lit = active, clay rail = blocked)
  const selector = h("div", { class: "ac-chips" },
    agents.map((g) => {
      const on = g.id === aid;
      const gActive = beats(g);
      const el = h("button", {
        class: `ac-chip ${on ? "on" : ""}`,
        onClick: () => ctx.go("agent-cockpit", { agent: g.id }),
        title: `${g.role || g.id || "agent"} · ${g.district || ""}`,
      },
        h("span", { class: `ac-chip-dot ${gActive ? "live" : g.status === "blocked" ? "blocked" : "idle"}` }),
        h("span", {}, g.name || g.id || "agent"));
      el.dataset.status = g.status || "idle";
      return el;
    }));

  // ---- top stat band: all LIVE
  const stats = ui.grid("c4", [
    ui.stat({ label: "Status", value: (a.status || "—").toUpperCase(),
      sub: active ? `heartbeat ${a.heartbeat || "live"}` : (a.heartbeat || "no heartbeat"),
      tone: a.status === "active" ? "ok" : a.status === "blocked" ? "risk" : "info" }),
    ui.stat({ label: "Owned packets", value: owned.length ? `${ownedDone.length}/${owned.length}` : "—",
      sub: owned.length ? `${ownedActive.length} active · ${ownedBlocked.length} blocked` : "no packets owned",
      tone: ownedBlocked.length ? "risk" : owned.length ? "info" : "info" }),
    ui.stat({ label: "Lane progress", value: owned.length ? fmt.pct(ownedProg) : "—",
      sub: owned.length ? `${fmt.pct(ownedConf)} confidence` : "nothing claimed",
      tone: owned.length ? (ownedConf < ownedProg - 10 ? "warn" : "ok") : "info" }),
    ui.stat({ label: "Activity", value: fmt.num(myEvents.length),
      sub: lastEvent ? `last ${fmt.ago(lastEvent.ts)}` : "no events yet",
      tone: myEvents.length ? "info" : "info" }),
  ]);

  // ---- header / identity
  const header = ui.panel({
    glyph: "🛰", title: a.name || a.id || "Agent", sub: a.role || "", lift: true,
    actions: [
      ui.badge((a.status || "unknown").toUpperCase(), statusTone),
      ui.heartbeat(active),
    ],
    body: h("div", { class: "stack" },
      h("div", { class: "grid c3" },
        ui.kv("District", a.district || "—"),
        ui.kv("Heartbeat", a.heartbeat || "—"),
        ui.kv("Queue depth", String(Number(a.queue_depth) || 0)),
        ui.kv("Last update", fmt.ago(a.last_update)),
        ui.kv("Last event", lastEvent ? fmt.ago(lastEvent.ts) : "—"),
        ui.kv("Agent id", a.id || "—")),
      // freshest live note — the single most current signal the engine emits
      a.notes
        ? h("div", { class: "ac-note" },
            h("span", { class: "ac-note-tag" }, "NOW"),
            h("span", {}, String(a.notes)))
        : null),
  });

  // ---- owned work packets (LIVE from ctx.state.packets) — the lane's real workload
  const packetRow = (p) => {
    const tone = PKT_TONE[p.status] || "info";
    const prog = Number(p.completion_percent) || 0;
    const conf = Number(p.confidence_percent) || 0;
    const row = h("div", { class: "ac-pkt", onClick: () => ctx.go("factory-floor", { packet: p.id }), role: "button", tabindex: "0" },
      h("div", { class: "row between center wrap", style: { gap: "8px" } },
        h("div", { class: "row gap2 center", style: { minWidth: 0 } },
          ui.dot(tone === "active" ? "ok" : tone === "risk" ? "risk" : tone === "info" ? "info" : tone === "ok" ? "ok" : "idle"),
          h("b", { class: "truncate" }, p.title || p.short || p.id)),
        ui.badge((p.stage || p.status || "—").replace(/_/g, " "), tone)),
      ui.progress(prog, { tone: conf < prog - 10 ? "clay" : "gold",
        label: `${fmt.pct(prog)} built`, right: `${fmt.pct(conf)} conf` }),
      p.blocked_reason
        ? h("div", { class: "ac-block" }, h("span", { class: "ac-note-tag clay" }, "BLOCKED"), h("span", {}, String(p.blocked_reason)))
        : (p.weight != null
            ? h("div", { class: "muted", style: { fontSize: "11px" } }, `weight ${p.weight} · updated ${fmt.ago(p.updated_at)}`)
            : null));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.go("factory-floor", { packet: p.id }); } });
    return row;
  };
  const packetsPanel = ui.panel({
    glyph: "📦", title: "Owned work packets",
    sub: owned.length ? `${owned.length} on this lane` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("factory-floor") }, "Open Factory Floor"),
    body: owned.length
      ? h("div", { class: "stack" },
          h("div", { class: "scroll-y maxh-360" }, ui.rows(ownedSorted.map(packetRow))))
      : ui.empty({ glyph: "📦", title: "No packets owned by this lane",
          hint: "Work packets whose owner_lane is this agent surface here. None assigned right now." }),
  });

  // ---- current focus / plan (LIVE from agent.focus)
  const planPanel = ui.panel({
    glyph: "🎯", title: "Declared focus",
    sub: focus.length ? `${focus.length} item${focus.length === 1 ? "" : "s"}` : "",
    body: focus.length
      ? h("div", { class: "row wrap gap2" }, focus.map((f) => ui.pill(String(f))))
      : ui.empty({ glyph: "🎯", title: "No focus declared",
          hint: "A lane's focus areas populate here from the agent roster." }),
  });

  // ---- activity profile (LIVE, derived from this agent's events)
  const activityPanel = ui.panel({
    glyph: "📈", title: "Activity profile",
    sub: myEvents.length ? `${fmt.num(myEvents.length)} events` : "",
    body: myEvents.length
      ? h("div", { class: "stack" },
          ui.grid("c3", [
            ui.stat({ label: "File touches", value: fmt.num(fileChanges), sub: "file_changed", tone: "info" }),
            ui.stat({ label: "Tests passed", value: fmt.num(testsPassed), sub: testsPassed ? "test_passed events" : "none yet", tone: testsPassed ? "ok" : "info" }),
            ui.stat({ label: "Last progress", value: lastPct != null ? fmt.pct(lastPct) : "—", sub: lastPct != null ? "latest pct ping" : "no pct pings", tone: "info" }),
          ]),
          ui.section("Event mix"),
          h("div", { class: "row wrap gap2" }, typeMixSorted.map(([t, n]) =>
            ui.badge(`${t.replace(/_/g, " ")} · ${n}`, t.includes("test") ? "ok" : t.includes("risk") ? "risk" : "info"))),
          firstEvent
            ? h("div", { class: "muted", style: { fontSize: "11px", marginTop: "8px" } },
                `Span: first ${fmt.ago(firstEvent.ts)} → last ${fmt.ago(lastEvent.ts)}`)
            : null)
      : ui.empty({ glyph: "📈", title: "No activity recorded",
          hint: `No build events attributed to ${a.name || a.id || "this lane"} yet.` }),
  });

  // ---- tool calls & narrative (LIVE event stream for this agent, newest first)
  const toolCallsPanel = ui.panel({
    glyph: "🔧", title: "Activity trail",
    sub: myEventsDesc.length ? `${fmt.num(myEventsDesc.length)} events · newest first` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder", { agent: aid }) }, "Open Flight Recorder"),
    body: myEventsDesc.length
      ? h("div", { class: "scroll-y maxh-360" }, myEventsDesc.slice(0, 80).map(ui.eventRow))
      : ui.empty({ glyph: "🔧", title: "No activity yet",
          hint: `No build events attributed to ${a.name || a.id || "this agent"} so far.` }),
  });

  // ---- risk events for this lane (LIVE)
  const risksPanel = ui.panel({
    glyph: "⚑", title: "Risk events",
    sub: myRisks.length ? `${openMyRisks.length} open · ${myRisks.length} total` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "Open Control Tower"),
    body: myRisks.length
      ? h("div", { class: "stack" }, myRisks.map(ui.riskCard))
      : ui.empty({ glyph: "🛡", title: "No risk events for this lane",
          hint: "Risk cards naming this agent surface here. None attributed right now." }),
  });

  // ---- decisions authored by this lane (LIVE)
  const decisionsPanel = ui.panel({
    glyph: "⚖", title: "Decisions on record",
    sub: myDecisions.length ? `${myDecisions.length} authored` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("decision-ledger") }, "Open Decision Ledger"),
    body: myDecisions.length
      ? h("div", { class: "scroll-y maxh-280" }, ui.rows(myDecisions.map((d) =>
          h("div", { class: "ac-dec" },
            h("div", { class: "row between center wrap", style: { gap: "8px" } },
              h("b", { class: "truncate" }, d.title || "Decision"),
              h("span", { class: "muted mono", style: { fontSize: "10.5px" } }, fmt.ago(d.created_at))),
            d.decision ? h("div", { style: { fontSize: "12.5px", marginTop: "2px" } }, d.decision) : null,
            d.rationale ? h("div", { class: "muted", style: { fontSize: "11.5px", marginTop: "2px" } }, d.rationale) : null,
            d.impact ? h("div", { style: { marginTop: "4px" } }, ui.pill(`impact: ${d.impact}`, { tone: "info" })) : null))))
      : ui.empty({ glyph: "⚖", title: "No decisions authored by this lane",
          hint: "Architectural calls credited to this agent appear here as they're logged." }),
  });

  return h("div", { class: "stack" },
    ui.modeHead({ glyph: "🛰", title: "Agent Cockpit",
      sub: `${a.name || a.id || "Agent"} · ${a.district || "Agent Residential Tower"}`,
      actions: [
        ui.pill(`${agents.length} lanes`, { dot: true, tone: "active" }),
        ui.badge((a.status || "unknown").toUpperCase(), statusTone),
      ] }),
    ui.panel({ glyph: "🏢", title: "Select lane",
      sub: "Agent Residential Tower · click to deep-dive", body: selector }),
    stats,
    ui.grid("c2", [header, packetsPanel]),
    ui.grid("c2", [planPanel, activityPanel]),
    toolCallsPanel,
    ui.grid("c2", [risksPanel, decisionsPanel]),
  );
}

/* mode-specific CSS — idempotent, cream/green tokens only (no black, no edits to styles.css) */
function injectCss(ctx) {
  if (document.getElementById("st-agent-cockpit")) return;
  document.head.append(ctx.h("style", { id: "st-agent-cockpit" }, `
    .ac-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .ac-chip {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 6px 12px; border-radius: 999px; cursor: pointer;
      font: inherit; font-size: 12px; font-weight: 600; color: var(--city-ink);
      background: linear-gradient(180deg, rgba(255,253,246,.85), rgba(244,236,216,.6));
      border: 1px solid var(--city-line);
      transition: transform .16s, box-shadow .16s, border-color .16s, background .16s;
    }
    .ac-chip:hover { transform: translateY(-1px); box-shadow: var(--city-shadow-soft); border-color: var(--city-line-strong); }
    .ac-chip:focus-visible { outline: 2px solid var(--city-turf); outline-offset: 2px; }
    .ac-chip.on {
      color: var(--city-cream-0);
      background: linear-gradient(180deg, var(--city-turf), #2f7a4f);
      border-color: transparent; box-shadow: var(--city-shadow-soft);
    }
    .ac-chip[data-status="blocked"]:not(.on) { border-left: 3px solid var(--city-clay); }
    .ac-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--city-line-strong); flex: none; }
    .ac-chip-dot.live { background: var(--city-turf); box-shadow: 0 0 0 3px rgba(60,147,97,.18); }
    .ac-chip-dot.blocked { background: var(--city-clay); }
    .ac-chip.on .ac-chip-dot { background: var(--city-cream-0); box-shadow: none; }

    .ac-note {
      display: flex; align-items: flex-start; gap: 8px; margin-top: 10px;
      padding: 9px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.4;
      background: rgba(60,147,97,.08); border: 1px solid rgba(60,147,97,.22);
    }
    .ac-note-tag {
      flex: none; font-size: 9.5px; font-weight: 800; letter-spacing: .1em;
      padding: 2px 7px; border-radius: 6px; margin-top: 1px;
      color: var(--city-cream-0); background: var(--city-turf);
    }
    .ac-note-tag.clay { background: var(--city-clay); }

    .ac-pkt {
      padding: 11px 12px; border-radius: 13px; cursor: pointer;
      background: linear-gradient(180deg, rgba(255,253,246,.7), rgba(244,236,216,.45));
      border: 1px solid var(--city-line);
      display: flex; flex-direction: column; gap: 8px;
      transition: transform .16s, box-shadow .16s, border-color .16s;
    }
    .ac-pkt:hover { transform: translateY(-2px); box-shadow: var(--city-shadow-soft); border-color: var(--city-line-strong); }
    .ac-pkt:focus-visible { outline: 2px solid var(--city-turf); outline-offset: 2px; }
    .ac-block {
      display: flex; align-items: flex-start; gap: 8px; font-size: 11.5px; line-height: 1.4;
      color: #8a4e2c;
    }

    .ac-dec {
      padding: 10px 12px; border-radius: 12px;
      background: linear-gradient(180deg, rgba(255,253,246,.65), rgba(244,236,216,.4));
      border: 1px solid var(--city-line);
    }

    @media (prefers-reduced-motion: reduce) {
      .ac-chip:hover, .ac-pkt:hover { transform: none; }
    }
  `));
}
