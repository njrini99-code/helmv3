import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The phone route skeleton hid every child of a busy `.ch-cal` but its own. The live Calendar is aria-busy while a
 * step outside the loaded window or a Try again is on its way, so on a phone the whole page went blank until the
 * payload landed (PAGE_PERFORMANCE.md rule 4: a refresh with data keeps the data). The skeleton has its own class.
 */
const css = readFileSync(join(__dirname, '../styles/calendar.css'), 'utf8');

describe('Calendar busy styles', () => {
  it('no rule hides or reshapes the live page while it is busy; only the skeleton does', () => {
    expect(css).not.toMatch(/\.ch-cal\[aria-busy='true'\]\s*>\s*:not\(/);
    expect(css).toMatch(/\.ch-cal--skel\s*>\s*:not\(\.ch-calm-skel\)\s*\{\s*display:\s*none/);
  });

  it('the skeleton carries the class the phone rules target', () => {
    const skeleton = readFileSync(join(__dirname, '../screens/calendar/CalendarSkeleton.tsx'), 'utf8');
    expect(skeleton).toMatch(/className="ch-cal ch-cal--skel" aria-busy="true"/);
  });
});
