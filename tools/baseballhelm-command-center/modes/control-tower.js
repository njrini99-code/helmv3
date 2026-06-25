/* Control Tower — the Permission Control Tower district: full-throttle safety view.
   Everything here is read LIVE off ctx:
     • risk posture stats               ← ctx.state.risks.cards (+ task0_gate)
     • the Task 0 product-code guard     ← ctx.state.task0_gate + the armed guard card
     • the Risk Warden's live vitals     ← ctx.state.agents (risk-warden)
     • risk radar (blips ringed by level)← open ctx.state.risks.cards
     • risk cards grouped by severity    ← ctx.state.risks.cards
     • the live safety/guard event feed  ← ctx.events (severity + risk/guard/security types)
     • deterministic risk classifiers    ← ctx.state.risks.rules
   No fabricated control actions, no hardcoded counts, no invented buttons.
   Honest ctx.ui.empty(...) wherever a slice is missing. Matches mission-control.

   Single safety invariant rule (the whole point of this district):
     The product-code guard is only "ARMED" while the Task 0 gate is NOT verified.
     Once gate.verified is true the line is OPEN, so the guard is STOOD DOWN even if
     the warden's card still carries status:"armed" — that stale card is surfaced as a
     distinct, honest note rather than contradicting "work may proceed". */
export const meta = { label: "Control Tower", district: "Permission Control Tower" };

/* Severity ladder. Only `blurb` is editorial copy describing what each level MEANS;
   every count, example path, card and event is pulled from live ctx — never hardcoded. */
const RISK_LEVELS = [
  { level: "critical", tone: "critical", dot: "critical", glyph: "⛔", blip: "critical",
    blurb: "Stop-the-line — product edits before Task 0, or destructive / irreversible actions." },
  { level: "high", tone: "risk", dot: "risk", glyph: "▲", blip: "risk",
    blurb: "High attention — auth / RLS / policy / migrations, secret reads, or broad deletes." },
  { level: "medium", tone: "warn", dot: "warn", glyph: "◆", blip: "warn",
    blurb: "Watch — reviewable but recoverable: dependency churn or generated-file noise." },
  { level: "low", tone: "info", dot: "info", glyph: "•", blip: "warn",
    blurb: "Informational — routine, in-scope, additive activity inside the mission boundary." },
];
const LEVEL_BY_NAME = Object.fromEntries(RISK_LEVELS.map((L) => [L.level, L]));

/* ── radar geometry: ONE source of truth ──────────────────────────────────────
   The radar is a 200px disc → 100px from rim to center. The three CSS rings sit at
   pixel insets 24 / 56 / 84 → ring radii 76 / 44 / 16px from center = 76% / 44% / 16%
   of the 100px half-radius. We express each severity as a fraction of that half-radius
   and place the blip on (or just inside) its named ring. critical → inner, low → outer.
   We also re-derive the ring insets from these fractions and inject them so the rings
   and the blips can never drift apart again. */
const RING_FRAC = { critical: 0.16, high: 0.44, medium: 0.60, low: 0.76 };
/* the three concentric guide rings we actually draw (inner → outer). */
const GUIDE_RINGS = [0.16, 0.44, 0.76];
const RADAR_PX = 200;              // .radar width/height in styles.css
const RADAR_HALF = RADAR_PX / 2;   // 100px rim→center
const fracToInsetPx = (frac) => Math.round(RADAR_HALF - frac * RADAR_HALF); // ring inset in px

/* an open card is anything not explicitly resolved/closed. */
const isOpen = (r) => r && r.status !== "resolved" && r.status !== "closed";

/* a guard card the warden explicitly "stood down" (gate verified) but never re-statused. */
const isStaleArmedGuard = (r) => !!r && (r.status === "armed");

/* ── safety event classifier ──────────────────────────────────────────────────
   The feed is labelled "Safety event feed", so it must mean safety — not routine
   ok-severity completions. A genuine safety entry is either:
     • an elevated-severity event (warn / risk / critical — NOT info, NOT ok), or
     • an event whose TYPE names a guard / risk / security / scope / gate concern.
   Plain `ok`-severity completions (packet_completed, test_passed, …) are work, not
   safety, so they no longer leak in unless their type explicitly names a guard. */
