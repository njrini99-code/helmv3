'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm v3 THEMES — ThemesPanel
 * ----------------------------------------------------------------------------
 * The ordered list of {@link ThemeCard}s. Themes arrive already sorted by
 * magnitude (the rate-limiting theme floats up) — this panel does NOT re-sort.
 *
 * THIN-TAIL COLLAPSE (Phase 2 · output quality): the assembler returns a fixed
 * scaffold of ALL themes, so a thin player would otherwise see a wall of
 * identical "no data" stubs that reads as broken. Instead we partition:
 *   • `substantive` (state !== 'thin') → full {@link ThemeCard}s, in order.
 *   • `thin` (state === 'thin')        → ONE compact, muted footer row that
 *     simply acknowledges the awaiting-data categories (scaffold honesty)
 *     without letting them dominate.
 *   • ALL thin (brand-new player)      → a single honest `InsufficientData`
 *     onboarding state asking them to log rounds — never N identical stubs.
 *   • No themes at all (CoachHelm not enabled / no scaffold) → `EmptyState`.
 *
 * PRESENTATION ONLY — no data fetch, no server action. The "make it a plan"
 * handler is injected and threaded down to each substantive ThemeCard →
 * CauseRow (unchanged).
 *
 * ADDITIVE — new file under the Fairway tree. Renders inside `.fairway-ds`.
 * ========================================================================== */

import { Sparkles } from 'lucide-react';

import { EmptyState, InsufficientData, Inset } from '@/components/fairway';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { ThemeCard } from './ThemeCard';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export interface ThemesPanelProps {
  /** Themes, already sorted by magnitude (panel renders in given order). */
  themes: ThemeNode[];
  role: 'coach' | 'player';
  /** Injected "make it a plan" handler — receives the cause + its parent theme. */
  onMakePlan?: (cause: CauseNode, theme: ThemeNode) => void;
  /** `cause.insight_id` currently creating a plan → that CauseRow shows busy. */
  makePlanPendingId?: string | null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function ThemesPanel({
  themes,
  role,
  onMakePlan,
  makePlanPendingId,
}: ThemesPanelProps) {
  // No scaffold at all (CoachHelm not enabled / nothing to render).
  if (themes.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No themes yet"
        description="Log a few rounds with shot detail and CoachHelm will surface the strokes-gained themes worth working on — putting, approach, off-the-tee, around-the-green, and your scoring patterns."
      />
    );
  }

  // Partition: substantive themes get full cards; thin themes collapse into a
  // single muted footer (or, when EVERY theme is thin, an onboarding state).
  const substantive = themes.filter((t) => t.state !== 'thin');
  const thin = themes.filter((t) => t.state === 'thin');

  // Brand-new player: the whole scaffold is thin. Show one honest "log rounds"
  // state instead of N identical stubs.
  if (substantive.length === 0) {
    return (
      <InsufficientData
        icon={Sparkles}
        title="Not enough rounds yet"
        description="Log a few rounds with shot detail and CoachHelm will surface the strokes-gained themes worth working on — putting, approach, off-the-tee, around-the-green, and your scoring patterns."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-slot="fairway-themes-panel">
      {substantive.map((theme) => (
        <ThemeCard
          key={theme.category}
          theme={theme}
          role={role}
          onMakePlan={onMakePlan}
          makePlanPendingId={makePlanPendingId}
        />
      ))}

      {thin.length > 0 ? (
        // A recessive sunken well (no border, tint step down) so the awaiting-
        // data tail reads as secondary scaffolding, never as another full theme
        // card sitting at the same visual weight as the substantive ones above.
        <Inset
          padding="sm"
          className="flex items-center gap-2"
          data-slot="fairway-themes-thin-footer"
        >
          <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
            Awaiting data
          </span>
          <span aria-hidden className="text-text-tertiary">
            ·
          </span>
          <span className="min-w-0 flex-1 truncate font-fw-sans text-caption text-text-tertiary">
            {thin.map((t) => t.displayLabel).join(', ')}
          </span>
        </Inset>
      ) : null}
    </div>
  );
}

export default ThemesPanel;
