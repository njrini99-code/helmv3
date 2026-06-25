/* Handoff Ledger — the Shipping Dock continuity view.

   Everything here is read LIVE off ctx (no hardcoded counts, copy, progress, or
   placeholder rows). It answers the one question a resuming agent has:
   "What is the exact state of this build and what do I do next?"

   Live sources rendered:
     ctx.state.handoff   → status, read_order, next_actions, notes timeline
     ctx.state.packets   → what remains (weakest-first) + done/total + confidence
     ctx.state.qa        → continuation gate (can the build be verified on pickup?)
     ctx.state.agents    → who is mid-flight (heartbeat, queue depth, last note)
     ctx.state.risks     → armed/open guards the next agent must respect
     ctx.state.artifacts → deliverables to read before resuming
     ctx.state.decisions → context to carry forward
     ctx.repo            → branch, dirty tree, last commit — the real pickup surface
     ctx.state.loc       → build size (honest, only if reported)
     ctx.events          → most recent build activity at the handoff line

   Exports a Markdown handoff bundle client-side. Honest ctx.ui.empty(...) for
   every missing slice. Cream/green shared tokens only; one idempotent style block. */
export const meta = { label: "Handoff Ledger", district: "Shipping Dock" };

function injectStyle(h) {
  if (typeof document === "undefined") return;
  if (document.getElementById("st-handoff-ledger")) return;
  const css = `
  #mode-root .hl-gate{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
    border:1px solid var(--city-line,rgba(120,113,108,.22));background:rgba(255,255,255,.45)}
  #mode-root .hl-gate .hl-gate-l{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;
    color:var(--city-ink-muted,#78716c)}
  #mode-root .hl-gate .hl-gate-v{font-weight:700}
  #mode-root .hl-pickup{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;
    background:rgba(22,163,74,.07);border:1px solid rgba(22,163,74,.18);border-radius:10px;
    padding:8px 10px;color:var(--city-ink,#1c1917);white-space:pre-wrap;word-break:break-word}
  #mode-root .hl-agent{display:flex;align-items:center;gap:9px;padding:7px 2px}
  #mode-root .hl-bar{height:5px;border-radius:99px;background:rgba(120,113,108,.16);overflow:hidden;margin-top:5px}
  #mode-root .hl-bar > i{display:block;height:100%;border-radius:99px;background:var(--city-turf,#16a34a)}
  #mode-root .hl-bar.is-clay > i{background:var(--city-clay,#c2683f)}
  `;
  document.head.append(h("style", { id: "st-handoff-ledger" }, css));
}

