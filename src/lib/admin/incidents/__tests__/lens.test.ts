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
import { applyLens, countLenses, matchesLens } from '@/lib/admin/incidents/lens';
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
