'use client';

/**
 * ============================================================================
 * CoachIntelligenceHome — coach `/dashboard/intelligence`
 * ----------------------------------------------------------------------------
 * The composition root the page mounts. Runs the empty-roster /
 * overview-failure gate (an overview FAILURE renders an honest retry notice;
 * a genuinely empty roster keeps the onboarding gate, and the two must never
 * be conflated), then hands everything else to `TriageDesk`, which owns the
 * Home · The Lab · Chat toggle.
 *
 * This file builds the pieces `TriageDesk` shows but does not own: the Home
 * greeting, the overview-failure notice under it, and the Chat tab's
 * embedded Ask surface.
 * ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import type { UIMessage } from 'ai';
import type { PulseItem, ProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import type { ChatConversation } from '@/lib/coachhelm/v3/chat/types';
import { Surface, EmptyState, Button, InlineNotice } from '@/components/fairway';
import type { TeamIntelligenceResult } from '@/lib/golf/team-intelligence/types';
import type { PlayersGridViewProps } from '@/components/fairway';
import type { TeamOverviewResult, TeamCategoryInsightsResult } from '@/app/golf/actions/team-category-insights';
import type { SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { TriageDesk } from '@/components/golf/coachhelm/triage/TriageDesk';
import { AskSurface } from '@/components/golf/coachhelm/chat/AskSurface';
import type { ComposerPlayer } from '@/components/golf/coachhelm/chat/PromptComposer';
import { CommandOpening } from './CommandOpening';

/** Everything the Chat tab's Ask surface renders, resolved server-side. */
export interface CoachChatTabData {
  teamName: string;
  players: ComposerPlayer[];
  suggestions: string[];
  pulseItems: PulseItem[];
  coverage: string | null;
  /** Preformatted server-side: a client-formatted time mismatches on hydration. */
  asOfLabel: string | null;
  conversations: ChatConversation[];
  conversationId: string | null;
  initialMessages: UIMessage[];
}

/**
 * What the page puts above and below the Chat tab's surface, beyond the
 * shell's own `--fw-shell-offset`: the page's top padding (1.5rem), the
 * toggle row (44px thumbs + 4px track padding each side + 1px border each
 * side = 54px), the gap under it (1.5rem), the page's bottom padding
 * (1.5rem), and the chat card's 1px border top and bottom.
 */
const CHAT_EMBED_OFFSET = 'calc(4.5rem + 54px + 2px)';

const CHAT_TAB_HREF = '/golf/dashboard/intelligence?view=chat';

export interface CoachIntelligenceHomeProps {
  overview: TeamOverviewResult;
  /** Category insights: Home reads the engine's strokes-available figures. */
  categoryInsights: TeamCategoryInsightsResult;
  /** Home's Team intelligence payload. */
  teamIntelligence: TeamIntelligenceResult;
  coachId: string;

  /** The frozen `getSignalGroups` contract's full payload. */
  groups: SignalGroup[];
  scannedAt: string | null;
  groupsError: string | null;

  /** The deep-link-only `players` view, mounted unchanged. */
  playersDrillProps: PlayersGridViewProps;

  /**
   * The Home greeting. Null when the chat context could not be resolved: the
   * rest of the page still renders, because none of it depends on CoachHelm
   * chat being reachable.
   */
  command: {
    teamName: string;
    coachFirstName: string | null;
    players: { id: string; name: string }[];
    pulse: ProgramPulse;
  } | null;

  /** The Chat tab. Null when the chat context could not be resolved; the tab
   *  then says so instead of offering a composer that cannot answer. */
  chat?: CoachChatTabData | null;
}

export function CoachIntelligenceHome({
  overview,
  categoryInsights,
  teamIntelligence,
  coachId,
  groups,
  scannedAt,
  groupsError,
  playersDrillProps,
  command,
  chat = null,
}: CoachIntelligenceHomeProps) {
  const router = useRouter();

  // getTeamOverview can fail transiently (P017, team-category-insights.ts):
  // that is a DISTINCT state from a genuinely empty roster (which the action
  // reports as success:true, playerCount:0). Falling back to `playerCount:0`
  // here would misreport an established team as "no active players yet" on a
  // Supabase hiccup, so an overview failure uses the separately fetched roster.
  const overviewFailed = !overview.success;
  const overviewError = overview.success ? null : overview.error;
  const rosterPlayerCount = playersDrillProps.players.length;
  const ov = overview.success ? overview.data : undefined;
  const playerCount = ov?.playerCount ?? (overviewFailed ? rosterPlayerCount : 0);

  if (!overviewFailed && playerCount === 0) {
    return (
      <Surface padding="lg">
        <EmptyState
          title="No active players yet"
          description="Invite players and log rounds. CoachHelm names what to work on as the stats cache builds."
          action={
            <Button asChild variant="primary">
              <Link href="/golf/dashboard/roster">Open Roster</Link>
            </Button>
          }
        />
      </Surface>
    );
  }

  // The greeting carries Home's h1; without it Home still needs one.
  const homeLead = command ? (
    <CommandOpening teamName={command.teamName} coachFirstName={command.coachFirstName} pulse={command.pulse} />
  ) : (
    <h1 className="sr-only">CoachHelm</h1>
  );

  const homeNotice = overviewFailed ? (
    <InlineNotice
      tone="danger"
      title="Couldn't load team intelligence"
      action={
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
          onClick={() => router.refresh()}
        >
          Try again
        </Button>
      }
    >
      {overviewError ??
        'The team overview did not load, so the shot analysis below is missing. Everything else on this page is unaffected.'}
    </InlineNotice>
  ) : null;

  const chatPanel = chat ? (
    <div className="overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft">
      <AskSurface
        teamName={chat.teamName}
        players={chat.players}
        suggestions={chat.suggestions}
        pulseItems={chat.pulseItems}
        coverage={chat.coverage}
        asOfLabel={chat.asOfLabel}
        conversations={chat.conversations}
        conversationId={chat.conversationId}
        initialMessages={chat.initialMessages}
        embed={{
          offset: CHAT_EMBED_OFFSET,
          newHref: CHAT_TAB_HREF,
          conversationHref: (id) => `${CHAT_TAB_HREF}&c=${encodeURIComponent(id)}`,
        }}
      />
    </div>
  ) : null;

  return (
    <TriageDesk
      coachId={coachId}
      groups={groups}
      scannedAt={scannedAt}
      groupsError={groupsError}
      categoryInsights={categoryInsights}
      teamIntelligence={teamIntelligence}
      playersDrillProps={playersDrillProps}
      homeLead={homeLead}
      homeNotice={homeNotice}
      chatPanel={chatPanel}
    />
  );
}
