/* Flight Recorder — Broadcast Center session replay over the LIVE build stream.
   Everything here derives from ctx.events (the chronological event log) cross-
   referenced with ctx.state (packets / agents / risks): scrub the timeline,
   read live cadence + liveness, filter by agent / packet / type / severity,
   break the stream down by channel + agent, jump to the first failure / first
   file edit / latest event, inspect the event at the cursor (including the live
   `pct` progress and any `raw` hook payload), cross-link to the owning agent and
   packet, and export the filtered replay as JSON.

   No hardcoded counts, no scaffold copy — every number is computed from the
   stream at render time. State lives inside the module and re-renders via a
   local rerender(); no app.js import (contract §17). */
export const meta = { label: "Flight Recorder", district: "Broadcast Center" };

export function render(ctx) {
  const { h, ui, fmt, state, replay } = ctx;
  const all = Array.isArray(ctx.events) ? ctx.events.slice() : [];
  const s = state || {};
  const packets = Array.isArray(s.packets) ? s.packets : [];
  const agents = Array.isArray(s.agents) ? s.agents : [];
  const riskCards = (s.risks && Array.isArray(s.risks.cards)) ? s.risks.cards : [];

  // ----- mode-specific CSS (idempotent, tokens only) — channel meters + cursor row
  injectCss();

  // ----- module-local replay state (defensive defaults; seed from replay.json)
  const seedFilters = (replay && replay.filters) || {};
  const view = {
    cursor: clamp(Number(replay && replay.cursor) || all.length - 1, 0, Math.max(0, all.length - 1)),
    agents: new Set(),   // empty set = no filter (show all)
    packets: new Set(),
    types: new Set(),
    severities: new Set(),
  };
  if (seedFilters.agent) view.agents.add(seedFilters.agent);
  if (seedFilters.packet) view.packets.add(seedFilters.packet);

  // ----- classifiers (honest: derived from the real type/severity vocab)
  const FAIL_TYPES = new Set(["test_failed", "build_failed", "check_failed", "packet_blocked", "guard_tripped"]);
  const RISK_TYPES = new Set(["risk_added", "risk_escalated", "guard_tripped"]);
  const EDIT_TYPES = new Set(["file_edited", "file_created", "command_center_files_created", "product_file_changed", "file_changed"]);
  const TEST_TYPES = new Set(["test_passed", "test_failed", "check_passed", "check_failed"]);
  const DONE_TYPES = new Set(["packet_completed", "packet_finished", "command_center_verified"]);
  const isFail = (e) => FAIL_TYPES.has(e.type) || e.severity === "critical";
  const isRisk = (e) => RISK_TYPES.has(e.type) || e.severity === "risk" || e.severity === "high";
  const isEdit = (e) => EDIT_TYPES.has(e.type) || /(?:^|_)file(?:_|$)/i.test(e.type || "");
  const isTest = (e) => TEST_TYPES.has(e.type);
  const isDone = (e) => DONE_TYPES.has(e.type);
  const evTone = (e) => isFail(e) ? "critical" : isRisk(e) ? "warn" : isDone(e) ? "ok" : isEdit(e) ? "info" : "idle";

  // ----- distinct dimensions (honest: only what's really in the stream)
  const distinct = (key) => {
    const seen = [];
    for (const e of all) { const v = e && e[key]; if (v && !seen.includes(v)) seen.push(v); }
    return seen;
  };
  const agentOpts = distinct("agent");
  const packetOpts = distinct("packet");
  const typeOpts = distinct("type");
  const sevOpts = distinct("severity");

  // ----- filtering (a dimension with an empty set passes everything)
  const passes = (e) =>
    (view.agents.size === 0 || view.agents.has(e.agent)) &&
    (view.packets.size === 0 || view.packets.has(e.packet)) &&
    (view.types.size === 0 || view.types.has(e.type)) &&
    (view.severities.size === 0 || view.severities.has(e.severity || "info"));
  const anyFilter = () => view.agents.size + view.packets.size + view.types.size + view.severities.size > 0;

  const upToCursor = () => all.slice(0, view.cursor + 1);
  const filteredAll = () => all.filter(passes);
  const filteredUpToCursor = () => upToCursor().filter(passes);

  // ----- live cross-reference lookups (event → owning packet / agent in ctx.state)
  const packetById = new Map(packets.map((p) => [p.id, p]));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const agentByName = new Map(agents.map((a) => [a.name, a]));
  const lookupPacket = (id) => packetById.get(id) || null;
  const lookupAgent = (idOrName) => agentById.get(idOrName) || agentByName.get(idOrName) || null;

  // root we mutate in place
  const root = h("div", { class: "stack" });
  rerender();
  return root;

  // ----------------------------------------------------------------- rerender
  function rerender() {
    if (!all.length) {
      root.replaceChildren(
        head(),
        ui.panel({
          glyph: "⏱", title: "Timeline",
          body: ui.empty({
            glyph: "📼", title: "No events recorded yet",
            hint: "Build events stream into events.ndjson as agents work. The recorder will replay them here the moment the first one lands.",
          }),
        }),
      );
      return;
    }

    const cur = all[view.cursor] || null;
    const shown = filteredUpToCursor();
    const fAll = filteredAll();
    const failIdx = lastIndex(isFail);   // most recent failure is the one you want to fly to
    const editIdx = all.findIndex(isEdit);

    root.replaceChildren(
      head(),
      statBand(shown, fAll, cur),
      criticalBanner(),
      scrubberPanel(cur, failIdx, editIdx),
      ui.grid("c2", [filtersPanel(), detailPanel(cur)]),
      ui.grid("c2", [channelPanel(), agentPanel()]),
      timelinePanel(shown),
    );
  }

  // ----------------------------------------------------------------- header
  function head() {
    const exportBtn = h("button", { class: "btn sm primary", onClick: exportReplay }, "⬇ Export replay JSON");
    const reset = h("button", {
      class: "btn sm ghost",
      onClick: () => { view.agents.clear(); view.packets.clear(); view.types.clear(); view.severities.clear(); rerender(); },
    }, "Clear filters");
    const last = all[all.length - 1];
    return ui.modeHead({
      glyph: "⏱", title: "Flight Recorder",
      sub: "Broadcast Center — scrub, filter, and replay the live build timeline",
      actions: [
        ui.pill(`${fmt.num(all.length)} events`, { dot: true, tone: "active" }),
        last ? ui.pill(`last ${fmt.ago(last.ts)}`, { tone: "info" }) : null,
        reset, exportBtn,
      ],
    });
  }

  // ----------------------------------------------------------------- stat band
  function statBand(shown, fAll, cur) {
    const first = all[0], last = all[all.length - 1];
    const spanSec = (first && last) ? Math.max(0, (new Date(last.ts).getTime() - new Date(first.ts).getTime()) / 1000) : 0;
    const span = humanSpan(spanSec);
    // live cadence: events per active minute across the recorded window
    const rate = spanSec > 0 ? (all.length / (spanSec / 60)) : 0;
    const fails = all.filter(isFail).length;
    const tests = all.filter(isTest).length;
    const edits = all.filter(isEdit).length;
    const failsShown = shown.filter(isFail).length;
    return ui.grid("c4", [
      ui.stat({ label: "Cursor", value: `${view.cursor + 1}/${all.length}`, sub: cur ? `${fmt.time(cur.ts)} · ${fmt.ago(cur.ts)}` : "—", tone: "info" }),
      ui.stat({ label: "Visible", value: shown.length, sub: `${fAll.length} match filter · ${failsShown} fail`, tone: failsShown ? "risk" : "ok" }),
      ui.stat({ label: "Stream health", value: fails ? `${fails} fail` : `${tests} ✓`, sub: `${edits} file writes · ${tests} test events`, tone: fails ? "risk" : "ok" }),
      ui.stat({ label: "Cadence", value: rate >= 0.05 ? `${rate.toFixed(1)}/min` : "—", sub: `over ${span} recorded`, tone: "info" }),
    ]);
  }

  // ----------------------------------------------------------------- critical banner
  // surface the single most-recent unresolved critical/fail event so the recorder
  // does not bury the one thing that needs a human. honest: hidden when none.
  function criticalBanner() {
    const idx = lastIndex(isFail);
    const openCrit = riskCards.filter((r) => r.level === "critical" && r.status !== "resolved");
    if (idx < 0 && !openCrit.length) return null;
    const e = idx >= 0 ? all[idx] : null;
    const kids = [];
    if (e) {
      kids.push(h("div", { class: "row between center wrap", style: { gap: "8px" } },
        h("div", { class: "stack", style: { gap: "2px" } },
          h("b", {}, e.title || (e.type || "failure").replace(/_/g, " ")),
          e.detail ? h("span", { class: "muted", style: { fontSize: "12px" } }, e.detail) : null),
        h("div", { class: "row gap2 center" },
          ui.badge((e.severity || "critical").toUpperCase(), "critical"),
          h("button", { class: "btn sm", onClick: () => { view.cursor = idx; rerender(); } }, `Fly to #${idx + 1}`))));
    }
    if (openCrit.length) {
      kids.push(h("div", { class: "row wrap gap2", style: { marginTop: e ? "8px" : "0" } },
        openCrit.map((r) => ui.pill(r.title, { tone: "critical" }))));
    }
    return ui.panel({
      glyph: "⚑", title: "Needs attention", lift: true,
      actions: ui.badge(`${(idx >= 0 ? 1 : 0) + openCrit.length} flagged`, "critical"),
      body: h("div", { class: "stack" }, kids),
    });
  }

  // ----------------------------------------------------------------- scrubber
  function scrubberPanel(cur, failIdx, editIdx) {
    const range = h("input", {
      class: "scrubber", type: "range", min: "0", max: String(all.length - 1),
      step: "1", value: String(view.cursor),
      "aria-label": "Replay cursor",
      onInput: (ev) => { view.cursor = clamp(Number(ev.target.value) || 0, 0, all.length - 1); rerender(); },
    });

    const stepBtn = (label, delta) => h("button", {
      class: "btn sm",
      onClick: () => { view.cursor = clamp(view.cursor + delta, 0, all.length - 1); rerender(); },
    }, label);

    const jumpFail = h("button", {
      class: `btn sm ${failIdx >= 0 ? "" : "ghost"}`, disabled: failIdx < 0 || null,
      onClick: () => { if (failIdx >= 0) { view.cursor = failIdx; rerender(); } },
    }, failIdx >= 0 ? `⚑ Latest failure (#${failIdx + 1})` : "No failures recorded");

    const jumpEdit = h("button", {
      class: `btn sm ${editIdx >= 0 ? "" : "ghost"}`, disabled: editIdx < 0 || null,
      onClick: () => { if (editIdx >= 0) { view.cursor = editIdx; rerender(); } },
    }, editIdx >= 0 ? `✎ First file edit (#${editIdx + 1})` : "No file edits recorded");

    const jumpLatest = h("button", {
      class: "btn sm", onClick: () => { view.cursor = all.length - 1; rerender(); },
    }, "⤓ Latest event");

    return ui.panel({
      glyph: "🎚", title: "Scrubber", sub: cur ? `@ ${fmt.time(cur.ts)} · ${fmt.ago(cur.ts)}` : "",
      actions: [stepBtn("⏮ Start", -all.length), stepBtn("◀", -1), stepBtn("▶", 1), stepBtn("⏭ End", all.length)],
      body: h("div", { class: "stack" },
        range,
        h("div", { class: "row between", style: { fontSize: "11px" } },
          h("span", { class: "muted mono" }, all[0] ? fmt.time(all[0].ts) : "--:--:--"),
          ui.pill(cur ? (cur.type || "event").replace(/_/g, " ") : "—", { tone: cur ? evTone(cur) : "active" }),
          h("span", { class: "muted mono" }, all[all.length - 1] ? fmt.time(all[all.length - 1].ts) : "--:--:--")),
        h("div", { class: "row wrap gap2" }, jumpFail, jumpEdit, jumpLatest)),
    });
  }

  // ----------------------------------------------------------------- filters
  function filtersPanel() {
    const chip = (set, value, label) => {
      const on = set.has(value);
      const n = all.filter((e) => (e[chipKeyFor(set)] || (set === view.severities ? "info" : null)) === value).length;
      return h("button", {
        class: `chip ${on ? "on" : ""}`,
        onClick: () => { on ? set.delete(value) : set.add(value); rerender(); },
      }, h("span", {}, label || value), h("span", { class: "chip-n" }, n));
    };
    const chipKeyFor = (set) => set === view.agents ? "agent" : set === view.packets ? "packet" : set === view.types ? "type" : "severity";
    const group = (title, opts, set, render) => h("div", { class: "stack", style: { gap: "6px" } },
      ui.section(title, h("span", { class: "muted mono", style: { fontSize: "10px" } }, `${set.size ? set.size + "/" : ""}${opts.length}`)),
      opts.length
        ? h("div", { class: "chip-toggle" }, opts.map((o) => render(o)))
        : h("div", { class: "muted", style: { fontSize: "12px" } }, "none in stream"));

    return ui.panel({
      glyph: "⛃", title: "Filters", sub: anyFilter() ? "narrowing the replay" : "toggle to narrow the replay",
      actions: anyFilter() ? h("button", { class: "btn sm ghost", onClick: () => { view.agents.clear(); view.packets.clear(); view.types.clear(); view.severities.clear(); rerender(); } }, "Clear") : null,
      body: h("div", { class: "stack" },
        group("Agent", agentOpts, view.agents, (a) => chip(view.agents, a, a)),
        group("Packet", packetOpts, view.packets, (p) => chip(view.packets, p, p)),
        group("Type", typeOpts, view.types, (t) => chip(view.types, t, (t || "event").replace(/_/g, " "))),
        group("Severity", sevOpts, view.severities, (sv) => chip(view.severities, sv, sv))),
    });
  }

  // ----------------------------------------------------------------- detail
  function detailPanel(cur) {
    if (!cur) {
      return ui.panel({
        glyph: "🔎", title: "Event detail",
        body: ui.empty({ glyph: "🔎", title: "No event at cursor", hint: "Move the scrubber to inspect an event." }),
      });
    }
    const tone = evTone(cur);
    const pkt = lookupPacket(cur.packet);
    const ag = lookupAgent(cur.agent);

    // live cross-links into other districts when the referenced entity exists in ctx.state
    const links = h("div", { class: "row wrap gap2", style: { marginTop: "4px" } });
    if (ag) links.append(h("button", { class: "btn sm ghost", onClick: () => ctx.go("agent-tower") }, `→ ${ag.name || ag.id} in Agent Tower`));
    if (pkt) links.append(h("button", { class: "btn sm ghost", onClick: () => ctx.go("factory-floor") }, `→ ${pkt.title || pkt.id} on Factory Floor`));
    if (isRisk(cur) || isFail(cur)) links.append(h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "→ Control Tower"));

    const rows = [
      ui.kv("Type", (cur.type || "—").replace(/_/g, " ")),
      ui.kv("Agent", ag ? `${ag.name || ag.id} · ${ag.status || "—"}` : (cur.agent || "—")),
      ui.kv("Packet", pkt ? `${pkt.title || pkt.id} · ${pkt.status || "—"}` : (cur.packet || "—")),
      ui.kv("Source", cur.source || "—"),
      ui.kv("Severity", cur.severity || "info"),
      ui.kv("Time", fmt.time(cur.ts) + " · " + fmt.ago(cur.ts)),
      ui.kv("Event id", cur.id || "—"),
    ];

    // live `pct` carried on packet-progress events → render the bar, not a number
    const pctBlock = (cur.pct != null && Number.isFinite(Number(cur.pct)))
      ? ui.progress(Number(cur.pct), { label: "Reported packet progress at this event", right: fmt.pct(cur.pct), tone: Number(cur.pct) >= 100 ? "gold" : "clay" })
      : null;

    // live `raw` hook payload (e.g. Claude Code SessionStart) — show it honestly, monospace
    const rawBlock = cur.raw
      ? h("div", { class: "stack", style: { gap: "4px" } },
          ui.section("Raw hook payload"),
          h("pre", { class: "fr-raw" }, safeJson(cur.raw)))
      : null;

    return ui.panel({
      glyph: "🔎", title: "Event detail", sub: `#${view.cursor + 1} of ${all.length}`,
      actions: ui.badge((cur.severity || "info").toUpperCase(), tone === "idle" ? "info" : tone),
      body: h("div", { class: "stack" },
        h("div", { style: { fontWeight: "700", fontSize: "14px" } }, cur.title || "(untitled event)"),
        cur.detail ? h("div", { class: "muted", style: { fontSize: "12.5px" } }, cur.detail) : null,
        pctBlock,
        h("div", {}, rows),
        (ag || pkt || isRisk(cur) || isFail(cur)) ? links : null,
        rawBlock),
    });
  }

  // ----------------------------------------------------------------- channel breakdown (by type)
  function channelPanel() {
    const counts = new Map();
    for (const e of all) { const t = e.type || "event"; counts.set(t, (counts.get(t) || 0) + 1); }
    const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    const active = (t) => view.types.has(t);
    return ui.panel({
      glyph: "📊", title: "Channels", sub: `${rows.length} event types in stream`,
      body: rows.length
        ? h("div", { class: "scroll-y maxh-280" }, h("div", { class: "stack", style: { gap: "5px" } },
            rows.map(([t, n]) => h("button", {
              class: `fr-meter ${active(t) ? "on" : ""}`,
              title: "Filter the replay by this channel",
              onClick: () => { active(t) ? view.types.delete(t) : view.types.add(t); rerender(); },
            },
              h("div", { class: "fr-meter-head" },
                h("span", { class: "truncate" }, (t || "event").replace(/_/g, " ")),
                h("span", { class: "mono muted" }, n)),
              h("div", { class: "fr-bar" }, h("i", { style: { width: `${Math.round((n / max) * 100)}%` } }))))))
        : ui.empty({ glyph: "📊", title: "No channels yet" }),
    });
  }

  // ----------------------------------------------------------------- agent breakdown
  function agentPanel() {
    const counts = new Map();
    const lastTs = new Map();
    for (const e of all) {
      if (!e.agent) continue;
      counts.set(e.agent, (counts.get(e.agent) || 0) + 1);
      lastTs.set(e.agent, e.ts);
    }
    const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    const active = (a) => view.agents.has(a);
    return ui.panel({
      glyph: "🛰", title: "By agent", sub: `${rows.length} agents on the air`,
      body: rows.length
        ? h("div", { class: "scroll-y maxh-280" }, h("div", { class: "stack", style: { gap: "5px" } },
            rows.map(([a, n]) => {
              const liveAgent = lookupAgent(a);
              return h("button", {
                class: `fr-meter ${active(a) ? "on" : ""}`,
                title: "Filter the replay by this agent",
                onClick: () => { active(a) ? view.agents.delete(a) : view.agents.add(a); rerender(); },
              },
                h("div", { class: "fr-meter-head" },
                  h("span", { class: "row gap2 center" },
                    ui.dot(liveAgent ? statusDot(liveAgent.status) : "info"),
                    h("span", { class: "truncate" }, a)),
                  h("span", { class: "mono muted" }, `${n} · ${fmt.ago(lastTs.get(a))}`)),
                h("div", { class: "fr-bar" }, h("i", { style: { width: `${Math.round((n / max) * 100)}%` } })));
            })))
        : ui.empty({ glyph: "🛰", title: "No agents in the stream", hint: "Events carry an agent id once lanes start emitting." }),
    });
  }

  // ----------------------------------------------------------------- timeline
  function timelinePanel(shown) {
    return ui.panel({
      glyph: "🪵", title: "Timeline", sub: `up to cursor · ${shown.length} shown`,
      actions: ui.pill(anyFilter() ? "filtered" : "all events", { tone: "info" }),
      body: shown.length
        ? h("div", { class: "scroll-y maxh-360" },
            h("div", { class: "tl" }, shown.slice().reverse().map((e) => node(e))))
        : ui.empty({
            glyph: "📭", title: "Nothing before the cursor matches",
            hint: "Move the scrubber forward or clear a filter to reveal events.",
          }),
    });
  }

  function node(e) {
    const cls = isFail(e) ? "fail" : isRisk(e) ? "risk" : "";
    const atCursor = all[view.cursor] && all[view.cursor].id === e.id;
    return h("div", {
      class: `node ${cls}`,
      style: atCursor ? { background: "var(--city-mint)", borderRadius: "var(--r-sm)" } : null,
      role: "button", tabindex: "0",
      onClick: () => { const i = all.indexOf(e); if (i >= 0) { view.cursor = i; rerender(); } },
      onKeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); const i = all.indexOf(e); if (i >= 0) { view.cursor = i; rerender(); } } },
    },
      h("div", { class: "row between center", style: { gap: "8px" } },
        h("span", { style: { fontWeight: "700", fontSize: "12.5px" } }, e.title || (e.type || "event").replace(/_/g, " ")),
        h("span", { class: "muted mono", style: { fontSize: "10.5px" } }, fmt.time(e.ts))),
      h("div", { class: "row gap2", style: { marginTop: "3px", flexWrap: "wrap" } },
        ui.badge((e.type || "event").replace(/_/g, " "), evTone(e)),
        e.agent ? ui.pill(e.agent, { tone: "active" }) : null,
        e.packet ? ui.pill(e.packet) : null,
        (e.pct != null && Number.isFinite(Number(e.pct))) ? ui.pill(`${fmt.pct(e.pct)}`, { tone: Number(e.pct) >= 100 ? "ok" : "info" }) : null),
      e.detail ? h("div", { class: "muted truncate", style: { fontSize: "11.5px", marginTop: "3px" } }, e.detail) : null);
  }

  // ----------------------------------------------------------------- export
  function exportReplay() {
    try {
      const cur = all[view.cursor] || null;
      const payload = {
        kind: "baseballhelm-flight-recorder-replay",
        exported_at: new Date().toISOString(),
        product: (state && state.product) || "BaseballHelm Ultracode Command Center",
        cursor: view.cursor,
        cursor_event_id: cur ? cur.id : null,
        total_events: all.length,
        filters: {
          agent: Array.from(view.agents),
          packet: Array.from(view.packets),
          type: Array.from(view.types),
          severity: Array.from(view.severities),
        },
        event_count: filteredAll().length,
        events: filteredAll(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = h("a", { href: url, download: `flight-recorder-replay-${Date.now()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (typeof ctx.log === "function") {
        ctx.log({ type: "replay_exported", agent: "flight-recorder", packet: "task-0",
          title: "Replay exported", detail: `${payload.event_count} events at cursor ${view.cursor + 1}/${all.length}`, severity: "info" });
      }
    } catch (err) {
      root.prepend(ui.error("Export failed", String((err && err.message) || err)));
    }
  }

  // ----------------------------------------------------------------- helpers
  function lastIndex(pred) { for (let i = all.length - 1; i >= 0; i--) { if (pred(all[i])) return i; } return -1; }

  function injectCss() {
    if (document.getElementById("st-flight-recorder")) return;
    document.head.append(h("style", { id: "st-flight-recorder" }, `
      .fr-meter { display:flex; flex-direction:column; gap:5px; width:100%; text-align:left;
        background:var(--city-cream-0); border:1px solid var(--city-line); border-radius:var(--r-sm,10px);
        padding:8px 10px; cursor:pointer; transition:border-color .15s, background .15s, transform .12s; }
      .fr-meter:hover { border-color:var(--city-line-strong); background:var(--city-cream-50); }
      .fr-meter:focus-visible { outline:2px solid var(--city-turf); outline-offset:2px; }
      .fr-meter.on { border-color:var(--city-turf); background:var(--city-mint); }
      .fr-meter-head { display:flex; justify-content:space-between; align-items:center; gap:8px;
        font-size:12px; font-weight:600; color:var(--city-ink); min-width:0; }
      .fr-meter-head .truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .fr-bar { height:6px; border-radius:99px; background:var(--city-cream-200); overflow:hidden; }
      .fr-bar > i { display:block; height:100%; border-radius:99px;
        background:linear-gradient(90deg,var(--city-turf),var(--city-green-600)); }
      .fr-meter.on .fr-bar > i { background:linear-gradient(90deg,var(--city-green-600),var(--city-green-800)); }
      .chip .chip-n { margin-left:6px; font-size:10px; font-weight:700; opacity:.6;
        font-variant-numeric:tabular-nums; }
      .chip.on .chip-n { opacity:.85; }
      .fr-raw { margin:0; padding:10px; max-height:200px; overflow:auto;
        background:var(--city-green-950); color:var(--city-mint); border-radius:var(--r-sm,10px);
        font-size:11px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
      @media (prefers-reduced-motion: reduce) { .fr-meter:hover { transform:none; } }
    `));
  }
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function humanSpan(sec) {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

function statusDot(status) {
  if (status === "active") return "ok";
  if (status === "blocked") return "critical";
  if (status === "done") return "ok";
  if (status === "planned") return "warn";
  return "idle";
}

function safeJson(v) {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}
