import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression test for the accessible-name derivation inside
 * `scripts/ui-audit-golf.mjs`'s PROBE.
 *
 * WHY THIS EXISTS. The audit's name check originally used `el.innerText`, which
 * is LAYOUT-dependent: it returns '' for content that is present and correctly
 * labelled but not currently rendered. On 2026-08-15 that reported 18
 * correctly-named buttons on /my-game-profile as screen-reader dead ends,
 * purely because they sat inside a collapsed <details>. Meanwhile a REAL dead
 * end on /documents — a button whose only label is `hidden sm:inline`, i.e.
 * `display:none` at mobile and therefore genuinely absent from the
 * accessibility tree — was one row lost in that noise.
 *
 * The fix has to thread a needle, and BOTH failure directions are easy:
 *   - too permissive (e.g. plain `textContent`) silently loses the /documents
 *     bug, which is the one that actually harms a user;
 *   - too strict (back to `innerText`) resurrects the phantom 18 and the report
 *     becomes noise people learn to skip.
 *
 * So the three fixtures below are not illustrative — they are the two failure
 * modes plus the aria-label path, and a change that breaks either direction
 * fails here rather than in a production audit weeks later.
 *
 * The function under test is EXTRACTED FROM THE SCRIPT rather than copied, so
 * this cannot pass against a stale duplicate of the logic.
 */

const SCRIPT = join(process.cwd(), 'scripts/ui-audit-golf.mjs');

/** Pull `visibleText` + `named` out of PROBE and materialise them. */
function loadNamed() {
  const src = readFileSync(SCRIPT, 'utf8');
  const start = src.indexOf('const visibleText = (node) => {');
  const end = src.indexOf("document.querySelectorAll('button, a[href]", start);
  if (start < 0 || end < 0) {
    throw new Error(
      'could not extract visibleText/named from ui-audit-golf.mjs — the PROBE ' +
      'internals were renamed or restructured. Update this test to match, and ' +
      're-verify both fixtures against a real browser before trusting it.',
    );
  }
  const snippet = src.slice(start, end);
   
  return new Function(`${snippet}\n return named;`)();
}

let named;
beforeAll(() => { named = loadNamed(); });

function mount(html) {
  document.body.innerHTML = html;
  return document.querySelector('[data-t]');
}

describe('ui-audit PROBE — accessible-name derivation', () => {
  it('extracts the function from the script (guards against silent drift)', () => {
    expect(typeof named).toBe('function');
  });

  it('NAMES a button whose label is present but unrendered (collapsed <details>)', () => {
    // The phantom 18. In Chrome a closed <details> leaves descendants with
    // normal computed `display`, so the label is part of the accessible name
    // even though `innerText` returns ''. Reported as unnamed => regression.
    const el = mount(`
      <details>
        <summary>Signals</summary>
        <button data-t><span>Make focus area</span></button>
      </details>`);
    expect(named(el)).toBe('Make focus area');
  });

  it('does NOT name a button whose only label is display:none (the /documents bug)', () => {
    // `hidden sm:inline` at 390px. display:none content is excluded from the
    // accessible name, so this button really is a bare icon to a screen reader.
    // If this ever returns a name, the check has gone blind to a real defect.
    const el = mount(`
      <button data-t>
        <svg aria-hidden="true"></svg>
        <span style="display:none">New folder</span>
      </button>`);
    expect(named(el)).toBe('');
  });

  it('NAMES a button with aria-label and no text', () => {
    const el = mount(`<button data-t aria-label="Close"><svg aria-hidden="true"></svg></button>`);
    expect(named(el)).toBe('Close');
  });

  it('still counts a visually-hidden (sr-only) label as a name', () => {
    // The canonical way to label an icon button. sr-only clips to a 1px box but
    // does NOT set display:none, so the text must still count — otherwise the
    // fix would start filing correctly-labelled icon buttons.
    const el = mount(`
      <button data-t>
        <svg aria-hidden="true"></svg>
        <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Save</span>
      </button>`);
    expect(named(el)).toBe('Save');
  });

  it('ignores text inside an aria-hidden subtree', () => {
    const el = mount(`<button data-t><span aria-hidden="true">decorative</span></button>`);
    expect(named(el)).toBe('');
  });
});
