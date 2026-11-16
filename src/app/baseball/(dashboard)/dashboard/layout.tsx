import type { Metadata } from 'next';

/**
 * BaseballHelm's tab titles (GAP-R-18). The group layout above this one is a client component and cannot export
 * metadata, so the template lives here: pages and folder layouts declare a bare noun ("Team Roster") and this adds
 * the one product suffix. The dashboard's own page only redirects, so it needs no title of its own.
 */
export const metadata: Metadata = { title: { template: '%s · BaseballHelm', default: 'BaseballHelm' } };

export default function BaseballDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
