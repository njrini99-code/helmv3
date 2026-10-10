import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/States';

/**
 * The page's framed head over a whole-page empty (states audit c4): on desktop the first-run and no-team pages open
 * under the same head as every other page, not on a bare canvas, and the head carries no action of its own (the
 * empty's one action is the page's). The phone's bar carries the title, so the head is not drawn there (calendar.css).
 */
export function CalendarPageHead({ brief }: { brief?: string }) {
  return (
    <header className="ch-cal-mast" data-canopy-head="">
      <div className="ch-cal-mast__l">
        <h1 id="ch-cal-page-title">Calendar</h1>
        {brief && <p>{brief}</p>}
      </div>
    </header>
  );
}

/** Signed in, but on no team yet: the whole page says so (CH-6307). */
export function CalendarNoTeam({ coach }: { coach: boolean }) {
  return (
    <main className="ch-cal ch-cal--page" aria-labelledby="ch-cal-page-title" data-canopy="">
      <CalendarPageHead />
      <EmptyState
        size="page"
        code="CH-6307"
        icon={Users}
        title="You aren’t on a team yet"
        body={coach ? 'The calendar fills in once your team is set up.' : 'Team events show here once a coach adds you to a team roster.'}
      />
    </main>
  );
}
