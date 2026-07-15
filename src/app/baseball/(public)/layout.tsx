import type { Metadata } from 'next';
import { PublicMotionScope } from './PublicMotionScope';

// Server Component — public-facing baseball profile/team/program pages
// (team/[id], player/[id], program/[id], packet). No override previously
// existed here, so these routes silently inherited the root layout's
// `/manifest.json` (the GolfHelm PWA manifest). Use the real Next metadata
// API since this layout isn't a client component.
export const metadata: Metadata = {
  manifest: '/baseball-manifest.webmanifest',
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PublicMotionScope mounts <LazyMotion> for the whole route group — without
  // it, the Living Annual `m`-based atoms these pages render (Masthead,
  // RuledStatLine, HairlineRule) never leave their `hidden` (opacity: 0)
  // entrance variant for visitors without `prefers-reduced-motion` on. See
  // PublicMotionScope.tsx for the full trace. This layout itself stays a
  // Server Component — the LazyMotion boundary lives in that client child.
  return <PublicMotionScope>{children}</PublicMotionScope>;
}
