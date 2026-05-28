'use client';

/**
 * MobileNavHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * sticky hamburger/back top-bar implementation now lives in
 * `src/components/ui/page-header.tsx` as `variant="mobile-nav"`; this module
 * re-exports a wrapper so every existing `<MobileNavHeader …>` call site keeps
 * working byte-for-byte (same props, same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl) + A7
 * (single semantic <h1> per page).
 */

import { PageHeader, type MobileNavHeaderProps as VariantProps } from '@/components/ui/page-header';

export type MobileNavHeaderProps = Omit<VariantProps, 'variant'>;

export function MobileNavHeader(props: MobileNavHeaderProps) {
  return <PageHeader variant="mobile-nav" {...props} />;
}
