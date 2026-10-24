'use client';

import { ChartColumn, UserPlus, Users } from 'lucide-react';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * CH-4310 (D-71): no countable round all season, so the whole page is the v2
 * first-run empty: what fills it and the one next step (the roster, where the
 * coach sees who has posted). Other windows keep CH-4301 and its Show the season.
 * `invite`: nobody is on the roster yet, so the step is Invite players (Roster's
 * invite sheet), as on Home. A plain boolean: the server StatsTeam passes it, and
 * the icon is chosen here, on the client side of the boundary.
 */
export function StatsTeamFirstRun({ invite = false }: { invite?: boolean }) {
  const roster = rebuiltHref(invite ? '/golf/dashboard/roster?invite=1' : '/golf/dashboard/roster', 'coach');
  return (
    <EmptyState
      size="page"
      code="CH-4310"
      icon={ChartColumn}
      title="No stats yet"
      body="Team and player stats fill in as players post rounds this season."
      action={
        roster ? (
          <Button variant="primary" leftIcon={invite ? UserPlus : Users} href={roster}>
            {invite ? 'Invite players' : 'View roster'}
          </Button>
        ) : undefined
      }
    />
  );
}
