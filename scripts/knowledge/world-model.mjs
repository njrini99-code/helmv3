#!/usr/bin/env node
/**
 * world-model.mjs — generate the Helm World Model graph:
 * `docs/generated/WORLD_MODEL.json` (structured) and
 * `docs/generated/WORLD_MODEL.md` (a readable summary), plus a
 * `--impact <file|feature>` blast-radius read model.
 *
 * `CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §3 (Phase E) asks for a
 * dependency GRAPH, not another ownership map — `memory/registry.yml` and
 * `src/lib/admin/feature-registry.ts` already answer "who owns this file",
 * and this generator answers "what does touching this feature put at risk".
 *
 * EVERY SEMANTIC EDGE CARRIES EVIDENCE, NEVER AN UNATTRIBUTED ONE (E.4/E.7)
 *
 *   registry_glob        a memory/registry.yml code glob declared this path
 *   migration_schema      a CREATE TABLE in a migration this feature's own
 *                          db: glob matches
 *   rpc_call               a `.rpc('name', ...)` call site inside a file this
 *                          feature owns, matched against a CREATE FUNCTION
 *                          this repo's migrations define
 *   registry_declaration   memory/registry.yml's observability.feature_keys
 *                          names a runtime FeatureKey
 *   feature_doc_contract    another registry feature id appears
 *                          backtick-quoted in this feature's own current-
 *                          state doc, and the sentence is not a negation
 *                          ("not to be confused with") — see world-model-core.mjs
 *   import_graph            a bounded TypeScript import walk over each
 *                          feature's own actions/services files — ALWAYS
 *                          weak (E.7: "an import graph is NOT automatically
 *                          a product dependency graph"), never promoted to
 *                          the same confidence as the kinds above, and
 *                          `--impact` labels every edge it produces `weak`
 *
 * WHAT THIS GENERATOR DOES NOT INVENT
 *
 * `memory/journeys/*.yml` does not exist on this branch (verified: `find
 * memory/journeys` fails). The plan names it as an input IF the parallel
 * "Track C" session has landed it; it has not, as of this generation, so the
 * journeys node list is empty and `notes.journeys` says so explicitly rather
 * than silently reporting zero journeys as "no journeys exist". The loader
 * (`loadJourneys` below) re-checks the directory every run, so this becomes
 * real the moment that branch merges — no code change needed here.
 *
 * `src/lib/inngest/functions.ts` maps to NO registry feature today (verified
 * with `npm run knowledge:map -- --files src/lib/inngest/functions.ts` ->
 * `impactedFeatures: []`) — a real, pre-existing gap this generator surfaces
 * rather than papers over by guessing a feature from an Inngest event name.
 *
 * DETERMINISM: sorted throughout (`sortWorldModel`), nothing reads the clock,
 * no timestamp in the committed artifact — the same reason
 * `gen-feature-map.ts` and `document-inventory.mjs` avoid one: a `--check`
 * gate over a self-timestamping file can never pass twice in a row.
 *
 * Usage:
 *   node scripts/knowledge/world-model.mjs                    # write
 *   node scripts/knowledge/world-model.mjs --check             # verify, no write
 *   node scripts/knowledge/world-model.mjs --impact <file|feature>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRegistry, matchGlob, flattenCodePatterns } from './lib/registry.mjs';
import {
  resolvePrimaryFeature,
  extractDocFeatureCrossRefs,
  extractInvariantsFromSource,
  cronPathToRouteFile,
  mergeEdges,
  sortWorldModel,
  walkImpact,
  resolveImpactTarget,
} from './lib/world-model-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_JSON = resolve(ROOT, 'docs/generated/WORLD_MODEL.json');
const OUT_MD = resolve(ROOT, 'docs/generated/WORLD_MODEL.md');

const isEntrypoint =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** Every tracked file, never a filesystem walk — see AGENTS.md's `.worktrees/` incident. */
function trackedFiles() {
  return git(['ls-files']).trim().split('\n').filter(Boolean);
}

