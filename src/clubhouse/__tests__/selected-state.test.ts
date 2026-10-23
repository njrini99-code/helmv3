import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ratchet, ROOT, walk, type Hit } from './_scan';

/**
 * CONS-22: the selected state is a few tokens. A rule for something chosen (pressed, selected, current, `.is-on`,
 * `.is-selected`) paints its background with --ch-selected-bg, --ch-selected-pill-bg, --ch-bg-selected or the chosen
 * segment's --ch-seg-on-bg. The files below still paint their own; their counts may only fall.
 */
const SELECTED = /\[aria-pressed='true'\]|\[aria-selected='true'\]|\.is-selected\b|\.is-on\b|\[aria-current/;
const TOKEN = /^var\(--ch-(selected-bg|selected-pill-bg|bg-selected|seg-on-bg)\)$/;

function paints(): Hit[] {
  const out: Hit[] = [];
  for (const f of walk(ROOT, /\.css$/)) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim();
      if (!SELECTED.test(sel)) continue;
      const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/.exec(m[2]!)?.[1]?.trim();
      if (!bg || TOKEN.test(bg) || /^(none|transparent|inherit)$/.test(bg)) continue;
      out.push({ file: relative(ROOT, f), line: 0, text: `${sel} { background: ${bg} }` });
    }
  }
  return out;
}

const ALLOW_SELECTED_PAINT: Record<string, number> = {
  'styles/classes.css': 2,
  'styles/coachhelm-ask.css': 1,
  'styles/coachhelm-dive.css': 3,
  'styles/coachhelm-thread.css': 2,
  'styles/coachhelm-views.css': 2,
  'styles/coachhelm.css': 9,
  'styles/controls.css': 10,
  'styles/hub.css': 7,
  'styles/messages.css': 6,
  'styles/qualifiers.css': 2,
  'styles/recruiting.css': 3,
  'styles/roster.css': 1,
  'styles/rounds-setup.css': 2,
  'styles/rounds-track.css': 5,
  'styles/settings.css': 6,
  'styles/shell.css': 8,
  'styles/stats.css': 3,
  'styles/ui.css': 3,
};

describe('one selected state (CONS-22)', () => {
  it('a chosen thing paints with the selected tokens', () => {
    const r = ratchet(paints(), ALLOW_SELECTED_PAINT);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
