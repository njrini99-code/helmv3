/* Memory Library — the session archive shelved as a catalog of books & capsules.
   This is the build's institutional memory: what was produced (artifacts),
   what was decided (decisions), what mattered (milestone events), what spec
   was read (read-order), and the continuity notes a resuming agent inherits.

   EVERYTHING is read LIVE off ctx — no hardcoded counts, copy, progress, or
   placeholder rows. Honest ctx.ui.empty(...) for every missing slice.

   Live sources rendered:
     ctx.artifacts        → shelved deliverables (books): tools/docs/reports/...
     ctx.state.decisions  → decision capsules (compact; deep view = Decision Ledger)
     ctx.state.handoff    → status, read_order, next_actions, notes timeline
     ctx.state.read_order → source-layer reading shelf (spines)
     ctx.events           → milestone capsules derived from REAL emitted types
     ctx.state.packets    → what the milestones produced (done/total provenance)
     ctx.state.agents     → who authored the archive (contributing lanes)
     ctx.repo             → branch / last commit — the provenance of this catalog
     ctx.state            → product / phase / mission / session span

   Cream/green shared tokens only; one idempotent style block (#st-memory-library).
   Cross-links to Decision Ledger, Handoff Ledger, Flight Recorder, Agent Tower. */
export const meta = { label: "Memory Library", district: "Memory Library" };

const ART_GLYPH = {
  tool: "🛠", doc: "📄", report: "📊", screenshot: "🖼",
  data: "🗄", code: "📦", note: "🗒", spec: "📐", migration: "🧱",
};

/* Event types that genuinely read as durable "milestones" worth shelving.
   Only types that the build actually emits (verified against events.ndjson) —
   no ghost types. Each maps to a shelf glyph + dot tone. */
const MILESTONE_KINDS = {
  command_center_started:       { glyph: "🏗", tone: "info",     label: "Boot" },
  command_center_files_created: { glyph: "📁", tone: "ok",       label: "Scaffold" },
  command_center_verified:      { glyph: "✅", tone: "ok",       label: "Gate" },
  city_district_activated:      { glyph: "🏙", tone: "info",     label: "District" },
  plan_read_started:            { glyph: "📖", tone: "info",     label: "Read" },
  plan_read_completed:          { glyph: "📘", tone: "ok",       label: "Read ✓" },
  decision_added:               { glyph: "⚖", tone: "info",     label: "Decision" },
  packet_completed:             { glyph: "🏁", tone: "ok",       label: "Packet ✓" },
  packet_finished:              { glyph: "🏁", tone: "ok",       label: "Packet ✓" },
  handoff_note:                 { glyph: "🤝", tone: "info",     label: "Handoff" },
};
const MILESTONE_TYPES = new Set(Object.keys(MILESTONE_KINDS));

