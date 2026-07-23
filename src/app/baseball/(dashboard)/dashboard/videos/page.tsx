// =============================================================================
// src/app/baseball/(dashboard)/dashboard/videos/page.tsx
//
// Video Library — server page that fetches all 5 view read-models via server
// actions and passes them to VideoLibraryClient. Auth + team context are
// enforced inside each server action via withBaseballAction; this page never
// touches Supabase directly.
//
// If any read-model fetch fails the page still renders — each action returns
// an empty model on error so the client shows an honest empty state rather
// than crashing. The player's own video mutations (edit/delete/set-primary)
// are handled inside the client component via the existing server actions in
// video-classes.ts.
// =============================================================================

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getLibraryVideos,
  getPlayerGroupedVideos,
  getEventGroupedClips,
  getTaggedClips,
  getEvidenceClips,
  type LibraryReadModel,
  type PlayerReadModel,
  type EventReadModel,
  type TaggedReadModel,
  type EvidenceReadModel,
} from '@/app/baseball/actions/videos';
import { VideoLibraryClient } from '@/components/baseball/video/VideoLibraryClient';
import { SectionMasthead } from '@/components/baseball/living-annual';
import { Skeleton } from '@/components/fairway';

// Route-level Suspense fallback shape-matched to VideoLibraryClient's real
// first viewport: the border-b SectionMasthead header (title + subtitle,
// no header actions), the 5-item view TabBar row, and the Library tab's
// card grid (grid-cols-1 sm:grid-cols-2 xl:grid-cols-3) — not the legacy
// two-button-header SkeletonVideos shape, which this route never renders.
function VideoLibraryLoading() {
  return (
    <>
      <div className="border-b border-[color:var(--hairline)] px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
        <SectionMasthead title="Video Library" ink="team">
          <Skeleton className="h-4 w-40" />
        </SectionMasthead>
      </div>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex items-center gap-1 rounded-xl bg-[var(--paper-canvas)] p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-card border border-[color:var(--hairline)] p-3">
              <Skeleton className="aspect-video w-full rounded-card" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Empty model defaults (used when a fetch fails gracefully)
const EMPTY_LIBRARY: LibraryReadModel = { videos: [], totalCount: 0 };
const EMPTY_PLAYERS: PlayerReadModel = { groups: [], totalPlayers: 0, totalVideos: 0 };
const EMPTY_EVENTS: EventReadModel = {
  groups: [],
  ungroupedClips: [],
  totalEvents: 0,
  totalClips: 0,
  hasVideoEvents: false,
};
const EMPTY_TAGGED: TaggedReadModel = { clips: [], totalCount: 0, hasVideoEvents: false };
const EMPTY_EVIDENCE: EvidenceReadModel = { clips: [], totalCount: 0, hasVideoEvents: false };

async function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function VideoLibraryPage() {
  // Resolve role + context server-side (needed to decide isCoach / activePlayerId)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // SECURITY: this page previously proceeded with `context = null` for an
  // unauthenticated request and still rendered VideoLibraryClient (with
  // empty/graceful read-model defaults) instead of redirecting — no data
  // leaked, but there was no server-side auth gate at all. Redirect like
  // every other guarded dashboard route.
  if (!user) redirect('/baseball/login');

  const context = await getActiveBaseballContext();

  // Determine role from context
  const isCoach = context?.activeRole === 'coach';
  const activePlayerId = context?.activePlayerId ?? null;

  // Fetch all 5 read-models in parallel (each is independently graceful)
  const [library, players, events, tagged, evidence] = await Promise.all([
    safeCall(getLibraryVideos, EMPTY_LIBRARY),
    safeCall(getPlayerGroupedVideos, EMPTY_PLAYERS),
    safeCall(getEventGroupedClips, EMPTY_EVENTS),
    safeCall(getTaggedClips, EMPTY_TAGGED),
    safeCall(getEvidenceClips, EMPTY_EVIDENCE),
  ]);

  return (
    <VideoLibraryClient
      isCoach={isCoach}
      activePlayerId={activePlayerId}
      library={library}
      players={players}
      events={events}
      tagged={tagged}
      evidence={evidence}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<VideoLibraryLoading />}>
      <VideoLibraryPage />
    </Suspense>
  );
}
