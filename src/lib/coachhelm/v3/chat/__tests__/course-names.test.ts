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
});
