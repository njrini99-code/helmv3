'use client';

/**
 * ============================================================================
 * SignalChip — hot/watch/quiet coaching-signal pill (mockup §.sig)
 * ----------------------------------------------------------------------------
 * `hot` = top-performer / improving (accent wash), `watch` = declining /
 * needs attention (the shared warning-bg/ink/ring trio already converged on
 * across the app), `quiet` = nothing notable (sunken neutral).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { SignalChipProps, SignalTone } from './types';

const TONE_CLASSES: Record<SignalTone, string> = {
  hot: 'bg-accent-50 text-accent-700 border-accent-200',
  watch: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring',
  quiet: 'bg-surface-sunken text-text-tertiary border-border-subtle',
};

export function SignalChip({ tone, children }: SignalChipProps) {
  return (
    <span
      data-slot="signal-chip"
      data-tone={tone}
      className={cn(
        'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-fw-sans text-caption font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}
