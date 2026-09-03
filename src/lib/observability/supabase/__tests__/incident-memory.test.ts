import { describe, it, expect } from 'vitest';
import {
  renderDbIncident,
  buildIncidentRelativePath,
  validateDbIncidentRecord,
  INCIDENT_FILENAME_PATTERN,
  type DbIncidentRecord,
} from '../incident-memory';

const KNOWN_FEATURE_IDS = ['golf_round_lifecycle', 'admin_platform', 'shot_tracking'];

function record(overrides: Partial<DbIncidentRecord> = {}): DbIncidentRecord {
  return {
    featureId: 'golf_round_lifecycle',
    alsoAffects: [],
    date: '2026-09-03',
    slug: 'save-partial-round-permission-denied',
    title: 'save_partial_round_atomic denied for authenticated callers',
    status: 'resolved',
    mechanism: 'RPC call rejected before any row was written',
    code: '42501',
    relationOrRpc: 'save_partial_round_atomic',
    rootCause: 'The function was recreated without its EXECUTE grant, so every authenticated caller was refused.',
    fixPr: { present: true, ref: 'https://github.com/example/helmv3/pull/1791' },
    migration: { present: true, ref: 'supabase/migrations/20260903120000_restore_execute_grant.sql' },
    regressionTest: { present: true, ref: 'src/lib/observability/supabase/__tests__/classify.test.ts' },
    invariant: { present: true, ref: 'a completed round has at least one scored hole' },
    fingerprint: 'supabase|postgres|round_tracking|rpc|save_partial_round_atomic|42501',
    sections: [{ heading: 'What was observed', body: 'Every submit returned a permission error.' }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The contract `scripts/knowledge/check-ledger-integrity.mjs` actually enforces
// ---------------------------------------------------------------------------

describe('buildIncidentRelativePath', () => {
  it('places the file under memory/incidents/<feature_id>/ with an INC- filename', () => {
    expect(buildIncidentRelativePath(record())).toBe(
      'memory/incidents/golf_round_lifecycle/INC-2026-09-03-save-partial-round-permission-denied.md',
    );
  });

  it('produces a filename the ledger checker regex accepts', () => {
    const path = buildIncidentRelativePath(record());
    const filename = path.split('/').pop() ?? '';
    expect(INCIDENT_FILENAME_PATTERN.test(filename)).toBe(true);
  });
});

describe('renderDbIncident — the enforced body contract', () => {
  it('opens with a backticked feature id on its own line, matching the directory', () => {
    const result = renderDbIncident(record(), { knownFeatureIds: KNOWN_FEATURE_IDS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The exact regex check-ledger-integrity.mjs applies.
    const match = result.markdown.match(/^- Feature:\s*`([a-z0-9_]+)`/m);
    expect(match?.[1]).toBe('golf_round_lifecycle');
    expect(result.relativePath.split('/')[2]).toBe('golf_round_lifecycle');
  });

  it('puts a second feature on its own "Also affects" line, never into the primary field', () => {
    const result = renderDbIncident(record({ alsoAffects: ['shot_tracking'] }), { knownFeatureIds: KNOWN_FEATURE_IDS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.markdown).toContain('- Also affects: `shot_tracking`');
    const featureLine = result.markdown.match(/^- Feature:.*$/m)?.[0] ?? '';
    expect(featureLine).not.toContain('shot_tracking');
  });

  it('carries every one of the nine recorded fields', () => {
    const result = renderDbIncident(record(), { knownFeatureIds: KNOWN_FEATURE_IDS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const field of [
      'Mechanism',
      'Code',
      'Feature',
      'Relation or RPC',
      'Root cause',
      'Fix PR',
      'Migration',
      'Regression test',
      'Invariant',
    ]) {
      expect(result.markdown).toContain(field);
    }
  });

  it('keeps caller-supplied narrative sections verbatim rather than templating prose', () => {
    const result = renderDbIncident(
      record({ sections: [{ heading: 'Why the retry made it worse', body: 'The client retried after the commit.' }] }),
      { knownFeatureIds: KNOWN_FEATURE_IDS },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain('## Why the retry made it worse');
    expect(result.markdown).toContain('The client retried after the commit.');
  });

  it('renders an absent PR/migration as a stated decision, never a blank', () => {
    const result = renderDbIncident(
      record({
        migration: { present: false, reason: 'no schema change was required — the fix was a call-site change' },
        fixPr: { present: false, reason: 'shipped inside PR #1767 alongside three other defects' },
      }),
      { knownFeatureIds: KNOWN_FEATURE_IDS },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.markdown).toContain('none — no schema change was required');
    expect(result.markdown).not.toMatch(/- Migration:\s*$/m);
  });
});

// ---------------------------------------------------------------------------
// Refusals — an unmapped feature id must not be written
// ---------------------------------------------------------------------------

describe('validateDbIncidentRecord', () => {
  it('accepts a well-formed record against the supplied registry keys', () => {
    expect(validateDbIncidentRecord(record(), { knownFeatureIds: KNOWN_FEATURE_IDS })).toEqual([]);
  });

  it('REFUSES a feature id that is not a registry key, rather than defaulting to the caller string', () => {
    const problems = validateDbIncidentRecord(record({ featureId: 'observability_supabase' }), {
      knownFeatureIds: KNOWN_FEATURE_IDS,
    });
    expect(problems.map((p) => p.kind)).toContain('FEATURE_NOT_IN_REGISTRY');
  });

  it('refuses an unmapped "also affects" id too', () => {
    const problems = validateDbIncidentRecord(record({ alsoAffects: ['not_a_feature'] }), {
      knownFeatureIds: KNOWN_FEATURE_IDS,
    });
    expect(problems.map((p) => p.kind)).toContain('ALSO_AFFECTS_NOT_IN_REGISTRY');
  });

  it('refuses an empty registry key list — validating against nothing is not validation', () => {
    const problems = validateDbIncidentRecord(record(), { knownFeatureIds: [] });
    expect(problems.map((p) => p.kind)).toContain('NO_REGISTRY_KEYS_SUPPLIED');
  });

  it('refuses a slug the ledger checker would reject', () => {
    for (const slug of ['Save_Partial_Round', 'has spaces', '', 'trailing-']) {
      const problems = validateDbIncidentRecord(record({ slug }), { knownFeatureIds: KNOWN_FEATURE_IDS });
      expect(problems.map((p) => p.kind)).toContain('INVALID_SLUG');
    }
  });

  it('refuses a malformed or impossible date', () => {
    for (const date of ['2026-9-3', '20260903', '2026-13-01']) {
      const problems = validateDbIncidentRecord(record({ date }), { knownFeatureIds: KNOWN_FEATURE_IDS });
      expect(problems.map((p) => p.kind)).toContain('INVALID_DATE');
    }
  });

  it('refuses an incident that is not resolved — this store records repaired defects', () => {
    const problems = validateDbIncidentRecord(
      record({ status: 'repairing' as DbIncidentRecord['status'] }),
      { knownFeatureIds: KNOWN_FEATURE_IDS },
    );
    expect(problems.map((p) => p.kind)).toContain('NOT_RESOLVED');
  });

  it('refuses a record missing the mechanism, code, object or root cause', () => {
    const problems = validateDbIncidentRecord(
      record({ mechanism: '', code: '', relationOrRpc: '', rootCause: '  ' }),
      { knownFeatureIds: KNOWN_FEATURE_IDS },
    );
    const kinds = problems.map((p) => p.kind);
    expect(kinds).toContain('MISSING_FIELD');
    expect(problems.filter((p) => p.kind === 'MISSING_FIELD').length).toBe(4);
  });

  it('renderDbIncident returns the problems instead of a document when validation fails', () => {
    const result = renderDbIncident(record({ featureId: 'observability_supabase' }), {
      knownFeatureIds: KNOWN_FEATURE_IDS,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Privacy — an incident record is a durable, committed artefact
// ---------------------------------------------------------------------------

describe('privacy', () => {
  it('strips a UUID and a token out of the narrative before it becomes a committed file', () => {
    const result = renderDbIncident(
      record({
        rootCause:
          'Round 3f2504e0-4f89-11d3-9a0c-0305e82c3301 failed with token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij and coach@example.com saw it.',
      }),
      { knownFeatureIds: KNOWN_FEATURE_IDS },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.markdown).not.toContain('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    expect(result.markdown).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result.markdown).not.toContain('coach@example.com');
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const input = record({ alsoAffects: ['shot_tracking'] });
    const snapshot = JSON.stringify(input);
    renderDbIncident(input, { knownFeatureIds: KNOWN_FEATURE_IDS });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
