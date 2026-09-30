import { ChartColumn, Users } from 'lucide-react';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * CH-4310 (D-71): no countable round all season, so the whole page is the v2
 * first-run empty: what fills it and the one next step (the roster, where the
 * coach sees who has posted). Other windows keep CH-4301 and its Show the season.
 */
export function StatsTeamFirstRun() {
  const roster = rebuiltHref('/golf/dashboard/roster', 'coach');
  return (
    <EmptyState
      size="page"
      code="CH-4310"
      icon={ChartColumn}
      title="No stats yet"
      body="Team and player stats fill in as players post rounds this season."
      action={
        roster ? (
          <Button variant="primary" leftIcon={Users} href={roster}>
            View roster
          </Button>
        ) : undefined
      }
    />
  );
}
