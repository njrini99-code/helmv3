import { describe, it, expect } from 'vitest';
import {
  deriveLifecycle,
  needsAttention,
  LIFECYCLE_ATTENTION_ORDER,
  DIAGNOSING_GRACE_MS,
  type LifecycleInput,
} from '@/lib/admin/incidents/lifecycle';
import { INCIDENT_LIFECYCLE_STATES, type IncidentLifecycleState } from '@/lib/admin/incidents/types';
import type { IncidentAnalysis, IncidentRepair, IncidentDeployProof, IncidentResolution } from '@/lib/admin/incidents/types';
import type { RcaCategory } from '@/lib/admin/rca-category';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fixed clock so every test is deterministic regardless of when it runs. */
const NOW = Date.parse('2026-08-28T12:00:00.000Z');

/** `msAgo` before `NOW`, as an ISO string — the only timestamp shape every
 *  evidence field in `types.ts` uses. */
function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Old enough that the Diagnose grace window (`DIAGNOSING_GRACE_MS`, one
 *  day) has definitely elapsed — the default `firstSeen` for every fixture
 *  that is not specifically testing the grace window itself. Using anything
 *  younger by accident would make an unrelated test pass for the wrong
 *  reason: falling into the grace-window `'diagnosing'` branch instead of
 *  the branch the test claims to exercise. */
const WELL_PAST_GRACE = 2 * DAY;

function baseInput(overrides: Partial<LifecycleInput> = {}): LifecycleInput {
  return {
    firstSeen: iso(WELL_PAST_GRACE),
    lastSeen: iso(HOUR),
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    regressed: false,
    actionable: true,
    klass: 'defect',
    hasBlindSource: false,
    now: NOW,
    ...overrides,
  };
}

function makeAnalysis(category: RcaCategory, overrides: Partial<IncidentAnalysis> = {}): IncidentAnalysis {
  return {
    category,
    probableCause: 'test cause',
    suggestedFix: 'test fix',
    confidence: 'medium',
    suspectFiles: [],
    relatedFingerprints: [],
    model: 'test-model',
    generatedAt: iso(DAY),
    repairVerdict: 'not-reviewed',
    ...overrides,
  };
}

function makeRepair(status: IncidentRepair['status'], overrides: Partial<IncidentRepair> = {}): IncidentRepair {
  return {
    status,
    prNumber: null,
    prUrl: null,
    branch: null,
    checks: null,
    mergedAt: null,
    mergeSha: null,
    note: null,
    ...overrides,
  };
}

function makeDeployProof(overrides: Partial<IncidentDeployProof> = {}): IncidentDeployProof {
  return {
    fixedInSha: null,
    productionSha: null,
    deployedAt: null,
    servesFix: null,
    lastOccurrenceAt: null,
    sinceDeployMs: null,
    sufficientProof: null,
    gap: null,
    ...overrides,
  };
}

