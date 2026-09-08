import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/admin/crm.
 *
 * Shape-matches CRMPage's REAL synchronous first paint, not its settled
 * two-column dashboard. CRMPage is a plain `'use client'` component
 * (`export default function CRMPage()`, page.tsx:158) with no wrapping async
 * Server Component or Suspense boundary above it, and it gates its entire
 * shell behind a `sessionReady` client state: `useState(false)` at
 * page.tsx:271, flipped to `true` only inside a `useEffect` (page.tsx:283-307)
 * that awaits a real Supabase `getUserResilient` round trip. Until that
 * resolves, `if (!sessionReady)` (page.tsx:1358-1367) is what actually
 * renders — both the SSR'd HTML and the first client paint before the effect
 * settles:
 *
 *   <div className="min-h-dvh bg-canvas flex items-center justify-center">
 *     <div className="flex items-center gap-3 text-sm text-text-secondary" role="status">
 *       <span className="h-4 w-4 rounded-full border-2 border-border-strong border-t-accent-500 animate-spin" />
 *       Checking admin session…
 *     </div>
 *   </div>
 *
 * a single centered spinner row — no sidebar, no sticky topbar, no card
 * stack. This file previously reconstructed the 260px rail + sticky topbar +
 * Today-tab card stack (ManualGmailTemplateBar → IntentRankingPanel →
 * TodayQueue), which is only CRMPage's SECOND state, mounted after that async
 * session check succeeds. Reserving that geometry here didn't remove the
 * "checking session" flash, it just relocated it to right after this
 * fallback unmounts. If the elaborate shell is worth reserving for the
 * common fast-auth case, that's a fix to CRMPage's redundant client-side
 * session gate (it duplicates the server-side check already done in
 * admin/layout.tsx), not to this file.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope('min-h-dvh bg-canvas flex items-center justify-center')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Checking admin session…</span>
      <div aria-hidden="true" className="flex items-center gap-3 text-sm text-text-secondary">
        <span className="h-4 w-4 rounded-full border-2 border-border-strong border-t-accent-500 animate-spin" />
        Checking admin session…
      </div>
    </div>
  );
}
