/**
 * The resolution ledger's I/O boundary: can the board tell "nothing is
 * resolved" from "we could not read what is resolved"?
 *
 * THE HYPOTHESIS UNDER TEST. `fetchResolutions` returns a bare
 * `Map<fingerprint, row>`. On a Supabase error it logs a warning and returns an
 * EMPTY map — byte-identical to the map it returns when the ledger is healthy
 * and genuinely holds no rows for these fingerprints. Its own comment says the
 * fail-soft is fine because "the lifecycle derivation handles" the unknown.
 * These tests ask whether it can.
 *
 * WHY THIS IS THE RIGHT BOUNDARY TO PIN. The sibling arm of the same producer
 * already models this correctly:
 *
 *     fetchRepairPrs -> { byIncident, readable, reason }
 *     toRepair(pr, readable, reason) -> status: 'unknown' + an explaining note
 *
 * and `IncidentResolution.resolvedBy` is typed `'auto' | 'manual' | 'unknown'`
 * — the union already anticipates the third state. Measured before writing
 * this: the only producer is `resolvedBy: row.resolutionSource`, which is
 * `'auto' | 'manual'`. Nothing in the codebase ever produces `'unknown'`.
 * The type knew about the state; the code could not reach it.
 *
 * So this is not a request for a new abstraction. It is one arm of one producer
 * not following the convention its neighbour already uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FINGERPRINT = 'abc123deadbeef';
const NOW = '2026-08-30T00:00:00.000Z';

/** Swapped per test: what the resolution-ledger SELECT resolves to. */
let resolutionResult: { data: unknown[] | null; error: { message: string } | null };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'admin_error_resolutions') {
        return { select: () => ({ in: async () => resolutionResult }) };
      }
      // Every other table this producer touches: healthy and empty. The chain
      // is thenable so a builder can be awaited at any depth, and every builder
      // method returns the chain so call order does not matter.
      const empty = { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'gte', 'lte', 'order', 'limit', 'not', 'or', 'filter']) {
        chain[m] = () => chain;
      }
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(empty).then(resolve);
      chain.single = async () => ({ data: null, error: null });
      chain.maybeSingle = async () => ({ data: null, error: null });
      return chain;
    },
  }),
}));

vi.mock('@/lib/admin/data/incident-feed', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    fetchIncidentFeed: vi.fn(async () => ({
      // correlateIncidents reads feed.incidents (TriageItem[]), not appEvents.
      // Shape borrowed from correlate.test.ts's own app fixture.
      incidents: [
        {
          key: `app:${FINGERPRINT}`,
          origin: 'app',
          title: 'Qualifier save failed',
          severity: 'error',
          sport: 'golf',
          occurrences: 3,
          affectedUsers: 2,
          firstSeen: NOW,
          lastSeen: NOW,
          permalink: null,
          eventIds: ['evt-1'],
          substatus: null,
          source: 'client',
          feature: 'golf-qualifiers',
          actionName: 'saveQualifier',
          route: '/api/golf/qualifiers/save',
          klass: 'defect',
          actionable: true,
          klassReason: 'Unexpected failure (severity-derived)',
          hasDegradedMessage: false,
          errorCode: null,
          fingerprint: FINGERPRINT,
          description: 'Qualifier save failed',
          hasRca: false,
          report: '## Stack trace\n\nat saveQualifier',
        },
      ],
      appEvents: [],
      sentry: { status: 'unconfigured', data: null, error: null },
      counts: {},
    })),
  };
});

vi.mock('@/lib/admin/data/reliability', () => ({
  fetchReliabilitySnapshot: vi.fn(async () => ({ status: 'unconfigured', data: null, error: null })),
}));

vi.mock('@/lib/admin/github-pr-timeline', () => ({
  fetchWorkLog: vi.fn(async () => ({ status: 'ok', data: { entries: [] }, error: null })),
}));

vi.mock('@/lib/admin/auto-resolve', () => ({
  getProductionDeployAt: vi.fn(async () => ({ deployAt: null, sha: null, reason: 'test fixture' })),
}));

import { fetchIncidentBoard } from '@/lib/admin/incidents/fetch';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolution ledger: known-empty vs could-not-read', () => {
  it('a HEALTHY ledger with no matching rows yields a knowably-unresolved incident', async () => {
    // The control case. Nothing is resolved, and we know that.
    resolutionResult = { data: [], error: null };
    const board = await fetchIncidentBoard({ windowHours: 24 });
    expect(board.incidents.length).toBeGreaterThan(0);
    expect(board.incidents[0]!.resolution).toBeNull();
  });

  it('an UNREADABLE ledger degrades the app source instead of going unreported', async () => {
    // THE DEFECT, and the shape the fix had to take.
    //
    // A first draft of this test asserted the incident carried
    // `resolution.resolvedBy === 'unknown'` — mirroring the repair arm, whose
    // `toRepair` returns `status: 'unknown'` when GitHub is unreadable.
    // Measured before implementing it: LifecycleSpine.tsx computes
    //
    //     closeState = regressed ? 'failed' : incident.resolution !== null ? 'proven' : 'not-reached'
    //
    // so a non-null resolution for an UNREADABLE ledger would have rendered the
    // incident as PROVEN CLOSED. That upgrades "we could not read this" into
    // "this is fixed" — strictly worse than the bug being fixed.
    //
    // The board already models unreadable inputs: sources carry health, and
    // `partial` exists for "reading one arm, blind on another". The app source
    // was hardcoded `reading` on the reasoning that app EVENTS throw when
    // unreadable — true of events, false of the resolution ledger, which fails
    // soft. So the ledger's readability degrades the app source, and flows into
    // coverage and the blindness beacon with no new type and no new UI.
    resolutionResult = { data: null, error: { message: 'connection reset by peer' } };
    const board = await fetchIncidentBoard({ windowHours: 24 });

    const app = board.freshness.find((f) => f.source === 'app');
    expect(app, 'the app source is always reported').toBeDefined();
    expect(app?.health, 'an unreadable resolution ledger must not read as fully healthy').toBe('partial');
    // SourceFreshness carries no reason field — reasons surface through the
    // blindness beacon, which is the channel a human actually reads.
    expect(board.blindnessNote ?? '').toMatch(/resolution ledger unreadable/i);
    expect(board.coverage.partial).toBeGreaterThan(0);

    // And the incident is still NOT claimed resolved — the fix must not
    // manufacture a resolution either.
    expect(board.incidents[0]!.resolution).toBeNull();
  });

  it('the two cases are DISTINGUISHABLE from each other', async () => {
    // The property that actually matters, stated directly: healthy-empty and
    // unreadable must not produce the same board.
    resolutionResult = { data: [], error: null };
    const healthy = await fetchIncidentBoard({ windowHours: 24 });

    resolutionResult = { data: null, error: { message: 'connection reset by peer' } };
    const broken = await fetchIncidentBoard({ windowHours: 24 });

    const h = healthy.freshness.find((f) => f.source === 'app');
    const b = broken.freshness.find((f) => f.source === 'app');
    expect(h?.health).toBe('reading');
    expect(b?.health).toBe('partial');
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(h));
  });
});
