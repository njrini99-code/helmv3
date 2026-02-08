import { redirect } from 'next/navigation';

// Legacy player insights route. Keep for backward compatibility and bookmarks.
// Canonical player AI experience now lives at /golf/dashboard/coachhelm.
export default function MyInsightsPage() {
  redirect('/golf/dashboard/coachhelm');
}
