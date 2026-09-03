// =============================================================================
// The lens rules, and the agreement they have to keep with the screen.
//
// This is the same class of failure `incident-count-agreement.test.ts` was
// written for one layer down: three surfaces counted different things off one
// dataset and disagreed by 4 / 3 / 9 on adjacent screens. A number in
// permanent chrome that contradicts the list it links to is worse than no
// number at all.
//
// The Truth Strip is now a FOURTH consumer of that count, so it is pinned
// here — and the fixture is deliberately non-vacuous, because every agreement
// assertion below would pass trivially on an empty board.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  applyIncidentFacets,
  applyLens,
  countLenses,
  countLensesForKind,
  matchesKind,
  matchesLens,
  suppressedByClass,
} from '@/lib/admin/incidents/lens';
import { buildTruthStrip } from '@/lib/admin/incidents/truth-strip';
import { INCIDENT_LENSES, type IncidentLifecycleState, type ProofGap, type UnifiedIncident } from '@/lib/admin/incidents/types';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';
import type { DeployFreshness } from '@/lib/admin/deploy-freshness';

function incident(
  over: Partial<UnifiedIncident> & { id: string; state?: IncidentLifecycleState },
): UnifiedIncident {
  // `id` comes through `...rest` at the end; naming it here as well would be
  // overwritten and TS says so.
  const { state = 'new', ...rest } = over;
  return {
    linkTarget: `/admin/errors/${over.id}`,
    title: over.id,
    description: over.id,
    severity: 'error',
    lifecycle: { state, headline: 'h', because: [] },
    firstSeen: '2026-08-28T10:00:00.000Z',
    lastSeen: '2026-08-28T11:00:00.000Z',
    occurrences: 1,
    affectedUsers: 1,
    affectedUsersKnown: true,
    sources: [
      { source: 'app', health: 'reading', reason: null, occurrences: 1, firstSeen: null, lastSeen: null, ref: over.id, permalink: null, summary: null },
    ],
    corroboration: 1,
    appFingerprints: [over.id],
    sentryIssueIds: [],
    reliabilitySignatures: [],
    route: null,
    featureId: null,
    actionName: null,
    errorCode: null,
    sport: null,
    klass: 'defect',
    actionable: true,
    klassReason: 'r',
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: [],
    proofGaps: [],
    evidenceCoverage: { dimensions: [], present: 0, total: 7 },
    report: '',
    computedAt: '2026-08-28T12:00:00.000Z',
    ...rest,
  } as UnifiedIncident;
}

const gap = (kind: ProofGap['kind']): ProofGap => ({ kind, detail: 'd', ageMs: null });

/** A spread that exercises every lens. Deliberately mixed — see the vacuity
 *  test at the bottom, which is what stops this suite passing on an empty or
 *  fully-uniform board. */
function board(): UnifiedIncident[] {
  return [
    incident({ id: 'plain', state: 'new' }),
    incident({ id: 'repairable', state: 'repairable' }),
    incident({ id: 'evidence', state: 'needs-evidence' }),
    incident({ id: 'regressed', state: 'regressed' }),
    // Catalogued defect (e): recurred after a resolution, but the latest
    // analysis already found `not-a-defect` — expected noise, counted apart
    // from 'regressions'.
    incident({ id: 'noise', state: 'expected-recurrence' }),
    incident({ id: 'proof', state: 'awaiting-proof', proofGaps: [gap('awaiting-traffic')] }),
    incident({ id: 'closed', state: 'resolved' }),
    incident({ id: 'expected', state: 'not-a-defect', actionable: false }),
    incident({
      id: 'corroborated',
      state: 'new',
      corroboration: 2,
      sources: [
        { source: 'app', health: 'reading', reason: null, occurrences: 1, firstSeen: null, lastSeen: null, ref: 'a', permalink: null, summary: null },
        { source: 'sentry', health: 'reading', reason: null, occurrences: 3, firstSeen: null, lastSeen: null, ref: 'HELM-1', permalink: null, summary: null },
      ],
    }),
    incident({
      id: 'supabase-only',
      state: 'new',
      appFingerprints: [],
      reliabilitySignatures: ['sig'],
      sources: [
        { source: 'supabase', health: 'reading', reason: null, occurrences: 23, firstSeen: null, lastSeen: null, ref: '42501', permalink: null, summary: null },
      ],
    }),
  ];
}

