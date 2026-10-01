import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { deriveTone } from '@/components/golf/coachhelm/insight-card/tone-derivation';
import { describe, expect, it } from 'vitest';
import { drawnComparison, isNote, kindOf, staleFloor, staleSince } from '../data/coachhelm-classify';
import { toChInsight } from '../data/coachhelm-map';
import { partitionInsights, sortCoachPlayers, playersLine, type ChCoachPlayer, type ChInsight, type ChTourBaseline } from '../data/coachhelm-shape';
import { speak } from '../data/coachhelm-voice';
import { bigNumber, breakBias, HELM_PLAYERS, parType, penalties, PREVIEW_TOUR, puttBalanced, slope, teeInconclusive } from '../preview/fixtures-coachhelm';

/**
 * The CoachHelm audit's code fixes (swap audit section 13): which cards state a finding, which way a strength points,
 * whose voice the text is in, which words the read uses, and when a card is out of date.
 */

const jonah = HELM_PLAYERS.jonah.id;
const withEvidence = (i: EvidenceInsight, e: Partial<EvidenceInsight['evidence']>): EvidenceInsight => ({ ...i, evidence: { ...i.evidence, ...e } });
const tourOf = (values: Array<[string, number]>): ChTourBaseline => ({ tour: 'pga', values: new Map(values) });

describe('CH13-11 cards that state no finding', () => {
  it('the generators’ own "looked and found nothing" and descriptive rows are notes, by signature or the feed_exempt flag', () => {
    expect(isNote(teeInconclusive(jonah))).toBe(true);
    expect(isNote(puttBalanced(jonah))).toBe(true);
    expect(isNote({ ...teeInconclusive(jonah), signature: 'v3:tee_strategy:sharp' })).toBe(true);
    // The collapsed par card (feed_exempt), and the warm-up row that carries the same flag.
    expect(isNote(parType(jonah))).toBe(true);
    expect(isNote({ ...slope(jonah), signature: 'v3:warmup_hole:hole_1', evidence: { ...slope(jonah).evidence, feed_exempt: true } })).toBe(true);
  });

  it('a laggy driver, a slope penalty and a break read with a bias are findings', () => {
    expect(isNote({ ...teeInconclusive(jonah), signature: 'v3:tee_strategy:laggy' })).toBe(false);
    expect(isNote(slope(jonah))).toBe(false);
    expect(isNote({ ...breakBias(jonah), signature: 'v3:putt_bias:left_to_right' })).toBe(false);
    // A row with no signature is judged by its flag alone.
    expect(isNote({ ...slope(jonah), signature: null })).toBe(false);
  });

  it('a note draws no number, no gauge, no confidence read and no sample: the par card never shows the par 3 value under a title for all three', () => {
    const par = toChInsight(parType(jonah));
    expect(par.kind).toBe('note');
    expect(par.title).toBe('Scoring by par type');
    expect(par.value).toBe('');
    expect(par.evidence).toMatchObject({ label: '', bars: null, gauge: null, sample: '', window: null, read: null });
    expect(par.lede).toContain('Par 3: 3.27');
    expect(par.lede).toContain('Par 5: 4.91');
    const tee = toChInsight(teeInconclusive(jonah));
    expect(tee).toMatchObject({ kind: 'note', strength: false, value: '' });
  });
});

