import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { ratchet, slack, type Hit } from '../../__tests__/_scan';

/**
 * One toggle (Nick, 15 Nov 2026; audit SYS-10, spec S4.5, Batch 5 item 1): the Practice style, a recessed linen well and a
 * raised green chip with ivory words, for a mode, a filter, a sort or a form choice alike. The 11 Nov light `filter`
 * weight is gone. Page stylesheets may size the control to their layout, never draw its look, and the selected states
 * other controls still paint outside it can only fall, file by file, as each moves onto `Segmented`.
 */
const STYLES = join(__dirname, '../../styles');
const sheets = readdirSync(STYLES).filter((f) => f.endsWith('.css'));
const parse = (f: string) => postcss.parse(readFileSync(join(STYLES, f), 'utf8'));
const segmented = readFileSync(join(__dirname, '../Segmented.tsx'), 'utf8');

/** A selected state painted outside the segmented control: a rule for an on, active, selected or current item that sets a
 * fill or a shadow. Counted where it stands today (15 Nov 2026); move a control onto Segmented and lower its file. */
const SELECTED_PAINTS: Record<string, number> = {
  'styles/calendar.css': 3,
  'styles/classes.css': 5,
  'styles/coachhelm-ask-v2.css': 2,
  'styles/coachhelm-ask.css': 1,
  'styles/coachhelm-dive.css': 4,
  'styles/coachhelm-file.css': 2,
  'styles/coachhelm-plan.css': 1,
  'styles/coachhelm-team.css': 1,
  'styles/coachhelm-thread.css': 4,
  'styles/coachhelm-views.css': 2,
  'styles/coachhelm.css': 1,
  'styles/home.css': 2,
  'styles/hub.css': 12,
  'styles/live.css': 1,
  'styles/messages-details.css': 3,
  'styles/messages-overlays.css': 1,
  'styles/messages.css': 5,
  'styles/onboard.css': 3,
  'styles/practice.css': 5,
  'styles/qualifiers.css': 7,
  'styles/quick-chat.css': 3,
  'styles/recruiting.css': 8,
  'styles/roster.css': 8,
  'styles/rounds-setup.css': 12,
  'styles/rounds-track.css': 17,
  'styles/rounds.css': 1,
  'styles/settings.css': 6,
  'styles/shell.css': 10,
  'styles/stats.css': 4,
  'styles/tournaments-compare.css': 3,
  'styles/tournaments-desk.css': 1,
  'styles/tournaments-live.css': 1,
  'styles/ui.css': 5,
};
/** Page rules that draw the segmented control's look. Practice's desk head sits on the green band, so its labels take the
 * band's ivory ink; nothing else may. */
const SEGMENT_LOOK: Record<string, number> = {
  'styles/coachhelm-team.css': 1,
  'styles/practice.css': 3,
};

const SELECTED = /\.is-(on|active|selected|current)\b|\[aria-(pressed|selected|checked)=['"]?true|\[aria-current/;

describe('one toggle', () => {
  it('has one weight: no filter class in any stylesheet and no weight on Segmented', () => {
    for (const f of sheets) expect(readFileSync(join(STYLES, f), 'utf8'), f).not.toContain('ch-seg--filter');
    expect(segmented).not.toMatch(/weight\??:|weight =|ch-seg--filter/);
  });

  it('draws its well and chip in controls.css only', () => {
    const found: Hit[] = [];
    for (const f of sheets.filter((x) => x !== 'controls.css')) {
      parse(f).walkRules(/\.ch-seg(__b|__pill|\b)/, (r) => {
        let look = false;
        r.walkDecls(/^(background(-color|-image)?|box-shadow|color|text-shadow|font-weight|--ch-seg-on-[\w-]+|--ch-well-(bg|shadow))$/, () => {
          look = true;
        });
        if (look) found.push({ file: `styles/${f}`, line: r.source?.start?.line ?? 0, text: r.selector });
      });
    }
    const { over, stale } = ratchet(found, SEGMENT_LOOK);
    expect(over, 'a page draws the toggle its own way: use Segmented as it is').toEqual([]);
    expect(stale).toEqual([]);
    expect(slack(found, SEGMENT_LOOK)).toEqual([]);
  });

  it('no new selected state is painted outside it, file by file', () => {
    const found: Hit[] = [];
    for (const f of sheets.filter((x) => x !== 'controls.css')) {
      parse(f).walkRules((r) => {
        if (!SELECTED.test(r.selector)) return;
        let paints = false;
        r.walkDecls(/^(background(-color|-image)?|box-shadow)$/, () => {
          paints = true;
        });
        if (paints) found.push({ file: `styles/${f}`, line: r.source?.start?.line ?? 0, text: r.selector });
      });
    }
    const { over, stale } = ratchet(found, SELECTED_PAINTS);
    expect(over, 'a new selected state outside Segmented: use the one toggle').toEqual([]);
    expect(stale).toEqual([]);
    expect(slack(found, SELECTED_PAINTS)).toEqual([]);
  });
});
