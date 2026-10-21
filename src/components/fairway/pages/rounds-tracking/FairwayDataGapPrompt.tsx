'use client';

/**
 * Fairway · Rounds · Tracking — the one-tap data-gap prompt (CoachHelm
 * supercharge Slice 8a, design 03 §3.3 and 04 Example 12).
 *
 * One compact row after a missed first putt from a distance band a read is
 * waiting on: "Which side? Short · Long · High · Low", the counter ("4 of 10
 * for your 5–10 ft putt read") and Skip. Never a modal, never blocking: the
 * shot screen's one primary action (Next shot / Complete hole) is untouched,
 * the chips are secondary, and the row disappears at the read's target.
 * State and the write live in `useDataGapPrompt` and
 * `useShotTracking.handleTagPuttMiss`; this file only draws.
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { PUTT_MISS_LABEL, PUTT_MISS_OPTIONS } from '@/lib/coachhelm/data-gap/asks';
import type { DataGapPromptView } from './useDataGapPrompt';

export function FairwayDataGapPrompt({ prompt }: { prompt: DataGapPromptView | null }) {
  if (!prompt) return null;
  const { ask, saved, counter, distanceFeet } = prompt;
  const caption = distanceFeet === null ? 'First putt' : `First putt, ${distanceFeet} ft`;
  return (
    <section
      aria-label="Tag the first putt's miss"
      data-slot="data-gap-prompt"
      className="mb-3 rounded-fw-md border border-border-subtle bg-surface px-4 py-3 shadow-flat"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 font-fw-sans text-sm font-medium text-text-primary">
          Which side?{' '}
          <span className="font-normal text-text-tertiary">{caption}</span>
        </p>
        {!saved && (
          <Button variant="ghost" size="sm" onClick={prompt.onSkip} aria-label="Skip tagging this putt">
            Skip
          </Button>
        )}
      </div>
      <div
        role="group"
        aria-label={`Which side the first putt missed, for your read "${ask.readTitle || ask.bandLabel}"`}
        className="mt-2 grid grid-cols-4 gap-2"
      >
        {PUTT_MISS_OPTIONS.map((tag) => {
          const chosen = saved === tag;
          return (
            <Button
              key={tag}
              type="button"
              variant="ghost"
              size="sm"
              haptic="selection"
              aria-pressed={chosen}
              onClick={() => prompt.onPick(tag)}
              className={cn(
                'w-full rounded-fw-sm ring-1',
                chosen
                  ? 'bg-accent-fill text-text-on-accent-fill ring-accent-600'
                  : 'bg-surface-sunken text-text-primary ring-border-subtle hover:bg-surface-tint',
              )}
            >
              {PUTT_MISS_LABEL[tag]}
            </Button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="mt-2 font-fw-sans text-caption tabular-nums text-text-tertiary">
        {saved ? `Tagged ${PUTT_MISS_LABEL[saved].toLowerCase()} · ${counter}` : counter}
      </p>
    </section>
  );
}
