'use client';

/**
 * ============================================================================
 * Fairway · pages · coachhelm · PracticeRxPanel
 * ----------------------------------------------------------------------------
 * The shared Fairway "Practice Rx" prescription primitive. Turns a diagnosis
 * (an insight) into a prescription by rendering the drills already attached to
 * that insight. This is the surface that closes the "WHAT do I work on?" loop —
 * the player reads "your edge this week", then sees the drills to fix it.
 *
 * RENDER-ONLY. Pure presentation over a `drills` array — NO data fetch on this
 * path (the primary CoachHelm path pre-joins drills onto the insight props via
 * `insight-delivery.ts`). The only side effect is `recordDrillView` telemetry,
 * fired on row click inside a `useTransition`.
 *
 * Deliberately NOT here (DEFERRED): no "add drill to plan" write —
 * `recordDrillAddedToPlan` revalidates the concurrent-owned analytics route, so
 * Practice Rx never persists; it only reads + logs a view.
 *
 * Rendering rules (mirrors the legacy DrillAttachment contract):
 *  - 0 drills → render NOTHING (no empty "Practice Rx" heading). Honest-empty.
 *  - 1-3 drills → matte Fairway rows (Surface/Inset), top-3 shown.
 *  - Click fires `recordDrillView`; if the drill has a `video_url` we open it in
 *    a new tab. Demo drills have `video_url = null`, so rows are tappable for
 *    telemetry but open nothing — no "video coming" tease, no Play icon.
 *
 * Tokens: warm matte Fairway vocabulary only (Surface/Inset/Badge/Button) —
 * never the legacy `bg-cream-100/75 backdrop-blur-xl` glass recipe.
 * ADDITIVE + flag-gated: imported only by Fairway page components that render
 * exclusively inside the `isRedesignEnabled()` fork, in the `.fairway-ds` scope.
 * ========================================================================== */

import { useTransition } from 'react';
import { Inset, Badge } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  IconTarget,
  IconClock,
  IconPlay,
  IconExternalLink,
  IconDumbbell,
} from '@/components/icons';
import { recordDrillView as defaultRecordDrillView } from '@/app/golf/actions/drills';

/* ─────────────────────────────────────────────────────────────────────────
 * Drill shape — a STRUCTURAL SUPERSET so both prescription paths assign here
 * without a cast:
 *   • `InsightAttachedDrill` (insight-delivery.ts) — the pre-joined hero/sheet
 *     path; carries ONLY { id, slug, title, duration_min, difficulty }.
 *   • `InsightDrill` (drills.ts) — the self-fetched My-Development path; carries
 *     the full row incl. category / description / video_url.
 * The divergent fields are therefore OPTIONAL and the panel degrades gracefully
 * (renders category/description only when present).
 * ──────────────────────────────────────────────────────────────────────── */

export interface PracticeRxDrill {
  id: string;
  slug: string;
  title: string;
  duration_min: number;
  difficulty: string;
  category?: string;
  description?: string | null;
  video_url?: string | null;
}

export interface PracticeRxPanelProps {
  /** Drills to prescribe. Already capped to top-3-by-rank upstream; we re-cap
   *  defensively. Empty/undefined → the panel renders nothing. */
  drills?: ReadonlyArray<PracticeRxDrill>;
  /** Tightens the framing for the hero (under "your edge this week") vs the
   *  expand-in-place sheet. Affects copy density only. */
  variant?: 'hero' | 'sheet';
  /** Telemetry hook — defaults to the real `recordDrillView` server action.
   *  Injectable for tests. RENDER-ONLY: no plan-write is ever wired here. */
  onView?: (drillId: string) => Promise<void> | void;
  className?: string;
}

/** Difficulty labels — copied verbatim from the legacy DrillAttachment. */
const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Category labels — copied verbatim from the legacy DrillAttachment. Only used
 *  on the self-fetched path where `category` is present. */
const CATEGORY_LABELS: Record<string, string> = {
  putting: 'Putting',
  tee: 'Tee game',
  approach: 'Approach',
  short_game: 'Short game',
  scoring: 'Scoring',
  pressure: 'Pressure',
  course_management: 'Course management',
};

