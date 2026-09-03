import { describe, it, expect } from 'vitest';
import { matchGlob, flattenCodePatterns } from '../lib/registry.mjs';
import {
  globSpecificity,
  resolvePrimaryFeature,
  extractDocFeatureCrossRefs,
  extractInvariantsFromSource,
  parseJourneysDoc,
  cronPathToRouteFile,
  mergeEdges,
  sortWorldModel,
  walkImpact,
  resolveImpactTarget,
} from '../lib/world-model-core.mjs';

// A miniature registry shaped like the real admin_platform split: one broad
// shell glob that overlaps a narrower sub-capability glob, plus an unrelated
// third feature with no overlap, so tests can assert both the overlap
// resolution AND the plain no-overlap case in the same fixture.
function fixtureRegistry() {
  return {
    features: {
      admin_platform: {
        criticality: 'high',
        code: {
          routes: ['src/app/admin/**'],
          services: ['src/lib/admin/**'],
        },
      },
      admin_incidents: {
        criticality: 'high',
        code: {
          routes: ['src/app/admin/errors/**'],
          services: ['src/lib/admin/incidents/**', 'src/lib/admin/incident-*.ts'],
        },
      },
      admin_reliability_collector: {
        criticality: 'high',
        code: {
          api: ['src/app/api/cron/reliability-triage/**'],
          services: ['src/lib/reliability/**'],
        },
      },
      qualifiers: {
        criticality: 'high',
        code: {
          services: ['src/lib/golf/qualifiers/**'],
        },
      },
    },
  };
}

describe('globSpecificity', () => {
  it('counts fixed path segments before the first wildcard', () => {
    expect(globSpecificity('src/lib/admin/**')).toEqual({ segments: 3, length: 16 });
    expect(globSpecificity('src/lib/admin/incidents/**')).toEqual({ segments: 4, length: 26 });
  });

  it('treats a literal path (no wildcard) as maximally specific', () => {
    const literal = globSpecificity('src/lib/admin/incidents/attention.ts');
    const glob = globSpecificity('src/lib/admin/incidents/**');
    expect(literal.segments).toBeGreaterThan(glob.segments);
  });
});

describe('resolvePrimaryFeature', () => {
  const registry = fixtureRegistry();

  it('picks the narrower sub-capability glob over the broad shell glob for an overlapping file', () => {
    const result = resolvePrimaryFeature(
      registry,
      'src/lib/admin/incidents/attention.ts',
      matchGlob,
      flattenCodePatterns,
    );
    expect(result.primary).toBe('admin_incidents');
    expect(result.secondary).toEqual(['admin_platform']);
  });

  it('falls back to the shell as primary when only the broad glob matches', () => {
    const result = resolvePrimaryFeature(
      registry,
      'src/lib/admin/deploy-freshness.ts',
      matchGlob,
      flattenCodePatterns,
    );
    expect(result.primary).toBe('admin_platform');
    expect(result.secondary).toEqual([]);
  });

  it('resolves a route file to its owning feature with no overlap at all', () => {
    const result = resolvePrimaryFeature(
      registry,
      'src/lib/golf/qualifiers/invariants.ts',
      matchGlob,
      flattenCodePatterns,
    );
    expect(result.primary).toBe('qualifiers');
    expect(result.secondary).toEqual([]);
  });

  it('returns a null primary for a file no feature owns', () => {
    const result = resolvePrimaryFeature(
      registry,
      'src/app/baseball/dashboard/page.tsx',
      matchGlob,
      flattenCodePatterns,
    );
    expect(result.primary).toBeNull();
  });

  it('an incident-prefixed literal filename resolves via the mid-string wildcard pattern', () => {
    const result = resolvePrimaryFeature(
      registry,
      'src/lib/admin/incident-report.ts',
      matchGlob,
      flattenCodePatterns,
    );
    expect(result.primary).toBe('admin_incidents');
  });
});

