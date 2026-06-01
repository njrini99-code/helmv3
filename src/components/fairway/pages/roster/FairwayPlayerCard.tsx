'use client';

/** Fairway · Roster · FairwayPlayerCard (C9) — coach roster player card. */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayPlayerStatusBadge } from './FairwayPlayerStatusBadge';
import { FairwayIntentControl } from './FairwayIntentControl';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';
import { isUserOnline } from './roster-helpers';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';

export interface RosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  status: string | null;
  last_seen?: string | null;
  rounds_count?: number;
  avg_score?: number;
}

export interface FairwayPlayerCardProps {
  player: RosterPlayer;
  intent: CoachPlayerIntent | null;
}

export function FairwayPlayerCard({ player, intent }: FairwayPlayerCardProps) {
  const router = useRouter();
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const online = isUserOnline(player.last_seen);
  const tint = tintFor(player.id);
  const hasScore = player.avg_score && player.avg_score > 0;

  return (
    <Surface elevation="shadow" padding="none" className="overflow-hidden">
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar + online dot */}
          <div className="relative flex-shrink-0">
            <span
              className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-2xl font-fw-display text-h3 font-semibold ring-1 ring-border-subtle md:h-[76px] md:w-[76px]"
              style={player.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase() || '—'
              )}
            </span>
            <span
              className={cn(
                'absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-surface',
                online ? 'bg-accent-500' : 'bg-border-strong',
              )}
              title={online ? 'Online' : 'Offline'}
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-fw-display text-body-lg font-semibold tracking-[-0.01em] text-text-primary">
                {name}
              </h3>
              <FairwayYearBadge year={player.graduation_year} />
            </div>
            {player.hometown && player.state ? (
              <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
                {player.hometown}, {player.state}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <FairwayPlayerStatusBadge playerId={player.id} currentStatus={player.status} size="sm" />
              <FairwayIntentControl
                playerId={player.id}
                playerName={name}
                current={intent}
                size="sm"
                onSaved={() => router.refresh()}
              />
            </div>
          </div>

          <div className="flex-shrink-0">
            <FairwayPlayerActionsMenu playerId={player.id} playerName={name} currentStatus={player.status} />
          </div>
        </div>
      </div>

      {/* Anchor stat */}
      <div className="px-5 pb-4 md:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-fw-md bg-surface-sunken px-5 py-4">
          <p className="font-fw-sans text-caption font-medium uppercase tracking-wide text-text-tertiary">Avg score</p>
          <p
            className={cn(
              'font-fw-mono text-h1 font-light leading-none tracking-[-0.025em] tabular-nums',
              hasScore ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            {hasScore ? (player.avg_score ?? 0).toFixed(1) : '—'}
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-5 md:px-6 md:pb-6">
        <Button asChild variant="primary" size="md" className="w-full" leftIcon={<Users className="h-4 w-4" />}>
          <Link href={`/golf/dashboard/roster/${player.id}`}>View player</Link>
        </Button>
      </div>
    </Surface>
  );
}

export default FairwayPlayerCard;
