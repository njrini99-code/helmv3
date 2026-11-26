import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';

export const metadata: Metadata = { title: 'People' };

export const dynamic = 'force-dynamic';

/** People space (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). */
export default async function PeopleSpacePage() {
  await requireSuperAdmin();
  return (
    <SpaceRoot br={BR.teams.empty}>
      <SpaceHeader eyebrow="People" title="Who uses Helm, team by team." />
      <SpaceState br={BR.teams.empty} title="This space is being built." />
    </SpaceRoot>
  );
}