describe('lens membership', () => {
  it('actionable excludes closed and not-a-defect incidents', () => {
    const ids = applyLens(board(), 'actionable').map((i) => i.id);
    expect(ids).not.toContain('closed');
    expect(ids).not.toContain('expected');
    expect(ids).toContain('repairable');
  });

  it('reliability includes a single-source NON-APP observer, not just corroborated ones', () => {
    // A Supabase-only permission fault is exactly the signal this lens exists
    // for and it has ONE source. Requiring corroboration >= 2 would drop the
    // most characteristic member of the lens.
    const ids = applyLens(board(), 'reliability').map((i) => i.id);
    expect(ids).toContain('supabase-only');
    expect(ids).toContain('corroborated');
    expect(ids).not.toContain('plain');
  });

  it('awaiting-proof catches anything with an outstanding proof gap, not only that one state', () => {
    const ids = applyLens(board(), 'awaiting-proof').map((i) => i.id);
    expect(ids).toContain('proof');
  });

  it('all includes everything, including non-defects', () => {
    expect(applyLens(board(), 'all')).toHaveLength(board().length);
  });

  it("expected-recurrence lands in its own lens, never in 'regressions' or 'actionable'", () => {
    const regressionIds = applyLens(board(), 'regressions').map((i) => i.id);
    expect(regressionIds).toContain('regressed');
    expect(regressionIds).not.toContain('noise');

    const noiseIds = applyLens(board(), 'expected-recurrence').map((i) => i.id);
    expect(noiseIds).toEqual(['noise']);

    const actionableIds = applyLens(board(), 'actionable').map((i) => i.id);
    expect(actionableIds).not.toContain('noise');
  });

  it('a blind-only source does not count as an observation for the reliability lens', () => {
    // A source we could not read did not see anything. Counting it would put
    // an incident in the lens on the strength of a failed read.
    const blindOnly = incident({
      id: 'blind',
      sources: [
        { source: 'vercel', health: 'blind', reason: 'no token', occurrences: null, firstSeen: null, lastSeen: null, ref: null, permalink: null, summary: null },
      ],
    });
    expect(matchesLens(blindOnly, 'reliability')).toBe(false);
  });
});

describe('countLenses', () => {
  it('produces a count for every lens, including the ones that are empty', () => {
    // A lens that vanishes when its count is zero makes the set unlearnable.
    const counts = countLenses([]);
    expect(Object.keys(counts).sort()).toEqual([...INCIDENT_LENSES].sort());
    for (const lens of INCIDENT_LENSES) expect(counts[lens]).toBe(0);
  });

  it('each count equals the length of the list that lens actually renders', () => {
    // THE invariant. If these ever diverge, the rail is lying about the screen
    // it navigates to.
    const incidents = board();
    const counts = countLenses(incidents);
    for (const lens of INCIDENT_LENSES) {
      expect(counts[lens], `lens ${lens} disagrees with its own list`).toBe(
        applyLens(incidents, lens).length,
      );
    }
  });
});

