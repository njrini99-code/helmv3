import 'server-only';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { createClient } from '@/lib/supabase/server';
import { pickGolfDashboardRole, type GolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { chLogServer } from '../lib/track-server';

const SURFACE = 'auth';
const AREA = 'golf_auth';

export type PlayerOnboardLoad =
  | { kind: 'signedOut' }
  /** A read about who this account is failed: the page says so with Try again, never the blank form (GAP-S-04). */
  | { kind: 'failed' }
  | { kind: 'coach' }
  | { kind: 'onboarded' }
  | {
      kind: 'ready';
      seed: { first: string; last: string; grad: number | null; hcp: number | null; city: string; state: string; photoUrl: string | null; email: string; accountMade: true; intent: 'code'; kind: 'roster' };
    };

/**
 * Who lands on /golf/player, read the way the dashboard layout reads it: signed out goes to sign in, an account the
 * dashboard treats as a coach never becomes a player here, and someone already onboarded goes to the dashboard.
 * Everything else starts the player's remaining questions, prefilled with what the account already holds.
 *
 * A read that fails is `failed` (GAP-S-04): it is not evidence that this is a new player, so a coach or an onboarded
 * player whose read blipped is never handed the blank player form. The role is the layout's own rule
 * (`pickGolfDashboardRole`, users.role deciding when both profiles exist and neither is finished), so an account with an
 * unfinished coach row and an unfinished player row is not bounced between here and the dashboard (GAP-R-04).
 */
export async function loadPlayerOnboard(): Promise<PlayerOnboardLoad> {
  const supabase = await createClient();
  const { user } = await getUserResilient(supabase);
  if (!user) return { kind: 'signedOut' };

  const [coach, player] = await Promise.all([
    supabase.from('golf_coaches').select('id, onboarding_completed').eq('user_id', user.id).maybeSingle(),
    supabase.from('golf_players').select('first_name, last_name, graduation_year, handicap, handicap_index, hometown, state, avatar_url, onboarding_completed').eq('user_id', user.id).maybeSingle(),
  ]);
  if (coach.error) chLogServer(SURFACE, 'onboard.coach', coach.error, AREA);
  if (player.error) chLogServer(SURFACE, 'onboard.player', player.error, AREA);
  if (coach.error || player.error) return { kind: 'failed' };
  const p = player.data;

  // The layout's slow path: with both profiles and neither finished, the declared role (users.role) decides.
  let declared: GolfDashboardRole | null | undefined;
  if (coach.data && p && !coach.data.onboarding_completed && !p.onboarding_completed) {
    const role = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (role.error) {
      chLogServer(SURFACE, 'onboard.role', role.error, AREA);
      return { kind: 'failed' };
    }
    const r = (role.data as { role?: string } | null)?.role;
    declared = r === 'coach' || r === 'player' ? r : null;
  }
  if (coach.data && pickGolfDashboardRole({ coach: coach.data, player: p }, declared) === 'coach') return { kind: 'coach' };
  if (p?.onboarding_completed) return { kind: 'onboarded' };

  const meta = (user.user_metadata ?? {}) as { first_name?: string; last_name?: string };
  const hcp = (p?.handicap ?? p?.handicap_index ?? null) as number | null;
  return {
    kind: 'ready',
    seed: {
      first: (p?.first_name as string | null) || meta.first_name || '',
      last: (p?.last_name as string | null) || meta.last_name || '',
      grad: (p?.graduation_year as number | null) ?? null,
      hcp: typeof hcp === 'number' && Number.isFinite(hcp) ? hcp : null,
      city: ((p?.hometown as string | null) ?? '').slice(0, 40),
      state: ((p?.state as string | null) ?? '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(),
      photoUrl: (p?.avatar_url as string | null) ?? null,
      email: user.email ?? '',
      accountMade: true,
      intent: 'code',
      kind: 'roster',
    },
  };
}
