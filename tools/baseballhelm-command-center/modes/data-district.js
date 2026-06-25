/* Data District — the Supabase / schema work view, rendered ENTIRELY from LIVE
   telemetry. The previous version of this mode shipped a hardcoded fictional
   "bb_*" planned-table catalog and hunted for migration_added / table_touched /
   table_created event types that the server never emits — so it rendered
   "0 created" forever, a dead scaffold. This rewrite reads only what is actually
   happening:

     • ctx.repo.dirty / changed_files  → the real migration files on disk under
       supabase/migrations/ (these are the cranes of the Data District), the real
       RLS-test files, and touched baseball type files.
     • ctx.events                      → schema lifecycle for Data-District-owned
       packets, and the real baseball_* table names named in event detail.
     • ctx.state.agents                → the Database Crane agent (supabase-rls).
     • ctx.state.packets               → packets in the Data District + schema lanes.
     • ctx.state.risks                 → risk cards touching migrations / rls / policy.
     • ctx.state.qa                    → the RLS policy-test check status.

   Nothing is assumed from a plan. A table/migration appears only when live
   telemetry proves it. Honest ctx.ui.empty(...) whenever a slice is missing.
   Cream/green throughout; matches mission-control.js / codebase-city.js. */
export const meta = { label: "Data District", district: "Data District" };

/* The Supabase / schema work belongs to these agent lanes + packet ids. Used to
   scope which live packets and which agent this district owns. */
const DATA_LANES = new Set(["supabase-rls", "stats-integrations"]);
const DATA_AGENT_ID = "supabase-rls";

/* Risk paths that belong to the Data District (schema safety surface). */
const DATA_RISK_RE = /supabase\/migrations|(^|\/)rls|policy|policies|search_path|security\s*definer/i;

/* Normalize a repo file entry (string | {status,path}) to its path. */
function pathOf(f) {
  if (!f) return "";
  if (typeof f === "string") return f;
  return f.path || f.file || "";
}
function statusOf(f) {
  if (!f || typeof f === "string") return "";
  return f.status || "";
}

/* A migration filename like 20260624000020_baseball_import_lineage.sql →
   { ts:"20260624000020", subject:"baseball import lineage", baseball:true }.
   Honest: derives a human label from the file itself, never invents a table. */
function describeMigration(p) {
  const file = String(p).split("/").pop() || String(p);
  const m = file.match(/^(\d{8,14})[_-](.+?)\.sql$/i);
  const stamp = m ? m[1] : "";
  const rawSubject = m ? m[2] : file.replace(/\.sql$/i, "");
  const subject = rawSubject.replace(/_/g, " ").trim();
  return {
    file,
    path: p,
    stamp,
    subject,
    baseball: /baseball/i.test(file),
  };
}

/* Pull real baseball_* table names out of an event's text blobs. Honest: only
   returns identifiers that actually start with the product's table prefix, so we
   never surface a guessed/planned name — only one a build event truly mentioned. */
function baseballTablesFromEvent(e) {
  const out = new Set();
  const blobs = [e?.detail, e?.title].filter(Boolean).map(String);
  for (const b of blobs) {
    const matches = b.match(/baseball_[a-z0-9_]+/gi) || [];
    for (const mm of matches) out.add(mm.toLowerCase().replace(/_+$/, ""));
  }
  return out;
}

