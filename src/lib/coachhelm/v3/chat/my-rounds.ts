/**
 * CoachHelm chat: a player's own rounds, from their own Rounds page.
 *
 * Why it exists. A player's Ask had no read of their round list: only the Stats page, which leaves practice rounds out
 * and lists the rounds of one window. Asked "how many rounds have I recorded since 1 September" it counted the lines of
 * that page and answered 7 where the player had recorded 14 (first full eval run, 11 Nov 2026). This read is the
 * player's Rounds page: every round they posted, practice included, and the ones still in progress, with the counts
 * worked out here so the model never adds rows up.
 *
 * Whose rounds. Always the signed-in player's: the loader is bound to their id by the route (`myRounds` in
 * `screen-loaders.ts`), the tool takes no player id, and it answers nothing in a coach's chat (a coach has the team's
 * Rounds page in `get_rounds`). Nothing of a teammate can reach it.
 */
import { z } from 'zod';
import type { ReadTool, ToolContext, ToolResult } from './engine/tool';
import { nowIso, type Measurement, type ToolEnvelope } from './provenance';
import { empty, failed, nameOf, playerOf, round, say, toParWords, withText, wordsFor } from './reader-kit';
import { screenLoaders, type MyRoundsScreen } from './screen-loaders';

const ROUND_TYPES = ['practice', 'qualifier', 'tournament'] as const;
type RoundType = (typeof ROUND_TYPES)[number];
/** The most rounds listed one by one; the counts always cover every round in the range. */
export const MY_ROUND_LIST_MAX = 30;
/** The Rounds page reads at most this many in-progress cards: at the cap the count is "at least". */
const IN_PROGRESS_CAP = 20;

export type MyRoundsInput = { round_type?: RoundType; from?: string; to?: string; list: number };

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The counts of one player's rounds in a range, by what happened to each: the figures the read states. */
export function myRoundCounts(page: MyRoundsScreen, input: Pick<MyRoundsInput, 'round_type' | 'from' | 'to'>) {
  const inRange = (r: { date: string; type: RoundType | null }) => (!input.round_type || r.type === input.round_type) && (!input.from || r.date.slice(0, 10) >= input.from) && (!input.to || r.date.slice(0, 10) <= input.to);
  const finished = page.rounds.list.filter(inRange);
  const inProgress = page.unfinished.list.filter(inRange);
  const counted = finished.filter((r) => r.countable && r.holes === 18);
  const byType = [...ROUND_TYPES, null].map((type) => ({ type, finished: finished.filter((r) => r.type === type).length, in_progress: inProgress.filter((r) => r.type === type).length })).filter((t) => t.finished + t.in_progress > 0);
  return { finished, inProgress, counted, byType, recorded: finished.length + inProgress.length };
}

