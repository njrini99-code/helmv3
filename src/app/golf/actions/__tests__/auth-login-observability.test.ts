/**
 * Deliverable 6 (Sentry max-observability, Phase C) — `loginAction` emits
 * `helm.auth.*` (metrics.ts `recordAuth`) + one `helmLog` line per attempt,
 * via the `recordLoginOutcome` helper
 * (src/lib/observability/golf-login-outcome.ts — split out of auth.ts
 * itself because that file's `'use server'` directive requires every export
 * to be an async Server Action, which a synchronous telemetry helper is
 * not).
 *
 * TWO LAYERS, DELIBERATELY:
 *
 *   1. `recordLoginOutcome` itself, unit-tested directly against mocked
 *      `recordAuth`/`helmLog` — real behavioral coverage of what the helper
 *      does with an outcome string.
 *   2. A source-content check that `loginActionImpl` actually CALLS it, with
 *      the right outcome string, at each of its branches — not full
 *      behavioral coverage of `loginActionImpl` end to end, which would mean
 *      standing up the rate limiter, account lockout, GoTrue,
 *      demo/super-admin/coach-entry resolution and several logging modules
 *      (~15 dependencies) for a check this deliverable doesn't otherwise
 *      need. This is the same "read the file and verify the wiring exists"
 *      pattern this branch already uses elsewhere (see
 *      src/lib/security/__tests__/sentry-application-key.test.ts) for cases
 *      where full behavioral testing isn't the proportionate tool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { recordAuth, helmLog } = vi.hoisted(() => ({
  recordAuth: vi.fn(),
  helmLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/observability/metrics', () => ({ recordAuth }));
vi.mock('@/lib/observability/structured-log', () => ({ helmLog }));

import { recordLoginOutcome } from '@/lib/observability/golf-login-outcome';

beforeEach(() => vi.clearAllMocks());

describe('recordLoginOutcome', () => {
  it('records helm.auth.* with action:"golf.login" and logs at info for a success outcome', () => {
    recordLoginOutcome('success');

    expect(recordAuth).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'golf.login', outcome: 'success' }),
    );
    expect(helmLog.info).toHaveBeenCalledWith(
      'golf.auth.login_finished',
      expect.objectContaining({ action: 'golf.login', result: 'success' }),
    );
    expect(helmLog.warn).not.toHaveBeenCalled();
  });

  it('logs at warn (not error) for a non-success outcome, carrying the outcome on result', () => {
    recordLoginOutcome('invalid_credentials');

    expect(recordAuth).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'invalid_credentials' }),
    );
    expect(helmLog.warn).toHaveBeenCalledWith(
      'golf.auth.login_finished',
      expect.objectContaining({ result: 'invalid_credentials' }),
    );
    expect(helmLog.error).not.toHaveBeenCalled();
  });

  it('passes an errorCode through to both recordAuth and helmLog when given one', () => {
    recordLoginOutcome('account_locked', 'LOCKED');

    expect(recordAuth).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'LOCKED' }));
    expect(helmLog.warn).toHaveBeenCalledWith(
      'golf.auth.login_finished',
      expect.objectContaining({ error_code: 'LOCKED' }),
    );
  });
});

describe('loginActionImpl wiring — recordLoginOutcome is called at every existing branch', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/golf/actions/auth.ts'), 'utf8');
  // Isolate loginActionImpl's own body so a match inside signupActionImpl
  // (which does not call this helper at all) can't produce a false pass.
  const start = src.indexOf('async function loginActionImpl(');
  const end = src.indexOf('\nconst observedLoginAction', start);
  const body = src.slice(start, end);

  it('exists and was actually isolated (guards the two indexOf calls above)', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it.each([
    'account_locked',
    'rate_limited_email',
    'rate_limited_ip',
    'invalid_credentials',
    'success',
  ])('calls recordLoginOutcome(%s) somewhere in loginActionImpl', (outcome) => {
    expect(body).toContain(`recordLoginOutcome('${outcome}')`);
  });

  it('calls recordLoginOutcome exactly once per return statement (8 branches, 2 share "account_locked")', () => {
    const calls = body.match(/recordLoginOutcome\(/g) ?? [];
    expect(calls).toHaveLength(8);
  });

  it('every recordLoginOutcome(...) call is immediately followed by a return (no dangling telemetry-only branch)', () => {
    const callSites = [...body.matchAll(/recordLoginOutcome\('[a-z_]+'\);\n\s*return/g)];
    expect(callSites).toHaveLength(8);
  });
});
