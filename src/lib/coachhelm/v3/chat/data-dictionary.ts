import { TEAM_QUERY_TABLES, type TeamQueryTable } from './team-query-allowlist';

/**
 * The data dictionary behind `query_team_data`: what every column it can read means, in which unit, which way is good, and when it is empty.
 *
 * Built from `database.ts` (names and types), the migrations that write each column (the SQL that fills the stats caches, the CHECK
 * constraints that fix the value lists) and the code that reads them. Where those do not show a unit or a meaning, the entry says `unknown` or
 * states what is not known: it never fills a gap with a guess. `UNKNOWN_ENTRIES` lists those so the owner can settle them.
 *
 * It is typed against the allowlist: a column added to `team-query-allowlist.ts` without an entry here does not compile, and
 * `__tests__/data-dictionary.test.ts` checks the same at run time.
 */

/**
 * - `strokes`   a count of strokes (a score, a gain): `to_par` is the same count against par.
 * - `percent`   0 to 100, not 0 to 1.
 * - `percentile` 0 to 100: the share of a group the player is ahead of.
 * - `by_metric` the unit of the metric the row is about (`metric_id`, `target_metric`): percent for GIR, feet for proximity, strokes for strokes gained.
 * - `rating`    a course rating or slope (USGA): not strokes of play.
 * - `unknown`   the code does not show it.
 */
export type Unit = 'count' | 'strokes' | 'to_par' | 'percent' | 'percentile' | 'feet' | 'yards' | 'days' | 'date' | 'time' | 'text' | 'code' | 'flag' | 'id' | 'rating' | 'by_metric' | 'unknown';

export interface ColumnNote {
  unit: Unit;
  /** What the column is, in the words a coach uses. */
  means: string;
  /** Which way is good, or what a sign says. */
  sign?: string;
  /** When the column is empty, and what an empty value does and does not mean. */
  null_when?: string;
  /** The values it can hold, where the schema or the code fixes them. */
  values?: string;
}

const c = (unit: Unit, means: string, extra: Omit<ColumnNote, 'unit' | 'means'> = {}): ColumnNote => ({ unit, means, ...extra });

const ID = c('id', 'An internal id; never shown to a coach.');
const SG_SIGN = 'Positive gains strokes on the baseline; negative loses strokes to it. Zero is Tour level, so a negative figure is normal for a college player.';
// Tour level only since 2026-06-22 (src/lib/golf/sg-benchmarks.ts): the men’s Tour curve for a men’s team, the same curve scaled for a women’s team. No division or scratch baseline exists.
const SG_BASELINE = 'strokes gained against Tour level for the team (the men’s Tour baseline for a men’s team, the women’s baseline for a women’s team)';
const NO_DETAIL = 'the round has no hole-by-hole detail (a total-only round), or it is not finished';
const SG_NULL = 'the round has no hole or shot detail to compute it from (a total-only round) or is not finished';
const WRITTEN_BY_CACHE = 'Recomputed from the player’s completed rounds.';
/** The cache as it works in production today. The countable-round rule (migration 20260924120000, owner decision OD-01) is written but pending owner apply, so none of its filtering is live. */
const CACHE_TODAY = 'Today the cache counts every completed round; the countable-round rule that would leave out an implausible one is pending owner apply.';

type ColumnsOf<T extends TeamQueryTable> = (typeof TEAM_QUERY_TABLES)[T]['columns'][number];
type TableDictionary = { [T in TeamQueryTable]: { [C in ColumnsOf<T>]: ColumnNote } };

