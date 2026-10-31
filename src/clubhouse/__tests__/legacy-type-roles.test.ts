import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * Type leftovers (S1 item 5): the legacy ratio roles move onto the step roles, pixel-identical at the default size.
 * Caption, label and label-s were the same size and weight on both breakpoints, so they moved: the step role plus the
 * old leading as a token (--ch-lead-caption 1.4, --ch-lead-label 1.3). WebKit at 390 and 1440 on every preview screen
 * gave the same computed font, size, weight, leading and tracking for every matched element before and after. The rest
 * change size on the phone (body, body-s, body-l, title), have no step (mono, figure-l) or would gain a step's tracking
 * (serif, display), so they stay, counted per file; they only fall.
 */
const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
const LEGACY = /font:\s*var\(--ch-type-(?:serif-[lms]|display-[ls]|title|body-l|body|body-s|label|label-s|caption|figure-l|mono)\)/;

describe('legacy type roles (S1 item 5)', () => {
  it('caption, label and label-s are gone from the rules', () => {
    expect(hits(/font:\s*var\(--ch-type-(?:caption|label|label-s)\)/, css)).toEqual([]);
  });
  it('the legacy leadings are tokens equal to the old roles', () => {
    const t = hits(/--ch-lead-(?:caption|label):/, [join(ROOT, 'styles/tokens.css')]).map((h) => h.text);
    expect(t).toEqual(['--ch-lead-caption: 1.4;', '--ch-lead-label: 1.3;']);
  });
  it('the other legacy roles only fall, file by file', () => {
    const found = hits(LEGACY, css);
    expect(ratchet(found, LEGACY_ROLE)).toEqual({ over: [], stale: [] });
    expect(slack(found, LEGACY_ROLE)).toEqual([]);
  });
});

/** Rules on a legacy ratio role per stylesheet on 2026-10-24, after caption and the labels moved. Only falls. */
const LEGACY_ROLE: Record<string, number> = {
  'styles/auth.css': 3,
  'styles/base.css': 2,
  'styles/calendar.css': 12,
  'styles/classes.css': 2,
  'styles/coachhelm-dive.css': 1,
  'styles/coachhelm-patterns.css': 1,
  'styles/coachhelm-standing.css': 1,
  'styles/coachhelm.css': 1,
  'styles/command.css': 3,
  'styles/component-playground.css': 3,
  'styles/controls.css': 5,
  'styles/home.css': 8,
  'styles/hub.css': 2,
  'styles/messages.css': 7,
  'styles/qualifiers.css': 7,
  'styles/roster.css': 7,
  'styles/rounds-setup.css': 3,
  'styles/rounds.css': 5,
  'styles/shell.css': 6,
  'styles/stats.css': 20,
  'styles/ui.css': 11,
};
