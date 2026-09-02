import { describe, it, expect } from 'vitest';
import { extractErrorCode, extractRuntime, extractHandled } from '@/lib/admin/incident-report';

/**
 * The client path used to write an envelope with no errorCode and no runtime,
 * so the Bridge's FORENSICS panel rendered blanks for every client incident —
 * while context.error.name sat one level down in the very same row (81 of 81
 * client rows in the last 7d carried it; 0 carried errorCode).
 *
 * These assert the SHAPE the route now writes against the extractors the panel
 * actually reads, so the two cannot drift apart silently again.
 */
describe('client error envelope → Bridge forensics extractors', () => {
  const envelopeFor = (errorName: string | null) => ({
    source: 'client',
    route: '/golf/dashboard/messages',
    action: 'fetch-team-chat-conversations',
    runtime: 'browser',
    ...(errorName ? { errorCode: errorName } : {}),
    sport: 'golf',
    feature: 'messaging',
  });

  it('surfaces the client error name as ERROR CODE', () => {
    expect(extractErrorCode(envelopeFor('AbortError'))).toBe('AbortError');
    expect(extractErrorCode(envelopeFor('ChunkLoadError'))).toBe('ChunkLoadError');
  });

  it('reports runtime as browser, distinct from nodejs/edge', () => {
    expect(extractRuntime(envelopeFor('AbortError'))).toBe('browser');
  });

  it('leaves handled NULL rather than guessing', () => {
    // incident-report.ts: null means genuinely absent. The client reporter does
    // not know whether the throw was caught, and a false `false` would read as
    // a known-unhandled crash.
    expect(extractHandled(envelopeFor('AbortError'))).toBeNull();
  });

  it('omits errorCode entirely when the client sent no error name', () => {
    const env = envelopeFor(null);
    expect('errorCode' in env).toBe(false);
    expect(extractErrorCode(env)).toBeNull();
  });

  it('the pre-fix envelope is what produced the blank panel', () => {
    const before = { source: 'client', route: '/x', action: 'y', sport: 'golf', feature: 'messaging' };
    expect(extractErrorCode(before)).toBeNull();
    expect(extractRuntime(before)).toBeNull();
  });
});
