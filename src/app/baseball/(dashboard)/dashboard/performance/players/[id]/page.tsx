// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/players/[id]/page.tsx
//
// Performance player profile — redirects to the canonical player operating
// record at /baseball/dashboard/players/[id]. That page holds the full
// profile (stats, timeline, passport, coach notes, videos) and is already
// accessible to all staff member types. A separate performance-only detail
// view is a deferred enhancement; for now the redirect eliminates the 404
// that the Today Weight Room board + Live Weight Room "Full profile →" links
// previously produced.
// =============================================================================

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PerformancePlayerRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/baseball/dashboard/players/${id}`);
}
