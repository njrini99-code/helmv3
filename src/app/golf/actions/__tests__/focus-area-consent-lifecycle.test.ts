import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Consent-lifecycle contract for coach-prescribed focus areas.
 *
 * Every coach-initiated create path (createFocusArea, createFocusAreaFromReview,
 * createFocusAreaFromInsightV2) inserts status='proposed' / started_at=null so
 * the player must accept before the window starts. The legacy
 * createFocusAreaFromInsightImpl — the path actually behind the Triage Desk
 * "Prescribe focus area" button, InsightsFeed's coach action row, and the
 * fingerprint coach-mode action — is coach-only and shipped for months with a
 * hardcoded status:'active', silently skipping the acceptance step. This
 * source-contract test pins the fix so the legacy path can never regress.
 */

const developmentSource = readFileSync(
  join(process.cwd(), 'src/app/golf/actions/development.ts'),
  'utf8',
);

function legacyInsightImplBody(): string {
  const start = developmentSource.indexOf('async function createFocusAreaFromInsightImpl');
  expect(start, 'createFocusAreaFromInsightImpl should exist').toBeGreaterThanOrEqual(0);
  const end = developmentSource.indexOf('\nconst observedCreateFocusAreaFromInsight', start);
  expect(end, 'createFocusAreaFromInsightImpl should have an observed wrapper').toBeGreaterThan(
    start,
  );
  return developmentSource.slice(start, end);
}

describe('coach focus-area prescription consent lifecycle', () => {
  it('keeps legacy insight prescriptions pending until the player accepts them', () => {
    const body = legacyInsightImplBody();

    expect(body).toContain("status: 'proposed'");
    expect(body).toContain('started_at: null');
    expect(body).not.toContain("status: 'active'");
  });
});