describe('extractDocFeatureCrossRefs', () => {
  const known = new Set(['admin_platform', 'admin_incidents', 'admin_selfheal', 'recruiting', 'crm_outreach']);

  it('extracts a positive cross-reference to another known feature', () => {
    const text = 'Diagnose and Repair are owned by `admin_selfheal`, the sibling doc.';
    const edges = extractDocFeatureCrossRefs('admin_incidents', text, 'memory/features/admin-incidents.md', known);
    expect(edges).toEqual([
      {
        source: 'admin_incidents',
        target: 'admin_selfheal',
        evidence: { kind: 'feature_doc_contract', path: 'memory/features/admin-incidents.md', line: 1 },
      },
    ]);
  });

  it('never emits a self-edge', () => {
    const text = 'This is the `admin_incidents` doc itself.';
    const edges = extractDocFeatureCrossRefs('admin_incidents', text, 'x.md', known);
    expect(edges).toEqual([]);
  });

  it('ignores a backtick token that is not a known registry feature id', () => {
    const text = 'Calls `resolve_admin_event` and reads `admin_events`.';
    const edges = extractDocFeatureCrossRefs('admin_incidents', text, 'x.md', known);
    expect(edges).toEqual([]);
  });

  // Regression fixture: this exact sentence lives in the real repo at
  // memory/features/crm_outreach.md as of the admin_platform registry split
  // (2026-09-02) and is what motivated the negation guard in the first
  // place — treating it as an edge would assert crm_outreach depends on
  // recruiting when the sentence's entire point is that they are different
  // things under similar names.
  it('does not emit an edge from a disambiguation sentence ("Not to be confused with")', () => {
    const text = "Not to be confused with **`recruiting`** — the runtime registry labels that one";
    const edges = extractDocFeatureCrossRefs('crm_outreach', text, 'memory/features/crm_outreach.md', known);
    expect(edges).toEqual([]);
  });

  it('dedupes repeated mentions of the same target on the same line', () => {
    const text = '`admin_selfheal` handles Diagnose and `admin_selfheal` handles Repair.';
    const edges = extractDocFeatureCrossRefs('admin_incidents', text, 'x.md', known);
    expect(edges).toHaveLength(1);
  });

  it('records the correct line number across a multi-line doc', () => {
    const text = ['line one', 'line two owns `admin_selfheal` here', 'line three'].join('\n');
    const edges = extractDocFeatureCrossRefs('admin_incidents', text, 'x.md', known);
    expect(edges[0].evidence.line).toBe(2);
  });
});

describe('extractInvariantsFromSource', () => {
  // Shaped exactly like src/lib/admin/qualifier-invariants.ts's
  // evaluateQualifierInvariants(): several `result({ id, label, ...,
  // severity }, dataset)` calls back to back in one array literal.
  const fixtureSource = `
export function evaluateQualifierInvariants(a, b) {
  return [
    result({
      id: 'cross_team_link',
      label: 'Round linked to another team\\u2019s qualifier',
      rule: 'A round must belong to the round\\u2019s own team.',
      consequence: 'A score appears on a rival team\\u2019s leaderboard.',
      severity: 'critical',
    }, crossTeam),
    result({
      id: 'over_cap',
      label: 'Round numbered beyond the configured cap',
      rule: 'The configured num_rounds cap is an entry rule.',
      consequence: 'The cap and the data disagree.',
      severity: 'warning',
    }, overCap),
  ];
}
`;

  it('extracts every invariant with its own id, label and severity, without bleeding across blocks', () => {
    const found = extractInvariantsFromSource(fixtureSource, 'src/lib/admin/qualifier-invariants.ts');
    expect(found.map((f) => f.id)).toEqual(['cross_team_link', 'over_cap']);
    expect(found[0].severity).toBe('critical');
    expect(found[1].severity).toBe('warning');
    expect(found[0].label).toContain('Round linked to another team');
    expect(found[1].label).toBe('Round numbered beyond the configured cap');
  });

  it('reports a line number inside the matched block, not just line 1', () => {
    const found = extractInvariantsFromSource(fixtureSource, 'x.ts');
    expect(found[0].line).toBeGreaterThan(1);
    expect(found[1].line).toBeGreaterThan(found[0].line);
  });

  it('returns an empty array for a file with no invariant blocks', () => {
    expect(extractInvariantsFromSource('export const x = 1;', 'x.ts')).toEqual([]);
  });
});

describe('cronPathToRouteFile', () => {
  it('converts a Vercel cron path to its route file', () => {
    expect(cronPathToRouteFile('/api/cron/reliability-triage')).toBe(
      'src/app/api/cron/reliability-triage/route.ts',
    );
  });
});

