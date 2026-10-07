'use client';

/* TEMPORARY agent verification harness. Renders the changed golf components
   with fixture data on an unauthenticated route so Playwright can check them
   at desktop and 375px. Never commit; deleted after verification. */

import * as React from 'react';
import { fairwayScope } from '@/lib/redesign/flag';
import { AvatarToneProvider, Avatar, AvatarGroup } from '@/components/fairway/controls/avatar';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { Segmented } from '@/components/fairway/controls/segmented';
import { FairwayCoachRoster } from '@/components/fairway/pages/roster/FairwayCoachRoster';
import type { RosterPlayer } from '@/components/fairway/pages/roster/FairwayPlayerCard';
import { TeamKpiCell } from '@/components/fairway/pages/dashboard/TeamKpiCell';
import { TodayCalendarPanel } from '@/components/fairway/pages/dashboard/TodayCalendarPanel';
import { NotificationRow } from '@/components/fairway/notifications/NotificationRow';
import { computeSeriesTrend } from '@/components/fairway/charts/seriesTrend';
import { IconChartBar, IconGolf, IconTarget, IconUsers } from '@/components/icons';
import { tintFor } from '@/components/fairway/controls/identity-tint';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

const PLAYERS: RosterPlayer[] = [
  { id: 'p-mason-0001', first_name: 'Mason', last_name: 'Rivers', avatar_url: null, hometown: 'Austin', state: 'TX', graduation_year: 2027, handicap: 2.1, status: 'active', rounds_count: 18, avg_score: 75.3, recent_trend: null, sg_total: -1.2, standing_tier: null, active_focus_areas: 0, active_goals: 1 },
  { id: 'p-owen-0002', first_name: 'Owen', last_name: 'Carter', avatar_url: null, hometown: 'Tulsa', state: 'OK', graduation_year: 2026, handicap: 3.4, status: 'active', rounds_count: 12, avg_score: 76.8, recent_trend: null, sg_total: 0.4, standing_tier: 'Top quartile on team', active_focus_areas: 2, active_goals: 0 },
  { id: 'p-jackson-0003', first_name: 'Jackson', last_name: 'Hale', avatar_url: null, hometown: 'Boise', state: 'ID', graduation_year: 2028, handicap: 1.2, status: 'active', rounds_count: 9, avg_score: 74.9, recent_trend: null, sg_total: 0.05, standing_tier: null, active_focus_areas: 1, active_goals: 2 },
  { id: 'p-dylan-0004', first_name: 'Dylan', last_name: 'Brooks', avatar_url: null, hometown: 'DuBois', state: 'PA', graduation_year: 2026, handicap: 4.0, status: 'active', rounds_count: 0, avg_score: 0, recent_trend: null, sg_total: null, standing_tier: null, active_focus_areas: 0, active_goals: 0 },
];

