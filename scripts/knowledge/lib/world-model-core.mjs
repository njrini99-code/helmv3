/**
 * world-model-core.mjs — the PURE half of the Helm World Model graph
 * generator (`scripts/knowledge/world-model.mjs`).
 *
 * No filesystem, no git, no network — every export here is a function of its
 * arguments, so the trickiest logic (which feature OWNS a file when more than
 * one registry glob matches it, whether a doc's cross-reference to another
 * feature id is a real edge or a disambiguation sentence, how the impact walk
 * bounds itself) can be tested with a synthetic fixture instead of the real
 * ~1,400-file registry. Same split as `check-feature-registry.ts` /
 * `feature-registry-reconcile.ts`.
 *
 * WHY "MOST-SPECIFIC-GLOB-WINS"
 *
 * `admin_platform`'s shell glob (`src/lib/admin/**`) and `admin_incidents`'s
 * narrower glob (`src/lib/admin/incidents/**`) both legitimately match a file
 * under `src/lib/admin/incidents/` — that overlap is accepted by design (see
 * `memory/registry.yml`'s comment on the split). But a blast-radius graph
 * needs exactly ONE owner per file to be useful for its own subject matter
 * (`CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §3 E.3's own complaint:
 * "even a naive import-graph pass would attribute almost everything in
 * src/lib/admin/** to one node"). `resolvePrimaryFeature` picks the feature
 * whose OWN glob is the most specific match — deeper fixed-path prefix wins —
 * and records every other match as a secondary/shell attribution rather than
 * silently dropping it.
 *
 * WHY DOC CROSS-REFERENCES NEED A NEGATION GUARD
 *
 * Scanning `memory/features/crm_outreach.md` for backtick-quoted feature ids
 * that this repo's own registry recognises turned up a real line: "Not to be
 * confused with `recruiting`". Treating that as a product-dependency edge
 * would be exactly the false positive Phase E.7 warns about for the
 * import-graph pass, just with a docs source instead of an import. The same
 * `NEGATED` pattern `scripts/check-doc-path-drift.mjs` already uses for its
 * own false-positive class is reused here for the same reason: a sentence
 * whose whole point is that two things are NOT related must not become an
 * edge asserting they are.
 */

/** Word-boundary backtick-quoted token extractor, shared by every doc scan. */
const BACKTICK_TOKEN_RE = /`([a-z][a-z0-9_]*)`/g;

/**
 * A line whose point is that two things are NOT related. Same list
 * `scripts/check-doc-path-drift.mjs` uses for its own false-positive class,
 * because the failure shape is identical: a sentence built to disclaim a
 * relationship must not be read as asserting one.
 */
const NEGATED_RELATION_RE =
  /\b(not to be confused with|is not the same as|distinct from|never|is not owned by|not owned by)\b/i;

/**
 * Structural specificity of a registry glob pattern: how many fixed
 * (non-wildcard) path segments come before the first `*`. A literal path
 * with no `*` at all is maximally specific (its whole depth counts).
 *
 * `src/lib/admin/**`              -> 3  (src, lib, admin)
 * `src/lib/admin/incidents/**`    -> 4  (src, lib, admin, incidents)
 * `src/lib/admin/incident-*.ts`   -> 4  (src, lib, admin, "incident-")
 * `src/lib/admin/incident-report.ts` (literal) -> 5
 *
 * Ties break on raw pattern length (longer = more specific) and then on the
 * pattern string itself, so the result never depends on object/array
 * iteration order.
 */
export function globSpecificity(pattern) {
  const starIndex = pattern.indexOf('*');
  const fixedPart = starIndex === -1 ? pattern : pattern.slice(0, starIndex);
  const segments = fixedPart.split('/').filter(Boolean).length;
  return { segments, length: pattern.length };
}

function compareSpecificity(a, b) {
  if (a.segments !== b.segments) return b.segments - a.segments;
  return b.length - a.length;
}