const SAFETY_TYPES = /(risk|guard|security|scope|checkpoint|control|freeze|kill|permission|verified|gate|policy|rls|secret)/i;
const ELEVATED = new Set(["warn", "warning", "risk", "high", "critical"]);
const isSafetyEvent = (e) =>
  !!e && (ELEVATED.has(String(e.severity || "").toLowerCase()) || SAFETY_TYPES.test(e.type || ""));
/* a routine completion/verification that touched the safety surface but is just "done". */
const ROUTINE_RE = /(packet_completed|packet_finished|test_passed|packet_progress)/i;
const isRoutineSafety = (e) =>
  !!e && !ELEVATED.has(String(e.severity || "").toLowerCase()) && ROUTINE_RE.test(e.type || "");

/* visual weight for an event row in the feed (drives the left accent). */
const eventTone = (e) => {
  const sev = String(e && e.severity || "").toLowerCase();
  if (sev === "critical") return "critical";
  if (sev === "risk" || sev === "high") return "risk";
  if (sev === "warn" || sev === "warning") return "warn";
  if (/risk|guard|kill|freeze|critical|breach/i.test(e && e.type || "")) return "risk";
  if (/verified|gate|checkpoint|permission/i.test(e && e.type || "")) return "ok";
  return "idle";
};

