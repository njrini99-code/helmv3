import { describe, expect, it } from 'vitest';
import { auditNumericClaims, collectEnvelopeDates, collectEnvelopeNumbers, type ToolEnvelope } from '../provenance';

// Staging 2026-11-08 (message 6da3a6b2): a round list naming "Bryan Park Champs" read "Park" as Ethan Park, and every figure in that
// bullet and the ones after it was withheld as another player's. A first or last name inside a longer capitalised phrase is a course.

const COLE = 'p-cole';
const roster = [{ id: COLE, name: 'Cole Bennett' }, { id: 'p-ethan', name: 'Ethan Park' }, { id: 'p-owen', name: 'Owen Carter' }];
const read = {
  summary: 'x', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
  detail: { player: { name: 'Cole Bennett', player_id: COLE }, rounds: [{ date: '2026-10-06', course: 'Bryan Park Champs', total_score: 82, putts: 31, sg_approach: -7.13 }, { date: '2026-09-30', course: 'Starmount Forest', total_score: 75, putts: 30, sg_putting: 0.76 }] },
} as unknown as ToolEnvelope;
const audit = (text: string) => auditNumericClaims(text, [], [], collectEnvelopeNumbers(read), ['2026-10-06', '2026-09-30'], 'America/New_York', { players: roster }).map((c) => c.text);

describe('a name inside a course name is not the player', () => {
  const text = [
    'Cole three-putted 10 times in his last five rounds.',
    '',
    'Newest first:',
    '',
    '- **Oct 6, Bryan Park Champs (practice):** 82 (+10), 31 putts, 2 three-putts. The damage came on approach, where he lost 7.13 strokes.',
    '- **Sep 30, Starmount Forest (practice):** 75 (+4), 30 putts, 2 three-putts. This was his one round with positive putting, at +0.76.',
  ].join('\n');
  it('the round list is not withheld', () => {
    expect(audit(text)).toEqual([]);
  });
  it('a real name still binds: Park by itself, or Ethan Park in full, is Ethan', () => {
    expect(audit('Park shot 82 on Oct 6.')).toEqual(['82']);
    expect(audit('Ethan Park shot 82 on Oct 6.')).toEqual(['82']);
    expect(audit('On Tuesday Park shot 82.')).toEqual(['82']);
  });
});

// Replay 30518f0c: "Wednesday (July 30" when July 30, 2026 is a Thursday. A shifted date inside a window passed 12 of 22 times, because
// falling inside a window counted as a date the reads returned.
describe('dates and weekdays', () => {
  const dated = {
    summary: 'x', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
    detail: { rounds: [{ date: '2026-07-30', total_score: 74 }, { date: '2026-10-21', total_score: 71 }], window_start: '2026-05-18', window_end: '2026-09-26' },
  } as unknown as ToolEnvelope;
  const dates = collectEnvelopeDates(dated, 'America/New_York');
  const windows = (text: string) => auditNumericClaims(text, [dated.measurements as never].flat(), [], collectEnvelopeNumbers(dated), dates, 'America/New_York', { players: roster }).map((c) => c.text);
  it('a weekday has to be its date’s', () => {
    expect(windows('He shot 74 on Thursday, July 30.')).toEqual([]);
    expect(windows('He shot 74 on Wednesday (July 30).')).toEqual(['Wednesday (July 30']);
    expect(windows('He shot 71 on Wed, Oct 21 and Wednesday, October 21, 2026.')).toEqual([]);
    expect(windows('He shot 71 on Thu Oct 21.')).toEqual(['Thu Oct 21']);
  });
  it('a date strictly inside a read’s window is not a date the read returned; its own bounds and dates are', () => {
    expect(windows('The window runs from May 18 to September 26.')).toEqual([]);
    expect(windows('A round on July 30 and one on October 21.')).toEqual([]);
    expect(windows('A round on May 27.')).toEqual(['May 27']);
  });
  it('a read of "the next 8 days" ends 8 days after the day it was read, in the team’s zone', () => {
    const calendar = { summary: 'Nothing scheduled in the next 8 days.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T02:15:22.247Z', detail: { events: [] } } as unknown as ToolEnvelope;
    const days = collectEnvelopeDates(calendar, 'America/New_York');
    expect(days).toContain('2026-11-15');
    const run = (text: string) => auditNumericClaims(text, [], [], [], days, 'America/New_York', { players: roster }).map((c) => c.text);
    expect(run('Nothing is on the calendar through Sunday, November 15.')).toEqual([]);
    expect(run('Nothing is on the calendar through Sunday, November 22.')).toEqual(['November 22']);
  });
});

// Replays faf4fb84 (a markdown table whose header names the sources) and 9f63af20 ("I can read the last 10 or last 20 rounds").
describe('tables and windows', () => {
  const standing = {
    summary: 'Division I average, PGA Tour for 1 metric.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
    detail: { kind: 'benchmark_read', standing: { rows: [{ metric_id: 'approach_proximity_50_125ft', player_value: 23.77, comparisons: [{ kind: 'level', label: 'Division I average', value: 28, place_of: 78, place_percent: 74 }, { kind: 'tour', label: 'PGA Tour', value: 18, place_of: null, place_percent: null }] }] } },
  } as unknown as ToolEnvelope;
  const run = (text: string) => auditNumericClaims(text, [], [], collectEnvelopeNumbers(standing), [], 'America/New_York', { players: roster }).map((c) => c.text);
  it('a table row takes the sources its header names', () => {
    expect(run('| Distance band | Owen | Division I average | Tour |\n|---|---|---|---|\n| 50-125 yd | 23.77 ft | 28 ft | 18 ft |')).toEqual([]);
    expect(run('| Distance band | Owen |\n|---|---|\n| 50-125 yd | 28 ft |')).toEqual(['28']);
  });
  it('"the last 20 rounds" is a window the reads offer, not a figure; other large counts still are', () => {
    expect(run('I can read the last 10 or last 20 rounds.')).toEqual([]);
    expect(run('He played 20 rounds.')).toEqual(['20']);
    expect(run('I can read the last 19 rounds.')).toEqual(['19']);
  });
  it('a list of windows ("the last 5, 10 or 20 rounds", staging 7488e220) is windows; a 20 that is not one of them is a figure', () => {
    expect(run('I can look at the last 5, 10 or 20 rounds, the season, or the whole history.')).toEqual([]);
    expect(run('In 5, 10 or 20 rounds he scored.')).toEqual(['20']);
    expect(run('Over the last 5, 10 or 20 putts he lost strokes.')).toEqual(['20']);
  });
});

describe('a table after other text', () => {
  const standing2 = {
    summary: 'x', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
    detail: { kind: 'benchmark_read', standing: { rows: [{ metric_id: 'approach_proximity_50_125ft', player_value: 23.77, comparisons: [{ kind: 'level', label: 'Division I average', value: 28, place_of: 78, place_percent: 74 }] }] } },
  } as unknown as ToolEnvelope;
  const run2 = (text: string) => auditNumericClaims(text, [], [], collectEnvelopeNumbers(standing2), [], 'America/New_York', { players: roster }).map((c) => c.text);
  it('takes its header, not the paragraph above it', () => {
    expect(run2('Proximity is over all his rounds.\n\n| Band | Owen | Division I average |\n|---|---|---|\n| 50-125 yd | 23.77 ft | 28 ft |')).toEqual([]);
    expect(run2('The Division I average is the benchmark.\n\n| Band | Owen |\n|---|---|\n| 50-125 yd | 28 ft |')).toEqual(['28']);
  });
});
