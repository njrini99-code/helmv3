import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk } from './_scan';

/**
 * CONS-39: `.ch-num` is the one tabular declaration. A figure takes tabular numbers from the `.ch-num` class (base.css);
 * the ui/ primitives keep theirs where it is part of the primitive (ui.css, controls.css), and tokens.css may carry it in
 * a role. Every other stylesheet's `font-variant-numeric` lines are counted below and may only fall. Most of them sit in
 * a rule with a `font:` shorthand, which resets the numeric variant, so the local line is what keeps the figures tabular:
 * lower one by moving the rule off the shorthand (or the element onto `.ch-num` where nothing else resets it), never by
 * deleting the line alone. base.css is counted too: it holds `.ch-num` itself (and the serif's proportional figures),
 * so its floor is above 0.
 */
const OWNERS = new Set(['ui.css', 'controls.css', 'tokens.css']);
const files = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !OWNERS.has(basename(f)));

const ALLOW_LOCAL_TABULAR: Record<string, number> = {
  'styles/auth.css': 1,
  'styles/base.css': 2,
  'styles/calendar.css': 28,
  'styles/classes.css': 22,
  'styles/coachhelm-profile.css': 5,
  'styles/coachhelm-thread.css': 9,
  'styles/coachhelm.css': 4,
  'styles/home.css': 60,
  'styles/hub.css': 31,
  'styles/messages.css': 15,
  'styles/onboard.css': 8,
  'styles/qualifiers.css': 54,
  'styles/recruiting.css': 8,
  'styles/roster.css': 26,
  'styles/rounds-recover.css': 1,
  'styles/rounds-setup.css': 15,
  'styles/rounds-track.css': 35,
  'styles/rounds.css': 61,
  'styles/settings.css': 8,
  'styles/shell.css': 5,
  'styles/stats.css': 99,
};

describe('tabular numbers come from .ch-num (CONS-39)', () => {
  it('no stylesheet adds a local font-variant-numeric', () => {
    const r = ratchet(hits(/font-variant-numeric\s*:/, files), ALLOW_LOCAL_TABULAR);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
