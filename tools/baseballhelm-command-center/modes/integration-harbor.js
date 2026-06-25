/* Integration Harbor — the import / source-ingestion district, rendered ENTIRELY
   from LIVE telemetry.

   STALENESS REMOVED (the owner flagged this tab): the previous version shipped a
   hardcoded 15-entry `SOURCES` manifest and derived every status from constants —
   stamping every dock "import: PLANNED / direct: DEFERRED", a fixed "0 connectors
   built", "0 import-ready", and a "none wired yet" headline. None of that came
   from ctx; worse, it was FALSE against live state, where the import-source
   registry and the 9-method VendorAdapter are ~95% built and four Integration
   Harbor packets sit at 55–95% completion. A static plan masquerading as status.

   This rewrite reads only what is actually happening, scoped to the harbor:

     • ctx.state.packets   → packets in the Integration Harbor district + the
                             stats-integrations lane (source-registry, stats-center,
                             video-classes, elite-stats, …). Real completion %.
     • ctx.state.agents    → the Stats & Integrations dockmaster agent.
     • ctx.events          → import / source / vendor build events, and the real
                             vendor names cited in event text (proven, not planned).
     • ctx.state.risks     → open risk cards touching imports / sources / ingestion.
     • ctx.state.qa        → the stats / import QA check status, honest until proven.
     • ctx.state.artifacts → docs / tools the harbor produced.
     • ctx.repo            → import-related files actually in the working tree.

   A dock / vendor / source appears ONLY when live telemetry proves it. Honest
   ctx.ui.empty(...) whenever a slice is missing. Cream/green throughout; matches
   mission-control.js + data-district.js for structure, density, and polish. */
export const meta = { label: "Integration Harbor", district: "Integration Harbor" };

const DISTRICT = "Integration Harbor";
/* The import / source-ingestion work belongs to these agent lanes. Used to scope
   which live packets and which agent the harbor owns. */
const HARBOR_LANES = new Set(["stats-integrations"]);
const HARBOR_AGENT_ID = "stats-integrations";

/* Text that marks an event / risk / file / packet as harbor (ingestion) work.
   This is how we honestly pull the import surface out of shared telemetry. */
const HARBOR_RE = /import|ingest|source\s*registr|vendor|adapter|upload|csv|xlsx|\bxml\b|parser|stat\s*center|official.*scrimmage|lineage/i;

/* Vendor identities the V12 plan can ingest. We DO NOT render these as a catalog —
   they only surface when a real build event names one in its text, so the harbor
   shows proven vendors, never a wishlist. Pattern → display label. */
const VENDOR_PATTERNS = [
  { re: /game\s*-?changer/i, label: "GameChanger", kind: "stats" },
  { re: /statcrew/i, label: "StatCrew", kind: "stats" },
  { re: /presto/i, label: "Presto", kind: "stats" },
  { re: /sidearm/i, label: "SIDEARM", kind: "stats" },
  { re: /\bncaa\b/i, label: "NCAA", kind: "stats" },
  { re: /trackman/i, label: "TrackMan", kind: "dev" },
  { re: /rapsodo/i, label: "Rapsodo", kind: "dev" },
  { re: /6-?4-?3|six-?four-?three/i, label: "6-4-3 Charts", kind: "dev" },
  { re: /synergy/i, label: "Synergy", kind: "dev" },
  { re: /\btraq\b/i, label: "TRAQ", kind: "dev" },
  { re: /onform/i, label: "OnForm", kind: "video" },
  { re: /teambuildr/i, label: "TeamBuildr", kind: "lifting" },
  { re: /armcare/i, label: "ArmCare", kind: "lifting" },
  { re: /teamworks/i, label: "Teamworks", kind: "classes" },
  { re: /google\s*sheets?/i, label: "Google Sheets", kind: "generic" },
];
const KIND_GLYPH = { stats: "📊", dev: "⚙️", video: "🎬", lifting: "🏋️", classes: "🎓", generic: "🗂" };

