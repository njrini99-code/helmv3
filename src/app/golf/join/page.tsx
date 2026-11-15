import { JoinCode } from '@/clubhouse/screens/auth/JoinCode';

// /golf/join in Clubhouse: a team code, and nothing else; the same code goes to the same route (/golf/join/[code]).
export default function JoinTeamPage() {
  return <JoinCode />;
}
