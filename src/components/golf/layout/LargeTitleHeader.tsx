'use client';

/**
 * LargeTitleHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * iOS-native large-title implementation now lives in
 * `src/components/ui/page-header.tsx` as `variant="large-title"`; this module
 * re-exports a wrapper so every existing `<LargeTitleHeader …>` call site keeps
 * working byte-for-byte (same props, same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl) + A7
 * (single semantic <h1> per page).
 */

import { PageHeader, type LargeTitleHeaderProps as VariantProps } from '@/components/ui/page-header';

export type LargeTitleHeaderProps = Omit<VariantProps, 'variant'>;

export function LargeTitleHeader(props: LargeTitleHeaderProps) {
  return <PageHeader variant="large-title" {...props} />;
}
