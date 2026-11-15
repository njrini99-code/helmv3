import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Coach audit 13 Nov 2026 (§2, quick chat #3): asked from Home with ⌘J for a 60-minute plan, the card came back unstyled ("4:4020
 * min"): its sheet, coachhelm-plan.css, loaded only on the CoachHelm and Practice routes. The card brings its own sheet, so it
 * is styled wherever it is drawn.
 */
describe('the plan card brings its own styles', () => {
  it('PlanCard imports coachhelm-plan.css', () => {
    const src = readFileSync(join(import.meta.dirname, '../PlanCard.tsx'), 'utf8');
    expect(src).toMatch(/^import '\.\.\/\.\.\/\.\.\/styles\/coachhelm-plan\.css';$/m);
  });
});