function makeResolution(overrides: Partial<IncidentResolution> = {}): IncidentResolution {
  return {
    resolvedAt: iso(6 * DAY),
    resolvedBy: 'manual',
    fixedInSha: 'abc1234',
    note: null,
    reopenedCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rule 1 — regressed outranks everything
// ---------------------------------------------------------------------------

describe('rule 1: regressed', () => {
  it('regressed with a resolution on record -> regressed, headline states both ages', () => {
    const v = deriveLifecycle(
      baseInput({
        regressed: true,
        resolution: makeResolution({ resolvedAt: iso(6 * DAY), resolvedBy: 'manual' }),
        lastSeen: iso(14 * MINUTE),
      }),
    );
    expect(v.state).toBe('regressed');
    expect(v.headline).toBe('Fixed 6 days ago, returned 14 minutes ago.');
    expect(v.because.some((l) => l.status === 'failed')).toBe(true);
  });

  it('regressed with no resolution object still reports regressed, not a crash', () => {
    const v = deriveLifecycle(baseInput({ regressed: true, resolution: null }));
    expect(v.state).toBe('regressed');
    expect(v.because.length).toBeGreaterThan(0);
  });

  it('PRECEDENCE: resolution present AND regressed -> regressed, never resolved', () => {
    const v = deriveLifecycle(
      baseInput({
        regressed: true,
        resolution: makeResolution(),
      }),
    );
    expect(v.state).toBe('regressed');
    expect(v.state).not.toBe('resolved');
  });

  // Catalogued defect (e): a fingerprint whose latest analysis already found
  // NOT A DEFECT is expected noise when it recurs, not a new regression — it
  // must not alarm an operator with the same treatment as a fault that
  // regressed for real.
  it("regressed AND the latest analysis says not-a-defect -> 'expected-recurrence', not 'regressed'", () => {
    const v = deriveLifecycle(
      baseInput({
        regressed: true,
        resolution: makeResolution({ resolvedAt: iso(6 * DAY) }),
        analysis: makeAnalysis('not-a-defect'),
        lastSeen: iso(14 * MINUTE),
      }),
    );
    expect(v.state).toBe('expected-recurrence');
    expect(v.state).not.toBe('regressed');
    expect(v.because.length).toBeGreaterThan(0);
  });

  it('regressed with any OTHER analysis category (or none) still reports regressed', () => {
    for (const analysis of [null, makeAnalysis('fix-here'), makeAnalysis('already-fixed'), makeAnalysis('needs-more-evidence'), makeAnalysis('uncategorized')]) {
      const v = deriveLifecycle(baseInput({ regressed: true, analysis }));
      expect(v.state).toBe('regressed');
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — resolved
// ---------------------------------------------------------------------------

describe('rule 2: resolved', () => {
  it('resolution present, not regressed -> resolved', () => {
    const v = deriveLifecycle(
      baseInput({ regressed: false, resolution: makeResolution({ resolvedBy: 'auto' }) }),
    );
    expect(v.state).toBe('resolved');
    expect(v.because.every((l) => l.status === 'met')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — not-a-defect via the classifier
// ---------------------------------------------------------------------------

describe('rule 3: not-a-defect (classifier)', () => {
  it('actionable === false -> not-a-defect, even with no analysis or repair', () => {
    const v = deriveLifecycle(baseInput({ actionable: false, klass: 'access' }));
    expect(v.state).toBe('not-a-defect');
    expect(v.headline).toMatch(/not treated as a defect/i);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — pr-failed
// ---------------------------------------------------------------------------

describe('rule 4: pr-failed', () => {
  it('repair.status === "pr-failed" -> pr-failed', () => {
    const v = deriveLifecycle(
      baseInput({ repair: makeRepair('pr-failed', { prNumber: 42, checks: { total: 3, passed: 1, failed: 2, pending: 0 } }) }),
    );
    expect(v.state).toBe('pr-failed');
    expect(v.because.some((l) => l.status === 'failed' && l.text.includes('#42'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — merged, and everything downstream of it
// ---------------------------------------------------------------------------

describe('rule 5: merged sub-states', () => {
  it('merged + servesFix true + sufficientProof true -> resolved', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('merged', { mergedAt: iso(2 * DAY) }),
        deployProof: makeDeployProof({ servesFix: true, sufficientProof: true }),
      }),
    );
    expect(v.state).toBe('resolved');
  });

  it('merged + servesFix true + sufficientProof false -> awaiting-proof, with a pending line about proof/traffic', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('merged'),
        deployProof: makeDeployProof({ servesFix: true, sufficientProof: false }),
      }),
    );
    expect(v.state).toBe('awaiting-proof');
    expect(
      v.because.some((l) => l.status === 'pending' && /proof|traffic/i.test(l.text)),
    ).toBe(true);
  });

  it('merged + servesFix true + sufficientProof null (not yet known) -> awaiting-proof', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('merged'),
        deployProof: makeDeployProof({ servesFix: true, sufficientProof: null }),
      }),
    );
    expect(v.state).toBe('awaiting-proof');
  });

  it('merged + servesFix false -> awaiting-deploy', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('merged'),
        deployProof: makeDeployProof({ servesFix: false }),
      }),
    );
    expect(v.state).toBe('awaiting-deploy');
  });

  it('merged + deployProof === null (unreadable) -> merged, NOT resolved and NOT awaiting-deploy', () => {
    // Rendering an unreadable deploy check as either "resolved" or
    // "awaiting-deploy" is the unknown -> healthy (or unknown -> stalled)
    // move the engineering OS forbids: a read that failed is not evidence
    // that the fix is live, and it is equally not evidence that it isn't.
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('merged'),
        deployProof: null,
      }),
    );
    expect(v.state).toBe('merged');
    expect(v.state).not.toBe('resolved');
    expect(v.state).not.toBe('awaiting-deploy');
  });

  it('merged + deployProof.servesFix === null (deploy data unreadable) -> merged, NOT resolved and NOT awaiting-deploy', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('merged'),
        deployProof: makeDeployProof({ servesFix: null }),
      }),
    );
    expect(v.state).toBe('merged');
    expect(v.state).not.toBe('resolved');
    expect(v.state).not.toBe('awaiting-deploy');
  });
});

