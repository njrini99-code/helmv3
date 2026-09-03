import { describe, it, expect } from 'vitest';
import { correlateTraceToIncident, correlateTracesToIncidents } from '../trace-incident-link';
import type { UnifiedIncident, IncidentSourceEvidence } from '@/lib/admin/incidents/types';

function sourceEvidence(overrides: Partial<IncidentSourceEvidence> = {}): IncidentSourceEvidence {
  return {
    source: 'supabase',
    health: 'reading',
    reason: null,
    occurrences: 3,
    firstSeen: '2026-09-03T00:00:00.000Z',
    lastSeen: '2026-09-03T00:05:00.000Z',
    ref: null,
    permalink: null,
    summary: 'Supabase saw this fault.',
    ...overrides,
  } as IncidentSourceEvidence;
}

function incident(overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return {
    id: 'inc-1',
    linkTarget: '/admin/errors/inc-1',
    title: 'Round autosave blocked by database permissions',
    severity: 'high',
    sources: [sourceEvidence()],
    ...overrides,
  } as UnifiedIncident;
}

describe('correlateTraceToIncident', () => {
  it('links a trace to the incident whose source evidence ref matches the round id', () => {
    const inc = incident({ sources: [sourceEvidence({ ref: 'round-abc' })] });
    const link = correlateTraceToIncident({ round_id: 'round-abc' }, [inc]);
    expect(link).toEqual({
      incidentId: 'inc-1',
      title: 'Round autosave blocked by database permissions',
      href: '/admin/errors/inc-1',
      severity: 'high',
    });
  });

  it('never links a trace with no round id, even if an incident superficially matches', () => {
    const inc = incident({ sources: [sourceEvidence({ ref: null })] });
    const link = correlateTraceToIncident({ round_id: null }, [inc]);
    expect(link).toBeNull();
  });

  it('never links when no incident source ref matches the round id — no guessing from proximity alone', () => {
    const inc = incident({ sources: [sourceEvidence({ ref: 'round-other' })] });
    const link = correlateTraceToIncident({ round_id: 'round-abc' }, [inc]);
    expect(link).toBeNull();
  });

  it('picks the human title, never a technical signature or fingerprint', () => {
    const inc = incident({
      title: 'Round autosave blocked by database permissions',
      sources: [sourceEvidence({ ref: 'round-abc' })],
    });
    const link = correlateTraceToIncident({ round_id: 'round-abc' }, [inc]);
    expect(link!.title).not.toMatch(/^[A-Z0-9]+$/); // not a bare error code
    expect(link!.title).toBe('Round autosave blocked by database permissions');
  });

  it('carries a null linkTarget through honestly rather than fabricating a route', () => {
    const inc = incident({ linkTarget: null, sources: [sourceEvidence({ ref: 'round-abc' })] });
    const link = correlateTraceToIncident({ round_id: 'round-abc' }, [inc]);
    expect(link!.href).toBeNull();
  });
});

describe('correlateTracesToIncidents', () => {
  it('returns one entry per trace, keyed by trace_id, including unlinked ones', () => {
    const inc = incident({ sources: [sourceEvidence({ ref: 'round-abc' })] });
    const links = correlateTracesToIncidents(
      [
        { trace_id: 't1', round_id: 'round-abc' },
        { trace_id: 't2', round_id: 'round-xyz' },
      ],
      [inc],
    );
    expect(Object.keys(links)).toEqual(['t1', 't2']);
    expect(links.t1!.incidentId).toBe('inc-1');
    expect(links.t2).toBeNull();
  });
});
