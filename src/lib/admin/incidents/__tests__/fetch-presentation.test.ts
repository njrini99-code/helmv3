/**
 * Wiring test: `fetchIncidentBoard` must carry an `IncidentPresentation` per
 * incident id, computed by the SAME resolver `present.ts` exports, so the
 * board and a direct call to `resolveIncidentPresentation` can never
 * disagree.
 *
 * Deliberately additive-only, per `present.ts`'s Phase-0 scope: this does not
 * assert anything about card rendering, only that the read path now carries
 * the projection. Mocks borrowed from `resolution-boundary.test.ts`'s known
 * shape — the minimum surface `fetchIncidentBoard` touches.
 */
import { describe, it, expect, vi } from 'vitest';

const FINGERPRINT = 'presentation-wiring-fp';
const NOW = '2026-08-30T00:00:00.000Z';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
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
      incidents: [
        {
          key: `app:${FINGERPRINT}`,
          origin: 'app',
          title: 'permission denied for schema helm_private',
          severity: 'error',
          sport: 'golf',
          occurrences: 5,
          affectedUsers: 3,
          firstSeen: NOW,
          lastSeen: NOW,
          permalink: null,
          eventIds: ['evt-1'],
          substatus: null,
          source: 'server',
          feature: 'round_review_ai',
          actionName: 'generateRoundRecap.persist',
          route: null,
          klass: 'defect',
          actionable: true,
          klassReason: 'Unexpected failure (severity-derived)',
          hasDegradedMessage: false,
          errorCode: '42501',
          fingerprint: FINGERPRINT,
          description: 'permission denied for schema helm_private',
          hasRca: false,
          report: '## Stack trace\n\nat generateRoundRecap.persist',
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
import { presentationSubjectFromIncident, resolveIncidentPresentation } from '@/lib/admin/incidents/present';

describe('fetchIncidentBoard — presentations wiring', () => {
  it('carries one IncidentPresentation per incident, agreeing with a direct resolver call', async () => {
    const board = await fetchIncidentBoard({ windowHours: 24 });
    expect(board.incidents.length).toBeGreaterThan(0);

    for (const incident of board.incidents) {
      const direct = resolveIncidentPresentation(
        presentationSubjectFromIncident({
          errorCode: incident.errorCode,
          actionName: incident.actionName,
          featureId: incident.featureId,
          route: incident.route,
          sport: incident.sport,
          title: incident.title,
          description: incident.description,
          klass: incident.klass,
        }),
      );
      expect(board.presentations[incident.id]).toEqual(direct);
    }
  });

  it('a known 42501 + generateRoundRecap.persist incident resolves to the CoachHelm recap title on the board itself', async () => {
    const board = await fetchIncidentBoard({ windowHours: 24 });
    const incident = board.incidents.find((i) => i.errorCode === '42501');
    expect(incident, 'fixture incident should be present').toBeDefined();
    const presentation = board.presentations[incident!.id];
    expect(presentation?.title).toBe('CoachHelm recap could not be saved');
    expect(presentation?.resolvedBy).toBe('code');
  });
});