const now = new Date();
const iso = (days: number, hour: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const NOTES: UnifiedNotificationItem[] = [
  { id: 'n1', source: 'notifications', category: 'messages', title: 'Message from Mason Rivers', body: 'Can we move the range session to 4?', action_url: null, created_at: iso(-1, 9), read_at: null },
  { id: 'n2', source: 'notifications', category: 'events', title: 'Practice moved to 4pm', body: 'Home course range', action_url: null, created_at: iso(-2, 9), read_at: '2026-09-20T00:00:00Z' },
];

function trend(series: number[], goodDirection: 'up' | 'down') {
  const t = computeSeriesTrend(series, { goodDirection });
  return t;
}

export default function AgentHarness() {
  const [range, setRange] = React.useState('all');
  React.useEffect(() => {
    document.documentElement.dataset.helmSport = 'golf';
  }, []);
  const scoring = [76.1, 75.8, 75.9, 75.2, 74.8];
  const gir = [58, 60, 61, 63, 66];
  const putts = [34.1, 33.8, 33.6, 33.2, 33.0];
  const s = trend(scoring, 'down');
  const g = trend(gir, 'up');
  const p = trend(putts, 'down');

  return (
    <div className={fairwayScope('min-h-screen bg-canvas font-fw-sans text-text-primary')}>
      <AvatarToneProvider tone="identity">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6" data-harness="root">
          <section data-harness="identity" className="flex flex-col gap-3 rounded-fw-lg border border-border-subtle bg-surface p-4 shadow-soft">
            <h2 className="font-fw-sans text-h3 font-semibold">Identity</h2>
            <div className="flex flex-wrap items-center gap-4">
              {PLAYERS.map((pl) => (
                <span key={pl.id} className="flex items-center gap-2" data-harness-player={pl.id} data-card-bg={tintFor(pl.id).bg}>
                  <Avatar name={`${pl.first_name} ${pl.last_name}`} identityKey={pl.id} size="lg" />
                  <Avatar name={`${pl.first_name} ${pl.last_name}`} identityKey={pl.id} size="sm" />
                </span>
              ))}
              <AvatarGroup size="xs" max={5} ring="ring-surface" aria-hidden="true">
                {PLAYERS.map((pl) => (
                  <Avatar key={pl.id} decorative size="xs" name={`${pl.first_name} ${pl.last_name}`} identityKey={pl.id} />
                ))}
              </AvatarGroup>
            </div>
            <PlayerIdentity name="Mason Rivers" identityKey="p-mason-0001" size="sm" meta="Trending down · no focus area" />
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5" data-harness="window">
            <span className="text-body-sm text-text-secondary">Window</span>
            <Segmented
              value={range}
              onValueChange={setRange}
              options={[
                { value: '7d', label: '7D' },
                { value: '30d', label: '30D' },
                { value: '90d', label: '90D' },
                { value: 'season', label: 'Season' },
                { value: 'all', label: 'All' },
              ]}
              aria-label="Performance window"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label="Latest notifications" className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft">
              <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-2.5">
                <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Latest</h2>
              </div>
              <ul className="flex flex-col">
                {NOTES.map((n) => (
                  <li key={n.id} className="relative before:pointer-events-none before:absolute before:left-[68px] before:right-0 before:top-0 before:h-px before:bg-border-subtle first:before:hidden">
                    <NotificationRow item={n} onClick={() => undefined} density="compact" />
                  </li>
                ))}
              </ul>
            </section>
            <TodayCalendarPanel
              todayEvents={[
                { id: 'e1', title: 'Team practice — short game', event_type: 'practice', start_time: iso(0, 14), end_time: iso(0, 16), location: 'Home course range', rsvp_yes: 6, rsvp_total: 8 },
              ]}
              upcomingEvents={[
                { id: 'e2', title: 'Qualifier round 1', event_type: 'tournament', start_time: iso(2, 8), end_time: null, location: null },
              ]}
              scheduleError={false}
              timezone="America/Chicago"
            />
          </div>

          <section aria-label="Team performance" className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft">
            <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3">
              <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Team performance</h2>
              <span className="shrink-0 font-fw-sans text-body-sm text-text-secondary">All time</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border-subtle lg:grid-cols-4">
              <TeamKpiCell className="bg-surface" label="Scoring avg" icon={<IconChartBar size={16} />} value={75.5} decimals={1} goodDirection="down" delta={s ? { value: Math.round(s.value * 10) / 10 } : null} series={scoring} seriesLabel="Scoring average" direction={s?.direction} />
              <TeamKpiCell className="bg-surface" label="GIR" icon={<IconTarget size={16} />} value={66} suffix="%" goodDirection="up" delta={g ? { value: Math.round(g.value), suffix: '%' } : null} series={gir} seriesLabel="Greens in regulation" direction={g?.direction} />
              <TeamKpiCell className="bg-surface" label="Putts per round" icon={<IconGolf size={16} />} value={33.0} decimals={1} goodDirection="down" delta={p ? { value: Math.round(p.value * 10) / 10 } : null} series={putts} seriesLabel="Putts per round" direction={p?.direction} />
              <TeamKpiCell className="bg-surface" label="Roster" icon={<IconUsers size={16} />} value={8} footnote="7 with rounds · 1 active qualifier">
                <AvatarGroup size="xs" max={5} ring="ring-surface" aria-hidden="true">
                  {PLAYERS.map((pl) => (
                    <Avatar key={pl.id} decorative size="xs" name={`${pl.first_name} ${pl.last_name}`} identityKey={pl.id} />
                  ))}
                </AvatarGroup>
              </TeamKpiCell>
            </div>
          </section>

        </div>
        {/* Outside the padded harness column: the roster brings its own page gutters. */}
        <div data-harness="roster">
          <FairwayCoachRoster
            players={PLAYERS}
            teamName="Demo University Golf"
            inviteCode={null}
            intents={{}}
            joinRequests={[]}
            focusAreas={[]}
          />
        </div>
      </AvatarToneProvider>
    </div>
  );
}