export function render(ctx) {
  const { h, ui, fmt, state, events, repo } = ctx;
  const s = state || {};

  // ---- source slices (every field guarded) ---------------------------------
  const artifacts = Array.isArray(ctx.artifacts) && ctx.artifacts.length
    ? ctx.artifacts
    : (Array.isArray(s.artifacts) ? s.artifacts : []);
  const decisions = Array.isArray(s.decisions) ? s.decisions : [];
  const notes = Array.isArray(s.handoff?.notes) ? s.handoff.notes : [];
  const readOrder = Array.isArray(s.read_order)
    ? s.read_order
    : (Array.isArray(s.handoff?.read_order) ? s.handoff.read_order : []);
  const evts = Array.isArray(events) ? events : [];
  const packets = Array.isArray(s.packets) ? s.packets : [];
  const agents = Array.isArray(s.agents) ? s.agents : [];

  const milestones = evts.filter((e) => e && MILESTONE_TYPES.has(e.type));
  // ---- per-layer read telemetry (honest, token-accurate) -------------------
  // The plan_read_* events DON'T carry a single normalizable layer string:
  //   started  → title "Reading V12 → V6"   detail "Loaded V12 Task 0, …"
  //   completed→ title "Mission contract locked" detail "Phase 0 + Phase 1 …"
  // So whole-string normLayer(title) can never match a read_order spine, AND a
  // naive includes() lights only the two endpoint tokens of a "V12 → V6" span.
  // Instead we scan BOTH title and detail of every plan_read_* event, extract
  // real layer tokens via layerTokens(), expand any explicit "Vhi → Vlo" range
  // across the actual read_order, and resolve each event to a concrete set of
  // covered layers. A completed event marks its layers READ; a started event
  // (not yet completed) marks them READING. Nothing is inferred from a bare
  // string artifact — empty resolves stay honestly 'queued'.
  const readDone = evts.filter((e) => e && e.type === "plan_read_completed");
  const readStarted = evts.filter((e) => e && e.type === "plan_read_started");
  const layerStates = resolveLayerStates(readOrder, readStarted, readDone);
  // canonical key (matches read_order[].toLowerCase) → state: "read" | "reading"
  const layersRead = new Set(
    [...layerStates.entries()].filter(([, v]) => v && v.state === "read").map(([k]) => k)
  );
  const layersReading = new Set(
    [...layerStates.entries()].filter(([, v]) => v && v.state === "reading").map(([k]) => k)
  );
  // SINGLE source of truth for the header/catalog badges so they can NEVER
  // contradict the shelf below — both count exactly the spines the shelf reads.
  const matchedReadLayers = readOrder.filter((l) => layersRead.has(normLayer(l))).length;
  const matchedReadingLayers = readOrder.filter(
    (l) => !layersRead.has(normLayer(l)) && layersReading.has(normLayer(l))
  ).length;
  const layerBadge = readOrder.length
    ? { text: `${matchedReadLayers}/${readOrder.length} layers read`, tone: matchedReadLayers > 0 ? "ok" : "idle" }
    : { text: "no read-order", tone: "idle" };

  // provenance: agents who actually contributed to the archive (authored a
  // decision, produced a milestone, or touched files).
  const contributorIds = new Set([
    ...decisions.map((d) => d && d.agent).filter(Boolean),
    ...milestones.map((m) => m && m.agent).filter(Boolean),
  ]);
  const donePackets = packets.filter((p) => p && p.status === "done").length;

  ensureStyle(h);

  // ---- top stat band -------------------------------------------------------
  const lastShelved = newestTs([
    ...artifacts.map((a) => a && a.created_at),
    ...decisions.map((d) => d && d.created_at),
    ...notes.map((n) => n && n.ts),
    ...milestones.map((m) => m && m.ts),
  ]);
  const stats = ui.grid("c4", [
    ui.stat({
      label: "Artifacts", value: artifacts.length,
      sub: artifacts.length ? typeBreakdown(artifacts) : "no books yet",
      tone: artifacts.length ? "ok" : "info",
    }),
    ui.stat({
      label: "Decisions", value: decisions.length,
      sub: "rationale capsules", tone: decisions.length ? "info" : "info",
    }),
    ui.stat({
      label: "Milestones", value: milestones.length,
      sub: donePackets ? `${donePackets} packets done` : "logged moments",
      tone: milestones.length ? "ok" : "info",
    }),
    ui.stat({
      label: "Last shelved", value: lastShelved ? fmt.ago(lastShelved) : "—",
      sub: notes.length ? `${notes.length} handoff notes` : "no notes",
      tone: "info",
    }),
  ]);

  // ---- library catalog card (session provenance) ---------------------------
  const span = (s.started_at || s.updated_at)
    ? `${s.started_at ? fmt.date(s.started_at) : "—"} → ${s.updated_at ? fmt.ago(s.updated_at) : "—"}`
    : "—";
  const catalog = ui.panel({
    glyph: "🏛", title: "Library catalog", sub: s.phase || "",
    lift: true,
    actions: ui.badge(layerBadge.text, layerBadge.tone),
    body: h("div", { class: "stack" },
      s.mission ? h("div", { class: "ml-mission" }, s.mission) : null,
      h("div", { class: "ml-cat-grid" },
        ui.kv("Catalog", s.product || "Session archive"),
        ui.kv("Session span", span),
        ui.kv("Branch", repo?.branch || s.branch || "—"),
        ui.kv("Last commit", commitLine(repo?.last_commit)),
        ui.kv("Repo", s.repo_path || "—"),
        ui.kv("Contributors", contributorIds.size
          ? `${contributorIds.size} of ${agents.length} lanes`
          : (agents.length ? `0 of ${agents.length} lanes` : "—")))),
  });

  // ---- shelf of source layers (read-order spines) --------------------------
  // Per-spine state comes from the SAME layerStates map the header badge counts,
  // so the badge can never claim progress the shelf denies. Each spine carries
  // the real event ("Loaded V12 …" / range "V12 → V6") that justifies its state.
  const queuedCount = readOrder.length - matchedReadLayers - matchedReadingLayers;
  const readPct = readOrder.length ? Math.round((matchedReadLayers / readOrder.length) * 100) : 0;
  const shelfLegend = readOrder.length
    ? h("div", { class: "ml-shelf-legend muted mono" },
        legendChip(h, ui, "ok", `${matchedReadLayers} read`),
        legendChip(h, ui, "warn", `${matchedReadingLayers} reading`),
        legendChip(h, ui, "idle", `${queuedCount} queued`))
    : null;
  const readShelf = ui.panel({
    glyph: "📖", title: "Source-layer shelf", sub: "Plan read-order — newest spec first",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Read history →"),
    body: readOrder.length
      ? h("div", { class: "stack" },
          ui.progress(readPct, {
            tone: matchedReadLayers ? undefined : "gold",
            label: matchedReadLayers
              ? `${matchedReadLayers} of ${readOrder.length} layers read through`
              : (matchedReadingLayers ? `${matchedReadingLayers} layers in progress` : "Read-order queued"),
            right: `${readPct}%`,
          }),
          shelfLegend,
          h("div", { class: "ml-shelf" }, readOrder.map((layer, i) => {
            const key = normLayer(layer);
            const entry = layerStates.get(key);
            const stState = layersRead.has(key) ? "read" : (layersReading.has(key) ? "reading" : "queued");
            const stateTone = stState === "read" ? "ok" : (stState === "reading" ? "warn" : "idle");
            const prov = entry && entry.via ? entry.via : null;
            const tip = prov
              ? `${layer} — ${stState} · ${prov}`
              : `${layer} — ${stState} · not yet logged in any plan-read event`;
            return h("div", {
                class: "ml-spine" + (stState === "read" ? " is-read" : "") + (stState === "reading" ? " is-open" : ""),
                title: tip,
              },
              h("span", { class: "ml-spine-n" }, String(i + 1)),
              h("div", { class: "ml-spine-main" },
                h("span", { class: "ml-spine-t" }, String(layer)),
                h("span", { class: "ml-spine-st mono" }, stState)),
              ui.dot(stateTone));
          })))
      : ui.empty({ glyph: "📖", title: "No read-order recorded", hint: "Source layers appear here once the plan read-order is logged." }),
  });

  // ---- artifacts as book cards --------------------------------------------
  const artifactCards = artifacts.length
    ? ui.grid("auto", artifacts
        .slice()
        .sort((a, b) => tsVal(b && b.created_at) - tsVal(a && a.created_at))
        .map((a) => artifactBook(ctx, a)))
    : ui.empty({ glyph: "📚", title: "No artifacts shelved yet", hint: "Tools, docs, reports and screenshots register here as the build produces them." });

  const artifactsPanel = ui.panel({
    glyph: "📚", title: "Artifact books",
    sub: artifacts.length ? `${artifacts.length} on the shelf` : "",
    body: artifactCards,
  });

  // ---- milestone capsules (REAL events only) -------------------------------
  const milestonesPanel = ui.panel({
    glyph: "🏁", title: "Milestone capsules",
    sub: milestones.length ? `${milestones.length} moments` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Flight Recorder →"),
    body: milestones.length
      ? h("div", { class: "scroll-y maxh-360 stack" },
          milestones.slice().reverse().map((m) => milestoneCapsule(ctx, m)))
      : ui.empty({ glyph: "🏁", title: "No milestones logged", hint: "Gate, scaffold, plan-read, district and packet-complete events surface here as capsules." }),
  });

  // ---- decision capsules (compact; Decision Ledger owns the deep view) ------
  const decisionsPanel = ui.panel({
    glyph: "🧭", title: "Decision capsules",
    sub: decisions.length ? `${decisions.length} recorded` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("decision-ledger") }, "Decision Ledger →"),
    body: decisions.length
      ? h("div", { class: "scroll-y maxh-360 stack" },
          decisions.slice().reverse().map((d) => decisionCapsule(ctx, d)))
      : ui.empty({ glyph: "🧭", title: "No decisions captured", hint: "Architecture decisions and their rationale are archived here as the build files them." }),
  });

  // ---- handoff notes shelf -------------------------------------------------
  const notesPanel = ui.panel({
    glyph: "🗒", title: "Handoff notes",
    sub: notes.length ? `${notes.length} entries` : "",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("handoff-ledger") }, "Handoff Ledger →"),
    body: notes.length
      ? h("div", { class: "scroll-y maxh-360 stack" },
          notes.slice().reverse().map((n) => noteShelfRow(ctx, n)))
      : ui.empty({ glyph: "🗒", title: "No handoff notes yet", hint: "Notes from the handoff ledger are mirrored here as the session writes them." }),
  });

  const totalCapsules = artifacts.length + decisions.length + milestones.length + notes.length;

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "📚", title: "Memory Library",
      sub: s.product || "Session archive — books, capsules & shelves",
      actions: [
        ui.pill(`${totalCapsules} capsules`, { dot: true, tone: totalCapsules ? "active" : "idle" }),
        ui.badge(layerBadge.text, layerBadge.tone),
      ],
    }),
    stats,
    catalog,
    readShelf,
    ui.grid("c2", [artifactsPanel, milestonesPanel]),
    ui.grid("c2", [decisionsPanel, notesPanel]),
  );
}