describe('CH13-12 a strength points the way the comparison on the card points', () => {
  const lowBigNumber = bigNumber(jonah);

  it('ahead of the college cohort (4.8%) but behind the Tour value that is drawn is not a strength', () => {
    // 1.6% against a Tour 1.2%: a lower rate is better, and 1.6 is above it.
    const tour = tourOf([['big_number_rate', 1.2]]);
    expect(drawnComparison(lowBigNumber.evidence, tour)).toBe(1.2);
    expect(kindOf(lowBigNumber, tour)).toBe('finding');
    expect(toChInsight(lowBigNumber, { tour })).toMatchObject({ kind: 'finding', strength: false, priority: 'low' });
    expect(toChInsight(lowBigNumber, { tour }).evidence.gauge).toMatchObject({ good: false, cmp: 'Tour 1.2%' });
  });

  it('ahead of the Tour value that is drawn (2%), at low priority, is a strength', () => {
    expect(kindOf(lowBigNumber, PREVIEW_TOUR)).toBe('strength');
    expect(toChInsight(lowBigNumber, { tour: PREVIEW_TOUR }).strength).toBe(true);
  });

  it('a college comparison with no Tour value to draw it as says nothing about direction, so it is not a strength', () => {
    expect(drawnComparison(lowBigNumber.evidence, null)).toBeNull();
    expect(kindOf(lowBigNumber, null)).toBe('finding');
    expect(kindOf(lowBigNumber, tourOf([]))).toBe('finding');
  });

  it('a division target that is not like-for-like is not drawn, so it never decides a strength either', () => {
    const d1 = withEvidence(lowBigNumber, { comparison_source: 'd1_avg', comparison_value: 9 });
    expect(drawnComparison(d1.evidence, PREVIEW_TOUR)).toBeNull();
    expect(kindOf(d1, PREVIEW_TOUR)).toBe('finding');
  });

  it('the player’s own baseline still decides: better than it, at low priority, is a strength; worse is not', () => {
    const better = { ...breakBias(jonah), priority: 'low' as const, evidence: { ...breakBias(jonah).evidence, your_value: 60, comparison_value: 51 } };
    expect(kindOf(better, null)).toBe('strength');
    const worse = { ...better, evidence: { ...better.evidence, your_value: 40 } };
    expect(kindOf(worse, null)).toBe('finding');
  });

  it('a resolved insight is still working, whatever the comparison says', () => {
    expect(kindOf({ ...slope(jonah), lifecycle_state: 'resolved' }, null)).toBe('strength');
  });

  it('deriveTone does not read a missing comparison as zero: an insight with no comparison is not encouraging', () => {
    const base = breakBias(jonah);
    const noComparison = { ...base, priority: 'low' as const, evidence: { ...base.evidence, comparison_value: undefined as unknown as number } };
    expect(deriveTone(noComparison)).toBe('neutral');
    const noYou = { ...base, priority: 'low' as const, evidence: { ...base.evidence, your_value: undefined as unknown as number, comparison_value: -3 } };
    expect(deriveTone(noYou)).toBe('neutral');
    // The same card with both numbers, ahead on a higher-is-better metric, is still encouraging.
    expect(deriveTone({ ...base, priority: 'low', evidence: { ...base.evidence, your_value: 60, comparison_value: 51 } })).toBe('encouraging');
  });

  it('a card with no comparison at all is a finding at low priority, not a strength', () => {
    const base = withEvidence({ ...breakBias(jonah), priority: 'low' }, { comparison_value: undefined as unknown as number });
    expect(toChInsight(base).strength).toBe(false);
  });
});

describe('CH13-10 the read says what the canonical confidence words say', () => {
  const read = (confidence: number, extra: Partial<EvidenceInsight['evidence']> = {}) => toChInsight(withEvidence(penalties(jonah), { confidence, ...extra })).evidence.read;

  it('Solid, Early and Thin read, with the sample on a thin one: never Strong or Fair', () => {
    expect(read(0.82)).toEqual({ level: 3, word: 'Solid read' });
    expect(read(0.55)).toEqual({ level: 2, word: 'Early read' });
    expect(read(0.2, { sample_n: 8 })).toEqual({ level: 1, word: 'Thin read, n=8' });
    expect(read(Number.NaN)).toBeNull();
  });

  it('a row whose recency and variance were not measured never claims Strong', () => {
    const r = read(0.95, { confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5, factors_measured: false } });
    expect(r?.word).not.toMatch(/strong|fair/i);
    expect(r?.word).toBe('Solid read');
  });
});

