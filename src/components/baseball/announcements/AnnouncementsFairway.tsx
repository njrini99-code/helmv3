'use client';

/**
 * ============================================================================
 * AnnouncementsFairway — Living-Annual presentation of the baseball
 * Announcements page (Pressbox lane, GREEN). Migration wave: P4.4.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME computed state + handlers the page
 * owns (announcements, players, loading, error, recent count, and the fetch
 * refresh) and composes the chrome — masthead + create action, "new this
 * week" stamp, loading/empty/error states — from
 * `@/components/baseball/living-annual`. No data path is touched here.
 *
 * The coach/player list views + create flow (`AnnouncementsCoachView`,
 * `AnnouncementsPlayerView`, `CreateAnnouncementFlow`) are reused verbatim —
 * they keep every server action (publish, delete, read-receipts) they
 * already owned. Reused-component prop types are borrowed via `ComponentProps`.
 * ========================================================================== */

import type { ComponentProps } from 'react';
import {
  SectionMasthead,
  EditorsLetter,
  EmptyIssue,
  InkBadge,
  PaperCard,
} from '@/components/baseball/living-annual';
import { AnnouncementsCoachView } from './AnnouncementsCoachView';
import { AnnouncementsPlayerView } from './AnnouncementsPlayerView';
import { CreateAnnouncementFlow } from './CreateAnnouncementFlow';

type CoachViewProps = ComponentProps<typeof AnnouncementsCoachView>;
type CreateFlowProps = ComponentProps<typeof CreateAnnouncementFlow>;

export interface AnnouncementsFairwayProps {
  announcements: CoachViewProps['announcements'];
  players: CreateFlowProps['players'];
  selectedTeamId: string | null;
  isCoach: boolean;
  playerId: string;
  loading: boolean;
  recentCount: number;
  onRefresh: () => void;
}

/** Skeleton loader for the card list — matches the Paper card it stands in for. */
function AnnouncementsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <PaperCard key={i} className="animate-pulse px-5 py-4">
          <div className="h-4 w-2/5 rounded-full bg-[color:var(--hairline)]" />
          <div className="mt-3 h-3 w-4/5 rounded-full bg-[color:var(--hairline)]" />
          <div className="mt-2 h-3 w-1/3 rounded-full bg-[color:var(--hairline)]" />
        </PaperCard>
      ))}
    </div>
  );
}

export function AnnouncementsFairway({
  announcements,
  players,
  selectedTeamId,
  isCoach,
  playerId,
  loading,
  recentCount,
  onRefresh,
}: AnnouncementsFairwayProps) {
  const createFlow =
    isCoach && selectedTeamId ? (
      <CreateAnnouncementFlow players={players} teamId={selectedTeamId} onCreated={onRefresh} />
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow="THE PRESSBOX · ANNOUNCEMENTS"
        title="Announcements"
        ink="team"
        actions={createFlow}
      />

      {recentCount > 0 && !loading ? (
        <div className="mt-6">
          <InkBadge label={`${recentCount} new this week`} tone="team" variant="solid" />
        </div>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <AnnouncementsSkeleton />
        ) : !selectedTeamId ? (
          <EditorsLetter
            ink="team"
            title="No team selected."
            body="Select a team from the sidebar to view announcements."
          />
        ) : announcements.length === 0 ? (
          <EmptyIssue variant="announcements" ink="team" action={createFlow} />
        ) : isCoach ? (
          <AnnouncementsCoachView announcements={announcements} onDeleted={onRefresh} />
        ) : (
          <AnnouncementsPlayerView announcements={announcements} playerId={playerId} />
        )}
      </div>
    </div>
  );
}
