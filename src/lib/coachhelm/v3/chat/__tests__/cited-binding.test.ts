import { describe, expect, it } from 'vitest';
import { auditNumericClaims, collectEnvelopeNumbers, type Measurement, type ToolEnvelope } from '../provenance';

// The replay's two cited holes (ask-evals 52e45187d3): 9dc45e7d changed 46.5 to 57.8 in the text while a cite for the same subject said 46.5 and
// another said 58 (Owen's); c79c8e4e moved Owen's 72.5 to Audit Testplayer while the cite for 72.5 named Owen. A cite grounds a figure only at the
// precision the figure is written to and only beside the player it was cited for.
const COLE = '49ffe06d-9b22-4f2f-8c69-f56badbbde6b';
const OWEN = '8091da4b-dbc9-47f3-80f1-be37c96b2c91';
const AUDIT = 'b6b87c4d-0673-4166-9f8c-44e60936a034';
const roster = [{ id: COLE, name: 'Cole Bennett' }, { id: OWEN, name: 'Owen Carter' }, { id: AUDIT, name: 'Audit Testplayer' }];
const m = (id: string, metric: string, value: number | null): Measurement => ({ metric_id: metric, metric_label: metric, unit: 'strokes', value, entity: { kind: 'player', id, label: id }, window_start: null, window_end: null, sample_size: value === null ? 0 : 2, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'x', method: 'x', denominator: null, benchmark: null, direction: null }) as unknown as Measurement;
const measurements = [m(COLE, 'season_scoring_average', 77.46), m(OWEN, 'season_scoring_average', 72.5), m(AUDIT, 'season_scoring_average', null)];
const none = { summary: 'x', measurements, series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', detail: undefined } as unknown as ToolEnvelope;
const run = (text: string, citedValues: string[] = [], citedSubjects: string[] = []) => auditNumericClaims(text, measurements, [], collectEnvelopeNumbers(none), [], 'America/New_York', { players: roster, citedValues, citedSubjects }).map((c) => c.text);

describe('a cite stands for a figure at the figure’s own precision', () => {
  it('58 does not stand for 57.8; 58.0 and 58 do', () => {
    expect(run('Owen made 57.8% of them.', ['58'], ['8091da4b'])).toEqual(['57.8']);
    expect(run('Owen made 58.0% of them.', ['58'], ['8091da4b'])).toEqual([]);
    expect(run('Owen made 58% of them.', ['58'], ['8091da4b'])).toEqual([]);
  });
  it('a finer cite still stands for a rounded figure: -4.16 for -4.2', () => {
    expect(run('Owen is at -4.2 strokes.', ['-4.16'], ['8091da4b'])).toEqual([]);
  });
});

describe('a cite stands for a figure beside the player it was cited for', () => {
  it('72.5 cited for Owen grounds "Owen: 72.5", not "Audit Testplayer: 72.5"', () => {
    expect(run('Owen Carter: 72.5 over his 2 rounds.', ['72.5'], ['8091da4b'])).toEqual([]);
    expect(run('Audit Testplayer: 72.5 over his 2 rounds.', ['72.5'], ['8091da4b'])).toEqual(['72.5']);
  });
  it('a first name alone binds the same way', () => {
    expect(run('Audit: 72.5 over his 2 rounds.', ['72.5'], ['8091da4b'])).toEqual(['72.5']);
    expect(run('Owen: 72.5 over his 2 rounds.', ['72.5'], ['8091da4b'])).toEqual([]);
  });
  it('a team cite, or a sentence that names nobody, still grounds', () => {
    expect(run('Audit Testplayer has none; the team average is 72.5.', ['72.5'], ['team'])).toEqual([]);
    expect(run('The average is 72.5.', ['72.5'], ['8091da4b'])).toEqual([]);
  });
});

describe('what is written against a player the reads found nothing for', () => {
  it('has nothing to stand on, even beside a figure another player holds', () => {
    expect(run('Audit Testplayer is at 72.5.')).toEqual(['72.5']);
    expect(run('Audit is at 72.5.')).toEqual(['72.5']);
  });
  it('a scoring average written as "averaged N strokes" is tied to a scoring figure', () => {
    expect(run('Audit Testplayer averaged 72.5 strokes over his last ten rounds.')).toEqual(['72.5']);
    expect(run('Owen Carter averaged 72.5 strokes over his last ten rounds.')).toEqual([]);
    expect(run('Cole Bennett averaged -3.45 strokes/round on the green.')).toEqual(['-3.45']);
  });
});

describe('a pronoun in a list item is about the name the item opens with', () => {
  it('"- Audit, putting: Missed. His make rate was 46.5%." is not Cole’s 46.5', () => {
    const goals = [m(COLE, 'goal_value', 46.5)];
    const text = '- **Cole, putting:** Missed. His make rate was 46.5%.\n- **Audit, putting:** Missed. His make rate was 46.5%.';
    const out = auditNumericClaims(text, goals, [], [{ value: 46.5, player_id: COLE, metric_key: null }], [], 'America/New_York', { players: roster });
    expect(out.length).toBe(1);
  });
});
