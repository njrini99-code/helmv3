import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/app/golf/actions/insights.ts'), 'utf8');
const playerRouteSource = readFileSync(
  join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx'),
  'utf8',
);
const developmentSource = readFileSync(
  join(process.cwd(), 'src/app/golf/actions/development.ts'),
  'utf8',
);

function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}`);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  const nextSection = source.indexOf('\nconst observed', start);
  expect(nextSection, `${name} should have an observed wrapper`).toBeGreaterThan(start);
  return source.slice(start, nextSection);
}

describe('player CoachHelm dashboard read contract', () => {
  /**
   * The invariant is "a page READ must not WRITE", not "the read must not call
   * the engine". Those came apart in review: this spec originally asserted the
   * call was absent entirely, because the draft it was written against had
   * replaced `analyzePlayer` with direct table reads. `main` solved the same
   * problem the other way — it keeps the call and passes `persistPatterns:
   * false`, which disables the shot-pattern upsert into `golf_patterns_v2`
   * that raced the coachhelm-* crons and surfaced as a live Postgres deadlock
   * (40P01) failing the whole page load.
   *
   * Asserting absence would therefore fail a correct implementation while
   * saying nothing about the write. Assert the write-suppression flag instead:
   * that is the thing whose removal actually reintroduces the deadlock.
   */
  it('never persists during a page read — the flag that prevents the 40P01 deadlock', () => {
    const body = functionBody('getPlayerCoachHelmDashboardImpl');

    expect(body).toContain('coachHelmIntelligence.analyzePlayer');
    expect(body).toContain('persistPatterns: false');
  });

  it('leaves the legitimate writer — the post-round trigger — persisting', () => {
    const body = functionBody('triggerPlayerInsightsAfterRoundImpl');
    // It must NOT opt out: omitting the option defaults it to true, which is
    // what makes the post-round path the one that actually mines and stores.
    expect(body).not.toContain('persistPatterns: false');
    expect(body).not.toContain('runInsightGenerators: false');
  });

  /**
   * 2026-09-24: the same "a read must not write" rule, for the bigger write.
   * `persistPatterns: false` only stopped the golf_patterns_v2 upsert; every
   * page view still ran all 20 Tier-1 generators (raw golf_shots reads plus
   * golf_coach_insights upserts) and the composite synthesis. Two sessions
   * reloading this page saturated Postgres for ~35 minutes: statement
   * timeouts across CoachHelm, Intelligence, login and /api/health, and 166
   * stale-writer CAS backoffs from renders racing the same insights.
   */
  it('never runs the Tier-1 insight generators during a page read', () => {
    const body = functionBody('getPlayerCoachHelmDashboardImpl');
    expect(body).toContain('runInsightGenerators: false');
  });

  it('the engine honours the read-only flag for both the generators and the composite synthesis', () => {
    const orchestrator = readFileSync(
      join(process.cwd(), 'src/lib/coachhelm/v2/orchestrator.ts'),
      'utf8',
    );
    expect(orchestrator).toContain('runInsightGenerators = true');
    expect(orchestrator).toContain('}> = !runInsightGenerators ? [] : [');
    expect(orchestrator).toMatch(/const compositeSummary = !runInsightGenerators\s*\?\s*null/);
  });

  it('keeps analysis behind an explicit mutation flow', () => {
    const body = functionBody('analyzePlayerImpl');
    expect(body).toContain('coachHelmIntelligence.analyzePlayer');
  });

  it('does not recompute and persist progress as a side effect of rendering the player route', () => {
    expect(playerRouteSource).not.toContain('evaluateAndPersistGoals');
    expect(playerRouteSource).not.toContain('evaluateAndPersistFocusAreas');
  });

  it('keeps insight prescriptions pending until the player accepts them', () => {
    const start = developmentSource.indexOf('async function createFocusAreaFromInsightImpl');
    const end = developmentSource.indexOf('\nconst observedCreateFocusAreaFromInsight', start);
    const body = developmentSource.slice(start, end);

    expect(body).toContain("status: 'proposed'");
    expect(body).toContain('started_at: null');
    expect(body).not.toContain("status: 'active'");
  });
});
