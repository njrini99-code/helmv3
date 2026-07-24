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
  it('never runs the write-heavy intelligence engine during a page read', () => {
    const body = functionBody('getPlayerCoachHelmDashboardImpl');

    expect(body).not.toContain('coachHelmIntelligence.analyzePlayer');
    expect(body).toContain("from('golf_patterns_v2')");
    expect(body).toContain("from('golf_predictions')");
    expect(body).toContain('loadEvidenceBackedInsights');
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
