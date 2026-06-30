import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

/**
 * #382 — seeded production smoke contract for Rini/demo stats surfaces.
 * Asserts the demo seed + stats read model wiring exist without hitting prod.
 */
describe('Baseball demo stats smoke contract (#382)', () => {
  it('rini demo seed writes games and stats-facing tables', () => {
    const seed = read('scripts/seed-rini-baseball-demo.ts');
    expect(seed).toContain("upsert('baseball_games'");
    expect(seed).toContain("upsert('baseball_coach_insights'");
    expect(seed).toContain('recruiting_activated: false');
  });

  it('stats center page consumes canonical read model', () => {
    const page = read('src/app/baseball/(dashboard)/dashboard/stats-center/page.tsx');
    expect(page).toContain('getStatsCenter');
    expect(page).toContain('getActiveBaseballContext');
  });

  it('phase-1 e2e spec supports seeded auth gate (#372)', () => {
    const spec = read('e2e/baseball-phase1.spec.ts');
    expect(spec).toContain('PLAYWRIGHT_BASEBALL_SEEDED');
    expect(spec).toContain('PROTECTED_ROUTES');
  });
});
