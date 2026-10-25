import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * Decision 5 (owner, 2026-10-24): the phone page edge is 16px, 20px from 414px. The top bar's leading edge and the
 * section strip read the same token as the page (`--ch-page-x-phone`), so on a large phone the bar's title, the strip's
 * first pill and the page's text stay on one line (review of #2361: the bar and strip had kept 16).
 */
const shell = readFileSync(join(ROOT, 'styles', 'shell.css'), 'utf8');

const rule = (selector: string) => {
  const at = shell.indexOf(`  ${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return shell.slice(at, shell.indexOf('}', at));
};

describe('phone bars share the page edge (decision 5)', () => {
  it("the top bar's leading padding is the page edge", () => {
    expect(rule('.ch-topbar')).toMatch(/padding: env\(safe-area-inset-top\) 8px 6px var\(--ch-page-x-phone\);/);
  });

  it('the section strip pads and snaps to the page edge', () => {
    const strip = rule('.ch-strip__row');
    expect(strip).toMatch(/padding: 2px var\(--ch-page-x-phone\) 12px;/);
    expect(strip).toMatch(/scroll-padding-inline: var\(--ch-page-x-phone\);/);
  });
});
