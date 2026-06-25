/* Mission Control — the Prompt Plaza overview: mission contract, Task 0 gate,
   weighted build progress vs confidence, next actions, and honest build state.
   GOLDEN REFERENCE MODE — other modes should match this structure and quality. */
export const meta = { label: "Mission Control", district: "Prompt Plaza" };

export function render(ctx) {
  const { h, ui, fmt, state, repo, events } = ctx;
  const s = state || {};
  const packets = s.packets || [];
  const agents = s.agents || [];
  const prog = ctx.weightedProgress(packets);
  const conf = ctx.weightedConfidence(packets);
  const verified = !!s.task0_gate?.verified;
  const openRisks = (s.risks?.cards || []).filter((r) => r.status !== "resolved");
  const recent = (events || []).slice(-6).reverse();

  // ---- top stat band
  const stats = ui.grid("c4", [
    ui.stat({ label: "Build progress", value: fmt.pct(prog), sub: `${packets.filter((p) => p.status === "done").length}/${packets.length} packets done`, tone: "ok" }),
    ui.stat({ label: "Confidence", value: fmt.pct(conf), sub: "earned, not vibes", tone: conf < prog - 10 ? "warn" : "info" }),
    ui.stat({ label: "Agent lanes", value: `${agents.filter((a) => a.status === "active").length}/${agents.length}`, sub: "active / total", tone: "info" }),
    ui.stat({ label: "Open risks", value: openRisks.length, sub: openRisks.filter((r) => r.level === "critical").length + " critical", tone: openRisks.length ? "risk" : "ok" }),
  ]);

  // ---- Task 0 gate banner
  const gate = ui.panel({
    glyph: verified ? "✅" : "🚧", title: "Task 0 — Live Command Center gate", lift: true,
    actions: ui.badge(verified ? "GATE OPEN" : "IN PROGRESS", verified ? "ok" : "active"),
    body: h("div", { class: "stack" },
      h("div", { class: "muted" }, verified
        ? `Verified ${fmt.ago(s.task0_gate.verified_at)} — main BaseballHelm product work may proceed.`
        : "No main BaseballHelm product code changes until the command center is verified in Chrome and command_center_verified is logged."),
      ui.progress(prog, { label: "Phase 0 + Phase 1 weighted completion", right: `${prog}% built · ${conf}% confidence` }),
      h("div", { class: "row wrap gap2 mt2" }, (s.read_order || []).map((r, i) =>
        ui.pill(r, { tone: i === 0 ? "active" : undefined })))),
  });

  // ---- mission contract (Prompt Plaza)
  const contract = ui.panel({
    glyph: "🏛", title: "Mission contract", sub: s.phase,
    body: h("div", { class: "stack" },
      h("div", {}, s.mission || "—"),
      ui.section("Definition of done"),
      ui.rows((s.definition_of_done || []).map((d) => ui.listRow([ui.dot("ok"), h("span", { class: "grow" }, d)]))),
      ui.section("Forbidden scope (do not build now)"),
      h("div", { class: "row wrap gap2" }, (s.forbidden_scope || []).map((f) => ui.badge(f, "idle")))),
  });

  // ---- next 3 actions (from handoff/backlog)
  const next = (s.handoff?.next_actions || []).slice(0, 3);
  const nextPanel = ui.panel({
    glyph: "🎯", title: "Next three actions",
    body: next.length ? ui.rows(next.map((a, i) => ui.listRow([ui.badge(String(i + 1), "active"), h("span", { class: "grow" }, a)])))
      : ui.empty({ glyph: "🎯", title: "No queued actions", hint: "Actions populate from the handoff ledger and backlog." }),
  });

  // ---- what changed since last glance
  const changedPanel = ui.panel({
    glyph: "📍", title: "What changed", sub: repo?.branch ? `branch ${repo.branch}` : "",
    body: (repo?.changed_files?.length)
      ? h("div", { class: "scroll-y maxh-280" }, ui.rows(repo.changed_files.slice(0, 20).map((f) =>
          ui.listRow([ui.dot("warn"), h("span", { class: "grow mono truncate", style: { fontSize: "11.5px" } }, f)]))))
      : ui.empty({ glyph: "🗂", title: s.honest_states?.product_files || "No product files changed yet", hint: "Git-tracked edits appear here once the build touches files." }),
  });

  // ---- honest build state
  const honest = ui.panel({
    glyph: "📊", title: "Honest build state",
    body: h("div", { class: "stack" },
      ui.kv("Tests", s.honest_states?.tests || "—"),
      ui.kv("Migrations", s.honest_states?.migrations || "—"),
      ui.kv("Product files", s.honest_states?.product_files || "—"),
      ui.kv("Repo", s.repo_path || "—"),
      ui.kv("URL", s.url || "—"),
      ui.kv("Updated", fmt.ago(s.updated_at))),
  });

  // ---- live ticker mini
  const ticker = ui.panel({
    glyph: "📡", title: "Latest events", actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Open Flight Recorder"),
    body: recent.length ? h("div", {}, recent.map(ui.eventRow)) : ui.empty({ glyph: "📡", title: "No events yet" }),
  });

  return h("div", { class: "stack" },
    ui.modeHead({ glyph: "◎", title: "Mission Control", sub: s.product || "BaseballHelm Ultracode Command Center",
      actions: [ui.pill(s.permission_mode || "full-throttle", { dot: true, tone: "active" }), ui.badge(verified ? "Task 0 ✓" : "Task 0 …", verified ? "ok" : "warn")] }),
    stats,
    gate,
    ui.grid("c2", [contract, h("div", { class: "stack" }, nextPanel, honest)]),
    ui.grid("c2", [changedPanel, ticker]),
  );
}
