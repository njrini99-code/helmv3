import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';

export const metadata: Metadata = { title: 'Product' };

export const dynamic = 'force-dynamic';

/** Product space (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). */
export default async function ProductSpacePage() {
  await requireSuperAdmin();
  return (
    <SpaceRoot br={BR.product.empty}>
      <SpaceHeader eyebrow="Product" title="Which parts of the app are alive." />
      <SpaceState br={BR.product.empty} title="This space is being built." />
    </SpaceRoot>
  );
}
