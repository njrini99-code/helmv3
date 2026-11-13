import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/hub.css'), 'utf8');
/** Every rule whose selector is exactly `.ch-hb-tabs button`, in order. */
const rules = () => [...css.matchAll(/(?:^|\n)\s*\.ch-hb-tabs button \{([^}]*)\}/g)].map((m) => m[1]!);

/**
 * Phone premium sweep (12 Nov 2026): a Hub tab with a count ("Announcements 1", "Tasks 1") drew its label 2px below the
 * tabs without one. The count is an 18px inline pill, so as inline text it made its tab's line box taller and moved the
 * label's baseline. The tab lays its label and count out as a centred row instead, so every label sits on one line.
 */
describe('Team Hub’s tabs: one baseline with or without a count', () => {
  it('a tab is a centred row', () => {
    const first = rules()[0]!;
    expect(first).toMatch(/display:\s*inline-flex;/);
    expect(first).toMatch(/align-items:\s*center;/);
  });

  it('no later rule for the tab puts it back to inline text', () => {
    for (const body of rules().slice(1)) expect(body).not.toMatch(/display:/);
  });
});
