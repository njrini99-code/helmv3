import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SG_BASELINE_OPTIONS, defaultSgBaseline } from '@/lib/golf/sg-benchmarks';
import { COUNTABLE_HOLE_COUNTS, isCountableRound, roundExclusionReason } from '@/lib/golf/round-countable';
import { isScoreCountable, isTotalOnlyCountable } from '@/lib/golf/round-score-countable';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import { boardOrder, compareStandings } from '@/lib/coachhelm/v3/qualifying/ranking';
import { STATS_WINDOWS } from '../../screen-loaders';
import { parseChecks } from '../data-map-build';
import { APP_DEFINITIONS, golfBlock } from '../golf';

/**
 * Every statement in the golf block about how THIS app defines something, checked against the code that defines it.
 * `SOURCES.md` beside the block lists the same statements with file and line. Where the definition lives in a pure
 * library module it is imported and exercised; where it lives in a Clubhouse loader (which `src/lib` may not import) or
 * in SQL, the defining line is read from the file, so a change there fails here and the prompt is re-read by a person.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const block = golfBlock('ask');
const says = (sentence: string) => expect(block).toContain(sentence);

const round = { status: 'completed', is_test: false, holes_played: 18, total_score: 74, front_nine: 37, back_nine: 37, total_putts: 31 };

describe('the app definitions the golf block states', () => {
  it('strokes gained is measured against Tour level, matched to the team: two baselines, by gender', () => {
    says(APP_DEFINITIONS.sgBaseline);
    expect(SG_BASELINE_OPTIONS.map((o) => o.key)).toEqual(['pga_tour', 'womens']);
    expect(defaultSgBaseline('mens')).toBe('pga_tour');
    expect(defaultSgBaseline('womens')).toBe('womens');
    const checks = parseChecks(read('supabase/schemas/golf/10_tables.sql'));
    expect(checks['golf_team_settings.sg_baseline']).toEqual(['pga_tour', 'womens']);
    // The database picks the scale from the team's gender when no baseline is set.
    expect(read('supabase/schemas/functions/public.sql')).toMatch(/sg_baseline_scale\(COALESCE\(v_baseline, CASE WHEN v_gender = 'womens' THEN 'womens' ELSE 'pga_tour' END\)\)/);
    // The Stats page draws no Tour figure beside strokes gained: zero is Tour level.
    expect(read('src/clubhouse/data/stats-player.ts')).toMatch(/Strokes gained against the Tour \(its benchmark is zero by definition\)/);
  });

  it('strokes gained is worked out from shots when there are any, and estimated from the scorecard when there are none', () => {
    says('with shots logged, a round\'s strokes gained is worked out shot by shot. With holes scored but no shots logged, it is a rough estimate from the scorecard.');
    const sql = read('supabase/schemas/functions/public.sql');
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION "public"."recalculate_round_strokes_gained"'));
    const body = fn.slice(0, fn.indexOf('ALTER FUNCTION "public"."recalculate_round_strokes_gained"'));
    expect(body).toMatch(/IF v_shot_count > 0 THEN/);
    expect(body).toMatch(/ELSE\s+SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting\s+INTO[^;]+FROM sg_estimate_from_holes\(p_round_id\);/);
    // The four areas, and the total as their sum.
    expect(body).toMatch(/WHEN shot_type='putting' THEN 'putting'\s+WHEN shot_type='tee' THEN 'off_tee'\s+WHEN shot_type='around_green' THEN 'around_green'\s+ELSE 'approach'/);
    expect(body).toMatch(/v_sg_total := ROUND\(\(COALESCE\(v_sg_off_tee,0\)\+COALESCE\(v_sg_approach,0\)\+COALESCE\(v_sg_around,0\)\+COALESCE\(v_sg_putting,0\)\)/);
  });

  it('a tee shot on a par 3 is logged as an approach shot', () => {
    says('- Approach: shots into the green, including the tee shot on a par 3.');
    expect(read('src/hooks/golf/use-shot-state-machine.ts')).toMatch(/currentLie === 'tee'\) return currentHole\?\.par === 3 \? 'approach' : 'tee'/);
  });

  it('a strokes gained figure needs three rounds that have one', () => {
    says(APP_DEFINITIONS.sgFloor);
    expect(read('src/clubhouse/data/season.ts')).toMatch(/export const MIN_SG_ROUNDS = 3;/);
    expect(read('src/clubhouse/data/stats-weight.ts')).toMatch(/effective >= MIN_SG_ROUNDS \? weightedMean\(list, \(r\) => r\.strokes_gained_total\) : null/);
  });

  it('a counted round is finished, 9 or 18 holes, fully scored, plausible and not a test round', () => {
    says(APP_DEFINITIONS.countedRound);
    expect([...COUNTABLE_HOLE_COUNTS]).toEqual([9, 18]);
    expect(isCountableRound(round)).toBe(true);
    expect(roundExclusionReason({ ...round, status: 'in_progress' })).toBe('not_completed');
    expect(roundExclusionReason({ ...round, is_test: true })).toBe('test_round');
    expect(roundExclusionReason({ ...round, holes_played: 12 })).toBe('unsupported_length');
    expect(roundExclusionReason({ ...round, back_nine: null })).toBe('holes_missing');
    expect(roundExclusionReason({ ...round, total_score: 37, front_nine: 18, back_nine: 19, total_putts: 18 })).toBe('implausible_score');
  });

  it('a round posted as a total only counts in scores and in nothing hole-level', () => {
    says(APP_DEFINITIONS.totalOnly);
    const totalOnly = { ...round, front_nine: null, back_nine: null, total_putts: null };
    expect(isCountableRound(totalOnly)).toBe(false);
    expect(isTotalOnlyCountable(totalOnly)).toBe(true);
    expect(isScoreCountable(totalOnly)).toBe(true);
    // Only an 18-hole total: a nine-hole total has no holes to tell it from half a round.
    expect(isTotalOnlyCountable({ ...totalOnly, holes_played: 9 })).toBe(false);
    expect(read('src/clubhouse/data/round-scope.ts')).toMatch(/never in a HOLE-level one \(birdies, pars, doubles, greens, fairways, putts, scrambling, strokes gained/);
  });

  it('Stats and Roster figures leave practice out and read 18-hole rounds', () => {
    says(APP_DEFINITIONS.practiceOut);
    expect(read('src/clubhouse/data/season.ts')).toMatch(/return r\.round_type == null \|\| roundTypeFromDb\(r\.round_type\) !== 'practice';/);
    expect(read('src/clubhouse/data/stats-common.ts')).toMatch(/return f\.types\.length === 0 && f\.pick\?\.mode !== 'only' && f\.span !== 'all';/);
    expect(read('src/clubhouse/data/stats-filter.ts')).toMatch(/return \{ window, last, types: \[\], holes: '18',/);
    expect(read('src/clubhouse/data/figure-window.ts')).toMatch(/countsForScoring\(r\) && isScoreCountable\(/);
  });

  it('the round kinds are practice, qualifier and tournament', () => {
    says(APP_DEFINITIONS.roundKinds);
    for (const kind of ['practice', 'qualifier', 'tournament']) expect(roundTypeFromDb(kind)).toBe(kind);
    expect(roundTypeFromDb('qualifying')).toBe('qualifier');
  });

  it('the windows are the last 5, 10 and 20 counted rounds, whenever played, and this season from 1 August on the team\'s calendar', () => {
    says(APP_DEFINITIONS.windows);
    says(APP_DEFINITIONS.season);
    expect([...STATS_WINDOWS]).toEqual(['last5', 'last10', 'last20', 'season']);
    const filter = read('src/clubhouse/data/stats-filter.ts');
    expect(filter).toMatch(/export const LAST_CHOICES = \[5, 10, 20\] as const;/);
    // Last N is not bounded by the season; the season and qualifier windows are.
    expect(filter).toMatch(/if \(isAllTime\(f\) \|\| f\.window === 'last10'\) return true;\s+if \(row\.date < seasonStart\) return false;/);
    expect(filter).toMatch(/return cutsToLastN\(f\) \? list\.slice\(0, f\.last\) : list;/);
    const season = read('src/clubhouse/data/season.ts');
    expect(season).toMatch(/return `\$\{month >= 8 \? year : year - 1\}-08-01`;/);
    expect(season).toMatch(/new Intl\.DateTimeFormat\('en-US', \{ timeZone: tz, year: 'numeric', month: 'numeric' \}\)/);
  });

  it('team figures pool every player\'s own window; team strokes gained counts only players with enough rounds', () => {
    says('For the team, a last-10 window is every player\'s own last 10, pooled.');
    says('Team averages pool the rounds, so a player with more rounds in the window weighs more.');
    says('Team strokes gained counts only players with enough rounds that have it.');
    const team = read('src/clubhouse/data/stats-team.ts');
    expect(team).toMatch(/const cur = roundsInFilter\(list, f, start\);\s+windowRounds\.push\(\.\.\.cur\);/);
    expect(team).toMatch(/const scoring = weightedMean\(windowRounds, \(r\) => r\.total_score\);/);
    expect(team).toMatch(/effectiveCount\(rs\.filter\(\(r\) => r\.player_id === p\.id\), sgOf\) >= MIN_SG_ROUNDS/);
    expect(read('src/clubhouse/data/stats-common.ts')).toMatch(/return t > 0 \? \(m \/ t\) \* 100 : null;/);
  });

  it('a qualifier ranks by to par, then strokes, then more rounds played, with a short card below every complete one', () => {
    says(APP_DEFINITIONS.qualifierOrder);
    says(APP_DEFINITIONS.qualifierShort);
    const key = (toPar: number, total: number, played: number, name = 'A') => ({ toPar, total, played, name });
    expect(compareStandings(key(-1, 143, 2), key(0, 144, 2))).toBeLessThan(0);
    expect(compareStandings(key(0, 143, 2), key(0, 144, 2))).toBeLessThan(0);
    expect(compareStandings(key(0, 144, 3), key(0, 144, 2))).toBeLessThan(0);
    const cards = [key(-3, 69, 1, 'short'), key(2, 146, 2, 'full')];
    const order = boardOrder(cards);
    expect([...cards].sort(order.compare).map((c) => c.name)).toEqual(['full', 'short']);
    const model = read('src/clubhouse/screens/qualifiers/model.ts');
    expect(model).toMatch(/const topScore = Math\.max\(0, squad - Math\.max\(0, input\.picks\)\);/);
    expect(model).toMatch(/const confirmed = input\.selectionState === 'selected' && input\.selections/);
  });

  it('the pressure gap is competitive rounds less practice rounds, to par, so positive is worse under pressure', () => {
    says(APP_DEFINITIONS.pressureGap);
    const figures = read('src/clubhouse/data/stats-figures.ts');
    expect(figures).toMatch(/\(roundTypeFromDb\(r\.round_type\) === 'practice' \? prac : press\)\.push\(r\);/);
    expect(figures).toMatch(/\(weightedMean\(press, toPar\) as number\) - \(weightedMean\(prac, toPar\) as number\)/);
  });

  it('the Roster form words are the four the block lists', () => {
    says(APP_DEFINITIONS.form);
    expect(read('src/clubhouse/data/season.ts')).toMatch(/export type ChForm = 'improving' \| 'steady' \| 'slipping' \| 'early';/);
  });

  it('the Tour beside a figure is the team\'s own tour, and no college division average has passed the source check', () => {
    says('Read it with get_reference (topic standards), which uses the right tour for this team.');
    says('No published average for a college division is in the app');
    expect(read('src/clubhouse/data/stats-common.ts')).toMatch(/return gender === 'womens' \|\| gender === 'women' \|\| gender === 'female' \? 'lpga' : 'pga';/);
    expect(read('src/lib/coachhelm/v3/chat/benchmark-reads.ts')).toMatch(/export const SOURCED_LEVEL_FIGURES: Record<string, Partial<Record<TableLevel, LevelFigureSource>>> = \{\};/);
  });

  it('toughest holes are grouped by hole number, whatever the course', () => {
    says('Toughest holes here are grouped by hole number across whatever courses were played');
    expect(read('src/clubhouse/data/stats-figures.ts')).toMatch(/grouped by hole number as production does \(each play keeps its own\s+\* par: a hole number is a different hole at each course\)/);
  });
});
