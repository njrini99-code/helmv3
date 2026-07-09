import type { Metadata } from 'next';

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
  return <>{children}</>;
}
