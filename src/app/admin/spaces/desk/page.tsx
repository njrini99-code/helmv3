import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';

export const metadata: Metadata = { title: 'Desk' };

export const dynamic = 'force-dynamic';

/** Desk space (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). */
export default async function DeskSpacePage() {
  await requireSuperAdmin();
  return (
    <SpaceRoot br={BR.desk.empty}>
      <SpaceHeader eyebrow="Desk" title="What is waiting on you." />
      <SpaceState br={BR.desk.empty} title="This space is being built." />
    </SpaceRoot>
  );
}