export function render(ctx) {
  const { h, ui, fmt, state, events } = ctx;
  const s = state || {};
  const risks = s.risks || {};
  const cards = Array.isArray(risks.cards) ? risks.cards : [];
  const rules = risks.rules || {};
  const open = cards.filter(isOpen);

  const byLevel = (lvl) => cards.filter((r) => (r.level || "low") === lvl);
  const openCount = (lvl) => byLevel(lvl).filter(isOpen).length;

  // ── live gate / guard facts — RECONCILED ────────────────────────────────────
  const gate = s.task0_gate || {};
  const gateOpen = !!gate.verified;
  // the deterministic stop-the-line guard card, if the warden recorded one.
  const productGuard = cards.find(
    (r) => r && (r.id === "risk-guard-product-code" || (r.level === "critical" && r.category === "scope"))
  );
  // THE INVARIANT: a guard is only truly ARMED while the gate is NOT verified.
  // Once the gate is open, the line is open — the guard is stood down even if the
  // card status still literally reads "armed".
  const guardArmed = !!productGuard && isOpen(productGuard) && !gateOpen;
  const guardStoodDown = gateOpen && !!productGuard;
  // surfaced honestly: the warden left the card status as "armed" after the gate opened.
  const guardCardStale = gateOpen && isStaleArmedGuard(productGuard);
  // one canonical label/tone/glyph used everywhere so nothing can disagree.
  const guardLabel = guardArmed ? "ARMED" : guardStoodDown ? "STOOD DOWN" : gateOpen ? "STOOD DOWN" : "PENDING";
  const guardTone = guardArmed ? "warn" : guardStoodDown ? "ok" : "idle";
  const guardGlyph = guardArmed ? "🛡" : guardStoodDown ? "✅" : "⏳";
  const guardStatValue = guardArmed ? "ARMED" : gateOpen ? "STOOD DOWN" : "—";
  const guardStatSub = guardArmed
    ? "stop-the-line active"
    : gateOpen
      ? `gate open ${fmt.ago(gate.verified_at)}`
      : "gate not verified";

  // ── the live Risk Warden agent ──────────────────────────────────────────────
  const warden = (s.agents || []).find((a) => a && (a.id === "risk-warden" || a.role === "Risk and Scope Warden"));
  const wardenLive = !!warden && warden.heartbeat === "live" && warden.status === "active";

  // ── live safety event stream — tightened + segmented ────────────────────────
  const evAll = events || [];
  const safetyEvents = evAll.filter(isSafetyEvent);          // genuine guard/risk/elevated
  const routineEvents = evAll.filter(isRoutineSafety);       // ok-severity completions (separate tier)
  const recentSafety = safetyEvents.slice(-12).reverse();
  const recentRoutine = routineEvents.slice(-6).reverse();
  const critEventCount = evAll.filter((e) => e && String(e.severity).toLowerCase() === "critical").length;
  const guardEventCount = safetyEvents.filter((e) => /risk|guard|scope|kill|freeze/i.test(e.type || "")).length;
  const gateEventCount = safetyEvents.filter((e) => /verified|gate|checkpoint|permission/i.test(e.type || "")).length;
  // last time the warden actually flagged something, from the live stream.
  const lastSafety = safetyEvents.length ? safetyEvents[safetyEvents.length - 1] : null;

  // ── top stat band ───────────────────────────────────────────────────────────
  const stats = ui.grid("c4", [
    ui.stat({ label: "Open risks", value: open.length, sub: `${cards.length} tracked total`, tone: open.length ? "risk" : "ok" }),
    ui.stat({ label: "Critical", value: openCount("critical"), sub: "stop-the-line", tone: openCount("critical") ? "risk" : "ok" }),
    ui.stat({ label: "High", value: openCount("high"), sub: "high-attention paths", tone: openCount("high") ? "warn" : "ok" }),
    ui.stat({ label: "Task 0 guard", value: guardStatValue, sub: guardStatSub, tone: guardTone }),
  ]);

  // ── Task 0 product-code guard — the single most important safety invariant ──
  const staleNote = guardCardStale
    ? h("div", { class: "ct-note ct-note-info", style: { marginTop: "8px" } },
        h("span", { class: "ct-note-glyph" }, "ℹ"),
        h("div", {},
          h("b", {}, "Gate open, card not re-statused. "),
          h("span", { class: "muted" },
            `The line is open, so this guard is stood down — but the warden's card still reads "${productGuard.status}". ` +
            `Resolve the card to clear the stale status.`)))
    : null;

  const guardPanel = ui.panel({
    glyph: guardGlyph,
    title: "Task 0 product-code guard",
    sub: s.phase || "",
    lift: true,
    actions: ui.badge(guardLabel, guardTone),
    body: h("div", { class: "stack" },
      h("div", { class: "muted", style: { fontSize: "12.5px" } },
        gateOpen
          ? `Command center verified ${fmt.ago(gate.verified_at)} — main BaseballHelm product work may proceed.`
          : "No main BaseballHelm product code may change until the command center is verified in Chrome."),
      productGuard
        ? h("div", { class: `ct-guard ct-guard-${guardArmed ? "armed" : "down"}` },
            ui.kv("Guard", productGuard.title || "—"),
            ui.kv("Effective state", guardArmed ? "ARMED — edits blocked" : "Stood down — edits allowed"),
            ui.kv("Card status", productGuard.status || "—"),
            productGuard.affected_paths && productGuard.affected_paths.length
              ? h("div", { class: "row between", style: { fontSize: "12px" } },
                  h("span", { class: "muted" }, "Watches"),
                  h("span", { class: "mono", style: { fontSize: "11px", color: "var(--city-ink-muted)" } }, productGuard.affected_paths.join(", ")))
              : null,
            productGuard.mitigation
              ? h("div", { style: { fontSize: "12px" } }, h("span", { class: "muted" }, "Mitigation: "), productGuard.mitigation)
              : null)
        : ui.empty({ glyph: "🛡", title: "No product-code guard card", hint: "The risk warden arms a critical scope guard before Task 0; none is recorded yet." }),
      staleNote,
      h("div", { class: "row wrap gap2 mt2" },
        ui.pill(`gate: ${gate.status || "unknown"}`, { tone: gateOpen ? "active" : undefined }),
        ui.pill(`verified: ${gateOpen ? "yes" : "no"}`, { dot: gateOpen, tone: gateOpen ? "active" : undefined }),
        ui.pill(`mode: ${s.permission_mode ? String(s.permission_mode).split(" ")[0] : "full-throttle"}`, { dot: true, tone: "active" }))),
  });

  // ── Risk Warden vitals (live agent) ─────────────────────────────────────────
  const wardenPanel = ui.panel({
    glyph: "👁",
    title: "Risk Warden",
    sub: warden ? warden.role : "",
    actions: warden
      ? ui.badge(warden.status || "idle", warden.status === "active" ? "active" : "idle")
      : ui.badge("offline", "idle"),
    body: warden
      ? h("div", { class: "stack" },
          h("div", { class: "row between center" },
            h("div", { class: "row center", style: { gap: "8px" } },
              ui.heartbeat(wardenLive),
              h("b", {}, warden.name || "Risk Warden")),
            ui.pill(warden.district || "Permission Control Tower")),
          ui.kv("Heartbeat", warden.heartbeat === "live" ? "live" : (warden.heartbeat || "—")),
          ui.kv("Queue depth", String(warden.queue_depth ?? 0)),
          ui.kv("Risk events flagged", String(warden.risk_events ?? guardEventCount)),
          ui.kv("Last warden update", fmt.ago(warden.last_update)),
          ui.kv("Last safety flag", lastSafety ? `${(lastSafety.type || "event").replace(/_/g, " ")} · ${fmt.ago(lastSafety.ts)}` : "—"),
          warden.notes ? h("div", { class: "mt2", style: { fontSize: "12.5px" } }, h("span", { class: "muted" }, "Note: "), warden.notes) : null,
          Array.isArray(warden.focus) && warden.focus.length
            ? h("div", { class: "stack", style: { gap: "6px", marginTop: "8px" } },
                ui.section("Watch focus"),
                h("div", { class: "row wrap gap2" }, warden.focus.map((f) => ui.badge(f, "idle"))))
            : null)
      : ui.empty({ glyph: "👁", title: "Risk warden offline", hint: "No risk-and-scope warden agent is reporting into the city yet." }),
  });

  // ── radar (live open blips) — geometry shares ONE source of truth ───────────
  const radar = h("div", { class: "radar" },
    ...GUIDE_RINGS.map((frac, i) =>
      h("div", { class: "ring", style: { inset: `${fracToInsetPx(frac)}px` }, "data-ct-ring": String(i) })));
  // deterministic angular spread so blips of the same level don't stack on each other.
  const perLevelIndex = {};
  open.forEach((r) => {
    const lvl = LEVEL_BY_NAME[r.level || "low"] ? (r.level || "low") : "low";
    const n = (perLevelIndex[lvl] = (perLevelIndex[lvl] || 0) + 1);
    const frac = RING_FRAC[lvl] != null ? RING_FRAC[lvl] : RING_FRAC.low;
    // spread each level around the circle; offset by level so levels interleave.
    const baseAngle = { critical: 18, high: 70, medium: 132, low: 200 }[lvl] ?? 0;
    const angle = (baseAngle + (n - 1) * 67) % 360;
    const rad = (angle * Math.PI) / 180;
    // frac is a fraction of the half-radius; the box is 0..100% with center at 50%,
    // so a blip at `frac` of the half-radius sits at 50% ± frac*50% — exactly on its ring.
    const cx = 50 + Math.cos(rad) * frac * 50;
    const cy = 50 + Math.sin(rad) * frac * 50;
    const L = LEVEL_BY_NAME[lvl];
    radar.append(h("div", {
      class: `blip ${L.blip}`,
      style: { left: `${cx}%`, top: `${cy}%` },
      title: `${lvl.toUpperCase()} · ${r.title || "risk"}${r.status ? " · " + r.status : ""}`,
    }));
  });
  const radarLegend = h("div", { class: "ct-radar-legend" },
    RISK_LEVELS.map((L) => {
      const c = openCount(L.level);
      return h("span", { class: "ct-radar-leg-item" + (c ? " on" : ""), "data-lvl": L.level },
        h("span", { class: `dot-state ${L.dot}` }),
        h("span", {}, `${L.level} ${c}`));
    }));
  const radarPanel = ui.panel({
    glyph: "📡", title: "Risk radar", sub: `${open.length} open blip${open.length === 1 ? "" : "s"} · rings = severity`,
    body: h("div", { class: "stack" },
      open.length
        ? h("div", { class: "stack", style: { gap: "10px" } }, radar, radarLegend)
        : ui.empty({ glyph: "📡", title: "Radar clear", hint: "No open risks. New risk events appear as blips on their severity ring (critical inner → low outer)." })),
  });

  // ── live safety event feed — segmented: guard/risk vs routine ───────────────
  const feedSub = safetyEvents.length
    ? `${safetyEvents.length} safety · ${guardEventCount} guard/risk · ${gateEventCount} gate · ${critEventCount} critical`
    : "no genuine safety events";
  const feedPanel = ui.panel({
    glyph: "🚨", title: "Safety event feed",
    sub: feedSub,
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Flight Recorder"),
    body: h("div", { class: "stack" },
      recentSafety.length
        ? h("div", { class: "scroll-y maxh-360" },
            recentSafety.map((e) => {
              const row = ui.eventRow(e);
              row.classList.add("ct-evt", `ct-evt-${eventTone(e)}`);
              return row;
            }))
        : ui.empty({ glyph: "🚨", title: "No safety events", hint: "Risk-added, guard, checkpoint, gate and elevated-severity events stream here as the warden flags activity." }),
      recentRoutine.length
        ? h("div", { class: "stack", style: { gap: "6px" } },
            ui.section("Routine verifications", ui.badge(String(routineEvents.length), "idle")),
            h("div", { class: "scroll-y maxh-280" },
              recentRoutine.map((e) => {
                const row = ui.eventRow(e);
                row.classList.add("ct-evt", "ct-evt-routine");
                return row;
              })),
            h("div", { class: "muted", style: { fontSize: "11px" } },
              "ok-severity completions on watched paths — work, not safety traffic. Kept distinct so the safety count stays honest."))
        : null),
  });

  // ── risk cards grouped by level ─────────────────────────────────────────────
  const groupPanels = RISK_LEVELS.map((L) => {
    const items = byLevel(L.level);
    const openHere = items.filter(isOpen).length;
    // real tone weight: populated groups carry their severity tone, but a group with
    // ZERO open items (all resolved) reads idle even if it has history.
    const groupTone = !items.length ? "idle" : openHere ? L.tone : "ok";
    return ui.panel({
      glyph: L.glyph, title: `${L.level[0].toUpperCase()}${L.level.slice(1)} risks`,
      sub: items.length ? `${openHere} open / ${items.length} total` : "",
      actions: ui.badge(items.length ? `${openHere}/${items.length}` : "0", groupTone),
      body: items.length
        ? h("div", { class: "stack" }, items.map((r) => ui.riskCard(r)))
        : ui.empty({ glyph: L.glyph, title: `No ${L.level} risks`, hint: "Nothing classified at this level yet." }),
    });
  });
  const cardsBlock = cards.length
    ? ui.grid("c2", groupPanels)
    : ui.panel({
        glyph: "🛡", title: "Risk cards",
        body: ui.empty({ glyph: "🛡", title: "No risks tracked", hint: "Risk cards populate from the risk warden as the build touches sensitive paths." }),
      });

  // ── deterministic risk classifiers (live rules) ─────────────────────────────
  const ruleGroup = (title, glyph, dotState, tone, list) => {
    const n = Array.isArray(list) ? list.length : 0;
    return h("div", { class: "stack", style: { gap: "6px" } },
      ui.section(h("span", { class: "row center", style: { gap: "6px" } }, h("span", {}, glyph), h("span", {}, title)),
        ui.badge(String(n), n ? tone : "idle")),
      n
        ? ui.rows(list.map((x) => ui.listRow([ui.dot(dotState), h("span", { class: "grow mono", style: { fontSize: "11.5px" } }, x)])))
        : h("div", { class: "muted", style: { fontSize: "12px" } }, "— none defined"));
  };
  const ruleCount = Object.values(rules).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  const hasRules = ruleCount > 0;
  const rulesPanel = ui.panel({
    glyph: "📜", title: "Risk classifiers", sub: hasRules ? `${ruleCount} deterministic signals` : "deterministic — how activity is scored",
    body: hasRules
      ? h("div", { class: "stack" },
          ruleGroup("High-attention paths", "🛡", "risk", "risk", rules.high_attention_paths),
          ruleGroup("High / critical commands", "⛔", "critical", "critical", rules.high_or_critical_commands),
          ruleGroup("High / critical reads", "🔑", "risk", "risk", rules.high_or_critical_reads),
          ruleGroup("Medium signals", "◆", "warn", "warn", rules.medium),
          ruleGroup("Critical guards", "⛔", "critical", "critical", rules.critical))
      : ui.empty({ glyph: "📜", title: "No classifiers defined", hint: "The risk rule-set loads from the warden's deterministic config." }),
  });

  // ── severity legend driven by live counts ───────────────────────────────────
  const legendPanel = ui.panel({
    glyph: "🗂", title: "Severity legend", sub: "live posture by level",
    body: h("div", { class: "stack" },
      RISK_LEVELS.map((L, i) =>
        h("div", {
          class: "stack",
          style: { gap: "4px", paddingBottom: "8px", borderBottom: i < RISK_LEVELS.length - 1 ? "1px dashed var(--city-line)" : "none" },
        },
          h("div", { class: "row between center" },
            h("div", { class: "row center", style: { gap: "8px" } }, ui.dot(L.dot), h("b", {}, L.level.toUpperCase())),
            ui.badge(`${openCount(L.level)} open / ${byLevel(L.level).length} total`, openCount(L.level) ? L.tone : "idle")),
          h("div", { class: "muted", style: { fontSize: "12px" } }, L.blurb)))),
  });

  // ── mode-specific CSS (idempotent, tokens only — cream/green, no black) ──────
  injectStyle(h);

  // ── assemble ────────────────────────────────────────────────────────────────
  // headline status badge agrees with the guard invariant.
  const headStatus = guardArmed
    ? ui.badge("guard ARMED", "warn")
    : gateOpen
      ? ui.badge("line OPEN", "ok")
      : ui.badge(open.length ? `${open.length} open` : "all clear", open.length ? "risk" : "ok");

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "📡", title: "Control Tower",
      sub: "Permission Control Tower — full-throttle safety view",
      actions: [
        ui.pill(s.permission_mode ? String(s.permission_mode).split(" ")[0] : "full-throttle", { dot: true, tone: "active" }),
        headStatus,
      ],
    }),
    stats,
    ui.grid("c2", [guardPanel, wardenPanel]),
    ui.grid("c2", [radarPanel, feedPanel]),
    cardsBlock,
    ui.grid("c2", [rulesPanel, legendPanel]),
  );
}

