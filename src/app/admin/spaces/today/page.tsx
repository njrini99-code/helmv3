import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';

export const metadata: Metadata = { title: 'Today' };

export const dynamic = 'force-dynamic';

/** Today space (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). */
export default async function TodaySpacePage() {
  await requireSuperAdmin();
  return (
    <SpaceRoot br={BR.today.empty}>
      <SpaceHeader eyebrow="Today" title="What is happening with Helm right now." />
      <SpaceState br={BR.today.empty} title="This space is being built." />
    </SpaceRoot>
  );
}