describe('mergeEdges', () => {
  it('accumulates evidence for the same (source, target, kind) rather than duplicating the edge', () => {
    const merged = mergeEdges([
      { source: 'a', target: 'b', kind: 'feature_relation', evidence: { kind: 'feature_doc_contract', path: 'a.md', line: 1 } },
      { source: 'a', target: 'b', kind: 'feature_relation', evidence: { kind: 'import_graph', path: 'a.ts', line: 5 } },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].evidence).toHaveLength(2);
  });

  it('never drops an identical duplicate evidence entry as a second copy', () => {
    const merged = mergeEdges([
      { source: 'a', target: 'b', kind: 'feature_relation', evidence: { kind: 'feature_doc_contract', path: 'a.md', line: 1 } },
      { source: 'a', target: 'b', kind: 'feature_relation', evidence: { kind: 'feature_doc_contract', path: 'a.md', line: 1 } },
    ]);
    expect(merged[0].evidence).toHaveLength(1);
  });

  it('keeps distinct target features as separate edges', () => {
    const merged = mergeEdges([
      { source: 'a', target: 'b', kind: 'feature_relation', evidence: { kind: 'feature_doc_contract', path: 'a.md', line: 1 } },
      { source: 'a', target: 'c', kind: 'feature_relation', evidence: { kind: 'feature_doc_contract', path: 'a.md', line: 2 } },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe('sortWorldModel', () => {
  it('produces the same output regardless of input node/edge order', () => {
    const modelA = {
      nodes: { features: [{ id: 'b' }, { id: 'a' }] },
      edges: [
        { source: 'b', target: 'a', kind: 'feature_relation', evidence: [{ kind: 'feature_doc_contract', path: 'z.md' }] },
        { source: 'a', target: 'b', kind: 'feature_relation', evidence: [{ kind: 'feature_doc_contract', path: 'y.md' }] },
      ],
    };
    const modelB = {
      nodes: { features: [{ id: 'a' }, { id: 'b' }] },
      edges: [modelA.edges[1], modelA.edges[0]],
    };
    expect(sortWorldModel(modelA)).toEqual(sortWorldModel(modelB));
  });

  it('does not mutate the input', () => {
    const model = { nodes: { features: [{ id: 'b' }, { id: 'a' }] }, edges: [] };
    sortWorldModel(model);
    expect(model.nodes.features[0].id).toBe('b');
  });
});

describe('walkImpact', () => {
  function fixtureModel() {
    return {
      nodes: {
        features: [
          { id: 'admin_incidents', criticality: 'high' },
          { id: 'admin_selfheal', criticality: 'high' },
          { id: 'admin_reliability_collector', criticality: 'high' },
          { id: 'low_priority_thing', criticality: 'low' },
        ],
        journeys: [
          { id: 'incident-to-repair', features: ['admin_incidents', 'admin_selfheal'] },
          { id: 'unrelated-journey', features: ['low_priority_thing'] },
        ],
      },
      edges: [
        {
          source: 'admin_incidents',
          target: 'admin_selfheal',
          kind: 'feature_relation',
          evidence: [{ kind: 'feature_doc_contract', path: 'a.md', line: 1 }],
        },
        {
          source: 'admin_selfheal',
          target: 'admin_reliability_collector',
          kind: 'feature_relation',
          evidence: [{ kind: 'import_graph', path: 'a.ts', line: 1 }],
        },
        { source: 'admin_incidents', target: 'admin_events', kind: 'feature_table', evidence: [] },
        { source: 'admin_incidents', target: 'resolve_admin_event', kind: 'feature_rpc', evidence: [] },
        { source: 'admin_incidents', target: 'src/test/lib/admin/incident-classification.test.ts', kind: 'feature_test', evidence: [] },
        { source: 'selfheal-triage-cron', target: 'admin_selfheal', kind: 'job_feature', evidence: [] },
      ],
    };
  }

  it('finds a direct doc-evidenced neighbor at depth 1', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents');
    expect(result.found).toBe(true);
    expect(result.downstreamCriticalFeatures.map((d) => d.id)).toContain('admin_selfheal');
    const direct = result.downstreamCriticalFeatures.find((d) => d.id === 'admin_selfheal');
    expect(direct.depth).toBe(1);
    expect(direct.weak).toBe(false);
  });

  it('flags an import-graph-only edge as weak, and never promotes it to strong', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents', { maxDepth: 2 });
    const twoHops = result.downstreamCriticalFeatures.find((d) => d.id === 'admin_reliability_collector');
    expect(twoHops).toBeDefined();
    expect(twoHops.weak).toBe(true);
  });

  it('respects maxDepth and does not walk past it', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents', { maxDepth: 1 });
    expect(result.downstreamCriticalFeatures.map((d) => d.id)).not.toContain('admin_reliability_collector');
  });

  it('collects tables, rpcs and tests owned directly by the primary feature', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents');
    expect(result.tables).toEqual(['admin_events']);
    expect(result.rpcs).toEqual(['resolve_admin_event']);
    expect(result.verificationSuites).toEqual(['src/test/lib/admin/incident-classification.test.ts']);
  });

  it('includes a job whose target feature is downstream, not only the primary', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents');
    expect(result.jobs.map((j) => j.id)).toContain('selfheal-triage-cron');
  });

  it('flags a job reached only through a weak (import-graph-only) downstream feature', () => {
    // fixtureModel: admin_selfheal -> admin_reliability_collector is
    // import_graph-only (weak). A job attributed to admin_reliability_collector
    // must carry that weakness — a consumer reading `jobs` should not see it
    // at the same confidence as a job reached by a doc-evidenced edge.
    const model = fixtureModel();
    model.edges.push({
      source: 'reliability-triage-cron',
      target: 'admin_reliability_collector',
      kind: 'job_feature',
      evidence: [],
    });
    const result = walkImpact(model, 'admin_incidents', { maxDepth: 2 });
    const selfhealJob = result.jobs.find((j) => j.id === 'selfheal-triage-cron');
    const reliabilityJob = result.jobs.find((j) => j.id === 'reliability-triage-cron');
    expect(selfhealJob.weak).toBe(false);
    expect(reliabilityJob.weak).toBe(true);
  });

  it('filters journeys to those naming the primary or a downstream feature', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents');
    expect(result.affectedJourneys.map((j) => j.id)).toEqual(['incident-to-repair']);
  });

  it('flags a journey weak only when every one of its matching features is weak', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents');
    // incident-to-repair names admin_incidents (the primary — never weak) and
    // admin_selfheal (depth-1, doc-evidenced — not weak either), so the
    // journey as a whole is not weak.
    const journey = result.affectedJourneys.find((j) => j.id === 'incident-to-repair');
    expect(journey.weak).toBe(false);
  });

  it('reports found:false for an unknown feature id without throwing', () => {
    const result = walkImpact(fixtureModel(), 'not_a_real_feature');
    expect(result.found).toBe(false);
  });

  it('produces a risk note that states criticality and downstream count', () => {
    const result = walkImpact(fixtureModel(), 'admin_incidents');
    expect(result.riskNote).toContain('criticality: high');
    expect(result.riskNote).toMatch(/downstream high-criticality feature/);
  });

  it('names the absence explicitly when a feature has no evidenced relation to any other high-criticality feature', () => {
    const result = walkImpact(fixtureModel(), 'low_priority_thing');
    expect(result.downstreamCriticalFeatures).toEqual([]);
    expect(result.riskNote).toMatch(/no doc-evidenced or import-evidenced relation/);
  });
});