/* idempotent scoped style — premium accents only, all from existing city tokens. */
function injectStyle(h) {
  if (typeof document === "undefined" || document.getElementById("st-control-tower")) return;
  document.head.append(h("style", { id: "st-control-tower" }, `
    #mode-root .ct-note {
      display:flex; gap:8px; align-items:flex-start; padding:9px 11px; border-radius:var(--r-md);
      font-size:12px; line-height:1.45; border:1px solid var(--city-line);
      background:linear-gradient(180deg,var(--city-cream-0),var(--city-cream-100));
    }
    #mode-root .ct-note-info { border-left:4px solid var(--city-teal); }
    #mode-root .ct-note-glyph { color:var(--city-teal); font-weight:700; flex:none; }
    #mode-root .ct-guard {
      display:flex; flex-direction:column; gap:6px; padding:10px 12px; border-radius:var(--r-md);
      border:1px solid var(--city-line);
    }
    #mode-root .ct-guard-armed {
      border-left:4px solid var(--city-clay);
      background:linear-gradient(180deg,#f7ece4,#f0d4c6);
    }
    #mode-root .ct-guard-down {
      border-left:4px solid var(--city-turf);
      background:linear-gradient(180deg,#eef7ef,var(--city-mint));
    }
    #mode-root .ct-radar-legend {
      display:flex; flex-wrap:wrap; gap:8px; justify-content:center;
    }
    #mode-root .ct-radar-leg-item {
      display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600;
      padding:3px 9px; border-radius:999px; border:1px solid var(--city-line);
      background:var(--city-cream-0); color:var(--city-ink-muted); opacity:.6;
    }
    #mode-root .ct-radar-leg-item.on { opacity:1; border-color:var(--city-line-strong); color:var(--city-ink); }
    #mode-root .ct-evt { border-left:3px solid transparent; padding-left:7px; border-radius:var(--r-sm); }
    #mode-root .ct-evt-critical { border-left-color:var(--city-red); background:linear-gradient(90deg,#efc9c4 0,transparent 60%); }
    #mode-root .ct-evt-risk { border-left-color:var(--city-clay); }
    #mode-root .ct-evt-warn { border-left-color:var(--city-amber); }
    #mode-root .ct-evt-ok { border-left-color:var(--city-turf); }
    #mode-root .ct-evt-idle { border-left-color:var(--city-line-strong); }
    #mode-root .ct-evt-routine { border-left-color:var(--city-line); opacity:.78; }
  `));
}
