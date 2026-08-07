import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Signup must not replace a precise, fixable password error with a wrong one.
 *
 * Two defects, both live in production until 2026-08-07, both on the very first
 * step of signup — and neither had any test coverage, which is why they lasted.
 *
 * 1. The client error-prettifier matched a bare `includes('password')`, which
 *    captured the SERVER's own already-user-ready messages and replaced them
 *    with "use at least 8 characters". The form enforces length >= 8 before it
 *    submits, so that advice is provably false by the time it renders. Measured:
 *    16 signup-blocking events in three days, every one mis-remediated. Adding
 *    characters never fixes a missing symbol, and nothing fixes a breached
 *    password.
 *
 * 2. The strength meter accepted ANY non-alphanumeric as a special character
 *    while the server accepts only a specific ASCII set. `Golfteam2026~` showed
 *    5/5 green and "Strong", then was rejected for having no special character —
 *    a dead end with no recoverable signal on the page.
 *
 * Source-text assertions on purpose: these are the two regexes/branches whose
 * DISAGREEMENT is the bug, so the test has to compare the two sources rather
 * than exercise either one alone.
 */

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const SERVER_SPECIAL_CHAR = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

describe('signup password errors stay honest', () => {
  it('neither signup form swallows a specific server password message', () => {
    for (const form of [
      'src/components/auth/golf-sign-up-form.tsx',
      'src/components/auth/baseball-sign-up-form.tsx',
    ]) {
      const src = read(form);
      // The exact branch that caused the unwinnable loop. `weak password` (the
      // raw GoTrue string) is fine to translate; a bare `password` is not.
      expect(
        src.includes("lower.includes('password')"),
        `${form} must not match a bare 'password' substring — that captures the ` +
          `server's own precise messages and rewrites them into wrong advice`,
      ).toBe(false);
    }
  });

  it('the strength meter uses the SERVER definition of a special character', () => {
    const indicator = read('src/components/auth/password-strength-indicator.tsx');
    const validation = read('src/lib/auth/password-validation.ts');

    // Pull the literal out of each file and require they agree.
    const serverMatch = validation.match(/hasSpecialChar:\s*(\/\[.+?\]\/)\.test/);
    expect(serverMatch, 'could not locate the server special-char regex').toBeTruthy();

    const indicatorMatch = indicator.match(
      /Contains special character',\s*met:\s*(\/\[.+?\]\/)\.test/,
    );
    expect(indicatorMatch, 'could not locate the indicator special-char regex').toBeTruthy();

    expect(
      indicatorMatch![1],
      'the meter and the server must agree on what a special character is — ' +
        'a wider meter shows "Strong" for a password the server then rejects',
    ).toBe(serverMatch![1]);
  });

  it('reproduces the dead end the old meter allowed', () => {
    // Non-vacuity: prove the OLD rule and the server genuinely disagree, so the
    // test above is pinning a real difference and not a tautology.
    const oldMeterRule = /[^A-Za-z0-9]/;
    const deadEnd = 'Golfteam2026~';

    expect(oldMeterRule.test(deadEnd)).toBe(true);      // meter said "Strong"
    expect(SERVER_SPECIAL_CHAR.test(deadEnd)).toBe(false); // server rejected it

    // And a password with a real special character satisfies both.
    expect(oldMeterRule.test('Golfteam2026!')).toBe(true);
    expect(SERVER_SPECIAL_CHAR.test('Golfteam2026!')).toBe(true);
  });
});