export function render(ctx) {
  const { h, ui, fmt } = ctx;
  const s = ctx.state || {};
  const events = Array.isArray(ctx.events) ? ctx.events : [];
  const repo = ctx.repo || {};
  const agents = Array.isArray(s.agents) ? s.agents : [];
  const packets = Array.isArray(s.packets) ? s.packets : [];

  // ---- LIVE: unify the repo's dirty + changed files, then isolate the schema
  //      surface (migrations / rls tests / baseball type files). This is the
  //      Data District's actual on-disk footprint, straight off git telemetry.
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
  const files = Array.from(byPath.values());

  const migrationFiles = files
    .filter((f) => /(^|\/)supabase\/migrations\/[^/]+\.sql$/i.test(f.path))
    .map((f) => ({ ...describeMigration(f.path), status: f.status }))
    .sort((a, b) => String(b.stamp).localeCompare(String(a.stamp)));
  const baseballMigrations = migrationFiles.filter((m) => m.baseball);

  const rlsTestFiles = files.filter((f) => /supabase\/tests|\.rls\.test\.|rls.*\.test|\/rls\//i.test(f.path));
  const typeFiles = files.filter((f) =>
    /baseball/i.test(f.path) && /(types|database)\.ts$|src\/lib\/types/i.test(f.path));

  // ---- LIVE: real baseball_* table names named in build events (not a catalog) -
  const tableMentions = new Map(); // table -> { ts, packet, agent, count }
  for (const e of events) {
    for (const name of baseballTablesFromEvent(e)) {
      const prev = tableMentions.get(name);
      if (!prev) tableMentions.set(name, { ts: e.ts || "", packet: e.packet || null, agent: e.agent || null, count: 1 });
      else { prev.count += 1; if (e.ts && e.ts > prev.ts) { prev.ts = e.ts; prev.packet = e.packet || prev.packet; prev.agent = e.agent || prev.agent; } }
    }
  }
  const namedTables = Array.from(tableMentions.entries())
    .sort((a, b) => String(b[1].ts).localeCompare(String(a[1].ts)));

  // ---- LIVE: schema lifecycle events (the Data District's working log) --------
  const schemaEvents = events.filter((e) => {
    const pkt = String(e?.packet || "");
    const ag = String(e?.agent || "");
    const blob = `${e?.title || ""} ${e?.detail || ""}`;
    return DATA_AGENT_ID === ag
      || /schema|rls|migration|baseball_|policy|import|timeline|lineage|source registry|stat_uploads/i.test(blob)
      || packets.some((p) => p.id === pkt && p.district === "Data District");
  });
  const recentSchema = schemaEvents.slice(-8).reverse();

  // ---- LIVE: the Database Crane agent + Data District packets -----------------
  const crane = agents.find((a) => a.id === DATA_AGENT_ID) || null;
  const districtPackets = packets.filter(
    (p) => p.district === "Data District" || DATA_LANES.has(p.owner_lane)
  );
  const donePackets = districtPackets.filter((p) => p.status === "done");
  const activePackets = districtPackets.filter((p) => p.status === "active");
  const blockedPackets = districtPackets.filter((p) => p.status === "blocked");

  // ---- LIVE: schema risk cards + RLS QA check --------------------------------
  const allRisks = Array.isArray(s.risks?.cards) ? s.risks.cards : [];
  const schemaRisks = allRisks.filter((r) => {
    if (r.status === "resolved") return false;
    const paths = Array.isArray(r.affected_paths) ? r.affected_paths.join(" ") : "";
    return DATA_RISK_RE.test(`${r.category || ""} ${r.title || ""} ${r.description || ""} ${paths} ${r.command || ""}`);
  });
  const rlsCheck = (Array.isArray(s.qa?.checks) ? s.qa.checks : []).find((c) => c.id === "rls") || null;
  const rlsApplied = schemaEvents.some((e) => /rls.*(helper|policy|policies)|policies written|rls.*written|capability-aware/i.test(`${e?.title} ${e?.detail}`));

  // ---- HONEST headline numbers ----------------------------------------------
  const migCount = baseballMigrations.length;
  const namedCount = namedTables.length;
  const migAppliedNote = "files written, not applied";
  // The stale honest_states string can lag behind live git; trust the repo.
  const honestMigrations = migCount
    ? `${migCount} migration file${migCount === 1 ? "" : "s"} written (not applied)`
    : (s.honest_states?.migrations || "No migrations changed yet");

  // ---- top stat band ---------------------------------------------------------
  const stats = ui.grid("c4", [
    ui.stat({
      label: "Migration files",
      value: migCount,
      sub: migCount ? "baseball_* · in working tree" : "none on disk yet",
      tone: migCount ? "ok" : "warn",
    }),
    ui.stat({
      label: "Tables named",
      value: namedCount,
      sub: namedCount ? "baseball_* cited in build events" : "none cited yet",
      tone: namedCount ? "ok" : "warn",
    }),
    ui.stat({
      label: "District packets",
      value: districtPackets.length ? `${donePackets.length}/${districtPackets.length}` : "0",
      sub: districtPackets.length ? `${activePackets.length} active · done / total` : "no schema packets",
      tone: districtPackets.length ? (donePackets.length ? "ok" : "info") : "warn",
    }),
    ui.stat({
      label: "Schema risks",
      value: schemaRisks.length,
      sub: schemaRisks.filter((r) => r.level === "critical").length + " critical open",
      tone: schemaRisks.length ? "risk" : "ok",
    }),
  ]);

  // ---- live banner: on-disk schema realization (migrations + named tables) ---
  const districtConf = districtPackets.length
    ? Math.round(districtPackets.reduce((a, p) => a + (Number(p.completion_percent) || 0), 0) / districtPackets.length)
    : 0;
  const banner = ui.panel({
    glyph: "🗄", title: "Data District — on disk, right now", lift: true,
    sub: "derived live from git + build events, never from a plan",
    actions: ui.badge(migCount ? `${migCount} MIGRATIONS` : "NO MIGRATIONS YET", migCount ? "active" : "idle"),
    body: h("div", { class: "stack" },
      ui.progress(districtConf, {
        tone: "gold",
        label: "Data District packet completion (live, weighted by packet %)",
        right: `${donePackets.length} done · ${activePackets.length} active · ${blockedPackets.length} blocked`,
      }),
      h("div", { class: "row wrap gap2 mt2" },
        ui.pill(`${migCount} migration files`, { dot: migCount > 0, tone: migCount ? "active" : undefined }),
        ui.pill(`${namedCount} tables cited`, { dot: false, tone: namedCount ? "info" : undefined }),
        ui.pill(`${rlsTestFiles.length} RLS test files`, { dot: false, tone: rlsTestFiles.length ? "info" : undefined }),
        ui.pill(`${typeFiles.length} type files`, { dot: false })),
      h("div", { class: "muted", style: { fontSize: "12px" } },
        migCount
          ? `Honest state: migrations are ${migAppliedNote} — files exist in the working tree but have not been pushed to any database. Tables light up below only when a build event names them.`
          : "Honest state: no migration files in the working tree yet. The cranes are idle until a supabase/migrations/*.sql file appears in git."),
    ),
  });

  // ---- MIGRATIONS panel — the real .sql files, newest first ------------------
  const migrationsPanel = ui.panel({
    glyph: "🏗", title: "Migration cranes", sub: "supabase/migrations/*.sql in the working tree",
    actions: ui.badge(migCount ? `${migCount} WRITTEN` : "NONE YET", migCount ? "ok" : "idle"),
    body: migrationFiles.length
      ? h("div", { class: "scroll-y maxh-360" },
          ui.rows(migrationFiles.map((m) =>
            ui.listRow([
              ui.dot(m.baseball ? "ok" : "info"),
              h("div", { class: "grow", style: { minWidth: "0" } },
                h("div", { class: "truncate", style: { fontSize: "12.5px", fontWeight: "600" } }, m.subject),
                h("div", { class: "muted mono truncate", style: { fontSize: "10px" } }, m.file)),
              m.status ? ui.badge(m.status === "??" ? "new" : m.status, m.status === "??" ? "active" : "warn") : null,
            ]))))
      : ui.empty({
          glyph: "🏗",
          title: honestMigrations,
          hint: "A crane appears here when a file under supabase/migrations/ shows up in git status. Nothing has touched the schema files yet.",
        }),
  });

  // ---- RLS & safety panel — honest until proven by events / files / QA -------
  const rlsTone = rlsCheck?.status === "passed" ? "ok"
    : rlsCheck?.status === "failed" ? "risk"
    : rlsCheck?.status === "running" ? "info" : "warn";
  const safetyPanel = ui.panel({
    glyph: "🛡", title: "RLS & schema safety", sub: "policy coverage + safety — honest until proven",
    actions: ui.badge(`RLS check: ${rlsCheck?.status || "not_run"}`, rlsTone),
    body: h("div", { class: "stack" },
      ui.kv("RLS policy file",
        rlsApplied ? "written (helpers + policies)" : "not written yet"),
      ui.kv("RLS test files (repo)", rlsTestFiles.length ? String(rlsTestFiles.length) : "none in working tree"),
      ui.kv("RLS test suite", rlsCheck ? `${rlsCheck.status}${rlsCheck.last_run ? " · " + fmt.ago(rlsCheck.last_run) : ""}` : "no check registered"),
      ui.kv("Baseball type files touched", typeFiles.length ? String(typeFiles.length) : "none yet"),
      h("div", { class: "row gap2 wrap mt2" },
        ui.badge(rlsApplied ? "policies: written" : "policies: not yet", rlsApplied ? "ok" : "warn"),
        ui.badge(typeFiles.length ? "types: aligned" : "types: not yet", typeFiles.length ? "info" : "warn"),
        ui.badge(rlsCheck?.status === "passed" ? "rls tests: passed" : "rls tests: not run", rlsCheck?.status === "passed" ? "ok" : "warn")),
      h("div", { class: "muted", style: { fontSize: "11.5px" } },
        "Every new table must ship an RLS policy and a types alignment before it counts as done. These stay 'not yet' until telemetry, repo files, or the QA suite prove otherwise."),
    ),
  });

  // ---- TABLES NAMED — the real baseball_* tables cited by build events --------
  const tablesPanel = ui.panel({
    glyph: "🗃", title: "Tables named in the build", sub: "baseball_* identifiers cited by live events — proven, not planned",
    actions: ui.badge(namedCount ? `${namedCount} CITED` : "0", namedCount ? "ok" : "idle"),
    body: namedTables.length
      ? h("div", { class: "scroll-y maxh-360" },
          ui.rows(namedTables.map(([name, info]) =>
            ui.listRow([
              ui.dot("ok"),
              h("span", { class: "grow mono truncate", style: { fontSize: "11.5px" } }, name),
              info.count > 1 ? ui.pill(`${info.count}×`, { dot: false }) : null,
              info.ts ? h("span", { class: "muted mono", style: { fontSize: "10px" } }, fmt.ago(info.ts)) : null,
            ]))))
      : ui.empty({
          glyph: "🗃",
          title: "No tables named yet",
          hint: "A table appears here only when a packet_started / file_changed event names a baseball_* table in its detail. The migration files above are the on-disk truth; this list grows as events cite specific tables.",
        }),
  });

  // ---- Database Crane agent card + Data District packets ----------------------
  const craneBody = crane
    ? h("div", { class: "stack" },
        h("div", { class: "row between center" },
          h("div", { class: "row gap2 center" },
            ui.dot(crane.status === "active" ? "ok" : crane.status === "blocked" ? "risk" : "idle"),
            h("b", {}, crane.name || crane.id),
            ui.badge(crane.status || "idle", crane.status === "active" ? "active" : crane.status === "blocked" ? "risk" : "idle")),
          ui.heartbeat(crane.heartbeat === "live")),
        crane.notes ? h("div", { class: "muted", style: { fontSize: "12px" } }, crane.notes) : null,
        crane.focus?.length ? h("div", { class: "row wrap gap2" }, crane.focus.slice(0, 6).map((f) => ui.pill(f, { dot: false }))) : null,
        h("div", { class: "row between center mt2", style: { fontSize: "11px" } },
          h("span", { class: "muted" }, `queue depth ${crane.queue_depth ?? 0} · risk events ${crane.risk_events ?? 0}`),
          h("span", { class: "muted mono" }, crane.last_update ? `updated ${fmt.ago(crane.last_update)}` : "—")))
    : ui.empty({ glyph: "🛰", title: "Database Crane agent not registered", hint: "The supabase-rls lane has not reported into agents.json yet." });
  const cranePanel = ui.panel({
    glyph: "🛰", title: "Database Crane", sub: "the agent that owns the Data District",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("agent-city") }, "Open Agent City"),
    body: craneBody,
  });

  const packetsPanel = ui.panel({
    glyph: "📦", title: "Data District packets", sub: "schema · RLS · imports · timeline · demo seed",
    actions: ui.badge(districtPackets.length ? `${donePackets.length}/${districtPackets.length} done` : "0", donePackets.length ? "ok" : districtPackets.length ? "active" : "idle"),
    body: districtPackets.length
      ? h("div", { class: "scroll-y maxh-360" },
          ui.rows(districtPackets
            .slice()
            .sort((a, b) => (b.completion_percent || 0) - (a.completion_percent || 0))
            .map((p) => {
              const tone = p.status === "done" ? "ok" : p.status === "blocked" ? "risk" : p.status === "active" ? "active" : "idle";
              return ui.listRow([
                ui.dot(p.status === "done" ? "ok" : p.status === "blocked" ? "risk" : p.status === "active" ? "info" : "idle"),
                h("div", { class: "grow", style: { minWidth: "0" } },
                  h("div", { class: "truncate", style: { fontSize: "12.5px", fontWeight: "600" } }, p.title || p.id),
                  h("div", { class: "muted mono", style: { fontSize: "10px" } }, `${p.owner_lane || "—"} · ${fmt.pct(p.completion_percent || 0)}${p.blocked_reason ? " · " + p.blocked_reason : ""}`)),
                ui.badge(p.status || "planned", tone),
              ]);
            })))
      : ui.empty({ glyph: "📦", title: "No Data District packets", hint: "Packets tagged district 'Data District' (or owned by the supabase-rls / stats-integrations lanes) appear here from work-packets.json." }),
  });

  // ---- schema risk lens (cross-links to Control Tower) -----------------------
  const riskPanel = ui.panel({
    glyph: "⚠", title: "Schema risk lens", sub: "open risks touching migrations · RLS · policies",
    lift: schemaRisks.length > 0,
    actions: schemaRisks.length
      ? h("button", { class: "btn sm ghost", onClick: () => ctx.go("control-tower") }, "Open Control Tower")
      : ui.badge("ALL CLEAR", "ok"),
    body: schemaRisks.length
      ? h("div", { class: "scroll-y maxh-280" }, ui.rows(schemaRisks.map((r) =>
          ui.listRow([
            ui.dot(r.level === "critical" ? "critical" : r.level === "high" ? "risk" : "warn"),
            h("div", { class: "grow", style: { minWidth: "0" } },
              h("div", { class: "truncate", style: { fontSize: "12.5px", fontWeight: "600" } }, r.title || r.id),
              r.description ? h("div", { class: "muted truncate", style: { fontSize: "11px" } }, r.description) : null),
            ui.badge(r.level || "info", r.level === "critical" ? "critical" : r.level === "high" ? "risk" : "warn"),
          ]))))
      : ui.empty({ glyph: "🛡", title: "No open schema risks", hint: "Risk cards naming supabase/migrations, RLS, or policies surface here. Destructive SQL and unguarded policy edits would light this up." }),
  });

  // ---- live schema worklog (the Data District's recent build events) ----------
  const worklogPanel = ui.panel({
    glyph: "📡", title: "Schema worklog", sub: "recent Data District build events",
    actions: h("button", { class: "btn sm ghost", onClick: () => ctx.go("flight-recorder") }, "Open Flight Recorder"),
    body: recentSchema.length
      ? h("div", {}, recentSchema.map(ui.eventRow))
      : ui.empty({ glyph: "📡", title: "No schema events yet", hint: "packet_started / file_changed / packet_completed events from the supabase-rls lane (and schema-tagged packets) stream here." }),
  });

  return h("div", { class: "stack" },
    ui.modeHead({
      glyph: "🗄",
      title: "Data District",
      sub: "Supabase schema, migrations & RLS — live from git + build telemetry",
      actions: [
        ui.pill(migCount ? `${migCount} migrations` : "no migrations", { dot: migCount > 0, tone: migCount ? "active" : undefined }),
        ui.badge(namedCount ? `${namedCount} tables cited` : "0 tables cited", namedCount ? "ok" : "warn"),
      ],
    }),
    stats,
    banner,
    ui.grid("c2", [migrationsPanel, safetyPanel]),
    ui.grid("c2", [tablesPanel, packetsPanel]),
    ui.grid("c2", [cranePanel, riskPanel]),
    worklogPanel,
  );
}
