import { NoTeam } from '../../ui/NoTeam';
import '../../styles/roster.css';

/**
 * Signed in with no active team: the whole page says so (CH-3306 for a coach, CH-3308 for a player).
 * Not `.ch-rs`: under 820px that class stays hidden until the phone view takes over, and this page has none.
 */
export function RosterNoTeam({ viewer = 'coach' }: { viewer?: 'coach' | 'player' }) {
  return (
    // The canopy's material, as on Roster itself (P003 #1); the title is the page's h1.
    <main className="ch-rs-none" data-canopy="">
      <h1 className="ch-sr-only">Roster</h1>
      {viewer === 'player' ? (
        <NoTeam code="CH-3308" coach={false} body="Your teammates appear here once your coach approves your request to join." />
      ) : (
        <NoTeam code="CH-3306" coach body="Your players appear here once your team is set up." />
      )}
    </main>
  );
}
