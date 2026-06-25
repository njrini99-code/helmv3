/* Agent Tower — the Agent Residential Tower: a vertical stack of every agent
   lane as a rich, glanceable card, rendered ENTIRELY from live telemetry.

   Each card derives its activity from the LIVE event stream (ctx.events) and
   cross-links the work packets it owns (ctx.state.packets via owner_lane):
     · identity / role / district / heartbeat / live status
     · last activity time — taken from the agent's NEWEST event, not a stale seed
     · live counters — events logged, files changed, tests passed/failed
     · owned packets with their live completion % and stage
     · current focus + the agent's most recent build narrative
   Files/tables/routes touched fall back to the agent's static manifest only when
   the live stream has not yet surfaced them. Honest empty states everywhere;
   never fabricates work. Click a card → Agent Cockpit for that agent. */
export const meta = { label: "Agent Tower", district: "Agent Residential Tower" };

const STATUS_TONE = { active: "active", planned: "info", blocked: "risk", done: "ok", idle: "idle" };
const STATUS_RANK = { active: 0, blocked: 1, planned: 2, idle: 3, done: 4 };
const PKT_TONE = { active: "active", done: "ok", blocked: "risk", planned: "info", idle: "idle" };
// event types that represent a real repo edit by the reporting agent
const FILE_EVENT_TYPES = new Set(["file_changed", "migration_added", "table_touched", "route_touched"]);