// --------------------------------------------------------------------------
function artifactBook(ctx, a) {
  const { h, ui, fmt } = ctx;
  const type = (a && a.type) ? String(a.type) : "note";
  const glyph = ART_GLYPH[type.toLowerCase()] || "📓";
  const title = (a && a.title) ? String(a.title) : "Untitled artifact";
  const summary = (a && a.summary) ? String(a.summary) : "No summary recorded.";
  const path = a && a.path ? String(a.path) : null;
  const url = a && a.url ? String(a.url) : null;
  const created = a && a.created_at ? a.created_at : null;

  return h("div", { class: "ml-book" },
    h("div", { class: "ml-book-top" },
      h("span", { class: "ml-book-glyph" }, glyph),
      ui.badge(type, "info")),
    h("div", { class: "ml-book-title" }, title),
    h("div", { class: "ml-book-sum muted" }, summary),
    path ? h("div", { class: "mono truncate ml-book-path", title: path }, path) : null,
    url ? h("div", { class: "mono truncate ml-book-url", title: url }, url) : null,
    h("div", { class: "ml-book-foot muted mono" }, created ? `shelved ${fmt.ago(created)}` : "shelved —"),
  );
}

function milestoneCapsule(ctx, m) {
  const { h, ui, fmt } = ctx;
  const kind = MILESTONE_KINDS[m.type] || { glyph: "•", tone: dotForSeverity(m.severity), label: prettyType(m.type) };
  const tone = m.severity && m.severity !== "info" ? dotForSeverity(m.severity) : kind.tone;
  return h("div", { class: "ml-milestone" },
    h("span", { class: "ml-ms-glyph" }, kind.glyph),
    h("div", { class: "grow" },
      h("div", { class: "row between center" },
        h("span", { class: "ml-ms-title" }, m.title || prettyType(m.type) || "—"),
        h("span", { class: "muted mono nowrap ml-ms-ts" }, m.ts ? fmt.ago(m.ts) : "")),
      m.detail ? h("div", { class: "ml-ms-detail muted" }, m.detail) : null,
      h("div", { class: "row wrap gap2 ml-ms-tags" },
        ui.badge(kind.label, tone),
        m.agent ? ui.pill(m.agent, { dot: true }) : null)),
  );
}

