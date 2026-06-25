/* Factory Floor — the Shipping Dock district: a real PixiJS assembly line plus a
   fully LIVE production-control read-out. Crates (work packets) ride a running
   conveyor through six machine stations (Backlog→Ready→Build→Test→Review→Ship);
   the robotic arm works QA, sparks on active builds, smoke on blocked, a truck
   loads at Ship. Every number, crate, bottleneck, throughput tick, crew row and
   gate-tally below the canvas is derived from ctx.state / ctx.events at render —
   nothing is hardcoded. The Pixi scene lives in factory-engine.js (persistent
   singleton). DOM is built ONCE and updated in place so live ticks never remount
   the canvas (no flicker). Cream/green, honest empty states. */
export const meta = { label: "Factory Floor", district: "Shipping Dock" };

const STAGE_NAMES = ["Backlog", "Ready", "Build", "Test", "Review", "Ship"];
const STAGE_ICONS = ["▦", "▥", "⚒", "⚗", "◎", "⇪"];
// the 12-step QA gate that drives a packet's stage (factory-engine.stageOf)
const GATE_STEPS = [
  ["read_plan", "Read plan"],
  ["audited_current_repo", "Audited repo"],
  ["designed_contract", "Designed contract"],
  ["schema_ready", "Schema ready"],
  ["server_actions_ready", "Server actions"],
  ["ui_ready", "UI ready"],
  ["empty_loading_error_states_ready", "Empty / loading / error"],
  ["source_or_data_traceability_ready", "Data traceability"],
  ["role_visibility_ready", "Role visibility"],
  ["tests_run", "Tests run"],
  ["browser_verified", "Browser verified"],
  ["risks_resolved", "Risks resolved"],
];
// build events that count as throughput on the line
const SHIP_TYPES = new Set(["packet_completed", "packet_finished"]);

let MODE = null;
let stageOfFn = (p) => (p.status === "done" ? 5 : p.status === "planned" ? 0 : 2);

function injectCSS(h) {
  if (document.getElementById("st-factory-floor")) return;
  const css = `
    .ff-throughput{ display:grid; grid-template-columns: repeat(4,1fr); gap:10px; }
    @media(max-width:820px){ .ff-throughput{ grid-template-columns: repeat(2,1fr); } }
    .ff-tput{ background:linear-gradient(180deg, rgba(255,253,246,.85), rgba(244,236,216,.6));
      border:1px solid var(--city-line); border-radius:var(--r-md); padding:10px 12px; }
    .ff-tput .n{ font-family:var(--font-mono); font-size:20px; font-weight:800; color:var(--city-green-700); line-height:1; font-variant-numeric:tabular-nums; }
    .ff-tput .l{ font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--city-ink-muted); margin-top:5px; }
    .ff-bay-head{ display:flex; align-items:center; justify-content:space-between; gap:6px;
      padding:6px 9px; border-radius:8px 8px 4px 4px; margin-bottom:8px;
      background:linear-gradient(180deg, var(--city-green-700), var(--city-green-800)); color:var(--city-cream-50); }
    .ff-bay-head.lit{ background:linear-gradient(180deg, var(--city-turf), var(--city-green-600)); }
    .ff-bay-head .bt{ font-size:11px; font-weight:800; letter-spacing:.02em; }
    .ff-bay-head .bc{ font-family:var(--font-mono); font-size:11px; opacity:.85; }
    .ff-lanechip{ font-size:9.5px; font-family:var(--font-mono); padding:1px 6px; border-radius:999px;
      background:rgba(28,86,57,.08); border:1px solid var(--city-line); color:var(--city-ink-muted); }
    .ff-stuck{ display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:var(--r-md);
      border:1px solid var(--city-line); background:rgba(255,253,246,.7); }
    .ff-stuck .grow{ min-width:0; }
    .ff-crew{ display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:var(--r-md);
      border:1px solid var(--city-line); background:linear-gradient(180deg, rgba(255,253,246,.8), rgba(244,236,216,.45)); }
  `;
  document.head.append(h("style", { id: "st-factory-floor" }, css));
}

