import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';

export const metadata: Metadata = { title: 'Reliability' };

export const dynamic = 'force-dynamic';

/** Reliability space (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). */
export default async function ReliabilitySpacePage() {
  await requireSuperAdmin();
  return (
    <SpaceRoot br={BR.feed.empty}>
      <SpaceHeader eyebrow="Reliability" title="What is breaking, for whom, on which button." />
      <SpaceState br={BR.feed.empty} title="This space is being built." />
    </SpaceRoot>
  );
}
