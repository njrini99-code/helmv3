/* QA Lab — the test machines of the city, wired to LIVE telemetry only.
   Everything renders from ctx: qa checks (/api/state → qa), the qa-screens
   work packet + its 12-point Definition-of-Done checklist, the qa-visibility
   "QA Inspector" agent lane, and the real verification feed off ctx.events
   (test_passed / command_center_verified / risk_added). The chrome-verification
   machine is the Task 0 gate signal and gets top billing; failing machines and
   QA-blocking risks route to the Repair Bay with a cross-link to Control Tower.
   Honest states everywhere — never fabricate test results, counts, or runs. */
export const meta = { label: "QA Lab", district: "QA Lab" };

// map a qa check status -> dot state + badge tone (cream/green, no black)
const STATUS = {
  passed:   { dot: "ok",   badge: "ok",   light: "PASSED",  glyph: "🟢" },
  failed:   { dot: "risk", badge: "risk", light: "FAILED",  glyph: "🔴" },
  running:  { dot: "info", badge: "info", light: "RUNNING", glyph: "🟡" },
  not_run:  { dot: "idle", badge: "idle", light: "IDLE",    glyph: "⚪" },
};
const statusOf = (s) => STATUS[s] || STATUS.not_run;

// human label for a check id
const LABELS = {
  typecheck: "Typecheck",
  lint: "Lint",
  unit: "Unit tests",
  integration: "Integration",
  rls: "RLS policies",
  playwright: "Playwright e2e",
  screenshot: "Screenshots",
  a11y: "Accessibility",
  "role-visibility": "Role visibility",
  "chrome-verification": "Chrome verification",
};
const labelOf = (id) => LABELS[id] || (id || "check");

// 12-point packet checklist -> human label (Definition of Done for the QA lane)
const DOD = {
  read_plan: "Plan read",
  audited_current_repo: "Repo audited",
  designed_contract: "Contract designed",
  schema_ready: "Schema ready",
  server_actions_ready: "Server actions ready",
  ui_ready: "UI ready",
  empty_loading_error_states_ready: "Empty / loading / error states",
  source_or_data_traceability_ready: "Data traceability",
  role_visibility_ready: "Role visibility",
  tests_run: "Tests run",
  browser_verified: "Browser verified",
  risks_resolved: "Risks resolved",
};

// event types that belong on the QA verification feed
const QA_EVENT_TYPES = new Set(["test_passed", "command_center_verified", "test_failed", "risk_added"]);

