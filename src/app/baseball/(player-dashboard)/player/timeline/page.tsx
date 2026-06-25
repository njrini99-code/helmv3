// =============================================================================
// src/app/baseball/(player-dashboard)/player/timeline/page.tsx
//
// Player "My Timeline" — the player-facing development story, server component.
//
// THE GAP THIS CLOSES: the getPlayerTimeline read model + ProfileTimeline both
// carry a careful viewerRole==='player' branch (sees 'team' + their OWN
// 'player_only' coach notes, NEVER 'staff_only'), but until now NO player-
// dashboard route rendered it — the only player "timeline" was the recruiting
// Journey page, a different domain (schools/interest) that never touches
// baseball_player_timeline_events. The player half of the source -> signal ->
// action -> timeline -> outcome loop had no surface. This page is that surface.
//
// SELF-ONLY: the player is resolved from the server-validated active context
// (getActiveBaseballContext re-validates the team-context cookie against real
// membership rows). The player id is NEVER taken from the URL — it is always
// "me" (context.activePlayerId). getPlayerTimeline ALSO resolves + enforces the
// viewer role server-side from the session, and RLS backs every query, so this
// page cannot widen access even if the context resolved wrong.
//
// HONESTY: the read model never throws — it returns an honest `error` string and
// empty events on failure, which ProfileTimeline renders as an error banner.
// A user who somehow reaches this route as staff-only (no player membership on
// the active team) gets the honest empty state, not a fabricated timeline.
// =============================================================================

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getPlayerTimeline,
  getTimelineAcksForViewer,
  type PlayerTimelineReadModel,
} from '@/lib/baseball/read-models/timeline';
import { PlayerTimelineClient } from '@/components/baseball/player-today/PlayerTimelineClient';
import { EmptyState } from '@/components/ui/empty-state';
import { IconArrowLeft, IconList } from '@/components/icons';

export const metadata = {
  title: 'My Timeline · BaseballHelm',
};

export default async function PlayerTimelinePage() {
  // 1. Server-validated active context (cookie re-validated against memberships).
  const context = await getActiveBaseballContext();
  if (!context) {
    redirect('/baseball/player');
  }

  // 2. Resolve the player's own membership on the active team. The context only
  //    carries a playerId when the active ROLE is 'player' (a coach viewing a
  //    team they staff has activePlayerId === null). We never accept a player id
  //    from the URL — this surface is strictly "my own story". When the active
  //    context isn't a player membership we render an honest, non-fabricated
  //    state rather than 500-ing or guessing someone else's timeline.
  const ownPlayerId = context.activeRole === 'player' ? context.activePlayerId : null;

  // 3. Read the viewer-filtered timeline + the caller's ack map. getPlayerTimeline
  //    independently re-resolves the viewer server-side (it does not trust the id
  //    we pass to grant access — it only scopes the query), so this is defense in
  //    depth on top of the context resolution above. Acks are self-scoped.
  let model: PlayerTimelineReadModel | null = null;
  let initialAcks: Record<string, boolean> = {};
  if (ownPlayerId) {
    try {
      model = await getPlayerTimeline(context.activeTeamId, ownPlayerId, { limit: 80 });
      if (model.events.length > 0) {
        initialAcks = await getTimelineAcksForViewer(model.events.map((e) => e.id));
      }
    } catch {
      // Defensive: getPlayerTimeline already swallows its own errors. If a future
      // change lets one escape, degrade to an honest error banner instead of a 500.
      model = {
        playerId: ownPlayerId,
        viewerRole: 'player',
        events: [],
        hiddenCount: 0,
        error: 'Your timeline could not be loaded right now.',
      };
      initialAcks = {};
    }
  }

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back to Today */}
        <Link
          href="/baseball/player/today"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-warm-500 transition-colors hover:text-warm-700"
        >
          <IconArrowLeft size={16} />
          Back to Today
        </Link>

        <header className="mb-8">
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
            My Timeline
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
            Your development story
          </h1>
          <p className="mt-1 text-warm-500">
            Every stat, practice, lift, note, and insight — in order, with where it came from.
            Acknowledge a coach note to let your staff know you&rsquo;ve seen it.
          </p>
        </header>

        {ownPlayerId && model ? (
          <PlayerTimelineClient model={model} initialAcks={initialAcks} />
        ) : (
          // Honest non-player state: the active context isn't a player membership
          // on this team (e.g. a staff-only account, or a stale-fell-back context).
          // We do NOT fabricate or fetch someone else's timeline.
          <EmptyState
            variant="card"
            icon={<IconList size={28} />}
            title="No player timeline here"
            description="Your timeline appears when you're on a roster as a player. Join or switch to a team where you play to see your development story."
          />
        )}
      </div>
    </div>
  );
}
