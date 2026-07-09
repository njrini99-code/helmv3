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
import { SkeletonVideos } from '@/components/ui/skeleton';

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
    <Suspense fallback={<div className="p-4 sm:p-6 lg:p-8"><SkeletonVideos /></div>}>
      <VideoLibraryPage />
    </Suspense>
  );
}
