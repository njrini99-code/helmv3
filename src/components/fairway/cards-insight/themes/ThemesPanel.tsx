'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm v3 THEMES — ThemesPanel
 * ----------------------------------------------------------------------------
 * The ordered list of {@link ThemeCard}s. Themes arrive already sorted by
 * magnitude (the rate-limiting theme floats up) — this panel does NOT re-sort.
 *
 * Empty (no themes at all — e.g. CoachHelm not yet enabled / no scaffold) →
 * a Fairway `EmptyState`. (The assembler normally returns a fixed scaffold of
 * all themes, so this is the genuine "nothing to render" case, distinct from a
 * `thin` theme which still renders its own stub card.)
 *
 * PRESENTATION ONLY — no data fetch, no server action. The "make it a plan"
 * handler is injected and threaded down to each ThemeCard → CauseRow.
 *
 * ADDITIVE — new file under the Fairway tree. Renders inside `.fairway-ds`.
 * ========================================================================== */

import { Sparkles } from 'lucide-react';

import { EmptyState } from '@/components/fairway';
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
  if (themes.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No themes yet"
        description="Log a few rounds with shot detail and CoachHelm will surface the strokes-gained themes worth working on — putting, approach, off-the-tee, around-the-green, and your scoring patterns."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-slot="fairway-themes-panel">
      {themes.map((theme) => (
        <ThemeCard
          key={theme.category}
          theme={theme}
          role={role}
          onMakePlan={onMakePlan}
          makePlanPendingId={makePlanPendingId}
        />
      ))}
    </div>
  );
}

export default ThemesPanel;