export function render(ctx) {
  const { h, ui, fmt, state, repo, events } = ctx;
  injectStyle(h);

  // Distinguish "not loaded" from "loaded but empty" — honest loading first.
  if (!state) return h("div", { class: "stack" },
    ui.modeHead({ glyph: "🤝", title: "Handoff Ledger", sub: "Shipping Dock" }),
    ui.loading("Loading handoff ledger…"));

  const s = state || {};
  const handoff = s.handoff && typeof s.handoff === "object" ? s.handoff : null;

  const status = (handoff && handoff.status) || "";
  const readOrder = (handoff && Array.isArray(handoff.read_order)) ? handoff.read_order : [];
  const nextActions = (handoff && Array.isArray(handoff.next_actions)) ? handoff.next_actions : [];
  const notes = (handoff && Array.isArray(handoff.notes)) ? handoff.notes.slice() : [];
  const packets = Array.isArray(s.packets) ? s.packets : [];
  const decisions = Array.isArray(s.decisions) ? s.decisions : [];
  const agents = Array.isArray(s.agents) ? s.agents : [];
  const artifacts = Array.isArray(s.artifacts) ? s.artifacts : [];
  const qaChecks = Array.isArray(s.qa?.checks) ? s.qa.checks : [];
  const riskCards = Array.isArray(s.risks?.cards) ? s.risks.cards : [];
  const repoFacts = repo || s.repo || null;
  const dirty = Array.isArray(repoFacts?.dirty) ? repoFacts.dirty : [];
  const recentEvents = Array.isArray(events) ? events.slice(-6).reverse() : [];

  // remaining = packets not done, weakest-first so the next thing to ship is on top
  const remaining = packets
    .filter((p) => p && p.status !== "done")
    .slice()
    .sort((a, b) => (a.completion_percent || 0) - (b.completion_percent || 0));
  const doneCount = packets.filter((p) => p && p.status === "done").length;

  // open risks = anything not explicitly resolved (armed/noted/open all matter on pickup)
  const openRisks = riskCards.filter((r) => r && String(r.status).toLowerCase() !== "resolved");
  const criticalRisks = openRisks.filter((r) => String(r.level).toLowerCase() === "critical");

  // agents that are mid-flight (not idle/done) — these are the threads to resume
  const liveAgents = agents.filter((a) => a && (a.status === "active" || a.status === "blocked"));

  // QA gate: are there any non-passing checks the next agent must clear before trusting the build?
  const ranChecks = qaChecks.filter((c) => c && c.status && c.status !== "not_run");
  const failingChecks = qaChecks.filter((c) => c && c.status === "failed");
  const notRunChecks = qaChecks.filter((c) => !c || !c.status || c.status === "not_run");
  const passedChecks = qaChecks.filter((c) => c && c.status === "passed");

  // ---- status tone (honest: gate-open style only when explicitly open/verified)
  const lc = String(status).toLowerCase();
  const statusOpen = lc.includes("verified") || lc.includes("open") || lc.includes("ready") || lc.includes("complete");
  const statusBlocked = lc.includes("block") || lc.includes("stuck");
  const statusTone = statusOpen ? "ok" : statusBlocked ? "risk" : "warn";
  const statusLabel = status ? status.replace(/_/g, " ") : "unknown";

  // ---------------------------------------------------------------- top stat band
  const stats = ui.grid("c4", [
    ui.stat({
      label: "Handoff status",
      value: status ? statusLabel : "—",
      sub: statusOpen ? "continuation safe" : statusBlocked ? "blocked — read first" : "read before resuming",
      tone: statusTone,
    }),
    ui.stat({
      label: "Next actions",
      value: nextActions.length,
      sub: nextActions.length ? "queued for pickup" : "none queued",
      tone: nextActions.length ? "info" : "ok",
    }),
    ui.stat({
      label: "Packets remaining",
      value: remaining.length,
      sub: packets.length ? `${doneCount}/${packets.length} done` : "no packets tracked",
      tone: remaining.length ? "warn" : "ok",
    }),
    ui.stat({
      label: "Open guards",
      value: openRisks.length,
      sub: criticalRisks.length ? `${criticalRisks.length} critical` : "respect on pickup",
      tone: criticalRisks.length ? "risk" : openRisks.length ? "warn" : "ok",
    }),
  ]);

  // ---------------------------------------------------------------- continuity banner
  // Honest live verdict: combine handoff status + QA gate + dirty tree into one read.
  const gateValue = failingChecks.length
    ? `${failingChecks.length} failing`
    : ranChecks.length
      ? `${passedChecks.length}/${qaChecks.length} passing`
      : "not run";
  const gateTone = failingChecks.length ? "risk" : passedChecks.length && !notRunChecks.length ? "ok" : "warn";

  const banner = ui.panel({
    glyph: statusOpen ? "✅" : statusBlocked ? "⛔" : "📦", title: "Continuity status", lift: true,
    actions: ui.badge(status ? statusLabel.toUpperCase() : "UNKNOWN", statusTone === "ok" ? "ok" : statusTone === "risk" ? "risk" : "warn"),
    body: h("div", { class: "stack" },
      h("div", { class: "muted" }, status
        ? (statusOpen
            ? "Handoff is in a continuation-safe state — the next agent can resume from this dock."
            : statusBlocked
              ? "This build is blocked. Read the open guards and next actions below before touching anything."
              : "Read the read-order and next actions below before resuming; this build is mid-flight.")
        : "No handoff status reported yet — treat the build as mid-flight and read everything below."),
      // live readiness chips — all derived, none hardcoded
      h("div", { class: "grid c3", style: { gap: "8px" } },
        h("div", { class: "hl-gate" }, ui.dot(gateTone === "ok" ? "ok" : gateTone === "risk" ? "risk" : "warn"),
          h("div", {}, h("div", { class: "hl-gate-l" }, "QA gate"), h("div", { class: "hl-gate-v" }, gateValue))),
        h("div", { class: "hl-gate" }, ui.dot(dirty.length ? "warn" : "ok"),
          h("div", {}, h("div", { class: "hl-gate-l" }, "Working tree"),
            h("div", { class: "hl-gate-v" }, dirty.length ? `${dirty.length} dirty` : "clean"))),
        h("div", { class: "hl-gate" }, ui.dot(liveAgents.length ? "ok" : "idle"),
          h("div", {}, h("div", { class: "hl-gate-l" }, "Live lanes"),
            h("div", { class: "hl-gate-v" }, liveAgents.length ? `${liveAgents.length} mid-flight` : "none active")))),
      h("div", { class: "row wrap gap2", style: { marginTop: "2px" } },
        ui.kv("Last note", notes.length ? fmt.ago(notes[notes.length - 1].ts) : "—"),
        ui.kv("State updated", s.updated_at ? fmt.ago(s.updated_at) : "—"),
        Number.isFinite(s.loc?.total) && s.loc.total > 0 ? ui.kv("Build size", `${fmt.num(s.loc.total)} ln`) : null)),
  });

  // ---------------------------------------------------------------- pickup surface (repo)
  // The literal thing a resuming agent checks out. All live from ctx.repo.
  const pickupPanel = ui.panel({
    glyph: "📍", title: "Pickup surface", sub: repoFacts?.branch ? `branch ${repoFacts.branch}` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("codebase-city") }, "Open Codebase City"),
    body: repoFacts
      ? h("div", { class: "stack" },
          h("div", { class: "hl-pickup" }, `git checkout ${repoFacts.branch || "—"}`),
          repoFacts.last_commit ? ui.kv("Last commit", h("span", { class: "mono truncate", style: { fontSize: "11px" } }, repoFacts.last_commit)) : null,
          ui.kv("Dirty files", dirty.length ? `${dirty.length} uncommitted` : "clean tree"),
          dirty.length
            ? h("div", { class: "scroll-y maxh-280" }, ui.rows(dirty.slice(0, 24).map((f) =>
                ui.listRow([
                  ui.badge((f && f.status) || "?", "warn"),
                  h("span", { class: "grow mono truncate", style: { fontSize: "11px" } }, (f && f.path) || String(f)),
                ]))))
            : h("div", { class: "muted", style: { fontSize: "12px" } },
                s.honest_states?.product_files || "No uncommitted edits — clean resume point."))
      : ui.empty({ glyph: "🗂", title: "No repo facts", hint: "Branch and dirty-tree status appear once git telemetry is read." }),
  });

  // ---------------------------------------------------------------- read order
  const readPanel = ui.panel({
    glyph: "📚", title: "Read order", sub: readOrder.length ? "newest spec first" : "",
    body: readOrder.length
      ? h("div", { class: "row wrap gap2" }, readOrder.map((r, i) =>
          ui.pill(r, { tone: i === 0 ? "active" : undefined })))
      : ui.empty({ glyph: "📚", title: "No read order set", hint: "The handoff has not declared which docs to read first." }),
  });

  // ---------------------------------------------------------------- next actions
  const actionsPanel = ui.panel({
    glyph: "🎯", title: "Next actions", sub: nextActions.length ? `${nextActions.length} queued` : "",
    body: nextActions.length
      ? ui.rows(nextActions.map((a, i) =>
          ui.listRow([ui.badge(String(i + 1), "active"), h("span", { class: "grow" }, a)])))
      : ui.empty({ glyph: "🎯", title: "No queued actions", hint: "Actions populate from the handoff ledger as the build advances." }),
  });

  // ---------------------------------------------------------------- what remains (packets)
  const remainingPanel = ui.panel({
    glyph: "📦", title: "What remains", sub: remaining.length ? `${remaining.length} packets not done` : packets.length ? "all packets done" : "",
    body: packets.length
      ? (remaining.length
          ? h("div", { class: "scroll-y maxh-360" }, ui.rows(remaining.map((p) => {
              const cp = Math.max(0, Math.min(100, Math.round(p.completion_percent || 0)));
              const conf = Number.isFinite(p.confidence_percent) ? Math.max(0, Math.min(100, Math.round(p.confidence_percent))) : null;
              const tone = p.status === "blocked" ? "risk" : p.status === "active" ? "active" : "idle";
              return h("div", { class: "list-row" },
                ui.dot(p.status === "blocked" ? "risk" : p.status === "active" ? "ok" : "idle"),
                h("div", { class: "grow", style: { minWidth: "0" } },
                  h("div", { class: "row between center", style: { gap: "8px" } },
                    h("span", { class: "truncate", style: { fontWeight: "600" } }, p.title || p.id || "untitled packet"),
                    ui.badge(p.status || "—", tone)),
                  h("div", { class: "muted", style: { fontSize: "11px", marginTop: "2px" } },
                    `${p.owner_lane || "unassigned"}${p.district ? " · " + p.district : ""}${p.blocked_reason ? " · " + p.blocked_reason : ""}`),
                  ui.progress(cp, { tone: p.status === "blocked" ? "clay" : "gold", right: conf != null ? `${cp}% · conf ${conf}%` : `${cp}%` })));
            })))
          : ui.empty({ glyph: "📦", title: "Nothing remaining", hint: "Every tracked work packet is marked done." }))
      : ui.empty({ glyph: "📦", title: "No packets tracked", hint: "Work packets appear here once the build declares them." }),
  });

  // ---------------------------------------------------------------- live lanes (agents)
  const lanesPanel = ui.panel({
    glyph: "🛰", title: "Lanes mid-flight", sub: agents.length ? `${liveAgents.length} of ${agents.length} agents` : "",
    actions: agents.length ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("agent-tower") }, "Open Agent Tower") : null,
    body: agents.length
      ? (liveAgents.length
          ? h("div", { class: "scroll-y maxh-280" }, liveAgents.map((a) => {
              const beat = a.heartbeat === "live";
              return h("div", { class: "hl-agent" },
                ui.dot(a.status === "blocked" ? "risk" : beat ? "ok" : "idle"),
                h("div", { class: "grow", style: { minWidth: "0" } },
                  h("div", { class: "row between center", style: { gap: "8px" } },
                    h("span", { class: "truncate", style: { fontWeight: "600" } }, a.name || a.id || "agent"),
                    ui.badge(a.status || "—", a.status === "blocked" ? "risk" : "active")),
                  h("div", { class: "muted truncate", style: { fontSize: "11.5px", marginTop: "1px" } }, a.notes || (a.role || "")),
                  h("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "2px" } },
                    `${a.district || "—"} · queue ${Number(a.queue_depth) || 0}${a.last_update ? " · " + fmt.ago(a.last_update) : ""}`)),
                ui.heartbeat(beat));
            }))
          : ui.empty({ glyph: "🛰", title: "No lanes mid-flight", hint: "All agents are idle or done — nothing to resume in-place." }))
      : ui.empty({ glyph: "🛰", title: "No agents registered", hint: "Agent lanes appear here once the build seeds them." }),
  });

  // ---------------------------------------------------------------- open guards (risks)
  const guardsPanel = ui.panel({
    glyph: "🛡", title: "Guards to respect", sub: openRisks.length ? `${openRisks.length} open` : "",
    actions: riskCards.length ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "Open Control Tower") : null,
    body: openRisks.length
      ? h("div", { class: "scroll-y maxh-280" }, ui.rows(openRisks
          .slice()
          .sort((a, b) => rank(b.level) - rank(a.level))
          .map((r) => h("div", { class: "list-row" },
            ui.dot(riskDot(r.level)),
            h("div", { class: "grow", style: { minWidth: "0" } },
              h("div", { class: "row between center", style: { gap: "8px" } },
                h("span", { class: "truncate", style: { fontWeight: "600" } }, r.title || "guard"),
                ui.badge((r.level || "info"), r.level === "critical" ? "critical" : r.level === "high" ? "risk" : r.level === "medium" ? "warn" : "info")),
              r.mitigation ? h("div", { class: "muted", style: { fontSize: "11.5px", marginTop: "2px" } }, r.mitigation) : null,
              h("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "2px" } },
                `${r.status || "open"}${r.timestamp ? " · " + fmt.ago(r.timestamp) : ""}`))))))
      : ui.empty({ glyph: "🛡", title: "No open guards", hint: riskCards.length ? "Every risk is resolved — safe to resume." : "No risk guards registered yet." }),
  });

  // ---------------------------------------------------------------- deliverables (artifacts)
  const artifactsPanel = ui.panel({
    glyph: "📂", title: "Deliverables to read", sub: artifacts.length ? `${artifacts.length} tracked` : "",
    body: artifacts.length
      ? ui.rows(artifacts.map((a) => h("div", { class: "list-row" },
          ui.dot("info"),
          h("div", { class: "grow", style: { minWidth: "0" } },
            h("div", { class: "row between center", style: { gap: "8px" } },
              h("span", { class: "truncate", style: { fontWeight: "600" } }, a.title || a.path || "artifact"),
              a.type ? ui.badge(a.type, "info") : null),
            a.summary ? h("div", { class: "muted truncate", style: { fontSize: "11.5px", marginTop: "2px" } }, a.summary) : null,
            a.path ? h("div", { class: "muted mono truncate", style: { fontSize: "10.5px", marginTop: "2px" } }, a.path) : null))))
      : ui.empty({ glyph: "📂", title: "No deliverables logged", hint: "Tools, docs, and reports appear here as the build produces them." }),
  });

  // ---------------------------------------------------------------- notes timeline
  const notesPanel = ui.panel({
    glyph: "🗒", title: "Notes timeline", sub: notes.length ? `${notes.length} entries` : "",
    body: notes.length
      ? h("div", { class: "scroll-y maxh-360" }, h("div", { class: "tl" },
          notes.slice().reverse().map((n) =>
            h("div", { class: "node" },
              h("div", { class: "muted mono", style: { fontSize: "10.5px" } }, n && n.ts ? fmt.time(n.ts) + " · " + fmt.ago(n.ts) : "—"),
              h("div", { style: { marginTop: "2px" } }, (n && n.text) || "—")))))
      : ui.empty({ glyph: "🗒", title: "No notes yet", hint: "Timeline entries are appended as the build records continuity notes." }),
  });

  // ---------------------------------------------------------------- recent decisions
  const recentDecisions = decisions.slice(-5).reverse();
  const decisionsPanel = ui.panel({
    glyph: "⚖️", title: "Decisions to carry forward", sub: decisions.length ? `${recentDecisions.length} of ${decisions.length}` : "",
    actions: decisions.length ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("decision-ledger") }, "Open Decision Ledger") : null,
    body: recentDecisions.length
      ? ui.rows(recentDecisions.map((d) =>
          h("div", { class: "list-row" },
            ui.dot("info"),
            h("div", { class: "grow", style: { minWidth: "0" } },
              h("div", { style: { fontWeight: "600" } }, (d && d.title) || "decision"),
              h("div", { class: "muted", style: { fontSize: "11.5px", marginTop: "2px" } }, (d && d.decision) || ""),
              h("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "2px" } },
                `${(d && d.agent) || "—"}${d && d.created_at ? " · " + fmt.ago(d.created_at) : ""}`)))))
      : ui.empty({ glyph: "⚖️", title: "No decisions logged", hint: "Architectural decisions appear here once recorded." }),
  });

  // ---------------------------------------------------------------- activity at the line (events)
  const activityPanel = ui.panel({
    glyph: "📡", title: "Activity at the handoff line", sub: recentEvents.length ? `last ${recentEvents.length}` : "",
    actions: recentEvents.length ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Open Flight Recorder") : null,
    body: recentEvents.length
      ? h("div", {}, recentEvents.map(ui.eventRow))
      : ui.empty({ glyph: "📡", title: "No recent events", hint: "Build events appear here as agents work toward the handoff." }),
  });

  // ---------------------------------------------------------------- export bundle (live snapshot)
  const buildMarkdown = () => {
    const lines = [];
    const safe = (v) => (v == null ? "" : String(v));
    lines.push("# Handoff bundle — " + safe(s.product || "BaseballHelm Ultracode Command Center"));
    lines.push("");
    lines.push("- Exported: " + new Date().toISOString());
    lines.push("- Status: " + (status ? statusLabel : "unknown"));
    if (s.phase) lines.push("- Phase: " + safe(s.phase));
    if (repoFacts?.branch) lines.push("- Branch: " + safe(repoFacts.branch));
    if (repoFacts?.last_commit) lines.push("- Last commit: " + safe(repoFacts.last_commit));
    lines.push("- Working tree: " + (dirty.length ? dirty.length + " dirty file(s)" : "clean"));
    lines.push("- QA gate: " + gateValue + (failingChecks.length ? "" : (notRunChecks.length ? " (some not run)" : "")));
    if (Number.isFinite(s.loc?.total) && s.loc.total > 0) lines.push("- Build size: " + s.loc.total + " ln");
    if (s.updated_at) lines.push("- State updated: " + safe(s.updated_at));
    lines.push("");
    lines.push("## Read order");
    if (readOrder.length) readOrder.forEach((r, i) => lines.push(`${i + 1}. ${safe(r)}`));
    else lines.push("_None set._");
    lines.push("");
    lines.push("## Next actions");
    if (nextActions.length) nextActions.forEach((a, i) => lines.push(`${i + 1}. ${safe(a)}`));
    else lines.push("_None queued._");
    lines.push("");
    lines.push("## Pickup surface");
    lines.push("```");
    lines.push("git checkout " + safe(repoFacts?.branch || "—"));
    lines.push("```");
    if (dirty.length) { lines.push("Dirty files:"); dirty.forEach((f) => lines.push(`- ${safe(f && f.status)} ${safe((f && f.path) || f)}`)); }
    else lines.push("_Clean working tree._");
    lines.push("");
    lines.push("## Lanes mid-flight");
    if (liveAgents.length) liveAgents.forEach((a) =>
      lines.push(`- ${safe(a.name || a.id)} — ${safe(a.status)} · ${safe(a.district || "")} · queue ${Number(a.queue_depth) || 0}${a.notes ? " — " + safe(a.notes) : ""}`));
    else lines.push("_No lanes mid-flight._");
    lines.push("");
    lines.push("## Open guards");
    if (openRisks.length) openRisks.forEach((r) =>
      lines.push(`- [${safe(r.level)}] ${safe(r.title)} — ${safe(r.status)}${r.mitigation ? " · " + safe(r.mitigation) : ""}`));
    else lines.push("_None open._");
    lines.push("");
    lines.push("## Remaining packets");
    if (remaining.length) remaining.forEach((p) => {
      const cp = Math.max(0, Math.min(100, Math.round(p.completion_percent || 0)));
      const conf = Number.isFinite(p.confidence_percent) ? `, conf ${Math.round(p.confidence_percent)}%` : "";
      lines.push(`- [${cp}%${conf}] ${safe(p.title || p.id)} — ${safe(p.status)} · ${safe(p.owner_lane || "unassigned")}${p.blocked_reason ? " · blocked: " + safe(p.blocked_reason) : ""}`);
    });
    else if (packets.length) lines.push("_None — all packets done._");
    else lines.push("_No packets tracked._");
    lines.push("");
    lines.push("## Deliverables");
    if (artifacts.length) artifacts.forEach((a) =>
      lines.push(`- ${safe(a.title || a.path)}${a.path ? " (" + safe(a.path) + ")" : ""}${a.summary ? " — " + safe(a.summary) : ""}`));
    else lines.push("_None logged._");
    lines.push("");
    lines.push("## Recent decisions");
    if (recentDecisions.length) recentDecisions.forEach((d) => {
      lines.push(`### ${safe(d.title || "decision")}`);
      if (d.decision) lines.push(safe(d.decision));
      if (d.rationale) lines.push("_Why:_ " + safe(d.rationale));
      lines.push(`_(${safe(d.agent || "—")}${d.created_at ? ", " + safe(d.created_at) : ""})_`);
      lines.push("");
    });
    else lines.push("_None logged._");
    lines.push("");
    lines.push("## Notes timeline");
    if (notes.length) notes.slice().reverse().forEach((n) => lines.push(`- ${safe(n && n.ts)} — ${safe(n && n.text)}`));
    else lines.push("_No notes._");
    lines.push("");
    return lines.join("\n");
  };

  const exportHandoff = () => {
    try {
      const md = buildMarkdown();
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `handoff-bundle-${stamp}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (typeof ctx.log === "function") {
        ctx.log({ type: "handoff_exported", title: "Handoff bundle exported", detail: a.download, severity: "ok" });
      }
    } catch (err) {
      if (typeof ctx.log === "function") {
        ctx.log({ type: "handoff_export_failed", title: "Handoff export failed", detail: String((err && err.message) || err), severity: "warn" });
      }
    }
  };

  // ---------------------------------------------------------------- assemble
  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "🤝", title: "Handoff Ledger", sub: "Shipping Dock — continuity & next-agent pickup",
      actions: [
        ui.badge(status ? statusLabel.toUpperCase() : "NO STATUS", statusTone === "ok" ? "ok" : statusTone === "risk" ? "risk" : "warn"),
        h("button", { class: "btn primary sm", onClick: exportHandoff }, "⬇ Export handoff"),
      ],
    }),
    stats,
    banner,
    ui.grid("c2", [pickupPanel, h("div", { class: "stack" }, readPanel, actionsPanel)]),
    ui.grid("c2", [remainingPanel, lanesPanel]),
    ui.grid("c2", [guardsPanel, artifactsPanel]),
    ui.grid("c2", [notesPanel, h("div", { class: "stack" }, decisionsPanel, activityPanel)]),
  );
}

// risk severity helpers (module scope so they aren't reallocated per render row)
function rank(level) {
  const l = String(level).toLowerCase();
  return l === "critical" ? 4 : l === "high" ? 3 : l === "medium" ? 2 : l === "low" ? 1 : 0;
}
function riskDot(level) {
  const l = String(level).toLowerCase();
  return l === "critical" ? "critical" : l === "high" ? "risk" : l === "medium" ? "warn" : "info";
}
