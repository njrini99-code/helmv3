'use client';

/**
 * CalendarHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * calendar control-bar implementation (date title + prev/next/today nav +
 * view toggle + secondary-timezone overlay + Add Event) now lives in
 * `src/components/ui/page-header.tsx` as `variant="calendar"`; this module
 * re-exports a wrapper so every existing `<CalendarHeader …>` call site keeps
 * working byte-for-byte (same props, same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl).
 */

import { PageHeader, type CalendarHeaderProps as VariantProps } from '@/components/ui/page-header';

export type { CalendarView } from '@/components/ui/page-header';

export type CalendarHeaderProps = Omit<VariantProps, 'variant'>;

export function CalendarHeader(props: CalendarHeaderProps) {
  return <PageHeader variant="calendar" {...props} />;
}
