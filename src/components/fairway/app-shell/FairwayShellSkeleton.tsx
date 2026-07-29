/**
 * ============================================================================
 * Fairway · app-shell · FairwayShellSkeleton
 * ----------------------------------------------------------------------------
 * The app-shell SILHOUETTE. Renders the geometry of `AppShell` — dark rail,
 * glass top bar, offset content column — with none of the data those parts
 * need, so it can be shown while an async LAYOUT is still resolving.
 *
 * WHY THIS EXISTS (the bug it fixes)
 * ----------------------------------
 * `loading.tsx` inside a segment sits INSIDE that segment's own layout
 * (layout → Suspense → page). It therefore cannot cover its own layout's
 * `await`. The boundary that covers an async layout is the one in the PARENT
 * segment.
 *
 * `src/app/golf/(dashboard)/layout.tsx` is async and does real work before it
 * can render anything: `getGolfSessionProfile()`, the active-team cookie,
 * `resolveCoachActiveTeamId`, `getCoachTeamSwitchContext` — plus, on the
 * post-onboarding slow path, a deliberate 300ms sleep. For that whole window
 * the only boundary above it is `src/app/golf/loading.tsx`, which used to
 * render the LEGACY `GenericPageSkeleton`: a centered `max-w-5xl` stack of
 * `surface-matte` / `cream-100` / `warm-200` blocks with no rail and no top
 * bar, in a visual language Fairway retired.
 *
 * So a single load of /golf/dashboard painted THREE different frames:
 *
 *   1. legacy generic skeleton   — no chrome, `max-w-5xl`, warm/cream tokens
 *   2. real Fairway shell        — rail + glass bar, `bg-canvas`
 *      + FairwayDashboardSkeleton (from (dashboard)/loading.tsx)
 *   3. the real dashboard
 *
 * Step 1 → 2 is the "it renders a different shell and then switches back"
 * report. Both files inside `(dashboard)/` were already correct, which is why
 * this kept getting missed: the offending file does not live in, or look like
 * it belongs to, the dashboard.
 *
 * WHAT MATCHES, AND WHY EXACTLY
 * -----------------------------
 * Every number here is read from the real chrome, not chosen to look close:
 *
 *   rail width      `w-[260px]`  — AppShell's `railOffset` expanded branch and
 *                                  FairwaySidebar's own non-collapsed width.
 *                                  AppShell seeds `collapsed` to `false` and
 *                                  only reads localStorage in an effect, so
 *                                  the EXPANDED rail is what the real shell
 *                                  first paints too — matching 260 (not the
 *                                  76px collapsed rail) is what keeps the
 *                                  content column from stepping sideways.
 *   rail surface    `bg-nav-bg` + `.on-dark`, brand block
 *                   `h-16 border-b border-white/[0.06] px-5`
 *   top bar         `sticky top-0` + the glass recipe, inner row
 *                   `flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8`
 *   content offset  `md:pl-[260px]`
 *   root            `bg-canvas bg-canvas-gradient font-fw-sans antialiased`
 *
 * The rail is shown via `hidden md:flex` — a pure CSS breakpoint, correct at
 * SSR for every viewport. (The real shell additionally mount-gates its rail on
 * `useMediaQuery`, which is a hydration concern, not a first-paint one.)
 *
 * The brand lockup is rendered FOR REAL rather than as a placeholder block. It
 * is static — it does not depend on session, role or team — so there is no
 * honesty problem in showing it, and it means the wordmark does not pop in a
 * beat after the frame it already sits in.
 *
 * Nav rows are quiet static bars, not shimmer. The rail's contents are
 * role-dependent (a coach and a player get different sections), so animating
 * them would advertise specific knowledge this component does not have. They
 * exist to stop the rail reading as an empty black column, nothing more.
 * ========================================================================== */

import Image from 'next/image';
import { FAIRWAY_SCOPE } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';

/** Nav-row placeholder widths (%), loosely tracking real label lengths. */
const NAV_ROWS = [62, 48, 71, 55, 44, 66, 51] as const;

export interface FairwayShellSkeletonProps {
  /**
   * The page-level skeleton to render inside the content column. Pass the
   * same one the destination's own `loading.tsx` uses so the hand-off from
   * this boundary to that one changes nothing but the chrome filling in.
   */
  children?: React.ReactNode;
  className?: string;
}

export function FairwayShellSkeleton({ children, className }: FairwayShellSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        FAIRWAY_SCOPE,
        'relative min-h-dvh w-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary antialiased',
        className,
      )}
    >
      <span className="sr-only">Loading…</span>

      {/* ── Desktop rail ─────────────────────────────────────────────────── */}
      <div
        aria-hidden
        className={cn(
          'on-dark fixed left-0 top-0 z-[var(--fw-z-nav)] hidden h-dvh w-[260px] flex-col',
          'bg-nav-bg pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] md:flex',
        )}
      >
        {/* Brand — the real lockup (static, session-independent). */}
        <div className="flex h-16 items-center border-b border-white/[0.06] px-5">
          <span className="flex items-center gap-2.5">
            <Image
              src="/helm-golf-logo-transparent.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 flex-shrink-0 object-contain"
              priority
              unoptimized
            />
            <span className="font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em] text-nav-text">
              Golf<span className="text-nav-accent">Helm</span>
            </span>
          </span>
        </div>

        {/* Nav placeholders — matching the real row rhythm (px-3.5 py-2.5 on a
            px-3 track, 18px leading icon). Deliberately static. */}
        <div className="flex-1 px-3 py-4">
          <div className="flex flex-col gap-0.5">
            {NAV_ROWS.map((width, i) => (
              <div key={i} className="flex items-center gap-3 rounded-fw-md px-3.5 py-2.5">
                {/* `bg-nav-surface` is the rail's OWN elevated tone (it is what
                    an active nav row sits on), so these placeholders recede into
                    the rail instead of reading as grey blocks on black. */}
                <span className="h-[18px] w-[18px] flex-shrink-0 rounded-sm bg-nav-surface" />
                <span
                  className="h-2.5 rounded-full bg-nav-surface/70"
                  style={{ width: `${width}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content column (offset by the rail) ──────────────────────────── */}
      <div className="relative flex min-h-dvh flex-col md:pl-[260px]">
        {/* Top bar — the same glass recipe as FairwayTopBar. */}
        <div
          aria-hidden
          className={cn(
            'sticky top-0 z-[var(--fw-z-sticky)] w-full pt-[env(safe-area-inset-top)]',
            'bg-surface md:bg-[var(--fw-glass-bg)]',
            'md:supports-[backdrop-filter]:backdrop-blur-[var(--fw-blur-glass)]',
            'md:supports-[backdrop-filter]:backdrop-saturate-[var(--fw-glass-saturate)]',
            'border-b border-[var(--fw-glass-border)]',
            '[box-shadow:inset_0_1px_0_0_var(--fw-glass-highlight),inset_0_-1px_0_0_var(--fw-glass-border-bot)]',
            '[@media(prefers-reduced-transparency:reduce)]:bg-surface',
          )}
        >
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <span className="h-3 w-40 max-w-[45%] rounded-full bg-text-primary/[0.07]" />
            <span className="ml-auto flex items-center gap-2">
              <span className="h-8 w-8 rounded-full bg-text-primary/[0.06]" />
              <span className="h-8 w-8 rounded-full bg-text-primary/[0.06]" />
            </span>
          </div>
        </div>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
