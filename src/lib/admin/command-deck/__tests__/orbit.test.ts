import { describe, it, expect } from 'vitest';
import { buildSystemOrbit, type OrbitInput } from '../orbit';
import type { DeployFreshness } from '@/lib/admin/deploy-freshness';
import { NOW, freshnessRows, incident } from './fixtures';

function currentDeploy(): DeployFreshness {
  return { state: 'current', summary: 'up to date', red: null, ageHours: 2 };
}

function baseInput(overrides: Partial<OrbitInput> = {}): OrbitInput {
  return {
    incidents: [],
    freshness: freshnessRows(),
    deployFreshness: currentDeploy(),
    activeUsersToday: 42,
    selfHealFlowing: false,
    selfHealStalled: false,
    selfHealReadable: true,
    now: NOW,
    ...overrides,
  };
}

function nodeById(snapshot: ReturnType<typeof buildSystemOrbit>, id: string) {
  return snapshot.nodes.find((n) => n.id === id)!;
}

describe('buildSystemOrbit', () => {
  it('healthy: every source reading, deploy current -> every trackable node healthy', () => {
    const snapshot = buildSystemOrbit(baseInput());
    expect(snapshot.nodes).toHaveLength(8);
    expect(nodeById(snapshot, 'supabase').state).toBe('healthy');
    expect(nodeById(snapshot, 'next_vercel').state).toBe('healthy');
    expect(nodeById(snapshot, 'auth').state).toBe('healthy');
    // Realtime has no evidence source wired anywhere in this repo — always
    // unknown, healthy board or not. This is the fixture that pins it.
    expect(nodeById(snapshot, 'realtime').state).toBe('unknown');
    expect(nodeById(snapshot, 'realtime').evidenceComplete).toBe(false);
  });

  it('blind source: supabase blind -> supabase and postgres nodes read blind as critical, others unaffected', () => {
    const snapshot = buildSystemOrbit(baseInput({ freshness: freshnessRows({ supabase: 'blind' }) }));
    expect(nodeById(snapshot, 'supabase').state).toBe('critical');
    expect(nodeById(snapshot, 'postgres').state).toBe('critical');
    expect(nodeById(snapshot, 'supabase').evidenceComplete).toBe(false);
    expect(nodeById(snapshot, 'auth').state).toBe('healthy');
  });

  it('regression: a critical unresolved SQLSTATE incident escalates postgres past a reading source', () => {
    const withIncident = incident('pg-1', {
      severity: 'critical',
      errorCode: '42501',
      lifecycle: { state: 'regressed', headline: 'Regressed', because: [] },
    });
    const snapshot = buildSystemOrbit(baseInput({ incidents: [withIncident] }));
    expect(nodeById(snapshot, 'postgres').state).toBe('critical');
    expect(nodeById(snapshot, 'postgres').eventCount).toBe(1);
  });

  it('a resolved incident never counts toward a node — closed work is not ongoing evidence', () => {
    const resolved = incident('pg-2', {
      severity: 'critical',
      errorCode: '42501',
      lifecycle: { state: 'resolved', headline: 'Resolved', because: [] },
    });
    const snapshot = buildSystemOrbit(baseInput({ incidents: [resolved] }));
    expect(nodeById(snapshot, 'postgres').state).toBe('healthy');
    expect(nodeById(snapshot, 'postgres').eventCount).toBe(0);
  });

  it('decision waiting is out of scope for the orbit — no node encodes it (Attention Stack/Decision Inbox own that)', () => {
    // Documented as a negative assertion: the orbit snapshot type carries no
    // decision-related field at all, so there is nothing to assert wrong here
    // by construction. This test exists so a future change adding one is
    // forced to also add its own coverage rather than silently piggybacking.
    const snapshot = buildSystemOrbit(baseInput());
    expect(Object.keys(snapshot)).toEqual(['nodes', 'computedAt']);
  });

  it('all-unknown: every source unknown, deploy unknown, self-heal unreadable, users unread -> nothing reads healthy', () => {
    const snapshot = buildSystemOrbit(
      baseInput({
        freshness: freshnessRows({ app: 'unknown', sentry: 'unknown', supabase: 'unknown', vercel: 'unknown' }),
        deployFreshness: { state: 'unknown', summary: 'unknown', red: null, ageHours: null },
        activeUsersToday: null,
        selfHealReadable: false,
      }),
    );
    for (const node of snapshot.nodes) {
      expect(node.state).not.toBe('healthy');
    }
  });
});
