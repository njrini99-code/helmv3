import { NoTeam } from '../../ui/NoTeam';

/**
 * A player on no team: the whole page says so (CH-12305). Classes are saved with
 * the team they go on the calendar of, so there is nothing to add or import
 * until they join one. Joining lives in Settings' Golf profile (CH-8302); a player has no Team section.
 */
export function ClassesNoTeam() {
  return (
    <main className="ch-cl is-noteam" aria-labelledby="ch-cl-title" data-canopy="">
      <header className="ch-cl-h" data-canopy-head="">
        <div>
          <h1 id="ch-cl-title">Classes</h1>
        </div>
      </header>
      <NoTeam code="CH-12305" coach={false} body="Your classes go on your team’s calendar so your coach can plan around them. Join a team, then add your classes." />
    </main>
  );
}
