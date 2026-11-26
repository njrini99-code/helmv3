import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';

export const metadata: Metadata = { title: 'Ship' };

export const dynamic = 'force-dynamic';

/** Ship space (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). */
export default async function ShipSpacePage() {
  await requireSuperAdmin();
  return (
    <SpaceRoot br={BR.ship.empty}>
      <SpaceHeader eyebrow="Ship" title="What is live and what is next." />
      <SpaceState br={BR.ship.empty} title="This space is being built." />
    </SpaceRoot>
  );
}
