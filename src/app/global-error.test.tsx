/**
 * global-error.tsx — the root error boundary must not double-capture.
 *
 * WHY THIS EXISTS (Phase A finding #2,
 * docs/observability/SENTRY_PHASE_A_FINDINGS.md §(b)). This component used to
 * call `console.error('Global error boundary caught:', error)` BEFORE
 * `logError(error, ...)`. `captureConsoleIntegration` captures a
 * `console.error` SYNCHRONOUSLY, at the instant it runs — before
 * `logError`'s first statement, `markBridgeLogged(error)`, had set the
 * dedup marker `instrumentation-client.ts`'s `beforeSend` checks to drop a
 * console-origin echo of an error already reported through the approved
 * pipeline. Every hit of this last-resort root boundary — precisely the
 * "Critical Error" screen a user sees when everything else has already
 * failed — minted TWO Sentry issues.
 *
 * The fix removes the explicit console.error entirely; logError already
 * console.group-logs message/stack/context in development, AFTER
 * markBridgeLogged, so it does not race the marker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: mocks.logError }));

import GlobalError from './global-error';

describe('GlobalError — no console.error racing the Bridge dedup marker', () => {
  beforeEach(() => {
    mocks.logError.mockClear();
  });

  it('does not call console.error directly — only logError, which sets the dedup marker first', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = Object.assign(new Error('boom'), { digest: 'DIGEST_1' });

    render(<GlobalError error={boom} reset={() => {}} />);

    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ component: 'GlobalErrorBoundary', action: 'render', digest: 'DIGEST_1' }),
      'critical',
    );
    // The whole point: this component itself must never call
    // console.error('Global error boundary caught:', ...) — that call used
    // to race markBridgeLogged and cause a duplicate Sentry issue via
    // captureConsoleIntegration's echo. (Rendering <html>/<body> into RTL's
    // div container also trips React's own unrelated DOM-nesting
    // console.error, which is test-harness noise, not this component's
    // output — assert on the specific removed call, not "never called".)
    expect(consoleError).not.toHaveBeenCalledWith('Global error boundary caught:', boom);
    consoleError.mockRestore();
  });

  it('still renders the critical-error fallback UI', () => {
    const boom = new Error('boom');
    render(<GlobalError error={boom} reset={() => {}} />);
    expect(screen.getByText('Critical Error')).toBeTruthy();
  });
});

describe('source guard — no console.error call literal in global-error.tsx', () => {
  it('has no console.error( call, only prose explaining why', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/global-error.tsx'), 'utf8');
    expect(source).not.toMatch(/console\.error\(/);
  });
});