export function PracticeRxPanel({
  drills,
  variant = 'hero',
  onView = defaultRecordDrillView,
  className,
}: PracticeRxPanelProps) {
  // HONEST-EMPTY: never render an empty "Practice Rx" heading. Mirrors the
  // legacy DrillAttachment 0-drills behaviour exactly.
  const top = (drills ?? []).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <Inset
      padding={variant === 'hero' ? 'md' : 'sm'}
      className={className}
      data-slot="practice-rx"
    >
      {/* Header — turns a diagnosis into a prescription. Plain-English. */}
      <div className="flex items-center gap-2">
        <IconTarget size={14} className="text-accent-600" aria-hidden />
        <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
          Practice Rx
        </span>
      </div>
      <p className="mt-1 font-fw-sans text-caption text-text-secondary">
        {variant === 'hero'
          ? 'What to work on to close this gap'
          : 'What to work on'}
      </p>

      <ul className="mt-3 space-y-2">
        {top.map((drill) => (
          <li key={drill.id}>
            <PracticeRxRow drill={drill} onView={onView} />
          </li>
        ))}
      </ul>
    </Inset>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * PracticeRxRow — one prescribed drill, a matte interactive Surface tile.
 * ──────────────────────────────────────────────────────────────────────── */

interface PracticeRxRowProps {
  drill: PracticeRxDrill;
  onView: (drillId: string) => Promise<void> | void;
}

function PracticeRxRow({ drill, onView }: PracticeRxRowProps) {
  const [pending, startTransition] = useTransition();

  const difficultyLabel =
    DIFFICULTY_LABELS[drill.difficulty] ?? drill.difficulty;
  // `category` is only on the self-fetched path; degrade gracefully when absent.
  const categoryLabel = drill.category
    ? CATEGORY_LABELS[drill.category] ?? drill.category
    : null;
  const hasVideo = Boolean(drill.video_url);

  const handleClick = () => {
    // RENDER-ONLY telemetry — log the view, never persist a plan write.
    startTransition(() => {
      void Promise.resolve(onView(drill.id));
    });
    // Only open when there is genuinely a video; otherwise the click logs and
    // no-ops the link (the demo drills carry video_url = null).
    if (drill.video_url && typeof window !== 'undefined') {
      window.open(drill.video_url, '_blank', 'noopener,noreferrer');
    }
  };

  // A native <button> (not <Surface as="button">) so the button-only `type`
  // and `disabled` attributes type-check — Surface's props are
  // HTMLAttributes<HTMLDivElement>, which the polymorphic `as` does not widen.
  // Classes replicate Surface's matte `elevation="border" interactive` recipe
  // verbatim so the tile is visually identical to a clickable Surface.
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      data-slot="surface"
      data-testid="practice-rx-drill"
      className={cn(
        'group relative block w-full rounded-card bg-surface px-4 py-3 text-left text-text-primary',
        'border border-border-subtle shadow-flat',
        'cursor-pointer transition-[box-shadow,transform,border-color]',
        'duration-[180ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
        'hover:shadow-raise hover:-translate-y-px',
        'active:translate-y-[0.5px] active:shadow-flat',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0',
        'disabled:cursor-default disabled:opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <IconDumbbell
              size={14}
              className="flex-shrink-0 text-text-tertiary"
              aria-hidden
            />
            <span className="truncate font-fw-sans text-body font-medium text-text-primary">
              {drill.title}
            </span>
            {hasVideo ? (
              <IconPlay
                size={13}
                className="flex-shrink-0 text-accent-600 opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            ) : null}
          </div>

          {drill.description ? (
            <p className="mt-1 line-clamp-2 font-fw-sans text-caption text-text-secondary">
              {drill.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" size="sm">
              {difficultyLabel}
            </Badge>
            {categoryLabel ? (
              <Badge tone="neutral" variant="outline" size="sm">
                {categoryLabel}
              </Badge>
            ) : null}
            <Badge tone="accent" size="sm" numeric leadingIcon={<IconClock />}>
              {drill.duration_min} min
            </Badge>
            {hasVideo ? (
              <Badge tone="accent" variant="outline" size="sm" leadingIcon={<IconExternalLink />}>
                Watch
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

export default PracticeRxPanel;
