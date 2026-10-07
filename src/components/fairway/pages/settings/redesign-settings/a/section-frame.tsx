/**
 * Direction A · the frame every settings sub-page shares, and its skeleton.
 *
 * `[section]/loading.tsx` and the client shell's own waiting state both render
 * SettingsSectionSkeleton, and the loaded page renders the same
 * SettingsSectionFrame around its panels. So the back link and the title never
 * move between the route fallback, the shell's first paint and the settled
 * page; only the cards below them fill in.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { ViewHeader } from '@/components/fairway/view-header';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { IconArrowLeft } from '@/components/icons';
import { InlineSkeleton } from './inline-skeleton';
import { SETTINGS_INDEX_HREF, type SettingsSectionConfig, type SkeletonCard } from './sections';

/** The index and every sub-page share one reading column. */
export const SETTINGS_COLUMN = 'mx-auto w-full max-w-[720px] px-4 py-6 pb-24 md:px-6 md:py-8';

export function SettingsSectionFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={SETTINGS_COLUMN}>
      {/* `asChild` renders no leftIcon, so the arrow sits inside the link. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 text-text-tertiary">
        <Link href={SETTINGS_INDEX_HREF}>
          <IconArrowLeft size={16} aria-hidden />
          Settings
        </Link>
      </Button>
      <ViewHeader title={title} description={description} fullDescription disableAnimation />
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function SkeletonCards({ cards }: { cards: readonly SkeletonCard[] }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-7">
      <span className="sr-only">Loading settings…</span>
      {cards.map((card, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          {card.titled ? (
            <div className="flex items-center gap-2.5 px-1">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          ) : null}
          <div className={cn('rounded-card border border-border-subtle bg-surface p-6', card.minHeight)}>
            {card.fill === 'bar' ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-3 h-3 w-56 max-w-full" />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Frame + cards for a known section; a neutral two-card shape when the slug is unknown. */
export function SettingsSectionSkeleton({ config }: { config: SettingsSectionConfig | null }) {
  if (!config) {
    return (
      <div className={SETTINGS_COLUMN}>
        <Skeleton className="mb-4 h-8 w-24" />
        <Skeleton className="h-9 w-48" />
        <div className="mt-8">
          <SkeletonCards
            cards={[
              { minHeight: 'min-h-40', titled: true, fill: 'lines' },
              { minHeight: 'min-h-40', titled: true, fill: 'lines' },
            ]}
          />
        </div>
      </div>
    );
  }
  return (
    <SettingsSectionFrame
      title={config.title}
      description={
        config.description ??
        (config.dynamicDescription ? <InlineSkeleton className="h-4 w-40" /> : undefined)
      }
    >
      <SkeletonCards cards={config.skeleton} />
    </SettingsSectionFrame>
  );
}