export function render(ctx) {
  const { h, ui, fmt, state, events } = ctx;
  const s = state || {};
  const agents = Array.isArray(s.agents) ? s.agents.slice() : [];
  const allPackets = Array.isArray(s.packets) ? s.packets : [];
  const allEvents = Array.isArray(events) ? events : [];

  // ---- index live telemetry by agent id (single pass over the event stream)
  const liveByAgent = {};
  const liveById = (id) => (liveByAgent[id] ||= {
    count: 0, files: 0, testsPass: 0, testsFail: 0, lastTs: null, last: null, fileTitles: [],
  });
  for (const e of allEvents) {
    if (!e || !e.agent) continue;
    const L = liveById(e.agent);
    L.count += 1;
    if (FILE_EVENT_TYPES.has(e.type)) {
      L.files += 1;
      if (e.title) L.fileTitles.push(e.title);
    }
    if (e.type === "test_passed") L.testsPass += 1;
    if (e.type === "test_failed" || (e.severity === "high" && e.type === "test_run")) L.testsFail += 1;
    // chronological asc → last write wins as newest
    L.lastTs = e.ts || L.lastTs;
    L.last = e;
  }

  // ---- index owned packets by owner_lane (= agent id)
  const packetsByLane = {};
  for (const p of allPackets) {
    if (!p) continue;
    const lane = p.owner_lane || "orchestrator";
    (packetsByLane[lane] ||= []).push(p);
  }

  // ---- heartbeat truthiness (string "live"/"idle" or boolean), defensive
  const beats = (a) => {
    const hb = a && a.heartbeat;
    if (hb === true) return true;
    if (typeof hb === "string") return /^(live|active|on|beating)$/i.test(hb);
    return (a && a.status) === "active";
  };

  // ---- newest known activity for an agent: live event ts, else seed last_update
  const lastActivity = (a) => {
    const L = liveByAgent[a && a.id];
    return (L && L.lastTs) || (a && a.last_update) || null;
  };

  // ---- sort: active first, then blocked/planned/idle/done; tie-break by most-recent activity
  agents.sort((a, b) => {
    const ra = STATUS_RANK[a && a.status] ?? 9;
    const rb = STATUS_RANK[b && b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const ta = lastActivity(a), tb = lastActivity(b);
    if (ta && tb && ta !== tb) return new Date(tb) - new Date(ta);
    return String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
  });

  // ---- top band metrics (all live)
  const total = agents.length;
  const activeCount = agents.filter((a) => (a && a.status) === "active").length;
  const blockedCount = agents.filter((a) => (a && a.status) === "blocked").length;
  const totalQueue = agents.reduce((n, a) => n + (Number(a && a.queue_depth) || 0), 0);
  const liveEventCount = agents.reduce((n, a) => n + (liveByAgent[a && a.id]?.count || 0), 0);
  const liveFileCount = agents.reduce((n, a) => n + (liveByAgent[a && a.id]?.files || 0), 0);

  // busiest district by live event volume (fallback: most agents seated)
  const distEvents = {};
  const distAll = {};
  for (const a of agents) {
    const d = (a && a.district) || "Unassigned";
    distAll[d] = (distAll[d] || 0) + 1;
    distEvents[d] = (distEvents[d] || 0) + (liveByAgent[a && a.id]?.count || 0);
  }
  const pickTop = (map) => Object.entries(map).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1])[0];
  const busiestByEvents = pickTop(distEvents);
  const busiestBySeats = Object.entries(distAll).sort((x, y) => y[1] - x[1])[0];
  const busiest = busiestByEvents || busiestBySeats;
  const busiestIsLive = !!busiestByEvents;

  const band = ui.grid("c4", [
    ui.stat({ label: "Agents on shift", value: `${activeCount}/${total}`, sub: "active / total", tone: activeCount ? "ok" : "info" }),
    ui.stat({ label: "Blocked lanes", value: blockedCount, sub: blockedCount ? "need a clear" : "none blocked", tone: blockedCount ? "risk" : "ok" }),
    ui.stat({ label: "Live build events", value: fmt.num(liveEventCount), sub: `${fmt.num(liveFileCount)} repo edits logged`, tone: liveEventCount ? "info" : "idle" }),
    ui.stat({
      label: "Busiest district",
      value: busiest ? String(busiest[1]) : "—",
      sub: busiest ? `${busiest[0]} · ${busiestIsLive ? "events" : "seats"}` : "no agents seated",
      tone: "info",
    }),
  ]);

  // ---- small honest list helper: counts + first few items, or muted empty
  const touchList = (label, glyph, items, derivedNote) => {
    const arr = Array.isArray(items) ? items : [];
    const head = h("div", { class: "row between center", style: { marginBottom: "4px" } },
      h("span", { class: "muted", style: { fontSize: "10.5px", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: "700" } },
        `${glyph} ${label}`),
      ui.badge(String(arr.length), arr.length ? "info" : "idle"));
    const bodyNode = arr.length
      ? ui.rows(arr.slice(0, 4).map((f) =>
          ui.listRow([ui.dot("ok"), h("span", { class: "grow mono truncate", style: { fontSize: "11px" } }, String(f))])))
      : h("div", { class: "muted", style: { fontSize: "11px", padding: "2px 0" } }, "none yet");
    const more = arr.length > 4
      ? h("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "2px" } }, `+${arr.length - 4} more`)
      : null;
    const note = arr.length && derivedNote
      ? h("div", { class: "muted", style: { fontSize: "9.5px", letterSpacing: ".04em", marginTop: "2px" } }, derivedNote)
      : null;
    return h("div", { class: "stack", style: { gap: "4px" } }, head, bodyNode, more, note);
  };

  // ---- one agent card
  const card = (a) => {
    const ag = a || {};
    const id = ag.id;
    const st = ag.status || "idle";
    const active = beats(ag);
    const L = liveByAgent[id] || { count: 0, files: 0, testsPass: 0, testsFail: 0, lastTs: null, last: null, fileTitles: [] };

    // tests — prefer live event-derived pass/fail; fall back to the seed manifest
    const seedTests = ag.tests || {};
    const seedPass = Number(seedTests.passed) || 0;
    const seedFail = Number(seedTests.failed) || 0;
    const testsPass = L.testsPass || seedPass;
    const testsFail = L.testsFail || seedFail;
    const testsKnown = testsPass > 0 || testsFail > 0;

    const risk = Number(ag.risk_events) || 0;
    const queue = Number(ag.queue_depth) || 0;
    const focus = Array.isArray(ag.focus) ? ag.focus : [];

    // owned packets (live cross-link)
    const myPackets = (packetsByLane[id] || []).slice()
      .sort((p, q) => (PKT_TONE[p.status] === "active" ? -1 : 0) - (PKT_TONE[q.status] === "active" ? -1 : 0));
    const myDone = myPackets.filter((p) => p.status === "done").length;
    const myActive = myPackets.filter((p) => p.status === "active").length;

    // files touched: live event-derived titles win, else the seed manifest
    const liveFileTitles = Array.from(new Set(L.fileTitles));
    const seedFiles = Array.isArray(ag.files_touched) ? ag.files_touched : [];
    const filesShown = liveFileTitles.length ? liveFileTitles : seedFiles;
    const filesNote = liveFileTitles.length ? `from ${L.files} live edit event${L.files === 1 ? "" : "s"}` : (seedFiles.length ? "from manifest" : "");

    // tests chip — honest
    const testsNode = !testsKnown
      ? ui.badge("tests not run", "idle")
      : h("div", { class: "row gap2 center" },
          ui.badge(`${testsPass} pass`, testsPass ? "ok" : "idle"),
          ui.badge(`${testsFail} fail`, testsFail ? "risk" : "idle"));

    const headerActions = h("div", { class: "row gap2 center" },
      ui.heartbeat(active),
      ui.badge(st, STATUS_TONE[st] || "idle"));

    const last = L.last;

    const body = h("div", { class: "stack", style: { gap: "10px" } },
      // district + last LIVE activity line
      h("div", { class: "row between center wrap", style: { gap: "8px" } },
        ui.pill(ag.district || "Unassigned", { tone: active ? "active" : undefined }),
        h("span", { class: "muted mono", style: { fontSize: "10.5px" } },
          L.lastTs ? `active ${fmt.ago(L.lastTs)}` : (ag.last_update ? `updated ${fmt.ago(ag.last_update)}` : "no activity yet"))),

      // live counter strip — events / files / packets
      h("div", { class: "row gap2 wrap center" },
        ui.badge(`${fmt.num(L.count)} event${L.count === 1 ? "" : "s"}`, L.count ? "info" : "idle"),
        ui.badge(`${fmt.num(L.files)} edit${L.files === 1 ? "" : "s"}`, L.files ? "active" : "idle"),
        ui.badge(`${myPackets.length} packet${myPackets.length === 1 ? "" : "s"}`, myPackets.length ? "info" : "idle")),

      // current focus
      h("div", { class: "stack", style: { gap: "4px" } },
        ui.section("Current focus"),
        focus.length
          ? h("div", { class: "row wrap gap2" }, focus.map((f) => ui.pill(String(f))))
          : h("div", { class: "muted", style: { fontSize: "11.5px" } }, "no focus declared")),

      // owned packets with live completion
      h("div", { class: "stack", style: { gap: "6px" } },
        ui.section("Owned packets", myPackets.length
          ? h("span", { class: "muted mono", style: { fontSize: "10px" } }, `${myDone} done · ${myActive} active`)
          : null),
        myPackets.length
          ? h("div", { class: "stack", style: { gap: "8px" } }, myPackets.slice(0, 4).map((p) => {
              const pc = Math.max(0, Math.min(100, Number(p.completion_percent) || 0));
              return h("div", { class: "stack", style: { gap: "3px" } },
                h("div", { class: "row between center", style: { gap: "8px" } },
                  h("span", { class: "truncate", style: { fontSize: "11.5px", fontWeight: "600" } }, p.short || p.title || p.id),
                  ui.badge(p.status || "—", PKT_TONE[p.status] || "idle")),
                ui.progress(pc, { tone: p.status === "blocked" ? "clay" : "gold", right: fmt.pct(pc) }),
                p.blocked_reason
                  ? h("div", { class: "muted", style: { fontSize: "10.5px", fontStyle: "italic" } }, `blocked: ${p.blocked_reason}`)
                  : null);
            }))
          : h("div", { class: "muted", style: { fontSize: "11.5px" } }, "no packets assigned to this lane"),
        myPackets.length > 4
          ? h("div", { class: "muted mono", style: { fontSize: "10.5px" } }, `+${myPackets.length - 4} more`)
          : null),

      // touched lists — files live-derived, tables/routes from manifest
      ui.grid("c3", [
        touchList("files", "📄", filesShown, filesNote),
        touchList("tables", "🗄", ag.tables_touched),
        touchList("routes", "🛣", ag.routes_touched),
      ]),

      // bottom stat strip: tests / risk / queue
      h("div", { class: "row between center wrap", style: { gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--city-line)" } },
        h("div", { class: "row gap2 center" },
          h("span", { class: "muted", style: { fontSize: "10.5px", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: "700" } }, "Tests"),
          testsNode),
        h("div", { class: "row gap2 center" },
          ui.badge(`${risk} risk`, risk ? "risk" : "idle"),
          ui.badge(`${queue} queued`, queue ? "info" : "idle"))),

      // latest live narrative for this agent (from the event stream)
      last
        ? h("div", { class: "stack", style: { gap: "2px" } },
            h("span", { class: "muted", style: { fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: "700" } }, "Latest"),
            h("div", { style: { fontSize: "11.5px" } },
              h("span", { class: "mono muted", style: { fontSize: "10px" } }, `${(last.type || "event").replace(/_/g, " ")} · `),
              h("span", {}, last.title || "—")))
        : (ag.notes
            ? h("div", { class: "muted", style: { fontSize: "11.5px", fontStyle: "italic" } }, String(ag.notes))
            : null));

    const go = () => ctx.go("agent-cockpit", { agent: id });
    const panel = ui.panel({
      glyph: active ? "🟢" : "⚪",
      title: ag.name || id || "Unnamed agent",
      sub: ag.role || "",
      lift: st === "active",
      actions: headerActions,
      body,
    });
    panel.classList.add("agent-tower-card");
    panel.setAttribute("role", "button");
    panel.setAttribute("tabindex", "0");
    panel.dataset.status = st;
    panel.addEventListener("click", go);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
    return panel;
  };

  // ---- mode-specific CSS (idempotent, tokens only) — cursor + hover lift + focus ring
  if (!document.getElementById("st-agent-tower")) {
    document.head.append(ctx.h("style", { id: "st-agent-tower" }, `
      .agent-tower-card { cursor: pointer; transition: transform .2s, box-shadow .2s, border-color .2s; }
      .agent-tower-card:hover { transform: translateY(-3px); box-shadow: var(--city-shadow-lifted); border-color: var(--city-line-strong); }
      .agent-tower-card:focus-visible { outline: 2px solid var(--city-turf); outline-offset: 2px; }
      .agent-tower-card[data-status="active"] { border-left: 4px solid var(--city-turf); }
      .agent-tower-card[data-status="blocked"] { border-left: 4px solid var(--city-clay); }
      @media (prefers-reduced-motion: reduce) { .agent-tower-card:hover { transform: none; } }
    `));
  }

  // ---- the tower body
  const towerBody = agents.length
    ? ui.grid("auto", agents.map(card))
    : ui.empty({
        glyph: "🏢",
        title: "No agents seated in the tower",
        hint: "Agents appear here once the command center seeds the lane roster (/api/state → agents).",
      });

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "🏢",
      title: "Agent Tower",
      sub: `Agent Residential Tower · ${total} ${total === 1 ? "lane" : "lanes"}`,
      actions: [
        ui.pill(`${activeCount} on shift`, { dot: true, tone: activeCount ? "active" : undefined }),
        ui.pill(`${fmt.num(liveEventCount)} live events`, { tone: liveEventCount ? "info" : undefined }),
        h("button", { class: "btn sm ghost", onClick: () => ctx.refresh && ctx.refresh() }, "Refresh"),
      ],
    }),
    band,
    ui.panel({
      glyph: "🏗",
      title: "Lanes",
      sub: "active first · live telemetry per lane · click a card to open its cockpit",
      body: towerBody,
    }),
  );
}
