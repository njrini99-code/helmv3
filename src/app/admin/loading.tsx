import { FairwayGenericPageSkeleton } from '@/components/fairway';

/**
 * Helm Bridge root loading UI.
 *
 * `src/app/admin/layout.tsx` does `await checkSuperAdminAccess()` (a DB
 * round-trip) before it renders `AdminShell` at all — that's real async work
 * in the layout itself, so the whole `/admin` segment suspends on first
 * navigation and Next.js needs a loading boundary at this level (the shell
 * hasn't mounted yet, so no panel-level skeleton is on screen to cover it).
 * Reuses the same Fairway-tokened generic skeleton other routes fall back to
 * when they don't have a page-shape-matched one — swap for something more
 * specific if the Bridge overview ever gets its own.
 */
export default function AdminLoading() {
  return <FairwayGenericPageSkeleton />;
}
