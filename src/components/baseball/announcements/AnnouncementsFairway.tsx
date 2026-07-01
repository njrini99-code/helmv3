'use client';

/**
 * ============================================================================
 * AnnouncementsFairway — Fairway (warm-premium) presentation of the baseball
 * Announcements page. Phase B leaf migration, Wave 1 · announcements.
 * Flag-gated behind `isRedesignEnabled()` — see the page fork.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME computed state + handlers the page owns
 * (announcements, players, loading, error, recent count, and the fetch
 * refresh) and migrates the CHROME — header + create action, "new this week"
 * badge, empty/loading/error states — to `@/components/fairway` primitives.
 *
 * The coach/player list views + create flow (`AnnouncementsCoachView`,
 * `AnnouncementsPlayerView`, `CreateAnnouncementFlow`) are reused verbatim
 * inside the new frame per playbook §3.5 — they keep every server action
 * (publish, delete, read-receipts) they already owned. No data path is touched
 * here. Reused-component prop types are borrowed via `ComponentProps`.
 * ========================================================================== */

import type { ComponentProps } from 'react';
import { Bell } from 'lucide-react';
import {
  ViewHeader,
  StatusPill,
  Button,
  EmptyState,
  InlineNotice,
  SkeletonCard,
} from '@/components/fairway';
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
  loadError: string | null;
  recentCount: number;
  onRefresh: () => void;
}

export function AnnouncementsFairway({
  announcements,
  players,
  selectedTeamId,
  isCoach,
  playerId,
  loading,
  loadError,
  recentCount,
  onRefresh,
}: AnnouncementsFairwayProps) {
  const createFlow =
    isCoach && selectedTeamId ? (
      <CreateAnnouncementFlow players={players} teamId={selectedTeamId} onCreated={onRefresh} />
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
      <ViewHeader
        title="Announcements"
        description={isCoach ? 'Share updates with your team' : 'Team news and updates'}
        primaryAction={createFlow}
      />

      {recentCount > 0 && !loading && (
        <div className="mt-6">
          <StatusPill tone="accent" size="sm" dot>
            {recentCount} new this week
          </StatusPill>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : !selectedTeamId ? (
          <EmptyState
            icon={Bell}
            title="No team selected"
            description="Select a team from the sidebar to view announcements."
          />
        ) : loadError ? (
          <InlineNotice
            tone="danger"
            title="Announcements unavailable"
            action={
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                Try again
              </Button>
            }
          >
            {loadError}
          </InlineNotice>
        ) : announcements.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No announcements"
            description={
              isCoach
                ? 'Create announcements to keep your team informed about schedule changes, game updates, and important news.'
                : 'No announcements have been posted yet. Check back later for team updates.'
            }
            action={createFlow}
          />
        ) : isCoach ? (
          <AnnouncementsCoachView announcements={announcements} onDeleted={onRefresh} />
        ) : (
          <AnnouncementsPlayerView announcements={announcements} playerId={playerId} />
        )}
      </div>
    </div>
  );
}

export default AnnouncementsFairway;
