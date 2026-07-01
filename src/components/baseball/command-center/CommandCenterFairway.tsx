'use client';

/**
 * ============================================================================
 * CommandCenterFairway — the coach Command Center as a magazine COVER, composed
 * from the "Living Annual" kit (spec: docs/baseball/design-system-living-annual.md
 * §6 P0 #3 "The Command Center Cover"; map: docs/baseball/ui-migration-map.md
 * command-center row).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Takes the SAME props the page assembles server-side and
 * re-skins them with the Living-Annual kit — no data path, action, read-model,
 * or query is touched here:
 *
 *   • CoverHero        — this week's next opponent as the dominant cover line;
 *                        its honest STANDING-BY letter when there's no next game.
 *   • KPIContentsStrip — the real KPIs the read model already carries (ROSTER,
 *                        ON THE RECORD, OPEN RISKS, TODAY) as a green-ruled
 *                        table-of-contents. Omitted whole when no summary exists;
 *                        never a fabricated zero card. (No W-L record data exists
 *                        in the baseball read models, so RECORD is omitted.)
 *   • EditorsLetter    — the CoachHelm daily brief's empty & degraded states,
 *                        signed "From the desk of CoachHelm" (kills the yellow
 *                        box). Real AI brief content still renders through the
 *                        reused DailyBriefPanel verbatim.
 *
 * The heavy read-model panels (DailyBriefPanel, RiskFeedStrip, CoachDailyContracts)
 * are REUSED verbatim; roster + stats are separate surfaces this cover links out
 * to rather than embedding.
 * ========================================================================== */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/fairway';
import { IconChartBar, IconUsers, IconCalendar, IconTrendingUp } from '@/components/icons';
import type { BaseballRosterPlayer } from '@/lib/types';
import type { RiskFeedItem } from '@/lib/baseball/read-models/command-center';
import type { CoachDailyContractsReadModel } from '@/lib/baseball/read-models/coach-daily-contracts';
import type { ReadModelLoadState } from '@/lib/product-trust/read-model-state';
import {
  CoverHero,
  KPIContentsStrip,
  EditorsLetter,
  EmptyIssue,
  PaperCard,
  HairlineRule,
  Eyebrow,
  InkBadge,
  type KPIContentsItem,
} from '@/components/baseball/living-annual';
import { BaseballInviteButton } from './BaseballInviteButton';
import { RiskFeedStrip } from './RiskFeedStrip';
import { DailyBriefPanel } from './DailyBriefPanel';
import { CoachDailyContracts } from '@/components/baseball/coach-daily-contract';

// ─── Types (mirror of the legacy CommandCenterClientProps — same shape) ─────────

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
}

