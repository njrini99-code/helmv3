import { redirect } from 'next/navigation';

// Legacy player insights route. Keep for backward compatibility and bookmarks.
// Canonical player AI experience now lives at /golf/dashboard/coachhelm.
//
// BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
// this path at the framework routing layer, before this page ever renders —
// the fix for the React #310 "rendered more hooks" crash on client-navigation
// into bare redirect() shims. This component stays only as a fallback for
// anything the config layer misses; it should no longer actually execute in
// normal operation.
export default function MyInsightsPage() {
  redirect('/golf/dashboard/coachhelm');
}
