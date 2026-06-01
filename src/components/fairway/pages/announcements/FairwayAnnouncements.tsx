'use client';

/**
 * ============================================================================
 * Fairway · pages/announcements · FairwayAnnouncements  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the SHARED coach+player /golf/dashboard/announcements
 * route — the team's "what's new" feed. A presentation rebuild on the warm-matte
 * Fairway design system; the data is reused VERBATIM. The page fetches the SAME
 * `getAnnouncementsWithMeta` list (+ roster + documents for coaches) above its
 * fork and passes it straight in. NO data fetch / server action / mutation is
 * defined or altered here.
 *
 * ── ROLE FORK ───────────────────────────────────────────────────────────────
 *   • Coach  — a feed of expandable coach cards + the create-announcement Sheet
 *     (the ONE primary action in the masthead). Per-card delete + the full
 *     ack/task/recipient detail.
 *   • Player — the player's filtered feed (unread-first), each card with the
 *     acknowledge action + their own interactive tasks. No create / delete.
 *
 * ── HONESTY ──────────────────────────────────────────────────────────────────
 *   Empty feed → EmptyState (role-aware copy). Missing player profile →
 *   InlineNotice. Counts are real (`recentCount` / `announcements.length`) and
 *   only rendered when > 0 — never a fabricated "0".
 *
 * Tokens ONLY. No glass / backdrop-blur / warm-* legacy classes. fairwayToast
 * for feedback (never legacy useToast). Renders inside the `.fairway-ds` scope.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { ViewHeader, Surface, EmptyState, InlineNotice } from '@/components/fairway';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { FairwayCoachAnnouncementCard } from './FairwayCoachAnnouncementCard';
import {
  FairwayPlayerAnnouncementCard,
  isUnreadForPlayer,
} from './FairwayPlayerAnnouncementCard';
import { FairwayCreateAnnouncement } from './FairwayCreateAnnouncement';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface DocumentLite {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
}

export interface FairwayAnnouncementsProps {
  /** The team's announcements with meta (legacy getAnnouncementsWithMeta verbatim). */
  announcements: GolfAnnouncementMeta[];
  /** Active roster — coach create-flow targeting. */
  players: Player[];
  /** Team documents — coach create-flow attachments. */
  documents: DocumentLite[];
  /** Whether the viewer is a coach (gates create/delete + copy). */
  isCoach: boolean;
  /** The player's id (player view only). Null when missing → honest notice. */
  playerId: string | null;
  /** Count posted within the last 7 days (computed in the route, verbatim). */
  recentCount: number;
}

export function FairwayAnnouncements({
  announcements,
  players,
  documents,
  isCoach,
  playerId,
  recentCount,
}: FairwayAnnouncementsProps) {
  const total = announcements.length;

  // ── Masthead description (mirrors the legacy subtitle logic) ───────────────
  const description =
    total === 0
      ? isCoach
        ? 'Share schedule changes, news, and important updates with your team.'
        : 'The latest from the coaching staff.'
      : recentCount > 0
        ? `${recentCount} this week · ${total} total.`
        : `${total} posted.`;

  // Honest count chips — only when there's something real to show.
  const meta =
    total > 0 ? (
      <>
        {recentCount > 0 && <span className="tabular-nums">{recentCount} this week</span>}
        {recentCount > 0 && <span aria-hidden="true">·</span>}
        <span className="tabular-nums">
          {total} total
        </span>
      </>
    ) : undefined;

  const createCta = isCoach ? (
    <FairwayCreateAnnouncement players={players} documents={documents} />
  ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Announcements"
        title="What's new."
        description={description}
        meta={meta}
        primaryAction={createCta}
      />

      <div className="mt-8">
        {total === 0 ? (
          <Surface elevation="border" padding="lg">
            <EmptyState
              icon={Bell}
              title="No announcements yet"
              description={
                isCoach
                  ? 'Create announcements to keep your team informed about schedule changes, upcoming events, and important updates.'
                  : 'No announcements have been posted yet. Check back later for team updates.'
              }
              action={createCta}
            />
          </Surface>
        ) : isCoach ? (
          <CoachFeed announcements={announcements} />
        ) : !playerId ? (
          <InlineNotice tone="warning" title="Player profile not found">
            We couldn't load your player profile. Complete onboarding or contact support to see your
            team's announcements.
          </InlineNotice>
        ) : (
          <PlayerFeed announcements={announcements} playerId={playerId} />
        )}
      </div>
    </div>
  );
}

/* ─── Coach feed ───────────────────────────────────────────────────────────── */
function CoachFeed({ announcements }: { announcements: GolfAnnouncementMeta[] }) {
  return (
    <div className="flex flex-col gap-3">
      {announcements.map((ann) => (
        <FairwayCoachAnnouncementCard key={ann.id} announcement={ann} />
      ))}
    </div>
  );
}

/* ─── Player feed (unread-first, mirrors the legacy sort) ──────────────────── */
function PlayerFeed({
  announcements,
  playerId,
}: {
  announcements: GolfAnnouncementMeta[];
  playerId: string;
}) {
  // Defer time-dependent sort/state to the client (avoid hydration mismatch).
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => setNowTs(Date.now()), []);

  const sorted = [...announcements].sort((a, b) => {
    const aUnread = isUnreadForPlayer(a, nowTs);
    const bUnread = isUnreadForPlayer(b, nowTs);
    if (aUnread && !bUnread) return -1;
    if (!aUnread && bUnread) return 1;
    return 0; // preserve server order (already date-sorted)
  });

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((ann) => (
        <FairwayPlayerAnnouncementCard
          key={ann.id}
          announcement={ann}
          playerId={playerId}
          nowTs={nowTs}
        />
      ))}
    </div>
  );
}

export default FairwayAnnouncements;
