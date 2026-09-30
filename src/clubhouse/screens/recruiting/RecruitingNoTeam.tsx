import { Users } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import '../../styles/recruiting.css';

/**
 * A coach signed in with no team the page can resolve (CH-14306): the whole page says so, with the way out the
 * current page gives (Team Settings). Not `.ch-rec`: that class holds the page's layout, and this page has none.
 */
export function RecruitingNoTeam() {
  return (
    <main className="ch-rec-none">
      <EmptyState
        size="page"
        code="CH-14306"
        icon={Users}
        title="You aren't on a team yet"
        body="Recruiting is your team's list of prospects. Create or join a team, then add the golfers you're following."
        action={
          <Button variant="primary" href="/golf/dashboard/settings?section=team">
            Open team settings
          </Button>
        }
      />
    </main>
  );
}
