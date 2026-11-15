import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your golf team dashboard: performance tracking, team management, and coaching tools.',
};

// The Clubhouse shell (the parent (dashboard)/layout.tsx) draws the frame, the CoachHelm launcher and the route
// transition; this segment only carries the metadata.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
