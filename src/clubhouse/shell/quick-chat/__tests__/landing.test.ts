// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceLanding, endLanding, findLandedRow, getLandings, holdLanding, inComfortBand, isLandingHome, landLanding, LANDING_MARK_MS, markRow, resetLandings, rowKeys, saveLanding } from '../landing';
import { dragCloses } from '../useQcMotion';

const list = (rows: Array<[string, string]>) => {
  document.body.innerHTML = `<div id="l">${rows.map(([k, t]) => `<div data-ch-row="${k}"><b data-ch-row-tag>${t}</b></div>`).join('')}</div>`;
  return document.getElementById('l')!;
};

beforeEach(() => {
  vi.useFakeTimers();
  resetLandings();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** QUICK-CHAT.md, Moment 8: the signal between the chat and the page. */
describe('the landing signal', () => {
  it('a held write knows its home, and a tool with no home on any screen starts nothing', () => {
    const l = holdLanding({ key: 'k', tool: 'create_task', label: 'Putting ladder', heldUntil: '2026-11-10T12:00:08Z' });
    expect(l).toMatchObject({ kind: 'task', phase: 'held', place: 'Tasks' });
    expect(isLandingHome(l!, '/golf/dashboard/team-hub?tab=tasks')).toBe(true);
    expect(isLandingHome(l!, '/golf/dashboard/roster')).toBe(false);
    expect(holdLanding({ key: 'x', tool: 'not_a_tool', label: '', heldUntil: null })).toBeNull();
  });
  it('held, then saved, then landed; the record keeps the snapshot it was held with', () => {
    holdLanding({ key: 'k', tool: 'create_task', label: 'A', heldUntil: 'x', before: ['task:1'] });
    saveLanding({ key: 'k', id: '9' });
    expect(getLandings()[0]).toMatchObject({ phase: 'saved', id: '9', before: ['task:1'], heldUntil: null });
    landLanding('k');
    expect(getLandings()[0]!.phase).toBe('landed');
  });
  it('Undo and a failed write leave over the quick beat and are then gone: nothing was saved, so nothing stays', () => {
    holdLanding({ key: 'k', tool: 'create_task', label: 'A', heldUntil: 'x' });
    endLanding('k', 'undone');
    expect(getLandings()[0]!.phase).toBe('undone');
    vi.advanceTimersByTime(180);
    expect(getLandings()).toHaveLength(0);
  });
  it('a receipt opened from Ask starts at saved, with no hold', () => {
    expect(announceLanding({ key: 'a', tool: 'create_team_announcement', label: 'Bus at 6:15' })).toMatchObject({ kind: 'announcement', phase: 'saved', before: null });
  });
});

describe('finding the row', () => {
  it('by id when the receipt carries one', () => {
    const root = list([['task:1', 'A'], ['task:9', 'B']]);
    expect(findLandedRow(root, { kind: 'task', id: '9', label: 'zzz', before: null })?.textContent).toBe('B');
  });
  it('otherwise the one row of its kind that was not there when the hold began', () => {
    const root = list([['task:1', 'A'], ['task:2', 'Same title'], ['task:3', 'Same title']]);
    expect(findLandedRow(root, { kind: 'task', id: null, label: 'Same title', before: ['task:1', 'task:2'] })?.dataset.chRow).toBe('task:3');
    expect(rowKeys(root, 'task')).toEqual(['task:1', 'task:2', 'task:3']);
  });
  it('with no snapshot, the one row whose words include the title', () => {
    const root = list([['task:1', 'Range session'], ['task:2', 'Putting ladder for Eli'], ['event:2', 'Putting ladder for Eli']]);
    expect(findLandedRow(root, { kind: 'task', id: null, label: 'putting ladder for eli', before: null })?.dataset.chRow).toBe('task:2');
  });
  it('two candidates is no candidate: a wrong mark is worse than none', () => {
    const root = list([['task:1', 'Putting ladder'], ['task:2', 'Putting ladder']]);
    expect(findLandedRow(root, { kind: 'task', id: null, label: 'Putting ladder', before: null })).toBeNull();
    expect(findLandedRow(root, { kind: 'task', id: null, label: 'Putting ladder', before: [] })).toBeNull();
    expect(findLandedRow(root, { kind: 'task', id: null, label: '', before: null })).toBeNull();
  });
});

describe('bringing it into view', () => {
  const band = { top: 100, bottom: 760 };
  it('a row with any part inside the comfort band is left where it is', () => {
    expect(inComfortBand({ top: 700, bottom: 760 }, band)).toBe(true);
    expect(inComfortBand({ top: 60, bottom: 130 }, band)).toBe(true);
  });
  it('a row under the bar, under the dock or off the screen is brought in', () => {
    expect(inComfortBand({ top: 40, bottom: 110 }, band)).toBe(false);
    expect(inComfortBand({ top: 750, bottom: 810 }, band)).toBe(false);
    expect(inComfortBand({ top: 1400, bottom: 1460 }, band)).toBe(false);
  });
});

describe('the mark', () => {
  it('is the chat’s own two nodes on the row, and the row is an ordinary row again when it ends', () => {
    const row = list([['task:1', 'A']]).firstElementChild as HTMLElement;
    markRow(row, 'off');
    expect(row.querySelector('.ch-landmark')).not.toBeNull();
    expect(row.querySelector('[data-ch-row-tag] .ch-landtag')?.textContent).toBe('New');
    expect(row.hasAttribute('data-ch-landed')).toBe(true);
    vi.advanceTimersByTime(LANDING_MARK_MS);
    expect(row.querySelector('.ch-landmark, .ch-landtag')).toBeNull();
    expect(row.hasAttribute('data-ch-landed')).toBe(false);
  });
  it('a row that offers no place for the tag is tinted and not tagged', () => {
    document.body.innerHTML = '<div data-ch-row="task:1"><b>A</b></div>';
    const row = document.body.firstElementChild as HTMLElement;
    markRow(row, 'off');
    expect(row.querySelector('.ch-landtag')).toBeNull();
    expect(row.querySelector('.ch-landmark')).not.toBeNull();
  });
  it('a second landing on the same row replaces the first mark instead of stacking', () => {
    const row = list([['task:1', 'A']]).firstElementChild as HTMLElement;
    markRow(row, 'off');
    markRow(row, 'off');
    expect(row.querySelectorAll('.ch-landmark')).toHaveLength(1);
    expect(row.querySelectorAll('.ch-landtag')).toHaveLength(1);
  });
});

/** MO-1-5: a drag on the sheet's handle. */
describe('letting go of the sheet', () => {
  const closes = (dy: number, v: number) => dragCloses(dy, v, 700, 0.3, 0.5);
  it('past 30% of its height it closes, in either direction', () => {
    expect(closes(220, 0)).toBe(true);
    expect(closes(-220, 0)).toBe(true);
    expect(closes(140, 0)).toBe(false);
  });
  it('a fling in the direction of the drag closes it from anywhere; a flick back does not', () => {
    expect(closes(40, 0.8)).toBe(true);
    expect(closes(-40, -0.8)).toBe(true);
    expect(closes(40, -0.8)).toBe(false);
  });
});
