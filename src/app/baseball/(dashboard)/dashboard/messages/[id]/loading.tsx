import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { IconChevronLeft } from '@/components/icons';
import { PaperCard, pressableClass } from '@/components/baseball/living-annual';
import { cn } from '@/lib/utils';

const MESSAGES_HREF = '/baseball/dashboard/messages';

/**
 * ============================================================================
 * ConversationLoading — Suspense fallback for `/messages/[id]`.
 * ----------------------------------------------------------------------------
 * #481 fix: this previously rendered a hand-rolled skeleton on legacy
 * `warm-200`/`cream-50` tokens with NO relationship to the Living-Annual
 * paper chrome `ConversationClient` actually mounts (hairline borders,
 * `--paper` surface, `PaperCard` bubbles) — a real chrome flash on hydrate,
 * the exact "loading chrome drift" class of bug the issue names. It also
 * carried the SAME bare `100dvh-4rem` height budget as the pre-fix loaded
 * thread: no notch-inset term, no FairwayBottomNav clearance term, so this
 * fallback was itself also clipped behind the bottom nav on phones.
 *
 * Shaped exactly like `ConversationClient`'s loaded thread (back link +
 * masthead row, bubble well, composer) using the SAME height formula, so
 * hydration never swaps in a differently-structured or differently-sized
 * page. The back link is real (not a skeleton bar) — same reasoning as
 * `MessagesFairway`'s `RAIL_TITLE_SKELETON`: a static element that's
 * byte-identical in both states never needs to "swap in" on mount.
 * ========================================================================== */
export default function ConversationLoading() {
  return (
    <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-var(--golf-mobile-bottom-nav-offset,0px))] flex-col">
      <div className="flex shrink-0 flex-col border-b border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4 sm:px-6 sm:py-5">
        <Link
          href={MESSAGES_HREF}
          className={cn(
            'mb-3 inline-flex w-fit items-center gap-1 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary',
            pressableClass({ ink: 'team' }),
          )}
        >
          <IconChevronLeft size={14} aria-hidden="true" />
          Messages
        </Link>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="mt-2 h-6 w-40" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4">
          <div className="flex max-w-[85%] flex-col items-start gap-1.5 sm:max-w-md">
            <div className="h-8 w-8 flex-shrink-0 rounded-full bg-surface-sunken" />
            <PaperCard className="px-4 py-2.5">
              <Skeleton className="h-4 w-40" />
            </PaperCard>
          </div>
          <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5 sm:max-w-md">
            <PaperCard className="px-4 py-2.5">
              <Skeleton className="h-4 w-32" />
            </PaperCard>
          </div>
          <div className="flex max-w-[85%] flex-col items-start gap-1.5 sm:max-w-md">
            <div className="h-8 w-8 flex-shrink-0 rounded-full bg-surface-sunken" />
            <PaperCard className="px-4 py-2.5">
              <Skeleton className="h-4 w-52" />
            </PaperCard>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4 sm:px-6 sm:py-5">
        <PaperCard className="mx-auto flex max-w-[720px] items-center gap-2 p-2">
          <Skeleton className="h-10 flex-1 rounded-fw-md" />
          <Skeleton className="h-10 w-10 rounded-fw-md" />
        </PaperCard>
      </div>
    </div>
  );
}