describe('CH13-9 the sample in its own unit, and when the read was made', () => {
  it('the generator’s own sample unit names the sample: 26 rounds, 1 attempt, never observations', () => {
    expect(toChInsight(parType(jonah)).kind).toBe('note');
    const rounds = toChInsight(withEvidence({ ...slope(jonah), signature: null }, { metric: 'scoring_par_4', sample_n: 26, detail: { sample_unit: 'rounds' } }));
    expect(rounds.evidence.sample).toBe('26 rounds');
    const one = toChInsight(withEvidence(slope(jonah), { metric: 'something_unlisted', sample_n: 1, detail: { sample_unit: 'attempts' } }));
    expect(one.evidence.sample).toBe('1 attempt');
    const holes = toChInsight(withEvidence(slope(jonah), { metric: 'something_unlisted', sample_n: 9, detail: { sample_unit: 'holes' } }));
    expect(holes.evidence.sample).toBe('9 holes');
  });

  it('with no unit given, the metric still names the sample as before', () => {
    expect(toChInsight(slope(jonah)).evidence.sample).toBe('75 putts');
    expect(toChInsight(withEvidence(slope(jonah), { metric: 'something_unlisted', detail: {} })).evidence.sample).toBe('75 observations');
  });

  it('a window kind of lifetime says All rounds, as window_basis does', () => {
    expect(toChInsight(withEvidence(slope(jonah), { detail: { window_kind: 'lifetime' } })).evidence.window).toBe('All rounds');
  });

  it('"As of" is the day the read was last refreshed, in UTC; without it, the day its window ended; without either, nothing', () => {
    const refreshed = { ...slope(jonah), metadata: { last_refreshed_at: '2026-09-30T23:30:26.370Z' } };
    expect(toChInsight(refreshed).evidence.asOf).toBe('As of Sep 30');
    const ended = withEvidence(slope(jonah), { window_end: '2026-09-12' });
    expect(toChInsight(ended).evidence.asOf).toBe('As of Sep 12');
    expect(toChInsight(withEvidence(slope(jonah), { window_end: '' })).evidence.asOf).toBeNull();
    expect(toChInsight({ ...slope(jonah), metadata: { last_refreshed_at: 'not a date' } }).evidence.asOf).toBeNull();
  });
});

describe('CH13-3 a read older than the player’s newest round is not drawn as current', () => {
  const refreshedOn = (iso: string) => ({ ...slope(jonah), metadata: { last_refreshed_at: iso } });

  it('refreshed on an earlier day than the newest completed round: stale since that round', () => {
    expect(staleSince(refreshedOn('2026-09-28T02:30:43.587Z'), '2026-09-30')).toBe('2026-09-30');
  });

  it('refreshed on the day of the newest round, or after it: current (a day is the finest the round date tells)', () => {
    expect(staleSince(refreshedOn('2026-09-30T02:30:43.587Z'), '2026-09-30')).toBeNull();
    expect(staleSince(refreshedOn('2026-10-01T02:30:43.587Z'), '2026-09-30')).toBeNull();
  });

  it('evidence whose window ended more than the generator’s window before the newest round: stale', () => {
    const old = withEvidence(slope(jonah), { window_end: '2026-06-01', window_days: 90, window_basis: 'rolling' });
    expect(staleSince(old, '2026-09-30')).toBe('2026-09-30');
    // Within the window of it: current.
    expect(staleSince(withEvidence(slope(jonah), { window_end: '2026-08-15', window_days: 90 }), '2026-09-30')).toBeNull();
  });

  it('a lifetime value has no window to be older than, and a row with neither date cannot be told stale', () => {
    expect(staleSince(withEvidence(slope(jonah), { window_end: '2026-01-01', window_days: 90, window_basis: 'lifetime' }), '2026-09-30')).toBeNull();
    expect(staleSince(slope(jonah), '2026-09-30')).toBeNull();
  });

  it('no round, or an unknown one, leaves it current', () => {
    expect(staleSince(refreshedOn('2026-09-28T02:30:43Z'), null)).toBeNull();
  });

  it('the floor a round must reach to make a row stale: its refresh day, or the end of its window plus the window', () => {
    expect(staleFloor(refreshedOn('2026-09-28T02:30:43Z'))).toBe('2026-09-28');
    expect(staleFloor(withEvidence(slope(jonah), { window_end: '2026-06-01', window_days: 90 }))).toBe('2026-08-30');
    expect(staleFloor(slope(jonah))).toBeNull();
  });

  it('the card carries it: stale, with the date of the round it does not include, and its own as-of line', () => {
    const ch = toChInsight(refreshedOn('2026-09-28T02:30:43Z'), { newestRound: '2026-09-30' });
    expect(ch.stale).toEqual({ newestRound: 'Sep 30' });
    expect(ch.evidence.asOf).toBe('As of Sep 28');
    expect(toChInsight(refreshedOn('2026-09-30T02:30:43Z'), { newestRound: '2026-09-30' }).stale).toBeNull();
    expect(toChInsight(slope(jonah)).stale).toBeNull();
  });
});

describe('CH13-16 the card carries its status', () => {
  it('an acknowledged insight says so', () => {
    expect(toChInsight({ ...slope(jonah), status: 'acknowledged' }).acknowledged).toBe(true);
    expect(toChInsight(slope(jonah)).acknowledged).toBe(false);
  });
});