function decisionCapsule(ctx, d) {
  const { h, ui, fmt } = ctx;
  const title = (d && d.title) ? String(d.title) : "Decision";
  const decision = (d && d.decision) ? String(d.decision) : "—";
  const rationale = (d && d.rationale) ? String(d.rationale) : null;
  const alternatives = Array.isArray(d && d.alternatives) ? d.alternatives : [];
  const agent = d && d.agent ? String(d.agent) : null;
  const created = d && d.created_at ? d.created_at : null;

  return h("div", { class: "ml-capsule" },
    h("div", { class: "row between center" },
      h("div", { class: "ml-cap-title" }, title),
      created ? h("span", { class: "muted mono nowrap ml-cap-ts" }, fmt.ago(created)) : null),
    h("div", { class: "ml-cap-body" }, decision),
    rationale ? h("div", { class: "muted ml-cap-why" }, "Why: " + rationale) : null,
    alternatives.length
      ? h("div", { class: "row wrap gap2 mt2" }, alternatives.map((alt) => ui.badge("vs " + alt, "idle")))
      : null,
    agent ? h("div", { class: "mt2" }, ui.pill(agent, { dot: true })) : null,
  );
}

function noteShelfRow(ctx, n) {
  const { h, ui, fmt } = ctx;
  const text = typeof n === "string" ? n : (n && n.text ? String(n.text) : "—");
  const ts = (n && typeof n === "object" && n.ts) ? n.ts : null;
  return ui.listRow([
    ui.dot("info"),
    h("span", { class: "grow ml-note-text" }, text),
    h("span", { class: "muted mono nowrap ml-note-ts" }, ts ? fmt.ago(ts) : ""),
  ]);
}

