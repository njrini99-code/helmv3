// =============================================================================
// Proof debt — the list that must not read as "nothing outstanding" when it is
// really "we could not finish computing this".
//
// The panel exists because the open/resolved axis cannot express an incident
// whose fix is merged, deployed, and simply has not seen traffic since. It
// falls off the triage queue (nothing is wrong with it) and never reaches the
// archive (nothing proved it fixed), so the only thing that brings it back is
// the fault recurring — which is exactly what the proof was meant to pre-empt.
//
// Two behaviours are load-bearing and pinned here: one row per INCIDENT (not
// per gap, or the count disagrees with the amount of work), and an empty list
// under a blind source that says so rather than showing an all-clear.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { selectProofDebt, summarizeProofDebt } from '@/app/admin/_components/ProofDebtPanel';
import type { ProofGap, UnifiedIncident } from '@/lib/admin/incidents/types';

function incident(id: string, gaps: ProofGap[], description = `incident ${id}`): UnifiedIncident {
  return {
    id,
    linkTarget: `/admin/errors/${id}`,
    title: description,
    description,
    severity: 'error',
    lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
    firstSeen: '2026-08-28T10:00:00.000Z',
    lastSeen: '2026-08-28T11:00:00.000Z',
    occurrences: 1,
    affectedUsers: 0,
    affectedUsersKnown: false,
    sources: [],
    corroboration: 1,
    appFingerprints: [id],
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
    isFixture: false,
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: [],
    proofGaps: gaps,
    evidenceCoverage: { dimensions: [], present: 0, total: 7 },
    report: '',
    computedAt: '2026-08-28T12:00:00.000Z',
  } as UnifiedIncident;
}

const gap = (kind: ProofGap['kind'], detail: string): ProofGap => ({ kind, detail, ageMs: null });

describe('selectProofDebt', () => {
  it('emits one row per incident, not one per gap', () => {
    // An incident with three outstanding gaps is still ONE piece of work.
    // Listing it three times would make the panel's count disagree with the
    // number of things an operator actually has to deal with.
    const rows = selectProofDebt([
      incident('a', [
        gap('awaiting-traffic', 'live 20m'),
        gap('awaiting-ci', '5 of 6 checks'),
        gap('source-blind', 'SENTRY: 500'),
      ]),
    ]);
    expect(rows).toHaveLength(1);
  });

  it('carries the most actionable gap, not the first one written', () => {
    // Ordered by what the operator can DO: a blind source is theirs to act on
    // now, while waiting for traffic is a clock nobody can hurry.
    const rows = selectProofDebt([
      incident('a', [gap('awaiting-traffic', 'live 20m'), gap('source-blind', 'SENTRY: 500')]),
    ]);
    expect(rows[0]!.kind).toBe('source-blind');
    expect(rows[0]!.detail).toBe('SENTRY: 500');
  });

  it('skips incidents with no gaps entirely', () => {
    expect(selectProofDebt([incident('clean', [])])).toEqual([]);
  });

  it('sorts most actionable first across incidents', () => {
    const rows = selectProofDebt([
      incident('slow', [gap('awaiting-traffic', 'live 20m')]),
      incident('blind', [gap('source-blind', 'SENTRY: 500')]),
      incident('ci', [gap('awaiting-ci', '5 of 6')]),
    ]);
    expect(rows.map((r) => r.incidentId)).toEqual(['blind', 'ci', 'slow']);
  });
});

describe('summarizeProofDebt', () => {
  it('counts by kind in the same priority order the rows use', () => {
    const rows = selectProofDebt([
      incident('a', [gap('awaiting-traffic', 'x')]),
      incident('b', [gap('awaiting-traffic', 'y')]),
      incident('c', [gap('source-blind', 'z')]),
    ]);
    expect(summarizeProofDebt(rows)).toEqual([
      ['source-blind', 1],
      ['awaiting-traffic', 2],
    ]);
  });
});

// `ProofDebtPanel` (the React component that used to render this list as its
// own Overview section) is deleted — bridge redesign plan §2.1: it was the
// `awaiting-proof` lens rendered a second time. Its render-time tests went
// with it. `selectProofDebt`/`summarizeProofDebt` above are the surviving
// pure functions; `CommandDeck.tsx`'s Self-Heal Circuit proof-debt chip
// reuses `selectProofDebt`'s count directly (see
// `SelfHealCircuitSummary.test.tsx` for that chip's own tests), and the full
// list is one click away at `/admin/errors?lens=awaiting-proof`.
