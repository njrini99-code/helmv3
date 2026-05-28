'use client';

/**
 * PremiumRoundHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * premium round-summary card (avatar + player + course meta + big score +
 * staggered stat grid + notes) now lives in
 * `src/components/ui/page-header.tsx` as `variant="round"`; this module
 * re-exports a wrapper so every existing `<PremiumRoundHeader …>` call site
 * keeps working byte-for-byte (same props, same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl).
 */

import { PageHeader, type RoundHeaderProps as VariantProps } from '@/components/ui/page-header';

export type PremiumRoundHeaderProps = Omit<VariantProps, 'variant'>;

export function PremiumRoundHeader(props: PremiumRoundHeaderProps) {
  return <PageHeader variant="round" {...props} />;
}
