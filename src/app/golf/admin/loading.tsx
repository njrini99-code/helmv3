import { GenericPageSkeleton } from '@/components/ui/skeleton';

// Suspense fallback for the /golf/admin segment itself — shown while
// ./layout.tsx's own async admin-role check (Supabase auth + a `users` role
// query) is pending, before either child route paints. This segment has no
// page.tsx of its own (a next.config.mjs redirect sends `/golf/admin` exactly
// to `/admin`); its live children are structurally unrelated — the Fairway
// sidebar shell at ./crm/page.tsx (own loading.tsx, shape-matched there) and
// the plain warm/cream table page at ./demo-sessions/page.tsx (no loading.tsx
// of its own, so THIS is its real fallback). There is no single shape that
// matches both, so this stays the generic legacy skeleton (correct primitive
// for a non-golf-dashboard admin surface per design-system.md) rather than
// being reshaped around one child at the other's expense. It is visible only
// for the brief admin-auth-check window — crm/loading.tsx or the
// demo-sessions table itself takes over immediately after.
//
// Unlike its Fairway counterpart (FairwayGenericPageSkeleton,
// src/components/fairway/feedback/GenericPageSkeleton.tsx:22-28, which bakes
// role="status"/aria-busy/aria-live/sr-only into its own markup), the legacy
// `@/components/ui/skeleton` GenericPageSkeleton used here
// (src/components/ui/skeleton.tsx:1269-1298) has zero aria/role attributes of
// its own — it's plain `<div>`s. So this file supplies that semantics at the
// call site, matching the wrapper style ./crm/loading.tsx:26-30 uses around
// its own fallback.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <GenericPageSkeleton />
    </div>
  );
}
