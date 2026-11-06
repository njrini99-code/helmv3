import { describe, expect, it } from 'vitest';
import { MIN_SAMPLE_N } from '@/lib/coachhelm/v2/insights/upsert';
import { extractAndValidateChatClaims, thinSampleStated, unbackedCausalSentences } from '../claims-packet';
import type { CoachChatContext } from '../context';
import { buildInstructions } from '../instructions';
import { auditNumericClaims, coachRequestDates, collectDates, collectEnvelopeNumbers, readFigure, type Measurement, type ToolEnvelope } from '../provenance';
import { computeTurnVerdict, verdictRecord } from '../verdict';

/**
 * The three refusals seen live on 2026-11-05 (preview, Demo University Golf),
 * replayed through the real gates. The prose and the figures are the stored
 * turns (staging golf_coachhelm_chat_messages 362c5d66, 9e3b9631, 0a9da070);
 * the claims block is stripped before storage, so it is rebuilt here from the
 * measurements the answer cites.
 */

const TZ = 'America/New_York';
const OWEN = { kind: 'player' as const, id: 'p-owen', label: 'Owen Carter' };
const COLE = { kind: 'player' as const, id: 'p-cole', label: 'Cole Bennett' };
const ETHAN = { kind: 'player' as const, id: 'p-ethan', label: 'Ethan Park' };
const roster = [OWEN, COLE, ETHAN].map((p) => ({ id: p.id, name: p.label }));

const figure = (over: Partial<Measurement> & Pick<Measurement, 'metric_id' | 'value' | 'entity' | 'sample_size' | 'window_start' | 'window_end'>): Measurement =>
  readFigure({ metric_label: over.metric_id, unit: 'score', sample_unit: 'rounds', source: 'rounds', method: 'test', ...over });

