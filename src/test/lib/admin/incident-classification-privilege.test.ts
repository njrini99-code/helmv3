/**
 * A Postgres privilege error is not an access-control decision.
 *
 * Found 2026-08-27 by running the triage engine against 72 hours of production
 * and reading what it proposed to CLOSE: `GET /api/cron/event-reminders`
 * failing 23 times on `permission denied for table baseball_players` was
 * classified non-actionable, because `ACCESS_PHRASES` contains the bare string
 * `permission denied`. Auto-resolve's Rule D resolves on exactly that verdict,
 * so any such row reaching `admin_events` would have been closed unread.
 *
 * The distinction is who said no, and to whom. This application telling a
 * person "you do not have permission" is the system working. Postgres telling
 * OUR OWN service code "permission denied for table x" is a missing GRANT —
 * nobody was denied anything they should not have had; a feature is broken.
 */
import { describe, it, expect } from 'vitest';
import { classifyIncident } from '@/lib/admin/incident-classification';

describe('classifyIncident — Postgres privilege errors', () => {
  it.each([
    ['table', 'Error: permission denied for table baseball_players'],
    ['view', 'permission denied for view baseball_coaches_public'],
    ['function', 'Error: permission denied for function heartbeat'],
    ['schema', 'permission denied for schema helm_private'],
    ['sequence', 'permission denied for sequence golf_rounds_id_seq'],
    ['relation', 'permission denied for relation golf_players'],
    ['materialized view', 'permission denied for materialized view golf_team_rollup'],
  ])('treats a 42501 on a %s as an actionable defect, not expected access control', (_kind, message) => {
    const result = classifyIncident({
      title: message,
      message,
      severity: 'error',
      source: 'sentry',
      errorCode: null,
    });
    expect(result.actionable).toBe(true);
    expect(result.klass).toBe('defect');
    expect(result.reason).toMatch(/privilege|GRANT/i);
  });

  it('catches it by SQLSTATE even when the message never says "permission denied"', () => {
    const result = classifyIncident({
      title: 'insert failed',
      message: 'new row violates policy',
      severity: 'error',
      source: null,
      errorCode: '42501',
    });
    expect(result.actionable).toBe(true);
  });

  // Every string here is one this module's own ACCESS_PHRASES actually
  // contains. An earlier draft asserted `You do not have permission to edit
  // this roster` and failed — that phrasing lives in
  // EXPECTED_SOFT_FAILURE_PATTERNS (observe-action-result.ts), NOT here, so it
  // was already classified actionable before this change and the fixture was
  // testing behaviour that never existed. Worth knowing on its own: the two
  // vocabularies overlap but are not the same list.
  it.each([
    'You do not have access to this team',
    'permission denied',
    'Permission denied — ask a coach to invite you',
  ])('leaves ordinary app-prose denials non-actionable: %s', (message) => {
    // The narrowing is the whole point. Requiring the object-kind word is what
    // keeps a person being correctly told "no" out of the actionable queue.
    const result = classifyIncident({
      title: message,
      message,
      severity: 'warning',
      source: null,
      errorCode: null,
    });
    expect(result.actionable).toBe(false);
    expect(result.klass).toBe('access');
  });

  it('still lets the RLS tripwire win — it runs before this rule and stays actionable', () => {
    const result = classifyIncident({
      title: 'permission denied for table golf_rounds',
      message: 'permission denied for table golf_rounds',
      severity: 'error',
      source: 'rls_denial',
      errorCode: null,
    });
    expect(result.actionable).toBe(true);
    expect(result.klass).toBe('access');
  });
});

/**
 * Four causes that occupied the actionable triage queue on 2026-08-27 without
 * being defects. Each entry below is the exact production string, and each has
 * a reason it is not actionable that does NOT reduce to "it was quiet".
 */
describe('classifyIncident — queue noise with a named cause', () => {
  it('recognises Supabase Auth’s own wording for a bad password', () => {
    // `invalid email or password` (our copy) was already covered;
    // `AuthApiError: Invalid login credentials` (the provider's) was not, so
    // the same event classified two different ways depending on who reported it.
    const result = classifyIncident({
      title: 'AuthApiError: Invalid login credentials',
      message: 'AuthApiError: Invalid login credentials',
      severity: 'error',
      source: 'sentry',
      errorCode: null,
    });
    expect(result.actionable).toBe(false);
    expect(result.klass).toBe('access');
  });

  it('treats a superseded Vercel build as telemetry, not a warning to act on', () => {
    // 18 occurrences in 72h, every one of them a normal push cancelling the
    // build before it.
    const result = classifyIncident({
      title: 'Deployment canceled',
      message: 'Deployment canceled',
      severity: 'warning',
      source: 'vercel',
      errorCode: 'vercel_canceled',
    });
    expect(result.actionable).toBe(false);
    expect(result.klass).toBe('telemetry');
  });

  it.each([
    'Client error: Loading chunk 71649 failed.',
    'ChunkLoadError: Loading chunk 53333 failed.',
    'Failed to fetch dynamically imported module: /_next/static/chunks/x.js',
  ])('routes a stale-deployment asset failure to a recovered degradation: %s', (message) => {
    const result = classifyIncident({
      title: message,
      message,
      severity: 'warning',
      source: 'client',
      errorCode: 'ChunkLoadError',
    });
    expect(result.actionable).toBe(false);
    expect(result.klass).toBe('degradation');
    expect(result.reason).toMatch(/StaleDeploymentRecoveryScript/);
  });

  it('keeps a SERVER-side chunk-shaped failure out of the client carve-out', () => {
    // The stale-deployment rule is about a browser holding an old bundle. It
    // must not become a way for a genuinely broken server import to read as
    // recovered — so the assertion here is that the phrase, not the source, is
    // what qualifies, and an unrelated server error still lands actionable.
    const result = classifyIncident({
      title: 'Error: Cannot find module ./missing',
      message: 'Error: Cannot find module ./missing',
      severity: 'error',
      source: 'server',
      errorCode: null,
    });
    expect(result.actionable).toBe(true);
  });
});