function readTracked(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/**
 * Strip SQL `--` line comments and `/* ... *\/` block comments before
 * scanning a migration for `CREATE TABLE`/`CREATE FUNCTION`.
 *
 * Found necessary by running this generator against real migrations, not
 * theorised: `20260710020000_baseball_settings_audit_log_column_reconcile.sql`
 * has the ENGLISH SENTENCE "-- 20260624000090's CREATE TABLE runs against a
 * fresh DB" in a comment, and another migration's comment prose discussing a
 * hypothetical future `CREATE TABLE IF NOT EXISTS` split its own phrase
 * across a line break. Both matched the unstripped regex and produced
 * garbage table nodes (`runs`, `IF`) — evidence that was never real schema.
 * Not a full SQL tokenizer (a `--` inside a quoted string literal would still
 * be stripped) — good enough for migration files, which do not put `--` in
 * string literals in this codebase, verified by the absence of any table
 * whose name starts with a comment fragment after this fix.
 */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Feature-key metadata (spawns tsx once — see lib/dump-feature-keys.mjs)
// ---------------------------------------------------------------------------
function loadFeatureKeyMetadata() {
  const tsx = resolve(ROOT, 'node_modules/.bin/tsx');
  if (!existsSync(tsx)) {
    console.error(
      'world-model: node_modules/.bin/tsx is missing, so FEATURE_REGISTRY metadata\n' +
        'could NOT be read. Install dependencies and re-run.',
    );
    process.exit(2);
  }
  const out = execFileSync(tsx, [resolve(ROOT, 'scripts/knowledge/lib/dump-feature-keys.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// Journeys — stub loader (memory/journeys/*.yml does not exist yet)
// ---------------------------------------------------------------------------
function loadJourneys() {
  const dir = resolve(ROOT, 'memory/journeys');
  if (!existsSync(dir)) {
    return { journeys: [], note: 'memory/journeys/ does not exist on this branch — journeys node list is empty, not a claim that no journeys exist.' };
  }
  const files = git(['ls-files', 'memory/journeys/*.yml']).trim().split('\n').filter(Boolean);
  if (files.length === 0) {
    return { journeys: [], note: 'memory/journeys/ exists but contains no tracked *.yml files.' };
  }
  // Minimal YAML-free reader for the one shape this loader promises: an `id:`
  // and a `features:` list, same tolerant line-based approach as lib/registry.mjs.
  const journeys = [];
  for (const file of files) {
    const text = readTracked(file);
    const idMatch = text.match(/^id:\s*(.+)$/m);
    const featureLines = [...text.matchAll(/^\s*-\s*([a-z][a-z0-9_]*)\s*$/gm)];
    if (!idMatch) continue;
    journeys.push({
      id: idMatch[1].trim(),
      source: file,
      features: featureLines.map((m) => m[1]).sort(),
    });
  }
  return { journeys: journeys.sort((a, b) => a.id.localeCompare(b.id)), note: null };
}

// ---------------------------------------------------------------------------
// Build the model
// ---------------------------------------------------------------------------
async function buildModel() {
  const registry = await loadRegistry(ROOT);
  const files = trackedFiles();
  // Exclude this generator's own output from every input scan — a report
  // that can read itself never converges (document-inventory.mjs's own rule).
  const scannableFiles = files.filter(
    (f) => f !== 'docs/generated/WORLD_MODEL.json' && f !== 'docs/generated/WORLD_MODEL.md',
  );

  const featureIds = new Set(Object.keys(registry.features ?? {}));
  const rawEdges = [];
  const nodes = {
    features: [],
    routes: [],
    components: [],
    apis: [],
    actions: [],
    services: [],
    tests: [],
    tables: [],
    rpcs: [],
    jobs: [],
    invariants: [],
    sentrySignals: [],
    journeys: [],
  };

  // --- Feature nodes + declared-surface nodes (registry_glob evidence) -----
  const CATEGORY_TO_NODE_KIND = {
    routes: ['routes', 'feature_route'],
    components: ['components', 'feature_component'],
    api: ['apis', 'feature_api'],
    actions: ['actions', 'feature_action'],
    services: ['services', 'feature_service'],
    tests: ['tests', 'feature_test'],
  };
  const seenPatternNode = new Set();
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    nodes.features.push({
      id,
      name: feature.name ?? id,
      criticality: feature.criticality ?? 'medium',
      owner: feature.owner ?? 'unknown',
      status: feature.status ?? 'unknown',
    });
    for (const [category, [nodeArrayKey, edgeKind]] of Object.entries(CATEGORY_TO_NODE_KIND)) {
      const patterns = feature.code?.[category] ?? [];
      for (const pattern of patterns) {
        const nodeId = `${category}:${pattern}`;
        if (!seenPatternNode.has(nodeId)) {
          seenPatternNode.add(nodeId);
          nodes[nodeArrayKey].push({ id: nodeId, pattern, category });
        }
        rawEdges.push({
          source: id,
          target: nodeId,
          kind: edgeKind,
          evidence: { kind: 'registry_glob', path: 'memory/registry.yml', pattern },
        });
      }
    }
  }

  // --- Tables + RPC definitions from each feature's own db: migrations -----
  const rpcDefinedIn = new Map(); // rpc name -> migration path
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const dbPatterns = feature.code?.db ?? [];
    if (dbPatterns.length === 0) continue;
    const matchedMigrations = scannableFiles.filter(
      (f) => f.startsWith('supabase/migrations/') && dbPatterns.some((p) => matchGlob(p, f)),
    );
    for (const migration of matchedMigrations.sort()) {
      let text;
      try {
        text = stripSqlComments(readTracked(migration));
      } catch {
        continue;
      }
      for (const m of text.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?"?(\w+)"?/gi)) {
        const table = m[1];
        if (!nodes.tables.some((t) => t.id === table)) nodes.tables.push({ id: table, definedIn: [] });
        const node = nodes.tables.find((t) => t.id === table);
        if (!node.definedIn.includes(migration)) node.definedIn.push(migration);
        rawEdges.push({
          source: id,
          target: table,
          kind: 'feature_table',
          evidence: { kind: 'migration_schema', path: migration },
        });
      }
      for (const m of text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+(?:public\.)?(\w+)/gi)) {
        rpcDefinedIn.set(m[1], migration);
      }
    }
  }
  for (const [rpc, migration] of rpcDefinedIn) {
    nodes.rpcs.push({ id: rpc, definedIn: migration });
  }

  // --- RPC call sites: one repo-wide git grep, resolved to primary feature -
  let rpcCallHits = [];
  try {
    // -P (PCRE), not -E (POSIX ERE): ERE has no \s, and a silent zero-match
    // ratchet on that mistake is exactly the semgrep-false-zero trap this
    // repo's own conventions warn about — verified against `main` (the -E
    // form here returned 0 hits repo-wide; -P returns real hits).
    //
    // `\b` (not a literal `\.`) so this catches BOTH call shapes this repo
    // actually uses: the method form `supabase.rpc('x', ...)` and the bare
    // wrapper form `await rpc('x', ...)` from `src/lib/admin/data/rpc.ts` (a
    // thin retry/telemetry wrapper — `src/app/admin/actions/resolve-error.ts`
    // and 12 other files call it this way). A `.`-anchored pattern misses the
    // bare form entirely: `admin-incidents.md` names `resolve_admin_event` as
    // load-bearing, but `resolve-error.ts` calls it via the bare wrapper, so
    // the dot-anchored pattern produced ZERO `feature_rpc` edges for
    // `admin_incidents` — an evidence extractor asserting absence is worse
    // than one that just misses a feature. `\b` matches a `.`→word-char
    // transition too (`.` is non-word), so one pattern covers both shapes
    // without a second grep pass. Verified against `main`: the dot-anchored
    // form returned fewer hits than this one, and the added hits are real
    // `rpc('...')` call sites, not noise (no `fooRpc(`/`rpcFoo(` false hits —
    // `\b` requires an actual word-boundary immediately before `rpc`).
    rpcCallHits = git(['grep', '-nP', "\\brpc\\(\\s*['\"][a-zA-Z_][a-zA-Z0-9_.]*['\"]", '--', '*.ts', '*.tsx'])
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    // git grep exits 1 on zero matches — not an error here. Anything else
    // (128 = this git build lacks PCRE support, e.g. a minimal CI image) is a
    // real failure and must not silently degrade the model — that is the
    // exact "-E returned 0 hits and nobody noticed" trap this file's own
    // history records, and staying silent on exit 128 would reintroduce it
    // the moment this runs somewhere the previous fix wasn't verified.
    if (err.status !== 1) throw err;
    rpcCallHits = [];
  }
  for (const hit of rpcCallHits) {
    const [filePart, ...rest] = hit.split(':');
    const lineMatch = hit.match(/^[^:]+:(\d+):/);
    if (!lineMatch) continue;
    const line = Number(lineMatch[1]);
    const rest2 = rest.join(':');
    const nameMatch = rest2.match(/\brpc\(\s*['"]([a-zA-Z_][a-zA-Z0-9_.]*)['"]/);
    if (!nameMatch) continue;
    const rpcName = nameMatch[1];
    if (!rpcDefinedIn.has(rpcName)) continue;
    const { primary } = resolvePrimaryFeature(registry, filePart, matchGlob, flattenCodePatterns);
    if (!primary) continue;
    rawEdges.push({
      source: primary,
      target: rpcName,
      kind: 'feature_rpc',
      evidence: { kind: 'rpc_call', path: filePart, line },
    });
  }

  // --- Jobs: Vercel crons, Inngest functions, launchd -----------------------
  const vercelJson = JSON.parse(readTracked('vercel.json'));
  for (const cron of vercelJson.crons ?? []) {
    const jobId = `vercel_cron:${cron.path}`;
    nodes.jobs.push({ id: jobId, kind: 'vercel_cron', path: cron.path, schedule: cron.schedule });
    const routeFile = cronPathToRouteFile(cron.path);
    const { primary } = resolvePrimaryFeature(registry, routeFile, matchGlob, flattenCodePatterns);
    if (primary) {
      rawEdges.push({
        source: jobId,
        target: primary,
        kind: 'job_feature',
        evidence: { kind: 'registry_glob', path: routeFile },
      });
    }
  }
  if (scannableFiles.includes('src/lib/inngest/functions.ts')) {
    const text = readTracked('src/lib/inngest/functions.ts');
    const { primary } = resolvePrimaryFeature(
      registry,
      'src/lib/inngest/functions.ts',
      matchGlob,
      flattenCodePatterns,
    );
    for (const m of text.matchAll(
      /id:\s*'([a-z0-9-]+)'[\s\S]*?triggers:\s*\[\s*\{\s*(cron|event):\s*'([^']+)'/g,
    )) {
      const [, fnId, triggerKind, triggerValue] = m;
      const jobId = `inngest:${fnId}`;
      nodes.jobs.push({
        id: jobId,
        kind: 'inngest',
        trigger: { type: triggerKind, value: triggerValue },
        definedIn: 'src/lib/inngest/functions.ts',
      });
      if (primary) {
        rawEdges.push({
          source: jobId,
          target: primary,
          kind: 'job_feature',
          evidence: { kind: 'registry_glob', path: 'src/lib/inngest/functions.ts' },
        });
      }
    }
  }
  for (const plist of scannableFiles.filter((f) => f.startsWith('config/launchd/') && f.endsWith('.plist'))) {
    const jobId = `launchd:${plist}`;
    nodes.jobs.push({ id: jobId, kind: 'launchd', path: plist });
    const { primary } = resolvePrimaryFeature(registry, plist, matchGlob, flattenCodePatterns);
    if (primary) {
      rawEdges.push({
        source: jobId,
        target: primary,
        kind: 'job_feature',
        evidence: { kind: 'registry_glob', path: plist },
      });
    }
  }

  // --- Invariants: files shaped like qualifier-invariants.ts's result() ----
  let invariantCandidates = [];
  try {
    invariantCandidates = git(['grep', '-lP', "severity:\\s*'(critical|warning)'", '--', '*.ts'])
      .trim()
      .split('\n')
      .filter(Boolean)
      // A REGISTRY of named invariants lives in production source, not a
      // test file constructing mock rows shaped like one. Scanning test
      // files here produced 20+ false positives on first run — fixture
      // objects such as `{ id: 'e1', severity: 'critical' }` built to test
      // an UNRELATED function, matched by the same shape this extractor
      // looks for. Verified by inspection against `main`: every non-test
      // match (qualifier-invariants.ts, operational-rule-engine.ts) is a
      // real named-invariant registry; every test-path match was a fixture.
      .filter((f) => !f.includes('.test.') && !f.includes('.spec.') && !f.includes('/__tests__/'));
  } catch (err) {
    // Same rule as the RPC-call grep above: exit 1 means zero matches (fine),
    // anything else (e.g. 128 on a git build without PCRE support) must not
    // be swallowed, or a runner missing -P silently ships a smaller model
    // and `--check` fails pointing at the wrong cause.
    if (err.status !== 1) throw err;
    invariantCandidates = [];
  }
  for (const file of invariantCandidates) {
    const text = readTracked(file);
    const found = extractInvariantsFromSource(text, file);
    if (found.length === 0) continue;
    const { primary } = resolvePrimaryFeature(registry, file, matchGlob, flattenCodePatterns);
    for (const inv of found) {
      const invId = `invariant:${file}:${inv.id}`;
      nodes.invariants.push({ id: invId, label: inv.label, severity: inv.severity, path: inv.path, line: inv.line });
      if (primary) {
        rawEdges.push({
          source: primary,
          target: invId,
          kind: 'feature_invariant',
          evidence: { kind: 'source_reference', path: file, line: inv.line },
        });
      }
    }
  }

  // --- Sentry / admin_events signals (FeatureKey vocabulary) ---------------
  const featureKeyMeta = new Map(loadFeatureKeyMetadata().map((f) => [f.key, f]));
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const keys = feature.observability?.feature_keys ?? [];
    for (const key of keys) {
      const meta = featureKeyMeta.get(key);
      if (!nodes.sentrySignals.some((s) => s.id === key)) {
        nodes.sentrySignals.push({ id: key, app: meta?.app ?? null, tier: meta?.tier ?? null });
      }
      rawEdges.push({
        source: id,
        target: key,
        kind: 'feature_signal',
        evidence: { kind: 'registry_declaration', path: 'memory/registry.yml', pattern: 'observability.feature_keys' },
      });
    }
  }

  // --- Feature-doc cross-references (feature_doc_contract evidence) --------
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const docPath = feature.docs?.feature;
    if (!docPath || !existsSync(resolve(ROOT, docPath))) continue;
    const text = readTracked(docPath);
    rawEdges.push(
      ...extractDocFeatureCrossRefs(id, text, docPath, featureIds).map((e) => ({
        source: e.source,
        target: e.target,
        kind: 'feature_relation',
        evidence: e.evidence,
      })),
    );
  }

  // --- Bounded TS import walk (weak, import_graph evidence) — E.4.1 --------
  // Scoped to each feature's OWN actions/services files, per the plan's own
  // scoping ("a TypeScript import walk scoped to src/app/*/actions/** and
  // src/lib/*/**"). Every edge here carries ONLY import_graph evidence
  // unless another extractor above also found the same feature pair, and
  // `walkImpact` labels an edge weak whenever ALL its evidence is
  // import_graph — never silently promoted to a structural-confidence edge.
  const ALIAS_RE = /from\s+['"]@\/([^'"]+)['"]/g;
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const ownFiles = scannableFiles.filter((f) => {
      if (!(f.startsWith('src/app/') && f.includes('/actions/')) && !f.startsWith('src/lib/')) return false;
      const { primary } = resolvePrimaryFeature(registry, f, matchGlob, flattenCodePatterns);
      return primary === id;
    });
    for (const file of ownFiles) {
      let text;
      try {
        text = readTracked(file);
      } catch {
        continue;
      }
      for (const m of text.matchAll(ALIAS_RE)) {
        const importPath = `src/${m[1]}`;
        const resolved = resolveImportedFile(importPath, scannableFiles);
        if (!resolved) continue;
        const { primary: targetPrimary } = resolvePrimaryFeature(registry, resolved, matchGlob, flattenCodePatterns);
        if (!targetPrimary || targetPrimary === id) continue;
        const line = text.slice(0, m.index).split('\n').length;
        rawEdges.push({
          source: id,
          target: targetPrimary,
          kind: 'feature_relation',
          evidence: { kind: 'import_graph', path: file, line },
        });
      }
    }
  }

  // --- Journeys --------------------------------------------------------------
  const { journeys, note: journeysNote } = loadJourneys();
  nodes.journeys = journeys;

  const merged = mergeEdges(rawEdges);
  const model = sortWorldModel({
    nodes,
    edges: merged,
    notes: {
      journeys: journeysNote,
      unmapped: buildUnmappedNote(registry, featureIds),
      tableAttribution:
        'A feature’s `tables` list comes only from its own `db:` migration ' +
        'globs, scanned for a literal `CREATE TABLE`. A feature can be real ' +
        'owner of a table with no migration under its glob still containing ' +
        'that statement (e.g. the table was created by a migration matched by ' +
        'a DIFFERENT feature’s `db:` glob, or the CREATE TABLE was later ' +
        'superseded by an ALTER/rename this scanner does not follow) — ' +
        '`admin_incidents` is exactly this case: its current-state doc names ' +
        '`admin_events` and `admin_error_resolutions` as Core Data, but no ' +
        'migration under its own `db:` glob still contains their CREATE TABLE, ' +
        'so this model reports zero tables for it. Read an empty `tables` list ' +
        'as “no migration-glob evidence found,” never as “this feature ' +
        'owns no tables” — check the feature’s own doc for the real answer.',
    },
  });
  return model;
}

function resolveImportedFile(importPath, scannableFiles) {
  const candidates = [
    importPath,
    `${importPath}.ts`,
    `${importPath}.tsx`,
    `${importPath}.mjs`,
    `${importPath}/index.ts`,
    `${importPath}/index.tsx`,
  ];
  const fileSet = new Set(scannableFiles);
  return candidates.find((c) => fileSet.has(c)) ?? null;
}

function buildUnmappedNote(registry, featureIds) {
  const probes = ['src/lib/inngest/functions.ts'];
  const unmapped = probes.filter((p) => {
    const { primary } = resolvePrimaryFeature(registry, p, matchGlob, flattenCodePatterns);
    return !primary;
  });
  return unmapped.length
    ? `Probed files with no registry owner (a real gap this graph surfaces, not fixed here): ${unmapped.join(', ')}.`
    : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderJson(model) {
  return `${JSON.stringify(model, null, 2)}\n`;
}

function renderMarkdown(model) {
  const L = [];
  L.push('# Helm World Model');
  L.push('');
  L.push('<!-- GENERATED by scripts/knowledge/world-model.mjs — do not edit. -->');
  L.push('<!-- Regenerate: npm run knowledge:world-model  ·  Verify: npm run knowledge:world-model:check -->');
  L.push('');
  L.push(
    'A dependency graph over `memory/registry.yml`\'s feature ownership, not a second copy of it. ' +
      'Every semantic edge below carries evidence — see `docs/generated/WORLD_MODEL.json` for the full ' +
      'attribution. Use `npm run knowledge:world-model -- --impact <file|feature>` for the blast-radius read model.',
  );
  L.push('');
  const counts = Object.entries(model.nodes).map(([k, v]) => `${v.length} ${k}`);
  L.push(`**Node counts:** ${counts.join(', ')}.`);
  L.push(`**Edges:** ${model.edges.length} (merged; an edge with more than one evidence kind is a stronger claim).`);
  if (model.notes?.journeys) L.push(`**Journeys:** ${model.notes.journeys}`);
  if (model.notes?.unmapped) L.push(`**Unmapped:** ${model.notes.unmapped}`);
  if (model.notes?.tableAttribution) L.push(`**Table attribution:** ${model.notes.tableAttribution}`);
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Features');
  L.push('');
  for (const f of model.nodes.features) {
    const rel = model.edges.filter((e) => e.kind === 'feature_relation' && (e.source === f.id || e.target === f.id));
    const strong = rel.filter((e) => e.evidence.some((ev) => ev.kind !== 'import_graph'));
    const weakOnly = rel.filter((e) => e.evidence.every((ev) => ev.kind === 'import_graph'));
    const tables = model.edges.filter((e) => e.kind === 'feature_table' && e.source === f.id).map((e) => e.target);
    const rpcs = model.edges.filter((e) => e.kind === 'feature_rpc' && e.source === f.id).map((e) => e.target);
    const tests = model.edges.filter((e) => e.kind === 'feature_test' && e.source === f.id);
    const signals = model.edges.filter((e) => e.kind === 'feature_signal' && e.source === f.id).map((e) => e.target);
    L.push(`### \`${f.id}\``);
    L.push('');
    L.push(`${f.name} · ${f.status} · criticality ${f.criticality} · owner ${f.owner}`);
    L.push('');
    L.push(
      `- **Relations:** ${strong.length} doc/structurally-evidenced, ${weakOnly.length} import-graph-only (weak)`,
    );
    L.push(`- **Tables:** ${tables.length ? tables.map((t) => `\`${t}\``).join(', ') : 'none'}`);
    L.push(`- **RPCs:** ${rpcs.length ? rpcs.map((t) => `\`${t}\``).join(', ') : 'none'}`);
    L.push(`- **Test surfaces:** ${tests.length}`);
    L.push(`- **Sentry/admin_events signals:** ${signals.length ? signals.map((s) => `\`${s}\``).join(', ') : 'none'}`);
    L.push('');
  }
  L.push('---');
  L.push('');
  L.push('## Jobs');
  L.push('');
  L.push('| Job | Kind | Feature |');
  L.push('| --- | --- | --- |');
  for (const job of model.nodes.jobs) {
    const owner = model.edges.find((e) => e.kind === 'job_feature' && e.source === job.id);
    L.push(`| \`${job.id}\` | ${job.kind} | ${owner ? `\`${owner.target}\`` : '_unmapped_'} |`);
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Cross-feature relations');
  L.push('');
  L.push('| Source | Target | Evidence |');
  L.push('| --- | --- | --- |');
  for (const e of model.edges.filter((e) => e.kind === 'feature_relation')) {
    const weak = e.evidence.every((ev) => ev.kind === 'import_graph');
    const kinds = [...new Set(e.evidence.map((ev) => ev.kind))].join(', ');
    L.push(`| \`${e.source}\` | \`${e.target}\` | ${kinds}${weak ? ' (weak)' : ''} |`);
  }
  L.push('');
  const body = L.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return `${body}\n`;
}

