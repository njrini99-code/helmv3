'use client';

/**
 * ============================================================================
 * RxCard — the "prescription" callout (mockup §.rx)
 * ----------------------------------------------------------------------------
 * A quiet accent-tinted card for a coach/CoachHelm recommendation sitting
 * beside a RampMatrix in a drill panel: an uppercase eyebrow title over a
 * free-form body.
 * ========================================================================== */

import type { RxCardProps } from './types';

export function RxCard({ title, children }: RxCardProps) {
  return (
    <div data-slot="rx-card" className="rounded-fw-md border border-accent-200 bg-accent-50 px-4 py-3.5">
      <p className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-accent-700">{title}</p>
      <div className="mt-1.5 font-fw-sans text-body-sm text-text-secondary">{children}</div>
    </div>
  );
}
