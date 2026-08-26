/**
 * Re-verification of the audited swallow in loadEvidenceBackedInsights
 * (insights.ts, ~line 3505 per the observability audit) — Helm Bridge
 * observability refit.
 *
 * `loadEvidenceBackedInsights` returns `ComposedInsight[]`, an array, so
 * `getPlayerCoachHelmDashboard`'s `withAdminObserved` wrapping cannot observe
 * a failure inside it either way (extractActionSoftFailure short-circuits on
 * Array.isArray). Its call chain (coachHelmIntelligence.analyzePlayer,
 * applyInsightVisibility, rankInsights, …) is too large to drive end-to-end
 * for a logging-only change, so this follows the same source-text-assertion
 * idiom already established in player-coachhelm-dashboard-readonly.test.ts
 * for this exact function family: assert the fix landed, and that the
 * fallback return value it wraps is UNCHANGED (`[]`, twice — once for the
 * query-error branch, once for the catch).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/app/golf/actions/insights.ts'), 'utf8');

function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}`);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  // loadEvidenceBackedInsights is a plain top-level helper, not an
  // exported/observed action — its own closing brace at column 0 ends it.
  const end = source.indexOf('\n}\n', start);
  expect(end, `${name} should have a closing brace`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('loadEvidenceBackedInsights — silent swallow now observed', () => {
  const body = functionBody('loadEvidenceBackedInsights');

  it('logs the query-error branch instead of silently returning []', () => {
    expect(body).toContain("if (error || !data) {");
    expect(body).toContain('loadEvidenceBackedInsights read failed');
    expect(body).toContain("featureArea: 'insights'");
  });

  it('logs the catch branch instead of a bare catch {}', () => {
    expect(body).not.toMatch(/catch\s*\{\s*return \[\];\s*\}/);
    expect(body).toContain('loadEvidenceBackedInsights threw');
  });

  it('preserves the exact fallback return value ([]) in both branches — observability only', () => {
    const returnEmptyArrayCount = (body.match(/return \[\];/g) ?? []).length;
    expect(returnEmptyArrayCount).toBe(2);
  });
});
