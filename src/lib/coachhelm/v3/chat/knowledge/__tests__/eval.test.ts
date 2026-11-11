import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../../context';
import type { PlayerChatContext } from '../../engine/tool';
import { toolsFor } from '../../registry';
import { FLAGGED_READERS } from '../data-map.source';
import { EVAL_GLOBAL_FORBID, EVAL_PATTERN_NAMES, golfSenseQuestions, properNounPattern, sentenceCount } from '../eval';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const player: PlayerChatContext = { ...coach, player_id: 'p1' };
const questions = golfSenseQuestions();
const AREAS = ['strokes_gained', 'scoring', 'ball_striking', 'short_game', 'putting', 'mistakes', 'relations', 'college', 'courses', 'windows', 'action', 'caution', 'limits', 'data', 'writing'];

describe('the golf-sense eval set', () => {
  // Sixty from the first pass, nine on what a Tour-based strokes gained figure means, five on the writing alone (the owner's follow-ups, 10 Nov 2026).
  it('has 60 to 80 questions with unique ids, for a coach and for a player', () => {
    expect(questions.length).toBeGreaterThanOrEqual(60);
    expect(questions.length).toBeLessThanOrEqual(80);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(questions.filter((q) => q.viewer === 'player').length).toBeGreaterThanOrEqual(5);
  });

  it('covers every area of the golf block and the data map', () => {
    const covered = new Set(questions.map((q) => q.area));
    for (const area of AREAS) expect([...covered], area).toContain(area);
    expect([...covered].filter((a) => !AREAS.includes(a))).toEqual([]);
  });

  it('says for every question what a correct answer must contain, and why the question is there', () => {
    for (const q of questions) {
      expect(q.facts.length, q.id).toBeGreaterThan(0);
      expect(q.note.length, q.id).toBeGreaterThan(15);
      expect(q.ask.endsWith('?') || q.ask.endsWith('.'), q.id).toBe(true);
    }
    // The cautions the brief names each have questions that forbid the failure.
    const forbids = (name: string) => questions.filter((q) => q.forbid.some((f) => f.pattern === name)).length;
    expect(forbids('tour_figure_from_memory')).toBeGreaterThanOrEqual(8);
    expect(forbids('swing_diagnosis')).toBeGreaterThanOrEqual(6);
    expect(forbids('label')).toBeGreaterThanOrEqual(8);
    expect(forbids('promise')).toBeGreaterThanOrEqual(5);
    expect(forbids('teammate_named')).toBeGreaterThanOrEqual(4);
    for (const name of EVAL_PATTERN_NAMES) expect(forbids(name), name).toBeGreaterThan(0);
  });

  it('names only reads the viewer is offered', () => {
    const coachReads = new Set([...toolsFor('ask', coach), ...toolsFor('quick_chat', coach)].map((t) => t.name).concat(Object.keys(FLAGGED_READERS)));
    const playerReads = new Set(toolsFor('player', player).map((t) => t.name));
    for (const q of questions) for (const r of q.readers) expect((q.viewer === 'player' ? playerReads : coachReads).has(r), `${q.id}: ${r}`).toBe(true);
    // A player's question never expects a team-wide read.
    for (const q of questions.filter((q) => q.viewer === 'player')) expect(q.readers).not.toEqual(expect.arrayContaining(['get_team_stats']));
  });

  it('its guards catch the failures they are named for and pass a careful answer', () => {
    const re = (name: string) => golfSenseQuestions({ teammate: 'Owen Carter' }).flatMap((q) => q.forbid).find((f) => f.pattern === name)!.re;
    expect(re('tour_figure_from_memory').test('The Tour average is about 65% of greens.')).toBe(true);
    expect(re('tour_figure_from_memory').test('A D1 player typically hits 62% of greens; college players average 30 putts.')).toBe(true);
    expect(re('swing_diagnosis').test('He is probably coming over the top with an open clubface.')).toBe(true);
    expect(re('label').test('Honestly he chokes under pressure.')).toBe(true);
    expect(re('promise').test('Fixing this will save him two strokes a round.')).toBe(true);
    expect(re('weather_guess').test('That round was high because of the wind.')).toBe(true);
    expect(re('picks_the_lineup').test('You should take Eli and leave Marcus at home.')).toBe(true);
    expect(re('names_internals').test('I ran get_player_stats on golf_rounds.')).toBe(true);
    expect(re('teammate_named').test('You are longer than Owen Carter.')).toBe(true);
    expect(re('negative_sg_called_bad').test('A negative number means bad putting.')).toBe(true);
    const careful =
      'Eli is losing the most in approach over his last 10 rounds (10 rounds), about a stroke more than the team in the same window. Zero is Tour level, so a negative figure is normal for a college player. Approach shots from long range are finishing farther from the hole than the team\'s. It is early to call it a pattern; the same figure after a few more rounds will tell. The choice of who travels is yours.';
    for (const name of EVAL_PATTERN_NAMES) if (name !== 'teammate_named') expect(re(name).test(careful), name).toBe(false);
    // The owner's follow-up: the sign is never a verdict, an estimate is never a gap to the Tour, and no tour is named unprompted.
    expect(re('sign_as_verdict').test('His approach number is negative, which means poor iron play.')).toBe(true);
    expect(re('estimate_as_tour_gap').test('From the scorecard estimate he is about two behind the Tour in approach.')).toBe(true);
    expect(re('names_pga_unprompted').test('Your numbers are against the PGA Tour.')).toBe(true);
    const explained =
      'Nothing is wrong with the numbers. Strokes gained here is measured against the Tour benchmark, and Tour players are the best in the world, so a college player is expected to be negative in most parts of the game. Read where each player gives up the most, and how they stand against the team in the same window.';
    for (const name of ['sign_as_verdict', 'estimate_as_tour_gap', 'names_pga_unprompted', 'negative_sg_called_bad', 'tour_figure_from_memory', 'label']) expect(re(name).test(explained), name).toBe(false);
    // The understanding has its own questions, for a coach and for a player.
    const ids = questions.map((q) => q.id);
    for (const id of ['sg-why-all-negative', 'sg-is-minus-two-bad', 'sg-best-putter-all-negative', 'sg-why-tour', 'sg-womens-benchmark', 'sg-what-it-is-not', 'sg-estimate-limits', 'sg-player-what-my-number-means', 'sg-player-everything-negative']) expect(ids).toContain(id);
  });

  describe('the writing rules, held against every answer', () => {
    const guard = (name: string) => questions[0]!.forbid.find((f) => f.pattern === name)!.re;
    const fails = (answer: string) => EVAL_GLOBAL_FORBID.filter((name) => guard(name).test(answer));

    it('are on every question', () => {
      expect([...EVAL_GLOBAL_FORBID].sort()).toEqual(['abbreviation', 'ascii_minus', 'heading_or_table', 'names_internals', 'proper_noun_case', 'sample_notation', 'sentence_start_case', 'wrong_case']);
      for (const q of questions) for (const name of EVAL_GLOBAL_FORBID) expect(q.forbid.filter((f) => f.pattern === name).length, `${q.id}: ${name}`).toBe(1);
    });

    it('fail the notation the owner saw: n=4, N-4, a bracketed n', () => {
      for (const bad of ['His scoring average is 74.2 (n=4).', 'Scoring average 74.2, N-4.', 'He is at 74.2 (n 4) lately.', 'Putting: 1.8 per hole, n = 12', 'Greens 61% (10 rds).']) expect(fails(bad), bad).toContain('sample_notation');
    });

    it('fail a heading, an ALL CAPS or Title Case line, a bold label line and a table', () => {
      for (const bad of ['## Putting\nHe putts well.', 'PUTTING SUMMARY\nHe putts well.', 'Putting Summary For Eli\nHe putts well.', '**Putting**\nHe putts well.', '| Stat | Value |\n| Putts | 31 |']) expect(fails(bad), bad).toContain('heading_or_table');
    });

    it('fail an abbreviation a coach would not say aloud, wrong capitals and a tool or table name', () => {
      for (const bad of ['His SG putting is up.', 'GIR is down over his last 10 rounds.', 'His scoring avg is lower.', 'Eli vs the team on greens.', 'He is hitting it 280 yds.']) expect(fails(bad), bad).toContain('abbreviation');
      for (const bad of ['His Strokes Gained putting is up.', 'Greens In Regulation is down.', 'He is behind the tour on greens.', 'His Scoring Average dropped.', 'He gains Off the Tee.']) expect(fails(bad), bad).toContain('wrong_case');
      for (const bad of ['I read get_player_stats for him.', 'From golf_rounds, he has ten rounds.']) expect(fails(bad), bad).toContain('names_internals');
    });

    it('fail a distance written as ft or yd, after a number or in a band, and pass it in words', () => {
      for (const bad of ['He has holed 9 of 14 from 5–10 ft.', 'He makes most from 3-5 ft.', 'From 25+ ft he three-putts often.', 'He leaves it 28ft on average.', 'From 125–175 yd he is close to the team.', 'He drives it 281 yd.', 'His proximity (ft) is down.']) expect(fails(bad), bad).toContain('abbreviation');
      for (const fine of ['He has holed 9 of 14 from 5 to 10 feet.', 'Inside 10 feet he is ahead of the team.', 'From 25 feet and out he three-putts often.', 'He leaves it 28 feet away on average from 125 to 175 yards, over 31 shots.', 'He drives it 281 yards.']) expect(fails(fine), fine).toEqual([]);
      const byId = (id: string) => questions.find((q) => q.id === id)!;
      const putting = 'Eli is missing most from 5 to 10 feet: he has holed 9 of 21 from there over his last 10 rounds. Inside 5 feet he has made 38 of 41.';
      for (const f of byId('write-putting-by-distance').facts) expect(f.re.test(putting), f.label).toBe(true);
      expect(byId('write-putting-by-distance').facts[0]!.re.test('He has holed 9 of 21 from 5–10 ft.')).toBe(false);
      const approach = 'From 100 to 150 yards Eli leaves it 31 feet from the hole on average, over 44 shots in his last 10 rounds. That is a little closer than the team from the same range.';
      for (const f of byId('write-approach-by-distance').facts) expect(f.re.test(approach), f.label).toBe(true);
      expect(fails(approach)).toEqual([]);
    });

    it('fail a sentence or a list line that starts lower-case, and pass decimals and names inside a sentence', () => {
      for (const bad of ['his putting is better over his last 10 rounds.', 'Eli putts well. he three-putts rarely.', 'Two things stand out:\n- approach play is behind the team\n- Putting is ahead', 'Is it early? yes, over 4 rounds.']) expect(fails(bad), bad).toContain('sentence_start_case');
      for (const fine of ['His scoring average is 74.2 over his last 10 rounds. That is 1.3 lower than the team.', 'Two things stand out:\n- Approach play is behind the team.\n- Putting is ahead.', 'It is early (4 rounds). Wait for more.']) expect(fails(fine), fine).not.toContain('sentence_start_case');
    });

    it('fail a proper noun not written as it is: pga tour, Pga, ncaa, division i', () => {
      for (const bad of ['That is close to the pga tour figure.', 'The Pga Tour figure is a reference.', 'The LPGA tour figure is a reference.', 'There is no ncaa average for it.', 'No figure is published for division ii.']) expect(fails(bad), bad).toContain('proper_noun_case');
      for (const fine of ['That is a PGA Tour figure from the standards, not this team\'s.', 'The LPGA Tour figure is a reference.', 'No figure is published for NCAA Division II.']) expect(fails(fine), fine).toEqual([]);
    });

    it('fail a player, course or event not capitalised as the team\'s records have it, once the harness gives the names', () => {
      const stored = { people: ['Eli Brandt', 'Will McAllister', 'Zoë van der Berg'], places: ['Pine Valley Invitational', 'TPC Sawgrass', 'The Honors Course'] };
      const withNames = golfSenseQuestions({}, stored);
      const proper = withNames[0]!.forbid.find((f) => f.pattern === 'proper_noun_case')!.re;
      for (const bad of ['eli brandt leads the team in strokes gained putting.', 'ELI BRANDT leads the team.', 'Over his last 10 rounds eli is ahead of the team.', 'Brandt and mcallister are level.', 'Will Mcallister shot his best round.', 'He played well at the pine valley invitational.', 'His best round was at Tpc Sawgrass.', 'At the honors course he was two under.', 'Zoë Van Der Berg leads.']) expect(proper.test(bad), bad).toBe(true);
      for (const fine of ['Eli Brandt leads the team in strokes gained putting.', 'Eli is ahead of the team, and McAllister is level with him.', 'He played well at the Pine Valley Invitational and at TPC Sawgrass.', 'At The Honors Course he was two under.', 'Zoë van der Berg leads.', 'He will play on Saturday.', 'Nobody will reach the line this week.', 'It was an elite round.', 'Belief matters less than the figures.']) expect(proper.test(fine), fine).toBe(false);
      // Every question carries the team's names once they are given, and the fixed names still apply.
      for (const q of withNames) expect(q.forbid.find((f) => f.pattern === 'proper_noun_case')!.re.source).toContain('[eE][lL][iI]');
      expect(proper.test('That is close to the pga tour figure.')).toBe(true);
      // Without names, only the fixed proper nouns are checked; with none given, no pattern is built.
      expect(properNounPattern({})).toBeNull();
      expect(guard('proper_noun_case').test('eli brandt leads.')).toBe(false);
      // A first name that is an everyday word is checked only inside the full name.
      expect(properNounPattern({ people: ['Will McAllister'] })!.test('will mcallister leads.')).toBe(true);
    });

    it('pass two or three plain sentences with the sample in words', () => {
      const good =
        'Eli is putting a little better than the team: his strokes gained putting over his last 10 rounds is ahead of the team average for the same rounds. Most of it comes from short range, where he has holed 38 of 41 from inside 5 feet. His three-putts are the place to look, and that is first-putt speed from long range.';
      expect(fails(good)).toEqual([]);
      expect(sentenceCount(good)).toBe(3);
      const writing = questions.filter((q) => q.area === 'writing');
      expect(writing.length).toBeGreaterThanOrEqual(4);
      for (const q of writing) expect(q.style?.max_sentences, q.id).toBeGreaterThan(0);
      const putting = writing.find((q) => q.id === 'write-how-is-he-putting')!;
      for (const f of putting.facts) expect(f.re.test(good), f.label).toBe(true);
      expect(sentenceCount(good)).toBeLessThanOrEqual(putting.style!.max_sentences);
      // The same content as a report fails on length and on form.
      const report = '## Putting\n- SG Putting: +0.3 (n=10)\n- 3-Putts: 1.2\n- Make Rate 3-5 ft: 93%\n\nSummary: Good.\nNext Steps: Lag Drills.';
      expect(fails(report)).toEqual(expect.arrayContaining(['sample_notation', 'heading_or_table', 'abbreviation']));
      expect(sentenceCount(report)).toBeGreaterThan(putting.style!.max_sentences);
    });

    it('fail a bold label at the start of a list item or a line, which is a heading in disguise', () => {
      // From the first live run: a yes/no question answered as eight bullets, each led by a bold label.
      for (const bad of ['- **Overall:** His strokes gained total is behind the team.', '- **Off the tee**: This is his biggest gap.', '**Putting:** He is level with the team.', '1. **Approach:** He is close to the team.', '• **Best rounds:** His low round is 70.']) expect(fails(bad), bad).toContain('heading_or_table');
      // A real list, a bold name and a plain label are not headings.
      for (const fine of ['Round counts per player:\n- Cole Bennett: 37\n- Jackson Hale: 17', '**Cole Bennett** leads the team in strokes gained putting over the last 10 rounds.', 'Off the tee is his biggest gap: he has hit 43% of fairways over his last 10 rounds.']) expect(fails(fine), fine).toEqual([]);
    });

    it('fail the notation the prompt bans: L10, a bare count in brackets and a hyphen for a minus sign', () => {
      for (const bad of ['His L10 scoring average is 74.2.', 'Over L5 he is down.']) expect(fails(bad), bad).toContain('abbreviation');
      for (const bad of ['His scoring average is 74.2 (10).', 'Cole Bennett (37) has the most rounds.']) expect(fails(bad), bad).toContain('sample_notation');
      for (const bad of ['He is at -0.31 a round against the Tour benchmark.', 'His last round was -2.', 'Approach (-3.60) is his biggest gap.']) expect(fails(bad), bad).toContain('ascii_minus');
      for (const fine of ['He is at −0.31 a round against the Tour benchmark over his last 9 rounds.', 'He makes 25-30% from that range, between 18 September and 21 October.', 'The rounds are dated 2026-05-18 to 2026-10-21.', 'Round counts:\n- Cole Bennett: 37', 'His last-10 window has 9 rounds with a figure.', 'In 2024 (his first season) he played 14 rounds.']) expect(fails(fine), fine).toEqual([]);
    });

    it('hold a yes/no question to the answer, three supporting points and one caveat or offer', () => {
      const yesNo = questions.filter((q) => /(?:^|[.!?]\s+)(?:Is|Are|Does|Do|Did|Can|Could|Should|Will|Would|Has|Have|Was|Were|Am)\b[^?]*\?\s*$/.test(q.ask));
      expect(yesNo.length).toBeGreaterThanOrEqual(25);
      for (const q of yesNo) expect(q.style?.max_sentences, q.id).toBe(6);
      const limit = questions.find((q) => q.id === 'sg-negative-is-normal')!.style!.max_sentences;
      // The live answer's shape: the answer, then a report.
      const report = [
        'No. A negative figure in every area is normal for a college player against the Tour benchmark, and it does not mean he is bad.',
        'What matters is how he compares with the team and with himself:',
        '- **Overall:** His strokes gained total is −7.31 against the Tour benchmark over 8 measured rounds. The team average is −5.82.',
        '- **Off the tee:** This is his biggest gap. He is at −1.15 against the team\u2019s +0.40.',
        '- **Approach:** He is at −3.60 against the team\u2019s −3.09, close to the team.',
        '- **Around the green:** He is at +0.51 against the team\u2019s −0.10, so he is ahead of the team here.',
        '- **Putting:** He is at −3.07 against the team\u2019s −3.03, so he is level with the team.',
        'So the strokes are going off the tee and on long approaches.',
      ].join('\n');
      expect(sentenceCount(report)).toBeGreaterThan(limit);
      expect(fails(report)).toEqual(['heading_or_table']);
      // The same answer, said: the answer first, three points, one offer.
      const said =
        'No. A negative figure in every area is normal for a college player against the Tour benchmark, and it does not mean he is bad. His biggest gap to the team is off the tee, at −1.15 against the team\u2019s +0.40 over his last 10 rounds. Around the green he is ahead of the team, and his putting is level with it. I can set up a focus area on driving for him if you want.';
      expect(sentenceCount(said)).toBeLessThanOrEqual(limit);
      expect(fails(said)).toEqual([]);
    });

    it('do not trip on the words the golf block itself uses to explain the game', () => {
      // A careful answer may use these: "Tour", "Division I", "a tour" in general, a player's name at the start of a line.
      for (const fine of ['Zero is Tour level, so a negative figure is normal for a college player.', 'There is no published figure for Division II.', 'Owen Carter leads the team in strokes gained putting over the last 10 rounds.', 'I cannot name a tour here; the figures are against the Tour benchmark.']) expect(fails(fine), fine).toEqual([]);
    });
  });
});