// ---- layer-read telemetry resolution -------------------------------------
function legendChip(h, ui, tone, text) {
  return h("span", { class: "ml-legend-chip" }, ui.dot(tone), h("span", {}, text));
}

/* The read_order vocabulary is exactly: V12 V11 V10 V9 V8 V7 V6 … "older V2".
   We extract honest layer tokens from arbitrary event text:
     "Loaded V12 Task 0, …"  → ["v12"]
     "Reading V12 → V6"      → ["v12","v6"]  (an explicit range — see expand)
     "older V2 baseline"     → ["older v2"]
   Whole-string normLayer can't do this; a regex over real tokens can. */
const LAYER_TOKEN_RE = /\bv(1[0-2]|[2-9])\b|older\s+v2/gi;
function layerTokens(text) {
  if (!text) return [];
  const out = [];
  let m;
  LAYER_TOKEN_RE.lastIndex = 0;
  while ((m = LAYER_TOKEN_RE.exec(String(text))) !== null) {
    out.push(m[0].trim().toLowerCase().replace(/\s+/g, " "));
  }
  return out;
}

/* True when the raw text expresses a range between two layer tokens, e.g.
   "V12 → V6", "V12->V6", "V12 to V6". We only treat it as a range when an
   arrow/range connector actually sits between two tokens — otherwise two bare
   tokens ("V12 and Phase 1") are NOT silently expanded. */
function isRangePhrase(text) {
  if (!text) return false;
  return /\bv(?:1[0-2]|[2-9])\b\s*(?:->|→|–|—|-|to)\s*v(?:1[0-2]|[2-9])\b/i.test(String(text));
}

/* Index a layer token within the canonical read_order (by normalized equality).
   read_order keys are like "v12" / "older v2"; the lower of two indices is the
   newer (read_order is newest-first). Returns -1 if the token isn't in order. */
function layerIndex(readOrderKeys, token) {
  return readOrderKeys.indexOf(token);
}

/* Extract the set of read_order layers an event's text covers, honestly:
   - a range phrase ("V12 → V6") expands across EVERY layer in [hi..lo] of the
     real read_order, so V11/V10/V9/V8/V7 are included, not skipped;
   - a non-range event covers only the exact tokens it names;
   - text with no recognized token covers nothing.
   Returns { covered:[keys], via:phrase|null }. */
function coverageOf(evt, keys) {
  const text = [evt && evt.title, evt && evt.detail].filter(Boolean).join(" — ");
  const tokens = layerTokens(text);
  if (!tokens.length) return { covered: [], via: null, text };
  let covered;
  if (isRangePhrase(text) && tokens.length >= 2) {
    const idxs = tokens.map((t) => layerIndex(keys, t)).filter((i) => i >= 0);
    if (idxs.length >= 2) {
      const lo = Math.min(...idxs), hi = Math.max(...idxs);
      covered = keys.slice(lo, hi + 1);
    } else {
      covered = tokens.filter((t) => keys.includes(t));
    }
  } else {
    covered = tokens.filter((t) => keys.includes(t));
  }
  return { covered, via: shortPhrase(text), text };
}

