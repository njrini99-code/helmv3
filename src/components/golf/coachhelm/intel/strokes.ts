/**
 * The engine's "strokes per round available" figure, per Home theme.
 *
 * Read from the category insights the page already loads: only an
 * engine-backed insight with a live (positive, finite) counterfactual counts.
 * A template sentence or a diagnostic-only row never produces a figure.
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
  for (const insight of category.insights) {
    const perRound = insight.strokesSavedPerRound;
    if (insight.engineBacked === true && typeof perRound === 'number' && Number.isFinite(perRound) && perRound > 0) {
      return { perRound, message: insight.message };
    }
  }
  return null;
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
