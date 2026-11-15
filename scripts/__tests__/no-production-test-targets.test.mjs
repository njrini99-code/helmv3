// No runnable browser test or CI job may aim at the production site (15 Nov 2026 UI tooling audit). The Momentic
// qualifier suite hard-coded https://helmsportslabs.com, signed in with real passwords and created a qualifier on the live
// database; the baseball visual audit defaulted to it. Opening a signed-in page writes rows, and players include minors.
//
// What counts as runnable: Momentic tests, modules and configs, every Playwright spec and config, and every workflow.
// Quarantined files (`*.quarantined`, tests/golf/qualifier-hell/README.md) are not runnable. The one sanctioned production
// lane is listed below with why it is safe; adding to that list is an owner decision, not a fix for this test.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROD_URL = /(?<![@\w.-])(?:https?:)?\/\/(?:[a-z0-9-]+\.)*helmsportslabs\.com(?![a-z0-9-])/gi;
const RUNNABLE = [
  /\.test\.ya?ml$/,
  /\.module\.ya?ml$/,
  /(^|\/)momentic[^/]*\.ya?ml$/,
  /^e2e\/.*\.(ts|tsx|mjs|js)$/,
  /^playwright\/.*\.(ts|mjs|js)$/,
  /^playwright[^/]*\.config\.(ts|mjs|js)$/,
  /^\.github\/workflows\/.*\.ya?ml$/,
];
/** Files allowed to name the production site, with the reason. */
const SANCTIONED = new Map([
  // Logged-out only: five public paths, never signs in, aborts every non-GET and every beacon (see its header).
  ['.github/workflows/clubhouse-prod-public.yml', 'the logged-out production lane: GET-only, five public paths'],
]);

function tracked() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

describe('no runnable test or job aims at the production site', () => {
  it('finds the runnable files it is meant to scan', () => {
    const files = tracked().filter((f) => RUNNABLE.some((r) => r.test(f)));
    // A broken pattern would scan nothing and pass forever.
    expect(files.filter((f) => f.startsWith('e2e/')).length).toBeGreaterThan(20);
    expect(files.some((f) => f.startsWith('.github/workflows/'))).toBe(true);
    expect(files.some((f) => f === 'momentic.config.yaml')).toBe(true);
  });

  it('has no production URL outside the sanctioned lane', () => {
    const hits = [];
    for (const f of tracked()) {
      if (!RUNNABLE.some((r) => r.test(f)) || SANCTIONED.has(f)) continue;
      const text = readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/^\s*(#|\/\/|\*)/.test(line)) return; // a comment that names the site is not a target
        if (PROD_URL.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
        PROD_URL.lastIndex = 0;
      });
    }
    expect(hits, 'a runnable test or job opens the production site; point it at a local stack or staging').toEqual([]);
  });

  it('keeps the quarantined Momentic qualifier suite out of every include', () => {
    const live = tracked().filter((f) => f.startsWith('tests/golf/qualifier-hell/') && /\.(test|module)\.ya?ml$/.test(f));
    expect(live).toEqual([]);
    expect(tracked().filter((f) => f.includes('/.momentic-mcp/'))).toEqual([]);
  });
});