async function runMyRounds(ctx: ToolContext, input: MyRoundsInput): Promise<ToolResult> {
  const me = playerOf(ctx);
  if (!me) return failed('your rounds', 'This read is a player\'s own Rounds page.');
  const load = screenLoaders(ctx).myRounds;
  if (!load) return failed('your rounds', 'Your Rounds page is not connected to this chat.');
  const page = await load().catch(() => null);
  if (!page || page.rounds.error) return failed('your rounds', 'Your Rounds page could not be read.');

  const { finished, inProgress, counted, byType, recorded } = myRoundCounts(page, input);
  const scope = [input.round_type ? `${input.round_type} rounds` : 'every round type, practice included', input.from || input.to ? `${input.from ?? 'the start'} to ${input.to ?? 'today'}` : 'every date on your Rounds page'].join(', ');
  if (recorded === 0) return withText(empty(`No rounds of yours: ${scope}.`, { rounds: [] }), [], wordsFor(ctx));

  const name = nameOf(ctx, me);
  const days = [...finished, ...inProgress].map((r) => r.date.slice(0, 10)).sort();
  const average = mean(counted.map((r) => r.score));
  const shown = finished.slice(0, Math.min(Math.max(input.list, 0), MY_ROUND_LIST_MAX));
  const atCap = page.unfinished.list.length >= IN_PROGRESS_CAP;
  const unread = page.unfinished.error;
  const measurements: Measurement[] =
    average === null
      ? []
      : [{ metric_id: 'scoring_average', metric_label: 'Scoring avg', unit: 'score', value: round(average, 1), entity: { kind: 'player', id: me, label: name }, window_start: days[0] ?? null, window_end: days[days.length - 1] ?? null, sample_size: counted.length, sample_unit: 'rounds', as_of: nowIso(), coverage: 'complete', coverage_note: null, source: 'Rounds page', method: 'mean_of_full_counting_rounds', denominator: null, benchmark: null, direction: 'lower_better' }];
  const lines = [
    `Your rounds, ${scope}: ${plural(recorded, 'round')} recorded (${days[0]} to ${days[days.length - 1]}). ${finished.length} finished and ${unread ? 'the rounds in progress could not be read' : `${atCap ? 'at least ' : ''}${inProgress.length} still in progress`}. Source: your Rounds page.`,
    `${counted.length} of the ${plural(finished.length, 'finished round')} are full rounds that count in an average.${average === null ? '' : ` Their average score: ${say(average, '', 1)}.`}`,
    byType.length > 1 || byType[0]?.type !== (input.round_type ?? undefined) ? 'By kind of round:' : null,
    ...(byType.length > 1 || byType[0]?.type !== (input.round_type ?? undefined) ? byType.map((t) => `  ${t.type ?? 'no kind set'}: ${plural(t.finished + t.in_progress, 'round')} recorded, ${t.finished} finished${t.in_progress ? `, ${t.in_progress} in progress` : ''}`) : []),
    'A round in progress has no final score and counts in no average. Your Stats figures leave practice rounds out, so their round counts are smaller than these.',
    shown.length ? `Newest ${shown.length} of your ${plural(finished.length, 'finished round')}:` : null,
    ...shown.map((r) => `  ${r.date.slice(0, 10)}, ${r.course}${r.holes === 9 ? ' (9 holes)' : ''}: ${r.score}${r.toPar === null ? '' : `, ${toParWords(r.toPar)}`}${r.type ? `, ${r.type}` : ''}${r.totalOnly ? ', total only' : ''} [round ${r.id}]`),
  ];
  const envelope: ToolEnvelope = {
    summary: `Your rounds: ${plural(recorded, 'round')}, ${scope}.`,
    measurements,
    series: [],
    detail: {
      scope,
      rounds_recorded: recorded,
      rounds_finished: finished.length,
      rounds_in_progress: unread ? null : inProgress.length,
      counted_rounds: counted.length,
      average_of_counted: average === null ? null : round(average, 1),
      by_type: byType,
      rounds: shown.map((r) => ({ round_id: r.id, date: r.date.slice(0, 10), course: r.course, type: r.type, holes: r.holes, score: r.score, to_par: r.toPar, putts: r.putts })),
    },
    coverage: unread ? 'partial' : 'complete',
    coverage_note: unread ? 'The rounds in progress could not be read, so the recorded count leaves them out.' : (page.rounds.unscored ?? 0) > 0 ? `${plural(page.rounds.unscored ?? 0, 'finished round')} with no score at all, on any date, are left out.` : null,
    as_of: nowIso(),
  };
  return withText(envelope, lines, wordsFor(ctx));
}

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A player's own Rounds page. It carries the coach read's name, as every player read does: the two are never offered together. */
export const getMyRounds: ReadTool<MyRoundsInput> = {
  kind: 'read',
  name: 'get_rounds',
  description:
    'Your own rounds from your Rounds page, every kind with practice included, narrowed by kind and dates: how many you recorded, how many are finished and how many are still in progress, how many count in an average, the count for each kind, and the newest ones with course, score and id. Use it to count or list your rounds, and to find a round for get_round.',
  input: z.object({ round_type: z.enum(ROUND_TYPES).optional(), from: Day.optional(), to: Day.optional(), list: z.number().int().min(0).max(MY_ROUND_LIST_MAX).default(10).describe('How many of the newest finished rounds to list.') }),
  progress: () => 'Reading your rounds',
  run: runMyRounds,
};
