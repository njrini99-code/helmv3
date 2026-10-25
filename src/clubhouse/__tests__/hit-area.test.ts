import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** Row 38 (AX-11): a phone control drawn under 44pt takes a 44pt tap through an invisible ::before, without growing. */
const ui = readFileSync(join(ROOT, 'styles/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const coarse = ui.slice(ui.lastIndexOf('@media (pointer: coarse) {'));
const SHORT = ['.ch-toast__action', '.ch-toast__close', '.ch-asks__open', '.ch-ask-cmp__send', '.ch-rv-back'];

describe('44pt hit areas on touch (row 38)', () => {
  it.each(SHORT)('%s grows its tap target, not its look', (sel) => {
    expect(coarse).toContain(`${sel}::before`);
    expect(coarse).toMatch(/content: '';\s*position: absolute;[\s\S]*?height: max\(100%, 44px\);/);
    expect(coarse).toMatch(new RegExp(`${sel.replace(/[.-]/g, '\\$&')}[,\\s][^{}]*\\{\\s*position: relative;`));
  });
  it('the toast close shows on touch as well as with a mouse', () => {
    expect(ui).toMatch(/@media \(hover: hover\), \(pointer: coarse\) \{\s*\.ch-toast__close \{\s*display: inline-flex;/);
  });
});
