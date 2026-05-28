'use client';

/**
 * SupportHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * marketing/support top-bar implementation (brand link + native-aware Home
 * link on an overlay card) now lives in
 * `src/components/ui/page-header.tsx` as `variant="support"`; this module
 * re-exports a wrapper so the existing `<SupportHeader />` call site keeps
 * working byte-for-byte (same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl).
 */

import { PageHeader } from '@/components/ui/page-header';

export function SupportHeader() {
  return <PageHeader variant="support" />;
}