const envelope = (over: Partial<ToolEnvelope>): ToolEnvelope => ({ summary: 'read', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-05T17:53:26Z', ...over });

/** What route.ts feeds the verdict from a turn's tool envelopes. */
function verdictFor(rawText: string, envelopes: readonly ToolEnvelope[], extraDates: readonly string[] = []) {
  const measurements = envelopes.flatMap((e) => e.measurements);
  const { strippedText, claims } = extractAndValidateChatClaims(rawText, measurements);
  return computeTurnVerdict({
    streamComplete: true,
    text: strippedText,
    measurements,
    series: envelopes.flatMap((e) => e.series),
    detailNumbers: envelopes.flatMap(collectEnvelopeNumbers),
    detailDates: [...envelopes.flatMap((e) => collectDates(e.detail, TZ)), ...extraDates],
    timezone: TZ,
    players: roster,
    claims,
  });
}

const tokensOf = (v: ReturnType<typeof verdictFor>) => verdictRecord(v)?.unmatched_tokens ?? [];

describe('refusal 1: "How many rounds has Owen Carter played this season, and what is his scoring average?"', () => {
  const thisSeason = figure({ metric_id: 'score_to_par_per_18', value: 0.5, entity: OWEN, sample_size: 2, window_start: '2026-08-01', window_end: '2027-07-31' });
  const lastSeason = figure({ metric_id: 'score_to_par_per_18', value: 5.08, entity: OWEN, sample_size: 12, window_start: '2025-08-01', window_end: '2026-07-31' });
  const avg = figure({ metric_id: 'scoring_average', value: 76.14, entity: OWEN, sample_size: 14, window_start: '2026-05-28', window_end: '2026-09-26' });
  const toPar = figure({ metric_id: 'scoring_average_vs_par', value: 4.43, entity: OWEN, sample_size: 14, window_start: '2026-05-28', window_end: '2026-09-26' });
  const reads = [
    envelope({ summary: 'Owen Carter: this season against last.', measurements: [thisSeason, lastSeason], detail: { player_id: OWEN.id, metric: 'Score to par per 18', metric_scope: 'score_to_par', this_season: { n: 2, hi: 2, lo: -1, mean: 0.5 }, last_season: { n: 12, hi: 8.61, lo: 1.56, mean: 5.08 } } }),
    envelope({ summary: '2 metrics for Owen Carter.', measurements: [avg, toPar] }),
  ];
  const claim = (m: Measurement) => ({ claim_id: m.metric_id, metric_id: m.metric_id, value: m.value, player_id: m.entity.id, window_start: m.window_start, window_end: m.window_end, unit: m.unit, denominator: null, claim_type: 'fact' });
  const withBlock = (prose: string, cited: Measurement[]) => `${prose}\n<<<CLAIMS>>>${JSON.stringify(cited.map(claim))}<<<END_CLAIMS>>>`;

  const widerWindow = 'From May 28 to September 26 he averaged 76.14 over 14 completed rounds, which is 4.43 over par. Last season he averaged 5.08 over par per 18 holes across 12 rounds.';

  it('the stored answer now passes: the figure is right and its sentence states its 2 rounds', () => {
    const verdict = verdictFor(withBlock(`Owen has 2 recorded rounds this season. Over those 2 rounds his score to par, scaled to 18 holes, is 0.5.\n\n${widerWindow}`, [thisSeason, avg, toPar, lastSeason]), reads);
    expect(verdict.outcome).toBe('accepted');
  });

  it('refuses a thin figure whose sentence does not state its sample', () => {
    const verdict = verdictFor(withBlock(`Owen has 2 recorded rounds this season. His score to par is 0.5.\n\n${widerWindow}`, [thisSeason, avg, toPar, lastSeason]), reads);
    expect(tokensOf(verdict)).toEqual(['score_to_par_per_18:unsupported_small_number']);
  });

  it('refuses a thin figure with the wrong sample', () => {
    const verdict = verdictFor(withBlock(`Over his 3 rounds his score to par is 0.5.`, [thisSeason]), reads);
    expect(tokensOf(verdict)).toEqual(['score_to_par_per_18:unsupported_small_number']);
  });

  it('refuses a wrong value however well its sample is stated', () => {
    const verdict = verdictFor(withBlock(`Over his 2 rounds his score to par is 0.9.`, [{ ...thisSeason, value: 0.9 }]), reads);
    expect(tokensOf(verdict)).toEqual(['0.9']);
    // A claim that disagrees with prose the audit accepts still fails on its own.
    const claimOnly = verdictFor(withBlock('Over his 2 rounds his score to par is 0.5.', [{ ...thisSeason, value: 0.9 }]), reads);
    expect(tokensOf(claimOnly)).toEqual(['score_to_par_per_18:value_mismatch']);
  });

  it('a thin figure tagged as a cause still needs backing', () => {
    const tagged = withBlock('Over his 2 rounds his score to par is 0.5.', [thisSeason]).replace('"claim_type":"fact"', '"claim_type":"causal"');
    expect(tokensOf(verdictFor(tagged, reads))).toEqual(['score_to_par_per_18:unsupported_small_number']);
  });

  it('a zero-sample figure never passes on a stated sample', () => {
    const empty = { ...thisSeason, sample_size: 0 };
    expect(tokensOf(verdictFor(withBlock('Over his 0 rounds his score to par is 0.5.', [empty]), [envelope({ measurements: [empty], detail: { this_season: { mean: 0.5 } } })]))).toEqual(['score_to_par_per_18:unsupported_small_number']);
  });

  it('thinSampleStated pairs each figure with its nearest count', () => {
    const line = "Owen's 0.5 over his 2 rounds sits beside his 5.08 over 12 rounds, per 18 holes across 12 rounds.";
    expect(thinSampleStated(line, 0.5, 2, 'rounds')).toBe(true);
    expect(thinSampleStated(line, 0.5, 12, 'rounds')).toBe(false);
    expect(thinSampleStated('He sits at 2 under par over his three rounds.', -2, 3, 'rounds')).toBe(true);
    expect(thinSampleStated('Owen has 2 rounds. Cole is 2 under over his 3 rounds.', -2, 3, 'rounds')).toBe(true);
    expect(thinSampleStated('Over 2 rounds he made 40.0% of them.', 40, 2, 'rounds')).toBe(true);
    expect(thinSampleStated('Nothing stated here, 0.5 only.', 0.5, 2, 'rounds')).toBe(false);
    expect(thinSampleStated('He is 58.3% over 4 attempts.', 58.3, 4, 'attempts')).toBe(true);
    expect(thinSampleStated('He is 58.3% over 4 rounds.', 58.3, 4, 'attempts')).toBe(false);
  });

  it('still refuses a wrong figure with a good sample', () => {
    const wrong = { ...avg, value: 74.14 };
    const verdict = verdictFor(withBlock('From May 28 to September 26 he averaged 74.14 over 14 completed rounds.', [wrong]), reads);
    expect(verdict.outcome).toBe('rejected');
  });

  it('tells the model where the floor is, only when the claim gate is on', () => {
    const ctx: CoachChatContext = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Demo', timezone: TZ, roster: [] };
    const on = buildInstructions(ctx, '2026-11-05T12:00:00Z', true).replace(/\s+/g, ' ');
    expect(on).toContain(`fewer than ${MIN_SAMPLE_N} rounds or attempts`);
    expect(on).toContain('72.5 over his 2 rounds');
    expect(on).toContain('A count, a sample size or any other figure has no metric_id to copy and stays out of the block');
    expect(on).toContain('because his tempo gets quicker');
    expect(buildInstructions(ctx, '2026-11-05T12:00:00Z', false).replace(/\s+/g, ' ')).not.toContain(`fewer than ${MIN_SAMPLE_N} rounds or attempts`);
  });

  it('tells the model a follow-up has to read again, flag on or off', () => {
    const ctx: CoachChatContext = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Demo', timezone: TZ, roster: [] };
    expect(buildInstructions(ctx, '2026-11-05T12:00:00Z', false).replace(/\s+/g, ' ')).toContain('read it again this turn');
  });
});

describe('refusal 2: "What is our team\'s scoring average this season?"', () => {
  const reads = [
    envelope({
      summary: '15 completed rounds by 6 players since 2026-08-01.',
      measurements: [figure({ metric_id: 'team_rounds_avg_to_par', value: -2, entity: COLE, sample_size: 3, window_start: '2026-08-01', window_end: '2026-11-05' })],
      detail: {
        since: '2026-08-01',
        round_count: 15,
        players: [{ name: 'Cole Bennett', player_id: COLE.id, rounds: 5, avg_to_par: -2, avg_score: 70, rounds_averaged: 3 }],
        recent_rounds: [
          { date: '2026-09-26', holes: 18, player: 'Cole Bennett', to_par: -2, total_score: 70, round_type: 'qualifier' },
          { date: '2026-09-25', holes: 18, player: 'Cole Bennett', to_par: -1, total_score: 71, round_type: 'qualifier' },
        ],
      },
    }),
    envelope({
      summary: 'Scoring average across Demo University Golf.',
      measurements: [
        figure({ metric_id: 'scoring_average', value: 72.55, entity: COLE, sample_size: 23, window_start: '2026-05-18', window_end: '2026-09-26' }),
        figure({ metric_id: 'scoring_average', value: 76.79, entity: ETHAN, sample_size: 15, window_start: '2026-05-18', window_end: '2026-09-26' }),
      ],
    }),
  ];
  const block = '\n<<<CLAIMS>>>[]<<<END_CLAIMS>>>';

  const claimOf = (m: Measurement) => ({ claim_id: `${m.entity.id}:${m.metric_id}`, metric_id: m.metric_id, value: m.value, player_id: m.entity.id, window_start: m.window_start, window_end: m.window_end, unit: m.unit, denominator: null, claim_type: 'fact' });
  const fullBlock = (cited: Measurement[]) => `\n<<<CLAIMS>>>${JSON.stringify(cited.map(claimOf))}<<<END_CLAIMS>>>`;
  const [coleThin, coleAvg, ethanAvg] = reads.flatMap((e) => e.measurements) as [Measurement, Measurement, Measurement];

  it('the stored answer passes whole: its pair of dates, its "because" about the data, and its 3 rounds stated', () => {
    const text =
      "I can't give you a reliable team scoring average for this season. Since the season began on August 1, 15 completed rounds are recorded across 6 of your 7 players, and Audit Testplayer has none. The tool left 12 of those 15 out of its averages because it flags them as 9-hole or incomplete. Only 3 rounds, all Cole Bennett's practice rounds at Pebble Beach, went into the average, at 2 under par. That figure describes Cole alone, not the team.\n\nThe 12 excluded rounds are the September 25 and 26 qualifier rounds. They are listed as 18 holes, so the incomplete flag looks like a data issue and I can't explain it from here. If those rounds are complete, they would give you a real team figure. Check them in the round records.\n\nFor a wider view, your six players with rounds have individual scoring averages over windows that start in May and end September 26. Cole is lowest at 72.55 over 23 rounds, and Ethan Park is highest at 76.79 over 15 rounds. Those windows include last season's rounds, so they are not season averages.";
    expect(verdictFor(text + fullBlock([coleThin, coleAvg, ethanAvg]), reads).outcome).toBe('accepted');
    expect(verdictFor(text.replace('Only 3 rounds', 'Only 4 rounds') + fullBlock([coleThin]), reads).outcome).toBe('rejected');
  });

  it('accepts the "or" form production refused ("October 20 or 21")', () => {
    const detail = { rounds: [{ date: '2026-10-20' }, { date: '2026-10-21' }] };
    expect(auditNumericClaims('Everyone else played on October 20 or 21.', [], [], [], collectDates(detail, TZ), TZ)).toEqual([]);
  });

  it('still flags a joined day no evidence date falls on', () => {
    expect(tokensOf(verdictFor(`The rounds were on September 25 and 29.${block}`, reads))).toEqual(['29']);
  });

  it('reports each day of an unsupported pair on its own', () => {
    expect(tokensOf(verdictFor(`The rounds were on December 3 and 29.${block}`, reads))).toEqual(['December 3', '29']);
  });

  it('a window containing the joined day is not enough: it has to be an exact date', () => {
    expect(tokensOf(verdictFor(`The rounds were on September 25 and 14.${block}`, reads))).toEqual(['14']);
  });

  it('reads a joined number with a stat unit as a number, not a date', () => {
    expect(tokensOf(verdictFor(`On September 25 and 26 putts later he finished.${block}`, reads))).toEqual(['26']);
    expect(tokensOf(verdictFor(`He had September 25 and 26% of greens.${block}`, reads))).toEqual(['26']);
  });

  it('still flags a wrong team figure', () => {
    expect(tokensOf(verdictFor(`Cole is lowest at 72.25 over 23 rounds.${block}`, reads))).toEqual(['72.25']);
  });
});

describe('causal wording: a cause is a claim only when it is about play and names nothing measured', () => {
  const owen = figure({ metric_id: 'scoring_average', value: 76.14, entity: OWEN, sample_size: 14, window_start: '2026-05-28', window_end: '2026-09-26' });
  const unbacked = (text: string) => unbackedCausalSentences(text, [owen]).length > 0;

  it.each([
    'The tool left 12 of those 15 out because it flags them as incomplete.',
    "I can't give you a season average because the season just started.",
    'His average is not shown because the rounds are not recorded yet.',
    'Tuesday does not work because he has class.',
    'The event moved because of rain.',
    'Thursday works better because of the weather.',
    'He missed practice because of his exam schedule.',
    'His scoring average rose because he lost 2.4 strokes on approach.',
    'He lost strokes as a result of 4 penalties.',
    'Practice is at 3 because the bus leaves at 5.',
  ])('passes: %s', (text) => {
    expect(unbacked(text)).toBe(false);
  });

  it.each([
    'His scores fell because his tempo gets quicker under pressure.',
    'Owen is struggling because of his grip.',
    'His scoring average rose due to poor course management.',
    'Low confidence led to his slump.',
    'I think he is slipping because of nerves.',
    'His tempo got quicker over the last 3 rounds, which is why he fell back.',
    'His scoring fell because his tempo slowed over his 4 rounds.',
    'Owen missed the cut because of nerves.',
    'His scoring average rose because rain hurt his putting.',
    'He played worse because of his class schedule.',
    'His scoring average rose because rain cost him 2.4 strokes on approach.',
  ])('refused: %s', (text) => {
    expect(unbacked(text)).toBe(true);
  });

  it('refuses the whole answer when an otherwise correct one asserts an unbacked cause', () => {
    const rawText = `From May 28 to September 26 he averaged 76.14 over 14 completed rounds because his tempo gets quicker.\n<<<CLAIMS>>>${JSON.stringify([{ claim_id: 'c', metric_id: 'scoring_average', value: 76.14, player_id: OWEN.id, window_start: owen.window_start, window_end: owen.window_end, unit: 'score', denominator: null, claim_type: 'fact' }])}<<<END_CLAIMS>>>`;
    expect(tokensOf(verdictFor(rawText, [envelope({ measurements: [owen] })]))).toEqual(['(none):unsupported_cause']);
  });

  it('a claim about the team figure beside a player is checked, not called the wrong player', () => {
    const team = figure({ metric_id: 'season_scoring_average', value: 74.2, entity: { kind: 'team', id: 'team-1', label: 'Demo' }, sample_size: 30, window_start: '2026-08-01', window_end: '2026-11-05' });
    const block = (value: number) => `\n<<<CLAIMS>>>${JSON.stringify([{ claim_id: 'c', metric_id: 'season_scoring_average', value, player_id: 'team-1', window_start: '2026-08-01', window_end: '2026-11-05', unit: 'score', denominator: null, claim_type: 'fact' }])}<<<END_CLAIMS>>>`;
    const reads = [envelope({ measurements: [team, owen] })];
    expect(verdictFor(`The team averages 74.2 over 30 rounds.${block(74.2)}`, reads).outcome).toBe('accepted');
    expect(tokensOf(verdictFor(`The team averages 74.2 over 30 rounds.${block(75.2)}`, reads))).toEqual(['season_scoring_average:value_mismatch']);
  });
});

describe('refusal 3: "Add a practice next Tuesday at 3pm at the home course called QA test practice"', () => {
  const askedFor = 'Add a practice next Tuesday at 3pm at the home course called QA test practice';
  const today = '2026-11-05'; // A Thursday.
  const reply = (date: string) => `What time should the practice end? Once you tell me, I'll draft QA test practice for ${date}, starting at 3:00 PM at the home course.`;

  it('reproduces the refusal: no tool ran, so nothing supports the date', () => {
    expect(tokensOf(verdictFor(reply('Tuesday, November 10'), []))).toEqual(['November 10']);
  });

  it('accepts the date the coach\'s own "next Tuesday" names', () => {
    expect(coachRequestDates(askedFor, today)).toEqual(['2026-11-10', '2026-11-17']);
    expect(verdictFor(reply('Tuesday, November 10'), [], coachRequestDates(askedFor, today)).outcome).toBe('accepted');
  });

  it('still refuses a date the coach\'s words do not name', () => {
    expect(tokensOf(verdictFor(reply('Wednesday, November 11'), [], coachRequestDates(askedFor, today)))).toEqual(['November 11']);
    expect(tokensOf(verdictFor(reply('Tuesday, November 10'), [], coachRequestDates('Add a practice at 3pm', today)))).toEqual(['November 10']);
  });

  it('resolves the words a coach uses, from the day they were said', () => {
    expect(coachRequestDates('Can we go tomorrow?', today)).toEqual(['2026-11-06']);
    expect(coachRequestDates('Is it on today?', today)).toEqual([today]);
    expect(coachRequestDates('Move it to Tuesday', today)).toEqual(['2026-11-10']);
    expect(coachRequestDates('this Thursday works', today)).toEqual([today]);
    expect(coachRequestDates('next Friday', '2026-12-30')).toEqual(['2027-01-01', '2027-01-08']);
    expect(coachRequestDates('Add a practice on Nov 10', today)).toEqual(['2026-11-10']);
    expect(coachRequestDates('Book Jan 8 for the trip', today)).toEqual(['2027-01-08']);
    expect(coachRequestDates('Practices on Nov 10 and 17', today)).toEqual(['2026-11-10', '2026-11-17']);
    expect(coachRequestDates('The trip is Nov 10-12', today)).toEqual(['2026-11-10', '2026-11-12']);
    expect(coachRequestDates('What is his scoring average?', today)).toEqual([]);
    expect(coachRequestDates('', today)).toEqual([]);
  });

  it('does not read a may or a march that is not a month', () => {
    expect(coachRequestDates('He may 10 putt it', today)).toEqual([]);
  });
});

describe('production shapes: 9 of 20 coach_chat turns refused, 2026-10-22 to 2026-11-05', () => {
  const ann = { kind: 'player' as const, id: 'p-ann', label: 'Ann Lee' };
  const bo = { kind: 'player' as const, id: 'p-bo', label: 'Bo Ray' };
  const sg = (value: number, entity: typeof ann) => figure({ metric_id: 'sg_approach', unit: 'strokes', value, entity, sample_size: 18, window_start: '2026-05-01', window_end: '2026-09-30' });
  const players = [ann, bo].map((p) => ({ id: p.id, name: p.label }));
  const audit = (text: string, m: Measurement[] = [sg(-0.83, ann), sg(-3.83, bo)], extra: number[] = []) => auditNumericClaims(text, m, [], extra, [], TZ, { players });

  it('a hyphen between two numbers is a range, not a minus sign', () => {
    expect(audit('Across his last 18-22 logged approaches.', [], [18, 22])).toEqual([]);
    expect(audit('From 125-175 yd he hits half.', [], [125, 175])).toEqual([]);
  });

  it('both ends of a range are still checked', () => {
    expect(audit('Across his last 18-99 logged approaches.', [], [18, 22]).map((c) => c.text)).toEqual(['99']);
    expect(audit('Across his last 99-22 logged approaches.', [], [18, 22]).map((c) => c.text)).toEqual(['99']);
  });

  it('a figure has to round to the evidence at the precision it was written', () => {
    const avg = [figure({ metric_id: 'scoring_average', value: 72.55, entity: ann, sample_size: 23, window_start: '2026-05-01', window_end: '2026-09-30' })];
    for (const written of ['72.55', '72.5', '72.6', '73']) expect(audit(`Ann Lee averages ${written}.`, avg)).toEqual([]);
    for (const written of ['72.95', '72.65', '72.7', '74']) expect(audit(`Ann Lee averages ${written}.`, avg).map((c) => c.text)).toEqual([written]);
    expect(audit('Ann Lee averages about 74.', avg)).toEqual([]);
    expect(audit('Ann Lee averages 72.550.', avg)).toEqual([]);
  });

  it('a real minus sign still means negative', () => {
    expect(audit('SG approach is -22 here.', [], [22]).map((c) => c.text)).toEqual(['-22']);
    expect(audit('SG approach is 3.83 for Bo Ray.', [sg(-3.83, bo)])).toEqual([]);
  });

  it('"-3.83 (Bo Ray)" is about Bo, not the name written before it', () => {
    expect(audit('SG approach ranges from -0.83 (Ann Lee) to -3.83 (Bo Ray).')).toEqual([]);
  });

  it('the parenthetical name is still checked', () => {
    const found = audit('SG approach ranges from -3.83 (Ann Lee) to -0.83 (Bo Ray).');
    expect(found.map((c) => [c.text, c.misattributed])).toEqual([['-3.83', true], ['-0.83', true]]);
  });
});