/**
 * Resolve the PRIMARY feature that owns `filePath`, plus every other feature
 * whose registry glob also matches it (the accepted-overlap set).
 *
 * `matchGlob` and `flattenCodePatterns` are the exact functions
 * `scripts/knowledge/lib/registry.mjs` uses for `knowledge:map` — reusing
 * them (rather than re-implementing glob matching) is what keeps this
 * generator's routing identical to what an agent session sees from
 * `npm run knowledge:map`.
 *
 * @param {{features: Record<string, any>}} registry
 * @param {string} filePath
 * @param {(pattern: string, file: string) => boolean} matchGlob
 * @param {(feature: any) => string[]} flattenCodePatterns
 * @returns {{ primary: string | null, secondary: string[], matchedPatterns: Record<string,string[]> }}
 */
export function resolvePrimaryFeature(registry, filePath, matchGlob, flattenCodePatterns) {
  const candidates = [];
  const matchedPatterns = {};
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const patterns = flattenCodePatterns(feature);
    const hits = patterns.filter((p) => matchGlob(p, filePath));
    if (hits.length === 0) continue;
    matchedPatterns[id] = hits.sort();
    const best = hits
      .map(globSpecificity)
      .sort(compareSpecificity)[0];
    candidates.push({ id, best });
  }
  if (candidates.length === 0) return { primary: null, secondary: [], matchedPatterns };

  candidates.sort((a, b) => compareSpecificity(a.best, b.best) || a.id.localeCompare(b.id));
  const [primary, ...rest] = candidates;
  return {
    primary: primary.id,
    secondary: rest.map((c) => c.id).sort(),
    matchedPatterns,
  };
}

/**
 * Extract explicit feature-to-feature cross-references from one feature's
 * current-state doc: every OTHER registry feature id that appears
 * backtick-quoted in the text, excluding a line whose point is to disclaim
 * the relationship (see `NEGATED_RELATION_RE` above) and excluding the
 * feature's own id.
 *
 * This is the plan's "explicit product contract in a feature doc" evidence
 * kind (`CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §3 E.4.1).
 *
 * @param {string} sourceFeatureId
 * @param {string} docText
 * @param {string} docPath
 * @param {Set<string>} knownFeatureIds
 * @returns {Array<{source: string, target: string, evidence: {kind: 'feature_doc_contract', path: string, line: number}}>}
 */