/* Resolve every read_order layer to "read" | "reading" | "queued" from REAL
   plan-read telemetry, plus the event phrase ("via") that justifies it.
   Honest pairing rules:
   - a plan_read_started covers its layers as 'reading';
   - a plan_read_completed that NAMES layers marks those 'read';
   - a plan_read_completed that names NO layers (e.g. "Mission contract locked")
     closes the most-recent-preceding started read whose span it didn't yet
     close — that started event already declared the span ("Reading V12 → V6"),
     so completing it honestly promotes that span to 'read'. This makes the
     green state reachable from the real stream WITHOUT inventing coverage.
   - read is terminal; layers no event covers stay 'queued' by default. */
function resolveLayerStates(readOrder, startedEvts, doneEvts) {
  const keys = (readOrder || []).map(normLayer);
  const states = new Map(); // key → { state, via }
  for (const k of keys) states.set(k, { state: "queued", via: null });
  if (!keys.length) return states;

  const set = (key, state, via) => {
    const cur = states.get(key);
    if (!cur) return;
    if (cur.state === "read") return; // read is terminal — never downgrade
    if (state === "read" || cur.state === "queued") states.set(key, { state, via });
  };

  // 1) started events → 'reading' (in chronological order).
  const started = (startedEvts || []).slice().sort(byTs);
  for (const e of started) {
    const { covered, via } = coverageOf(e, keys);
    for (const key of covered) set(key, "reading", "reading · " + via);
  }

  // 2) completed events → 'read'. If the completed event itself names layers,
  //    use them; otherwise close the latest preceding started span.
  const done = (doneEvts || []).slice().sort(byTs);
  for (const e of done) {
    const self = coverageOf(e, keys);
    let covered = self.covered, via = self.via;
    if (!covered.length) {
      const opener = latestStartedBefore(started, e, keys);
      if (opener) { covered = opener.covered; via = opener.via; }
    }
    for (const key of covered) set(key, "read", "read · " + (via || shortPhrase(self.text)));
  }
  return states;
}

function byTs(a, b) { return tsVal(a && a.ts) - tsVal(b && b.ts); }

/* The newest plan_read_started at-or-before a completed event that actually
   covered some layers — its declared span is what the completion closes. */
function latestStartedBefore(startedSorted, doneEvt, keys) {
  const t = tsVal(doneEvt && doneEvt.ts);
  let best = null;
  for (const s of startedSorted) {
    if (tsVal(s && s.ts) > t) break;
    const cov = coverageOf(s, keys);
    if (cov.covered.length) best = cov;
  }
  return best;
}

function shortPhrase(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > 72 ? s.slice(0, 72) + "…" : s;
}