/* Import file formats — proven only when a build event mentions one. */
const FORMAT_PATTERNS = [
  { re: /\bcsv\b/i, label: "CSV" },
  { re: /\bxlsx?\b/i, label: "XLSX" },
  { re: /\bxml\b/i, label: "XML" },
  { re: /\bpdf\b/i, label: "PDF" },
  { re: /\bjson\b/i, label: "JSON" },
];

function pathOf(f) {
  if (!f) return "";
  if (typeof f === "string") return f;
  return f.path || f.file || "";
}
function statusOf(f) {
  if (!f || typeof f === "string") return "";
  return f.status || "";
}
function eventBlob(e) {
  return `${e?.type || ""} ${e?.title || ""} ${e?.detail || ""} ${e?.source || ""} ${e?.packet || ""}`;
}
function packetTone(status) {
  return status === "done" ? "ok" : status === "blocked" ? "risk" : status === "active" ? "active" : "idle";
}
function packetDot(status) {
  return status === "done" ? "ok" : status === "blocked" ? "risk" : status === "active" ? "info" : "idle";
}

export function render(ctx) {
  const { h, ui, fmt } = ctx;
  const s = ctx.state || {};
  const events = Array.isArray(ctx.events) ? ctx.events : [];
  const repo = ctx.repo || {};
  const agents = Array.isArray(s.agents) ? s.agents : [];
  const allPackets = Array.isArray(s.packets) ? s.packets : [];

  // ---- LIVE: Integration Harbor packets (district OR stats-integrations lane) --
  const harborPackets = allPackets
    .filter((p) => p.district === DISTRICT || HARBOR_LANES.has(p.owner_lane))
    .slice()
    .sort((a, b) => (b.completion_percent || 0) - (a.completion_percent || 0));
  const donePackets = harborPackets.filter((p) => p.status === "done");
  const activePackets = harborPackets.filter((p) => p.status === "active");
  const blockedPackets = harborPackets.filter((p) => p.status === "blocked");
  const harborConf = harborPackets.length
    ? Math.round(harborPackets.reduce((a, p) => a + (Number(p.completion_percent) || 0), 0) / harborPackets.length)
    : 0;

  // ---- LIVE: import / source / vendor build events ---------------------------
  const harborEvents = events.filter((e) => {
    const ag = String(e?.agent || "");
    const pkt = String(e?.packet || "");
    if (ag === HARBOR_AGENT_ID) return true;
    if (harborPackets.some((p) => p.id === pkt)) return true;
    return HARBOR_RE.test(eventBlob(e));
  });
  const recentHarbor = harborEvents.slice(-9).reverse();

  // ---- LIVE: vendors PROVEN by build-event text (never a static catalog) ------
  const vendorHits = new Map(); // label -> { kind, count, ts, sampleTitle }
  for (const e of harborEvents) {
    const blob = eventBlob(e);
    for (const v of VENDOR_PATTERNS) {
      if (!v.re.test(blob)) continue;
      const prev = vendorHits.get(v.label);
      if (!prev) vendorHits.set(v.label, { kind: v.kind, count: 1, ts: e.ts || "", sampleTitle: e.title || "" });
      else { prev.count += 1; if (e.ts && e.ts > prev.ts) { prev.ts = e.ts; prev.sampleTitle = e.title || prev.sampleTitle; } }
    }
  }
  const vendors = Array.from(vendorHits.entries())
    .sort((a, b) => String(b[1].ts).localeCompare(String(a[1].ts)));

  // ---- LIVE: import formats actually cited in build-event text ----------------
  const formatHits = new Map(); // label -> count
  for (const e of harborEvents) {
    const blob = eventBlob(e);
    for (const f of FORMAT_PATTERNS) {
      if (f.re.test(blob)) formatHits.set(f.label, (formatHits.get(f.label) || 0) + 1);
    }
  }
  const formats = Array.from(formatHits.entries()).sort((a, b) => b[1] - a[1]);

  // ---- LIVE: import-related files in the working tree (git telemetry) ---------
  const byPath = new Map();
  for (const f of (Array.isArray(repo.changed_files) ? repo.changed_files : [])) {
    const p = pathOf(f);
    if (p && !byPath.has(p)) byPath.set(p, { path: p, status: statusOf(f) });
  }
  for (const f of (Array.isArray(repo.dirty) ? repo.dirty : [])) {
    const p = pathOf(f);
    if (!p) continue;
    if (byPath.has(p)) { if (!byPath.get(p).status) byPath.get(p).status = statusOf(f); }
    else byPath.set(p, { path: p, status: statusOf(f) });
  }
  const importFiles = Array.from(byPath.values()).filter((f) =>
    /import|ingest|source|vendor|adapter|parser|upload|gamechanger|statcrew|trackman/i.test(f.path));

  // ---- LIVE: the Stats & Integrations dockmaster agent ------------------------
  const dockmaster = agents.find((a) => a.id === HARBOR_AGENT_ID) || null;

  // ---- LIVE: open risk cards touching the ingestion surface -------------------
  const allRisks = Array.isArray(s.risks?.cards) ? s.risks.cards : [];
  const harborRisks = allRisks.filter((r) => {
    if (r.status === "resolved") return false;
    const paths = Array.isArray(r.affected_paths) ? r.affected_paths.join(" ") : "";
    return HARBOR_RE.test(`${r.category || ""} ${r.title || ""} ${r.description || ""} ${paths} ${r.command || ""}`);
  });

  // ---- LIVE: the stats / import QA check, honest until proven -----------------
  const qaChecks = Array.isArray(s.qa?.checks) ? s.qa.checks : [];
  const importCheck = qaChecks.find((c) =>
    /import|source|stat|ingest/i.test(`${c.id || ""} ${c.command || ""} ${c.note || ""}`)) || null;

  // ---- LIVE: artifacts the harbor produced (docs / tools naming the plan) -----
  const allArtifacts = Array.isArray(s.artifacts) ? s.artifacts
    : (Array.isArray(ctx.artifacts) ? ctx.artifacts : []);
  const harborArtifacts = allArtifacts.filter((a) =>
    HARBOR_RE.test(`${a.title || ""} ${a.summary || ""} ${a.path || ""}`));

  // -------------------------------------------------------- mode-specific CSS --
  if (!document.getElementById("st-integration-harbor")) {
    document.head.append(h("style", { id: "st-integration-harbor" },
      `.harbor-wharf{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
       .harbor-berth{position:relative;border:1px solid var(--city-line);border-radius:14px;padding:12px 12px 11px;
         background:linear-gradient(170deg,var(--city-cream-50),var(--city-cream-100));overflow:hidden}
       .harbor-berth::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
         background:var(--city-turf);opacity:.55}
       .harbor-berth .v{font-weight:700;font-size:13px;color:var(--city-ink);letter-spacing:.01em}
       .harbor-berth .k{font-size:10px;color:var(--city-ink-muted);text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
       .harbor-berth .c{position:absolute;right:9px;top:9px;font-size:11px;font-weight:700;color:var(--city-turf)}
       .harbor-fmt{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--city-line);
         border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;color:var(--city-green-700);
         background:var(--city-mint)}
       .harbor-fmt b{font-variant-numeric:tabular-nums;color:var(--city-ink-muted);font-weight:600}`));
  }

  // ----------------------------------------------------- top readiness band -----
  const stats = ui.grid("c4", [
    ui.stat({
      label: "Harbor packets",
      value: harborPackets.length ? `${donePackets.length}/${harborPackets.length}` : "0",
      sub: harborPackets.length ? `${activePackets.length} active · done / total` : "none catalogued yet",
      tone: harborPackets.length ? (donePackets.length ? "ok" : "info") : "warn",
    }),
    ui.stat({
      label: "Ingestion progress",
      value: fmt.pct(harborConf),
      sub: harborPackets.length ? "live, weighted by packet %" : "no packets to weight",
      tone: harborConf >= 90 ? "ok" : harborConf > 0 ? "info" : "warn",
    }),
    ui.stat({
      label: "Vendors cited",
      value: vendors.length,
      sub: vendors.length ? "named in build events" : "none cited yet",
      tone: vendors.length ? "ok" : "warn",
    }),
    ui.stat({
      label: "Harbor risks",
      value: harborRisks.length,
      sub: `${harborRisks.filter((r) => r.level === "critical").length} critical open`,
      tone: harborRisks.length ? "risk" : "ok",
    }),
  ]);

  // ----------------------------------------------------- live status banner -----
  const banner = ui.panel({
    glyph: "⚓", title: "Integration Harbor — live ingestion state", lift: true,
    sub: "derived from packets + build events, never from a plan",
    actions: ui.badge(
      blockedPackets.length ? `${blockedPackets.length} BLOCKED`
        : activePackets.length ? `${activePackets.length} ACTIVE`
        : harborPackets.length ? "ALL DONE" : "NO PACKETS",
      blockedPackets.length ? "risk" : activePackets.length ? "active" : harborPackets.length ? "ok" : "idle"),
    body: h("div", { class: "stack" },
      ui.progress(harborConf, {
        tone: "gold",
        label: "Integration Harbor packet completion (live)",
        right: `${donePackets.length} done · ${activePackets.length} active · ${blockedPackets.length} blocked`,
      }),
      h("div", { class: "row wrap gap2 mt2" },
        ui.pill(`${harborPackets.length} ingestion packets`, { dot: harborPackets.length > 0, tone: harborPackets.length ? "active" : undefined }),
        ui.pill(`${vendors.length} vendors cited`, { dot: false, tone: vendors.length ? "info" : undefined }),
        ui.pill(`${formats.length} formats seen`, { dot: false, tone: formats.length ? "info" : undefined }),
        ui.pill(`${importFiles.length} import files in tree`, { dot: false })),
      h("div", { class: "muted", style: { fontSize: "12px" } },
        harborPackets.length
          ? `Honest state: ingestion work is in the working tree, not deployed — nothing has been pushed to a live database or wired to a real vendor account (no credentials exist). The docks below populate only as build events prove them; this is what telemetry actually shows, not the V12 wishlist.`
          : "Honest state: no Integration Harbor packets have reported in yet. The docks stay empty until a source-registry / stats-center packet appears in work-packets.json.")),
  });

  // ----------------------------------------------- packets panel (the docks) ----
  const packetsPanel = ui.panel({
    glyph: "📦", title: "Ingestion packets", sub: "source registry · stats center · video/classes · elite stats",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("factory-floor") }, "Open Factory Floor"),
    body: harborPackets.length
      ? h("div", { class: "scroll-y maxh-360" },
          ui.rows(harborPackets.map((p) =>
            ui.listRow([
              ui.dot(packetDot(p.status)),
              h("div", { class: "grow", style: { minWidth: "0" } },
                h("div", { class: "truncate", style: { fontSize: "12.5px", fontWeight: "600" } }, p.title || p.id),
                h("div", { class: "muted mono", style: { fontSize: "10px" } },
                  `${p.owner_lane || "—"} · ${fmt.pct(p.completion_percent || 0)}${p.blocked_reason ? " · " + p.blocked_reason : ""}`)),
              h("span", { class: "muted mono", style: { fontSize: "11px" } }, fmt.pct(p.completion_percent || 0)),
              ui.badge((p.status || "planned").toUpperCase(), packetTone(p.status)),
            ]))))
      : ui.empty({
          glyph: "📦", title: "No ingestion packets yet",
          hint: "Packets tagged district 'Integration Harbor' (or owned by the stats-integrations lane) appear here from work-packets.json.",
        }),
  });

  // ----------------------------------------------- dockmaster agent panel -------
  const dockBody = dockmaster
    ? h("div", { class: "stack" },
        h("div", { class: "row between center" },
          h("div", { class: "row gap2 center" },
            ui.dot(dockmaster.status === "active" ? "ok" : dockmaster.status === "blocked" ? "risk" : "idle"),
            h("b", {}, dockmaster.name || dockmaster.id),
            ui.badge(dockmaster.status || "idle", dockmaster.status === "active" ? "active" : dockmaster.status === "blocked" ? "risk" : "idle")),
          ui.heartbeat(dockmaster.heartbeat === "live")),
        dockmaster.notes ? h("div", { class: "muted", style: { fontSize: "12px" } }, dockmaster.notes) : null,
        dockmaster.focus?.length
          ? h("div", { class: "row wrap gap2" }, dockmaster.focus.slice(0, 6).map((f) => ui.pill(f, { dot: false })))
          : null,
        h("div", { class: "row between center mt2", style: { fontSize: "11px" } },
          h("span", { class: "muted" }, `queue depth ${dockmaster.queue_depth ?? 0} · risk events ${dockmaster.risk_events ?? 0}`),
          h("span", { class: "muted mono" }, dockmaster.last_update ? `updated ${fmt.ago(dockmaster.last_update)}` : "—")))
    : ui.empty({ glyph: "🛰", title: "Dockmaster agent not registered", hint: "The stats-integrations lane has not reported into agents.json yet." });
  const dockPanel = ui.panel({
    glyph: "🛰", title: "Dockmaster", sub: "the agent that owns Integration Harbor",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("agent-city") }, "Open Agent City"),
    body: dockBody,
  });

  // ----------------------------------------------- vendors proven by events -----
  const vendorsPanel = ui.panel({
    glyph: "🚢", title: "Vendor sources cited", sub: "proven by build events — not a wishlist",
    actions: ui.badge(vendors.length ? `${vendors.length} CITED` : "0", vendors.length ? "ok" : "idle"),
    body: vendors.length
      ? h("div", { class: "harbor-wharf" }, vendors.map(([label, info]) =>
          h("div", { class: "harbor-berth" },
            h("span", { class: "c" }, info.count > 1 ? `${info.count}×` : "•"),
            h("div", { class: "v" }, `${KIND_GLYPH[info.kind] || "•"} ${label}`),
            h("div", { class: "k" }, info.kind),
            info.ts ? h("div", { class: "muted mono", style: { fontSize: "10px", marginTop: "6px" } }, `cited ${fmt.ago(info.ts)}`) : null)))
      : ui.empty({
          glyph: "🚢", title: "No vendor cited yet",
          hint: "A vendor (GameChanger, StatCrew, TrackMan, …) docks here only when a build event names it. The ingestion packets carry the work; this list grows as events mention specific sources.",
        }),
  });

  // ----------------------------------------------- formats + import files -------
  const formatsBody = h("div", { class: "stack" },
    formats.length
      ? h("div", { class: "row wrap gap2" }, formats.map(([label, count]) =>
          h("span", { class: "harbor-fmt" }, label, h("b", {}, `${count}×`))))
      : ui.empty({ glyph: "🧾", title: "No import format cited yet", hint: "CSV / XLSX / XML / PDF light up as build events mention them." }),
    importFiles.length
      ? h("div", { class: "stack", style: { marginTop: "10px" } },
          ui.section(`Import files in working tree · ${importFiles.length}`),
          h("div", { class: "scroll-y maxh-280" },
            ui.rows(importFiles.slice(0, 24).map((f) =>
              ui.listRow([
                ui.dot(f.status === "??" ? "info" : "warn"),
                h("span", { class: "grow mono truncate", style: { fontSize: "11px" } }, f.path),
                f.status ? ui.badge(f.status === "??" ? "new" : f.status, f.status === "??" ? "active" : "warn") : null,
              ])))))
      : null);
  const formatsPanel = ui.panel({
    glyph: "🧾", title: "Formats & import files", sub: "what the harbor can read, proven on disk + in events",
    actions: ui.badge(importFiles.length ? `${importFiles.length} FILES` : formats.length ? `${formats.length} FORMATS` : "NONE", importFiles.length || formats.length ? "info" : "idle"),
    body: formatsBody,
  });

  // ----------------------------------------------- harbor risk lens -------------
  const riskPanel = ui.panel({
    glyph: "⚠", title: "Ingestion risk lens", sub: "open risks touching imports · sources · adapters",
    lift: harborRisks.length > 0,
    actions: harborRisks.length
      ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "Open Control Tower")
      : ui.badge("ALL CLEAR", "ok"),
    body: harborRisks.length
      ? h("div", { class: "scroll-y maxh-280" }, ui.rows(harborRisks.map((r) =>
          ui.listRow([
            ui.dot(r.level === "critical" ? "critical" : r.level === "high" ? "risk" : "warn"),
            h("div", { class: "grow", style: { minWidth: "0" } },
              h("div", { class: "truncate", style: { fontSize: "12.5px", fontWeight: "600" } }, r.title || r.id),
              r.description ? h("div", { class: "muted truncate", style: { fontSize: "11px" } }, r.description) : null),
            ui.badge(r.level || "info", r.level === "critical" ? "critical" : r.level === "high" ? "risk" : "warn"),
          ]))))
      : ui.empty({
          glyph: "🛡", title: "No open ingestion risks",
          hint: "Risk cards naming imports, source registry, vendor adapters, or upload parsing surface here. A bad parser or an unguarded ingest path would light this up.",
        }),
  });

  // ----------------------------------------------- QA + artifacts ---------------
  const qaTone = importCheck?.status === "passed" ? "ok"
    : importCheck?.status === "failed" ? "risk"
    : importCheck?.status === "running" ? "info" : "warn";
  const qaArtifactsPanel = ui.panel({
    glyph: "🔬", title: "Ingestion QA & artifacts", sub: "honest until proven by the QA suite",
    actions: ui.badge(importCheck ? `check: ${importCheck.status}` : "no import check", importCheck ? qaTone : "idle"),
    body: h("div", { class: "stack" },
      ui.kv("Import / stats check",
        importCheck ? `${importCheck.status}${importCheck.last_run ? " · " + fmt.ago(importCheck.last_run) : ""}` : "no check registered"),
      importCheck?.command ? ui.kv("Command", importCheck.command) : null,
      ui.kv("Vendors proven", vendors.length ? `${vendors.length} cited in events` : "none yet"),
      ui.kv("Formats proven", formats.length ? formats.map(([l]) => l).join(", ") : "none yet"),
      harborArtifacts.length
        ? h("div", { class: "stack", style: { marginTop: "6px" } },
            ui.section(`Harbor artifacts · ${harborArtifacts.length}`),
            ui.rows(harborArtifacts.map((a) =>
              ui.listRow([
                ui.dot("info"),
                h("div", { class: "grow", style: { minWidth: "0" } },
                  h("div", { class: "truncate", style: { fontSize: "12px", fontWeight: "600" } }, a.title || a.id),
                  a.path ? h("div", { class: "muted mono truncate", style: { fontSize: "10px" } }, a.path) : null),
                a.type ? ui.badge(a.type, "idle") : null,
              ]))))
        : h("div", { class: "muted", style: { fontSize: "11.5px" } },
            "No harbor-specific artifact registered yet. Importer docs and tools appear here once an artifact names the ingestion surface.")),
  });

  // ----------------------------------------------- live worklog ----------------
  const worklogPanel = ui.panel({
    glyph: "📡", title: "Harbor worklog", sub: "recent import / source build events",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Open Flight Recorder"),
    body: recentHarbor.length
      ? h("div", {}, recentHarbor.map(ui.eventRow))
      : ui.empty({
          glyph: "📡", title: "No import activity yet",
          hint: "packet_started / file_changed events from the stats-integrations lane (and import-tagged packets) stream here as the harbor builds.",
        }),
  });

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "⚓",
      title: "Integration Harbor",
      sub: "Stat & source ingestion — live from packets, events & git",
      actions: [
        ui.pill(harborPackets.length ? `${fmt.pct(harborConf)} ingested` : "no packets", { dot: harborPackets.length > 0, tone: harborConf >= 90 ? "active" : undefined }),
        ui.badge(vendors.length ? `${vendors.length} vendors cited` : "0 vendors cited", vendors.length ? "ok" : "warn"),
      ],
    }),
    stats,
    banner,
    ui.grid("c2", [packetsPanel, dockPanel]),
    ui.grid("c2", [vendorsPanel, formatsPanel]),
    ui.grid("c2", [riskPanel, qaArtifactsPanel]),
    worklogPanel,
  );
}