describe('CH13-13 whose voice the text is in', () => {
  describe('on the coach’s board, the player’s first name', () => {
    const jo = { role: 'coach', first: 'Jonah' } as const;

    it('contractions and the verbs after you, from the generators’ real sentences', () => {
      expect(speak("Inside 4-6 ft you're making 58% of downhill putts vs 81% of level putts at the same distance", jo)).toBe(
        'Inside 4-6 ft Jonah is making 58% of downhill putts vs 81% of level putts at the same distance',
      );
      expect(speak("When you do reach it you finish 23 ft from the hole (over 40 greens), that's the dial-in once you're on.", jo)).toBe(
        "When Jonah does reach it Jonah finishes 23 ft from the hole (over 40 greens), that's the dial-in once Jonah is on.",
      );
      expect(speak('Across your last 55 approaches from 125-175 yd you found the green 73% of the time', jo)).toBe("Across Jonah's last 55 approaches from 125-175 yd Jonah found the green 73% of the time");
      expect(speak("You're averaging 1.1 penalty strokes per round and you couldn't escape the sand", jo)).toBe("Jonah is averaging 1.1 penalty strokes per round and Jonah couldn't escape the sand");
      expect(speak('You have 3 doubles and you birdie 12% of par 5s. You attempted 14.', jo)).toBe('Jonah has 3 doubles and Jonah birdies 12% of par 5s. Jonah attempted 14.');
    });

    it('you as an object, a name that ends in s, and coach-voiced text that names the player', () => {
      expect(speak('This costs you about 1.5 strokes a round, and gives you plenty to work with.', jo)).toBe('This costs Jonah about 1.5 strokes a round, and gives Jonah plenty to work with.');
      expect(speak('Your putts', { role: 'coach', first: 'Chris' })).toBe("Chris's putts");
      expect(speak('Your putts', { role: 'coach', first: 'James' })).toBe("James's putts");
      expect(speak('Your putts', { role: 'coach', first: 'Lucas' })).toBe("Lucas's putts");
      expect(speak('Recommended: have the player call the carry number', jo)).toBe('Recommended: have Jonah call the carry number');
    });

    it('the generators’ stored sentences, read from the live insights table', () => {
      expect(speak('Across your last 193 approaches from 175+ yd you found the green 34% of the time. On par 4s, where you have to go at it, you found the green 32% of the time.', jo)).toBe(
        "Across Jonah's last 193 approaches from 175+ yd Jonah found the green 34% of the time. On par 4s, where Jonah has to go at it, Jonah found the green 32% of the time.",
      );
      expect(speak('43.8% of your double-or-worse holes trace to missed greens you couldn’t get up-and-down.', jo)).toBe('43.8% of Jonah\'s double-or-worse holes trace to missed greens Jonah couldn’t get up-and-down.');
      expect(speak("Your lag putts (15+ ft) aren't finishing inside tap-in range, and you're only making 50% from 3-5 ft, so the second putt stops costing you a stroke.", jo)).toBe(
        "Jonah's lag putts (15+ ft) aren't finishing inside tap-in range, and Jonah is only making 50% from 3-5 ft, so the second putt stops costing Jonah a stroke.",
      );
      expect(speak('You ESCAPE the bunker fine, but you finish 13 ft from the hole and then 2-putt. You play worse when it counts.', jo)).toBe(
        'Jonah escapes the bunker fine, but Jonah finishes 13 ft from the hole and then 2-putt. Jonah plays worse when it counts.',
      );
      expect(speak("the driver is how far your approach/chip leaves you, not your stroke; the layback is better where driver isn't pinning you to a much better approach distance", jo)).toBe(
        "the driver is how far Jonah's approach/chip leaves Jonah, not Jonah's stroke; the layback is better where driver isn't pinning Jonah to a much better approach distance",
      );
      expect(speak("That's driven by 4.1% doubles + 28.4% bogeys, not a birdie problem (you birdie 10.8% of these).", jo)).toBe("That's driven by 4.1% doubles + 28.4% bogeys, not a birdie problem (Jonah birdies 10.8% of these).");
    });

    it('a sentence it cannot conjugate keeps its second person rather than printing a wrong verb', () => {
      expect(speak('If you zorb the green', jo)).toBe('If you zorb the green');
    });

    it('text with no second person is returned as it is', () => {
      expect(speak('Downhill penalty vs level putts', jo)).toBe('Downhill penalty vs level putts');
      expect(speak('', jo)).toBe('');
    });
  });

  describe('on the player’s board, to the player', () => {
    const pl = { role: 'player' } as const;

    it('"have the player X" is X, and the player is you', () => {
      expect(speak('Recommended: have the player log club and pin position from this range for the next ten approaches.', pl)).toBe(
        'Recommended: log club and pin position from this range for the next ten approaches.',
      );
      expect(speak('Have the player state the start line before each approach.', pl)).toBe('State the start line before each approach.');
      expect(speak("Check the player's club and the player's target.", pl)).toBe('Check your club and your target.');
    });

    it('the approach generators’ stored instruction ends for the player with their coach, not "together"', () => {
      expect(speak('Recommended: have the player call the carry number that covers the flag from this range and log the club, then review the next ten approaches from here together.', pl)).toBe(
        'Recommended: call the carry number that covers the flag from this range and log the club, then review the next ten approaches from here with your coach.',
      );
    });

    it('text already in the second person is returned as it is', () => {
      expect(speak("You're making 58% of downhill putts", pl)).toBe("You're making 58% of downhill putts");
    });
  });

  it('no viewer leaves the text alone (the preview and the Fairway mapper)', () => {
    expect(speak("you're making it", undefined)).toBe("you're making it");
  });

  it('toChInsight speaks for the viewer in the claim, the reasoning, the text of This week and the labels on the gauge', () => {
    const coach = toChInsight(slope(jonah), { viewer: { role: 'coach', first: 'Jonah' }, drillText: 'Have the player start 2 ft below the hole.' });
    expect(coach.lede).toBe('Inside 4-6 ft Jonah is making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap (n=31 downhill / 44 level).');
    expect(coach.why).toContain("Jonah's bag");
    expect(coach.why).not.toMatch(/\byou('re)?\b/i);
    expect(coach.week?.text).toBe('Have Jonah start 2 ft below the hole.');
    const own = toChInsight(breakBias(jonah), { viewer: { role: 'coach', first: 'Jonah' } });
    expect(own.evidence.gauge?.cmp).toBe("Jonah's right-to-left make % (same band) 51%");
    const player = toChInsight(slope(jonah), { viewer: { role: 'player' }, drillText: 'Have the player start 2 ft below the hole.' });
    expect(player.lede).toContain("you're making 58%");
    expect(player.week?.text).toBe('Start 2 ft below the hole.');
  });
});

describe('the board’s own steps, with notes, stale reads and what is drawn', () => {
  const ch = (i: EvidenceInsight, extra: Parameters<typeof toChInsight>[1] = {}) => toChInsight(i, { tour: PREVIEW_TOUR, ...extra });
  const player = (id: string, top: ChInsight, count: number): ChCoachPlayer => ({ id, name: id, count, top });

  it('a note is never the focus, a lead row or a working row on the player’s board', () => {
    const list = [ch(teeInconclusive(jonah)), ch(parType(jonah)), ch(slope(jonah)), ch(bigNumber(jonah, 'in-dbl'))];
    const { focus, also, working } = partitionInsights(list);
    expect(focus?.id).toBe('in-slope');
    expect([...also, ...working].map((i) => i.kind)).not.toContain('note');
  });

  it('a stale insight does not lead while a current finding exists, and still leads when it is the only one', () => {
    const stale = ch({ ...slope(jonah), metadata: { last_refreshed_at: '2026-09-01T00:00:00Z' } }, { newestRound: '2026-09-30' });
    const fresh = ch(penalties(jonah));
    expect(partitionInsights([stale, fresh]).focus?.id).toBe('in-pen');
    expect(partitionInsights([stale]).focus?.id).toBe('in-slope');
    expect(partitionInsights([stale, fresh]).also.map((i) => i.id)).toEqual(['in-slope']);
  });

  it('the most pressing player first, then a stale head, then a strength, then a note', () => {
    const note = player('note', ch(teeInconclusive('note')), 0);
    const strength = player('strength', ch(bigNumber('strength')), 0);
    const stale = player('stale', ch({ ...slope('stale'), metadata: { last_refreshed_at: '2026-09-01T00:00:00Z' } }, { newestRound: '2026-09-30' }), 0);
    const live = player('live', ch(penalties('live')), 1);
    expect(sortCoachPlayers([note, strength, stale, live]).map((p) => p.id)).toEqual(['live', 'stale', 'strength', 'note']);
  });

  it('the headline counts the players with a signal on the board, in the words of what is drawn', () => {
    expect(playersLine(0)).toBe('No open signals.');
    expect(playersLine(1)).toBe('1 player has an open signal.');
    expect(playersLine(4)).toBe('4 players have an open signal.');
  });
});
