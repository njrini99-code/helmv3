/**
 * The overnight digest of 2026-09-02 listed three "Client error: Load failed"
 * rows as actionable degradations. They were two Shenandoah phones whose
 * message-send POST never left the device and one route boundary catching the
 * same thing — the visitor's connectivity, which rule 4 already knows how to
 * file, but only under the generic "network error" wording.
 */
import { describe, it, expect } from 'vitest';
import { classifyIncident } from '@/lib/admin/incident-classification';

describe('classifyIncident — a client fetch that never reached the server', () => {
  it('files WebKit "Load failed" from a client as connectivity, not actionable', () => {
    const c = classifyIncident({
      title: 'Client error: Load failed',
      message: 'Load failed',
      severity: 'warning',
      source: 'client',
      errorCode: 'TypeError',
    });
    expect(c.klass).toBe('integration');
    expect(c.actionable).toBe(false);
    expect(c.reason).toMatch(/never reached the server/);
  });

  it('files Chromium "Failed to fetch" from a client the same way', () => {
    const c = classifyIncident({
      title: 'Client error: Failed to fetch',
      message: 'Failed to fetch',
      severity: 'error',
      source: 'client',
      errorCode: 'TypeError',
    });
    expect(c.klass).toBe('integration');
    expect(c.actionable).toBe(false);
  });

  it('keeps a SERVER-side transport failure actionable — a Vercel function that cannot reach Supabase is ours', () => {
    const c = classifyIncident({
      title: 'TypeError: fetch failed',
      message: 'fetch failed',
      severity: 'error',
      source: 'server_action',
      errorCode: null,
    });
    expect(c.actionable).toBe(true);
  });

  it('leaves a stale-deployment chunk failure to the rule that already recovers it', () => {
    const c = classifyIncident({
      title: 'Failed to fetch dynamically imported module: /_next/static/chunks/x.js',
      message: 'Failed to fetch dynamically imported module: /_next/static/chunks/x.js',
      severity: 'warning',
      source: 'client',
      errorCode: 'ChunkLoadError',
    });
    expect(c.klass).toBe('degradation');
    expect(c.reason).toMatch(/StaleDeploymentRecoveryScript/);
  });

  it('does not let a client-reported AbortError hide behind the same rule — that timeout budget is ours', () => {
    const c = classifyIncident({
      title: 'Client error: AbortError',
      message: 'AbortError: This operation was aborted',
      severity: 'error',
      source: 'client',
      errorCode: 'AbortError',
    });
    expect(c.actionable).toBe(true);
  });
});

/**
 * The 2026-09-09 72h export ranked "The destination stream closed early."
 * (163 events) and bare "aborted" (67 events) as its two largest actionable
 * production incidents. Both are the peer hanging up mid-response. They arrive
 * with a SERVER source — Next's onRequestError hook names the RSC render or
 * route handler that was streaming — so rule 3c's `source === 'client'` guard
 * never saw them.
 */
describe('classifyIncident — the client disconnected mid-response', () => {
  it.each(['server_component', 'route_handler', 'server_action', 'request_hook'] as const)(
    'files "destination stream closed early" from source=%s as non-actionable',
    (source) => {
      const c = classifyIncident({
        title: 'The destination stream closed early.',
        message: 'The destination stream closed early.',
        severity: 'error',
        source,
      });
      expect(c.klass).toBe('integration');
      expect(c.actionable).toBe(false);
      expect(c.reason).toMatch(/disconnected mid-render/);
    },
  );

  it('files a bare "aborted" as a client disconnect', () => {
    const c = classifyIncident({
      title: 'aborted',
      message: 'aborted',
      severity: 'error',
      source: 'server_component',
    });
    expect(c.klass).toBe('integration');
    expect(c.actionable).toBe(false);
    expect(c.reason).toMatch(/client went away/);
  });

  it('keeps OUR abort budget expiring actionable — exact equality, not substring', () => {
    const c = classifyIncident({
      title: 'Round submit failed',
      message: 'The operation was aborted due to timeout',
      severity: 'error',
      source: 'server_action',
    });
    expect(c.reason).not.toMatch(/client went away/);
  });
});

/**
 * Production, 2026-10-12 02:00 UTC: the nightly roster sweep's
 * withAdminObserved wrapper filed `[triggerPlayerInsightsAfterRound] 0
 * completed rounds so far — CoachHelm speaks after 3 …` (fingerprint
 * ecb08865, errorCode `engine_below_round_floor`) at 'info'. The engine's own
 * `.belowRoundFloor` row for the same outcome matched the telemetry rule, but
 * the wrapper's copy carries only the user-facing sentence, so it fell to the
 * severity ladder (`matched: false`). Diagnose reports that as
 * "quiet-unrecognised" and never closes it, so the same coach setting doing
 * its job sat open on the board every night until the 07:30 Close cron.
 *
 * The code is the stable contract (expected-empty-states.ts); the prose is not.
 */
describe('classifyIncident — a registered empty-state code', () => {
  it('classifies the below-round-floor envelope as a recognised empty state', () => {
    const c = classifyIncident({
      title:
        "[triggerPlayerInsightsAfterRound] 0 completed rounds so far — CoachHelm speaks after 3 (the coach's minimum-rounds setting)",
      message:
        "0 completed rounds so far — CoachHelm speaks after 3 (the coach's minimum-rounds setting)",
      severity: 'info',
      source: 'server_action',
      errorCode: 'engine_below_round_floor',
    });
    expect(c.klass).toBe('empty_state');
    expect(c.actionable).toBe(false);
    expect(c.matched).toBe(true);
    expect(c.reason).toMatch(/engine_below_round_floor/);
  });

  it('does not let an empty-state code hide a real error-severity failure', () => {
    // The registry contract forbids reusing these codes for failures; if one
    // ever is, an error-severity row must stay visible.
    const c = classifyIncident({
      title: '[x] boom',
      message: 'boom',
      severity: 'error',
      source: 'server_action',
      errorCode: 'engine_below_round_floor',
    });
    expect(c.actionable).toBe(true);
  });

  it('leaves an unregistered code to the other rules', () => {
    const c = classifyIncident({
      title: '[x] something odd',
      message: 'something odd',
      severity: 'info',
      source: 'server_action',
      errorCode: 'not_a_registered_code',
    });
    expect(c.matched).toBe(false);
  });
});
