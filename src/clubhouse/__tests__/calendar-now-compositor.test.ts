import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F-0047 (audit 2026-10-29): the Calendar now-pill and now-dot pulsed on opacity, never box-shadow (paint). Since the
 * delete list (MOTION-AND-VISUAL 3.12, owner, 15 Nov 2026) they do not pulse at all, and calendar.css keeps no keyframe
 * of its own: what fades borrows motion.css's crossfade, so nothing here can paint per frame.
 */
describe('Calendar keeps no keyframes of its own (F-0047, 3.12)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/calendar.css'), 'utf8');
  it('no @keyframes in calendar.css, so none animates box-shadow', () => {
    expect(css).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/animation:[^;]*\binfinite\b/);
  });
});
