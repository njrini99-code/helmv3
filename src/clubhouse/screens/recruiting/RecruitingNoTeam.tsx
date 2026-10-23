import { NoTeam } from '../../ui/NoTeam';
import '../../styles/recruiting.css';

/**
 * A coach signed in with no team the page can resolve (CH-14306): the whole page says so, with the way out the
 * current page gives (Team Settings). Not `.ch-rec`: that class holds the page's layout, and this page has none.
 */
export function RecruitingNoTeam() {
  return (
    <main className="ch-rec-none">
      <NoTeam code="CH-14306" coach body="Recruiting is your team’s list of prospects. Create or join a team, then add the golfers you’re following." />
    </main>
  );
}