export function render(ctx) {
  const { h, ui, fmt, state, events } = ctx;
  const s = state || {};
  const qa = s.qa || {};
  const checks = Array.isArray(qa.checks) ? qa.checks : [];
  const honest = qa.honest_states || s.honest_states || {};
  const allEvents = Array.isArray(events) ? events : [];

  // ----- aggregate roll-up (honest — counts only what's actually present)
  const passed = checks.filter((c) => c?.status === "passed").length;
  const failed = checks.filter((c) => c?.status === "failed").length;
  const running = checks.filter((c) => c?.status === "running").length;
  const notRun = checks.filter((c) => !c?.status || c.status === "not_run").length;
  const total = checks.length;
  const totalPassed = checks.reduce((n, c) => n + (Number(c?.passed) || 0), 0);
  const totalFailed = checks.reduce((n, c) => n + (Number(c?.failed) || 0), 0);
  const lastRunIso = checks
    .map((c) => c?.last_run)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  // chrome-verification = Task 0 gate signal. Reconcile against the real gate +
  // the command_center_verified event rather than the (often-0/0) check counts.
  const chrome = checks.find((c) => c?.id === "chrome-verification") || null;
  const verifyEvt = allEvents.filter((e) => e?.type === "command_center_verified").slice(-1)[0] || null;
  const gateVerified = !!s.task0_gate?.verified || chrome?.status === "passed" || !!verifyEvt;

  // failing checks -> repair bay
  const failures = checks.filter((c) => c?.status === "failed");

  // ----- the QA Lab's OWN work packet (district === "QA Lab")
  const packets = Array.isArray(s.packets) ? s.packets : [];
  const qaPacket =
    packets.find((p) => p?.district === "QA Lab") ||
    packets.find((p) => /qa/i.test(p?.id || "") || /qa/i.test(p?.owner_lane || "")) ||
    null;
  const dodEntries = qaPacket?.checklist
    ? Object.keys(DOD).map((k) => ({ key: k, label: DOD[k], done: !!qaPacket.checklist[k] }))
    : [];
  const dodDone = dodEntries.filter((d) => d.done).length;

  // ----- the QA Inspector lane (district === "QA Lab" agent)
  const agents = Array.isArray(s.agents) ? s.agents : [];
  const qaAgent =
    agents.find((a) => a?.id === qaPacket?.owner_lane) ||
    agents.find((a) => a?.district === "QA Lab") ||
    agents.find((a) => /qa/i.test(a?.id || "") || /qa/i.test(a?.role || "")) ||
    null;

  // ----- live verification feed off the event log (real runs, not synthetic)
  const qaFeed = allEvents
    .filter((e) => QA_EVENT_TYPES.has(e?.type) || /\bqa\b|verif/i.test(e?.agent || ""))
    .slice(-14)
    .reverse();
  const passEvents = allEvents.filter((e) => e?.type === "test_passed");

  // ----- QA-blocking risks (role/RLS/scope) — these gate the lane too
  const riskCards = Array.isArray(s.risks?.cards) ? s.risks.cards : [];
  const qaRisks = riskCards.filter(
    (r) =>
      r?.status !== "resolved" &&
      (["rls", "scope", "policy"].includes((r?.category || "").toLowerCase()) ||
        /rls|role|policy|visibilit|verif/i.test(r?.title || "")),
  );

  // ---- mode-specific CSS (idempotent, tokens only) — status lights + DoD chips
  if (!document.getElementById("st-qa-lab")) {
    document.head.append(
      h("style", { id: "st-qa-lab" }, `
        .qalab-machine { transition: transform .18s, box-shadow .18s, border-color .18s; }
        .qalab-machine[data-st="passed"] { border-left: 4px solid var(--city-turf); }
        .qalab-machine[data-st="failed"] { border-left: 4px solid var(--city-clay); }
        .qalab-machine[data-st="running"] { border-left: 4px solid var(--city-teal); }
        .qalab-machine[data-st="not_run"] { border-left: 4px solid var(--city-line-strong); }
        .qalab-machine:hover { transform: translateY(-2px); box-shadow: var(--city-shadow-lifted); }
        .qalab-dod { display: flex; flex-wrap: wrap; gap: 6px; }
        .qalab-dod .chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 999px;
          border: 1px solid var(--city-line); background: var(--city-cream-0); color: var(--city-ink-muted);
        }
        .qalab-dod .chip.is-done {
          border-color: var(--city-turf); background: var(--city-mint); color: var(--city-green-800);
        }
        .qalab-dod .chip .tick { font-size: 10px; }
        .qalab-gateline { height: 3px; border-radius: 999px; background: var(--city-line); overflow: hidden; }
        .qalab-gateline > i { display: block; height: 100%; background: var(--city-turf); }
        @media (prefers-reduced-motion: reduce) { .qalab-machine:hover { transform: none; } }
      `),
    );
  }

  // ---- top stat band (all live-derived)
  const stats = ui.grid("c4", [
    ui.stat({
      label: "Machines passing",
      value: total ? `${passed}/${total}` : "0/0",
      sub: total ? `${notRun} idle · ${running} running · ${failed} failed` : "no checks registered",
      tone: total && passed === total && !failed ? "ok" : failed ? "risk" : "info",
    }),
    ui.stat({
      label: "Assertions",
      value: totalPassed + totalFailed ? `${totalPassed}/${totalPassed + totalFailed}` : "—",
      sub: totalPassed + totalFailed ? `${totalFailed} failed assertions` : honest.tests || "No tests run yet",
      tone: totalFailed ? "warn" : totalPassed ? "ok" : "info",
    }),
    ui.stat({
      label: "Verifications logged",
      value: passEvents.length,
      sub: passEvents.length
        ? `latest ${fmt.ago(passEvents[passEvents.length - 1].ts)}`
        : "no verification events yet",
      tone: passEvents.length ? "ok" : "info",
    }),
    ui.stat({
      label: "Task 0 gate",
      value: gateVerified ? "OPEN" : "CLOSED",
      sub: verifyEvt ? `verified ${fmt.ago(verifyEvt.ts)}` : gateVerified ? "verified" : "awaiting Chrome verify",
      tone: gateVerified ? "ok" : "warn",
    }),
  ]);

  // ---- Task 0 gate machine (chrome-verification — PROMINENT)
  const gatePanel = ui.panel({
    glyph: gateVerified ? "✅" : "🧪",
    title: "Chrome verification — Task 0 gate machine",
    lift: true,
    sub: chrome?.command || "command center opened + verified in Chrome",
    actions: ui.badge(gateVerified ? "GATE OPEN" : "GATE CLOSED", gateVerified ? "ok" : "warn"),
    body: chrome || verifyEvt
      ? h("div", { class: "stack" },
          h("div", { class: "row between center wrap" },
            h("div", { class: "row center gap2" },
              ui.dot(gateVerified ? "ok" : statusOf(chrome?.status).dot),
              h("span", { style: { fontWeight: "700", fontSize: "15px" } }, gateVerified ? "VERIFIED" : statusOf(chrome?.status).light),
              ui.badge("chrome verification", "active")),
            h("div", { class: "qalab-gateline", style: { flex: "0 0 140px" } }, h("i", { style: { width: gateVerified ? "100%" : "0%" } }))),
          ui.kv("command_center_verified", verifyEvt ? `logged ${fmt.ago(verifyEvt.ts)}` : "not logged"),
          verifyEvt && verifyEvt.detail
            ? h("div", { class: "muted", style: { fontSize: "12px" } }, verifyEvt.detail)
            : null,
          ui.kv("Last run", chrome?.last_run ? fmt.ago(chrome.last_run) : verifyEvt ? fmt.ago(verifyEvt.ts) : "never run"),
          h("div", { class: "row gap2 mt2" },
            h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "Open Control Tower"),
            h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "View verification feed")),
          h("div", { class: "muted", style: { fontSize: "12.5px" } },
            gateVerified
              ? "Command center verified in Chrome — Task 0 gate is open; main BaseballHelm product work may proceed."
              : (chrome?.note || "Not yet verified in Chrome. No main BaseballHelm product work until this machine passes and command_center_verified is logged.")))
      : ui.empty({
          glyph: "🧪",
          title: "Chrome-verification machine not registered",
          hint: "The Task 0 gate signal appears here once the chrome-verification check is added to the QA harness.",
        }),
  });

  // ---- QA lane Definition of Done (from the live qa-screens packet checklist)
  const dodPanel = ui.panel({
    glyph: "✔",
    title: "QA Definition of Done",
    sub: qaPacket ? qaPacket.title : "no QA packet registered",
    actions: qaPacket
      ? [
          ui.badge(`${dodDone}/${dodEntries.length} met`, dodDone === dodEntries.length && dodEntries.length ? "ok" : "warn"),
          ui.badge(qaPacket.stage || qaPacket.status || "—", qaPacket.status === "blocked" ? "risk" : "active"),
        ]
      : null,
    body: qaPacket
      ? h("div", { class: "stack" },
          ui.progress(qaPacket.completion_percent || 0, {
            label: `Completion · confidence ${fmt.pct(qaPacket.confidence_percent || 0)}`,
            right: `${fmt.pct(qaPacket.completion_percent || 0)} built`,
          }),
          (qaPacket.confidence_percent || 0) < (qaPacket.completion_percent || 0) - 10
            ? h("div", { class: "muted", style: { fontSize: "12px" } },
                "Confidence trails completion — the lane is built but not yet earned by passing checks.")
            : null,
          dodEntries.length
            ? h("div", { class: "qalab-dod" }, dodEntries.map((d) =>
                h("span", { class: `chip ${d.done ? "is-done" : ""}` },
                  h("span", { class: "tick" }, d.done ? "✓" : "○"), d.label)))
            : ui.empty({ glyph: "✔", title: "No checklist on the QA packet" }),
          qaPacket.blocked_reason
            ? h("div", { class: "mt2", style: { fontSize: "12.5px", color: "var(--city-clay)" } },
                "Blocked: " + qaPacket.blocked_reason)
            : null,
          h("div", { class: "row between center mt2" },
            h("span", { class: "muted mono", style: { fontSize: "11px" } },
              qaPacket.updated_at ? `updated ${fmt.ago(qaPacket.updated_at)}` : ""),
            h("button", { class: "btn sm ghost", onClick: () => ctx.go("factory-floor") }, "Open in Factory Floor")))
      : ui.empty({
          glyph: "✔",
          title: "No QA work packet registered",
          hint: "The QA Lab's Definition-of-Done checklist appears here once a packet lands in the QA Lab district.",
        }),
  });

  // ---- QA Inspector lane (the agent that runs this district)
  const inspectorPanel = ui.panel({
    glyph: "🔬",
    title: "QA Inspector lane",
    sub: qaAgent ? qaAgent.role || qaAgent.name : "no QA lane staffed",
    actions: qaAgent
      ? [
          qaAgent.heartbeat === "live" || qaAgent.status === "active"
            ? ui.pill("live", { dot: true, tone: "active" })
            : ui.pill(qaAgent.status || "idle", { tone: "idle" }),
        ]
      : null,
    body: qaAgent
      ? h("div", { class: "stack" },
          h("div", { class: "row between center wrap" },
            h("div", { class: "row center gap2" }, ui.dot(qaAgent.status === "active" ? "ok" : "idle"),
              h("span", { style: { fontWeight: "700" } }, qaAgent.name || qaAgent.id)),
            ui.heartbeat(qaAgent.heartbeat === "live" || qaAgent.status === "active")),
          ui.kv("Queue depth", String(qaAgent.queue_depth ?? 0)),
          ui.kv("Tests", qaAgent.tests?.not_run
            ? "not run yet"
            : `${Number(qaAgent.tests?.passed) || 0} passed · ${Number(qaAgent.tests?.failed) || 0} failed`),
          ui.kv("Last update", qaAgent.last_update ? fmt.ago(qaAgent.last_update) : "—"),
          qaAgent.notes ? ui.kv("Notes", qaAgent.notes) : null,
          Array.isArray(qaAgent.focus) && qaAgent.focus.length
            ? h("div", { class: "stack", style: { gap: "6px" } },
                ui.section("Focus"),
                h("div", { class: "row wrap gap2" }, qaAgent.focus.map((f) => ui.pill(f))))
            : null,
          h("button", { class: "btn sm ghost", onClick: () => ctx.go("agent-cockpit", { agent: qaAgent.id }) }, "Open cockpit"))
      : ui.empty({
          glyph: "🔬",
          title: "No QA Inspector lane staffed",
          hint: "The agent running the QA Lab district appears here once it is seeded into the lane roster.",
        }),
  });

  // ---- one machine card per check (the factory floor of test rigs)
  const machineCard = (c) => {
    const st = statusOf(c?.status);
    const isChrome = c?.id === "chrome-verification";
    const p = Number(c?.passed) || 0;
    const f = Number(c?.failed) || 0;
    const card = ui.panel({
      glyph: st.glyph,
      title: labelOf(c?.id),
      sub: isChrome ? "Task 0 gate" : undefined,
      actions: ui.badge(isChrome && gateVerified ? "VERIFIED" : st.light, isChrome && gateVerified ? "ok" : st.badge),
      body: h("div", { class: "stack", style: { gap: "8px" } },
        h("div", { class: "row center gap2" },
          ui.dot(isChrome && gateVerified ? "ok" : st.dot),
          h("span", { class: "mono truncate", style: { fontSize: "11.5px", color: "var(--city-ink-muted)" } },
            c?.command || "—")),
        h("div", { class: "row between center" },
          h("div", { class: "row center gap2" },
            ui.pill(`${p} pass`, { tone: p ? "ok" : undefined }),
            ui.pill(`${f} fail`, { tone: f ? "risk" : undefined })),
          h("span", { class: "mono", style: { fontSize: "11px", color: "var(--city-ink-muted)" } },
            c?.last_run ? fmt.ago(c.last_run) : "never")),
        c?.note && c.note !== "No run yet." && h("div", { class: "muted", style: { fontSize: "12px" } }, c.note)),
    });
    card.classList.add("qalab-machine");
    card.dataset.st = c?.status || "not_run";
    return card;
  };

  const floor = total
    ? ui.grid("c3", checks.map(machineCard))
    : ui.empty({
        glyph: "🧪",
        title: "No test machines registered",
        hint: "QA checks (typecheck, lint, unit, rls, playwright, …) appear here once the harness reports them.",
      });

  // ---- live verification feed (real events — never synthesized)
  const feedPanel = ui.panel({
    glyph: "📡",
    title: "Verification feed",
    sub: qaFeed.length ? `${qaFeed.length} latest QA events` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Open Flight Recorder"),
    body: qaFeed.length
      ? h("div", { class: "scroll-y maxh-360" }, qaFeed.map(ui.eventRow))
      : ui.empty({
          glyph: "📡",
          title: "No verification events yet",
          hint: "test_passed, command_center_verified, and risk events land here as the build verifies work.",
        }),
  });

  // ---- Repair Bay — failing machines + QA-blocking risks
  const repairItems = failures.length + qaRisks.length;
  const repairBay = ui.panel({
    glyph: "🛠",
    title: "Repair Bay",
    sub: repairItems
      ? `${failures.length} failing · ${qaRisks.length} QA risk${qaRisks.length === 1 ? "" : "s"}`
      : "all clear",
    actions: [
      ui.badge(repairItems ? `${repairItems} DOWN` : "CLEAR", repairItems ? "risk" : "ok"),
      qaRisks.length ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "Control Tower") : null,
    ],
    body: repairItems
      ? h("div", { class: "scroll-y maxh-360" },
          ui.rows([
            ...failures.map((c) =>
              ui.listRow([
                ui.dot("risk"),
                h("div", { class: "grow", style: { minWidth: "0" } },
                  h("div", { style: { fontWeight: "700" } }, labelOf(c?.id)),
                  h("div", { class: "muted mono truncate", style: { fontSize: "11px" } }, c?.command || "—"),
                  c?.note && c.note !== "No run yet."
                    ? h("div", { class: "muted", style: { fontSize: "12px", marginTop: "2px" } }, c.note)
                    : null),
                h("div", { class: "right nowrap" },
                  ui.badge(`${Number(c?.failed) || 0} fail`, "risk"),
                  h("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "3px" } },
                    c?.last_run ? fmt.ago(c.last_run) : "never")),
              ])),
            ...qaRisks.map((r) =>
              ui.listRow([
                ui.dot(r.level === "critical" ? "critical" : "warn"),
                h("div", { class: "grow", style: { minWidth: "0" } },
                  h("div", { style: { fontWeight: "700" } }, r.title || "Risk"),
                  r.mitigation
                    ? h("div", { class: "muted truncate", style: { fontSize: "12px", marginTop: "2px" } }, r.mitigation)
                    : null),
                h("div", { class: "right nowrap" },
                  ui.badge(r.level || "risk", r.level === "critical" ? "critical" : "warn"),
                  h("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "3px" } }, r.category || "")),
              ])),
          ]))
      : ui.empty({
          glyph: failed === 0 && total ? "✅" : "🛠",
          title: failed === 0 && total ? "No machines in the Repair Bay" : "Nothing to repair yet",
          hint: total
            ? "Failing QA checks and unresolved QA/RLS/scope risks land here with their command, note, and last-run time."
            : (honest.tests || "No tests run yet"),
        }),
  });

  // ---- Honest QA state — never inflate
  const honestPanel = ui.panel({
    glyph: "📊",
    title: "Honest QA state",
    body: h("div", { class: "stack" },
      ui.kv("Tests", honest.tests || "No tests run yet"),
      ui.kv("Migrations", honest.migrations || "No migrations changed yet"),
      ui.kv("Product files", honest.product_files || "No product files changed yet"),
      ui.kv("Machines registered", String(total)),
      ui.kv("Idle / never run", String(notRun)),
      ui.kv("Verifications logged", String(passEvents.length)),
      ui.kv("Last machine run", lastRunIso ? fmt.ago(lastRunIso) : "never"),
      ui.kv("QA updated", qa.updated_at ? fmt.ago(qa.updated_at) : "—")),
  });

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "🧪",
      title: "QA Lab",
      sub: "Test machines, the Definition-of-Done checklist, and the Repair Bay",
      actions: [
        ui.badge(`${passed}/${total || 0} passing`, total && passed === total && !failed ? "ok" : "info"),
        ui.badge(gateVerified ? "Gate ✓" : "Gate …", gateVerified ? "ok" : "warn"),
        h("button", { class: "btn sm ghost", onClick: () => ctx.refresh && ctx.refresh() }, "Refresh"),
      ],
    }),
    stats,
    gatePanel,
    ui.grid("c2", [dodPanel, inspectorPanel]),
    ui.panel({
      glyph: "🏭",
      title: "Machine floor",
      sub: total ? `${total} test machines` : "",
      body: floor,
    }),
    ui.grid("c2", [feedPanel, repairBay]),
    honestPanel,
  );
}