// ---- helpers --------------------------------------------------------------
function normLayer(v) { return v == null ? "" : String(v).trim().toLowerCase(); }
function tsVal(iso) { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : 0; }
function newestTs(list) {
  let best = null, bestV = -Infinity;
  for (const iso of list) { const v = tsVal(iso); if (iso && v > bestV) { bestV = v; best = iso; } }
  return best;
}
function prettyType(t) { return (t || "event").replace(/_/g, " "); }
function commitLine(c) {
  if (!c) return "—";
  const s = String(c).trim();
  return s.length > 64 ? s.slice(0, 64) + "…" : s;
}
function typeBreakdown(artifacts) {
  const counts = {};
  for (const a of artifacts) { const t = (a && a.type) ? String(a.type) : "note"; counts[t] = (counts[t] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(" · ");
}
function dotForSeverity(sev) {
  switch ((sev || "").toLowerCase()) {
    case "critical": return "critical";
    case "risk": return "risk";
    case "warn": return "warn";
    case "ok": return "ok";
    default: return "info";
  }
}

function ensureStyle(h) {
  if (typeof document === "undefined") return;
  if (document.getElementById("st-memory-library")) return;
  const css = `
    #mode-root .ml-mission{ font-size:13px; line-height:1.45; color:var(--city-ink); }
    #mode-root .ml-cat-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 18px; }
    @media (max-width:760px){ #mode-root .ml-cat-grid{ grid-template-columns:1fr; } }

    #mode-root .ml-shelf-legend{ display:flex; flex-wrap:wrap; gap:14px; font-size:10.5px; margin:-2px 0 2px; }
    #mode-root .ml-legend-chip{ display:inline-flex; align-items:center; gap:5px; }

    #mode-root .ml-shelf{ display:flex; flex-wrap:wrap; gap:var(--sp-2); }
    #mode-root .ml-spine{ display:flex; align-items:center; gap:9px; padding:8px 11px; border-radius:var(--r-sm);
      border:1px solid var(--city-line); border-left:4px solid var(--city-line-strong);
      background:linear-gradient(180deg,var(--city-cream-0),var(--city-cream-100));
      box-shadow:var(--city-shadow-soft); transition:box-shadow .18s ease, transform .18s ease; }
    #mode-root .ml-spine:hover{ box-shadow:var(--city-shadow-lifted); transform:translateY(-1px); }
    #mode-root .ml-spine.is-open{ border-left-color:var(--city-gold);
      background:linear-gradient(180deg,#fbf3df,#f3e7c8); }
    #mode-root .ml-spine.is-read{ border-left-color:var(--city-turf);
      background:linear-gradient(180deg,#eef7ef,#dcefe3); }
    #mode-root .ml-spine-n{ font-family:var(--font-mono); font-size:10px; color:var(--city-ink-muted);
      min-width:12px; text-align:right; }
    #mode-root .ml-spine-main{ display:flex; flex-direction:column; gap:1px; line-height:1.15; }
    #mode-root .ml-spine-t{ font-weight:700; font-size:12px; color:var(--city-ink); }
    #mode-root .ml-spine-st{ font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:var(--city-ink-muted); }
    #mode-root .ml-spine.is-read .ml-spine-st{ color:var(--city-green-700); }
    #mode-root .ml-spine.is-open .ml-spine-st{ color:#8a6a12; }

    #mode-root .ml-book{ display:flex; flex-direction:column; gap:6px; padding:12px;
      border:1px solid var(--city-tan); border-radius:var(--r-md);
      background:linear-gradient(180deg,var(--city-cream-0),var(--city-cream-50));
      box-shadow:var(--city-shadow-soft); min-height:120px;
      transition:box-shadow .18s ease, transform .18s ease; }
    #mode-root .ml-book:hover{ box-shadow:var(--city-shadow-lifted); transform:translateY(-1px); }
    #mode-root .ml-book-top{ display:flex; align-items:center; justify-content:space-between; }
    #mode-root .ml-book-glyph{ font-size:20px; }
    #mode-root .ml-book-title{ font-weight:700; font-size:13px; line-height:1.25; color:var(--city-ink); }
    #mode-root .ml-book-sum{ font-size:11.5px; flex:1; line-height:1.4; }
    #mode-root .ml-book-path{ font-size:11px; color:var(--city-green-700); }
    #mode-root .ml-book-url{ font-size:11px; color:var(--city-teal); }
    #mode-root .ml-book-foot{ font-size:10.5px; }

    #mode-root .ml-milestone{ display:flex; gap:10px; align-items:flex-start; padding:10px 11px;
      border:1px solid var(--city-line); border-left:3px solid var(--city-turf); border-radius:var(--r-md);
      background:linear-gradient(180deg,var(--city-cream-0),var(--city-cream-50)); }
    #mode-root .ml-ms-glyph{ font-size:16px; line-height:1.2; }
    #mode-root .ml-ms-title{ font-weight:700; font-size:12.5px; color:var(--city-ink); }
    #mode-root .ml-ms-ts{ font-size:10.5px; }
    #mode-root .ml-ms-detail{ font-size:11px; margin-top:2px; line-height:1.4; }
    #mode-root .ml-ms-tags{ margin-top:6px; }

    #mode-root .ml-capsule{ padding:12px; border:1px solid var(--city-line); border-radius:var(--r-md);
      background:linear-gradient(180deg,var(--city-cream-0),var(--city-cream-50)); }
    #mode-root .ml-cap-title{ font-weight:700; font-size:13px; color:var(--city-ink); }
    #mode-root .ml-cap-ts{ font-size:10.5px; }
    #mode-root .ml-cap-body{ font-size:12.5px; margin-top:4px; color:var(--city-ink); }
    #mode-root .ml-cap-why{ font-size:11.5px; margin-top:4px; line-height:1.4; }

    #mode-root .ml-note-text{ font-size:12.5px; line-height:1.4; color:var(--city-ink); }
    #mode-root .ml-note-ts{ font-size:10.5px; }
  `;
  document.head.append(h("style", { id: "st-memory-library" }, css));
}