// ---------------------------------------------------------------------------
// Rules 6-7 — in-flight repair
// ---------------------------------------------------------------------------

describe('rules 6-7: pr-open, repairing', () => {
  it('repair.status === "pr-open" -> pr-open', () => {
    const v = deriveLifecycle(baseInput({ repair: makeRepair('pr-open', { prNumber: 7 }) }));
    expect(v.state).toBe('pr-open');
  });

  it('repair.status === "running" -> repairing', () => {
    const v = deriveLifecycle(baseInput({ repair: makeRepair('running') }));
    expect(v.state).toBe('repairing');
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — repair lookup failed, but there is an analysis to fall back to
// ---------------------------------------------------------------------------

describe('rule 8: diagnosing via a failed repair lookup', () => {
  it('repair.status === "unknown" with an analysis -> diagnosing, with a because line naming the failed lookup', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('unknown'),
        analysis: makeAnalysis('fix-here'),
      }),
    );
    expect(v.state).toBe('diagnosing');
    expect(
      v.because.some((l) => l.status === 'failed' && /repair lookup failed/i.test(l.text)),
    ).toBe(true);
  });

  it('repair.status === "unknown" with NO analysis does not match rule 8 (falls through to grace/blind/new)', () => {
    const v = deriveLifecycle(
      baseInput({
        repair: makeRepair('unknown'),
        analysis: null,
      }),
    );
    // Well past the grace window, no blind source -> falls all the way to
    // 'new'. The point of this test is that it is NOT 'diagnosing' via
    // rule 8, which requires an analysis to exist.
    expect(v.state).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — analysis-derived states
// ---------------------------------------------------------------------------

describe('rule 9: analysis category', () => {
  it('needs-more-evidence -> needs-evidence', () => {
    const v = deriveLifecycle(baseInput({ analysis: makeAnalysis('needs-more-evidence') }));
    expect(v.state).toBe('needs-evidence');
  });

  it('not-a-defect (from analysis, actionable still true) -> not-a-defect', () => {
    const v = deriveLifecycle(baseInput({ analysis: makeAnalysis('not-a-defect') }));
    expect(v.state).toBe('not-a-defect');
  });

  it('already-fixed -> awaiting-proof (claim made, proof not in yet)', () => {
    const v = deriveLifecycle(baseInput({ analysis: makeAnalysis('already-fixed') }));
    expect(v.state).toBe('awaiting-proof');
  });

  it('fix-here -> repairable', () => {
    const v = deriveLifecycle(baseInput({ analysis: makeAnalysis('fix-here') }));
    expect(v.state).toBe('repairable');
  });

  it('uncategorized -> repairable (isRepairCandidate covers both fix-here and uncategorized)', () => {
    const v = deriveLifecycle(baseInput({ analysis: makeAnalysis('uncategorized') }));
    expect(v.state).toBe('repairable');
  });
});

// ---------------------------------------------------------------------------
// Rule 9b — Diagnose grace window
// ---------------------------------------------------------------------------

describe('rule 9b: diagnosing via the Diagnose grace window', () => {
  it('no analysis, firstSeen inside the grace window -> diagnosing', () => {
    const v = deriveLifecycle(baseInput({ firstSeen: iso(20 * MINUTE), analysis: null }));
    expect(v.state).toBe('diagnosing');
  });

  it('no analysis, firstSeen exactly at the grace boundary still counts as inside it', () => {
    const v = deriveLifecycle(baseInput({ firstSeen: iso(DIAGNOSING_GRACE_MS - 1), analysis: null }));
    expect(v.state).toBe('diagnosing');
  });

  it('no analysis, firstSeen past the grace window, no blind source -> new (not diagnosing)', () => {
    const v = deriveLifecycle(baseInput({ firstSeen: iso(DIAGNOSING_GRACE_MS + HOUR), analysis: null }));
    expect(v.state).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// Rule 10 — unknown, from a blind source
// ---------------------------------------------------------------------------

describe('rule 10: unknown from a blind source', () => {
  it('blind source, no other evidence, past the grace window -> unknown', () => {
    const v = deriveLifecycle(baseInput({ hasBlindSource: true }));
    expect(v.state).toBe('unknown');
    expect(v.because.some((l) => l.status === 'failed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 11 — new
// ---------------------------------------------------------------------------

describe('rule 11: new', () => {
  it('nothing above matched -> new', () => {
    const v = deriveLifecycle(baseInput());
    expect(v.state).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// needsAttention
// ---------------------------------------------------------------------------

describe('needsAttention', () => {
  it('is true for regressed, pr-failed, repairable, needs-evidence', () => {
    expect(needsAttention('regressed')).toBe(true);
    expect(needsAttention('pr-failed')).toBe(true);
    expect(needsAttention('repairable')).toBe(true);
    expect(needsAttention('needs-evidence')).toBe(true);
  });

  it('is false for resolved, not-a-defect', () => {
    expect(needsAttention('resolved')).toBe(false);
    expect(needsAttention('not-a-defect')).toBe(false);
  });

  it('the needsAttention states are exactly the leading run of LIFECYCLE_ATTENTION_ORDER', () => {
    // The two are independent literals in the source — this pins the
    // relationship the module doc comment states in prose, so the two
    // cannot drift apart silently.
    const leading = LIFECYCLE_ATTENTION_ORDER.filter(needsAttention);
    expect(LIFECYCLE_ATTENTION_ORDER.slice(0, leading.length)).toEqual(leading);
  });
});

// ---------------------------------------------------------------------------
// LIFECYCLE_ATTENTION_ORDER
// ---------------------------------------------------------------------------

describe('LIFECYCLE_ATTENTION_ORDER', () => {
  it('contains every member of INCIDENT_LIFECYCLE_STATES exactly once', () => {
    // Set equality, not just "same length" or "same members ignoring
    // duplicates" — this is the test that catches a state added to the
    // union later and never ranked here, per the module's own doc comment.
    expect(LIFECYCLE_ATTENTION_ORDER.length).toBe(INCIDENT_LIFECYCLE_STATES.length);
    expect(new Set(LIFECYCLE_ATTENTION_ORDER).size).toBe(LIFECYCLE_ATTENTION_ORDER.length);
    const ranked = new Set<IncidentLifecycleState>(LIFECYCLE_ATTENTION_ORDER);
    for (const state of INCIDENT_LIFECYCLE_STATES) {
      expect(ranked.has(state)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Non-vacuity
// ---------------------------------------------------------------------------

describe('non-vacuity', () => {
  const inputs: LifecycleInput[] = [
    baseInput({ regressed: true, resolution: makeResolution() }), // regressed
    baseInput({ resolution: makeResolution() }), // resolved
    baseInput({ actionable: false }), // not-a-defect
    baseInput({ repair: makeRepair('pr-failed') }), // pr-failed
    baseInput({ repair: makeRepair('merged'), deployProof: makeDeployProof({ servesFix: true, sufficientProof: true }) }), // resolved
    baseInput({ repair: makeRepair('merged'), deployProof: makeDeployProof({ servesFix: true, sufficientProof: false }) }), // awaiting-proof
    baseInput({ repair: makeRepair('merged'), deployProof: makeDeployProof({ servesFix: false }) }), // awaiting-deploy
    baseInput({ repair: makeRepair('merged'), deployProof: null }), // merged
    baseInput({ repair: makeRepair('pr-open') }), // pr-open
    baseInput({ repair: makeRepair('running') }), // repairing
    baseInput({ repair: makeRepair('unknown'), analysis: makeAnalysis('fix-here') }), // diagnosing
    baseInput({ analysis: makeAnalysis('needs-more-evidence') }), // needs-evidence
    baseInput({ analysis: makeAnalysis('fix-here') }), // repairable
    // 'candidate' has no dedicated rule — it is meant to fall through to the
    // analysis-derived rules exactly like 'none' or a null repair would.
    // Pinned here so that fallthrough stays intentional if a rule is ever
    // added for it.
    baseInput({ repair: makeRepair('candidate'), analysis: makeAnalysis('fix-here') }), // repairable
    baseInput({ firstSeen: iso(20 * MINUTE), analysis: null }), // diagnosing (grace)
    baseInput({ hasBlindSource: true }), // unknown
    baseInput(), // new
  ];

  it('the fixture set above produces at least 8 distinct lifecycle states', () => {
    const states = new Set(inputs.map((i) => deriveLifecycle(i).state));
    expect(states.size).toBeGreaterThanOrEqual(8);
  });

  it('every verdict carries a non-empty headline and at least one because line', () => {
    for (const input of inputs) {
      const v = deriveLifecycle(input);
      expect(v.headline.length).toBeGreaterThan(0);
      expect(v.because.length).toBeGreaterThan(0);
    }
  });
});