describe('resolveImpactTarget', () => {
  const registry = fixtureRegistry();

  it('treats a known feature id as itself', () => {
    const result = resolveImpactTarget('admin_incidents', registry, matchGlob, flattenCodePatterns);
    expect(result).toEqual({ kind: 'feature', featureId: 'admin_incidents' });
  });

  it('resolves a file path to its primary feature', () => {
    const result = resolveImpactTarget(
      'src/lib/admin/incidents/attention.ts',
      registry,
      matchGlob,
      flattenCodePatterns,
    );
    expect(result.kind).toBe('file');
    expect(result.featureId).toBe('admin_incidents');
    expect(result.secondary).toEqual(['admin_platform']);
  });
});

describe('parseJourneysDoc', () => {
  // Shaped like the real memory/journeys/golden-paths.yml (PR #1779): a
  // top-level `journeys:` array, `- id:`/`name:`/`stages:` per journey, a
  // `feature_id:` per stage — NOT the flat `id:`/`features:` shape this
  // loader originally guessed at before that file existed (world-model.mjs
  // reported zero journeys against the real file until this parser was
  // rewritten to match its actual schema, 2026-09-03 PR review). The same
  // feature_id (`golf_round_lifecycle`) repeats across two stages, on
  // purpose — the real file does this too (configure_round/start_round),
  // and it is exactly the case that breaks a naive "first line containing
  // this value" line-lookup.
  const GOLDEN_PATH_SHAPED = `
journeys:
  - id: player_login_hub
    name: Player logs in and reaches their dashboard
    role: player
    criticality: high
    status: active
    stages:
      - id: authenticate
        order: 1
        feature_id: auth_onboarding_join
      - id: land_on_dashboard
        order: 2
        feature_id: player_hub

  - id: player_start_round
    name: Player configures and starts a new round
    role: player
    criticality: high
    status: active
    stages:
      - id: configure_round
        order: 1
        feature_id: golf_round_lifecycle
      - id: start_round
        order: 2
        feature_id: golf_round_lifecycle
`;

  it('parses journeys, features and journey->feature edges from the real schema', () => {
    const result = parseJourneysDoc(GOLDEN_PATH_SHAPED, 'memory/journeys/golden-paths.yml');
    expect(result.problems).toEqual([]);
    expect(result.journeys.map((j) => j.id)).toEqual(['player_login_hub', 'player_start_round']);

    const loginJourney = result.journeys.find((j) => j.id === 'player_login_hub');
    expect(loginJourney.name).toBe('Player logs in and reaches their dashboard');
    expect(loginJourney.source).toBe('memory/journeys/golden-paths.yml');
    expect(loginJourney.features).toEqual(['auth_onboarding_join', 'player_hub']);

    const startRoundJourney = result.journeys.find((j) => j.id === 'player_start_round');
    // Same feature_id on two stages collapses to one feature in the set...
    expect(startRoundJourney.features).toEqual(['golf_round_lifecycle']);
  });

  it('emits one journey_feature edge per stage, each with its own line evidence', () => {
    const result = parseJourneysDoc(GOLDEN_PATH_SHAPED, 'memory/journeys/golden-paths.yml');
    expect(result.edges).toHaveLength(4); // 2 stages + 2 stages, not deduped at the edge level
    for (const edge of result.edges) {
      expect(edge.kind).toBe('journey_feature');
      expect(edge.evidence.kind).toBe('journey_stage');
      expect(edge.evidence.path).toBe('memory/journeys/golden-paths.yml');
    }
  });

  it('gives the two golf_round_lifecycle stages DIFFERENT line numbers, not the same one twice', () => {
    // The exact bug class a naive `text.indexOf('feature_id: golf_round_lifecycle')`
    // lookup would hit: both stages share a feature_id, so a lookup that
    // isn't source-order-aware would attribute both edges to the FIRST
    // occurrence's line.
    const result = parseJourneysDoc(GOLDEN_PATH_SHAPED, 'memory/journeys/golden-paths.yml');
    const startRoundEdges = result.edges.filter(
      (e) => e.source === 'journey:player_start_round' && e.target === 'golf_round_lifecycle',
    );
    expect(startRoundEdges).toHaveLength(2);
    const [first, second] = startRoundEdges;
    expect(first.evidence.line).toBeDefined();
    expect(second.evidence.line).toBeDefined();
    expect(first.evidence.line).not.toBe(second.evidence.line);
    expect(second.evidence.line).toBeGreaterThan(first.evidence.line);
  });

  it('prefixes the edge source with journey: so it never collides with a feature id namespace', () => {
    const result = parseJourneysDoc(GOLDEN_PATH_SHAPED, 'memory/journeys/golden-paths.yml');
    expect(result.edges.every((e) => e.source.startsWith('journey:'))).toBe(true);
  });

  it('falls back to the journey id as name when name is missing', () => {
    const text = `
journeys:
  - id: unnamed_journey
    stages:
      - id: only_stage
        feature_id: player_hub
`;
    const result = parseJourneysDoc(text, 'memory/journeys/golden-paths.yml');
    expect(result.journeys[0].name).toBe('unnamed_journey');
  });

  it('reports a malformed journey entry (no id / no stages) as a problem without throwing', () => {
    const text = `
journeys:
  - name: Missing an id entirely
    stages: []
  - id: has_no_stages_array
    name: Also malformed
`;
    const result = parseJourneysDoc(text, 'memory/journeys/golden-paths.yml');
    expect(result.journeys).toEqual([]);
    expect(result.problems).toHaveLength(2);
  });

  it('an unparseable (invalid YAML) file reports a problem and zero journeys, never throws', () => {
    const invalidYaml = 'journeys:\n  - id: [this is not valid: yaml: at all\n';
    const result = parseJourneysDoc(invalidYaml, 'memory/journeys/golden-paths.yml');
    expect(result.journeys).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/YAML parse error/);
  });

  it('valid YAML with the OLD flat id:/features: shape (schema mismatch) reports a problem, not a silent empty pass', () => {
    const oldShape = `id: some_journey\nfeatures:\n  - auth_onboarding_join\n`;
    const result = parseJourneysDoc(oldShape, 'memory/journeys/golden-paths.yml');
    expect(result.journeys).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/no top-level `journeys` array/);
  });

  it('an empty journeys: array parses cleanly with zero journeys and zero problems', () => {
    const result = parseJourneysDoc('journeys: []\n', 'memory/journeys/golden-paths.yml');
    expect(result.journeys).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.problems).toEqual([]);
  });
});
