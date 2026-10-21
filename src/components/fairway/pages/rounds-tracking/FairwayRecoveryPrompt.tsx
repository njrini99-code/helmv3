'use client';

/**
 * Fairway · Rounds · Tracking — the recovery tap (CoachHelm supercharge
 * Slice 8b, design 01 row 7 and 03 §3.3).
 *
 * One compact row after a tee shot that finished in the rough or an 'other'
 * lie: "Next shot from there? Clear shot · Blocked / punch out" and Skip.
 * Never a modal, never blocking: the screen's one primary action (Next shot)
 * is untouched and the chips are secondary. State and the write live in
 * `useRecoveryPrompt` and `useShotTracking.handleTagRecovery`; this file only
 * draws.
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import type { RecoveryPromptView } from './useRecoveryPrompt';

const CHOICES: readonly { value: boolean; label: string }[] = [
  { value: false, label: 'Clear shot' },
  { value: true, label: 'Blocked / punch out' },
];

export function FairwayRecoveryPrompt({ prompt }: { prompt: RecoveryPromptView | null }) {
  if (!prompt) return null;
  const { saved, result } = prompt;
  const caption = result === 'other' ? 'Tee shot, other lie' : 'Tee shot, rough';
  return (
    <section
      aria-label="Was the next shot a recovery"
      data-slot="recovery-prompt"
      className="mb-3 rounded-fw-md border border-border-subtle bg-surface px-4 py-3 shadow-flat"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 font-fw-sans text-sm font-medium text-text-primary">
          Next shot from there?{' '}
          <span className="font-normal text-text-tertiary">{caption}</span>
        </p>
        {saved === null && (
          <Button variant="ghost" size="sm" onClick={prompt.onSkip} aria-label="Skip the recovery question">
            Skip
          </Button>
        )}
      </div>
      <div role="group" aria-label="Next shot from where the tee shot finished" className="mt-2 grid grid-cols-2 gap-2">
        {CHOICES.map(({ value, label }) => {
          const chosen = saved === value;
          return (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="sm"
              haptic="selection"
              aria-pressed={chosen}
              onClick={() => prompt.onPick(value)}
              className={cn(
                'w-full rounded-fw-sm ring-1',
                chosen
                  ? 'bg-accent-fill text-text-on-accent-fill ring-accent-600'
                  : 'bg-surface-sunken text-text-primary ring-border-subtle hover:bg-surface-tint',
              )}
            >
              {label}
            </Button>
          );
        })}
      </div>
      {saved !== null && (
        <p role="status" aria-live="polite" className="mt-2 font-fw-sans text-caption text-text-tertiary">
          {saved ? 'Saved: a recovery shot' : 'Saved: a clear shot'}
        </p>
      )}
    </section>
  );
}
