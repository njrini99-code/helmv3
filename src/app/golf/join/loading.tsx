import { FormPageSkeleton } from '@/components/ui/skeleton';

/**
 * `join/**` is named in the design contract's carve-out — `FormPageSkeleton`
 * here is CORRECT, not a shape-match defect. The only evidenced violation
 * was accessibility: `FormPageSkeleton` (src/components/ui/skeleton.tsx:
 * 1305-1333) renders no `role`/`aria-busy`/announcement of its own, so this
 * fallback had none. Added the wrapper; kept `min-h-full` since that's the
 * skeleton's own root class (skeleton.tsx:1307) and an auto-height wrapper
 * would make that percentage resolve against nothing.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="min-h-full">
      <span className="sr-only">Loading the join-a-team form&hellip;</span>
      <FormPageSkeleton />
    </div>
  );
}