// ---------------------------------------------------------------------------
// --impact
// ---------------------------------------------------------------------------
async function runImpact(target) {
  const registry = await loadRegistry(ROOT);
  const model = await buildModel();
  const resolved = resolveImpactTarget(target, registry, matchGlob, flattenCodePatterns);
  const featureId = resolved.featureId;
  if (!featureId) {
    console.error(`world-model --impact: '${target}' does not resolve to any registry feature.`);
    process.exitCode = 1;
    return;
  }
  const result = walkImpact(model, featureId, { maxDepth: 2 });
  console.log(`Impact for ${resolved.kind === 'file' ? `file \`${target}\`` : `feature \`${target}\``}`);
  console.log(`  primary feature: ${result.primary} (criticality: ${result.criticality})`);
  if (resolved.kind === 'file' && resolved.secondary?.length) {
    console.log(`  also matched (shell/secondary): ${resolved.secondary.join(', ')}`);
  }
  console.log(
    `  downstream critical features: ${
      result.downstreamCriticalFeatures.length
        ? result.downstreamCriticalFeatures.map((d) => `${d.id}${d.weak ? ' (weak)' : ''} [depth ${d.depth}]`).join(', ')
        : 'none'
    }`,
  );
  console.log(
    `  affected journeys: ${
      result.affectedJourneys.length
        ? result.affectedJourneys.map((j) => `${j.id}${j.weak ? ' (weak)' : ''}`).join(', ')
        : 'none'
    }`,
  );
  console.log(`  tables: ${result.tables.length ? result.tables.join(', ') : 'none'}`);
  console.log(`  rpcs: ${result.rpcs.length ? result.rpcs.join(', ') : 'none'}`);
  console.log(
    `  jobs: ${
      result.jobs.length ? result.jobs.map((j) => `${j.id}${j.weak ? ' (weak)' : ''}`).join(', ') : 'none'
    }`,
  );
  const suiteLabels = result.verificationSuites.map((s) => s.replace(/^tests:/, ''));
  console.log(`  verification suites: ${suiteLabels.length ? suiteLabels.join(', ') : 'none'}`);
  console.log(`  risk note: ${result.riskNote}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const impactIndex = args.indexOf('--impact');
  if (impactIndex !== -1) {
    const target = args[impactIndex + 1];
    if (!target) {
      console.error('world-model --impact requires a <file|feature> argument.');
      process.exit(2);
    }
    await runImpact(target);
    return;
  }

  const check = args.includes('--check');
  const model = await buildModel();
  const nextJson = renderJson(model);
  const nextMd = renderMarkdown(model);

  if (!check) {
    writeFileSync(OUT_JSON, nextJson);
    writeFileSync(OUT_MD, nextMd);
    console.log(`Wrote ${OUT_JSON.replace(`${ROOT}/`, '')} and ${OUT_MD.replace(`${ROOT}/`, '')}.`);
    return;
  }

  let currentJson = '';
  let currentMd = '';
  try {
    currentJson = readFileSync(OUT_JSON, 'utf8');
  } catch {
    /* first run */
  }
  try {
    currentMd = readFileSync(OUT_MD, 'utf8');
  } catch {
    /* first run */
  }

  const jsonOk = currentJson === nextJson;
  const mdOk = currentMd === nextMd;
  if (jsonOk && mdOk) {
    console.log('✅ WORLD_MODEL.json and WORLD_MODEL.md match their sources.');
    return;
  }
  console.error('\n❌ The World Model is out of date.\n');
  if (!jsonOk) console.error('   docs/generated/WORLD_MODEL.json differs from its sources.');
  if (!mdOk) console.error('   docs/generated/WORLD_MODEL.md differs from its sources.');
  console.error('\n   Run: npm run knowledge:world-model\n');
  process.exitCode = 1;
}

if (isEntrypoint) {
  main();
}