export const DATA_DICTIONARY = {
  golf_rounds: {
    id: ID,
    round_date: c('date', 'The calendar day the round was played (not a time of day). A player can have several rounds on one day.'),
    round_type: c('code', 'What kind of round: a practice round, a qualifier round or a tournament round.', { values: 'practice, qualifier, tournament (an older spelling, "qualifying", also exists)' }),
    status: c('code', 'Whether the round is finished. Only a completed round has a stat line and counts toward any average.', { null_when: 'rarely; an unfinished round says so here', values: 'completed once finished; an unfinished round has another value' }),
    holes_played: c('count', 'Holes the round covers: 9 or 18. An empty value is read as 18.', { null_when: 'not recorded (read as 18)' }),
    course_name: c('text', 'The course, as typed or picked when the round was started.'),
    total_score: c('strokes', 'Gross strokes for the round. Compare 18-hole rounds with 18-hole rounds; a 9-hole total is about half.', { null_when: 'the round is not finished', sign: 'Lower is better.' }),
    score_to_par: c('to_par', 'Strokes over par (positive) or under par (negative) for the holes played.', { sign: 'Negative is under par and better; positive is over par.', null_when: 'the round is not finished' }),
    total_putts: c('count', 'Putts in the round.', { null_when: 'putts were not recorded, as on a total-only round' }),
    total_gir: c('count', 'Greens hit in regulation.', { null_when: NO_DETAIL }),
    total_gir_possible: c('count', 'Greens that could have been hit: the holes with a score.', { null_when: NO_DETAIL }),
    total_fairways_hit: c('count', 'Fairways hit off the tee. Par 3s are not counted.', { null_when: NO_DETAIL }),
    total_fairways: c('count', 'Fairways in play: holes of par 4 and 5 with a tee result recorded.', { null_when: NO_DETAIL }),
    total_penalties: c('count', 'Penalty strokes in the round.', { null_when: NO_DETAIL }),
    front_nine: c('strokes', 'Strokes on holes 1 to 9.', { null_when: 'a total-only round has no nines; a 9-hole round has no back nine' }),
    back_nine: c('strokes', 'Strokes on holes 10 to 18.', { null_when: 'a total-only round has no nines; a 9-hole round has no back nine' }),
    strokes_gained_total: c('strokes', `Total ${SG_BASELINE}, for this round.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_tee: c('strokes', `Off the tee: ${SG_BASELINE}, for this round.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_approach: c('strokes', `Approach shots: ${SG_BASELINE}, for this round.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_around_green: c('strokes', `Around the green: ${SG_BASELINE}, for this round.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_putting: c('strokes', `Putting: ${SG_BASELINE}, for this round.`, { sign: SG_SIGN, null_when: SG_NULL }),
    qualifier_id: ID,
    qualifier_round_number: c('count', 'Which round of the qualifier this is (1 is the first).', { null_when: 'the round is not a qualifier round' }),
    tees_played: c('text', 'The tees played, as typed.'),
    course_rating: c('rating', 'The USGA course rating of the tees played. A rating, not strokes the player took.', { null_when: 'no course was picked' }),
    course_slope: c('rating', 'The USGA slope rating of the tees played (55 to 155 on a real card).', { null_when: 'no course was picked' }),
    weather_conditions: c('text', 'A weather description, as entered. Its format is not fixed.', { null_when: 'not entered' }),
  },
  golf_round_stats_cache: {
    round_id: ID,
    total_score: c('strokes', 'Gross strokes (the round’s total, from the holes when both nines exist).', { sign: 'Lower is better.' }),
    score_to_par: c('to_par', 'Strokes over (+) or under (-) par.', { sign: 'Negative is under par and better.' }),
    front_nine: c('strokes', 'Strokes on holes 1 to 9 (summed from the holes when the round does not state it).'),
    back_nine: c('strokes', 'Strokes on holes 10 to 18.'),
    total_putts: c('count', 'Putts in the round.'),
    one_putts: c('count', 'Holes holed with exactly one putt.'),
    three_putts: c('count', 'Holes with three or more putts (the column is named for three; it counts three or more).', { sign: 'Fewer is better.', null_when: 'It reads 0 for a round whose holes have no putts entered. That is not recorded, not no three-putts: look at total_putts, which is 0 or empty then.' }),
    greens_hit: c('count', 'Greens hit in regulation.'),
    greens_total: c('count', 'Holes with a score, the most greens that could have been hit.'),
    fairways_hit: c('count', 'Fairways hit.'),
    fairways_total: c('count', 'Par 4 and 5 holes with a tee result.'),
    penalty_strokes: c('count', 'Penalty strokes.'),
    eagles: c('count', 'Holes scored two under par or better.'),
    birdies: c('count', 'Holes scored one under par.'),
    pars: c('count', 'Holes scored at par.'),
    bogeys: c('count', 'Holes scored one over par.'),
    double_bogeys: c('count', 'Holes scored two over par.'),
    triple_plus: c('count', 'Holes scored three or more over par.'),
    scramble_attempts: c('count', 'Holes where the green was missed in regulation.'),
    scrambles_converted: c('count', 'Of those, the holes still saved for par or better.'),
    sand_attempts: c('count', 'Bunker shots played from a greenside bunker.'),
    sand_saves: c('count', 'Of those, the holes saved for par or better.'),
    driving_distance_avg: c('yards', 'Average tee-shot distance on par 4 and 5 holes in the round (shot distances are stored in yards).', { null_when: 'no tee shots were tracked for the round' }),
    strokes_gained_total: c('strokes', `Total ${SG_BASELINE}.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_tee: c('strokes', `Off the tee: ${SG_BASELINE}.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_approach: c('strokes', `Approach: ${SG_BASELINE}.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_around_green: c('strokes', `Around the green: ${SG_BASELINE}.`, { sign: SG_SIGN, null_when: SG_NULL }),
    strokes_gained_putting: c('strokes', `Putting: ${SG_BASELINE}.`, { sign: SG_SIGN, null_when: SG_NULL }),
    updated_at: c('time', 'When this row was last recomputed. It is NOT the day the round was played: do not order or filter rounds by it; use golf_rounds.round_date or the round_lines source.'),
  },
  golf_player_stats_cache: {
    rounds_played: c('count', `Completed rounds that have a stat line, every one of them: a total-only round and an implausible one (a 37-stroke 18-hole round) count too. ${CACHE_TODAY}`),
    rounds_this_season: c('count', 'The same count of stat-line rounds since 1 August (the season start the cache uses).'),
    scoring_average: c('strokes', `Average gross score over completed 18-hole rounds that have a total. Practice rounds are included (no round-type filter) and so is an implausible round. ${CACHE_TODAY}`, { sign: 'Lower is better.', null_when: 'no 18-hole round yet' }),
    scoring_average_vs_par: c('to_par', `Average strokes over par per completed 18-hole round. ${CACHE_TODAY}`, { sign: 'Negative is under par and better.' }),
    last_5_average: c('strokes', 'Average score of the last five completed 18-hole rounds (by date, practice included).', { sign: 'Lower is better.', null_when: 'fewer than five rounds' }),
    last_10_average: c('strokes', 'Average score of the last ten completed 18-hole rounds (by date, practice included).', { sign: 'Lower is better.', null_when: 'fewer than ten rounds' }),
    best_round: c('strokes', `Lowest score of any completed round, scaled to 18 holes (a 9-hole score is doubled). An implausible round can sit here. ${CACHE_TODAY}`, { sign: 'Lower is better.' }),
    worst_round: c('strokes', `Highest score of any completed round, scaled to 18 holes (a 9-hole score is doubled). ${CACHE_TODAY}`),
    par3_average: c('strokes', 'Average strokes on a par 3 hole (about 3, not a to-par figure).'),
    par4_average: c('strokes', 'Average strokes on a par 4 hole (about 4, not a to-par figure).'),
    par5_average: c('strokes', 'Average strokes on a par 5 hole (about 5, not a to-par figure).'),
    gir_percentage: c('percent', 'Greens hit in regulation over greens possible, 0 to 100.', { sign: 'Higher is better.' }),
    driving_accuracy_percentage: c('percent', 'Fairways hit over fairways in play, 0 to 100.', { sign: 'Higher is better.' }),
    driving_distance_average: c('yards', 'Average tee-shot distance in yards on par 4 and 5 holes, completed rounds.', { null_when: 'no tee shots tracked' }),
    putts_per_round: c('count', `Putts on stat-line rounds, divided by the holes of every completed round and multiplied by 18. A completed round with no stat line adds holes and no putts, so it can read low. ${CACHE_TODAY}`, { sign: 'Lower is better.' }),
    putts_per_gir: c('count', 'Putts on holes where the green was hit in regulation. Whether this is per green or per round is not shown in the code read.', { sign: 'Lower is better.', null_when: 'unknown' }),
    one_putt_percentage: c('percent', `One-putt holes over the holes of every completed round, 0 to 100 (the same denominator as putts per round). ${CACHE_TODAY}`, { sign: 'Higher is better.' }),
    three_putt_percentage: c('percent', `Holes with three or more putts over the holes of every completed round, 0 to 100 (the same denominator as putts per round). ${CACHE_TODAY}`, { sign: 'Lower is better.' }),
    scrambling_percentage: c('percent', 'Share of missed greens still saved for par or better, 0 to 100.', { sign: 'Higher is better.' }),
    sand_save_percentage: c('percent', 'Share of greenside bunker holes saved for par or better, 0 to 100.', { sign: 'Higher is better.' }),
    penalty_strokes_per_round: c('count', `Penalty strokes on stat-line rounds over the holes of every completed round, times 18. ${CACHE_TODAY}`, { sign: 'Lower is better.' }),
    sg_total_per_round: c('strokes', `Total ${SG_BASELINE}, per round.`, { sign: SG_SIGN }),
    sg_tee_per_round: c('strokes', `Off the tee: ${SG_BASELINE}, per round.`, { sign: SG_SIGN }),
    sg_approach_per_round: c('strokes', `Approach: ${SG_BASELINE}, per round.`, { sign: SG_SIGN }),
    sg_around_green_per_round: c('strokes', `Around the green: ${SG_BASELINE}, per round.`, { sign: SG_SIGN }),
    sg_putting_per_round: c('strokes', `Putting: ${SG_BASELINE}, per round.`, { sign: SG_SIGN }),
    putt_make_pct_0_3ft: c('percent', 'Share of putts holed from 0 to 3 feet, 0 to 100 (putt distances are stored in feet).', { sign: 'Higher is better.', null_when: 'no putts tracked in the band' }),
    putt_make_pct_3_5ft: c('percent', 'Share of putts holed from 3 to 5 feet, 0 to 100.', { sign: 'Higher is better.', null_when: 'no putts tracked in the band' }),
    putt_make_pct_5_10ft: c('percent', 'Share of putts holed from 5 to 10 feet, 0 to 100.', { sign: 'Higher is better.', null_when: 'no putts tracked in the band' }),
    putt_make_pct_10_15ft: c('percent', 'Share of putts holed from 10 to 15 feet, 0 to 100.', { sign: 'Higher is better.', null_when: 'no putts tracked in the band' }),
    putt_make_pct_15_25ft: c('percent', 'Share of putts holed from 15 to 25 feet, 0 to 100.', { sign: 'Higher is better.', null_when: 'no putts tracked in the band' }),
    putt_make_pct_25_plus_ft: c('percent', 'Share of putts holed from 25 feet and out, 0 to 100.', { sign: 'Higher is better.', null_when: 'no putts tracked in the band' }),
    approach_proximity_average: c('feet', 'Average finish distance from the hole of approach shots that found the green, in feet; a holed approach counts 0 and a miss off the green is not counted.', { sign: 'Lower is better.', null_when: 'no on-green approaches tracked' }),
    trend_direction: c('code', 'Whether scoring is moving: improving, stable or declining, from the last five rounds against the five before.', { values: 'improving, stable, declining (stable when there are too few rounds)' }),
    improvement_trend: c('strokes', 'The five completed 18-hole rounds before the last five, average score minus the last five’s average score.', { sign: 'Positive means the last five were lower (better); negative means they were higher (worse).', null_when: 'fewer than ten rounds' }),
    first_round_date: c('date', 'Date of the earliest completed round.'),
    last_round_date: c('date', 'Date of the latest completed round.'),
    updated_at: c('time', `When the cache was last recomputed. ${WRITTEN_BY_CACHE}`),
  },
  golf_player_standing: {
    metric_id: c('code', 'The metric this row ranks (the benchmark metric names, such as gir_pct or sg_putting).'),
    player_value: c('by_metric', 'The player’s own figure on that metric, over all recorded rounds, refreshed nightly.'),
    level_avg: c('by_metric', 'The average of the college players of the same gender on Helm on that metric. It is not the Division I, II or III published average.', { null_when: 'no player at the level has the metric yet' }),
    level_n: c('count', 'How many players that average is over.'),
    level_pct: c('percentile', 'The share of those players this player is ahead of, 0 to 100, over all recorded rounds. Direction is already applied: higher is better on every metric.', { null_when: 'no level group yet' }),
    team_avg: c('by_metric', 'The average of the team’s players’ lifetime figures on that metric (over all recorded rounds, not a window).', { null_when: 'fewer than three teammates have it today (the floor of five is written and pending owner apply)' }),
    team_n: c('count', 'How many teammates the team average is over.'),
    team_pct: c('percentile', 'The share of the team this player is ahead of, 0 to 100, over all recorded rounds. Higher is better on every metric.', { null_when: 'fewer than three teammates have it today (the floor of five is written and pending owner apply)' }),
    basis: c('code', 'How a shot-based metric was measured (approach proximity only): on_green means only shots that found the green, all_shot means every approach.', { values: 'on_green, all_shot', null_when: 'the metric has no basis' }),
    computed_at: c('time', 'When this standing was computed.'),
  },
  golf_goals: {
    id: ID,
    title: c('text', 'The goal, as worded when it was set.'),
    category: c('code', 'The part of the game the goal is about. The value list is not fixed in the schema.'),
    metric_id: c('code', 'The metric the goal tracks; baseline, current and target are in that metric’s unit.'),
    state: c('code', 'Where the goal stands.', { values: 'active, paused, achieved, missed, partial, abandoned, pending_baseline' }),
    origin: c('code', 'Who proposed it: the coach or player typed it, the engine suggested it, or it came from an insight. Internal; not for a coach to read.', { values: 'manual, engine_suggested, from_insight' }),
    baseline_value: c('by_metric', 'The figure when the goal started.', { null_when: 'state is pending_baseline' }),
    current_value: c('by_metric', 'The latest figure on the metric.', { null_when: 'not measured yet' }),
    target_value: c('by_metric', 'The figure the goal aims for.'),
    started_at: c('time', 'When the goal started.'),
    ends_at: c('time', 'When the goal’s window closes.'),
    window_days: c('days', 'Length of the goal’s window: the days between started_at and ends_at, 7 to 365.'),
    target_source: c('code', 'How the target was chosen.', { values: 'manual, team_avg, pga_value, midpoint', null_when: 'not recorded' }),
    outcome_evaluated_at: c('time', 'When the outcome (achieved, missed, partial) was decided.', { null_when: 'the goal is still open' }),
  },
  golf_player_focus_areas: {
    id: ID,
    title: c('text', 'The focus area, as worded.'),
    area_type: c('code', 'The kind of focus area. The value list is not fixed in the schema.'),
    status: c('code', 'Whether the focus area is open, done or dropped. The value list is not fixed in the schema.'),
    priority: c('unknown', 'A priority rank. The scale and which end is first are not shown in the code read.'),
    target_metric: c('code', 'The metric the focus area is measured on; its values are in that metric’s unit.', { null_when: 'the focus area has no metric target' }),
    target_kind: c('code', 'Whether the focus area ends on a date or after a number of rounds.', { values: 'date, rounds' }),
    target_value: c('by_metric', 'The figure aimed for.'),
    current_value: c('by_metric', 'The latest figure on the metric.'),
    baseline_value: c('by_metric', 'The figure when the focus area started.'),
    target_date: c('date', 'When a date-kind focus area ends.', { null_when: 'target_kind is rounds' }),
    target_rounds: c('count', 'Rounds a rounds-kind focus area runs for.', { null_when: 'target_kind is date' }),
    check_after_rounds: c('count', 'Rounds to play before the focus area is checked.'),
    started_at: c('time', 'When work on it started.'),
    completed_at: c('time', 'When it was closed.', { null_when: 'still open' }),
    outcome_status: c('code', 'How it ended. The value list is not fixed in the schema.', { null_when: 'still open' }),
    created_at: c('time', 'When the row was created.'),
    updated_at: c('time', 'When the row was last changed. A bookkeeping time, not a date of practice or play.'),
  },
  golf_focus_area_practice_sessions: {
    id: ID,
    focus_area_id: ID,
    practiced_at: c('time', 'When the practice was done.'),
    reps: c('count', 'Repetitions logged.', { null_when: 'reps were not counted' }),
    logged_by_role: c('code', 'Whether a coach or the player logged it.', { values: 'player, coach' }),
  },
  golf_focus_area_criteria: {
    id: ID,
    focus_area_id: ID,
    label: c('text', 'The criterion, as worded.'),
    met: c('flag', 'Whether the criterion has been met.'),
    met_at: c('time', 'When it was met.', { null_when: 'not met yet' }),
    source: c('code', 'What marked it met: a coach, or the engine from a measurement.', { values: 'coach, engine' }),
  },
  golf_qualifiers: {
    id: ID,
    name: c('text', 'The qualifier’s name.'),
    course_name: c('text', 'The course.'),
    start_date: c('date', 'First day.'),
    end_date: c('date', 'Last day.', { null_when: 'a one-day qualifier may leave it empty' }),
    entry_deadline: c('date', 'Last day to enter.'),
    status: c('code', 'Where the qualifier is in its life. The value list is not fixed in the schema.'),
    num_rounds: c('count', 'Rounds the qualifier is played over.'),
    spots_available: c('count', 'Places in the lineup the qualifier decides.', { null_when: 'not stated' }),
    selection_state: c('code', 'Where the lineup selection is.', { values: 'open, scoring, closed, selected' }),
    selection_slots_total: c('count', 'Lineup places in total.'),
    selection_slots_coach_pick: c('count', 'Of those, the places the coach picks rather than the scores deciding.'),
    target_tournament_id: ID,
  },
  golf_qualifier_entries: {
    qualifier_id: ID,
    round_id: ID,
    position: c('count', 'Finishing place in the qualifier, 1 first.', { sign: 'Lower is better.', null_when: 'not scored yet' }),
    is_tied: c('flag', 'Whether the place is shared.'),
    rounds_completed: c('count', 'Qualifier rounds the player has finished.'),
    score: c('strokes', 'A score for the entry. How it differs from total_score is not documented in the code read.'),
    total_score: c('strokes', 'Total strokes over the qualifier’s rounds.', { sign: 'Lower is better.' }),
    total_to_par: c('to_par', 'Total strokes over or under par.', { sign: 'Negative is under par and better.' }),
    status: c('code', 'The entry’s state. The value list is not fixed in the schema.'),
  },
  golf_qualifier_selections: {
    qualifier_id: ID,
    selection_type: c('code', 'How the player got the place.', { values: 'top_score, coach_pick' }),
    selected_at: c('time', 'When the player was selected.'),
  },
  golf_events: {
    id: ID,
    title: c('text', 'The event’s name.'),
    event_type: c('code', 'The kind of event (practice, qualifier and so on). The value list is not fixed in the schema.'),
    start_time: c('time', 'When the event starts, stored in UTC; show it in the team’s time zone.'),
    end_time: c('time', 'When it ends, stored in UTC.', { null_when: 'no end time was set' }),
    all_day: c('flag', 'Whether it runs all day.'),
    location: c('text', 'Where it is.', { null_when: 'not set' }),
    status: c('code', 'The event’s state. The value list is not fixed in the schema.'),
    requires_rsvp: c('flag', 'Whether players are asked to reply.'),
    rsvp_deadline: c('time', 'The last time to reply.', { null_when: 'no deadline' }),
    recurring: c('flag', 'Whether it repeats.'),
    parent_event_id: ID,
    max_attendees: c('count', 'A cap on attendees.', { null_when: 'no cap' }),
    cancelled_at: c('time', 'When it was cancelled.', { null_when: 'the event was not cancelled' }),
  },
  golf_event_attendance: {
    id: ID,
    event_id: ID,
    status: c('code', 'The player’s reply to the event.', { values: 'pending, accepted, declined, tentative, attending, not_attending, maybe, excused, unexcused' }),
    attendance_status: c('code', 'What happened on the day.', { values: 'present, late, no_show', null_when: 'not marked' }),
    checked_in: c('flag', 'Whether the player checked in.'),
    checked_in_at: c('time', 'When they checked in.', { null_when: 'no check-in' }),
    rsvp_at: c('time', 'When they replied.', { null_when: 'no reply' }),
  },
  golf_team_seasons: {
    season: c('text', 'The season, such as 2026-27.'),
    conference: c('text', 'The conference.', { null_when: 'not set' }),
    division: c('code', 'The NCAA division or association the team plays in.', { values: 'd1, d2, d3, naia, njcaa, other', null_when: 'not set (then the team’s level is not set)' }),
    official_rank: c('count', 'The team’s official ranking position at official_rank_at.', { sign: 'Lower is better (1 is first).', null_when: 'not ranked' }),
    official_rank_at: c('time', 'When that ranking was taken.', { null_when: 'not ranked' }),
  },
  golf_team_terms: {
    id: ID,
    label: c('text', 'The school term, as named (such as Fall 2026).'),
    classes_start: c('date', 'First day of classes.'),
    classes_end: c('date', 'Last day of classes.'),
    exams_end: c('date', 'Last day of exams.'),
    time_zone: c('code', 'The term’s time zone (an IANA name).'),
  },
  golf_team_settings: {
    scoring_format: c('text', 'The scoring format the team uses.', { null_when: 'not set' }),
    handicap_system: c('text', 'The handicap system the team uses.', { null_when: 'not set' }),
    default_tees: c('text', 'The tees used by default.', { null_when: 'not set' }),
    sg_baseline: c('code', 'The Tour-level reference strokes gained is measured against.', { values: 'pga_tour (men’s), womens', null_when: 'not chosen (a men’s team then uses pga_tour, a women’s team womens)' }),
    sg_benchmark_level: c('code', 'An older display setting for a benchmark line. It is NOT what strokes gained is measured against (that is sg_baseline, Tour level).', { values: 'pga_tour, scratch, ncaa_d1, ncaa_d2, ncaa_d3, break_80, break_90, break_100' }),
    timezone: c('code', 'The team’s time zone (an IANA name).', { null_when: 'not set' }),
  },
  golf_practice_sessions: {
    id: ID,
    session_date: c('date', 'The day of the practice session.'),
    source: c('code', 'Where the session came from. The value list is not fixed in the schema.'),
    created_at: c('time', 'When the row was created.'),
  },
  golf_tournaments: {
    id: ID,
    name: c('text', 'The tournament’s name.'),
    start_date: c('date', 'First day.'),
    end_date: c('date', 'Last day.'),
    event_kind: c('code', 'The kind of event.', { values: 'regular, conference, ncaa_regional, ncaa_championship, exhibition' }),
    format: c('code', 'The scoring format: players in the lineup then scores that count (5c4 is five play, four count).', { values: '5c4, 6c5, 6c4, custom, match, medal_match, individual' }),
    rounds_count: c('count', 'Rounds the tournament is played over (1 to 6).'),
    holes_per_round: c('count', 'Holes in each round: 9 or 18.'),
    field_size: c('count', 'Teams in the field.', { null_when: 'not stated' }),
    counting: c('count', 'Scores that count toward the team total each round.'),
    players_per_team: c('count', 'Players in the lineup each round.'),
    host: c('text', 'The host school or club.', { null_when: 'not set' }),
  },
  golf_tournament_entries: {
    tournament_id: ID,
    role: c('code', 'Whether the player is in the lineup, an alternate, or playing as an individual.', { values: 'lineup, alternate, individual' }),
    slot: c('count', 'The lineup slot, 1 to 9.', { null_when: 'the player is not in the lineup (set exactly when role is lineup)' }),
  },
  golf_tournament_rounds: {
    tournament_id: ID,
    round_number: c('count', 'Which round of the tournament (1 is first).'),
    round_event_id: ID,
    status: c('code', 'Where the round is.', { values: 'upcoming, live, suspended_weather, suspended_other, final' }),
    first_tee_at: c('time', 'The first tee time, stored in UTC.', { null_when: 'no tee times yet' }),
    course_label: c('text', 'The course for this round.', { null_when: 'not set' }),
  },
  golf_tournament_player_rounds: {
    round_event_id: ID,
    round_id: ID,
    status: c('code', 'Whether the player’s round counts.', { values: 'ok, wd (withdrew), dq (disqualified), dq_pending' }),
    entered_front: c('strokes', 'Front-nine strokes a coach entered (10 to 100).', { null_when: 'not entered' }),
    entered_back: c('strokes', 'Back-nine strokes a coach entered (10 to 100).', { null_when: 'not entered' }),
    entered_total: c('strokes', 'Total strokes a coach entered (20 to 200).', { sign: 'Lower is better.', null_when: 'not entered; a linked GolfHelm round supplies the score instead' }),
    wd_after_hole: c('count', 'The hole after which the player withdrew (0 to 18).', { null_when: 'the player did not withdraw' }),
  },
} satisfies TableDictionary;

/** The round_lines source: one row per round, joined from the round and its stat line. Names match golf_rounds where they overlap. */
export const ROUND_LINES_COLUMNS = [
  'round_date', 'course_name', 'round_type', 'status', 'holes_played', 'total_score', 'score_to_par', 'total_putts', 'three_putts', 'total_gir', 'total_gir_possible',
  'total_fairways_hit', 'total_fairways', 'total_penalties', 'front_nine', 'back_nine',
  'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach', 'strokes_gained_around_green', 'strokes_gained_putting',
] as const;
export type RoundLinesColumn = (typeof ROUND_LINES_COLUMNS)[number];

const rounds = DATA_DICTIONARY.golf_rounds;
const cache = DATA_DICTIONARY.golf_round_stats_cache;
export const ROUND_LINES_DICTIONARY: { [C in RoundLinesColumn]: ColumnNote } = {
  round_date: rounds.round_date,
  course_name: rounds.course_name,
  round_type: rounds.round_type,
  status: rounds.status,
  holes_played: rounds.holes_played,
  total_score: rounds.total_score,
  score_to_par: rounds.score_to_par,
  total_putts: { ...rounds.total_putts, means: 'Putts in the round (the round’s own figure, else the stat line’s). Empty, never 0, when no putts were recorded.', null_when: 'no putts were recorded for the round' },
  three_putts: { ...cache.three_putts, means: 'Holes with three or more putts in the round. Empty (never 0) when the round has no putts recorded: the stat line writes 0 for it, and round_lines reads that as not recorded.', null_when: 'the round has no putts recorded, or no stat line' },
  total_gir: { ...rounds.total_gir, means: 'Greens hit in regulation (the round’s own figure, else the stat line’s).' },
  total_gir_possible: rounds.total_gir_possible,
  total_fairways_hit: rounds.total_fairways_hit,
  total_fairways: rounds.total_fairways,
  total_penalties: rounds.total_penalties,
  front_nine: rounds.front_nine,
  back_nine: rounds.back_nine,
  strokes_gained_total: rounds.strokes_gained_total,
  strokes_gained_tee: rounds.strokes_gained_tee,
  strokes_gained_approach: rounds.strokes_gained_approach,
  strokes_gained_around_green: rounds.strokes_gained_around_green,
  strokes_gained_putting: rounds.strokes_gained_putting,
};

/** What no column says but every answer needs: quirks of the data that change what a figure means. */
export const DATA_QUIRKS: readonly string[] = [
  'A player can have several rounds on one day (a practice round and a tournament round, or two qualifier rounds): never treat a date as one round.',
  'round_type is practice, qualifier or tournament. Season scoring figures leave practice out; say which types a figure covers.',
  'A round posted as a total only has total_score and no holes, putts, greens or strokes gained: those columns are empty, not zero. It still counts in scoring averages.',
  'The stats caches count every completed round as production runs today (a total-only round, a practice round and an implausible one such as a 37-stroke 18-hole round all count). The countable-round rule that would filter them is written but pending owner apply: do not describe it as live.',
  'An unfinished round has no stat line and no strokes gained; only completed rounds count in any average.',
  'A 9-hole round has about half the strokes of an 18-hole round: do not average them together; holes_played says which.',
  'golf_round_stats_cache.updated_at and every other updated_at is when a row was last recomputed, not when anything was played; order rounds by round_date (or use round_lines).',
  'Strokes gained is measured against Tour level for the team (the men’s Tour baseline, or the women’s baseline for a women’s team): zero is Tour level and a college player is normally negative. A round with shots logged has it measured shot by shot; a round scored hole by hole without shots has an estimate from the scorecard.',
  'Distances: shot and driving distances are yards; putt distances and approach proximity are feet. Say the unit in the answer in full ("15 feet", "281 yards"), never a bare number.',
  'Sign: negative strokes gained loses strokes to the baseline; negative score to par is under par (better). Lower is better for score, putts, three-putts, penalties and proximity; higher is better for GIR, fairways, scrambling, make rates and percentiles.',
];

export type Dictionary = Record<string, Record<string, ColumnNote>>;
const ALL: Dictionary = { ...(DATA_DICTIONARY as unknown as Dictionary), round_lines: ROUND_LINES_DICTIONARY };

/** One column's note, or undefined for a table or column the dictionary does not hold. */
export const noteFor = (table: string, column: string): ColumnNote | undefined => ALL[table]?.[column];

/** The columns whose unit the code does not show: for the owner to settle. */
export const UNKNOWN_ENTRIES: ReadonlyArray<{ table: string; column: string; why: string }> = Object.entries(ALL).flatMap(([table, cols]) =>
  Object.entries(cols).filter(([, n]) => n.unit === 'unknown').map(([column, n]) => ({ table, column, why: n.means })),
);

const UNITS_WORTH_SAYING: ReadonlySet<Unit> = new Set(['count', 'strokes', 'to_par', 'percent', 'percentile', 'feet', 'yards', 'days', 'rating', 'by_metric', 'unknown']);
// Whole words: a tag the model reads is a tag it may write, and a coach was shown "n=4" (owner, 10 Nov 2026).
const UNIT_TAG: Partial<Record<Unit, string>> = { count: 'count', strokes: 'strokes', to_par: 'to par', percent: '%', percentile: 'percentile', feet: 'feet', yards: 'yards', days: 'days', rating: 'rating', by_metric: 'unit of its metric', unknown: 'unit unknown' };

/** The unit of each column that has one worth saying: what a row's envelope carries so the answer says "15 feet", not "15". */
export function columnUnits(table: string, columns: readonly string[]): Record<string, Unit> {
  const out: Record<string, Unit> = {};
  for (const col of columns) {
    const n = noteFor(table, col);
    if (n && UNITS_WORTH_SAYING.has(n.unit)) out[col] = n.unit;
  }
  return out;
}

/** A column with its unit tag in brackets where the unit is worth saying: `total_score[strokes]`. */
export function columnWithUnit(table: string, column: string): string {
  const n = noteFor(table, column);
  const tag = n && UNITS_WORTH_SAYING.has(n.unit) ? UNIT_TAG[n.unit] : undefined;
  return tag ? `${column}[${tag}]` : column;
}

/** The compact reading guide that goes with the tool: conventions and quirks, then the sign of the columns where it matters. */
export function describeDictionary(): string {
  return [
    'Reading the data (the unit is in brackets after each column: count, strokes, to par, % from 0 to 100, feet, yards). The brackets are for you; an answer gives the unit in words:',
    ...DATA_QUIRKS.map((q) => `- ${q}`),
    '- An empty column is "not recorded", never zero. Each read carries the unit of its columns (detail.units); use it in the answer.',
  ].join('\n');
}
