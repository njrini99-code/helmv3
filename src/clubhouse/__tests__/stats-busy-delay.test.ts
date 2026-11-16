import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A11, then MOTION-AND-VISUAL 3.9: changing the Stats window dims the page only after the busy delay (150 ms), holds the dim
 * at least the busy hold (300 ms) once it shows, and lifts it over the quick beat. The wait and the hold are useBusy's
 * (lib/use-busy.ts, pinned by its own tests with fake timers); the stylesheet dims on its phase (`data-ch-busy`), so no rule
 * adds a second wait on top. `aria-busy` stays the request itself, from the tap, for assistive tech.
 */

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};
const source = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse/screens/stats', file), 'utf8');

describe('the Stats busy dim waits a beat and holds (A11, 3.9)', () => {
  it('desktop and phone dim on the useBusy phase, never on the request itself', () => {
    expect(rule(".ch-st[data-ch-busy='skeleton']")).toMatch(/opacity: 0\.6;/);
    expect(rule(".ch-st.is-phone[data-ch-busy='skeleton'] .ch-stm > :not(.ch-stm-head):not(.ch-spm-head):not(.ch-stm-controls)")).toMatch(/opacity: 0\.55;/);
    expect(css).not.toMatch(/\.ch-st(?:\.is-phone)?\[aria-busy='true'\](?: \.ch-stm[^{]*)? \{\s*opacity/);
  });

  it('no rule waits again: the busy rules and the base rules carry no delay, so the page clears over the quick beat', () => {
    for (const selector of [".ch-st[data-ch-busy='skeleton']", ".ch-st.is-phone[data-ch-busy='skeleton'] .ch-stm > :not(.ch-stm-head):not(.ch-spm-head):not(.ch-stm-controls)", '.ch-st', '.ch-st.is-phone .ch-stm > *']) {
      expect(rule(selector), selector).not.toMatch(/transition-delay/);
    }
  });

  it('the team page and a player\'s pass their window change through useBusy', () => {
    for (const file of ['StatsTeamIslands.tsx', 'StatsPlayer.tsx']) {
      const src = source(file);
      expect(src, file).toContain("const busy = useBusy(pending) === 'skeleton' ? 'skeleton' : undefined;");
      expect(src, file).toMatch(/aria-busy=\{pending\} data-ch-busy=\{busy\}/);
    }
  });
});
