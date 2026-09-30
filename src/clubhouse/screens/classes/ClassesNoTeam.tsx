import { Users } from 'lucide-react';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * A player on no team: the whole page says so (CH-12305). Classes are saved with
 * the team they go on the calendar of, so there is nothing to add or import
 * until they join one. Joining lives in Settings, which is rebuilt.
 */
export function ClassesNoTeam() {
  const settings = rebuiltHref('/golf/dashboard/settings?section=team', 'player');
  return (
    <main className="ch-cl" aria-labelledby="ch-cl-title">
      <header className="ch-cl-h">
        <div>
          <h1 id="ch-cl-title">Classes</h1>
        </div>
      </header>
      <EmptyState
        size="page"
        code="CH-12305"
        icon={Users}
        title="You aren't on a team yet"
        body="Your classes go on your team's calendar so your coach can plan around them. Join a team, then add your classes."
        action={
          settings ? (
            <Button variant="primary" href={settings}>
              Open team settings
            </Button>
          ) : undefined
        }
      />
    </main>
  );
}
