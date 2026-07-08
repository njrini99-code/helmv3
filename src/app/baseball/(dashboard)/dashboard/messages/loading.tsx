import { SkeletonMessages } from '@/components/ui/skeleton';

// No page-level <Header> — the Fairway shell (BaseballFairwayShell → AppShell)
// already owns the one top bar + breadcrumb for every dashboard route,
// "Messages" included. Mirrors the sibling announcements/tasks/documents/
// travel `loading.tsx` files, none of which mount a Header either.
export default function MessagesLoading() {
  return (
    <div className="p-6 lg:p-8">
      <SkeletonMessages />
    </div>
  );
}