export async function render(ctx) {
  if (MODE) { await pumpEngine(ctx); MODE.fill(ctx); return MODE.node; }

  const { h, ui } = ctx;
  injectCSS(h);

  let stage;
  try {
    const eng = await import("../factory-engine.js");
    stageOfFn = eng.stageOf;
    stage = await eng.factoryView(ctx);
  } catch (err) {
    stage = ui.error("Could not start the assembly-line renderer", String(err && err.message || err));
    console.error("[factory-floor] engine failed", err);
  }

  const headActions = h("div", { class: "actions" });
  const bandHost = h("div");
  const throughputHost = h("div");
  const breakdownHost = h("div");
  const flowHost = h("div");
  const crewHost = h("div");

  const legend = h("div", { class: "iso-legend mt3" },
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-gold)" } }), "active crate (sparks)"),
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-clay)" } }), "blocked (smoke)"),
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-turf)" } }), "shipped (on the truck)"),
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-tan)" } }), "queued / backlog"));

  const node = h("div", { class: "stack" },
    ui.modeHead({
      glyph: "⚙",
      title: "Factory Floor",
      sub: "Shipping Dock — work packets ride the conveyor from Backlog to Ship. Stage is earned by the 12-step QA gate; sparks mean building, smoke means blocked, the truck loads at Ship.",
      actions: headActions,
    }),
    bandHost,
    ui.panel({ glyph: "🏭", title: "The production line", sub: "live · crates ride to their earned stage", lift: true, body: h("div", { class: "stack" }, stage, legend) }),
    ui.grid("c2", [
      ui.panel({ glyph: "📈", title: "Throughput & flow", sub: "from the build event stream", body: h("div", { class: "stack" }, throughputHost, flowHost) }),
      ui.panel({ glyph: "👷", title: "Line crew", sub: "agents staffing the stations", body: crewHost }),
    ]),
    ui.panel({ glyph: "📦", title: "Station breakdown", sub: "every crate, by station", body: breakdownHost }),
  );

  function fill(c) {
    const { h, ui, fmt } = c;
    const s = c.state || {};
    const packets = s.packets || [];
    const agents = s.agents || [];
    const events = c.events || [];

    // ---- buckets by earned stage
    const buckets = [[], [], [], [], [], []];
    packets.forEach((p) => buckets[stageOfFn(p)].push(p));
    const prog = c.weightedProgress(packets);
    const conf = c.weightedConfidence(packets);
    const shipped = buckets[5].length;
    const onLine = packets.filter((p) => p.status !== "done" && p.status !== "planned").length;
    const blocked = packets.filter((p) => p.status === "blocked");

    // ---- bottleneck = busiest in-flight station (Ready→Review)
    let bn = -1, mx = 0;
    for (let i = 1; i <= 4; i++) if (buckets[i].length > mx) { mx = buckets[i].length; bn = i; }

    // ---- confidence gap: crates that look advanced but the gate isn't earned
    const gapCrates = packets
      .filter((p) => p.status !== "done" && (Number(p.completion_percent) || 0) - (Number(p.confidence_percent) || 0) >= 25)
      .sort((a, b) => ((b.completion_percent - b.confidence_percent) - (a.completion_percent - a.confidence_percent)));

    // ============================================================ stat band
    bandHost.replaceChildren(ui.grid("c4", [
      ui.stat({ label: "On the line", value: onLine, sub: `${packets.length} packets total`, tone: "info" }),
      ui.stat({ label: "Build progress", value: fmt.pct(prog), sub: `confidence ${fmt.pct(conf)}`, tone: conf < prog - 15 ? "warn" : "ok" }),
      ui.stat({ label: "Shipped", value: `${shipped}/${packets.length}`, sub: shipped ? "loaded on the truck" : "nothing shipped yet", tone: shipped ? "ok" : "info" }),
      ui.stat({ label: "Blocked", value: blocked.length, sub: blocked.length ? "smoking on the belt" : "belt flowing", tone: blocked.length ? "risk" : "ok" }),
    ]));

    // ============================================================ head pills
    const warns = [];
    if (blocked.length) warns.push(ui.pill(`${blocked.length} blocked`, { tone: "risk", dot: true }));
    if (bn >= 0 && mx > 1) warns.push(ui.pill(`Bottleneck · ${STAGE_NAMES[bn]} (${mx})`, { tone: "warn", dot: true }));
    if (gapCrates.length) warns.push(ui.pill(`${gapCrates.length} unearned`, { tone: "warn", dot: true }));
    if (!warns.length) warns.push(ui.pill(packets.length ? "Line healthy — flowing" : "Line empty", { tone: packets.length ? "ok" : "idle", dot: true }));
    headActions.replaceChildren(
      h("div", { class: "row gap2 wrap" }, ...warns),
      h("button", { class: "btn sm", onClick: () => c.go("control-tower") }, "Risks →"),
      h("button", { class: "btn sm", onClick: () => c.go("agent-city") }, "← Agent City"),
    );

    // ============================================================ throughput (events)
    const ship = events.filter((e) => SHIP_TYPES.has(e.type));
    const lastShip = ship.length ? ship[ship.length - 1] : null;
    const day = 86400000;
    const ship24 = ship.filter((e) => e.ts && Date.now() - new Date(e.ts).getTime() < day).length;
    const started = events.filter((e) => e.type === "packet_started").length;
    const fileTouches = events.filter((e) => e.type === "file_changed").length;
    const testsPassed = events.filter((e) => e.type === "test_passed").length;

    throughputHost.replaceChildren(h("div", { class: "ff-throughput" },
      h("div", { class: "ff-tput" }, h("div", { class: "n" }, fmt.num(ship.length)), h("div", { class: "l" }, "Shipped ever")),
      h("div", { class: "ff-tput" }, h("div", { class: "n" }, fmt.num(ship24)), h("div", { class: "l" }, "Shipped 24h")),
      h("div", { class: "ff-tput" }, h("div", { class: "n" }, fmt.num(testsPassed)), h("div", { class: "l" }, "Tests passed")),
      h("div", { class: "ff-tput" }, h("div", { class: "n" }, fmt.num(fileTouches)), h("div", { class: "l" }, "File touches")),
    ));

    // recently shipped + last-ship freshness
    const recentShipped = ship.slice(-5).reverse();
    const flow = h("div", { class: "stack" });
    flow.append(ui.section("Last off the belt", lastShip
      ? ui.pill(fmt.ago(lastShip.ts), { dot: true, tone: Date.now() - new Date(lastShip.ts).getTime() < day ? "ok" : "idle" })
      : null));
    if (recentShipped.length) {
      flow.append(h("div", { class: "scroll-y maxh-280" }, ui.rows(recentShipped.map((e) =>
        ui.listRow([
          ui.dot("ok"),
          h("span", { class: "grow truncate", style: { fontSize: "12px" } }, e.title || e.packet || "packet"),
          h("span", { class: "muted mono", style: { fontSize: "10.5px" } }, fmt.time(e.ts)),
        ])))));
    } else {
      flow.append(ui.empty({ glyph: "⇪", title: "Nothing shipped yet", hint: "packet_completed events load the truck as crates reach Ship." }));
    }
    // started but in-flight (WIP age signal)
    flow.append(ui.section("In flight", ui.pill(`${started} starts`, { tone: "info" })));
    flowHost.replaceChildren(flow);

    // ============================================================ line crew (agents)
    if (!agents.length) {
      crewHost.replaceChildren(ui.empty({ glyph: "👷", title: "No agents on the line", hint: "Agent lanes appear here from /api/state once staffed." }));
    } else {
      const sorted = agents.slice().sort((a, b) =>
        (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || (b.queue_depth || 0) - (a.queue_depth || 0));
      crewHost.replaceChildren(h("div", { class: "scroll-y maxh-360", style: { display: "grid", gap: "8px" } },
        sorted.map((a) => h("div", { class: "ff-crew" },
          ui.dot(a.status === "blocked" ? "risk" : a.status === "active" ? "ok" : a.status === "idle" ? "idle" : "warn"),
          h("div", { class: "grow", style: { minWidth: "0" } },
            h("div", { class: "row between center" },
              h("b", { class: "truncate", style: { fontSize: "12.5px" } }, a.name || a.id),
              ui.heartbeat(a.heartbeat === "live" || a.status === "active")),
            h("div", { class: "muted truncate", style: { fontSize: "10.5px" } }, `${a.role || "agent"} · ${a.district || "—"}`)),
          h("div", { class: "row gap2", style: { flexShrink: "0" } },
            (a.queue_depth || 0) > 0 ? h("span", { class: "ff-lanechip" }, `q ${a.queue_depth}`) : null,
            (a.risk_events || 0) > 0 ? ui.badge(`${a.risk_events}⚑`, "risk") : null,
            ui.badge(a.status || "—", a.status === "active" ? "active" : a.status === "blocked" ? "risk" : a.status === "done" ? "ok" : "idle")),
        ))));
    }

    // ============================================================ flow analysis row (bottleneck + unearned)
    const analysis = [];
    if (blocked.length) {
      analysis.push(ui.panel({ glyph: "🛑", title: "Blocked on the belt", sub: `${blocked.length}`,
        body: ui.rows(blocked.map((p) => h("div", { class: "ff-stuck" },
          ui.dot("risk"),
          h("div", { class: "grow" },
            h("b", { class: "truncate", style: { fontSize: "12px" } }, p.short || p.title),
            p.blocked_reason ? h("div", { class: "muted", style: { fontSize: "11px" } }, p.blocked_reason) : null),
          h("span", { class: "ff-lanechip" }, p.owner_lane || "—")))) }));
    }
    if (gapCrates.length) {
      analysis.push(ui.panel({ glyph: "⚖", title: "Looks shipped, not earned", sub: "gate vs surface progress",
        body: h("div", {},
          h("div", { class: "muted mb3", style: { fontSize: "11.5px" } }, "High completion but low confidence — the 12-step gate isn't done. These should not roll to Ship on appearance."),
          h("div", { class: "scroll-y maxh-280" }, ui.rows(gapCrates.slice(0, 8).map((p) => h("div", { class: "ff-stuck" },
            ui.dot("warn"),
            h("span", { class: "grow truncate", style: { fontSize: "12px" } }, p.short || p.title),
            h("span", { class: "muted mono", style: { fontSize: "10.5px" } }, `${fmt.pct(p.completion_percent)} / conf ${fmt.pct(p.confidence_percent)}`)))))) }));
    }

    // ============================================================ station breakdown (rich crates)
    const cells = buckets.map((list, i) => {
      const lit = i === bn || i === 5;
      const lanes = [...new Set(list.map((p) => p.owner_lane).filter(Boolean))];
      const body = list.length
        ? h("div", { class: "scroll-y maxh-360", style: { display: "grid", gap: "8px" } },
            list.slice(0, 24).map((p) => stationCrate(c, p)))
        : ui.empty({ glyph: STAGE_ICONS[i], title: "Empty station", hint: i === 0 ? "Nothing waiting in the backlog." : "No crates at this station." });
      return h("div", {},
        h("div", { class: `ff-bay-head ${lit ? "lit" : ""}` },
          h("span", { class: "bt" }, `${STAGE_ICONS[i]} ${STAGE_NAMES[i]}`),
          h("span", { class: "bc" }, String(list.length))),
        lanes.length ? h("div", { class: "row gap2 wrap mb3" }, lanes.slice(0, 4).map((l) => h("span", { class: "ff-lanechip" }, l))) : null,
        body);
    });

    breakdownHost.replaceChildren(
      analysis.length ? ui.grid("c2", analysis) : null,
      analysis.length ? h("div", { style: { height: "12px" } }) : null,
      packets.length
        ? ui.grid("c3", cells)
        : ui.empty({ glyph: "🏭", title: "The line is empty", hint: "Work packets stream in from /api/state and the build event log as agents pick up tasks." }),
    );
  }

  MODE = { node, fill };
  fill(ctx);
  return node;
}