export function extractDocFeatureCrossRefs(sourceFeatureId, docText, docPath, knownFeatureIds) {
  const edges = [];
  const seen = new Set();
  const lines = docText.split('\n');
  lines.forEach((line, index) => {
    BACKTICK_TOKEN_RE.lastIndex = 0;
    let match;
    while ((match = BACKTICK_TOKEN_RE.exec(line)) !== null) {
      const target = match[1];
      if (target === sourceFeatureId) continue;
      if (!knownFeatureIds.has(target)) continue;
      if (NEGATED_RELATION_RE.test(line)) continue;
      const key = `${target}::${index + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        source: sourceFeatureId,
        target,
        evidence: { kind: 'feature_doc_contract', path: docPath, line: index + 1 },
      });
    }
  });
  return edges;
}

/**
 * Extract named invariants from a source file that follows
 * `src/lib/admin/qualifier-invariants.ts`'s shape: a `result({ id: '...',
 * label: '...', ..., severity: '...' }, <dataset>)` call per invariant. Scans
 * for the pattern generically (not hardcoded to that one file) so any future
 * module following the same shape is picked up without a code change here.
 *
 * Non-greedy on purpose: `id` and its own `severity` are always within one
 * object literal, so matching the SHORTEST span from one `id:` to the next
 * `severity:` pairs each invariant with its own severity even when several
 * invariants are defined back to back in the same file.
 *
 * @param {string} sourceText
 * @param {string} filePath
 * @returns {Array<{id: string, label: string | null, severity: string, path: string, line: number}>}
 */
export function extractInvariantsFromSource(sourceText, filePath) {
  const invariants = [];
  const blockRe = /id:\s*'([a-z][a-z0-9_]*)'[\s\S]*?severity:\s*'(critical|warning)'/g;
  const labelRe = /label:\s*'([^']*)'/;
  let match;
  while ((match = blockRe.exec(sourceText)) !== null) {
    const [full, id, severity] = match;
    const labelMatch = full.match(labelRe);
    const upToMatch = sourceText.slice(0, match.index);
    const line = upToMatch.split('\n').length;
    invariants.push({
      id,
      label: labelMatch ? labelMatch[1] : null,
      severity,
      path: filePath,
      line,
    });
  }
  return invariants;
}

/**
 * Resolve which registry feature owns a Vercel cron / job by its API route
 * path (e.g. `/api/cron/reliability-triage` -> `src/app/api/cron/
 * reliability-triage/route.ts`), reusing the same primary-feature resolution
 * every other node uses.
 *
 * @param {string} cronPath - e.g. "/api/cron/reliability-triage"
 */
export function cronPathToRouteFile(cronPath) {
  const trimmed = cronPath.replace(/^\//, '').replace(/\/$/, '');
  return `src/app/${trimmed}/route.ts`;
}

/**
 * Deterministic sort of a whole world-model document: every node array by
 * `id`, every edge array by `(source, target, evidence.kind, evidence.path)`.
 * `--check` diffs the rendered output against the committed file, so any
 * order that depends on `Object.entries`/`readdirSync`/Set iteration would
 * flap between runs on the same input — this is the single place that
 * guarantee is enforced.
 */
export function sortWorldModel(model) {
  const sorted = structuredClone(model);
  for (const key of Object.keys(sorted.nodes ?? {})) {
    sorted.nodes[key] = [...sorted.nodes[key]].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
  }
  sorted.edges = [...(sorted.edges ?? [])].sort((a, b) => {
    return (
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target) ||
      a.kind.localeCompare(b.kind) ||
      String(a.evidence?.[0]?.kind ?? '').localeCompare(String(b.evidence?.[0]?.kind ?? '')) ||
      String(a.evidence?.[0]?.path ?? '').localeCompare(String(b.evidence?.[0]?.path ?? ''))
    );
  });
  return sorted;
}

/**
 * Merge a list of raw edges (each carrying exactly one evidence entry) into
 * one edge per (source, target, kind), accumulating evidence. Two extractors
 * finding the same relationship through different evidence is a STRONGER
 * claim, not a duplicate — never collapsed away.
 */
export function mergeEdges(rawEdges) {
  const byKey = new Map();
  for (const edge of rawEdges) {
    const key = `${edge.source}::${edge.target}::${edge.kind}`;
    const existing = byKey.get(key);
    if (existing) {
      const dup = existing.evidence.some(
        (e) => e.kind === edge.evidence.kind && e.path === edge.evidence.path && e.line === edge.evidence.line,
      );
      if (!dup) existing.evidence.push(edge.evidence);
    } else {
      byKey.set(key, { source: edge.source, target: edge.target, kind: edge.kind, evidence: [edge.evidence] });
    }
  }
  return [...byKey.values()];
}

/**
 * The blast-radius walk `--impact <file|feature>` prints.
 *
 * `featureEdges` are `{source, target, kind, evidence}` with kind one of
 * `feature_doc_contract` | `import_graph` (weak). Doc-contract edges are
 * walked as UNDIRECTED adjacency for this purpose — a cross-reference in
 * either feature's doc is evidence the two are related, and the plan's own
 * spec asks for "downstream critical features", not a strict dependency
 * direction this repo's docs do not reliably encode. `import_graph` edges
 * are walked too but every feature they reach is flagged `weak: true` in the
 * result, never silently promoted to the same confidence as a doc-contract
 * or structural (registry glob / rpc_call / migration_schema) edge.
 *
 * @param {object} model - the assembled, already-merged world model
 * @param {string} startFeatureId
 * @param {{maxDepth?: number}} [opts]
 */
export function walkImpact(model, startFeatureId, opts = {}) {
  const maxDepth = opts.maxDepth ?? 2;
  const featuresById = new Map((model.nodes.features ?? []).map((f) => [f.id, f]));
  if (!featuresById.has(startFeatureId)) {
    return { primary: startFeatureId, found: false };
  }

  const adjacency = new Map();
  const weakTargets = new Set();
  for (const edge of model.edges ?? []) {
    if (edge.kind !== 'feature_relation') continue;
    const isWeak = edge.evidence.every((e) => e.kind === 'import_graph');
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      adjacency.get(from).add(to);
      if (isWeak) weakTargets.add(`${from}::${to}`);
    }
  }

  const downstream = [];
  const visited = new Set([startFeatureId]);
  let frontier = [startFeatureId];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next = [];
    for (const node of frontier) {
      const neighbors = [...(adjacency.get(node) ?? [])].sort();
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
        const feature = featuresById.get(neighbor);
        if (feature?.criticality === 'high') {
          downstream.push({
            id: neighbor,
            depth,
            weak: weakTargets.has(`${node}::${neighbor}`),
          });
        }
      }
    }
    frontier = next;
  }
  downstream.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

  const relatedIds = new Set([startFeatureId, ...downstream.map((d) => d.id)]);
  const tables = (model.edges ?? [])
    .filter((e) => e.kind === 'feature_table' && e.source === startFeatureId)
    .map((e) => e.target)
    .sort();
  const rpcs = (model.edges ?? [])
    .filter((e) => e.kind === 'feature_rpc' && e.source === startFeatureId)
    .map((e) => e.target)
    .sort();
  const jobs = (model.edges ?? [])
    .filter((e) => e.kind === 'job_feature' && relatedIds.has(e.target))
    .map((e) => e.source)
    .sort();
  const tests = (model.edges ?? [])
    .filter((e) => e.kind === 'feature_test' && e.source === startFeatureId)
    .map((e) => e.target)
    .sort();
  const journeys = (model.nodes.journeys ?? [])
    .filter((j) => (j.features ?? []).some((f) => relatedIds.has(f)))
    .map((j) => j.id)
    .sort();

  const primaryFeature = featuresById.get(startFeatureId);
  const weakCount = downstream.filter((d) => d.weak).length;
  const riskNote = buildRiskNote(primaryFeature, downstream, weakCount, tests.length);

  return {
    primary: startFeatureId,
    found: true,
    criticality: primaryFeature?.criticality ?? 'unknown',
    downstreamCriticalFeatures: downstream,
    affectedJourneys: journeys,
    tables,
    rpcs,
    jobs,
    verificationSuites: tests,
    riskNote,
  };
}

function buildRiskNote(primaryFeature, downstream, weakCount, testCount) {
  const parts = [];
  parts.push(`criticality: ${primaryFeature?.criticality ?? 'unknown'}`);
  const strongDownstream = downstream.length - weakCount;
  parts.push(
    `${downstream.length} downstream high-criticality feature(s)` +
      (weakCount > 0 ? ` (${strongDownstream} doc-evidenced, ${weakCount} import-graph only — weak)` : ''),
  );
  parts.push(`${testCount} mapped verification suite(s)`);
  if (downstream.length === 0) {
    parts.push('no doc-evidenced or import-evidenced relation to another high-criticality feature was found — review manually before treating this as isolated');
  }
  return parts.join('; ');
}

/**
 * Resolve `<file|feature>` input for `--impact`: a known feature id is used
 * as-is; anything else is treated as a file path and resolved to its primary
 * feature.
 */
export function resolveImpactTarget(input, registry, matchGlob, flattenCodePatterns) {
  if (registry.features && input in registry.features) {
    return { kind: 'feature', featureId: input };
  }
  const { primary, secondary } = resolvePrimaryFeature(registry, input, matchGlob, flattenCodePatterns);
  return { kind: 'file', filePath: input, featureId: primary, secondary };
}
