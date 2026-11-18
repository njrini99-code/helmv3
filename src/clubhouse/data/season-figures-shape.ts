import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import { figureSetOver, figureWindowRounds, type ChFigureSet, type ChFigureSpec } from './figure-window';
import type { ChRound } from './season';

/** The window a CoachHelm reader's season figures cover: this season on the team's clock, every length, a nine at half a round. */
export const SEASON_FIGURE_SPEC = (zone: string, now?: Date): ChFigureSpec => ({ window: 'season', holes: 'any', tz: zone, ...(now ? { now } : {}) });

/** Strokes gained a round in each part of the round, as the themes read it (`getThemesForPlayer`'s `sg`). */
export type ChSgByCategory = Partial<Record<InsightCategory, number | null>>;

/**
 * Strokes gained a round by insight category, from a player's season figures (`season-figures.ts`, SC-01): the four parts of the round
 * the themes grade as a leak or a strength. A part under the floor of whole rounds that have it is null, never a guess.
 */
export function sgByCategoryOf(set: Pick<ChFigureSet, 'sg'>): ChSgByCategory {
  const { legs } = set.sg;
  return { tee: legs.tee, approach: legs.approach, short_game: legs.around, putting: legs.putting };
}

/**
 * The same, from one player's rounds already loaded (any window that holds the season): strokes gained is on the round itself, so no
 * stats row is needed. The team board reads its players' themes this way from the rounds it has, with no read per player.
 */
export function seasonSgByCategory(rounds: readonly ChRound[], zone: string, now?: Date): ChSgByCategory {
  return sgByCategoryOf(figureSetOver(figureWindowRounds(rounds, SEASON_FIGURE_SPEC(zone, now)), new Map()));
}
