/**
 * ============================================================================
 * Fairway · CoachHelm v3 THEMES — local barrel
 * ----------------------------------------------------------------------------
 * Single import surface for the THEME-CARD set (Phase 1 of
 * docs/fairway-coachhelm-insight-rebuild.md). PRESENTATION ONLY — these render
 * the locked `src/lib/coachhelm/v3/themes/types.ts` contract; they do NOT fetch
 * data or call server actions (the "make it a plan" handler is injected).
 *
 *   import { ThemesPanel, ThemeCard, CauseRow } from
 *     '@/components/fairway/cards-insight/themes';
 *
 * Local barrel by design — the integrator wires the top-level
 * `src/components/fairway/index.ts`.
 * ========================================================================== */

export { ThemesPanel, type ThemesPanelProps } from './ThemesPanel';
export { ThemeCard, type ThemeCardProps } from './ThemeCard';
export { CauseRow, type CauseRowProps } from './CauseRow';
