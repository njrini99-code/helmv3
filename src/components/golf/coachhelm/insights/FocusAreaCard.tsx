'use client';

/**
 * ============================================================================
 * FocusAreaCard (player dashboard "Focus areas" widget)
 * ----------------------------------------------------------------------------
 * Fairway-native rebuild (Wave 3 player-home premium pass). Was built on
 * pre-fairway `@/components/ui/card` + `@/components/ui/button` with a raw
 * `bg-primary-500` priority chip — the one visibly old-UI island left on the
 * player home. Rebuilt onto Surface (card shell) + fairway Badge/Button, same
 * public props (`focusArea`, `onClick`) and the same keyboard-operable
 * click-through-card contract so `PlayerFocusAreas` needs no behavioral change.
 *
 * NAMING: this is the LEGACY-DATA-SHAPE sibling of
 * `@/components/fairway/pages/coachhelm/FocusAreaCard` (which renders the
 * richer `FocusAreaCardData` used by coach Development + My Development).
 * That file explicitly documents "the legacy
 * src/components/golf/coachhelm/insights/FocusAreaCard.tsx is NEVER touched"
 * — meaning never MERGED into it, not that it can't be modernized on its own
 * terms. This file keeps consuming `PlayerFocusArea` (the read-only dashboard-
 * widget row: category/priority/target_improvement/specific_drills), token-
 * ported to Fairway without reshaping the data contract.
 * ========================================================================== */

import type { ComponentType } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { Badge } from '@/components/fairway/controls/badge';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import type { FwStatusTone } from '@/components/fairway/controls/_internal';
import {
  IconChevronRight,
  IconTarget,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconTrophy,
  IconWind,
  IconDumbbell,
  IconClipboardList,
} from '@/components/icons';
import type { PlayerFocusArea, FocusAreaIconName } from '@/lib/coachhelm/insight-types';
import { getFocusAreaConfig } from '@/lib/coachhelm/insight-types';
import { EASE_CINEMATIC, DURATION, stagger, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

const FOCUS_AREA_ICON_MAP: Record<FocusAreaIconName, ComponentType<{ size?: number; className?: string }>> = {
  crosshair: IconCrosshair,
  flag: IconFlag,
  'circle-dot': IconCircleDot,
  map: IconMap,
  brain: IconBrain,
  trophy: IconTrophy,
  target: IconTarget,
  wind: IconWind,
  dumbbell: IconDumbbell,
  'clipboard-list': IconClipboardList,
};

/** Priority 1 (highest) reads accent-forward; lower priorities recede to neutral. */
const PRIORITY_TONE: Record<number, FwStatusTone> = {
  1: 'accent',
  2: 'accent',
  3: 'neutral',
  4: 'neutral',
  5: 'neutral',
};

/**
 * `PlayerFocusArea.progress_notes` is typed `string | null` (stale — the
 * `golf_player_focus_areas.progress_notes` column is jsonb; see
 * `development.ts`'s `updateFocusAreaProgressImpl`, which reads/writes the
 * locked shape `{ entries: [{ at, value, note }] }`). This defensively
 * narrows whatever actually comes back into an oldest→newest numeric series
 * for the trend Sparkline — never throws, and degrades to an empty series
 * (no sparkline rendered) for null / malformed / pre-shape rows.
 */
function progressSeries(progressNotes: PlayerFocusArea['progress_notes']): number[] {
  const raw = progressNotes as unknown;
  const entries =
    raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
  return entries
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { value?: unknown }).value : undefined))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

interface FocusAreaCardProps {
  focusArea: PlayerFocusArea;
  onClick?: () => void;
  /** Stagger index for the entrance reveal (list position). */
  index?: number;
}

export function FocusAreaCard({ focusArea, onClick, index = 0 }: FocusAreaCardProps) {
  const reduced = useReducedMotionGuard();

  // DB rows use `area_type`; `category` was the client-side name. Accept both
  // so we don't crash on rows that only ship `area_type`.
  const areaKey = focusArea.category ?? (focusArea as unknown as { area_type?: string }).area_type;
  const config = getFocusAreaConfig(areaKey);
  const AreaIcon = FOCUS_AREA_ICON_MAP[config.icon] ?? IconTarget;

  const series = progressSeries(focusArea.progress_notes);
  const hasTrend = series.length >= 2;

  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: DURATION.medium, ease: EASE_CINEMATIC, delay: stagger(index) }}
    >
      <Surface
        padding="md"
        interactive={!!onClick}
        className={cn('group text-left', onClick && 'cursor-pointer')}
        // Keyboard-operable when clickable — a bare onClick div is a mouse-only
        // trap otherwise (WCAG 2.1.1). Surface renders a plain div, so the
        // role/tabIndex/onKeyDown are added here, not in the shared primitive.
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        <div className="flex items-start gap-3">
          <Badge
            tone={PRIORITY_TONE[focusArea.priority] ?? 'neutral'}
            numeric
            className="h-8 w-8 shrink-0 justify-center rounded-fw-md p-0 text-body-sm"
          >
            {focusArea.priority}
          </Badge>

          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
            <AreaIcon size={17} />
          </span>

          <div className="min-w-0 flex-1">
            <h4 className="font-fw-sans text-body font-medium leading-snug text-text-primary">
              {focusArea.title}
            </h4>
            <p className="mt-1 line-clamp-2 font-fw-sans text-body-sm leading-relaxed text-text-secondary">
              {focusArea.description}
            </p>

            {focusArea.target_improvement ? (
              <Badge tone="accent" size="sm" leadingIcon={<IconTarget size={11} />} className="mt-2.5">
                {focusArea.target_improvement}
              </Badge>
            ) : onClick ? (
              // Bug #58/#75 parity: this read-only card used to leave a focus
              // area with no target as a dead placeholder-less gap (no visible
              // affordance at all), so a player just saw a description with
              // nothing to do next. Give it a real, tappable CTA wired to the
              // SAME handler the whole card already uses (My Development is
              // where a target actually gets set), gated on `onClick` being
              // wired so it's never a dead button. `stopPropagation` avoids
              // double-firing the parent card's own onClick.
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<IconTarget size={11} />}
                className="mt-2.5 border border-dashed border-border-subtle px-3 py-1 text-caption"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
              >
                Set a target
              </Button>
            ) : null}

            {/* Progress sparkline — only when the coach/player has logged ≥2
                progress entries (see progressSeries' honesty contract above).
                No sparkline at all otherwise, never a fabricated flat line. */}
            {hasTrend ? (
              <div className="mt-2.5 flex items-center gap-2">
                <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
                  Progress
                </span>
                <Sparkline data={series} label={`Progress trend for ${focusArea.title || 'this focus area'}`} />
              </div>
            ) : null}

            {focusArea.specific_drills && focusArea.specific_drills.length > 0 && (
              <p className="mt-2 font-fw-sans text-eyebrow text-text-tertiary">
                {focusArea.specific_drills.length} recommended drill{focusArea.specific_drills.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {onClick && (
            <IconChevronRight
              size={15}
              className="mt-1 shrink-0 text-text-tertiary transition-colors duration-base group-hover:text-accent-600"
            />
          )}
        </div>
      </Surface>
    </m.div>
  );
}
