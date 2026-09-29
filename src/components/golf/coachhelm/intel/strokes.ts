/**
 * The team's "strokes per round available" figure, per Home theme.
 *
 * Read from `category.strokesAvailable`, which `getTeamCategoryInsights`
 * computes as a roster mean (`team-intelligence/strokes-available.ts`): each
 * current player's largest live counterfactual, averaged over every current
 * player. It used to be the first engine insight's counterfactual, which is
 * one player's figure headlining a team card (2026-09 audit rows 1 and 7).
 */
import type { TeamCategory } from '@/app/golf/actions/team-category-insights';
import type { IntelStrokesAvailable, IntelTheme } from '@/lib/golf/team-intelligence/types';

const CATEGORY_THEME: Record<string, IntelTheme> = {
  driving: 'tee',
  approach: 'app',
  short_game: 'atg',
  putting: 'putt',
};

export function strokesAvailable(category: TeamCategory): IntelStrokesAvailable | null {
  const team = category.strokesAvailable;
  if (!team || !Number.isFinite(team.perRound) || team.perRound <= 0) return null;
  return team;
}

export function strokesByTheme(categories: readonly TeamCategory[] | null | undefined): Partial<Record<IntelTheme, IntelStrokesAvailable>> {
  const out: Partial<Record<IntelTheme, IntelStrokesAvailable>> = {};
  for (const category of categories ?? []) {
    const theme = CATEGORY_THEME[category.id];
    if (!theme || out[theme]) continue;
    const available = strokesAvailable(category);
    if (available) out[theme] = available;
  }
  return out;
}

const ONE_DECIMAL = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One decimal, or two below 0.1 so a small real figure never reads "0.0". */
export function formatStrokesPerRound(perRound: number): string {
  const abs = Math.abs(perRound);
  return abs < 0.1 ? TWO_DECIMALS.format(abs) : ONE_DECIMAL.format(abs);
}