export interface CommandCenterFairwayProps {
  team: {
    id: string;
    name: string;
    teamType: string;
    inviteCode: string | null;
  };
  players: BaseballRosterPlayer[];
  coachId: string;
  coachName?: string;
  calendarEvents?: CalendarEvent[];
  riskFeed?: RiskFeedItem[];
  riskFeedError?: string | null;
  coachDailyContracts?: CoachDailyContractsReadModel;
  summary?: {
    openRisks: number;
    criticalRisks: number;
    rosterSize: number;
    playersWithData: number;
    eventsToday: number;
  };
  loadState?: ReadModelLoadState;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Event types that carry an opponent and can headline the cover. */
const OPPONENT_EVENT = /game|scrimmage|tournament/i;

/** Ink for an event-type stamp — games/tournaments read green, the rest quiet. */
function eventInk(type: string): 'team' | 'neutral' {
  return /game|tournament/i.test(type) ? 'team' : 'neutral';
}

/** Friendly weekday + time label for an ISO timestamp (this-week strip). */
function fmtEventWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** Compact cover kicker, e.g. `Sun 4:30 PM`. */
function fmtCoverWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

interface CoverLine {
  opponent: string;
  homeAway: 'home' | 'away';
  dateLabel: string;
}

/**
 * Derive the cover line from the soonest upcoming opponent event. Honest best-
 * effort parse of the coach-authored event title: the opponent is whatever
 * follows a `vs` / `@` / `at` token, and an explicit `@` / `at` / `away` marks an
 * away game. Returns null when there's no upcoming game — CoverHero then renders
 * its STANDING-BY letter rather than a blank cover.
 */
function deriveCover(events: CalendarEvent[]): CoverLine | null {
  const now = Date.now();
  const next = events
    .filter((e) => OPPONENT_EVENT.test(e.event_type) && Date.parse(e.start_time) >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  if (!next) return null;

  const raw = next.title.trim();
  const away = /(^|\s)(@|at|away)(\s|$)/i.test(raw);
  const sep = raw.match(/(?:vs\.?|@|at)\s+(.+)$/i);
  const opponent = sep?.[1]?.trim() || raw.replace(/^(game|scrimmage|tournament)\b[:\s-]*/i, '').trim() || raw;

  return { opponent, homeAway: away ? 'away' : 'home', dateLabel: fmtCoverWhen(next.start_time) };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandCenterFairway({
  team,
  coachName,
  calendarEvents = [],
  riskFeed = [],
  riskFeedError = null,
  coachDailyContracts,
  summary,
}: CommandCenterFairwayProps) {
  const router = useRouter();

  const openPlayer = (playerId: string) =>
    router.push(`/baseball/dashboard/players/${playerId}`);

  // This week's cover story — the next opponent (null → CoverHero standing-by).
  const cover = useMemo(() => deriveCover(calendarEvents), [calendarEvents]);

  // Upcoming events for the week strip: earliest first, capped for calm density.
  const upcoming = useMemo(
    () =>
      [...calendarEvents]
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .slice(0, 6),
    [calendarEvents],
  );

  // The daily brief has real CoachHelm (AI-sourced) content only when the engine
  // has written some — otherwise the slot is the signed STANDING-BY letter.
  const hasAiBrief = useMemo(
    () => riskFeed.some((i) => i.sourceRef.source === 'ai'),
    [riskFeed],
  );

  // Table-of-contents KPIs — real read-model counts only. Omitted entirely when
  // there's no summary (no team yet), never shown as broken zero cards.
  const kpis: KPIContentsItem[] = [];
  if (summary) {
    kpis.push({ label: 'Roster', value: summary.rosterSize });
    kpis.push({
      label: 'On the Record',
      value: summary.playersWithData,
      emphasis: summary.rosterSize > 0 && summary.playersWithData === summary.rosterSize,
    });
    kpis.push({ label: 'Open Risks', value: summary.openRisks });
    kpis.push({ label: 'Today', value: summary.eventsToday });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ── Masthead line + quick actions (the CoverHero is the header) ─────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Eyebrow as="h1" items={[team.name, 'Command Center']} ink="team" />
        <div className="flex items-center gap-2">
          {team.id ? (
            <BaseballInviteButton
              teamId={team.id}
              teamName={team.name}
              existingCode={team.inviteCode}
            />
          ) : null}
          <Button asChild variant="secondary" size="sm" leftIcon={<IconChartBar size={16} />}>
            <Link href="/baseball/dashboard/stats/upload">Upload stats</Link>
          </Button>
        </div>
      </header>

      {/* ── The cover: this week's opponent (or an honest standing-by letter) ─ */}
      <CoverHero
        opponent={cover?.opponent ?? ''}
        dateLabel={cover?.dateLabel}
        homeAway={cover?.homeAway}
      />

      {/* ── Masthead contents strip: the real KPIs on green rules ──────────── */}
      {kpis.length > 0 ? (
        <KPIContentsStrip items={kpis} columns={kpis.length >= 4 ? 4 : kpis.length} />
      ) : null}

      {/* ── Brief + risk (reused read-model panels) alongside the week strip ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {riskFeedError ? (
            <EditorsLetter
              ink="team"
              title="Signals are catching up."
              body={riskFeedError}
              signoff="— From the desk of CoachHelm"
            />
          ) : hasAiBrief ? (
            <DailyBriefPanel
              items={riskFeed}
              coachName={coachName}
              onOpenPlayer={openPlayer}
            />
          ) : (
            <EditorsLetter
              ink="team"
              live
              title="Standing by — awaiting first pitch."
              body="Your morning brief prints here the moment CoachHelm reads recent stats, workload, and trends."
              signoff="— From the desk of CoachHelm"
            />
          )}

          {!riskFeedError ? (
            <RiskFeedStrip items={riskFeed} onOpenPlayer={openPlayer} maxItems={6} />
          ) : null}

          {coachDailyContracts?.authorized ? (
            <CoachDailyContracts model={coachDailyContracts} onOpenPlayer={openPlayer} />
          ) : null}
        </div>

        <aside className="space-y-6">
          {upcoming.length === 0 ? (
            <EmptyIssue variant="calendar" />
          ) : (
            <PaperCard className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <Eyebrow ink="team">This week</Eyebrow>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/baseball/dashboard/calendar">Calendar</Link>
                </Button>
              </div>
              <HairlineRule ink="team" className="mb-4" />
              <ul className="space-y-3.5">
                {upcoming.map((event) => (
                  <li key={event.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-annual text-body-lg text-text-primary">
                        {event.title}
                      </p>
                      <p className="text-eyebrow uppercase tracking-[0.14em] tabular-nums text-text-tertiary">
                        {fmtEventWhen(event.start_time)}
                      </p>
                    </div>
                    <InkBadge label={event.event_type} tone={eventInk(event.event_type)} />
                  </li>
                ))}
              </ul>
            </PaperCard>
          )}

          <PaperCard className="p-5">
            <Eyebrow ink="team" className="mb-4">Jump to</Eyebrow>
            <HairlineRule ink="team" className="mb-4" />
            <div className="flex flex-col gap-2">
              <Button asChild variant="ghost" size="sm" leftIcon={<IconUsers size={16} />}>
                <Link href="/baseball/dashboard/roster">Roster</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" leftIcon={<IconTrendingUp size={16} />}>
                <Link href="/baseball/dashboard/stats">Team stats</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" leftIcon={<IconCalendar size={16} />}>
                <Link href="/baseball/dashboard/calendar">Calendar</Link>
              </Button>
            </div>
          </PaperCard>
        </aside>
      </div>
    </div>
  );
}
