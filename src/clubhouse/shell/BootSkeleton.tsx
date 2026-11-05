'use client';

import { usePathname } from 'next/navigation';
import { HomeSkeleton } from '../screens/home/HomeSkeleton';
import { SkelRows, Skeleton } from '../ui/States';

/**
 * What a cold entry draws inside the shell's silhouette (`/golf/loading.tsx`, above the dashboard layout). Home gets its
 * own skeleton; every other route gets a plain page shape, so Roster never opens on Home's green hero.
 */
export function BootSkeleton() {
  if (usePathname() === '/golf/dashboard') return <HomeSkeleton />;
  return (
    <main className="ch-boot-page" aria-busy="true" aria-label="Loading">
      <Skeleton width={180} height={28} radius={8} />
      <Skeleton width={260} height={13} />
      <div className="ch-boot-page__card" aria-hidden="true">
        <SkelRows rows={5} lead trail />
      </div>
    </main>
  );
}
