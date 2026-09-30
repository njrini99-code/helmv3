'use client';

import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * CH-6309 (D-71): the team has never scheduled anything, so the whole page is
 * the v2 first-run empty, with Create event as its one action (the editor).
 * Once anything exists, an empty range keeps CH-6301 in the grid.
 */
export function CalendarFirstRun({ onNew }: { onNew: () => void }) {
  return (
    <main className="ch-cal ch-cal--first">
      <EmptyState
        size="page"
        code="CH-6309"
        icon={CalendarDays}
        title="Nothing on the calendar"
        body="Add practices, qualifiers and trips. Players see them on their calendar and can reply."
        action={
          <Button variant="primary" leftIcon={Plus} onClick={onNew}>
            Create event
          </Button>
        }
      />
    </main>
  );
}