describe('the Truth Strip agrees with the Incidents list', () => {
  const coverage: CoverageSummary = {
    reading: 4, partial: 0, blind: 0, unknown: 0, total: 4,
    anyBlind: false, blindSources: [], oldestAgeMs: 1000, worst: 'reading',
  };
  const deploy: DeployFreshness = {
    state: 'current',
    summary: 'Production is running 255e63e, level with main.',
    red: null,
    ageHours: 1,
  };

  it("the strip's incident count equals the actionable lens", () => {
    // The fourth consumer of this number. The badge, the KPI strip and the
    // tab header already agree via incident-count-agreement.test.ts; the
    // strip must not be the one that drifts.
    const incidents = board();
    const cells = buildTruthStrip({
      incidents,
      coverage,
      deploy,
      deploymentId: null,
      loop: null,
      loopAgeMs: null,
      computedAt: '2026-08-28T12:00:00.000Z',
      now: Date.parse('2026-08-28T12:00:30.000Z'),
    });
    const incidentsCell = cells.find((c) => c.id === 'incidents')!;
    expect(incidentsCell.value).toBe(String(applyLens(incidents, 'actionable').length));
  });

  it('is not vacuous — the fixture really does span the lenses', () => {
    // Every agreement assertion above passes trivially on an empty board, and
    // on a board where every incident lands in the same lens. This is the
    // guard that makes them mean something.
    const counts = countLenses(board());
    const nonEmpty = INCIDENT_LENSES.filter((lens) => counts[lens] > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(6);
    expect(counts.actionable).toBeGreaterThan(0);
    expect(counts.actionable).toBeLessThan(counts.all);
  });
});

describe('the kind facet', () => {
  const defect = incident({ id: 'a', klass: 'defect', actionable: true });
  const telemetry = incident({ id: 'b', klass: 'telemetry', actionable: false });
  const emptyState = incident({ id: 'c', klass: 'empty_state', actionable: false });
  const all = [defect, telemetry, emptyState];

  it('defaults to the actionable classes only', () => {
    expect(matchesKind(defect, undefined)).toBe(true);
    expect(matchesKind(telemetry, undefined)).toBe(false);
  });

  it('shows everything under kind=all', () => {
    expect(all.every((i) => matchesKind(i, 'all'))).toBe(true);
  });

  it('narrows to one class when a class is named', () => {
    expect(matchesKind(telemetry, 'telemetry')).toBe(true);
    expect(matchesKind(defect, 'telemetry')).toBe(false);
  });

  /**
   * The regression: `?kind=` was parsed and rendered as chips, but nothing
   * downstream consulted it, so every one of those controls was inert against
   * the canonical queue. Both facets must narrow the same list.
   */
  it('composes with the lens rather than replacing it', () => {
    expect(applyIncidentFacets(all, 'all', undefined).map((i) => i.id)).toEqual(['a']);
    expect(applyIncidentFacets(all, 'all', 'all').map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(applyIncidentFacets(all, 'all', 'empty_state').map((i) => i.id)).toEqual(['c']);
    // A lens that excludes the incident still wins, whatever the kind says.
    expect(applyIncidentFacets(all, 'regressions', 'all')).toEqual([]);
  });

  it('counts what the default view holds back, by class', () => {
    // Ordered by INCIDENT_CLASS_ORDER, not by discovery, so the chips do not
    // reshuffle between renders.
    expect(suppressedByClass(all)).toEqual([
      { klass: 'empty_state', count: 1 },
      { klass: 'telemetry', count: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// The stalled lens — throughput as a filter over the SAME model.
// ---------------------------------------------------------------------------

describe('the stalled lens', () => {
  const COMPUTED_AT = '2026-08-28T12:00:00.000Z';
  const daysBefore = (d: number) => new Date(Date.parse(COMPUTED_AT) - d * 86_400_000).toISOString();

  it('includes an unanalysed incident Diagnose has had two cycles to reach, judged against computedAt', () => {
    const stalled = incident({ id: 'old', state: 'new', firstSeen: daysBefore(5), computedAt: COMPUTED_AT });
    const fresh = incident({ id: 'fresh', state: 'diagnosing', firstSeen: daysBefore(0.5), computedAt: COMPUTED_AT });
    expect(matchesLens(stalled, 'stalled')).toBe(true);
    expect(matchesLens(fresh, 'stalled')).toBe(false);
  });

  it('never includes an incident whose repair state could not be read', () => {
    const unreadable = incident({
      id: 'unread',
      state: 'diagnosing',
      firstSeen: daysBefore(10),
      computedAt: COMPUTED_AT,
      analysis: {
        category: 'fix-here',
        probableCause: 'c',
        suggestedFix: 'FIX HERE: x',
        confidence: 'high',
        suspectFiles: [],
        relatedFingerprints: [],
        model: 'm',
        generatedAt: daysBefore(9),
        repairVerdict: 'not-reviewed',
      },
      repair: { status: 'unknown', prNumber: null, prUrl: null, branch: null, checks: null, mergedAt: null, mergeSha: null, note: null },
    });
    expect(matchesLens(unreadable, 'stalled')).toBe(false);
  });

  it('is counted like every other lens', () => {
    const counts = countLenses([
      incident({ id: 'old', state: 'new', firstSeen: daysBefore(5), computedAt: COMPUTED_AT }),
      incident({ id: 'fresh', state: 'new' }),
    ]);
    expect(counts.stalled).toBe(1);
  });
});

describe('awaiting-proof and blindness', () => {
  it('does not admit an incident whose only gap is a blind source — a failed read is not a fix awaiting proof', () => {
    const blindOnly = incident({ id: 'b', state: 'new', proofGaps: [gap('source-blind')] });
    expect(matchesLens(blindOnly, 'awaiting-proof')).toBe(false);
  });

  it('still admits a real proof gap that happens to sit beside a blind one', () => {
    const both = incident({ id: 'b', state: 'new', proofGaps: [gap('source-blind'), gap('awaiting-deploy')] });
    expect(matchesLens(both, 'awaiting-proof')).toBe(true);
  });
});

describe('countLensesForKind — the rail agrees with the faceted list', () => {
  it('measures each lens over the list the kind facet leaves', () => {
    const rows = board();
    for (const kind of [undefined, 'all', 'telemetry'] as const) {
      const counts = countLensesForKind(rows, kind);
      for (const lens of INCIDENT_LENSES) {
        expect(counts[lens]).toBe(applyIncidentFacets(rows, lens, kind).length);
      }
    }
  });

  it('differs from the unfaceted count exactly when the facet holds rows back — the drift it exists to close', () => {
    const rows = board();
    expect(countLensesForKind(rows, undefined).all).toBeLessThan(countLenses(rows).all);
    expect(countLensesForKind(rows, 'all')).toEqual(countLenses(rows));
  });
});
