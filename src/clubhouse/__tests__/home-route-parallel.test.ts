import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F-0032 (audit 2026-10-29), step 1: coach Home awaited the marks hint inside the loaders' arguments, so who is on the
 * course waited for it too. The hint and the live read now start together.
 */
describe('coach Home starts its reads together (F-0032)', () => {
  it('no read waits on marksHint inside the Promise.all arguments', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/page.tsx'), 'utf8');
    expect(page).not.toMatch(/marks: await marksHint\(\)/);
    expect(page).toMatch(/marksHint\(\)\.then\(/);
  });
});
