import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { InstrumentPanel } from '@/components/fairway/instrument';

/**
 * Suspense fallback for the Messages inbox.
 *
 * A skeleton's whole job is to occupy the geometry the real page is about to
 * occupy. This one had drifted: it painted the full editorial masthead (eyebrow
 * + title + description + a two-button row), `py-6`, `mt-6`, and a bordered
 * card around the rail — none of which the phone layout renders any more. The
 * result was a visible reconstruction on entering the tab: roughly 120px of
 * masthead skeleton appeared, then vanished as the real page mounted, taking
 * the card border with it and yanking every conversation row upward. That is
 * the "it hot reloads and looks crappy" report, and it is a mismatch between
 * this file and FairwayMessages, not a rendering fault.
 *
 * It now mirrors the shipped layout at BOTH widths:
 *   • phone — no masthead, a right-aligned action row, `py-3`
 *   • `md`+ — the masthead and the two-pane grid, unchanged
 *
 * The conversation rail itself does NOT mirror `MessageConversationRail`'s
 * settled/mobile-flattened shape (bordered on `md`+, flat with a search field
 * on phone) — it mirrors the rail's `loading` branch instead
 * (MessageConversationRail.tsx:335-359), because that branch is what the user
 * actually sees first: `useGolfConversations()` initializes
 * `loading: true` (use-golf-messages.ts:693), and that branch has no
 * `isDesktop` gating of its own — at every width it is an `InstrumentPanel
 * depth="base" padding="md" header="Conversations"` with 5 rows and no search
 * field. This file previously shape-matched the SETTLED rail (flat on phone,
 * search field, 7 rows), which meant the real first paint jumped from this
 * flat/search-topped skeleton to a bordered, headed, search-less panel before
 * finally settling back to the flat/search shape once data resolved — the
 * exact double reconstruction this file exists to prevent. Fix belongs here,
 * not in `MessageConversationRail`: the loading fallback must match whatever
 * shape actually paints first, even where that shape itself might warrant its
 * own follow-up.
 *
 * The height calc mirrors FairwayMessages' `mobileShowChat === false` branch
 * (the only state a first paint can be in — `mobileShowChat` is
 * `useState(false)`, never derived from the URL, so the thread is never open
 * before hydration): `4rem` top bar + `2rem` AppShell has already reserved
 * above the `56px` bottom nav (its own comment: subtracting the shell's
 * reservation here is what stops the nav being counted twice) + the nav
 * itself + both safe areas (the real branch's trailing `max(0px, var(
 * --keyboard-height,0px) - …)` keyboard term is omitted here on purpose — the
 * custom property is unset before hydration, so it evaluates to `max(0px,
 * negative)` = 0 and contributes nothing to reserve). This file used to drop
 * the `2rem` term at both breakpoints, so the fallback stood 2rem (32px)
 * TALLER than the real page — everything below it dropped 32px the instant
 * FairwayMessages mounted.
 *
 * Keep this file and `FairwayMessages` / `MessageConversationRail` in step. A
 * skeleton that no longer matches is worse than none: it manufactures exactly
 * the layout jump it exists to prevent.
 *
 * Two more drifts, found and fixed the same way:
 *
 * (1) The rail's `InstrumentPanel` here carried an extra `flex flex-1
 * flex-col overflow-hidden`. The rail's real `loading` branch is only
 * `cn('flex flex-col', className)` (MessageConversationRail.tsx:341), and
 * `FairwayMessages` passes it no `className`
 * (FairwayMessages.tsx:619-628) — so the real panel is content-sized (5 rows
 * + bezel padding), sitting inside `PullToRefresh`'s `h-full w-full
 * overflow-y-auto` scroll wrapper (PullToRefresh.tsx:210-212), which is not a
 * flex container and does not stretch it either. The forced `flex-1` here
 * stretched the panel's glass/bezel background, border and shadow down to
 * fill the whole column instead of stopping after row 5 — a visible geometry
 * difference from the real first paint, now removed.
 *
 * (2) The `md`+ thread pane fabricated a header row (avatar + name), three
 * chat-bubble skeletons, and a composer bar inside a `Surface
 * elevation="border"`. For the entire span this file is shown,
 * `selectedConversationId` is still `null` (FairwayMessages.tsx:97) — the
 * auto-select effect only runs once `conversationsLoading` goes false
 * (FairwayMessages.tsx:278-289) — so `MessageThreadPane` is in its
 * no-conversation branch: an `InstrumentPanel depth="raised"` around a
 * centered, subtle-variant `EmptyState` (MessageThreadPane.tsx:775-804), with
 * no header, no bubbles, and no composer at all (the real composer only
 * mounts once a conversation is selected — FairwayMessages.tsx:676-701).
 * This file now mirrors that container and that centered-icon/title/
 * description/action shape instead of fabricating a populated thread that
 * cannot exist yet.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope(
        'flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-2rem-56px-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-canvas md:h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-2rem-env(safe-area-inset-bottom,0px))]',
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-6 lg:py-8">
        <span className="sr-only" role="status" aria-busy="true" aria-live="polite">
          Loading messages…
        </span>

        {/* PHONE — the action row that replaces the masthead below `md`. */}
        <div className="flex items-center justify-end gap-2 md:hidden">
          <Skeleton className="h-9 w-16 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>

        {/* `md`+ — the editorial masthead, unchanged. */}
        <div className="hidden flex-wrap items-end justify-between gap-4 md:flex">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-9 w-48 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-36 max-w-full" />
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>

        {/* Two-pane inbox. `mt-3` on phone / `mt-6` from `md` matches the page. */}
        <div className="mt-3 flex min-h-0 flex-1 grid-cols-12 items-stretch gap-5 md:mt-6 md:grid md:gap-6">
          {/* Conversation rail. `useGolfConversations()` starts
              `loading: true` (use-golf-messages.ts:693), so the rail's OWN
              `loading` branch (MessageConversationRail.tsx:335-359) is what
              actually paints here first — not its settled/mobile-flattened
              shape. That branch has no `isDesktop` gating at all: it is
              always an `InstrumentPanel depth="base" padding="md"
              header="Conversations"`, at every width, with 5 rows and no
              search field, and no `flex-1`/`overflow-hidden` of its own
              (`className={cn('flex flex-col', className)}` —
              MessageConversationRail.tsx:341 — with no `className` passed in,
              FairwayMessages.tsx:619-628) so it stays content-sized rather
              than stretching to fill the column. Mirror that exactly. */}
          <aside className="col-span-12 flex w-full flex-col md:col-span-5 md:w-auto lg:col-span-4">
            <InstrumentPanel
              depth="base"
              padding="md"
              header="Conversations"
              className="flex flex-col"
              aria-busy="true"
            >
              <div className="flex flex-col gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-fw-md px-3 py-2.5">
                    <Skeleton circle className="h-10 w-10 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between gap-2">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-3 w-40 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </InstrumentPanel>
          </aside>

          {/* Thread pane — hidden on mobile (mirrors mobileShowChat's rail-first
              default). For the entire span this file covers, `selectedConversationId`
              is still its initial `null` (FairwayMessages.tsx:97) — the
              auto-select effect only fires once `conversationsLoading` goes
              false (FairwayMessages.tsx:278-289) — so `selectedConversation`
              is `null` (FairwayMessages.tsx:291-294) and MessageThreadPane is
              in its no-conversation branch: an `InstrumentPanel depth="raised"`
              wrapping a centered, subtle-variant `EmptyState`
              (MessageThreadPane.tsx:775-804) — no header row, no message
              bubbles, no composer field. Mirror that shape, not a populated
              thread. */}
          <div className="hidden min-h-0 flex-col md:col-span-7 md:flex lg:col-span-8">
            <InstrumentPanel
              depth="raised"
              padding="none"
              aria-label="Conversation"
              className="flex min-h-[40vh] flex-1 flex-col overflow-hidden"
              aria-busy="true"
            >
              <div className="flex flex-1 items-center justify-center bg-surface px-4 py-5">
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <Skeleton circle className="h-12 w-12" />
                  <div className="space-y-1">
                    <Skeleton className="mx-auto h-5 w-40" />
                    <Skeleton className="mx-auto h-3.5 w-56 max-w-full" />
                  </div>
                  <Skeleton className="mt-1 h-9 w-32 rounded-full" />
                </div>
              </div>
            </InstrumentPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
