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
