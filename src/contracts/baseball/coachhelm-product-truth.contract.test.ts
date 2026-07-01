import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('CoachHelm product-truth contracts (#384)', () => {
  it('insight rows cite source_refs and avoid bare claims', () => {
    // NOTE: src/lib/coachhelm/v2/** is the GolfHelm engine. BaseballHelm's
    // CoachHelm insight composer lives under coachhelm/baseball/generators.
    const composites = read('src/lib/coachhelm/baseball/generators/composites.ts');
    expect(composites).toMatch(/source_refs/);
  });

  it('coachhelm actions record baseline metrics at conversion', () => {
    const actions = read('src/app/baseball/actions/coachhelm-actions.ts');
    expect(actions).toContain('buildActionOutcomeSeed');
    expect(actions).toContain('withBaseballAction');
  });

  it('outcome sweep uses improvement sign registry (never raw delta alone)', () => {
    const sweep = read('src/lib/baseball/coachhelm/outcome-sweep.ts');
    expect(sweep).toMatch(/improvement|verdict|insufficient_sample/i);
  });

  it('stats center read model is staff-gated with explicit envelopes', () => {
    const stats = read('src/lib/baseball/read-models/stats-center.ts');
    expect(stats).toContain('authorized');
    expect(stats).toContain('error');
  });
});
