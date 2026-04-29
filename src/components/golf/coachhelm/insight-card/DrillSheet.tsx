'use client';

/**
 * DrillSheet — full-detail drill presentation opened from a `<DrillChips>` tap.
 *
 * Reuses the shared `<BottomSheet>` primitive so we inherit safe-area handling,
 * focus trap, ESC close, backdrop dismiss, and the iOS motion curve. Desktop
 * viewports get the same sheet centered at the bottom with a max-width clamp —
 * we decided against a bespoke right-rail drawer because the product already
 * leans on bottom sheets elsewhere (`<WhyPopover>`, drill-attachment bodies)
 * and consistency beats micro-optimization here.
 *
 * Rule 10 motion budget:
 *   - Sheet slide / backdrop fade are handled by `BottomSheet` (iOS curve,
 *     ~400ms). No extra animation inside the body.
 *   - Primary + secondary CTAs use the existing tap-scale affordance.
 *
 * Wiring:
 *   - Primary "Add to my practice plan" logs a dev warning + surfaces a
 *     "Coming soon" toast. We intentionally do NOT create a task-assignment
 *     row here — that ships in a follow-up plan. The hook point lives where
 *     it's easiest to rewire when the backing action arrives.
 *   - Secondary "Done — log this drill" calls the existing `recordDrillView`
 *     server action so drill engagement continues to land in admin events.
 *   - A video url renders a non-autoplay iframe below the description.
 */
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { IconPlay, IconCheck } from '@/components/icons';
import { toast } from '@/components/ui/toast';
import {
  recordDrillView as defaultRecordDrillView,
  recordDrillAddedToPlan,
} from '@/app/golf/actions/drills';

export interface DrillSheetDrill {
  id: string;
  title: string;
  description: string;
  duration_min: number;
  difficulty: string;
  video_url?: string | null;
}

export interface DrillSheetInsightContext {
  title: string;
  category: string;
}

export interface DrillSheetProps {
  open: boolean;
  onClose: () => void;
  drill: DrillSheetDrill;
  /** Shown as a subtle "Recommended because of: {title}" line. */
  insightContext?: DrillSheetInsightContext;
  /** Source insight that recommended this drill (for plan attachment). */
  insightId?: string;
  /** Injected for tests; defaults to the real server action. */
  onLogDrill?: (drillId: string) => Promise<void> | void;
  /** Injected for tests; defaults to recordDrillAddedToPlan. */
  onAddToPlan?: (drillId: string) => Promise<void> | void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const CATEGORY_LABEL: Record<string, string> = {
  putting: 'Putting',
  tee: 'Tee shots',
  approach: 'Approach',
  short_game: 'Short game',
  scoring: 'Scoring',
  pressure: 'Pressure',
  course_management: 'Course management',
};

export function DrillSheet({
  open,
  onClose,
  drill,
  insightContext,
  insightId,
  onLogDrill = defaultRecordDrillView,
  onAddToPlan,
}: DrillSheetProps) {
  const effectiveAddToPlan =
    onAddToPlan ??
    (async (drillId: string) => {
      const result = await recordDrillAddedToPlan(drillId, insightId ?? null);
      if (result.success) {
        toast.info('Added', "We'll include this in your next practice session.");
      } else {
        toast.error('Failed to add', result.error || 'Try again in a moment.');
      }
    });
  const [addPending, startAdd] = useTransition();
  const [logPending, startLog] = useTransition();

  const difficulty = DIFFICULTY_LABEL[drill.difficulty] ?? drill.difficulty;

  const handleAddToPlan = () => {
    startAdd(() => {
      void Promise.resolve(effectiveAddToPlan(drill.id));
    });
  };

  const handleLogDrill = () => {
    startLog(() => {
      void Promise.resolve(onLogDrill(drill.id));
      // Close after kicking off — the server action is fire-and-forget; we
      // don't want the sheet to hang open waiting for a network round-trip.
      onClose();
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      // We render our own hero header inside `children` so the title uses the
      // Fraunces-stamped display family. Keep the sheet's built-in header off.
      showHandle
      description={insightContext ? 'Drill detail' : undefined}
    >
      <div className="space-y-4" data-testid="drill-sheet">
        <header className="space-y-2">
          <h2
            data-testid="drill-sheet-title"
            className="font-[family-name:var(--font-fraunces)] text-[24px] md:text-[28px] leading-tight font-semibold text-warm-900"
          >
            {drill.title}
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-warm-100 text-warm-700 font-medium">
              {difficulty}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-medium tabular-nums">
              {drill.duration_min} min
            </span>
          </div>
          {insightContext && (
            <p
              data-testid="drill-sheet-context"
              className="text-xs text-warm-500"
            >
              Recommended because of:{' '}
              <span className="text-warm-700 font-medium">
                {insightContext.title}
              </span>
              <span className="text-warm-400">
                {' · '}
                {CATEGORY_LABEL[insightContext.category] ?? insightContext.category}
              </span>
            </p>
          )}
        </header>

        <section className="space-y-3">
          <p className="text-sm text-warm-700 leading-relaxed whitespace-pre-line">
            {drill.description}
          </p>

          {drill.video_url && (
            <div
              data-testid="drill-sheet-video"
              className="relative w-full overflow-hidden rounded-2xl border border-warm-200 bg-warm-50 aspect-video"
            >
              <iframe
                src={drill.video_url}
                title={`${drill.title} — demonstration`}
                loading="lazy"
                // No autoplay (Rule 10: no background motion). The user taps
                // play themselves if they want to watch.
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 w-full h-full"
              />
            </div>
          )}
        </section>

        <footer className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            data-testid="drill-sheet-add-to-plan"
            disabled={addPending}
            onClick={handleAddToPlan}
            className={cn(
              'inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl',
              'bg-primary-500 text-white text-sm font-semibold',
              'hover:bg-primary-600 active:scale-[0.99] transition-all',
              addPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconPlay size={16} aria-hidden />
            Add to my practice plan
          </button>
          <button
            type="button"
            data-testid="drill-sheet-log-drill"
            disabled={logPending}
            onClick={handleLogDrill}
            className={cn(
              'inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl',
              'bg-cream-100/82 border border-warm-200 text-sm font-medium text-warm-800',
              'hover:bg-white hover:border-primary-200 active:scale-[0.99] transition-all',
              logPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconCheck size={16} aria-hidden />
            Done — log this drill
          </button>
        </footer>
      </div>
    </BottomSheet>
  );
}
