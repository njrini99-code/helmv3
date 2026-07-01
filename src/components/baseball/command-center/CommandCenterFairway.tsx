'use client';

/**
 * ============================================================================
 * CommandCenterFairway — Fairway (warm-premium) presentation of the coach
 * Command Center. Phase B leaf migration (flag-gated behind isRedesignEnabled).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Takes the SAME props the legacy `CommandCenterClient`
 * receives (assembled server-side) and re-composes them with Fairway
 * primitives from `@/components/fairway`. No data path, action, read-model, or
 * query is touched here — the heavy AI-brief / risk / contracts panels are
 * REUSED verbatim (rendered inside the new frame per the migration playbook).
 *
 * Roster + Stats are separate Wave-1 surfaces, so this curated overview links
 * out to them rather than embedding the legacy tabs.
 * ========================================================================== */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ViewHeader,
  MetricCard,
  Surface,
  SurfaceHeader,
  SurfaceBody,
  EmptyState,
  StatusPill,
  Button,
  type FwStatusTone,
} from '@/components/fairway';
import { IconUsers, IconCalendar, IconChartBar, IconTrendingUp } from '@/components/icons';
import { Calendar as LucideCalendar } from 'lucide-react';
import type { BaseballRosterPlayer } from '@/lib/types';
import type { RiskFeedItem } from '@/lib/baseball/read-models/command-center';
import type { CoachDailyContractsReadModel } from '@/lib/baseball/read-models/coach-daily-contracts';
import type { ReadModelLoadState } from '@/lib/product-trust/read-model-state';
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

/** Map a calendar event type to a Fairway status tone for the upcoming list. */
function eventTone(type: string): FwStatusTone {
  const t = type.toLowerCase();
  if (t.includes('game')) return 'accent';
  if (t.includes('scrimmage')) return 'info';
  if (t.includes('tournament')) return 'warning';
  return 'neutral';
}

/** Friendly weekday + time label for an ISO timestamp. */
function fmtEventWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
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

  const hasSummary = Boolean(summary);
  const rosterSize = summary?.rosterSize ?? 0;
  const playersWithData = summary?.playersWithData ?? 0;
  const openRisks = summary?.openRisks ?? 0;
  const criticalRisks = summary?.criticalRisks ?? 0;
  const eventsToday = summary?.eventsToday ?? 0;

  // Upcoming events for the week strip: earliest first, capped for calm density.
  const upcoming = useMemo(
    () =>
      [...calendarEvents]
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .slice(0, 6),
    [calendarEvents],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <ViewHeader
        eyebrow={team.name}
        title="Command Center"
        description={coachName ? `Welcome back, ${coachName}.` : undefined}
        primaryAction={
          team.id ? (
            <BaseballInviteButton
              teamId={team.id}
              teamName={team.name}
              existingCode={team.inviteCode}
            />
          ) : undefined
        }
        secondaryActions={
          <Button asChild variant="secondary" size="sm" leftIcon={<IconChartBar size={16} />}>
            <Link href="/baseball/dashboard/stats/upload">Upload stats</Link>
          </Button>
        }
      />

      {/* ── KPI scoreboard ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Program summary">
        <MetricCard
          label="Roster"
          value={rosterSize}
          icon={<IconUsers size={16} />}
          footnote="players"
          empty={!hasSummary}
        />
        <MetricCard
          label="With data"
          value={playersWithData}
          icon={<IconChartBar size={16} />}
          footnote={hasSummary ? `of ${rosterSize}` : undefined}
          empty={!hasSummary}
        />
        <MetricCard
          label="Open risks"
          value={openRisks}
          tone="neutral"
          footnote={criticalRisks > 0 ? `${criticalRisks} critical` : 'none critical'}
          empty={!hasSummary}
        />
        <MetricCard
          label="Today"
          value={eventsToday}
          icon={<IconCalendar size={16} />}
          footnote="events"
          empty={!hasSummary}
        />
      </section>

      {/* ── Brief + risk (reused read-model panels) alongside the week strip ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DailyBriefPanel
            items={riskFeed}
            coachName={coachName}
            error={riskFeedError}
            onOpenPlayer={openPlayer}
          />
          <RiskFeedStrip
            items={riskFeed}
            error={riskFeedError}
            onOpenPlayer={openPlayer}
            maxItems={6}
          />
          {coachDailyContracts?.authorized && (
            <CoachDailyContracts model={coachDailyContracts} onOpenPlayer={openPlayer} />
          )}
        </div>

        <aside className="space-y-6">
          <Surface elevation="border" padding="none">
            <SurfaceHeader
              title="This week"
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/baseball/dashboard/calendar">View calendar</Link>
                </Button>
              }
            />
            <SurfaceBody>
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={LucideCalendar}
                  title="Nothing scheduled"
                  description="Events you add show up here for the week ahead."
                />
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {event.title}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {fmtEventWhen(event.start_time)}
                        </p>
                      </div>
                      <StatusPill tone={eventTone(event.event_type)} size="sm">
                        {event.event_type}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </SurfaceBody>
          </Surface>

          <Surface elevation="border" padding="none">
            <SurfaceHeader title="Jump to" />
            <SurfaceBody>
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
            </SurfaceBody>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