// a single styled crate matching the .fcrate factory aesthetic — fully live
function stationCrate(c, p) {
  const { h, ui, fmt } = c;
  const state = p.status === "blocked" ? "blocked" : p.status === "done" ? "done" : p.status === "active" ? "active" : "";
  const ck = p.checklist || {};
  const gateDone = GATE_STEPS.filter(([k]) => ck[k]).length;
  const pct = Math.max(0, Math.min(100, Number(p.completion_percent) || 0));
  return h("div", { class: `fcrate ${state}`, style: { maxWidth: "none" } },
    h("div", { class: "row between center" },
      h("span", { class: "ct truncate", style: { minWidth: "0" } }, p.short || p.title || p.id),
      state === "blocked" ? ui.badge("blocked", "risk") : state === "done" ? ui.badge("shipped", "ok") : null),
    h("div", { class: "cm" },
      h("span", { class: "truncate", style: { minWidth: "0" } }, p.owner_lane || "—"),
      h("span", { class: "mono", style: { flexShrink: "0" } }, `${fmt.pct(pct)} · gate ${gateDone}/${GATE_STEPS.length}`)),
    h("div", { class: "cbar" }, h("i", { style: { width: `${pct}%` } })),
    p.blocked_reason ? h("div", { class: "cm", style: { color: "var(--city-clay)" } }, h("span", { class: "truncate" }, p.blocked_reason)) : null);
}

async function pumpEngine(ctx) {
  try { const eng = await import("../factory-engine.js"); await eng.factoryView(ctx); } catch {}
}
