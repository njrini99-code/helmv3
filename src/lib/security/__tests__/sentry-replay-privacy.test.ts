// =============================================================================
// Session Replay privacy — pinned by reading source text rather than booting
// the SDK (the same approach analytics-csp-hosts.test.ts and
// sentry-application-key.test.ts already use for next.config.mjs). This repo
// handles recruiting + roster data, so a silent narrowing of any of these
// options is a real PII leak, not a cosmetic regression.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const instrumentationClient = readFileSync(join(ROOT, 'src/instrumentation-client.ts'), 'utf8');

/** The replayIntegration({...}) call's option block, as raw text. */
function replayOptionsBlock(): string {
  const start = instrumentationClient.indexOf('Sentry.replayIntegration({');
  expect(start, 'Sentry.replayIntegration({...}) call present').toBeGreaterThan(-1);
  const end = instrumentationClient.indexOf('})', start);
  return instrumentationClient.slice(start, end);
}

describe('Session Replay privacy options', () => {
  it('masks all text', () => {
    expect(replayOptionsBlock()).toMatch(/maskAllText:\s*true/);
  });

  it('masks all input values', () => {
    expect(replayOptionsBlock()).toMatch(/maskAllInputs:\s*true/);
  });

  it('keeps blockAllMedia: false as a deliberate, documented choice', () => {
    expect(replayOptionsBlock()).toMatch(/blockAllMedia:\s*false/);
  });

  it('masks roster/recruiting containers by the shared data-sentry-mask selector', () => {
    expect(replayOptionsBlock()).toMatch(/mask:\s*\[\s*'\[data-sentry-mask\]'\s*\]/);
  });

  it('never sets networkDetailAllowUrls — Replay must never capture request/response bodies or headers', () => {
    expect(replayOptionsBlock()).not.toContain('networkDetailAllowUrls');
    expect(replayOptionsBlock()).not.toContain('networkRequestHeaders');
    expect(replayOptionsBlock()).not.toContain('networkResponseHeaders');
  });

  it('replay is gated to production only (skipped in dev — DOM-mutation recording overhead)', () => {
    expect(instrumentationClient).toContain('...(!isDev ? [Sentry.replayIntegration({');
  });
});

describe('data-sentry-mask is actually applied to identifying containers', () => {
  const playerCard = readFileSync(
    join(ROOT, 'src/components/fairway/pages/roster/FairwayPlayerCard.tsx'),
    'utf8',
  );
  const recruitCard = readFileSync(
    join(ROOT, 'src/components/fairway/pages/recruiting/FairwayRecruitCard.tsx'),
    'utf8',
  );

  it('FairwayPlayerCard (roster identity) carries data-sentry-mask', () => {
    expect(playerCard).toContain('data-sentry-mask=""');
  });

  it('FairwayRecruitCard (name + email + phone) carries data-sentry-mask', () => {
    expect(recruitCard).toContain('data-sentry-mask=""');
  });
});
